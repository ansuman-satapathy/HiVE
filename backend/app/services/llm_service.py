import asyncio
import logging
from typing import AsyncGenerator, List, Dict, Any, Optional
from abc import ABC, abstractmethod

from app.core.config import settings

logger = logging.getLogger("llm_service")


SYSTEM_PROMPT_TEMPLATE = """You are QuickDesk AI, an expert, concise, and helpful document intelligence assistant.
Answer the user's question accurately using ONLY the provided document context excerpts below.
If the excerpts do not contain sufficient facts to answer the question, clearly state that the provided documents do not contain the answer.

CRITICAL CITATION RULES:
1. Every factual sentence or claim MUST end with an inline citation tag: `[doc:CHUNK_ID]`.
2. Extract the exact CHUNK_ID from the chunk header: `--- Chunk X [ID: CHUNK_ID] from [FILENAME] ---`.
3. Example: "To configure the reverse proxy, edit /etc/nginx/sites-available/default and set proxy_pass to port 8000 [doc:CHUNK_ID]."
4. Never invent chunk IDs. Only use chunk IDs present in the excerpts below.
5. If multiple chunks support a claim, append each: `[doc:CHUNK_ID_1][doc:CHUNK_ID_2]`.

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


class NVIDIAStreamingLLM(LLMProvider):
    """
    Streaming LLM provider backed by NVIDIA NIM API (e.g., Llama 3.2 11B / 70B).
    Falls back gracefully to LocalDeterministicLLM on connection or quota failure.
    """

    def __init__(self, api_key: str, model_name: Optional[str] = None):
        self.api_key = api_key
        self.model_name = model_name or settings.NVIDIA_MODEL
        self._fallback = LocalDeterministicLLM()

    async def astream(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.2,
    ) -> AsyncGenerator[str, None]:
        try:
            from langchain_nvidia_ai_endpoints import ChatNVIDIA
            from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

            chat = ChatNVIDIA(
                api_key=self.api_key,
                model=self.model_name,
                temperature=temperature,
            )

            lc_messages = []
            for m in messages:
                role = m.get("role", "user")
                content = m.get("content", "")
                if role == "system":
                    lc_messages.append(SystemMessage(content=content))
                elif role == "assistant":
                    lc_messages.append(AIMessage(content=content))
                else:
                    lc_messages.append(HumanMessage(content=content))

            async for chunk in chat.astream(lc_messages):
                content = chunk.content
                if content:
                    yield content

        except Exception as exc:
            logger.warning(f"NVIDIA Chat streaming error ({exc}); falling back to local synthesizer.")
            async for chunk in self._fallback.astream(messages, temperature):
                yield chunk


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
        # Extract system prompt context and user prompt
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
            # Extract key lines and chunk IDs from the context to synthesize a concise grounded answer
            import re
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
            await asyncio.sleep(0.015)
            yield tok


class LLMService:
    """Singleton service to access configured streaming LLM."""

    _instance: Optional["LLMService"] = None

    def __init__(self):
        if settings.NVIDIA_API_KEY and settings.NVIDIA_API_KEY.strip() and not settings.NVIDIA_API_KEY.startswith("nvapi-your"):
            logger.info(f"Initializing NVIDIA Chat LLM: {settings.NVIDIA_MODEL}")
            self.provider: LLMProvider = NVIDIAStreamingLLM(
                api_key=settings.NVIDIA_API_KEY,
                model_name=settings.NVIDIA_MODEL,
            )
        else:
            logger.info("Initializing Local Deterministic Streaming LLM (No API key set).")
            self.provider = LocalDeterministicLLM()

    @classmethod
    def get_instance(cls) -> "LLMService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        cls._instance = None
