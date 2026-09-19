import uuid
import pytest
from httpx import AsyncClient
from app.db.repositories.document_repo import DocumentRepository
from app.services.bm25_service import BM25IndexService
from app.services.vector_store_service import VectorStoreService
from tests.conftest import create_test_user, auth_header


@pytest.fixture(autouse=True)
def clean_stores():
    bm25 = BM25IndexService.get_instance()
    vstore = VectorStoreService.get_instance()
    bm25.clear()
    vstore.clear()
    yield
    bm25.clear()
    vstore.clear()


@pytest.mark.asyncio
async def test_retrieval_debug_pipeline_endpoint(db_session, client: AsyncClient):
    """
    Test POST /api/retrieval/debug:
    Validates that Sparse, Dense, Hybrid RRF, Cross-Encoder Rerank,
    and Context Expansion stages return structured data and latency metrics.
    """
    user = await create_test_user(db_session, "debugger@quickdesk.com")
    headers = auth_header(user)

    # 1. Create document and chunks
    doc = await DocumentRepository.create_document(
        db=db_session,
        user_id=user.id,
        filename="network_troubleshooting.md",
        file_type="md",
        file_size_bytes=4096,
        sha256_hash="net_hash_" + str(uuid.uuid4())[:8],
        doc_metadata={"title": "Network Troubleshooting"}
    )

    chunks_data = [
        {
            "chunk_index": 0,
            "content": "Diagnosing DNS resolution failures and network gateway timeouts.",
            "token_count": 10,
            "chunk_metadata": {"section": "DNS Diagnostics"}
        },
        {
            "chunk_index": 1,
            "content": "Verify nameserver records in resolv.conf and check UDP port 53 traffic.",
            "token_count": 12,
            "chunk_metadata": {"section": "Resolv Check"}
        },
        {
            "chunk_index": 2,
            "content": "Check iptables firewall rules blocking inbound or outbound TCP packets.",
            "token_count": 11,
            "chunk_metadata": {"section": "Firewall Rules"}
        }
    ]
    created = await DocumentRepository.add_chunks(db_session, doc.id, chunks_data)

    # 2. Index in BM25 & ChromaDB
    bm25 = BM25IndexService.get_instance()
    vstore = VectorStoreService.get_instance()

    bm25.index_chunks([
        {
            "id": c.id,
            "document_id": c.document_id,
            "chunk_index": c.chunk_index,
            "content": c.content,
            "token_count": c.token_count,
            "chunk_metadata": c.chunk_metadata,
        }
        for c in created
    ])

    vstore.add_chunks([
        {
            "id": c.id,
            "document_id": c.document_id,
            "chunk_index": c.chunk_index,
            "content": c.content,
            "token_count": c.token_count,
            "chunk_metadata": c.chunk_metadata,
        }
        for c in created
    ])

    # 3. Call debug endpoint
    payload = {
        "query": "DNS resolution failure port 53",
        "top_k": 5,
        "rrf_k": 60,
        "expand_top_k": 1,
        "window_size": 1
    }

    response = await client.post("/api/retrieval/debug", json=payload, headers=headers)
    assert response.status_code == 200

    data = response.json()
    assert data["query"] == "DNS resolution failure port 53"
    assert data["total_latency_ms"] >= 0

    # Validate Sparse Stage
    assert "sparse_stage" in data
    assert data["sparse_stage"]["count"] > 0
    assert data["sparse_stage"]["latency_ms"] >= 0
    assert "bm25_score" in data["sparse_stage"]["results"][0]

    # Validate Dense Stage
    assert "dense_stage" in data
    assert data["dense_stage"]["count"] > 0
    assert data["dense_stage"]["latency_ms"] >= 0
    assert "score" in data["dense_stage"]["results"][0]

    # Validate Hybrid Stage
    assert "hybrid_stage" in data
    assert data["hybrid_stage"]["count"] > 0
    assert data["hybrid_stage"]["rrf_k"] == 60
    assert "rrf_score" in data["hybrid_stage"]["results"][0]

    # Validate Rerank Stage
    assert "rerank_stage" in data
    assert data["rerank_stage"]["count"] > 0
    assert "rerank_score" in data["rerank_stage"]["results"][0]
    assert "rank_delta" in data["rerank_stage"]["results"][0]

    # Validate Context Expansion
    assert len(data["expansion_previews"]) == 1
    expansion = data["expansion_previews"][0]
    assert expansion["document_filename"] == "network_troubleshooting.md"
    assert len(expansion["included_chunk_indices"]) >= 1
    assert len(expansion["expanded_text"]) > 0
