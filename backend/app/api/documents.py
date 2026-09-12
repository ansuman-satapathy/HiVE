import os
import hashlib
import aiofiles
from uuid import UUID
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status, BackgroundTasks, Query
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.document import Document
from app.schemas.document import DocumentResponse, DocumentUploadResponse
from app.db.repositories.document_repo import DocumentRepository
from app.services.ingestion_worker import IngestionWorker
from app.core.config import settings

router = APIRouter(prefix="/documents", tags=["Documents"])

SUPPORTED_EXTENSIONS = {".pdf", ".md", ".txt"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB limit

@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Stream upload a document (PDF, Markdown, TXT), verify its SHA-256 hash,
    and dispatch an asynchronous background task to extract content.
    """
    filename = file.filename or "unnamed_document"
    _, ext = os.path.splitext(filename)
    ext = ext.lower()

    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed formats: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    # Temporary write path while streaming and hashing
    file_type = ext.lstrip(".")
    user_upload_dir = os.path.join(settings.UPLOAD_DIR, str(current_user.id))
    os.makedirs(user_upload_dir, exist_ok=True)

    hasher = hashlib.sha256()
    total_size = 0
    temp_file_path = os.path.join(user_upload_dir, f"upload_{file.filename}")

    try:
        async with aiofiles.open(temp_file_path, "wb") as out_file:
            while chunk := await file.read(64 * 1024):  # 64KB chunks
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

    # Check for deduplication: has this exact file already been uploaded and indexed by this user?
    existing_doc = await DocumentRepository.get_by_hash(db, current_user.id, sha256_hash)
    if existing_doc:
        # File is duplicate; remove temp copy
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        return DocumentUploadResponse(
            document=DocumentResponse.model_validate(existing_doc),
            is_duplicate=True,
            message="Document with identical content already exists in workspace."
        )

    # Permanent storage name: {sha256_hash}_{original_filename}
    permanent_filename = f"{sha256_hash[:12]}_{filename}"
    permanent_file_path = os.path.join(user_upload_dir, permanent_filename)
    os.replace(temp_file_path, permanent_file_path)

    # 1. Insert DB record with status=PENDING
    doc = await DocumentRepository.create_document(
        db=db,
        user_id=current_user.id,
        filename=filename,
        file_type=file_type,
        file_size_bytes=total_size,
        sha256_hash=sha256_hash,
        doc_metadata={"storage_path": permanent_file_path}
    )

    # 2. Dispatch background ingestion worker
    background_tasks.add_task(
        IngestionWorker.process_document,
        document_id=doc.id,
        file_path=permanent_file_path,
        file_type=file_type
    )

    return DocumentUploadResponse(
        document=DocumentResponse.model_validate(doc),
        is_duplicate=False,
        message="Document uploaded successfully. Background processing started."
    )

@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all workspace documents with their current processing status."""
    docs = await DocumentRepository.list_documents(db, current_user.id, skip=skip, limit=limit)
    return [DocumentResponse.model_validate(doc) for doc in docs]

@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve document details and status by ID."""
    doc = await DocumentRepository.get_by_id(db, document_id)
    if not doc or doc.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return DocumentResponse.model_validate(doc)

@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a document, cascade its chunks, and clean up physical file."""
    doc = await DocumentRepository.get_by_id(db, document_id)
    if not doc or doc.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Clean up physical file if present
    file_path = doc.doc_metadata.get("storage_path")
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass

    await DocumentRepository.delete_document(db, document_id)
    return None
