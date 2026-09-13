import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from sqlmodel import select, delete
from sqlmodel.ext.asyncio.session import AsyncSession
from app.models.document import Document, DocumentChunk, IngestionStatus

class DocumentRepository:
    @staticmethod
    async def create_document(
        db: AsyncSession,
        user_id: uuid.UUID,
        filename: str,
        file_type: str,
        file_size_bytes: int,
        sha256_hash: str,
        doc_metadata: Optional[Dict[str, Any]] = None
    ) -> Document:
        """Create a new document entry with PENDING ingestion status."""
        doc = Document(
            user_id=user_id,
            filename=filename,
            file_type=file_type,
            file_size_bytes=file_size_bytes,
            sha256_hash=sha256_hash,
            status=IngestionStatus.PENDING,
            doc_metadata=doc_metadata or {},
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        return doc

    @staticmethod
    async def get_by_id(db: AsyncSession, document_id: uuid.UUID) -> Optional[Document]:
        """Fetch a document by its primary key ID."""
        statement = select(Document).where(Document.id == document_id)
        result = await db.exec(statement)
        return result.first()

    @staticmethod
    async def get_by_hash(db: AsyncSession, user_id: uuid.UUID, sha256_hash: str) -> Optional[Document]:
        """Fetch an existing document by hash to prevent duplicate parsing."""
        statement = select(Document).where(
            Document.user_id == user_id,
            Document.sha256_hash == sha256_hash,
            Document.status != IngestionStatus.FAILED
        )
        result = await db.exec(statement)
        return result.first()

    @staticmethod
    async def get_by_filename(db: AsyncSession, user_id: uuid.UUID, filename: str) -> Optional[Document]:
        """Fetch an existing document by filename to prevent duplicate filename collisions."""
        statement = select(Document).where(
            Document.user_id == user_id,
            Document.filename == filename,
            Document.status != IngestionStatus.FAILED
        )
        result = await db.exec(statement)
        return result.first()

    @staticmethod
    async def list_documents(
        db: AsyncSession,
        user_id: uuid.UUID,
        skip: int = 0,
        limit: int = 50
    ) -> List[Document]:
        """List all documents for a user ordered by most recently created."""
        statement = (
            select(Document)
            .where(Document.user_id == user_id)
            .order_by(Document.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.exec(statement)
        return result.all()

    @staticmethod
    async def list_active_ingestion_tasks(
        db: AsyncSession,
        user_id: uuid.UUID
    ) -> List[Document]:
        """List documents currently undergoing background ingestion for a user."""
        active_statuses = [
            IngestionStatus.PENDING,
            IngestionStatus.PARSING,
            IngestionStatus.CHUNKING,
            IngestionStatus.INDEXING,
        ]
        statement = (
            select(Document)
            .where(
                Document.user_id == user_id,
                Document.status.in_(active_statuses)
            )
            .order_by(Document.created_at.desc())
        )
        result = await db.exec(statement)
        return result.all()

    @staticmethod
    async def list_recent_completed(
        db: AsyncSession,
        user_id: uuid.UUID,
        limit: int = 5
    ) -> List[Document]:
        """List recent completed or failed documents for a user."""
        finished_statuses = [
            IngestionStatus.READY,
            IngestionStatus.FAILED,
        ]
        statement = (
            select(Document)
            .where(
                Document.user_id == user_id,
                Document.status.in_(finished_statuses)
            )
            .order_by(Document.updated_at.desc())
            .limit(limit)
        )
        result = await db.exec(statement)
        return result.all()

    @staticmethod
    async def update_status(
        db: AsyncSession,
        document_id: uuid.UUID,
        status: IngestionStatus,
        error_message: Optional[str] = None,
        chunk_count: Optional[int] = None,
        token_count: Optional[int] = None
    ) -> Optional[Document]:
        """Update the pipeline status of a document."""
        doc = await DocumentRepository.get_by_id(db, document_id)
        if not doc:
            return None

        doc.status = status
        doc.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        if error_message is not None:
            doc.error_message = error_message
        if chunk_count is not None:
            doc.chunk_count = chunk_count
        if token_count is not None:
            doc.token_count = token_count

        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        return doc

    @staticmethod
    async def add_chunks(
        db: AsyncSession,
        document_id: uuid.UUID,
        chunks_data: List[Dict[str, Any]]
    ) -> List[DocumentChunk]:
        """Bulk insert semantic chunks for a document."""
        chunks = [
            DocumentChunk(
                document_id=document_id,
                chunk_index=item["chunk_index"],
                content=item["content"],
                token_count=item.get("token_count", 0),
                chunk_metadata=item.get("chunk_metadata", {})
            )
            for item in chunks_data
        ]
        for chunk in chunks:
            db.add(chunk)
        await db.commit()
        return chunks

    @staticmethod
    async def get_chunks_for_document(
        db: AsyncSession,
        document_id: uuid.UUID,
        skip: int = 0,
        limit: int = 100
    ) -> List[DocumentChunk]:
        """Get sorted chunks for an indexed document."""
        statement = (
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document_id)
            .order_by(DocumentChunk.chunk_index.asc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.exec(statement)
        return result.all()

    @staticmethod
    async def delete_document(db: AsyncSession, document_id: uuid.UUID) -> bool:
        """Delete a document and cascade delete its chunks."""
        doc = await DocumentRepository.get_by_id(db, document_id)
        if not doc:
            return False
        await db.delete(doc)
        await db.commit()
        return True
