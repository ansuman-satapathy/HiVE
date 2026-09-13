import uuid
import pytest
from app.services.embedding_service import EmbeddingFactory, LocalFeatureEmbeddingProvider
from app.services.vector_store_service import VectorStoreService


@pytest.fixture(autouse=True)
def reset_vector_store():
    """Clear vector store collection before and after each test."""
    store = VectorStoreService.get_instance()
    store.clear()
    yield
    store.clear()


def test_embedding_factory_and_local_provider():
    """Verify local fallback provider generates 384-dimensional normalized vectors."""
    provider = EmbeddingFactory.get_provider(force_local=True)
    assert isinstance(provider, LocalFeatureEmbeddingProvider)
    assert provider.dimension == 384

    texts = [
        "How do I reset my password?",
        "PostgreSQL deadlocks and transaction retry strategy",
    ]
    embeddings = provider.embed_documents(texts)
    assert len(embeddings) == 2
    assert len(embeddings[0]) == 384
    assert len(embeddings[1]) == 384

    # Verify query embedding generates valid normalized vector
    query_emb = provider.embed_query("password reset")
    assert len(query_emb) == 384

    # Check approximate unit length (L2 norm ~ 1.0)
    norm = sum(x * x for x in query_emb) ** 0.5
    assert abs(norm - 1.0) < 1e-4


def test_vector_store_dense_search():
    """Verify vector store indexes chunks and returns ranked semantic results."""
    store = VectorStoreService.get_instance()
    doc_id = uuid.uuid4()

    chunks = [
        {
            "id": uuid.uuid4(),
            "document_id": doc_id,
            "chunk_index": 0,
            "content": "To reset your forgotten password, click the forgot password link on the login page.",
            "chunk_metadata": {"section": "Authentication"},
        },
        {
            "id": uuid.uuid4(),
            "document_id": doc_id,
            "chunk_index": 1,
            "content": "Billing information and subscription invoices are generated monthly.",
            "chunk_metadata": {"section": "Billing"},
        },
        {
            "id": uuid.uuid4(),
            "document_id": doc_id,
            "chunk_index": 2,
            "content": "Database deadlocks occur when two concurrent transactions hold conflicting locks.",
            "chunk_metadata": {"section": "Database"},
        },
    ]

    added = store.add_chunks(chunks)
    assert added == 3

    # Query for password recovery
    results = store.search_dense(query="account password recovery", top_k=2)
    assert len(results) > 0
    # Top result should be the password chunk
    assert results[0]["chunk_index"] == 0
    assert "password" in results[0]["content"].lower()
    assert results[0]["score"] > 0.0


def test_vector_store_document_id_filter():
    """Verify document_id filter restricts dense search to chunks belonging to that document."""
    store = VectorStoreService.get_instance()
    doc1 = uuid.uuid4()
    doc2 = uuid.uuid4()

    store.add_chunks([
        {
            "id": uuid.uuid4(),
            "document_id": doc1,
            "chunk_index": 0,
            "content": "Customer support phone lines are open from 9 AM to 5 PM EST.",
            "chunk_metadata": {},
        },
        {
            "id": uuid.uuid4(),
            "document_id": doc2,
            "chunk_index": 0,
            "content": "Customer support phone lines are available 24/7 for Enterprise tier.",
            "chunk_metadata": {},
        },
    ])

    # Search without filter -> matches both
    all_results = store.search_dense(query="customer support phone hours", top_k=5)
    assert len(all_results) == 2

    # Search with doc1 filter
    filtered_results = store.search_dense(query="customer support phone hours", top_k=5, document_id=doc1)
    assert len(filtered_results) == 1
    assert filtered_results[0]["document_id"] == str(doc1)


def test_vector_store_delete_document_chunks():
    """Verify deleting a document removes all its chunk vectors."""
    store = VectorStoreService.get_instance()
    doc_id = uuid.uuid4()

    store.add_chunks([
        {
            "id": uuid.uuid4(),
            "document_id": doc_id,
            "chunk_index": 0,
            "content": "Temporary test data for deletion verification.",
            "chunk_metadata": {},
        }
    ])

    results_before = store.search_dense(query="Temporary test data", top_k=5)
    assert len(results_before) == 1

    deleted_count = store.delete_document_chunks(doc_id)
    assert deleted_count == 1

    results_after = store.search_dense(query="Temporary test data", top_k=5)
    assert len(results_after) == 0


@pytest.mark.asyncio
async def test_search_dense_endpoint(client, db_session):
    """Verify GET /api/documents/search/dense returns matching chunks through the API."""
    from tests.conftest import create_test_user, auth_header

    user = await create_test_user(db_session, "dense_search_user@test.com")
    headers = auth_header(user)

    store = VectorStoreService.get_instance()
    doc_id = uuid.uuid4()
    chunk_id = uuid.uuid4()

    store.add_chunks([
        {
            "id": chunk_id,
            "document_id": doc_id,
            "chunk_index": 0,
            "content": "Kubernetes pod OOMKilled errors indicate memory limits exceeded.",
            "chunk_metadata": {"section": "Kubernetes"},
        }
    ])

    response = await client.get("/api/documents/search/dense?q=memory+limits+exceeded&top_k=3", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["chunk_id"] == str(chunk_id)
    assert data[0]["document_id"] == str(doc_id)
    assert data[0]["score"] > 0.0
    assert "Kubernetes" in data[0]["content"]
