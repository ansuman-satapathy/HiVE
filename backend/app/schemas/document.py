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
    duplicate_type: Optional[str] = None  # "content" | "name" | None
    message: str


class BatchUploadItemDetail(BaseModel):
    filename: str
    status: str  # "uploaded" | "duplicate" | "failed"
    is_duplicate: bool = False
    duplicate_type: Optional[str] = None  # "content" | "name" | None
    message: str
    document_id: Optional[UUID] = None


class BatchDocumentUploadResponse(BaseModel):
    total_uploaded: int
    successful_count: int
    duplicate_count: int
    failed_count: int
    documents: List[DocumentResponse]
    details: List[BatchUploadItemDetail] = []
    messages: List[str]

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


class DenseSearchResult(BaseModel):
    chunk_id: UUID
    document_id: UUID
    chunk_index: int
    content: str
    token_count: int
    chunk_metadata: Dict[str, Any]
    score: float


class HybridSearchResult(BaseModel):
    chunk_id: UUID
    document_id: UUID
    chunk_index: int
    content: str
    token_count: int
    chunk_metadata: Dict[str, Any]
    rrf_score: float
    dense_rank: Optional[int] = None
    sparse_rank: Optional[int] = None
    dense_score: Optional[float] = None
    bm25_score: Optional[float] = None


class RerankedSearchResult(BaseModel):
    chunk_id: UUID
    document_id: UUID
    chunk_index: int
    content: str
    token_count: int
    chunk_metadata: Dict[str, Any]
    rerank_score: float
    initial_rrf_score: Optional[float] = None
    dense_rank: Optional[int] = None
    sparse_rank: Optional[int] = None
    dense_score: Optional[float] = None
    bm25_score: Optional[float] = None


class RerankResponse(BaseModel):
    query: str
    results: List[RerankedSearchResult]
    latency_ms: float
    reranker_used: str
    fallback_triggered: bool


