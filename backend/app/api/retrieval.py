import time
import logging
from uuid import UUID
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.services.bm25_service import BM25IndexService
from app.services.vector_store_service import VectorStoreService
from app.services.hybrid_retriever import HybridRetriever
from app.services.reranker_service import RerankerService
from app.services.context_expansion_service import ContextExpansionService
from app.schemas.document import ExpandedContextResult

logger = logging.getLogger("retrieval_api")

router = APIRouter(prefix="/retrieval", tags=["Retrieval"])


class RetrievalDebugRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Search query string")
    top_k: int = Field(10, ge=1, le=50, description="Max candidates to retrieve per stage")
    rrf_k: int = Field(60, ge=1, le=200, description="RRF fusion smoothing constant")
    document_id: Optional[UUID] = Field(None, description="Optional single document filter")
    document_ids: Optional[List[UUID]] = Field(None, description="Optional multiple document filters")
    expand_top_k: int = Field(1, ge=0, le=5, description="Number of top candidates to expand context for")
    window_size: int = Field(1, ge=0, le=5, description="Context expansion window size (chunks before/after)")


class SparseStageDebug(BaseModel):
    count: int
    latency_ms: float
    results: List[Dict[str, Any]]


class DenseStageDebug(BaseModel):
    count: int
    latency_ms: float
    results: List[Dict[str, Any]]


class HybridStageDebug(BaseModel):
    count: int
    rrf_k: int
    latency_ms: float
    results: List[Dict[str, Any]]


class RerankStageDebug(BaseModel):
    count: int
    latency_ms: float
    reranker_used: str
    fallback_triggered: bool
    results: List[Dict[str, Any]]


class RetrievalDebugResponse(BaseModel):
    query: str
    total_latency_ms: float
    sparse_stage: SparseStageDebug
    dense_stage: DenseStageDebug
    hybrid_stage: HybridStageDebug
    rerank_stage: RerankStageDebug
    expansion_previews: List[ExpandedContextResult]


@router.post("/debug", response_model=RetrievalDebugResponse)
async def debug_retrieval_pipeline(
    req: RetrievalDebugRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Ticket 14: Search & Retrieval Debug Playground Pipeline.
    Executes and benchmarks all 4 retrieval stages + context expansion side-by-side:
    1. Sparse BM25 Keyword Search
    2. Dense ChromaDB Semantic Vector Search
    3. Reciprocal Rank Fusion (RRF) Hybrid Merger
    4. Cross-Encoder Deep Re-ranking
    5. Context Expansion Window for Top Candidates
    """
    overall_start = time.perf_counter()

    # Determine document scope filter
    target_docs = None
    if req.document_ids is not None:
        clean = [str(d).strip() for d in req.document_ids if str(d).strip()]
        if clean:
            target_docs = clean
    elif req.document_id:
        s = str(req.document_id).strip()
        if s:
            target_docs = [s]

    # ── Stage 1: Sparse BM25 Search ──────────────────────────────────────────
    sparse_start = time.perf_counter()
    bm25 = BM25IndexService.get_instance()
    sparse_raw = bm25.search_sparse(
        query=req.query,
        top_k=req.top_k,
        document_id=target_docs
    )
    sparse_latency = (time.perf_counter() - sparse_start) * 1000.0

    # Format sparse candidates for RRF and response
    sparse_candidates = [
        {
            "chunk_id": str(r.get("chunk_id") or r.get("id")),
            "document_id": str(r.get("document_id")),
            "chunk_index": r.get("chunk_index", 0),
            "content": r.get("content", ""),
            "token_count": r.get("token_count", 0),
            "chunk_metadata": r.get("chunk_metadata", {}),
            "bm25_score": round(float(r.get("bm25_score", 0.0)), 4),
        }
        for r in sparse_raw
    ]

    # ── Stage 2: Dense ChromaDB Vector Search ────────────────────────────────
    dense_start = time.perf_counter()
    vstore = VectorStoreService.get_instance()
    dense_raw = vstore.search_dense(
        query=req.query,
        top_k=req.top_k,
        document_id=target_docs
    )
    dense_latency = (time.perf_counter() - dense_start) * 1000.0

    dense_candidates = [
        {
            "chunk_id": str(r.get("chunk_id") or r.get("id")),
            "document_id": str(r.get("document_id")),
            "chunk_index": r.get("chunk_index", 0),
            "content": r.get("content", ""),
            "token_count": r.get("token_count", 0),
            "chunk_metadata": r.get("chunk_metadata", {}),
            "score": round(float(r.get("score", 0.0)), 4),
        }
        for r in dense_raw
    ]

    # ── Stage 3: Hybrid Reciprocal Rank Fusion (RRF) ──────────────────────────
    hybrid_start = time.perf_counter()
    hybrid_raw = HybridRetriever.reciprocal_rank_fusion(
        dense_results=dense_candidates,
        sparse_results=sparse_candidates,
        k=req.rrf_k
    )
    hybrid_candidates = hybrid_raw[:req.top_k]
    hybrid_latency = (time.perf_counter() - hybrid_start) * 1000.0

    # ── Stage 4: Cross-Encoder Reranking ─────────────────────────────────────
    reranker = RerankerService.get_instance()
    rerank_out = await reranker.rerank_candidates(
        query=req.query,
        candidates=hybrid_candidates,
        top_k=req.top_k
    )
    rerank_results = rerank_out.get("results", [])
    rerank_latency = rerank_out.get("latency_ms", 0.0)
    reranker_used = rerank_out.get("reranker_used", "unknown")
    fallback_triggered = rerank_out.get("fallback_triggered", False)

    # Annotate rerank results with relative rank changes compared to hybrid
    hybrid_rank_map = {
        item.get("chunk_id"): idx + 1
        for idx, item in enumerate(hybrid_candidates)
    }
    enriched_rerank_results = []
    for new_rank, item in enumerate(rerank_results, start=1):
        chunk_id = item.get("chunk_id")
        old_hybrid_rank = hybrid_rank_map.get(chunk_id)
        # positive rank_delta means moved up (e.g. was 4th, now 1st => delta = +3)
        rank_delta = (old_hybrid_rank - new_rank) if old_hybrid_rank is not None else 0
        enriched_rerank_results.append({
            **item,
            "hybrid_rank": old_hybrid_rank,
            "rank_delta": rank_delta,
        })

    # ── Stage 5: Context Expansion for Top Candidates ────────────────────────
    expansion_previews: List[ExpandedContextResult] = []
    if req.expand_top_k > 0 and enriched_rerank_results:
        top_chunk_ids = [
            UUID(item["chunk_id"])
            for item in enriched_rerank_results[:req.expand_top_k]
            if item.get("chunk_id")
        ]
        for c_id in top_chunk_ids:
            try:
                exp_res = await ContextExpansionService.expand_chunk_context(
                    db=db,
                    chunk_id=c_id,
                    window_size=req.window_size,
                    user_id=current_user.id
                )
                expansion_previews.append(exp_res)
            except Exception as exp_err:
                logger.warning(f"Could not expand context for debug chunk {c_id}: {exp_err}")

    total_latency = (time.perf_counter() - overall_start) * 1000.0

    return RetrievalDebugResponse(
        query=req.query,
        total_latency_ms=round(total_latency, 2),
        sparse_stage=SparseStageDebug(
            count=len(sparse_candidates),
            latency_ms=round(sparse_latency, 2),
            results=sparse_candidates
        ),
        dense_stage=DenseStageDebug(
            count=len(dense_candidates),
            latency_ms=round(dense_latency, 2),
            results=dense_candidates
        ),
        hybrid_stage=HybridStageDebug(
            count=len(hybrid_candidates),
            rrf_k=req.rrf_k,
            latency_ms=round(hybrid_latency, 2),
            results=hybrid_candidates
        ),
        rerank_stage=RerankStageDebug(
            count=len(enriched_rerank_results),
            latency_ms=round(rerank_latency, 2),
            reranker_used=reranker_used,
            fallback_triggered=fallback_triggered,
            results=enriched_rerank_results
        ),
        expansion_previews=expansion_previews
    )
