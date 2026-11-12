import re
import time
import logging
from typing import AsyncGenerator, Dict, Any, List, Optional
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.user import User
from app.schemas.chat import ChatStreamRequest
from app.services.llm_service import LLMService, SYSTEM_PROMPT_TEMPLATE, HYBRID_SYSTEM_PROMPT_TEMPLATE
from app.services.agent_tools import ToolDispatcher

logger = logging.getLogger("agent_runtime")

# ── Conversational short-circuit ─────────────────────────────────────────────

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


# ── CRAG: context quality grading ────────────────────────────────────────────

# Minimum number of non-trivial tokens the retrieved context must contain for
# it to be considered "sufficient" before CRAG kicks in.
_CRAG_MIN_CONTEXT_TOKENS = 80

# Common stop-words excluded from query-term coverage calculation.
_STOP_WORDS = frozenset({
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "in", "on", "at", "to", "for", "of", "and", "or", "but", "not",
    "with", "as", "by", "from", "about", "into", "through", "between",
    "what", "which", "who", "how", "when", "where", "why",
    "this", "that", "these", "those", "it", "its",
})


def _grade_context(query: str, context_text: str, citations: List[Dict]) -> float:
    """
    Heuristic context relevance score in [0, 1].

    Three signals:
      1. Volume — does the context contain enough content at all?
      2. Query term coverage — what fraction of meaningful query words appear
         in the retrieved context?
      3. Citation depth — did we find multiple distinct chunks?

    Returns a float: 0.0 (completely irrelevant) -> 1.0 (highly relevant).

    Design note: a lightweight heuristic is intentional here. A second LLM
    call just to grade relevance would double latency and cost. The heuristic
    correctly identifies the two failure modes that CRAG needs to fix:
    (a) the retrieval found nothing, (b) the retrieved text shares almost no
    vocabulary with the query.
    """
    if not context_text or not context_text.strip():
        return 0.0

    # Signal 1: Volume (how much text did we get back?)
    token_estimate = len(context_text.split())
    volume_score = min(1.0, token_estimate / _CRAG_MIN_CONTEXT_TOKENS)

    # Signal 2: Query term coverage
    query_tokens = {
        w.lower().strip(".,!?;:")
        for w in query.split()
        if w.lower().strip(".,!?;:") and w.lower().strip(".,!?;:") not in _STOP_WORDS
    }
    if query_tokens:
        ctx_lower = context_text.lower()
        matched = sum(1 for t in query_tokens if t in ctx_lower)
        coverage_score = matched / len(query_tokens)
    else:
        coverage_score = volume_score  # nothing meaningful in query to compare

    # Signal 3: Citation depth (did we get real diverse chunks?)
    citation_score = min(1.0, len(citations) / 3.0)

    # If coverage is zero (no query terms appear in context at all), heavily
    # penalise — high-volume but off-topic text should not pass the CRAG gate.
    if query_tokens and coverage_score == 0.0:
        volume_score *= 0.3

    score = (0.4 * volume_score) + (0.4 * coverage_score) + (0.2 * citation_score)
    return round(score, 3)


def _rewrite_query(original_query: str) -> str:
    """
    Produce an alternative search query when the first retrieval scores poorly.

    Strategy: strip filler question phrasing, expand known abbreviations, reorder
    key terms to surface the most specific noun phrases first.

    Deterministic — no extra LLM call. Handles the most common failure case:
    queries phrased as full natural-language questions don't match technical
    document vocabulary as well as a terse keyword form does.
    """
    q = re.sub(
        r"^(what is|what are|how (do|does|can)|explain|describe|tell me about|"
        r"give me|show me|list|define|summarize|summarise)\s+",
        "",
        original_query.strip(),
        flags=re.IGNORECASE,
    )
    q = re.sub(r"[?.!]+$", "", q).strip()
    q = " ".join(q.split())
    if not q or q.lower() == original_query.lower().strip():
        q = original_query.strip().rstrip("?")
    return q if q else original_query


# Scores below this threshold trigger a corrective query rewrite + re-retrieval.
# Tuned: scores < 0.35 reliably correspond to "almost no overlap between query
# vocabulary and retrieved content".
_CRAG_THRESHOLD = 0.35


# ── AgentRuntime ─────────────────────────────────────────────────────────────

class AgentRuntime:
    """
    Document Q&A pipeline implementing Corrective RAG (CRAG).

    Three execution paths:

    1. Conversational  - greetings, follow-ups -> single direct LLM call, no search.
    2. Document + good context - hybrid search returns relevant chunks -> stream synthesis.
    3. Document + poor context (CRAG) - first search returns weak results -> rewrite
       query -> search again -> stream synthesis from the better context.

    CRAG reference: Shi et al. 2024 - https://arxiv.org/abs/2401.15884

    Performance notes:
    - Only ONE LLM call is ever made (synthesis streaming).
    - The CRAG grade is a heuristic (no second LLM call), so the corrective path
      adds only one extra vector search (~50ms) rather than a full round-trip.
    """

    def __init__(self, max_iterations: int = 4):
        self.max_iterations = max_iterations  # kept for API compatibility
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
        
        # Resolve active LLM provider (supports dynamic per-message model switching, custom timeouts, and thinking)
        active_llm = None
        target_model = None
        try:
            from app.models.workspace_setting import WorkspaceSetting
            from sqlmodel import select
            stmt = select(WorkspaceSetting)
            exec_res = await db.exec(stmt)
            setting_row = exec_res.first() if hasattr(exec_res, "first") else None
            if setting_row and hasattr(setting_row, "models_list") and isinstance(setting_row.models_list, list):
                # 1. Match requested model_id
                if getattr(req, "model_id", None) and isinstance(req.model_id, str):
                    for m in setting_row.models_list:
                        if isinstance(m, dict) and (m.get("id") == req.model_id or m.get("model_name") == req.model_id):
                            target_model = m
                            break
                # 2. Match active model
                if not target_model:
                    for m in setting_row.models_list:
                        if isinstance(m, dict) and m.get("is_active"):
                            target_model = m
                            break
                # 3. Fallback to first configured model
                if not target_model and setting_row.models_list:
                    target_model = setting_row.models_list[0]

            if target_model and isinstance(target_model, dict):
                p = target_model.get("provider", "openai")
                timeout_val = float(target_model.get("timeout_seconds") or 180.0)
                enable_thinking = bool(target_model.get("enable_thinking", False))
                if p in ["ollama", "openai", "nvidia", "custom"]:
                    from app.services.llm_service import OpenAICompatibleLLM
                    active_llm = OpenAICompatibleLLM(
                        base_url=target_model.get("base_url") or ("http://localhost:11434/v1" if p == "ollama" else "https://api.openai.com/v1"),
                        model_name=target_model.get("model_name") or target_model.get("id") or "llama3.2",
                        api_key=target_model.get("api_key") or ("ollama" if p == "ollama" else getattr(setting_row, "decrypted_api_key", None) or ""),
                        timeout=timeout_val,
                        enable_thinking=enable_thinking,
                    )
                elif p == "local":
                    from app.services.llm_service import LocalDeterministicLLM
                    active_llm = LocalDeterministicLLM()
        except Exception as e:
            logger.warning(f"Failed to resolve custom model {req.model_id}: {e}")

        if not active_llm:
            active_llm = LLMService.get_instance().provider

        # ── Path 1: Conversational short-circuit ────────────────────────────
        if _is_conversational(req.query):
            yield {"type": "status", "data": {"stage": "generation", "message": "Thinking..."}}
            yield {"type": "context", "data": {"citations": [], "total_chunks": 0}}

            direct_messages = [
                {
                    "role": "system",
                    "content": (
                        "You are HiVE, a helpful assistant. "
                        "Answer conversational messages briefly and directly."
                    ),
                }
            ]
            if req.messages:
                for m in req.messages[-4:]:
                    direct_messages.append({"role": m.role, "content": m.content})
            direct_messages.append({"role": "user", "content": req.query})

            async for chunk in active_llm.astream(direct_messages, temperature=0.7):
                if isinstance(chunk, dict) and chunk.get("type") == "thought":
                    yield {"type": "thought_stream", "data": {"delta": chunk.get("delta", "")}}
                else:
                    text_delta = chunk.get("delta", "") if isinstance(chunk, dict) else str(chunk)
                    yield {"type": "token", "data": {"delta": text_delta}}

            elapsed_ms = int((time.monotonic() - start_time) * 1000)
            yield {
                "type": "done",
                "data": {"finish_reason": "stop", "total_steps": 0, "elapsed_ms": elapsed_ms},
            }
            return

        # ── Path 2 & 3: Document query ───────────────────────────────────────
        target_docs: Optional[List[str]] = None
        if req.document_ids is not None:
            clean = [str(d).strip() for d in req.document_ids if str(d).strip()]
            if clean:
                target_docs = clean
        elif req.document_id:
            s = str(req.document_id).strip()
            if s:
                target_docs = [s]

        # ── Step 1: Initial retrieval ────────────────────────────────────────
        active_query = req.query
        tool_input = {
            "query": active_query,
            "document_ids": target_docs,
            "top_k": req.top_k,
            "window_size": req.window_size,
        }

        yield {"type": "status", "data": {"stage": "searching", "message": "Searching documents..."}}
        yield {"type": "thought", "data": {
            "thought": f'Searching knowledge base for: "{active_query}"',
            "iteration": 1,
        }}
        yield {"type": "tool_call", "data": {
            "tool": "search_knowledge_base",
            "tool_input": tool_input,
            "iteration": 1,
        }}

        tool_res = await self.dispatcher.execute_tool(
            name="search_knowledge_base",
            db=db,
            user_id=current_user.id,
            tool_input=tool_input,
        )

        citations: List[Dict[str, Any]] = tool_res.get("citations", [])
        context_text: str = tool_res.get("context_text", tool_res.get("summary", ""))

        yield {"type": "tool_result", "data": {
            "tool": "search_knowledge_base",
            "summary": tool_res.get("summary", "Search complete."),
            "citations": citations,
            "iteration": 1,
        }}

        # ── Step 2: CRAG — grade context quality ────────────────────────────
        relevance_score = _grade_context(active_query, context_text, citations)
        logger.info(
            f"CRAG grade for '{active_query[:60]}': score={relevance_score:.3f} "
            f"threshold={_CRAG_THRESHOLD} chunks={len(citations)}"
        )

        total_steps = 1
        used_query = active_query

        if relevance_score < _CRAG_THRESHOLD:
            # Context insufficient — rewrite query and search once more.
            rewritten = _rewrite_query(active_query)
            logger.info(
                f"CRAG triggered (score={relevance_score}). "
                f"Rewriting: '{active_query}' -> '{rewritten}'"
            )

            corrective_input = {
                "query": rewritten,
                "document_ids": target_docs,
                "top_k": req.top_k,
                "window_size": req.window_size,
            }

            yield {"type": "status", "data": {
                "stage": "searching",
                "message": "Refining search with rewritten query...",
            }}
            yield {"type": "thought", "data": {
                "thought": (
                    f"Retrieved context scored {relevance_score:.2f} — below threshold. "
                    f'Rewriting query to: "{rewritten}"'
                ),
                "iteration": 2,
                "crag": True,
            }}
            yield {"type": "tool_call", "data": {
                "tool": "search_knowledge_base",
                "tool_input": corrective_input,
                "iteration": 2,
                "crag": True,
            }}

            corrective_res = await self.dispatcher.execute_tool(
                name="search_knowledge_base",
                db=db,
                user_id=current_user.id,
                tool_input=corrective_input,
            )

            corrective_citations = corrective_res.get("citations", [])
            corrective_context = corrective_res.get("context_text", corrective_res.get("summary", ""))
            corrective_score = _grade_context(rewritten, corrective_context, corrective_citations)

            yield {"type": "tool_result", "data": {
                "tool": "search_knowledge_base",
                "summary": corrective_res.get("summary", "Corrective search complete."),
                "citations": corrective_citations,
                "iteration": 2,
                "crag": True,
            }}

            # Use whichever result set scored higher
            if corrective_score >= relevance_score and corrective_context:
                citations = corrective_citations
                context_text = corrective_context
                used_query = rewritten
                logger.info(f"CRAG: using corrective context (score={corrective_score:.3f}).")
            else:
                logger.info(f"CRAG: keeping original context (corrective score={corrective_score:.3f}).")

            total_steps = 2

        # In hybrid mode, if retrieved context scored very low (< 0.15), the query is unrelated to
        # the uploaded documents (e.g., coding, general knowledge). Clear irrelevant context so the
        # model is not distracted by irrelevant documents and does not attach false citations.
        is_hybrid = getattr(req, "grounding_mode", "hybrid") == "hybrid"
        best_score = max(relevance_score, corrective_score if total_steps > 1 else 0.0)
        if is_hybrid and best_score < 0.15:
            citations = []
            context_text = "No relevant context excerpts found in uploaded documents. Answer using general AI knowledge."
            logger.info("Hybrid mode: query appears unrelated to uploaded documents; cleared irrelevant context.")

        yield {"type": "context", "data": {"citations": citations, "total_chunks": len(citations)}}

        # ── Step 3: Synthesis — one streaming LLM call ───────────────────────
        yield {"type": "status", "data": {"stage": "generation", "message": "Composing answer..."}}

        if not context_text:
            context_text = "No relevant context excerpts found."
        elif (
            isinstance(target_model, dict)
            and (target_model.get("provider") == "ollama" or "11434" in (target_model.get("base_url") or ""))
        ):
            # Ollama /v1/chat/completions defaults to 4096 ctx; dynamically calculate available context
            # so prompt (query + context) + thinking + answer fit comfortably within 4,096 tokens.
            max_context_chars = max(1200, 7500 - len(req.query))
            if len(context_text) > max_context_chars:
                context_text = context_text[:max_context_chars].rsplit("\n", 1)[0] or context_text[:max_context_chars]

        prompt_template = (
            SYSTEM_PROMPT_TEMPLATE
            if getattr(req, "grounding_mode", "hybrid") == "strict"
            else HYBRID_SYSTEM_PROMPT_TEMPLATE
        )
        synthesis_system = prompt_template.format(context_text=context_text)
        synthesis_messages: List[Dict[str, str]] = [
            {"role": "system", "content": synthesis_system}
        ]
        if req.messages:
            for m in req.messages[-4:]:
                synthesis_messages.append({"role": m.role, "content": m.content})
        synthesis_messages.append({"role": "user", "content": req.query})

        async for chunk in active_llm.astream(synthesis_messages, temperature=req.temperature):
            if isinstance(chunk, dict) and chunk.get("type") == "thought":
                yield {"type": "thought_stream", "data": {"delta": chunk.get("delta", "")}}
            else:
                text_delta = chunk.get("delta", "") if isinstance(chunk, dict) else str(chunk)
                yield {"type": "token", "data": {"delta": text_delta}}

        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        yield {
            "type": "done",
            "data": {
                "finish_reason": "stop",
                "total_steps": total_steps,
                "elapsed_ms": elapsed_ms,
            },
        }
