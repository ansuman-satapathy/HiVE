import logging
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.schemas.chat import ChatStreamRequest
from app.services.chat_stream_service import ChatStreamService

logger = logging.getLogger("chat_api")

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("/stream")
async def stream_chat_completion(
    req: ChatStreamRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Ticket 15: Server-Sent Events (SSE) streaming API for real-time document conversations.
    Emits events:
      - 'status': retrieval or generation phase updates
      - 'context': retrieved citation chunks and document metadata
      - 'token': streaming answer token deltas
      - 'done': end of generation with metrics
      - 'error': error message if generation fails
    """
    generator = ChatStreamService.generate_chat_stream(
        req=req,
        current_user=current_user,
        db=db,
        request=request,
    )

    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
