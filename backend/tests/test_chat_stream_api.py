import json
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
async def test_chat_stream_endpoint_sse_protocol(db_session, client: AsyncClient):
    """
    Test POST /api/chat/stream:
    Validates that:
    1. Response is text/event-stream with no-cache headers.
    2. Emits sequence of SSE events: status -> context -> status -> token -> done.
    3. Grounding citations are provided with document titles.
    4. Tokens stream the synthesized answer.
    """
    user = await create_test_user(db_session, "chat_tester@quickdesk.com")
    headers = auth_header(user)

    # 1. Create document and chunks
    doc = await DocumentRepository.create_document(
        db=db_session,
        user_id=user.id,
        filename="server_setup_guide.md",
        file_type="md",
        file_size_bytes=2048,
        sha256_hash="hash_" + str(uuid.uuid4())[:8],
        doc_metadata={"title": "Server Setup"}
    )

    chunks_data = [
        {
            "chunk_index": 0,
            "content": "To configure nginx reverse proxy, edit /etc/nginx/sites-available/default and set proxy_pass to port 8000.",
            "token_count": 16,
            "chunk_metadata": {"section": "Nginx Setup"}
        },
        {
            "chunk_index": 1,
            "content": "Ensure firewall allows TCP port 80 and 443 with ufw allow 'Nginx Full'.",
            "token_count": 14,
            "chunk_metadata": {"section": "Firewall"}
        }
    ]
    created_chunks = await DocumentRepository.add_chunks(db_session, doc.id, chunks_data)

    # Index into BM25 and VectorStore
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
        for c in created_chunks
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
        for c in created_chunks
    ])

    # 2. Execute streaming request
    payload = {
        "query": "How do I configure the nginx reverse proxy?",
        "top_k": 3,
        "window_size": 1,
        "temperature": 0.1,
    }

    res = await client.post("/api/chat/stream", json=payload, headers=headers)
    assert res.status_code == 200
    assert "text/event-stream" in res.headers["content-type"]
    assert res.headers.get("cache-control") == "no-cache"

    body_text = res.text
    assert "event: status" in body_text
    assert "event: context" in body_text
    assert "event: token" in body_text
    assert "event: done" in body_text

    # Parse events
    events = []
    for block in body_text.strip().split("\n\n"):
        lines = block.strip().split("\n")
        ev_name = None
        ev_data = None
        for line in lines:
            if line.startswith("event:"):
                ev_name = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                ev_data = json.loads(line.split(":", 1)[1].strip())
        if ev_name and ev_data:
            events.append((ev_name, ev_data))

    event_types = [e[0] for e in events]
    assert "status" in event_types
    assert "context" in event_types
    assert "token" in event_types
    assert "done" in event_types

    # Verify context citations
    context_event = next(e[1] for e in events if e[0] == "context")
    citations = context_event.get("citations", [])
    assert len(citations) > 0
    assert citations[0]["document_title"] == "server_setup_guide.md"
    assert "nginx" in citations[0]["content"].lower()

    # Verify tokens yielded text
    tokens = [e[1]["delta"] for e in events if e[0] == "token"]
    full_text = "".join(tokens)
    assert len(full_text) > 0
    assert "nginx" in full_text.lower() or "proxy" in full_text.lower()


@pytest.mark.asyncio
async def test_chat_stream_scoped_document_filter(db_session, client: AsyncClient):
    """
    Test that scoping document_ids restricts citations strictly to selected document.
    """
    user = await create_test_user(db_session, "filter_tester@quickdesk.com")
    headers = auth_header(user)

    # Doc 1: Python guide
    doc_python = await DocumentRepository.create_document(
        db=db_session,
        user_id=user.id,
        filename="python_guide.md",
        file_type="md",
        file_size_bytes=1024,
        sha256_hash="hash_py_" + str(uuid.uuid4())[:8],
        doc_metadata={"title": "Python Guide"}
    )
    chunks_py = await DocumentRepository.add_chunks(db_session, doc_python.id, [
        {"chunk_index": 0, "content": "Asyncio event loops manage cooperative multitasking in Python.", "token_count": 10, "chunk_metadata": {}}
    ])

    # Doc 2: Rust guide
    doc_rust = await DocumentRepository.create_document(
        db=db_session,
        user_id=user.id,
        filename="rust_guide.md",
        file_type="md",
        file_size_bytes=1024,
        sha256_hash="hash_rs_" + str(uuid.uuid4())[:8],
        doc_metadata={"title": "Rust Guide"}
    )
    chunks_rust = await DocumentRepository.add_chunks(db_session, doc_rust.id, [
        {"chunk_index": 0, "content": "Tokio runtime is an asynchronous event-driven platform for Rust.", "token_count": 10, "chunk_metadata": {}}
    ])

    bm25 = BM25IndexService.get_instance()
    vstore = VectorStoreService.get_instance()
    all_chunks = chunks_py + chunks_rust
    bm25.index_chunks([
        {"id": c.id, "document_id": c.document_id, "chunk_index": c.chunk_index, "content": c.content, "token_count": c.token_count, "chunk_metadata": {}}
        for c in all_chunks
    ])
    vstore.add_chunks([
        {"id": c.id, "document_id": c.document_id, "chunk_index": c.chunk_index, "content": c.content, "token_count": c.token_count, "chunk_metadata": {}}
        for c in all_chunks
    ])

    # Scope strictly to doc_python
    payload = {
        "query": "asynchronous event loops and multitasking",
        "document_ids": [str(doc_python.id)],
        "top_k": 3,
    }

    res = await client.post("/api/chat/stream", json=payload, headers=headers)
    assert res.status_code == 200

    # Parse context event
    context_data = None
    for block in res.text.strip().split("\n\n"):
        if "event: context" in block:
            for line in block.split("\n"):
                if line.startswith("data:"):
                    context_data = json.loads(line.split(":", 1)[1].strip())
                    break

    assert context_data is not None
    citations = context_data.get("citations", [])
    assert len(citations) == 1
    assert citations[0]["document_id"] == str(doc_python.id)
    assert citations[0]["document_title"] == "python_guide.md"
