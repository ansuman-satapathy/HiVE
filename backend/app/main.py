import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.auth import router as auth_router
from app.api.documents import router as documents_router
from app.api.ws import router as ws_router
from app.db.database import engine

logger = logging.getLogger("main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up BM25 index from existing ready document chunks
    try:
        from app.db.database import SessionLocal
        from app.models.document import DocumentChunk, Document, IngestionStatus
        from app.services.bm25_service import BM25IndexService
        from sqlmodel import select

        async with SessionLocal() as db:
            statement = (
                select(DocumentChunk)
                .join(Document)
                .where(Document.status == IngestionStatus.READY)
            )
            res = await db.exec(statement)
            chunks = res.all()
            if chunks:
                BM25IndexService.get_instance().index_chunks([
                    {
                        "id": c.id,
                        "document_id": c.document_id,
                        "chunk_index": c.chunk_index,
                        "content": c.content,
                        "token_count": c.token_count,
                        "chunk_metadata": c.chunk_metadata,
                    }
                    for c in chunks
                ])
        # Resume any documents that were interrupted mid-ingestion
        import asyncio
        from app.services.ingestion_worker import IngestionWorker

        async def resume_interrupted_documents():
            try:
                async with SessionLocal() as db:
                    unprocessed = (
                        await db.exec(
                            select(Document).where(
                                Document.status.in_([
                                    IngestionStatus.PENDING,
                                    IngestionStatus.PARSING,
                                    IngestionStatus.CHUNKING,
                                    IngestionStatus.INDEXING,
                                ])
                            ).order_by(Document.created_at.asc())
                        )
                    ).all()
                    for doc in unprocessed:
                        storage_path = doc.doc_metadata.get("storage_path") if doc.doc_metadata else None
                        if storage_path and os.path.exists(storage_path):
                            logger.info(f"Auto-resuming interrupted ingestion for '{doc.filename}' ({doc.id})")
                            IngestionWorker.enqueue_document(doc.id, storage_path, doc.file_type)
            except Exception as resume_err:
                logger.warning(f"Error during startup document auto-resume: {resume_err}")

        asyncio.create_task(resume_interrupted_documents())
    except Exception as e:
        import logging
        logging.getLogger("main").warning(f"Could not warm BM25 index on startup: {e}")

    yield
    await engine.dispose()

app = FastAPI(
    title="DocAgent Runtime API",
    description="Autonomous Document Intelligence & Agentic RAG Platform",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(ws_router)

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "docagent-api",
        "version": "0.2.0",
    }
