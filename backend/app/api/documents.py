from uuid import UUID
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, status, BackgroundTasks, Query
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.schemas.document import (
    DocumentResponse,
    DocumentListResponse,
    BatchDeleteRequest,
    BatchDeleteResponse,
    DocumentUploadResponse,
    BatchDocumentUploadResponse,
    DocumentChunkResponse,
    IngestionQueueResponse,
    SparseSearchResult,
    DenseSearchResult,
    HybridSearchResult,
    RerankResponse,
    ExpandedContextResult,
)
from app.db.repositories.document_repo import DocumentRepository
from app.services.document_service import DocumentService
from app.services.bm25_service import BM25IndexService
from app.services.vector_store_service import VectorStoreService
from app.services.hybrid_retriever import HybridRetriever
from app.services.reranker_service import RerankerService


router = APIRouter(prefix="/documents", tags=["Documents"])


@router.get("/search/sparse", response_model=List[SparseSearchResult])
async def search_sparse_chunks(
    q: str = Query(..., min_length=1, description="Keywords or error code to search"),
    top_k: int = Query(5, ge=1, le=50),
    document_id: UUID = Query(None, description="Optional document ID filter"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Ticket 09: Lexical keyword search over indexed chunks using BM25.
    Returns top matching chunks with exact BM25 scores.
    """
    if document_id:
        await DocumentService.get_user_document(db, current_user.id, document_id)

    bm25_service = BM25IndexService.get_instance()
    results = bm25_service.search_sparse(query=q, top_k=top_k, document_id=document_id)
    return results


@router.get("/search/dense", response_model=List[DenseSearchResult])
async def search_dense_chunks(
    q: str = Query(..., min_length=1, description="Semantic text query to search"),
    top_k: int = Query(5, ge=1, le=50),
    document_id: UUID = Query(None, description="Optional document ID filter"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Ticket 10: Semantic dense vector search over indexed chunks using ChromaDB.
    Returns top semantically matching chunks with cosine similarity scores.
    """
    if document_id:
        await DocumentService.get_user_document(db, current_user.id, document_id)

    vector_store = VectorStoreService.get_instance()
    results = vector_store.search_dense(query=q, top_k=top_k, document_id=document_id)
    return results


@router.get("/search/hybrid", response_model=List[HybridSearchResult])
async def search_hybrid_chunks(
    q: str = Query(..., min_length=1, description="Query text to search using dense vector + sparse BM25 fusion"),
    top_k: int = Query(10, ge=1, le=50),
    document_id: UUID = Query(None, description="Optional document ID filter"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Ticket 11: Hybrid retrieval engine using Reciprocal Rank Fusion (RRF).
    Fuses dense semantic similarity (ChromaDB) and sparse lexical keywords (BM25Plus)
    to return top candidate chunks with rrf_score and individual system ranks.
    """
    if document_id:
        await DocumentService.get_user_document(db, current_user.id, document_id)

    retriever = HybridRetriever.get_instance()
    results = await retriever.retrieve(query=q, top_candidates=top_k, document_id=document_id)
    return results


@router.get("/search/rerank", response_model=RerankResponse)
async def search_rerank_chunks(
    q: str = Query(..., min_length=1, description="Query text for hybrid retrieval and cross-encoder reranking"),
    top_k: int = Query(5, ge=1, le=20, description="Final number of top reranked chunks to return"),
    top_candidates: int = Query(25, ge=5, le=100, description="Number of hybrid candidates to retrieve for reranking"),
    document_id: UUID = Query(None, description="Optional document ID filter"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Ticket 12: Cross-Encoder Reranker Stage.
    Retrieves top_candidates from Hybrid Retrieval (dense vector + sparse BM25 with RRF),
    then applies a Cross-Encoder to compute deep all-to-all cross-attention relevance scores,
    returning the top_k most relevant chunks alongside latency telemetry and used provider.
    """
    if document_id:
        await DocumentService.get_user_document(db, current_user.id, document_id)

    # 1. Stage 1: Candidate generation with Hybrid Retrieval (RRF)
    retriever = HybridRetriever.get_instance()
    candidates = await retriever.retrieve(
        query=q,
        top_candidates=top_candidates,
        document_id=document_id,
    )

    # 2. Stage 2: High precision Cross-Encoder Reranking
    reranker = RerankerService.get_instance()
    rerank_result = await reranker.rerank_candidates(
        query=q,
        candidates=candidates,
        top_k=top_k,
    )

    return rerank_result


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
    doc, is_duplicate, duplicate_type, message = await DocumentService.handle_upload(
        file=file,
        user=current_user,
        db=db,
        background_tasks=background_tasks
    )
    return DocumentUploadResponse(
        document=DocumentResponse.model_validate(doc),
        is_duplicate=is_duplicate,
        duplicate_type=duplicate_type,
        message=message
    )


@router.post("/upload-batch", response_model=BatchDocumentUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_documents_batch(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload up to 10 documents simultaneously (.pdf, .md, .txt, .docx, .csv, .xlsx).
    Validates maximum 50MB per file and kicks off parallel background ingestion.
    """
    res = await DocumentService.handle_batch_upload(
        files=files,
        user=current_user,
        db=db,
        background_tasks=background_tasks
    )
    return BatchDocumentUploadResponse(
        total_uploaded=res["total_uploaded"],
        successful_count=res["successful_count"],
        duplicate_count=res["duplicate_count"],
        failed_count=res["failed_count"],
        documents=[DocumentResponse.model_validate(d) for d in res["documents"]],
        details=res.get("details", []),
        messages=res["messages"],
    )


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    page: int = Query(1, ge=1, description="Page number starting at 1"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    q: str = Query(None, description="Search query by document filename"),
    file_type: str = Query(None, description="Filter by file type (e.g., pdf, md, docx)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List indexed documents with server-side pagination, search by filename, and format filtering.
    """
    import math
    skip = (page - 1) * page_size
    docs, total = await DocumentRepository.list_documents(
        db=db,
        user_id=current_user.id,
        skip=skip,
        limit=page_size,
        q=q,
        file_type=file_type
    )
    stats = await DocumentRepository.get_user_stats(db, current_user.id)
    total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1

    return DocumentListResponse(
        items=[DocumentResponse.model_validate(doc) for doc in docs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        total_chunks=stats["total_chunks"],
        total_tokens=stats["total_tokens"],
    )


@router.post("/batch-delete", response_model=BatchDeleteResponse)
async def batch_delete_documents(
    payload: BatchDeleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Batch delete multiple documents and cascade remove their chunks, vector embeddings, and BM25 index.
    """
    res = await DocumentService.delete_user_documents_batch(
        db=db,
        user_id=current_user.id,
        document_ids=payload.document_ids
    )
    return BatchDeleteResponse(
        deleted_count=res["deleted_count"],
        deleted_ids=res["deleted_ids"],
        failed_ids=res["failed_ids"]
    )


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


@router.post("/chunks/{chunk_id}/expand", response_model=ExpandedContextResult)
async def expand_chunk_context(
    chunk_id: UUID,
    window_size: int = Query(1, ge=0, le=5, description="Number of sibling chunks to expand on left and right"),
    max_tokens: Optional[int] = Query(None, ge=50, le=8000, description="Optional token budget ceiling"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Ticket 13: Context Expansion & Parent Document Enrichment.
    Expands a granular chunk's context window by fetching adjacent sibling chunks
    and merging them into a seamless, deduplicated text payload for LLM prompts.
    """
    from app.services.context_expansion_service import ContextExpansionService
    return await ContextExpansionService.expand_chunk_context(
        db=db,
        chunk_id=chunk_id,
        window_size=window_size,
        max_tokens=max_tokens,
        user_id=current_user.id
    )


@router.post("/{document_id}/retry", response_model=DocumentResponse)
async def retry_document(
    document_id: UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retry a failed document ingestion pipeline from scratch.
    Purges stale chunks/indices and re-enqueues the file for background processing.
    """
    doc = await DocumentService.retry_document_ingestion(
        db=db,
        user_id=current_user.id,
        document_id=document_id,
        background_tasks=background_tasks
    )
    return DocumentResponse.model_validate(doc)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await DocumentService.delete_user_document(db, current_user.id, document_id)
    return None

