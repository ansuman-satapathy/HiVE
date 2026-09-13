import re
import time
import math
import asyncio
import logging
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional

from app.core.config import settings

logger = logging.getLogger("reranker_service")


class RerankerProvider(ABC):
    """
    Abstract interface for cross-encoder reranking providers.
    Cross-encoders score query-document pairs simultaneously using full cross-attention.
    """

    @abstractmethod
    def rerank(self, query: str, candidates: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
        """
        Score and rerank candidate chunks against the query.
        Returns top_k chunks sorted descending by rerank_score.
        """
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Name or identifier of the reranker model/provider."""
        pass


class LocalFastRerankProvider(RerankerProvider):
    """
    High-speed deterministic cross-scorer evaluating:
    1. Exact query phrase and multi-term sequence matching.
    2. Term proximity (distance between query terms in the document text).
    3. Query token coverage (how many query tokens appear in the text).
    4. Structural section weighting (matching in headings or near chunk boundaries).
    5. Length-normalized semantic density.

    Used as an ultra-fast local reranker and resilient fallback when no remote API key is set.
    """

    @property
    def name(self) -> str:
        return "local-fast-cross-scorer"

    def _tokenize(self, text: str) -> List[str]:
        return [t.lower() for t in re.findall(r"[a-zA-Z0-9_\-]+", text) if len(t) > 1]

    def _score_pair(self, query_tokens: List[str], raw_query: str, content: str) -> float:
        if not query_tokens or not content:
            return 0.0

        content_lower = content.lower()
        content_tokens = self._tokenize(content)
        if not content_tokens:
            return 0.0

        # 1. Exact phrase bonus (strongest cross-attention signal)
        exact_phrase = raw_query.strip().lower()
        exact_match_score = 0.0
        if len(exact_phrase) > 3 and exact_phrase in content_lower:
            exact_match_score = 1.0

        # 2. Query token coverage: fraction of unique query tokens present
        unique_q = list(dict.fromkeys(query_tokens))
        matches = [t for t in unique_q if t in content_lower]
        coverage = len(matches) / len(unique_q) if unique_q else 0.0

        # 3. Term Proximity: minimal span containing matched query tokens
        proximity_score = 0.0
        if len(matches) > 1:
            indices_map = {}
            for i, tok in enumerate(content_tokens):
                if tok in matches and tok not in indices_map:
                    indices_map[tok] = i

            if len(indices_map) > 1:
                token_indices = sorted(indices_map.values())
                span = token_indices[-1] - token_indices[0] + 1
                proximity_score = min(1.0, len(indices_map) / max(len(indices_map), span))
        elif len(matches) == 1:
            proximity_score = 0.5

        # 4. Heading / Structure bonus
        structure_bonus = 0.0
        first_100_chars = content_lower[:100]
        if any(tok in first_100_chars for tok in matches):
            structure_bonus = 0.2

        # 5. Composite Normalized Score in [0, 1]
        composite = (
            0.35 * exact_match_score
            + 0.40 * coverage
            + 0.15 * proximity_score
            + 0.10 * structure_bonus
        )
        return round(float(composite), 6)

    def rerank(self, query: str, candidates: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
        if not candidates:
            return []

        query_tokens = self._tokenize(query)
        scored_candidates = []

        for item in candidates:
            content = item.get("content", "")
            score = self._score_pair(query_tokens, query, content)

            entry = dict(item)
            entry["rerank_score"] = score
            entry["initial_rrf_score"] = item.get("rrf_score")
            scored_candidates.append(entry)

        scored_candidates.sort(
            key=lambda x: (x["rerank_score"], x.get("initial_rrf_score") or 0.0),
            reverse=True,
        )
        return scored_candidates[:top_k]


class NVIDIARerankProvider(RerankerProvider):
    """
    NVIDIA NIM Cross-Encoder Reranker using langchain-nvidia-ai-endpoints.
    Falls back gracefully to LocalFastRerankProvider on any connection or quota failure.
    """

    def __init__(
        self,
        api_key: str,
        model: str = "nvidia/llama-nemotron-rerank-1b-v2",
    ):
        from langchain_nvidia_ai_endpoints import NVIDIARerank

        self._model_name = model
        self._client = NVIDIARerank(api_key=api_key, model=model)
        self._fallback = LocalFastRerankProvider()

    @property
    def name(self) -> str:
        return f"nvidia-nim:{self._model_name}"

    def rerank(self, query: str, candidates: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
        if not candidates:
            return []

        try:
            from langchain_core.documents import Document

            docs = [
                Document(
                    page_content=c.get("content", ""),
                    metadata={"_candidate_idx": idx},
                )
                for idx, c in enumerate(candidates)
            ]

            reranked_docs = self._client.compress_documents(
                documents=docs,
                query=query,
            )

            results: List[Dict[str, Any]] = []
            seen_indices = set()

            for doc in reranked_docs:
                idx = doc.metadata.get("_candidate_idx")
                if idx is not None and idx not in seen_indices:
                    seen_indices.add(idx)
                    orig = dict(candidates[idx])
                    relevance_score = (
                        doc.metadata.get("relevance_score")
                        or getattr(doc, "relevance_score", None)
                        or 1.0
                    )
                    orig["rerank_score"] = round(float(relevance_score), 6)
                    orig["initial_rrf_score"] = orig.get("rrf_score")
                    results.append(orig)

            if len(results) < top_k:
                for idx, c in enumerate(candidates):
                    if idx not in seen_indices:
                        fallback_entry = dict(c)
                        fallback_entry["rerank_score"] = 0.0
                        fallback_entry["initial_rrf_score"] = c.get("rrf_score")
                        results.append(fallback_entry)
                        seen_indices.add(idx)
                        if len(results) >= top_k:
                            break

            return results[:top_k]

        except Exception as exc:
            logger.warning(
                f"NVIDIA Rerank failed ({exc}). Falling back to local cross-scorer."
            )
            return self._fallback.rerank(query, candidates, top_k)


class RerankerFactory:
    """Factory to instantiate the configured RerankerProvider."""

    _instance: Optional[RerankerProvider] = None

    @classmethod
    def get_provider(cls, force_local: bool = False) -> RerankerProvider:
        if force_local:
            return LocalFastRerankProvider()

        if cls._instance is not None:
            return cls._instance

        provider_type = (settings.RERANKER_PROVIDER or "auto").lower()

        if provider_type == "nvidia" or (provider_type == "auto" and settings.NVIDIA_API_KEY):
            try:
                cls._instance = NVIDIARerankProvider(
                    api_key=settings.NVIDIA_API_KEY,
                    model=settings.NVIDIA_RERANK_MODEL,
                )
                logger.info(f"Initialized NVIDIA NIM Reranker Provider ({settings.NVIDIA_RERANK_MODEL}).")
                return cls._instance
            except Exception as exc:
                logger.warning(
                    f"Failed to initialize NVIDIA NIM reranker ({exc}); falling back to local."
                )

        cls._instance = LocalFastRerankProvider()
        logger.info("Initialized Local Fast Reranker Provider.")
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        cls._instance = None


class RerankerService:
    """
    High-level orchestrator for Stage-2 Cross-Encoder Reranking.
    Features async execution, strict timeouts, latency profiling, and resilient fallback.
    """

    _instance: Optional["RerankerService"] = None

    def __init__(
        self,
        provider: Optional[RerankerProvider] = None,
        timeout_seconds: Optional[float] = None,
    ):
        self.provider = provider or RerankerFactory.get_provider()
        self.timeout_seconds = timeout_seconds or getattr(settings, "RERANKER_TIMEOUT_SECONDS", 5.0)

    @classmethod
    def get_instance(cls) -> "RerankerService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        cls._instance = None

    async def rerank_candidates(
        self,
        query: str,
        candidates: List[Dict[str, Any]],
        top_k: int = 5,
    ) -> Dict[str, Any]:
        """
        Rerank a candidate pool using the cross-encoder provider.
        Returns:
            {
                "query": query,
                "results": List[Dict[str, Any]],
                "latency_ms": float,
                "reranker_used": str,
                "fallback_triggered": bool
            }
        """
        start_time = time.perf_counter()

        if not candidates or not query or not query.strip():
            return {
                "query": query,
                "results": [],
                "latency_ms": 0.0,
                "reranker_used": self.provider.name,
                "fallback_triggered": False,
            }

        fallback_triggered = False

        try:
            results = await asyncio.wait_for(
                asyncio.to_thread(self.provider.rerank, query, candidates, top_k),
                timeout=self.timeout_seconds,
            )
        except asyncio.TimeoutError:
            logger.warning(
                f"Reranker timed out after {self.timeout_seconds}s for query '{query}'. "
                f"Falling back to candidate RRF order."
            )
            fallback_triggered = True
            results = self._fallback_from_candidates(candidates, top_k)
        except Exception as exc:
            logger.error(
                f"Reranker encountered error: {exc}. Falling back to candidate RRF order."
            )
            fallback_triggered = True
            results = self._fallback_from_candidates(candidates, top_k)

        latency_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

        return {
            "query": query,
            "results": results,
            "latency_ms": latency_ms,
            "reranker_used": self.provider.name,
            "fallback_triggered": fallback_triggered,
        }

    @staticmethod
    def _fallback_from_candidates(
        candidates: List[Dict[str, Any]],
        top_k: int,
    ) -> List[Dict[str, Any]]:
        """Fallback returning top_k from candidates preserving existing rrf_score order."""
        fallback_results = []
        for item in candidates[:top_k]:
            entry = dict(item)
            entry["rerank_score"] = float(item.get("rrf_score", 0.0))
            entry["initial_rrf_score"] = float(item.get("rrf_score", 0.0))
            fallback_results.append(entry)
        return fallback_results
