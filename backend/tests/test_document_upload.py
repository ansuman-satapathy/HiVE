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

    # 2. List documents (paginated)
    list_resp = await client.get("/api/documents", headers=headers)
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["total"] == 1
    assert list_data["page"] == 1
    docs = list_data["items"]
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

    # 7. Sparse lexical search via API
    search_resp = await client.get("/api/documents/search/sparse?q=Architecture&top_k=3", headers=headers)
    assert search_resp.status_code == 200
    search_results = search_resp.json()
    assert len(search_results) >= 1
    assert search_results[0]["document_id"] == doc_id
    assert "Architecture Overview" in search_results[0]["content"]
    assert search_results[0]["bm25_score"] > 0

    # 8. Delete document
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


@pytest.mark.asyncio
async def test_batch_upload_multiple_formats_and_limits(client, db_session):
    """Verify batch upload endpoint accepts up to 10 files (markdown, csv, txt) and enforces limits."""
    user = await create_test_user(db_session, "batch_user@docagent.com")
    headers = auth_header(user)

    # 1. Batch upload valid mixed formats
    files = [
        ("files", ("guide.md", io.BytesIO(b"# User Guide\n\nWelcome to HiVE platform.\n"), "text/markdown")),
        ("files", ("data.csv", io.BytesIO(b"id,name,role\n1,Alice,Admin\n2,Bob,User\n"), "text/csv")),
        ("files", ("notes.txt", io.BytesIO(b"Plain text notes about system architecture.\n"), "text/plain")),
    ]

    response = await client.post("/api/documents/upload-batch", headers=headers, files=files)
    assert response.status_code == 202
    data = response.json()
    assert data["total_uploaded"] == 3
    assert data["successful_count"] == 3
    assert data["failed_count"] == 0
    assert len(data["documents"]) == 3

    # 2. Upload duplicate files: one with same content, one with duplicate name
    dup_files = [
        ("files", ("guide_copy.md", io.BytesIO(b"# User Guide\n\nWelcome to HiVE platform.\n"), "text/markdown")),
        ("files", ("guide.md", io.BytesIO(b"Different content under existing name"), "text/markdown")),
    ]
    dup_response = await client.post("/api/documents/upload-batch", headers=headers, files=dup_files)
    assert dup_response.status_code == 202
    dup_data = dup_response.json()
    assert dup_data["duplicate_count"] == 2
    assert dup_data["successful_count"] == 0
    assert len(dup_data["details"]) == 2
    assert any(d["duplicate_type"] == "content" for d in dup_data["details"])
    assert any(d["duplicate_type"] == "name" for d in dup_data["details"])

    # 3. Exactly 10 files batch upload (maximum boundary allowed)
    exactly_10_files = [
        ("files", (f"boundary_doc_{i}.txt", io.BytesIO(f"Boundary content {i}".encode("utf-8")), "text/plain"))
        for i in range(10)
    ]
    ten_response = await client.post("/api/documents/upload-batch", headers=headers, files=exactly_10_files)
    assert ten_response.status_code == 202
    ten_data = ten_response.json()
    assert ten_data["total_uploaded"] == 10
    assert ten_data["successful_count"] == 10
    assert ten_data["failed_count"] == 0
    assert len(ten_data["documents"]) == 10

    # 4. Exceeding 10 files batch limit (> 10, e.g. 11 files) should return 400
    too_many_files = [
        ("files", (f"file_{i}.txt", io.BytesIO(b"Sample text"), "text/plain"))
        for i in range(11)
    ]
    exceed_response = await client.post("/api/documents/upload-batch", headers=headers, files=too_many_files)
    assert exceed_response.status_code == 400
    assert "Maximum 10 files" in exceed_response.json()["detail"]

    # 5. Empty files batch should be rejected
    empty_response = await client.post("/api/documents/upload-batch", headers=headers, files=[])
    assert empty_response.status_code in (400, 422)


@pytest.mark.asyncio
async def test_batch_delete_and_search_filter(client, db_session):
    """Test searching, format filtering, and batch deleting multiple documents."""
    user = await create_test_user(db_session, "batchdelete@docagent.com")
    headers = auth_header(user)

    # 1. Upload 3 distinct documents
    files = [
        ("files", ("alpha_manual.pdf", io.BytesIO(b"%PDF-1.4 Alpha Manual Test Content"), "application/pdf")),
        ("files", ("beta_guide.md", io.BytesIO(b"# Beta Guide\nDetailed operations."), "text/markdown")),
        ("files", ("gamma_data.csv", io.BytesIO(b"id,col\n1,val"), "text/csv")),
    ]
    up_res = await client.post("/api/documents/upload-batch", headers=headers, files=files)
    assert up_res.status_code == 202
    up_data = up_res.json()
    doc_ids = [d["id"] for d in up_data["documents"]]
    assert len(doc_ids) == 3

    # 2. Search filter by filename
    search_res = await client.get("/api/documents?q=alpha", headers=headers)
    assert search_res.status_code == 200
    search_data = search_res.json()
    assert search_data["total"] == 1
    assert search_data["items"][0]["filename"] == "alpha_manual.pdf"

    # 3. Filter by file_type
    filter_res = await client.get("/api/documents?file_type=md", headers=headers)
    assert filter_res.status_code == 200
    filter_data = filter_res.json()
    assert filter_data["total"] == 1
    assert filter_data["items"][0]["filename"] == "beta_guide.md"

    # 4. Batch delete two documents
    del_res = await client.post("/api/documents/batch-delete", headers=headers, json={"document_ids": doc_ids[:2]})
    assert del_res.status_code == 200
    del_data = del_res.json()
    assert del_data["deleted_count"] == 2

    # 5. Verify remaining document
    after_res = await client.get("/api/documents", headers=headers)
    assert after_res.status_code == 200
    after_data = after_res.json()
    assert after_data["total"] == 1
    assert after_data["items"][0]["id"] == doc_ids[2]
