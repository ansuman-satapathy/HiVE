import uuid
import pytest
from app.models.document import Document, DocumentChunk, IngestionStatus
from app.db.repositories.document_repo import DocumentRepository
from tests.conftest import create_test_user

@pytest.mark.asyncio
async def test_document_lifecycle(db_session):
    """Test full document lifecycle: create, update status, add chunks, query, delete."""
    user = await create_test_user(db_session, "docuser@docagent.com")

    # 1. Create document
    doc = await DocumentRepository.create_document(
        db=db_session,
        user_id=user.id,
        filename="system_architecture.md",
        file_type="md",
        file_size_bytes=1024,
        sha256_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        doc_metadata={"author": "Team"}
    )
    assert doc.id is not None
    assert doc.status == IngestionStatus.PENDING
    assert doc.filename == "system_architecture.md"

    # 2. Query by hash
    existing = await DocumentRepository.get_by_hash(
        db=db_session,
        user_id=user.id,
        sha256_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    )
    assert existing is not None
    assert existing.id == doc.id

    # 3. Add chunks
    chunks_data = [
        {
            "chunk_index": 0,
            "content": "Introduction to the Document Intelligence System",
            "token_count": 8,
            "chunk_metadata": {"section": "# Intro"}
        },
        {
            "chunk_index": 1,
            "content": "Hybrid Retrieval combining Dense and Sparse BM25",
            "token_count": 9,
            "chunk_metadata": {"section": "## Retrieval"}
        }
    ]
    chunks = await DocumentRepository.add_chunks(db_session, doc.id, chunks_data)
    assert len(chunks) == 2

    # 4. Update status to READY
    updated_doc = await DocumentRepository.update_status(
        db=db_session,
        document_id=doc.id,
        status=IngestionStatus.READY,
        chunk_count=2,
        token_count=17
    )
    assert updated_doc.status == IngestionStatus.READY
    assert updated_doc.chunk_count == 2
    assert updated_doc.token_count == 17

    # 5. Fetch sorted chunks
    retrieved_chunks = await DocumentRepository.get_chunks_for_document(db_session, doc.id)
    assert len(retrieved_chunks) == 2
    assert retrieved_chunks[0].chunk_index == 0
    assert retrieved_chunks[1].chunk_index == 1

    # 6. Delete document (cascades to chunks)
    deleted = await DocumentRepository.delete_document(db_session, doc.id)
    assert deleted is True

    # Verify document and chunks are gone
    assert await DocumentRepository.get_by_id(db_session, doc.id) is None
    chunks_after_delete = await DocumentRepository.get_chunks_for_document(db_session, doc.id)
    assert len(chunks_after_delete) == 0
