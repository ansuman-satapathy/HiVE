import json
import uuid
import logging
from typing import AsyncGenerator, List, Dict, Any, Optional
from fastapi import Request
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.user import User
from app.models.document import Document
from app.schemas.chat import ChatStreamRequest, CitationChunk
from app.services.bm25_service import BM25IndexService
from app.services.vector_store_service import VectorStoreService
from app.services.hybrid_retriever import HybridRetriever
from app.services.reranker_service import RerankerService
from app.services.context_expansion_service import ContextExpansionService
from app.services.llm_service import LLMService, SYSTEM_PROMPT_TEMPLATE

logger = logging.getLogger("chat_stream_service")


def format_sse(event: str, data: Dict[str, Any]) -> str:
    """Format SSE frame compliant with HTML5 EventSource specification."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


class ChatStreamService:
    """
    Orchestrates end-to-end RAG retrieval, context enrichment, and SSE streaming token generation.
    Supports client disconnect detection and structured lifecycle status events.
    """

    @classmethod
    async def generate_chat_stream(
        cls,
        req: ChatStreamRequest,
        current_user: User,
        db: AsyncSession,
        request: Request,
    ) -> AsyncGenerator[str, None]:
        try:
            # ── 1. Initial Lifecycle Event ──────────────────────────────────
            yield format_sse("status", {
                "stage": "retrieval",
                "message": "Searching knowledge base across indexed documents..."
            })

            if await request.is_disconnected():
                logger.info("Client disconnected before retrieval.")
                return

            # ── 2. Determine Scope Filters ──────────────────────────────────
            target_docs: Optional[List[str]] = None
            if req.document_ids is not None:
                clean = [str(d).strip() for d in req.document_ids if str(d).strip()]
                if clean:
                    target_docs = clean
            elif req.document_id:
                s = str(req.document_id).strip()
                if s:
                    target_docs = [s]

            # ── 3. Hybrid RAG Retrieval Pipeline ────────────────────────────
            # A. Sparse BM25
            bm25 = BM25IndexService.get_instance()
            sparse_raw = bm25.search_sparse(
                query=req.query,
                top_k=req.top_k,
                document_id=target_docs
            )
            sparse_candidates = [
                {
                    "chunk_id": str(r.get("chunk_id") or r.get("id")),
                    "document_id": str(r.get("document_id")),
                    "chunk_index": r.get("chunk_index", 0),
                    "content": r.get("content", ""),
                    "token_count": r.get("token_count", 0),
                    "chunk_metadata": r.get("chunk_metadata", {}),
                    "bm25_score": round(float(r.get("bm25_score", 0.0)), 4),
                }
                for r in sparse_raw
            ]

            # B. Dense Vector
            vstore = VectorStoreService.get_instance()
            dense_raw = vstore.search_dense(
                query=req.query,
                top_k=req.top_k,
                document_id=target_docs
            )
            dense_candidates = [
                {
                    "chunk_id": str(r.get("chunk_id") or r.get("id")),
                    "document_id": str(r.get("document_id")),
                    "chunk_index": r.get("chunk_index", 0),
                    "content": r.get("content", ""),
                    "token_count": r.get("token_count", 0),
                    "chunk_metadata": r.get("chunk_metadata", {}),
                    "score": round(float(r.get("score", 0.0)), 4),
                }
                for r in dense_raw
            ]

            # C. Hybrid RRF Fusion
            hybrid_candidates = HybridRetriever.reciprocal_rank_fusion(
                dense_results=dense_candidates,
                sparse_results=sparse_candidates,
                k=60
            )[:req.top_k]

            # D. Cross-Encoder Rerank
            reranker = RerankerService.get_instance()
            rerank_out = await reranker.rerank_candidates(
                query=req.query,
                candidates=hybrid_candidates,
                top_k=req.top_k
            )
            ranked_chunks = rerank_out.get("results", [])

            if await request.is_disconnected():
                logger.info("Client disconnected during retrieval rerank.")
                return

            # ── 4. Enrich Context with Metadata & Titles ────────────────────
            doc_ids_set = {r.get("document_id") for r in ranked_chunks if r.get("document_id")}
            doc_title_map: Dict[str, str] = {}
            if doc_ids_set:
                try:
                    uuid_list = [uuid.UUID(did) for did in doc_ids_set if did]
                    docs_stmt = select(Document).where(Document.id.in_(uuid_list))
                    docs_res = await db.exec(docs_stmt)
                    for d in docs_res.all():
                        doc_title_map[str(d.id)] = d.filename
                except Exception as e:
                    logger.warning(f"Failed to lookup document titles: {e}")

            # ── 5. Context Expansion (Small-to-Big) ─────────────────────────
            context_blocks: List[str] = []
            citations: List[Dict[str, Any]] = []

            for item in ranked_chunks:
                c_id_str = item.get("chunk_id")
                d_id_str = str(item.get("document_id", ""))
                doc_title = doc_title_map.get(d_id_str, "Document")
                chunk_index = item.get("chunk_index", 0)
                base_content = item.get("content", "")
                relevance = item.get("rerank_score") or item.get("score") or item.get("rrf_score")

                expanded_content = base_content
                if req.window_size > 0 and c_id_str:
                    try:
                        exp_res = await ContextExpansionService.expand_chunk_context(
                            db=db,
                            chunk_id=uuid.UUID(c_id_str),
                            window_size=req.window_size,
                            user_id=current_user.id
                        )
                        expanded_content = exp_res.expanded_text or base_content
                    except Exception as err:
                        logger.debug(f"Context expansion skipped for chunk {c_id_str}: {err}")

                context_blocks.append(
                    f"--- Chunk {chunk_index} [ID: {c_id_str}] from [{doc_title}] ---\n{expanded_content}\n"
                )

                citations.append({
                    "chunk_id": c_id_str,
                    "document_id": d_id_str,
                    "document_title": doc_title,
                    "chunk_index": chunk_index,
                    "content": base_content,
                    "token_count": item.get("token_count", 0),
                    "active_heading": (item.get("chunk_metadata") or {}).get("active_heading"),
                    "relevance_score": round(float(relevance), 4) if relevance is not None else None,
                })

            # Emit Context / Citations Event
            yield format_sse("context", {
                "citations": citations,
                "document_ids": list(doc_ids_set),
                "total_chunks": len(citations),
            })

            if await request.is_disconnected():
                logger.info("Client disconnected before token synthesis.")
                return

            # ── 6. LLM Token Synthesis ─────────────────────────────────────
            yield format_sse("status", {
                "stage": "generation",
                "message": "Generating answer..."
            })

            full_context_text = "\n".join(context_blocks) if context_blocks else "No relevant context excerpts found."
            system_prompt = SYSTEM_PROMPT_TEMPLATE.format(context_text=full_context_text)

            # Construct message sequence
            llm_messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

            # Append multi-turn history if present
            if req.messages:
                for prev_msg in req.messages[-6:]:  # Keep recent turns
                    llm_messages.append({
                        "role": prev_msg.role,
                        "content": prev_msg.content
                    })

            # Append current query
            llm_messages.append({"role": "user", "content": req.query})

            llm_service = LLMService.get_instance()
            token_count = 0

            async for token in llm_service.provider.astream(llm_messages, temperature=req.temperature):
                if await request.is_disconnected():
                    logger.info("Client disconnected during active token stream. Terminating.")
                    return
                token_count += 1
                yield format_sse("token", {"delta": token})

            # ── 7. Final Done Event ─────────────────────────────────────────
            yield format_sse("done", {
                "finish_reason": "stop",
                "total_tokens": token_count,
            })

        except Exception as exc:
            logger.error(f"Error in chat stream pipeline: {exc}", exc_info=True)
            yield format_sse("error", {
                "error": str(exc),
                "message": "An error occurred while streaming response."
            })
