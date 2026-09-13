import re
import math
import hashlib
import logging
from abc import ABC, abstractmethod
from typing import List, Optional
from app.core.config import settings

logger = logging.getLogger("embedding_service")


class EmbeddingProvider(ABC):
    """
    Abstract interface for dense vector embedding generation.
    Supports high-accuracy remote endpoints (NVIDIA NIM) and resilient local fallbacks.
    """

    @abstractmethod
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Compute dense vector embeddings for a list of documents/chunks."""
        pass

    @abstractmethod
    def embed_query(self, text: str) -> List[float]:
        """Compute dense vector embedding for a single search query."""
        pass

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Dimensionality of the vector space."""
        pass


class LocalFeatureEmbeddingProvider(EmbeddingProvider):
    """
    High-speed deterministic 384-dimensional dense semantic feature extractor.
    Uses subword character n-grams and hashing with L2 unit normalization.
    Ensures zero-cost local testing and robust fallback when no API key is set.
    """

    def __init__(self, dimension: int = 384):
        self._dim = dimension

    @property
    def dimension(self) -> int:
        return self._dim

    def _text_to_vector(self, text: str) -> List[float]:
        if not text or not text.strip():
            return [0.0] * self._dim

        vec = [0.0] * self._dim
        words = re.findall(r"[a-zA-Z0-9_\-]+", text.lower())

        for word in words:
            # Word level feature
            h = int(hashlib.md5(word.encode("utf-8")).hexdigest(), 16)
            idx = h % self._dim
            sign = 1.0 if ((h >> 8) & 1) else -1.0
            vec[idx] += sign

            # Character 3-gram subwords for semantic root similarity
            if len(word) >= 3:
                for i in range(len(word) - 2):
                    ngram = word[i : i + 3]
                    h_ng = int(hashlib.sha256(ngram.encode("utf-8")).hexdigest(), 16)
                    vec[h_ng % self._dim] += 0.5 * (1.0 if ((h_ng >> 4) & 1) else -1.0)

        # L2 normalize
        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 0.0:
            vec = [float(round(x / norm, 6)) for x in vec]
        return vec

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self._text_to_vector(t) for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._text_to_vector(text)


class NVIDIAEmbeddingProvider(EmbeddingProvider):
    """
    NVIDIA NIM API embedding provider.
    Falls back gracefully to LocalFeatureEmbeddingProvider if API call fails or model is unavailable.
    """

    def __init__(self, api_key: str, model: str = "nvidia/llama-3.2-nv-embedqa-1b-v1"):
        from langchain_nvidia_ai_endpoints import NVIDIAEmbeddings
        self._model_name = model
        self._client = NVIDIAEmbeddings(api_key=api_key, model=model)
        self._dim = 1024
        self._fallback = LocalFeatureEmbeddingProvider()

    @property
    def dimension(self) -> int:
        return self._dim

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        try:
            return self._client.embed_documents(texts)
        except Exception as exc:
            logger.warning(f"NVIDIA embed_documents failed ({exc}); falling back to deterministic local embeddings.")
            return self._fallback.embed_documents(texts)

    def embed_query(self, text: str) -> List[float]:
        try:
            return self._client.embed_query(text)
        except Exception as exc:
            logger.warning(f"NVIDIA embed_query failed ({exc}); falling back to deterministic local embeddings.")
            return self._fallback.embed_query(text)


class EmbeddingFactory:
    """Factory to instantiate the appropriate EmbeddingProvider based on runtime settings."""

    _instance: Optional[EmbeddingProvider] = None

    @classmethod
    def get_provider(cls, force_local: bool = False) -> EmbeddingProvider:
        if force_local:
            return LocalFeatureEmbeddingProvider()

        if cls._instance is not None:
            return cls._instance

        provider_type = (settings.EMBEDDING_PROVIDER or "auto").lower()

        if provider_type == "nvidia" or (provider_type == "auto" and settings.NVIDIA_API_KEY):
            try:
                cls._instance = NVIDIAEmbeddingProvider(api_key=settings.NVIDIA_API_KEY)
                logger.info("Initialized NVIDIA NIM Embedding Provider (with resilient fallback).")
                return cls._instance
            except Exception as exc:
                logger.warning(f"Failed to initialize NVIDIA NIM embeddings, falling back to local: {exc}")

        cls._instance = LocalFeatureEmbeddingProvider()
        logger.info("Initialized Local Feature Embedding Provider.")
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        cls._instance = None
