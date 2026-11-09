"""
Tests for CRAG (Corrective RAG) logic in agent_runtime.py.

Verifies:
  - _grade_context returns 0.0 for empty context
  - _grade_context scores high when query terms appear in context
  - _grade_context scores low when context is unrelated
  - _rewrite_query strips natural-language question phrasing
  - AgentRuntime emits a corrective thought/tool_call when score is below threshold
  - AgentRuntime skips the corrective step when context is already sufficient
"""
import uuid
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.agent_runtime import (
    _grade_context,
    _rewrite_query,
    _CRAG_THRESHOLD,
    AgentRuntime,
)


# ── _grade_context ────────────────────────────────────────────────────────────

def test_grade_context_empty_returns_zero():
    score = _grade_context("database deadlock", "", [])
    assert score == 0.0


def test_grade_context_none_returns_zero():
    score = _grade_context("database deadlock", None, [])  # type: ignore[arg-type]
    assert score == 0.0


def test_grade_context_high_overlap():
    """Context that shares most query terms and has adequate volume should score high."""
    query = "database deadlock timeout retry"
    context = (
        "A database deadlock occurs when two transactions wait on each other's locks. "
        "The system uses a timeout mechanism to detect and resolve deadlocks automatically. "
        "After a deadlock is detected, the transaction will retry up to three times. "
        "Deadlock frequency is tracked in the query performance monitor."
    ) * 3  # repeat to clear the volume threshold
    citations = [{"chunk_id": str(uuid.uuid4())} for _ in range(3)]
    score = _grade_context(query, context, citations)
    assert score >= _CRAG_THRESHOLD, f"Expected >= {_CRAG_THRESHOLD}, got {score}"


def test_grade_context_low_overlap():
    """Context about an unrelated topic should score below the CRAG threshold."""
    query = "database deadlock timeout retry"
    context = (
        "The company was founded in 1998 in San Francisco. "
        "Our annual revenue grew by 12% last quarter. "
        "We opened three new offices in Europe."
    )
    citations = [{"chunk_id": str(uuid.uuid4())}]
    score = _grade_context(query, context, citations)
    assert score < _CRAG_THRESHOLD, f"Expected < {_CRAG_THRESHOLD}, got {score}"


def test_grade_context_volume_alone_insufficient():
    """Large volume of text that is completely off-topic should still score low."""
    query = "neural network backpropagation gradient"
    context = "apple orange banana " * 200  # high volume, zero relevance
    citations = []
    score = _grade_context(query, context, citations)
    assert score < _CRAG_THRESHOLD


def test_grade_context_citation_depth_contributes():
    """More citations should boost score slightly."""
    query = "token authentication JWT"
    context = "JWT token authentication is used for secure API access. " * 5
    few_citations = [{"chunk_id": str(uuid.uuid4())}]
    many_citations = [{"chunk_id": str(uuid.uuid4())} for _ in range(5)]
    score_few = _grade_context(query, context, few_citations)
    score_many = _grade_context(query, context, many_citations)
    assert score_many >= score_few


# ── _rewrite_query ────────────────────────────────────────────────────────────

def test_rewrite_strips_what_is():
    result = _rewrite_query("What is the refund policy?")
    assert "what is" not in result.lower()
    assert "refund policy" in result.lower()


def test_rewrite_strips_how_does():
    result = _rewrite_query("How does the authentication flow work?")
    assert "how does" not in result.lower()
    assert "authentication" in result.lower()


def test_rewrite_strips_explain():
    result = _rewrite_query("Explain the neural network architecture")
    assert "explain" not in result.lower()
    assert "neural network architecture" in result.lower()


def test_rewrite_strips_trailing_question_mark():
    result = _rewrite_query("What are the boundary conditions?")
    assert not result.endswith("?")


def test_rewrite_handles_already_terse_query():
    """Terse keyword queries should pass through without mangling."""
    result = _rewrite_query("JWT token expiry")
    assert "JWT" in result or "jwt" in result.lower()


def test_rewrite_does_not_return_empty():
    result = _rewrite_query("What is?")
    assert len(result) > 0


# ── AgentRuntime CRAG integration ─────────────────────────────────────────────

def _make_fake_tool_result(context: str, n_citations: int = 2):
    citations = [
        {
            "chunk_id": str(uuid.uuid4()),
            "document_id": str(uuid.uuid4()),
            "document_title": "Test Doc",
            "chunk_index": i,
            "content": context,
            "token_count": 50,
        }
        for i in range(n_citations)
    ]
    return {
        "summary": f"Retrieved {n_citations} chunks.",
        "citations": citations,
        "context_text": context,
    }


async def _collect_events(runtime, req, user, db):
    events = []
    async for event in runtime.run_agent_loop(req, user, db):
        events.append(event)
    return events


@pytest.fixture
def fake_user():
    user = MagicMock()
    user.id = uuid.uuid4()
    return user


@pytest.fixture
def fake_db():
    return AsyncMock()


@pytest.fixture
def fake_req():
    req = MagicMock()
    req.query = "database deadlock timeout"
    req.document_ids = None
    req.document_id = None
    req.top_k = 5
    req.window_size = 1
    req.temperature = 0.2
    req.messages = []
    return req


@pytest.mark.asyncio
async def test_crag_not_triggered_when_context_good(fake_req, fake_user, fake_db):
    """When first retrieval scores above threshold, no corrective step is emitted."""
    good_context = (
        "Database deadlock occurs when two processes hold locks and wait for each other. "
        "A timeout is used to detect and kill one of the transactions to resolve the deadlock."
    ) * 5

    good_result = _make_fake_tool_result(good_context, n_citations=3)

    runtime = AgentRuntime()

    async def fake_stream(messages, temperature=0.2):
        yield "answer"
    async def fake_execute(**kwargs):
        return good_result

    with patch.object(runtime.dispatcher, "execute_tool", new=AsyncMock(side_effect=fake_execute)):
        with patch("app.services.agent_runtime.LLMService") as mock_llm_cls:
            mock_llm = MagicMock()
            mock_llm.provider.astream = fake_stream
            mock_llm_cls.get_instance.return_value = mock_llm

            events = await _collect_events(runtime, fake_req, fake_user, fake_db)

    types = [e["type"] for e in events]
    iterations = [e["data"].get("iteration") for e in events if e["type"] == "tool_call"]

    # Only one tool call (iteration 1), no corrective step
    assert iterations == [1], f"Expected [1], got {iterations}"
    assert "token" in types
    assert "done" in types

    done_event = next(e for e in events if e["type"] == "done")
    assert done_event["data"]["total_steps"] == 1


@pytest.mark.asyncio
async def test_crag_triggered_when_context_poor(fake_req, fake_user, fake_db):
    """When first retrieval is off-topic, a corrective iteration must be emitted."""
    # First result: completely unrelated to 'database deadlock timeout'
    poor_context = "The company was founded in 1998. Revenue grew 12% last quarter."
    poor_result = _make_fake_tool_result(poor_context, n_citations=1)

    # Corrective result: relevant
    good_context = (
        "Database deadlock timeout occurs when transactions wait too long for a lock. "
        "The deadlock detection algorithm kills one transaction to resolve the cycle."
    ) * 4
    good_result = _make_fake_tool_result(good_context, n_citations=3)

    call_count = {"n": 0}

    async def fake_execute(**kwargs):
        call_count["n"] += 1
        return poor_result if call_count["n"] == 1 else good_result

    runtime = AgentRuntime()

    async def fake_stream(messages, temperature=0.2):
        yield "corrected answer"

    with patch.object(runtime.dispatcher, "execute_tool", new=AsyncMock(side_effect=fake_execute)):
        with patch("app.services.agent_runtime.LLMService") as mock_llm_cls:
            mock_llm = MagicMock()
            mock_llm.provider.astream = fake_stream
            mock_llm_cls.get_instance.return_value = mock_llm

            events = await _collect_events(runtime, fake_req, fake_user, fake_db)

    tool_calls = [e for e in events if e["type"] == "tool_call"]
    iterations = [e["data"]["iteration"] for e in tool_calls]
    crag_flags = [e["data"].get("crag") for e in tool_calls]

    assert 2 in iterations, "Expected a corrective iteration=2 tool_call"
    assert True in crag_flags, "Expected crag=True on corrective tool_call"

    thoughts = [e for e in events if e["type"] == "thought"]
    crag_thoughts = [t for t in thoughts if t["data"].get("crag")]
    assert len(crag_thoughts) >= 1, "Expected a CRAG thought event"

    done_event = next(e for e in events if e["type"] == "done")
    assert done_event["data"]["total_steps"] == 2

