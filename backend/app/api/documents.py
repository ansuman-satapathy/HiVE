from uuid import UUID
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, status, BackgroundTasks, Query
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.schemas.document import (
    DocumentResponse,
    DocumentUploadResponse,
    DocumentChunkResponse,
    IngestionQueueResponse,
)
from app.db.repositories.document_repo import DocumentRepository
from app.services.document_service import DocumentService


router = APIRouter(prefix="/documents", tags=["Documents"])


@router.get("/queue", response_model=IngestionQueueResponse)
async def get_ingestion_queue(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await DocumentService.get_queue_status(db, current_user.id)


@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    doc, is_duplicate, message = await DocumentService.handle_upload(
        file=file,
        user=current_user,
        db=db,
        background_tasks=background_tasks
    )
    return DocumentUploadResponse(
        document=DocumentResponse.model_validate(doc),
        is_duplicate=is_duplicate,
        message=message
    )


@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    docs = await DocumentRepository.list_documents(db, current_user.id, skip=skip, limit=limit)
    return [DocumentResponse.model_validate(doc) for doc in docs]



@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    doc = await DocumentService.get_user_document(db, current_user.id, document_id)
    return DocumentResponse.model_validate(doc)


@router.get("/{document_id}/chunks", response_model=List[DocumentChunkResponse])
async def get_document_chunks(
    document_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await DocumentService.get_user_document(db, current_user.id, document_id)
    chunks = await DocumentRepository.get_chunks_for_document(db, document_id, skip=skip, limit=limit)
    return [DocumentChunkResponse.model_validate(c) for c in chunks]


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await DocumentService.delete_user_document(db, current_user.id, document_id)
    return None

