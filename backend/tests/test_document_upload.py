import io
import pytest
from app.models.document import IngestionStatus
from tests.conftest import create_test_user, auth_header

@pytest.mark.asyncio
async def test_upload_markdown_document_and_list(client, db_session):
    """Test streaming upload of a Markdown file, background parsing, and document listing."""
    user = await create_test_user(db_session, "uploader@docagent.com")
    headers = auth_header(user)

    md_content = b"# Architecture Overview\n\nThis is a test documentation file for RAG.\n"
    files = {"file": ("architecture.md", io.BytesIO(md_content), "text/markdown")}

    # 1. Upload
    response = await client.post("/api/documents/upload", headers=headers, files=files)
    assert response.status_code == 202
    data = response.json()
    assert data["is_duplicate"] is False
    assert data["document"]["filename"] == "architecture.md"
    assert data["document"]["file_type"] == "md"
    doc_id = data["document"]["id"]

    # 2. List documents
    list_resp = await client.get("/api/documents", headers=headers)
    assert list_resp.status_code == 200
    docs = list_resp.json()
    assert len(docs) == 1
    assert docs[0]["id"] == doc_id

    # 3. Retrieve single document
    get_resp = await client.get(f"/api/documents/{doc_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["filename"] == "architecture.md"

    # 4. Retrieve document chunks
    chunks_resp = await client.get(f"/api/documents/{doc_id}/chunks", headers=headers)
    assert chunks_resp.status_code == 200
    chunks = chunks_resp.json()
    assert len(chunks) >= 1
    assert chunks[0]["document_id"] == doc_id
    assert "Architecture Overview" in chunks[0]["content"]
    assert chunks[0]["chunk_metadata"]["active_heading"] == "Architecture Overview"

    # 5. Check queue status
    queue_resp = await client.get("/api/documents/queue", headers=headers)
    assert queue_resp.status_code == 200
    queue_data = queue_resp.json()
    assert "active_count" in queue_data
    assert "active_tasks" in queue_data
    assert "recent_completed" in queue_data
    assert len(queue_data["recent_completed"]) >= 1
    assert queue_data["recent_completed"][0]["id"] == doc_id
    assert queue_data["recent_completed"][0]["status"] == "ready"
    assert queue_data["recent_completed"][0]["elapsed_seconds"] >= 0.0

    # 6. Upload identical file (deduplication check)
    files_dup = {"file": ("architecture.md", io.BytesIO(md_content), "text/markdown")}
    dup_resp = await client.post("/api/documents/upload", headers=headers, files=files_dup)
    assert dup_resp.status_code == 202
    dup_data = dup_resp.json()
    assert dup_data["is_duplicate"] is True
    assert dup_data["document"]["id"] == doc_id

    # 7. Delete document
    del_resp = await client.delete(f"/api/documents/{doc_id}", headers=headers)
    assert del_resp.status_code == 204

    # Verify document is gone
    get_gone = await client.get(f"/api/documents/{doc_id}", headers=headers)
    assert get_gone.status_code == 404

@pytest.mark.asyncio
async def test_upload_unsupported_file_rejected(client, db_session):
    """Test that unsupported file extensions are rejected with 400 Bad Request."""
    user = await create_test_user(db_session, "tester@docagent.com")
    headers = auth_header(user)

    files = {"file": ("malicious.exe", io.BytesIO(b"fake executable binary"), "application/octet-stream")}
    response = await client.post("/api/documents/upload", headers=headers, files=files)
    assert response.status_code == 400
    assert "Unsupported file format" in response.json()["detail"]
