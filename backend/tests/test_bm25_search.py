import uuid
import pytest
from app.services.bm25_service import BM25IndexService

@pytest.fixture(autouse=True)
def reset_bm25():
    """Clear BM25 index between tests."""
    service = BM25IndexService.get_instance()
    service.clear()
    yield
    service.clear()


def test_bm25_tokenization():
    """Verify tokenizer preserves error codes, method names, and SKUs."""
    service = BM25IndexService.get_instance()
    text = "Fatal ERR_AUTH_401 in function verify_user_credentials() with SKU: XK-902-A!"
    tokens = service.tokenize(text)
    
    assert "err_auth_401" in tokens
    assert "verify_user_credentials" in tokens
    assert "xk-902-a" in tokens
    assert "fatal" in tokens


def test_bm25_exact_keyword_recall():
    """Verify exact keyword query retrieves the exact matching chunk with highest BM25 score."""
    service = BM25IndexService.get_instance()
    doc_id = uuid.uuid4()

    chunks = [
        {
            "id": uuid.uuid4(),
            "document_id": doc_id,
            "chunk_index": 0,
            "content": "Our refund policy applies to standard consumer hardware within 30 days.",
            "chunk_metadata": {"section": "Refunds"}
        },
        {
            "id": uuid.uuid4(),
            "document_id": doc_id,
            "chunk_index": 1,
            "content": "Critical exception ERR_DATABASE_DEADLOCK: Connection pool exhausted during concurrent transaction.",
            "chunk_metadata": {"section": "Troubleshooting"}
        },
        {
            "id": uuid.uuid4(),
            "document_id": doc_id,
            "chunk_index": 2,
            "content": "To configure database parameters, update postgresql.conf with max_connections = 200.",
            "chunk_metadata": {"section": "Database Setup"}
        }
    ]

    service.index_chunks(chunks)

    results = service.search_sparse("ERR_DATABASE_DEADLOCK", top_k=3)
    assert len(results) > 0
    assert results[0]["chunk_index"] == 1
    assert "ERR_DATABASE_DEADLOCK" in results[0]["content"]
    assert results[0]["bm25_score"] > 0.0


def test_bm25_filtering_by_document_id():
    """Verify document_id filter isolates results to the designated document."""
    service = BM25IndexService.get_instance()
    doc1 = uuid.uuid4()
    doc2 = uuid.uuid4()

    service.index_chunks([
        {
            "id": uuid.uuid4(),
            "document_id": doc1,
            "chunk_index": 0,
            "content": "Secret token in doc 1: ALPHA_KEY_999",
            "chunk_metadata": {}
        },
        {
            "id": uuid.uuid4(),
            "document_id": doc2,
            "chunk_index": 0,
            "content": "Secret token in doc 2: ALPHA_KEY_999",
            "chunk_metadata": {}
        }
    ])

    results_all = service.search_sparse("ALPHA_KEY_999", top_k=5)
    assert len(results_all) == 2

    results_doc2 = service.search_sparse("ALPHA_KEY_999", top_k=5, document_id=doc2)
    assert len(results_doc2) == 1
    assert results_doc2[0]["document_id"] == str(doc2)


def test_bm25_remove_document_chunks():
    """Verify removing a document purges its chunks from subsequent search."""
    service = BM25IndexService.get_instance()
    doc_id = uuid.uuid4()

    service.index_chunks([
        {
            "id": uuid.uuid4(),
            "document_id": doc_id,
            "chunk_index": 0,
            "content": "Temporary chunk containing SPECIFIC_KEYWORD_XYZ",
            "chunk_metadata": {}
        }
    ])

    assert len(service.search_sparse("SPECIFIC_KEYWORD_XYZ")) == 1

    service.remove_document_chunks(doc_id)
    assert len(service.search_sparse("SPECIFIC_KEYWORD_XYZ")) == 0
    assert len(service.chunk_records) == 0
