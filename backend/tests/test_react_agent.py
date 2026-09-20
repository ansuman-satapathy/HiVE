import uuid
import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.user import User
from app.schemas.chat import ChatStreamRequest
from app.services.agent_tools import SearchKnowledgeBaseTool, ToolDispatcher
from app.services.agent_runtime import AgentRuntime
from tests.conftest import create_test_user


@pytest.mark.asyncio
async def test_tool_dispatcher_registry():
    dispatcher = ToolDispatcher()
    tool = dispatcher.get_tool("search_knowledge_base")
    assert tool is not None
    assert tool.name == "search_knowledge_base"
    assert "search_knowledge_base" in dispatcher.get_tools_description()


@pytest.mark.asyncio
async def test_search_knowledge_base_empty_query(db_session: AsyncSession):
    user = await create_test_user(db_session, "agent_tool_user@example.com")
    tool = SearchKnowledgeBaseTool()
    res = await tool.execute(db=db_session, user_id=user.id, query="   ")
    assert "Empty search query" in res["summary"]
    assert res["citations"] == []


@pytest.mark.asyncio
async def test_react_agent_runtime_loop(db_session: AsyncSession):
    user = await create_test_user(db_session, "agent_runtime_user@example.com")
    runtime = AgentRuntime(max_iterations=3)
    req = ChatStreamRequest(query="What are the key concepts in the document?", top_k=2)

    events = []
    async for ev in runtime.run_agent_loop(req=req, current_user=user, db=db_session):
        events.append(ev)

    event_types = [e["type"] for e in events]
    # Verify thought, tool execution, and token generation occurred
    assert "thought" in event_types
    assert "tool_call" in event_types
    assert "tool_result" in event_types
    assert "token" in event_types
    assert "done" in event_types
