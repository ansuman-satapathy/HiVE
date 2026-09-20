import uuid
from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"] = Field(..., description="Role of the message sender")
    content: str = Field(..., min_length=1, description="Text content of the message")


class ChatStreamRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Current user query or prompt")
    conversation_id: Optional[str] = Field(None, description="Optional conversation session identifier")
    messages: Optional[List[ChatMessage]] = Field(default=[], description="Previous conversation turn history")
    document_ids: Optional[List[uuid.UUID]] = Field(None, description="Optional scoped document UUID filters")
    document_id: Optional[uuid.UUID] = Field(None, description="Optional single scoped document UUID")
    top_k: int = Field(5, ge=1, le=20, description="Number of context chunks to retrieve")
    window_size: int = Field(1, ge=0, le=3, description="Neighboring chunk expansion window (± chunks)")
    temperature: float = Field(0.2, ge=0.0, le=1.0, description="Sampling temperature for generation")


class CitationChunk(BaseModel):
    chunk_id: str
    document_id: str
    document_title: Optional[str] = None
    chunk_index: int
    content: str
    token_count: Optional[int] = 0
    active_heading: Optional[str] = None
    relevance_score: Optional[float] = None


class AgentToolCall(BaseModel):
    tool: str
    tool_input: Dict[str, Any]
    iteration: int


class AgentThought(BaseModel):
    thought: str
    iteration: int


class AgentToolResult(BaseModel):
    tool: str
    summary: str
    citations: List[CitationChunk] = []
    iteration: int
