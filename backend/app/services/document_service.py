import os
import hashlib
import aiofiles
import logging
from uuid import UUID
from typing import Tuple, Optional, List, Dict, Any
from fastapi import UploadFile, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.user import User
from app.models.document import Document, IngestionStatus
from app.db.repositories.document_repo import DocumentRepository
from app.services.ingestion_worker import IngestionWorker
from app.core.config import settings

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".pdf", ".md", ".txt", ".docx", ".doc", ".csv", ".xlsx", ".xls"}
MAX_FILE_SIZE = 50 * 1024 * 1024
MAX_FILES_PER_BATCH = 10


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
        background_tasks,
        seen_filenames: Optional[set] = None,
        seen_hashes: Optional[set] = None,
    ) -> Tuple[Document, bool, Optional[str], str]:
        """
        Handle a single file upload with comprehensive duplicate validation:
        1. Name duplicates (exact filename already in user's workspace or earlier in this batch)
        2. Content duplicates (sha256 hash matches an existing processed document or earlier in this batch)
        Returns: (doc, is_duplicate, duplicate_type, message)
        """
        filename = file.filename or "unnamed_document"
        file_type = cls.validate_file_extension(filename)

        # In-batch duplicate filename check
        if seen_filenames is not None:
            if filename in seen_filenames:
                logger.info(f"Duplicate filename detected in batch for user {user.id}: {filename}")
                existing = await DocumentRepository.get_by_filename(db, user.id, filename)
                return (
                    existing,
                    True,
                    "name",
                    f"'{filename}' was duplicated within this upload batch."
                )
            seen_filenames.add(filename)

        # Existing workspace filename check
        existing_by_name = await DocumentRepository.get_by_filename(db, user.id, filename)
        if existing_by_name:
            logger.info(f"Document with identical filename already exists for user {user.id}: {filename}")
            return (
                existing_by_name,
                True,
                "name",
                f"A document named '{filename}' already exists in your workspace."
            )

        user_upload_dir = os.path.join(settings.UPLOAD_DIR, str(user.id))
        os.makedirs(user_upload_dir, exist_ok=True)

        hasher = hashlib.sha256()
        total_size = 0
        temp_file_path = os.path.join(user_upload_dir, f"upload_{filename}")

        try:
            async with aiofiles.open(temp_file_path, "wb") as out_file:
                while chunk := await file.read(1024 * 1024):  # 1MB buffer for high-speed streaming
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

        # In-batch duplicate content check
        if seen_hashes is not None:
            if sha256_hash in seen_hashes:
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
                logger.info(f"Duplicate content detected in batch for user {user.id}: {filename} (hash {sha256_hash[:8]})")
                existing = await DocumentRepository.get_by_hash(db, user.id, sha256_hash)
                matched_name = existing.filename if existing else filename
                return (
                    existing,
                    True,
                    "content",
                    f"Content of '{filename}' is identical to '{matched_name}' uploaded in this batch."
                )
            seen_hashes.add(sha256_hash)

        # Existing workspace content check
        existing_doc = await DocumentRepository.get_by_hash(db, user.id, sha256_hash)
        if existing_doc:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            logger.info(f"Document with identical content already exists for user {user.id}: {filename} matches {existing_doc.filename}")
            return (
                existing_doc,
                True,
                "content",
                f"Content is identical to existing document '{existing_doc.filename}' (SHA256: {sha256_hash[:8]})."
            )

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

        # Dispatch ingestion:
        # In test environments (TESTING=true), use background_tasks so ASGI test client can wait for inline execution.
        # In normal server operation (dev / prod), dispatch to parallel concurrent queue (IngestionWorker.enqueue_document)
        # so multiple documents process concurrently up to MAX_CONCURRENT_INGESTION.
        is_testing = os.getenv("TESTING", "").lower() in ("true", "1")
        if background_tasks is not None and is_testing:
            background_tasks.add_task(
                IngestionWorker.process_document,
                document_id=doc.id,
                file_path=permanent_file_path,
                file_type=file_type
            )
        else:
            IngestionWorker.enqueue_document(
                document_id=doc.id,
                file_path=permanent_file_path,
                file_type=file_type
            )

        logger.info(f"Successfully accepted new document {doc.id} ({filename}, {total_size} bytes) for ingestion.")
        return doc, False, None, "Document uploaded successfully. Background processing started."

    @classmethod
    async def handle_batch_upload(
        cls,
        files: list[UploadFile],
        user: User,
        db: AsyncSession,
        background_tasks
    ) -> dict:
        """Process up to MAX_FILES_PER_BATCH documents concurrently with duplicate reporting."""
        if not files:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No files provided for upload."
            )

        if len(files) > MAX_FILES_PER_BATCH:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum {MAX_FILES_PER_BATCH} files can be uploaded at a time. Selected: {len(files)}."
            )

        successful_docs = []
        details = []
        messages = []
        dup_count = 0
        failed_count = 0
        seen_filenames: set[str] = set()
        seen_hashes: set[str] = set()

        for upload_file in files:
            fname = upload_file.filename or "unnamed_document"
            try:
                doc, is_dup, dup_type, msg = await cls.handle_upload(
                    file=upload_file,
                    user=user,
                    db=db,
                    background_tasks=background_tasks,
                    seen_filenames=seen_filenames,
                    seen_hashes=seen_hashes,
                )
                if is_dup:
                    dup_count += 1
                    details.append({
                        "filename": fname,
                        "status": "duplicate",
                        "is_duplicate": True,
                        "duplicate_type": dup_type,
                        "message": msg,
                        "document_id": doc.id if doc else None,
                    })
                else:
                    successful_docs.append(doc)
                    details.append({
                        "filename": fname,
                        "status": "uploaded",
                        "is_duplicate": False,
                        "duplicate_type": None,
                        "message": msg,
                        "document_id": doc.id,
                    })
                messages.append(f"{fname}: {msg}")
            except HTTPException as h_err:
                failed_count += 1
                details.append({
                    "filename": fname,
                    "status": "failed",
                    "is_duplicate": False,
                    "duplicate_type": None,
                    "message": h_err.detail,
                    "document_id": None,
                })
                messages.append(f"{fname}: {h_err.detail}")
            except Exception as exc:
                failed_count += 1
                details.append({
                    "filename": fname,
                    "status": "failed",
                    "is_duplicate": False,
                    "duplicate_type": None,
                    "message": str(exc),
                    "document_id": None,
                })
                messages.append(f"{fname}: Error - {str(exc)}")

        logger.info(
            f"Batch upload summary for user {user.id}: {len(successful_docs)} uploaded, "
            f"{dup_count} duplicates skipped, {failed_count} failed."
        )

        return {
            "total_uploaded": len(files),
            "successful_count": len(successful_docs),
            "duplicate_count": dup_count,
            "failed_count": failed_count,
            "documents": successful_docs,
            "details": details,
            "messages": messages,
        }

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
    async def delete_user_documents_batch(
        cls,
        db: AsyncSession,
        user_id: UUID,
        document_ids: List[UUID]
    ) -> dict:
        """Batch delete user documents, removing local files, BM25 indices, vector embeddings, and DB rows."""
        from app.services.bm25_service import BM25IndexService
        from app.services.vector_store_service import VectorStoreService

        bm25_service = BM25IndexService.get_instance()
        vector_service = VectorStoreService.get_instance()

        # Bulk fetch all requested documents in single query
        docs = await DocumentRepository.get_documents_by_ids(db, user_id, document_ids)
        doc_map = {d.id: d for d in docs}

        deleted_ids = []
        failed_ids = []

        for doc_id in document_ids:
            doc = doc_map.get(doc_id)
            if not doc:
                failed_ids.append(doc_id)
                continue

            try:
                # Abort in-flight background ingestion worker if actively processing
                from app.services.ingestion_worker import IngestionWorker
                IngestionWorker.cancel_document(doc_id)

                file_path = doc.doc_metadata.get("storage_path") if doc.doc_metadata else None
                if file_path and os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                    except OSError:
                        pass

                await db.delete(doc)
                bm25_service.remove_document_chunks(doc_id)
                vector_service.delete_document_chunks(doc_id)
                deleted_ids.append(doc_id)
            except Exception as e:
                logger.error(f"Failed to delete document {doc_id} in batch: {e}")
                failed_ids.append(doc_id)

        if deleted_ids:
            await db.commit()

        return {
            "deleted_count": len(deleted_ids),
            "deleted_ids": deleted_ids,
            "failed_ids": failed_ids,
        }

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

