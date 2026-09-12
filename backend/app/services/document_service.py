import os
import hashlib
import aiofiles
from uuid import UUID
from typing import Tuple, Optional
from fastapi import UploadFile, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.user import User
from app.models.document import Document
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
