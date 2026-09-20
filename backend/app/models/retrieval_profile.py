import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON

class RetrievalProfile(SQLModel, table=True):
    __tablename__: str = "retrieval_profiles"

    id: Optional[uuid.UUID] = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False,
    )
    user_id: Optional[uuid.UUID] = Field(
        default=None,
        foreign_key="users.id",
        nullable=True,
        index=True,
    )
    name: str = Field(nullable=False, index=True)
    description: Optional[str] = Field(default=None, nullable=True)
    
    # Core RAG Hyperparameters
    top_k: int = Field(default=5, nullable=False)
    rrf_k: int = Field(default=60, nullable=False)
    window_size: int = Field(default=1, nullable=False)
    temperature: float = Field(default=0.2, nullable=False)
    
    # Pre-scoped Document IDs (optional list of UUID strings)
    document_ids: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False)
    )
    
    is_system_default: bool = Field(default=False, nullable=False, index=True)

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        nullable=False,
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        nullable=False,
    )
