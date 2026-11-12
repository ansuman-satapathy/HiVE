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

    def __init__(self, api_key: str, model: Optional[str] = None):
        from langchain_nvidia_ai_endpoints import NVIDIAEmbeddings
        self._model_name = model or settings.NVIDIA_EMBED_MODEL
        self._client = NVIDIAEmbeddings(api_key=api_key, model=self._model_name)
        # nemotron-3-embed-1b produces 2048-dim vectors
        self._dim = 2048 if "nemotron" in self._model_name.lower() else 1024
        self._fallback = LocalFeatureEmbeddingProvider(dimension=self._dim)

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


class OpenAICompatibleEmbeddingProvider(EmbeddingProvider):
    """
    OpenAI-compatible embedding provider supporting Ollama, OpenAI, and cloud providers.
    Uses standard POST {base_url}/embeddings endpoint.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:11434/v1",
        model_name: str = "nomic-embed-text",
        api_key: Optional[str] = None,
        dimension: int = 768,
        timeout: float = 30.0,
    ):
        self.base_url = base_url.rstrip("/")
        if not self.base_url.endswith("/v1") and not self.base_url.endswith("/embeddings"):
            self.endpoint_url = f"{self.base_url}/v1/embeddings"
        elif self.base_url.endswith("/embeddings"):
            self.endpoint_url = self.base_url
        else:
            self.endpoint_url = f"{self.base_url}/embeddings"

        self.model_name = model_name
        self.api_key = api_key or ""
        self.timeout = timeout
        self._dim = dimension
        self._fallback = LocalFeatureEmbeddingProvider(dimension=dimension)

    @property
    def dimension(self) -> int:
        return self._dim

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        import httpx
        headers = {"Content-Type": "application/json"}
        if self.api_key and self.api_key.strip():
            headers["Authorization"] = f"Bearer {self.api_key.strip()}"

        try:
            with httpx.Client(timeout=self.timeout) as client:
                res = client.post(
                    self.endpoint_url,
                    json={"model": self.model_name, "input": texts},
                    headers=headers,
                )
                if res.status_code == 200:
                    data = res.json()
                    raw_data = data.get("data", [])
                    raw_data.sort(key=lambda x: x.get("index", 0))
                    embeddings = [item["embedding"] for item in raw_data if "embedding" in item]
                    if embeddings:
                        self._dim = len(embeddings[0])
                        return embeddings
                logger.warning(
                    f"OpenAICompatible embedding endpoint returned HTTP {res.status_code}: {res.text[:200]}"
                )
        except Exception as exc:
            logger.warning(f"Error calling embedding endpoint {self.endpoint_url}: {exc}")

        return self._fallback.embed_documents(texts)

    def embed_query(self, text: str) -> List[float]:
        res = self.embed_documents([text])
        return res[0] if res else self._fallback.embed_query(text)


class EmbeddingFactory:
    """Factory to instantiate and reconfigure EmbeddingProvider based on runtime/DB settings."""

    _instance: Optional[EmbeddingProvider] = None

    @classmethod
    def configure(
        cls,
        provider: str,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
    ) -> EmbeddingProvider:
        """Dynamically reconfigure the active embedding provider from database settings."""
        p = (provider or "auto").lower()

        if p == "ollama":
            url = base_url or "http://localhost:11434/v1"
            m = model or "nomic-embed-text"
            logger.info(f"Configuring Ollama embedding provider: {m} at {url}")
            cls._instance = OpenAICompatibleEmbeddingProvider(
                base_url=url, model_name=m, api_key=api_key or "ollama"
            )
            return cls._instance

        if p in ("openai", "custom"):
            url = base_url or "https://api.openai.com/v1"
            m = model or "text-embedding-3-small"
            logger.info(f"Configuring OpenAI-compatible embedding provider: {m} at {url}")
            cls._instance = OpenAICompatibleEmbeddingProvider(
                base_url=url, model_name=m, api_key=api_key
            )
            return cls._instance

        if p == "nvidia" and api_key:
            try:
                cls._instance = NVIDIAEmbeddingProvider(api_key=api_key, model=model)
                logger.info(f"Configuring NVIDIA NIM embedding provider: {model}")
                return cls._instance
            except Exception as exc:
                logger.warning(f"Failed to initialize NVIDIA NIM embeddings: {exc}")

        cls._instance = LocalFeatureEmbeddingProvider()
        return cls._instance

    @classmethod
    def get_provider(cls, force_local: bool = False) -> EmbeddingProvider:
        if force_local:
            return LocalFeatureEmbeddingProvider()

        if cls._instance is not None:
            return cls._instance

        provider_type = (settings.EMBEDDING_PROVIDER or "auto").lower()

        if provider_type in ("ollama", "openai", "custom"):
            return cls.configure(
                provider=provider_type,
                model=settings.EMBEDDING_MODEL or None,
                base_url=settings.EMBEDDING_BASE_URL or None,
                api_key=(settings.EMBEDDING_API_KEY or settings.OPENAI_API_KEY or None),
            )

        if provider_type == "nvidia" or (provider_type == "auto" and (settings.EMBEDDING_API_KEY or settings.NVIDIA_API_KEY)):
            embed_key = settings.EMBEDDING_API_KEY or settings.NVIDIA_API_KEY
            if embed_key:
                try:
                    cls._instance = NVIDIAEmbeddingProvider(
                        api_key=embed_key,
                        model=settings.EMBEDDING_MODEL or settings.NVIDIA_EMBED_MODEL,
                    )
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
