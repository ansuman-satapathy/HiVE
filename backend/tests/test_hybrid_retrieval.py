import uuid
import pytest
from app.services.hybrid_retriever import HybridRetriever, RRF_K_DEFAULT
from app.services.vector_store_service import VectorStoreService
from app.services.bm25_service import BM25IndexService
from tests.conftest import create_test_user, auth_header


@pytest.fixture(autouse=True)
def reset_retrieval_stores():
    """Clear BM25 index and ChromaDB collection before and after each test."""
    bm25 = BM25IndexService.get_instance()
    vstore = VectorStoreService.get_instance()
    bm25.clear()
    vstore.clear()
    yield
    bm25.clear()
    vstore.clear()


def test_reciprocal_rank_fusion_math_and_boost():
    """
    Verify RRF mathematical formula:
    RRF(d) = sum_{m in M} 1 / (k + rank_m(d))
    
    Items matching in both systems receive higher scores than items matching in only one.
    """
    chunk_a = str(uuid.uuid4())
    chunk_b = str(uuid.uuid4())
    chunk_c = str(uuid.uuid4())
    doc_id = str(uuid.uuid4())

    # Dense ranks: chunk_a (rank 1), chunk_b (rank 2)
    dense_results = [
        {"chunk_id": chunk_a, "document_id": doc_id, "chunk_index": 0, "content": "Dense top hit", "token_count": 10, "score": 0.95},
        {"chunk_id": chunk_b, "document_id": doc_id, "chunk_index": 1, "content": "Dense second hit", "token_count": 12, "score": 0.85},
    ]

    # Sparse ranks: chunk_c (rank 1), chunk_a (rank 2)
    sparse_results = [
        {"chunk_id": chunk_c, "document_id": doc_id, "chunk_index": 2, "content": "BM25 top hit", "token_count": 8, "bm25_score": 4.5},
        {"chunk_id": chunk_a, "document_id": doc_id, "chunk_index": 0, "content": "Dense top hit", "token_count": 10, "bm25_score": 3.2},
    ]

    k = 60
    fused = HybridRetriever.reciprocal_rank_fusion(dense_results, sparse_results, k=k)

    # Chunk A is rank 1 in dense and rank 2 in sparse:
    # RRF(A) = 1/(60+1) + 1/(60+2) = 1/61 + 1/62 = 0.0163934 + 0.0161290 = 0.032522
    expected_score_a = round(1.0 / 61.0 + 1.0 / 62.0, 6)

    # Chunk C is rank 1 in sparse only:
    # RRF(C) = 1/(60+1) = 0.016393
    expected_score_c = round(1.0 / 61.0, 6)

    # Chunk B is rank 2 in dense only:
    # RRF(B) = 1/(60+2) = 0.016129
    expected_score_b = round(1.0 / 62.0, 6)

    assert len(fused) == 3
    # Top item must be chunk_a because it received a dual-system boost
    assert fused[0]["chunk_id"] == chunk_a
    assert abs(fused[0]["rrf_score"] - expected_score_a) < 1e-5
    assert fused[0]["dense_rank"] == 1
    assert fused[0]["sparse_rank"] == 2
    assert fused[0]["dense_score"] == 0.95
    assert fused[0]["bm25_score"] == 3.2

    # Second item must be chunk_c (rank 1 sparse beats rank 2 dense)
    assert fused[1]["chunk_id"] == chunk_c
    assert abs(fused[1]["rrf_score"] - expected_score_c) < 1e-5
    assert fused[1]["dense_rank"] is None
    assert fused[1]["sparse_rank"] == 1

    # Third item must be chunk_b
    assert fused[2]["chunk_id"] == chunk_b
    assert abs(fused[2]["rrf_score"] - expected_score_b) < 1e-5
    assert fused[2]["dense_rank"] == 2
    assert fused[2]["sparse_rank"] is None


@pytest.mark.asyncio
async def test_hybrid_retrieval_service():
    """
    Verify HybridRetriever service executes parallel retrieval
    and successfully surfaces both exact keyword codes and conceptual text.
    """
    bm25 = BM25IndexService.get_instance()
    vstore = VectorStoreService.get_instance()
    retriever = HybridRetriever.get_instance()

    doc_id = uuid.uuid4()
    sku_chunk_id = uuid.uuid4()
    concept_chunk_id = uuid.uuid4()

    # 1. Exact SKU/Error Code chunk (lexical strong)
    sku_chunk = {
        "id": sku_chunk_id,
        "document_id": doc_id,
        "chunk_index": 0,
        "content": "Special diagnostic code ERR_SYS_DEADLOCK_0x99 triggers automated reboot.",
        "token_count": 15,
        "chunk_metadata": {"type": "code"},
    }

    # 2. Conceptual chunk (semantic strong)
    concept_chunk = {
        "id": concept_chunk_id,
        "document_id": doc_id,
        "chunk_index": 1,
        "content": "When two database transactions wait on locks held by each other, a circular dependency occurs.",
        "token_count": 20,
        "chunk_metadata": {"type": "architecture"},
    }

    bm25.index_chunks([sku_chunk, concept_chunk])
    vstore.add_chunks([sku_chunk, concept_chunk])

    # Search for exact error code
    results_sku = await retriever.retrieve(query="ERR_SYS_DEADLOCK_0x99", top_candidates=5)
    assert len(results_sku) >= 1
    assert results_sku[0]["chunk_id"] == str(sku_chunk_id)
    assert results_sku[0]["sparse_rank"] == 1

    # Search for conceptual database deadlock
    results_concept = await retriever.retrieve(query="circular transaction locking conflicts", top_candidates=5)
    assert len(results_concept) >= 1
    chunk_ids = [r["chunk_id"] for r in results_concept]
    assert str(concept_chunk_id) in chunk_ids


@pytest.mark.asyncio
async def test_hybrid_search_document_id_filter():
    """Verify document_id parameter limits hybrid retrieval strictly to target document."""
    bm25 = BM25IndexService.get_instance()
    vstore = VectorStoreService.get_instance()
    retriever = HybridRetriever.get_instance()

    doc_a = uuid.uuid4()
    doc_b = uuid.uuid4()

    chunk_a = {
        "id": uuid.uuid4(),
        "document_id": doc_a,
        "chunk_index": 0,
        "content": "OAuth2 refresh token rotation guidelines in Document A.",
        "token_count": 12,
        "chunk_metadata": {},
    }
    chunk_b = {
        "id": uuid.uuid4(),
        "document_id": doc_b,
        "chunk_index": 0,
        "content": "OAuth2 refresh token rotation guidelines in Document B.",
        "token_count": 12,
        "chunk_metadata": {},
    }

    bm25.index_chunks([chunk_a, chunk_b])
    vstore.add_chunks([chunk_a, chunk_b])

    # Retrieve filtering for Document A only
    results = await retriever.retrieve(query="OAuth2 refresh token", top_candidates=5, document_id=doc_a)
    assert len(results) >= 1
    assert all(r["document_id"] == str(doc_a) for r in results)


@pytest.mark.asyncio
async def test_hybrid_search_api_endpoint(client, db_session):
    """Verify GET /api/documents/search/hybrid returns valid fused results with schema fields."""
    user = await create_test_user(db_session, "hybrid_user@docagent.com")
    headers = auth_header(user)

    bm25 = BM25IndexService.get_instance()
    vstore = VectorStoreService.get_instance()

    doc_id = uuid.uuid4()
    chunk_id = uuid.uuid4()

    chunk_data = {
        "id": chunk_id,
        "document_id": doc_id,
        "chunk_index": 0,
        "content": "HiVE autonomous agent runtime executes tools in sandboxed environments.",
        "token_count": 14,
        "chunk_metadata": {"topic": "Agent Runtime"},
    }

    bm25.index_chunks([chunk_data])
    vstore.add_chunks([chunk_data])

    response = await client.get("/api/documents/search/hybrid?q=sandboxed+agent+tools&top_k=5", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1

    item = data[0]
    assert item["chunk_id"] == str(chunk_id)
    assert item["document_id"] == str(doc_id)
    assert item["chunk_index"] == 0
    assert "sandboxed" in item["content"]
    assert "rrf_score" in item
    assert item["rrf_score"] > 0.0
    assert "dense_rank" in item
    assert "sparse_rank" in item
