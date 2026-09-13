import asyncio
import logging
import uuid
from typing import List, Dict, Any, Optional
from app.services.bm25_service import BM25IndexService
from app.services.vector_store_service import VectorStoreService

logger = logging.getLogger(__name__)

RRF_K_DEFAULT = 60


class HybridRetriever:
    """
    Hybrid Retrieval Engine utilizing Reciprocal Rank Fusion (RRF).
    Combines dense semantic vector search (ChromaDB) and sparse lexical search (BM25Plus)
    to overcome the vocabulary mismatch problem while retaining exact keyword precision.
    """

    _instance: Optional["HybridRetriever"] = None

    def __init__(
        self,
        vector_store: Optional[VectorStoreService] = None,
        bm25_service: Optional[BM25IndexService] = None,
        rrf_k: int = RRF_K_DEFAULT,
    ):
        self.vector_store = vector_store or VectorStoreService.get_instance()
        self.bm25_service = bm25_service or BM25IndexService.get_instance()
        self.rrf_k = rrf_k

    @classmethod
    def get_instance(cls) -> "HybridRetriever":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @staticmethod
    def reciprocal_rank_fusion(
        dense_results: List[Dict[str, Any]],
        sparse_results: List[Dict[str, Any]],
        k: int = RRF_K_DEFAULT,
    ) -> List[Dict[str, Any]]:
        """
        Calculates Reciprocal Rank Fusion (RRF) scores:
            RRF(d) = sum_{m in M} 1 / (k + rank_m(d))

        Where:
            k: smoothing parameter (standard default is 60).
            rank_m(d): 1-based rank of chunk d in system m (dense or sparse).

        Returns merged list sorted in descending order of rrf_score.
        """
        fused_items: Dict[str, Dict[str, Any]] = {}

        # 1. Process Dense Results
        for rank, item in enumerate(dense_results, start=1):
            chunk_id = str(item.get("chunk_id") or item.get("id"))
            score_contribution = 1.0 / (k + rank)

            if chunk_id not in fused_items:
                fused_items[chunk_id] = {
                    "chunk_id": chunk_id,
                    "document_id": str(item.get("document_id")),
                    "chunk_index": int(item.get("chunk_index", 0)),
                    "content": item.get("content", ""),
                    "token_count": int(item.get("token_count", 0)),
                    "chunk_metadata": item.get("chunk_metadata") or {},
                    "rrf_score": score_contribution,
                    "dense_rank": rank,
                    "sparse_rank": None,
                    "dense_score": float(item.get("score", 0.0)),
                    "bm25_score": None,
                }
            else:
                fused_items[chunk_id]["rrf_score"] += score_contribution
                fused_items[chunk_id]["dense_rank"] = rank
                fused_items[chunk_id]["dense_score"] = float(item.get("score", 0.0))

        # 2. Process Sparse Results
        for rank, item in enumerate(sparse_results, start=1):
            chunk_id = str(item.get("chunk_id") or item.get("id"))
            score_contribution = 1.0 / (k + rank)

            if chunk_id not in fused_items:
                fused_items[chunk_id] = {
                    "chunk_id": chunk_id,
                    "document_id": str(item.get("document_id")),
                    "chunk_index": int(item.get("chunk_index", 0)),
                    "content": item.get("content", ""),
                    "token_count": int(item.get("token_count", 0)),
                    "chunk_metadata": item.get("chunk_metadata") or {},
                    "rrf_score": score_contribution,
                    "dense_rank": None,
                    "sparse_rank": rank,
                    "dense_score": None,
                    "bm25_score": float(item.get("bm25_score", 0.0)),
                }
            else:
                fused_items[chunk_id]["rrf_score"] += score_contribution
                fused_items[chunk_id]["sparse_rank"] = rank
                fused_items[chunk_id]["bm25_score"] = float(item.get("bm25_score", 0.0))

        # 3. Sort by RRF score descending, round score to 6 decimal places
        ranked = list(fused_items.values())
        for r in ranked:
            r["rrf_score"] = round(float(r["rrf_score"]), 6)

        ranked.sort(key=lambda x: x["rrf_score"], reverse=True)
        return ranked

    async def retrieve(
        self,
        query: str,
        top_candidates: int = 25,
        document_id: Optional[uuid.UUID | str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Execute concurrent dense and sparse retrieval and merge with RRF.
        Retrieves top_candidates from each sub-engine, then returns the top_candidates
        from the reciprocal rank fused pool.
        """
        if not query or not query.strip():
            return []

        doc_id_str = str(document_id) if document_id else None

        # Run vector search and BM25 search concurrently in worker threads
        dense_task = asyncio.to_thread(
            self.vector_store.search_dense,
            query=query,
            top_k=top_candidates,
            document_id=doc_id_str,
        )
        sparse_task = asyncio.to_thread(
            self.bm25_service.search_sparse,
            query=query,
            top_k=top_candidates,
            document_id=doc_id_str,
        )

        dense_results, sparse_results = await asyncio.gather(dense_task, sparse_task)

        logger.debug(
            f"Hybrid retrieval for '{query}': {len(dense_results)} dense results, "
            f"{len(sparse_results)} sparse results."
        )

        fused = self.reciprocal_rank_fusion(
            dense_results=dense_results,
            sparse_results=sparse_results,
            k=self.rrf_k,
        )

        return fused[:top_candidates]
