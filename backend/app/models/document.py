import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, List, Dict, Any
from sqlmodel import SQLModel, Field, Relationship, AutoString
from sqlalchemy import Column, JSON

class IngestionStatus(str, Enum):
    PENDING = "pending"
    PARSING = "parsing"
    CHUNKING = "chunking"
    INDEXING = "indexing"
    READY = "ready"
    FAILED = "failed"

class Document(SQLModel, table=True):
    __tablename__: str = "documents"

    id: Optional[uuid.UUID] = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False
    )
    user_id: uuid.UUID = Field(
        foreign_key="users.id",
        nullable=False,
        index=True
    )
    filename: str = Field(nullable=False)
    file_type: str = Field(nullable=False)  # "pdf", "md", "txt", "csv", "xlsx"
    file_size_bytes: int = Field(nullable=False)
    sha256_hash: str = Field(index=True, nullable=False)
    
    status: IngestionStatus = Field(
        default=IngestionStatus.PENDING,
        sa_type=AutoString,
        nullable=False,
        index=True
    )
    error_message: Optional[str] = Field(default=None, nullable=True)
    
    # Metadata & Stats
    chunk_count: int = Field(default=0, nullable=False)
    token_count: int = Field(default=0, nullable=False)
    doc_metadata: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False)
    )

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        nullable=False
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        nullable=False
    )

    # Relationships
    chunks: List["DocumentChunk"] = Relationship(
        back_populates="document",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )

class DocumentChunk(SQLModel, table=True):
    __tablename__: str = "document_chunks"

    id: Optional[uuid.UUID] = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False
    )
    document_id: uuid.UUID = Field(
        foreign_key="documents.id",
        nullable=False,
        index=True
    )
    chunk_index: int = Field(nullable=False, index=True)
    content: str = Field(nullable=False)
    token_count: int = Field(default=0, nullable=False)
    
    # Context breadcrumbs (e.g. {"section": "API Reference > Authentication", "page": 3})
    chunk_metadata: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False)
    )

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        nullable=False
    )

    # Relationship back to parent document
    document: Optional[Document] = Relationship(back_populates="chunks")
