import re
import json
import time
import asyncio
import logging
from typing import AsyncGenerator, List, Dict, Any, Optional
from abc import ABC, abstractmethod
import httpx

from app.core.config import settings

logger = logging.getLogger("llm_service")


SYSTEM_PROMPT_TEMPLATE = """You are HiVE, a helpful and precise assistant.
Answer the user's question accurately using ONLY the provided document context excerpts below.
If the excerpts do not contain sufficient facts to answer the question, clearly state that the provided documents do not contain the answer.

CRITICAL CITATION RULES:
1. Every factual sentence or claim MUST end with an inline citation tag: `[doc:CHUNK_ID]`.
2. Extract the exact CHUNK_ID from the chunk header: `--- Chunk X [ID: CHUNK_ID] from [FILENAME] ---`.
3. Example: "The boundary condition for E is Ey1=Ey2 [doc:89dd8593-e105-4f7d-b8ed-0acdd30faacc]."
4. IMPORTANT: Write the tag with NO space after the colon: `[doc:CHUNK_ID]` NOT `[doc: CHUNK_ID]`.
5. Never invent chunk IDs. Only use chunk IDs present in the excerpts below.
6. If multiple chunks support a claim, append each: `[doc:CHUNK_ID_1][doc:CHUNK_ID_2]`.

=== DOCUMENT CONTEXT EXCERPTS ===
{context_text}
================================
"""


class LLMProvider(ABC):
    """Abstract interface for streaming LLM generation."""

    @abstractmethod
    async def astream(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.2,
    ) -> AsyncGenerator[str, None]:
        """Yield string tokens one by one asynchronously."""
        pass


class OpenAICompatibleLLM(LLMProvider):
    """
    Standard OpenAI-compatible streaming LLM provider.
    Supports local Ollama, vLLM, LM Studio, as well as cloud OpenAI, Groq, NVIDIA NIM, DeepSeek.
    Endpoint: {base_url}/chat/completions
    """

    def __init__(
        self,
        base_url: str = "http://localhost:11434/v1",
        model_name: str = "llama3.2",
        api_key: Optional[str] = None,
        timeout: float = 45.0,
    ):
        self.base_url = base_url.rstrip("/")
        if not self.base_url.endswith("/v1") and not self.base_url.endswith("/chat/completions"):
            self.endpoint_url = f"{self.base_url}/v1/chat/completions"
        elif self.base_url.endswith("/chat/completions"):
            self.endpoint_url = self.base_url
        else:
            self.endpoint_url = f"{self.base_url}/chat/completions"

        self.model_name = model_name
        self.api_key = api_key or ""
        self.timeout = timeout
        self._fallback = LocalDeterministicLLM()

    async def astream(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.2,
    ) -> AsyncGenerator[str, None]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }
        if self.api_key and self.api_key.strip():
            headers["Authorization"] = f"Bearer {self.api_key.strip()}"

        payload = {
            "model": self.model_name,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream(
                    "POST",
                    self.endpoint_url,
                    json=payload,
                    headers=headers,
                ) as response:
                    if response.status_code != 200:
                        error_body = await response.aread()
                        err_text = error_body.decode('utf-8', errors='ignore')[:300]
                        logger.error(
                            f"OpenAI-compatible endpoint {self.endpoint_url} returned HTTP {response.status_code}: {err_text}"
                        )
                        yield f"\n\n[Model Error (HTTP {response.status_code}): Could not generate response from '{self.model_name}' at {self.base_url}. Details: {err_text}]"
                        return

                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        line = line.strip()
                        if line.startswith("data: "):
                            data_str = line[6:].strip()
                            if data_str == "[DONE]":
                                break
                            try:
                                chunk_json = json.loads(data_str)
                                choices = chunk_json.get("choices", [])
                                if choices:
                                    delta = choices[0].get("delta", {})
                                    content = delta.get("content")
                                    if content:
                                        yield content
                            except json.JSONDecodeError:
                                continue

        except Exception as exc:
            logger.error(f"OpenAI-compatible streaming error ({exc}) connecting to {self.endpoint_url}")
            yield f"\n\n[Connection Error: Failed to connect to '{self.model_name}' at {self.endpoint_url} ({str(exc)}). Please check that your LLM provider is running and reachable.]"


class LocalDeterministicLLM(LLMProvider):
    """
    Offline local streaming token generator.
    Synthesizes a coherent, grounded response from the provided context chunks.
    Ensures tests and offline runs stream tokens naturally without requiring third-party API keys.
    """

    async def astream(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.2,
    ) -> AsyncGenerator[str, None]:
        system_content = next((m["content"] for m in messages if m.get("role") == "system"), "")
        user_query = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")

        # Extract excerpts from system prompt
        context_body = ""
        if "=== DOCUMENT CONTEXT EXCERPTS ===" in system_content:
            context_body = system_content.split("=== DOCUMENT CONTEXT EXCERPTS ===")[1].split("================================")[0].strip()

        if not context_body:
            response_text = (
                f"I searched the active documents for '{user_query}', but no relevant content was found matching your query."
            )
        else:
            chunk_ids = re.findall(r"\[ID:\s*([a-zA-Z0-9_\-]+)\]", context_body)

            lines = [l.strip() for l in context_body.split("\n") if l.strip() and not l.startswith("--- Chunk")]
            key_excerpt = " ".join(lines[:6]) if lines else "Document excerpts were located."
            if len(key_excerpt) > 500:
                key_excerpt = key_excerpt[:500] + "..."

            cite_tag = f" [doc:{chunk_ids[0]}]" if chunk_ids else ""

            response_text = (
                f"Based on the provided document context regarding **{user_query}**:\n\n"
                f"{key_excerpt}{cite_tag}\n\n"
                f"*(Grounded directly in the retrieved document chunks)*"
            )

        # Stream words/tokens with slight realistic pacing
        tokens = []
        for word in response_text.split(" "):
            tokens.append(word + " ")

        for tok in tokens:
            await asyncio.sleep(0.01)
            yield tok


class LLMService:
    """Singleton service to access configured streaming LLM."""

    _instance: Optional["LLMService"] = None

    def __init__(self, provider: Optional[LLMProvider] = None):
        if provider:
            self.provider = provider
        else:
            self.provider = self._resolve_runtime_env_provider()

    @staticmethod
    def _resolve_runtime_env_provider() -> LLMProvider:
        """
        Dynamically resolve LLM provider from runtime environment variables (12-factor / Secrets Manager).
        Falls back to LocalDeterministicLLM when no environment variables are provided.
        """
        env_key = settings.LLM_API_KEY.strip() or settings.OPENAI_API_KEY.strip()
        env_provider = settings.LLM_PROVIDER.strip().lower()

        if env_key:
            base_url = settings.LLM_BASE_URL.strip() or "https://api.openai.com/v1"
            model = settings.LLM_MODEL.strip() or "gpt-4o-mini"
            logger.info(f"Initializing LLM from runtime environment secrets: {model} at {base_url}")
            return OpenAICompatibleLLM(base_url=base_url, model_name=model, api_key=env_key)

        if settings.NVIDIA_API_KEY.strip() and not settings.NVIDIA_API_KEY.startswith("nvapi-your"):
            base_url = settings.LLM_BASE_URL.strip() or "https://integrate.api.nvidia.com/v1"
            model = settings.LLM_MODEL.strip() or "meta/llama-3.2-3b-instruct"
            logger.info(f"Initializing NVIDIA NIM via OpenAI spec from runtime secrets: {model}")
            return OpenAICompatibleLLM(base_url=base_url, model_name=model, api_key=settings.NVIDIA_API_KEY.strip())

        if env_provider == "ollama":
            base_url = settings.LLM_BASE_URL.strip() or "http://localhost:11434/v1"
            model = settings.LLM_MODEL.strip() or "llama3.2"
            logger.info(f"Initializing Ollama from runtime environment: {model} at {base_url}")
            return OpenAICompatibleLLM(base_url=base_url, model_name=model, api_key="ollama")

        logger.info("Initializing Local Deterministic Streaming LLM (Offline fallback).")
        return LocalDeterministicLLM()

    def configure(
        self,
        provider: str,
        base_url: Optional[str] = None,
        model_name: Optional[str] = None,
        api_key: Optional[str] = None,
    ) -> None:
        """Dynamically configure the active LLM provider."""
        provider = (provider or "auto").lower()

        if provider in ["ollama", "openai", "custom", "nvidia"]:
            if provider == "nvidia":
                url = base_url or "https://integrate.api.nvidia.com/v1"
                model = model_name or "meta/llama-3.2-3b-instruct"
            elif provider == "ollama":
                url = base_url or "http://localhost:11434/v1"
                model = model_name or "llama3.2"
            else:
                url = base_url or "https://api.openai.com/v1"
                model = model_name or "gpt-4o-mini"

            logger.info(f"Configuring OpenAI-compatible LLM: {model} at {url}")
            self.provider = OpenAICompatibleLLM(
                base_url=url,
                model_name=model,
                api_key=api_key or ("ollama" if provider == "ollama" else ""),
            )
        elif provider == "local":
            logger.info("Configuring Local Deterministic LLM synthesizer.")
            self.provider = LocalDeterministicLLM()
        else:
            # "auto" -> fallback to runtime env resolution
            self.provider = self._resolve_runtime_env_provider()

    @classmethod
    def get_instance(cls) -> "LLMService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
