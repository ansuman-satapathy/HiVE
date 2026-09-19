import uuid
import pytest
from httpx import AsyncClient
from app.services.context_expansion_service import ContextExpansionService
from app.db.repositories.document_repo import DocumentRepository
from tests.conftest import create_test_user, auth_header


def test_clean_merge_texts_with_boundary_overlap():
    """Verify that overlapping boundary text between consecutive chunks is deduplicated."""
    chunk_1 = "QuickDesk is a high-performance customer support platform. It supports automated ticket routing"
    chunk_2 = "automated ticket routing and semantic search over uploaded manuals and runbooks."
    
    merged = ContextExpansionService.clean_merge_texts([chunk_1, chunk_2])
    
    # Overlapping text "automated ticket routing" should only appear once
    assert merged.count("automated ticket routing") == 1
    assert "QuickDesk is a high-performance" in merged
    assert "uploaded manuals and runbooks." in merged


def test_clean_merge_texts_without_overlap():
    """Verify that distinct chunks are concatenated cleanly with appropriate punctuation spacing."""
    chunk_1 = "Section 1: Setup guide."
    chunk_2 = "Section 2: Configuration details."
    
    merged = ContextExpansionService.clean_merge_texts([chunk_1, chunk_2])
    assert "Section 1: Setup guide." in merged
    assert "Section 2: Configuration details." in merged


@pytest.mark.asyncio
async def test_expand_chunk_context_window(db_session, client: AsyncClient):
    """
    Test expanding context on a sequential series of chunks:
    Chunk 0, Chunk 1 (anchor), Chunk 2, Chunk 3.
    window_size=1 should fetch Chunk 0, 1, 2.
    """
    user = await create_test_user(db_session, "expander@quickdesk.com")
    
    doc = await DocumentRepository.create_document(
        db=db_session,
        user_id=user.id,
        filename="system_architecture.md",
        file_type="md",
        file_size_bytes=2048,
        sha256_hash="arch_hash_" + str(uuid.uuid4())[:8],
        doc_metadata={"title": "System Architecture"}
    )
    
    chunks_data = [
        {
            "chunk_index": 0,
            "content": "Chapter 1: Overview. The platform uses FastAPI and PostgreSQL for core storage.",
            "token_count": 14,
            "chunk_metadata": {"section": "Overview"}
        },
        {
            "chunk_index": 1,
            "content": "for core storage. Chapter 2: Ingestion Pipeline. Documents are parsed and chunked semantically.",
            "token_count": 16,
            "chunk_metadata": {"section": "Ingestion Pipeline"}
        },
        {
            "chunk_index": 2,
            "content": "chunked semantically. Chapter 3: Hybrid Retrieval. BM25 and ChromaDB vector search are fused with RRF.",
            "token_count": 18,
            "chunk_metadata": {"section": "Hybrid Retrieval"}
        },
        {
            "chunk_index": 3,
            "content": "fused with RRF. Chapter 4: Reranker. Cross-Encoder reranks top candidates before prompt generation.",
            "token_count": 16,
            "chunk_metadata": {"section": "Reranker"}
        }
    ]
    created_chunks = await DocumentRepository.add_chunks(db_session, doc.id, chunks_data)
    assert len(created_chunks) == 4
    
    anchor = created_chunks[1]  # Chunk index 1
    
    # Expand window_size=1 directly through service
    expanded = await ContextExpansionService.expand_chunk_context(
        db=db_session,
        chunk_id=anchor.id,
        window_size=1,
        user_id=user.id
    )
    
    assert expanded.anchor_chunk_id == anchor.id
    assert expanded.document_id == doc.id
    assert expanded.document_filename == "system_architecture.md"
    assert expanded.included_chunk_indices == [0, 1, 2]
    assert len(expanded.included_chunk_ids) == 3
    
    # Overlapping boundary text should be deduplicated
    assert expanded.expanded_text.count("for core storage") == 1
    assert expanded.expanded_text.count("chunked semantically") == 1
    
    # Breadcrumbs collected
    assert "Overview" in expanded.section_breadcrumbs
    assert "Ingestion Pipeline" in expanded.section_breadcrumbs
    assert "Hybrid Retrieval" in expanded.section_breadcrumbs


@pytest.mark.asyncio
async def test_expand_chunk_context_boundary_clamping(db_session):
    """
    Verify boundary conditions:
    1. Expanding Chunk 0 with window_size=2 clamps to lower bound 0 (returns 0, 1, 2).
    2. Expanding Chunk 3 with window_size=2 clamps to upper bound (returns 1, 2, 3).
    """
    user = await create_test_user(db_session, "boundary@quickdesk.com")
    doc = await DocumentRepository.create_document(
        db=db_session,
        user_id=user.id,
        filename="runbook.txt",
        file_type="txt",
        file_size_bytes=1024,
        sha256_hash="runbook_hash_" + str(uuid.uuid4())[:8],
    )
    
    chunks_data = [
        {"chunk_index": 0, "content": "Step 1: Restart gateway.", "token_count": 5, "chunk_metadata": {}},
        {"chunk_index": 1, "content": "Step 2: Check health status.", "token_count": 6, "chunk_metadata": {}},
        {"chunk_index": 2, "content": "Step 3: Inspect service logs.", "token_count": 6, "chunk_metadata": {}},
        {"chunk_index": 3, "content": "Step 4: Notify ops channel.", "token_count": 6, "chunk_metadata": {}},
    ]
    created = await DocumentRepository.add_chunks(db_session, doc.id, chunks_data)
    
    # Anchor = First chunk (0)
    exp_first = await ContextExpansionService.expand_chunk_context(
        db=db_session,
        chunk_id=created[0].id,
        window_size=2,
        user_id=user.id
    )
    assert exp_first.included_chunk_indices == [0, 1, 2]
    
    # Anchor = Last chunk (3)
    exp_last = await ContextExpansionService.expand_chunk_context(
        db=db_session,
        chunk_id=created[3].id,
        window_size=2,
        user_id=user.id
    )
    assert exp_last.included_chunk_indices == [1, 2, 3]


@pytest.mark.asyncio
async def test_expand_chunk_token_budget_cap(db_session):
    """Verify that max_tokens budget constrains expansion while prioritizing the anchor chunk."""
    user = await create_test_user(db_session, "budget@quickdesk.com")
    doc = await DocumentRepository.create_document(
        db=db_session,
        user_id=user.id,
        filename="budget_doc.txt",
        file_type="txt",
        file_size_bytes=1024,
        sha256_hash="budget_hash_" + str(uuid.uuid4())[:8],
    )
    
    chunks_data = [
        {"chunk_index": 0, "content": "Large prefix chunk with many tokens.", "token_count": 50, "chunk_metadata": {}},
        {"chunk_index": 1, "content": "Target anchor chunk.", "token_count": 20, "chunk_metadata": {}},
        {"chunk_index": 2, "content": "Large suffix chunk with many tokens.", "token_count": 50, "chunk_metadata": {}},
    ]
    created = await DocumentRepository.add_chunks(db_session, doc.id, chunks_data)
    
    # Budget of 30 allows anchor (20) but neither neighbor (+50 each exceeds 30)
    exp = await ContextExpansionService.expand_chunk_context(
        db=db_session,
        chunk_id=created[1].id,
        window_size=1,
        max_tokens=30,
        user_id=user.id
    )
    assert exp.included_chunk_indices == [1]


@pytest.mark.asyncio
async def test_expand_chunk_context_api_endpoint(db_session, client: AsyncClient):
    """Verify the POST /api/documents/chunks/{chunk_id}/expand HTTP endpoint."""
    user = await create_test_user(db_session, "api_expander@quickdesk.com")
    headers = auth_header(user)
    
    doc = await DocumentRepository.create_document(
        db=db_session,
        user_id=user.id,
        filename="api_test.md",
        file_type="md",
        file_size_bytes=512,
        sha256_hash="api_test_hash_" + str(uuid.uuid4())[:8],
    )
    
    chunks_data = [
        {"chunk_index": 0, "content": "Part A of the documentation.", "token_count": 6, "chunk_metadata": {"section": "Part A"}},
        {"chunk_index": 1, "content": "Part B of the documentation.", "token_count": 6, "chunk_metadata": {"section": "Part B"}},
    ]
    created = await DocumentRepository.add_chunks(db_session, doc.id, chunks_data)
    
    target_id = created[0].id
    response = await client.post(
        f"/api/documents/chunks/{target_id}/expand?window_size=1",
        headers=headers
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["anchor_chunk_id"] == str(target_id)
    assert data["document_filename"] == "api_test.md"
    assert data["included_chunk_indices"] == [0, 1]
    assert "Part A of the documentation." in data["expanded_text"]
    assert "Part B of the documentation." in data["expanded_text"]
    assert "Part A" in data["section_breadcrumbs"]
