import os
import uuid
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from app.db import database
from app.db.repositories.document_repo import DocumentRepository
from app.models.document import IngestionStatus
from app.services.parser_service import DocumentParserService
from app.services.chunking_service import StructureAwareChunker

logger = logging.getLogger("ingestion_worker")

class IngestionWorker:
    @classmethod
    async def process_document(
        cls,
        document_id: uuid.UUID,
        file_path: str,
        file_type: str,
        session_factory=None
    ):
        factory = session_factory or database.SessionLocal
        async with factory() as db:
            try:
                logger.info(f"Starting parsing for document {document_id}")
                await DocumentRepository.update_status(db, document_id, IngestionStatus.PARSING)

                # Run CPU-bound parsing off the event loop
                parsed_data: Dict[str, Any] = await asyncio.to_thread(
                    DocumentParserService.parse_file, file_path, file_type
                )
                text_content = parsed_data.get("text", "")

                await DocumentRepository.update_status(db, document_id, IngestionStatus.CHUNKING)

                # Run CPU-bound chunking off the event loop
                chunker = StructureAwareChunker()
                chunks_data = await asyncio.to_thread(
                    chunker.chunk_document,
                    text=text_content,
                    document_title=parsed_data.get("metadata", {}).get("detected_title")
                )

                created_chunks = []
                if chunks_data:
                    created_chunks = await DocumentRepository.add_chunks(db, document_id, chunks_data)

                # Indexing stage (Ticket 09 BM25 Indexing & Ticket 10 Dense Vector Indexing)
                await DocumentRepository.update_status(db, document_id, IngestionStatus.INDEXING)

                if created_chunks:
                    chunk_payloads = [
                        {
                            "id": chunk.id,
                            "document_id": chunk.document_id,
                            "chunk_index": chunk.chunk_index,
                            "content": chunk.content,
                            "token_count": chunk.token_count,
                            "chunk_metadata": chunk.chunk_metadata,
                        }
                        for chunk in created_chunks
                    ]

                    # 1. Sparse lexical index (run in thread pool)
                    from app.services.bm25_service import BM25IndexService
                    await asyncio.to_thread(
                        BM25IndexService.get_instance().index_chunks, chunk_payloads
                    )

                    # 2. Dense vector index (network/CPU embedding - run in thread pool)
                    from app.services.vector_store_service import VectorStoreService
                    await asyncio.to_thread(
                        VectorStoreService.get_instance().add_chunks, chunk_payloads
                    )

                total_tokens = sum(c["token_count"] for c in chunks_data)
                doc = await DocumentRepository.get_by_id(db, document_id)
                if doc:
                    doc.status = IngestionStatus.READY
                    doc.chunk_count = len(chunks_data)
                    doc.token_count = total_tokens
                    doc.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    merged_meta = dict(doc.doc_metadata)
                    merged_meta.update(parsed_data.get("metadata", {}))
                    merged_meta["char_count"] = parsed_data.get("char_count", 0)
                    doc.doc_metadata = merged_meta
                    db.add(doc)
                    await db.commit()

                logger.info(f"Ingestion completed for document {document_id}: {len(chunks_data)} chunks, {total_tokens} tokens")

            except Exception as exc:
                logger.exception(f"Ingestion failed for document {document_id}: {exc}")
                try:
                    await db.rollback()
                except Exception:
                    pass
                try:
                    await DocumentRepository.update_status(
                        db,
                        document_id,
                        IngestionStatus.FAILED,
                        error_message=str(exc)
                    )
                except Exception as update_exc:
                    logger.error(f"Failed to record FAILED status for document {document_id}: {update_exc}")
