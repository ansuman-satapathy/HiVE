import json
import logging
from typing import AsyncGenerator, Dict, Any
from fastapi import Request
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.user import User
from app.schemas.chat import ChatStreamRequest
from app.services.agent_runtime import AgentRuntime

logger = logging.getLogger("chat_stream_service")


def format_sse(event: str, data: Dict[str, Any]) -> str:
    """Format SSE frame compliant with HTML5 EventSource specification."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


class ChatStreamService:
    """
    Orchestrates end-to-end ReAct agent reasoning loop, tool execution,
    context grounding, and SSE streaming token generation.
    Supports client disconnect detection and structured lifecycle status events.
    """

    @classmethod
    async def generate_chat_stream(
        cls,
        req: ChatStreamRequest,
        current_user: User,
        db: AsyncSession,
        request: Request,
    ) -> AsyncGenerator[str, None]:
        try:
            # Initial Lifecycle Event
            yield format_sse("status", {
                "stage": "agent_reasoning",
                "message": "Initializing agent reasoning loop..."
            })

            if await request.is_disconnected():
                logger.info("Client disconnected before agent loop execution.")
                return

            agent_runtime = AgentRuntime(max_iterations=4)
            async for event in agent_runtime.run_agent_loop(
                req=req,
                current_user=current_user,
                db=db,
            ):
                if await request.is_disconnected():
                    logger.info("Client disconnected during active agent stream. Terminating.")
                    return

                event_type = event.get("type", "message")
                event_data = event.get("data", {})
                yield format_sse(event_type, event_data)

        except Exception as exc:
            logger.error(f"Error in chat stream pipeline: {exc}", exc_info=True)
            yield format_sse("error", {
                "error": str(exc),
                "message": "An error occurred while streaming response."
            })
