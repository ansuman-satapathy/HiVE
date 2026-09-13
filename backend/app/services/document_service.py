import os
import hashlib
import aiofiles
from uuid import UUID
from typing import Tuple, Optional
from fastapi import UploadFile, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.user import User
from app.models.document import Document, IngestionStatus
from app.db.repositories.document_repo import DocumentRepository
from app.services.ingestion_worker import IngestionWorker
from app.core.config import settings

SUPPORTED_EXTENSIONS = {".pdf", ".md", ".txt"}
MAX_FILE_SIZE = 50 * 1024 * 1024


class DocumentService:
    @staticmethod
    def validate_file_extension(filename: str) -> str:
        _, ext = os.path.splitext(filename or "")
        ext = ext.lower()
        if ext not in SUPPORTED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file format '{ext}'. Allowed formats: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
            )
        return ext.lstrip(".")

    @classmethod
    async def handle_upload(
        cls,
        file: UploadFile,
        user: User,
        db: AsyncSession,
        background_tasks
    ) -> Tuple[Document, bool, str]:
        filename = file.filename or "unnamed_document"
        file_type = cls.validate_file_extension(filename)

        user_upload_dir = os.path.join(settings.UPLOAD_DIR, str(user.id))
        os.makedirs(user_upload_dir, exist_ok=True)

        hasher = hashlib.sha256()
        total_size = 0
        temp_file_path = os.path.join(user_upload_dir, f"upload_{filename}")

        try:
            async with aiofiles.open(temp_file_path, "wb") as out_file:
                while chunk := await file.read(64 * 1024):
                    total_size += len(chunk)
                    if total_size > MAX_FILE_SIZE:
                        raise HTTPException(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail=f"File exceeds maximum allowed size of {MAX_FILE_SIZE // (1024*1024)}MB."
                        )
                    hasher.update(chunk)
                    await out_file.write(chunk)
        except Exception as exc:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            if isinstance(exc, HTTPException):
                raise exc
            raise HTTPException(status_code=500, detail=f"Failed to stream upload: {str(exc)}")

        sha256_hash = hasher.hexdigest()

        existing_doc = await DocumentRepository.get_by_hash(db, user.id, sha256_hash)
        if existing_doc:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            return existing_doc, True, "Document with identical content already exists in workspace."

        permanent_filename = f"{sha256_hash[:12]}_{filename}"
        permanent_file_path = os.path.join(user_upload_dir, permanent_filename)
        os.replace(temp_file_path, permanent_file_path)

        doc = await DocumentRepository.create_document(
            db=db,
            user_id=user.id,
            filename=filename,
            file_type=file_type,
            file_size_bytes=total_size,
            sha256_hash=sha256_hash,
            doc_metadata={"storage_path": permanent_file_path}
        )

        background_tasks.add_task(
            IngestionWorker.process_document,
            document_id=doc.id,
            file_path=permanent_file_path,
            file_type=file_type
        )

        return doc, False, "Document uploaded successfully. Background processing started."

    @staticmethod
    async def get_user_document(db: AsyncSession, user_id: UUID, document_id: UUID) -> Document:
        doc = await DocumentRepository.get_by_id(db, document_id)
        if not doc or doc.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        return doc

    @classmethod
    async def delete_user_document(cls, db: AsyncSession, user_id: UUID, document_id: UUID) -> None:
        doc = await cls.get_user_document(db, user_id, document_id)

        file_path = doc.doc_metadata.get("storage_path")
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass

        await DocumentRepository.delete_document(db, document_id)
        from app.services.bm25_service import BM25IndexService
        BM25IndexService.get_instance().remove_document_chunks(document_id)
        from app.services.vector_store_service import VectorStoreService
        VectorStoreService.get_instance().delete_document_chunks(document_id)

    @classmethod
    async def get_queue_status(cls, db: AsyncSession, user_id: UUID) -> dict:
        """Fetch active ingestion queue telemetry and recent completed tasks for user."""
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        active_docs = await DocumentRepository.list_active_ingestion_tasks(db, user_id)
        recent_docs = await DocumentRepository.list_recent_completed(db, user_id, limit=8)

        def to_task_dict(doc: Document) -> dict:
            elapsed = 0.0
            if doc.created_at:
                end_time = doc.updated_at if doc.status in (IngestionStatus.READY, IngestionStatus.FAILED) else now
                elapsed = max(0.0, (end_time - doc.created_at).total_seconds())
            return {
                "id": doc.id,
                "filename": doc.filename,
                "file_type": doc.file_type,
                "file_size_bytes": doc.file_size_bytes,
                "status": doc.status,
                "chunk_count": doc.chunk_count,
                "token_count": doc.token_count,
                "error_message": doc.error_message,
                "created_at": doc.created_at,
                "updated_at": doc.updated_at,
                "elapsed_seconds": round(elapsed, 1),
            }

        return {
            "active_count": len(active_docs),
            "active_tasks": [to_task_dict(d) for d in active_docs],
            "recent_completed": [to_task_dict(d) for d in recent_docs],
        }

