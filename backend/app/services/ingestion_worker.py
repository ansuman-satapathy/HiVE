import os
import uuid
import logging
from typing import Dict, Any, Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from app.db import database
from app.db.repositories.document_repo import DocumentRepository
from app.models.document import IngestionStatus
from app.services.parser_service import DocumentParserService

logger = logging.getLogger("ingestion_worker")

class IngestionWorker:
    """Decoupled asynchronous worker processing document ingestion jobs."""

    @classmethod
    async def process_document(
        cls,
        document_id: uuid.UUID,
        file_path: str,
        file_type: str,
        session_factory=None
    ):
        """Background pipeline executing file parsing and text extraction."""
        factory = session_factory or database.SessionLocal
        async with factory() as db:
            try:
                # 1. Update status to PARSING
                logger.info(f"Starting parsing for document {document_id}")
                await DocumentRepository.update_status(db, document_id, IngestionStatus.PARSING)

                # 2. Extract content and metadata via DocumentParserService
                parsed_data: Dict[str, Any] = DocumentParserService.parse_file(file_path, file_type)

                # 3. Update status to READY (until Chunking & Indexing in Ticket 06 & 10)
                doc = await DocumentRepository.get_by_id(db, document_id)
                if doc:
                    doc.status = IngestionStatus.READY
                    merged_meta = dict(doc.doc_metadata)
                    merged_meta.update(parsed_data.get("metadata", {}))
                    merged_meta["char_count"] = parsed_data.get("char_count", 0)
                    doc.doc_metadata = merged_meta
                    db.add(doc)
                    await db.commit()

                logger.info(f"Successfully finished ingestion for document {document_id}")

            except Exception as exc:
                logger.exception(f"Ingestion failed for document {document_id}: {exc}")
                await DocumentRepository.update_status(
                    db,
                    document_id,
                    IngestionStatus.FAILED,
                    error_message=str(exc)
                )
