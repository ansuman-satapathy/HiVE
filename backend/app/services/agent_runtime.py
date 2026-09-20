import re
import json
import time
import logging
from typing import AsyncGenerator, Dict, Any, List, Optional
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.user import User
from app.schemas.chat import ChatStreamRequest
from app.services.llm_service import LLMService, SYSTEM_PROMPT_TEMPLATE
from app.services.agent_tools import ToolDispatcher

logger = logging.getLogger("agent_runtime")

# ── Prompts ──────────────────────────────────────────────────────────────────

# Conversational patterns that need no doc search
_CONVERSATIONAL_RE = re.compile(
    r"^(hi|hello|hey|thanks|thank you|thx|bye|goodbye|ok|okay|sure|"
    r"good|great|awesome|nice|cool|got it|i see|understood|yes|no|yep|nope|"
    r"what (is|are) you|who are you|what can you do|help me|what do you do)"
    r"[\s!?.]*$",
    re.IGNORECASE,
)


def _is_conversational(query: str) -> bool:
    q = query.strip()
    if len(q) < 4:
        return True
    return bool(_CONVERSATIONAL_RE.match(q))


class AgentRuntime:
    """
    Streamlined pipeline: Search → Stream.

    Performance design:
    - Conversational queries → single direct LLM call (no search).
    - Document queries       → vector search (fast) → single streaming LLM synthesis.

    This avoids the 2-3× LLM call overhead of a full ReAct decision loop.
    The reasoning timeline is still populated from the search step so the UI
    looks the same as before.
    """

    def __init__(self, max_iterations: int = 4):
        # max_iterations kept for API compatibility but not used in the fast path
        self.max_iterations = max_iterations
        self.dispatcher = ToolDispatcher()

    async def run_agent_loop(
        self,
        req: ChatStreamRequest,
        current_user: User,
        db: AsyncSession,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Yields SSE event dicts:
          status / thought / tool_call / tool_result / context / token / done
        """
        start_time = time.monotonic()
        llm_service = LLMService.get_instance()

        # ── Fast path: conversational query ─────────────────────────────────
        if _is_conversational(req.query):
            yield {"type": "status", "data": {"stage": "generation", "message": "Thinking..."}}
            yield {"type": "context", "data": {"citations": [], "total_chunks": 0}}

            direct_messages = [
                {
                    "role": "system",
                    "content": (
                        "You are QuickDesk AI, a helpful document assistant. "
                        "Answer the user's conversational message briefly and naturally."
                    ),
                }
            ]
            if req.messages:
                for m in req.messages[-4:]:
                    direct_messages.append({"role": m.role, "content": m.content})
            direct_messages.append({"role": "user", "content": req.query})

            async for token in llm_service.provider.astream(direct_messages, temperature=0.7):
                yield {"type": "token", "data": {"delta": token}}

            elapsed_ms = int((time.monotonic() - start_time) * 1000)
            yield {
                "type": "done",
                "data": {"finish_reason": "stop", "total_steps": 0, "elapsed_ms": elapsed_ms},
            }
            return

        # ── Document query: Search → Stream ──────────────────────────────────
        # Step 1: resolve document scope
        target_docs: Optional[List[str]] = None
        if req.document_ids is not None:
            clean = [str(d).strip() for d in req.document_ids if str(d).strip()]
            if clean:
                target_docs = clean
        elif req.document_id:
            s = str(req.document_id).strip()
            if s:
                target_docs = [s]

        tool_input = {
            "query": req.query,
            "document_ids": target_docs,
            "top_k": req.top_k,
            "window_size": req.window_size,
        }

        # Emit reasoning timeline events (no LLM call needed for these)
        thought = f"Searching knowledge base for: \"{req.query}\""
        yield {"type": "status", "data": {"stage": "searching", "message": "Searching documents..."}}
        yield {"type": "thought", "data": {"thought": thought, "iteration": 1}}
        yield {
            "type": "tool_call",
            "data": {"tool": "search_knowledge_base", "tool_input": tool_input, "iteration": 1},
        }

        # Step 2: execute vector search (fast — milliseconds)
        tool_res = await self.dispatcher.execute_tool(
            name="search_knowledge_base",
            db=db,
            user_id=current_user.id,
            tool_input=tool_input,
        )

        citations: List[Dict[str, Any]] = tool_res.get("citations", [])

        yield {
            "type": "tool_result",
            "data": {
                "tool": "search_knowledge_base",
                "summary": tool_res.get("summary", "Search complete."),
                "citations": citations,
                "iteration": 1,
            },
        }
        yield {"type": "context", "data": {"citations": citations, "total_chunks": len(citations)}}

        # Step 3: stream synthesis — ONE LLM call, real streaming
        yield {"type": "status", "data": {"stage": "generation", "message": "Composing answer..."}}

        context_text = tool_res.get("context_text", tool_res.get("summary", ""))
        if not context_text:
            context_text = "No relevant context excerpts found."

        synthesis_system = SYSTEM_PROMPT_TEMPLATE.format(context_text=context_text)
        synthesis_messages: List[Dict[str, str]] = [
            {"role": "system", "content": synthesis_system}
        ]
        if req.messages:
            for m in req.messages[-4:]:
                synthesis_messages.append({"role": m.role, "content": m.content})
        synthesis_messages.append({"role": "user", "content": req.query})

        async for token in llm_service.provider.astream(synthesis_messages, temperature=req.temperature):
            yield {"type": "token", "data": {"delta": token}}

        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        yield {
            "type": "done",
            "data": {"finish_reason": "stop", "total_steps": 1, "elapsed_ms": elapsed_ms},
        }
