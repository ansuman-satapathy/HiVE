import uuid
import pytest
import asyncio
from unittest.mock import MagicMock

from app.services.reranker_service import (
    RerankerService,
    LocalFastRerankProvider,
    NVIDIARerankProvider,
    RerankerFactory,
)
from app.services.hybrid_retriever import HybridRetriever
from app.services.vector_store_service import VectorStoreService
from app.services.bm25_service import BM25IndexService
from tests.conftest import create_test_user, auth_header


@pytest.fixture(autouse=True)
def reset_stores():
    """Clear indices and reset reranker factory before and after each test."""
    bm25 = BM25IndexService.get_instance()
    vstore = VectorStoreService.get_instance()
    bm25.clear()
    vstore.clear()
    RerankerFactory.reset()
    RerankerService.reset()
    yield
    bm25.clear()
    vstore.clear()
    RerankerFactory.reset()
    RerankerService.reset()


def test_local_fast_rerank_scoring_and_ordering():
    """
    Test that LocalFastRerankProvider ranks candidates with higher token coverage,
    exact phrases, and closer term proximity above weaker candidates.
    """
    provider = LocalFastRerankProvider()
    query = "database deadlock timeout"

    doc_id = str(uuid.uuid4())
    candidates = [
        {
            "chunk_id": str(uuid.uuid4()),
            "document_id": doc_id,
            "chunk_index": 0,
            "content": "This document discusses general timeout configuration in microservices.",
            "token_count": 10,
            "rrf_score": 0.03,
        },
        {
            "chunk_id": str(uuid.uuid4()),
            "document_id": doc_id,
            "chunk_index": 1,
            "content": "A database deadlock timeout occurs when two transactions wait on locked rows concurrently.",
            "token_count": 14,
            "rrf_score": 0.02,
        },
        {
            "chunk_id": str(uuid.uuid4()),
            "document_id": doc_id,
            "chunk_index": 2,
            "content": "PostgreSQL database vacuum parameters and memory allocation settings.",
            "token_count": 9,
            "rrf_score": 0.025,
        },
    ]

    reranked = provider.rerank(query=query, candidates=candidates, top_k=3)

    assert len(reranked) == 3
    # Candidate 1 contains the exact phrase "database deadlock timeout" and all 3 query tokens
    assert reranked[0]["chunk_id"] == candidates[1]["chunk_id"]
    assert reranked[0]["rerank_score"] > reranked[1]["rerank_score"]
    assert "initial_rrf_score" in reranked[0]
    assert reranked[0]["initial_rrf_score"] == 0.02


@pytest.mark.asyncio
async def test_reranker_service_timeout_triggers_fallback():
    """
    Verify that if the underlying provider hangs or exceeds the timeout,
    RerankerService catches it and falls back gracefully to top candidates ordered by initial RRF score.
    """
    class SlowRerankerProvider(LocalFastRerankProvider):
        @property
        def name(self) -> str:
            return "slow-mock-provider"

        def rerank(self, query, candidates, top_k):
            import time
            time.sleep(0.5)
            return super().rerank(query, candidates, top_k)

    slow_provider = SlowRerankerProvider()
    # Set timeout very low (0.05 seconds) to trigger timeout
    service = RerankerService(provider=slow_provider, timeout_seconds=0.05)

    doc_id = str(uuid.uuid4())
    candidates = [
        {
            "chunk_id": str(uuid.uuid4()),
            "document_id": doc_id,
            "chunk_index": 0,
            "content": "First candidate",
            "token_count": 5,
            "rrf_score": 0.035,
        },
        {
            "chunk_id": str(uuid.uuid4()),
            "document_id": doc_id,
            "chunk_index": 1,
            "content": "Second candidate",
            "token_count": 5,
            "rrf_score": 0.025,
        },
    ]

    result = await service.rerank_candidates(query="test query", candidates=candidates, top_k=2)

    assert result["fallback_triggered"] is True
    assert len(result["results"]) == 2
    assert result["results"][0]["chunk_id"] == candidates[0]["chunk_id"]
    assert result["results"][0]["rerank_score"] == 0.035
    assert result["latency_ms"] > 0


def test_nvidia_rerank_provider_fallback_on_exception():
    """
    Verify that NVIDIARerankProvider falls back to local cross-scorer if the remote API fails.
    """
    provider = NVIDIARerankProvider(api_key="mock_key", model="nvidia/llama-nemotron-rerank-1b-v2")
    # Mock client to raise an API connection exception
    provider._client = MagicMock()
    provider._client.compress_documents.side_effect = RuntimeError("API connection timeout")

    doc_id = str(uuid.uuid4())
    candidates = [
        {
            "chunk_id": str(uuid.uuid4()),
            "document_id": doc_id,
            "chunk_index": 0,
            "content": "Relevant content discussing exact phrase matching.",
            "token_count": 6,
            "rrf_score": 0.01,
        }
    ]

    results = provider.rerank(query="exact phrase", candidates=candidates, top_k=1)
    assert len(results) == 1
    assert "rerank_score" in results[0]
    assert results[0]["rerank_score"] > 0.0


@pytest.mark.asyncio
async def test_rerank_api_endpoint(client, db_session):
    """
    End-to-end API test for GET /api/documents/search/rerank.
    Indexes chunks, queries the endpoint, and verifies structured RerankResponse output.
    """
    user = await create_test_user(db_session, "rerank_user@docagent.com")
    headers = auth_header(user)

    doc_id = uuid.uuid4()
    chunks = [
        {
            "id": uuid.uuid4(),
            "document_id": doc_id,
            "chunk_index": 0,
            "content": "DocAgent Runtime supports multi-stage retrieval combining dense vector search and BM25 with cross-encoders.",
            "token_count": 18,
            "chunk_metadata": {"title": "Architecture Overview"},
        },
        {
            "id": uuid.uuid4(),
            "document_id": doc_id,
            "chunk_index": 1,
            "content": "PostgreSQL database connection pooling is managed via asyncpg and SQLAlchemy engine.",
            "token_count": 12,
            "chunk_metadata": {"title": "Database Config"},
        },
        {
            "id": uuid.uuid4(),
            "document_id": doc_id,
            "chunk_index": 2,
            "content": "For error code ERR_RERANK_500 please inspect the cross-encoder inference logs.",
            "token_count": 13,
            "chunk_metadata": {"title": "Troubleshooting"},
        },
    ]

    # Index into both BM25 and ChromaDB vector store
    vstore = VectorStoreService.get_instance()
    bm25 = BM25IndexService.get_instance()
    vstore.add_chunks(chunks)
    bm25.index_chunks(chunks)

    # 1. Query for cross-encoder reranking
    res = await client.get(
        "/api/documents/search/rerank?q=cross-encoder+inference+logs&top_k=2&top_candidates=10",
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()

    assert data["query"] == "cross-encoder inference logs"
    assert "latency_ms" in data
    assert "reranker_used" in data
    assert "fallback_triggered" in data
    assert len(data["results"]) == 2

    # The troubleshooting chunk (chunk 2) with exact tokens should be ranked #1 by cross-encoder
    top_result = data["results"][0]
    assert top_result["chunk_id"] == str(chunks[2]["id"])
    assert top_result["rerank_score"] > 0
    assert "initial_rrf_score" in top_result
    assert "chunk_metadata" in top_result
    assert top_result["chunk_metadata"]["title"] == "Troubleshooting"

    # 2. Query with non-existent document_id returns 404
    missing_doc_id = uuid.uuid4()
    err_res = await client.get(
        f"/api/documents/search/rerank?q=test&document_id={missing_doc_id}",
        headers=headers,
    )
    assert err_res.status_code == 404
