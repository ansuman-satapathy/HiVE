import os
import uuid
import logging
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

                parsed_data: Dict[str, Any] = DocumentParserService.parse_file(file_path, file_type)
                text_content = parsed_data.get("text", "")

                await DocumentRepository.update_status(db, document_id, IngestionStatus.CHUNKING)

                chunker = StructureAwareChunker()
                chunks_data = chunker.chunk_document(
                    text=text_content,
                    document_title=parsed_data.get("metadata", {}).get("detected_title")
                )

                if chunks_data:
                    await DocumentRepository.add_chunks(db, document_id, chunks_data)

                total_tokens = sum(c["token_count"] for c in chunks_data)
                doc = await DocumentRepository.get_by_id(db, document_id)
                if doc:
                    doc.status = IngestionStatus.READY
                    doc.chunk_count = len(chunks_data)
                    doc.token_count = total_tokens
                    merged_meta = dict(doc.doc_metadata)
                    merged_meta.update(parsed_data.get("metadata", {}))
                    merged_meta["char_count"] = parsed_data.get("char_count", 0)
                    doc.doc_metadata = merged_meta
                    db.add(doc)
                    await db.commit()

                logger.info(f"Ingestion completed for document {document_id}: {len(chunks_data)} chunks, {total_tokens} tokens")

            except Exception as exc:
                logger.exception(f"Ingestion failed for document {document_id}: {exc}")
                await DocumentRepository.update_status(
                    db,
                    document_id,
                    IngestionStatus.FAILED,
                    error_message=str(exc)
                )
