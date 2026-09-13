from datetime import datetime
from uuid import UUID
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict
from app.models.document import IngestionStatus

class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    filename: str
    file_type: str
    file_size_bytes: int
    sha256_hash: str
    status: IngestionStatus
    error_message: Optional[str] = None
    chunk_count: int
    token_count: int
    doc_metadata: Dict[str, Any]
    created_at: datetime
    updated_at: datetime

class DocumentUploadResponse(BaseModel):
    document: DocumentResponse
    is_duplicate: bool = False
    message: str

class DocumentChunkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    chunk_index: int
    content: str
    token_count: int
    chunk_metadata: Dict[str, Any]
    created_at: datetime

class IngestionTaskItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    filename: str
    file_type: str
    file_size_bytes: int
    status: IngestionStatus
    chunk_count: int
    token_count: int
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    elapsed_seconds: float

class IngestionQueueResponse(BaseModel):
    active_count: int
    active_tasks: List[IngestionTaskItem]
    recent_completed: List[IngestionTaskItem]

class SparseSearchResult(BaseModel):
    chunk_id: UUID
    document_id: UUID
    chunk_index: int
    content: str
    token_count: int
    chunk_metadata: Dict[str, Any]
    bm25_score: float


