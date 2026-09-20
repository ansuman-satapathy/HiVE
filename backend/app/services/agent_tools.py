import uuid
import logging
from typing import Dict, Any, List, Optional
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.document import Document
from app.schemas.chat import CitationChunk
from app.services.bm25_service import BM25IndexService
from app.services.vector_store_service import VectorStoreService
from app.services.hybrid_retriever import HybridRetriever
from app.services.reranker_service import RerankerService
from app.services.context_expansion_service import ContextExpansionService

logger = logging.getLogger("agent_tools")


class AgentTool:
    """Base class for ReAct agent tools."""
    name: str
    description: str

    async def execute(self, db: AsyncSession, user_id: uuid.UUID, **kwargs) -> Dict[str, Any]:
        raise NotImplementedError


class SearchKnowledgeBaseTool(AgentTool):
    """
    Performs hybrid BM25 + Dense vector retrieval, Cross-Encoder reranking,
    and Small-to-Big context expansion across indexed documents.
    """
    name = "search_knowledge_base"
    description = (
        "Search through the indexed document repository for facts, definitions, "
        "equations, or relevant context. Input: 'query' (str), optional 'document_ids' (list of str), "
        "and optional 'top_k' (int, default 5)."
    )

    async def execute(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        query: str,
        document_ids: Optional[List[str]] = None,
        top_k: int = 5,
        window_size: int = 1,
    ) -> Dict[str, Any]:
        if not query or not query.strip():
            return {
                "summary": "Empty search query provided.",
                "citations": [],
                "context_text": "",
            }

        clean_doc_ids = None
        if document_ids:
            clean_doc_ids = [str(d).strip() for d in document_ids if str(d).strip()]
            if not clean_doc_ids:
                clean_doc_ids = None

        # 1. BM25 Sparse Search
        bm25 = BM25IndexService.get_instance()
        sparse_raw = bm25.search_sparse(
            query=query,
            top_k=top_k,
            document_id=clean_doc_ids
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

        # 2. Dense Vector Search
        vstore = VectorStoreService.get_instance()
        dense_raw = vstore.search_dense(
            query=query,
            top_k=top_k,
            document_id=clean_doc_ids
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

        # 3. Hybrid RRF Fusion
        hybrid_candidates = HybridRetriever.reciprocal_rank_fusion(
            dense_results=dense_candidates,
            sparse_results=sparse_candidates,
            k=60
        )[:top_k]

        # 4. Cross-Encoder Rerank
        reranker = RerankerService.get_instance()
        rerank_out = await reranker.rerank_candidates(
            query=query,
            candidates=hybrid_candidates,
            top_k=top_k
        )
        ranked_chunks = rerank_out.get("results", [])

        if not ranked_chunks:
            return {
                "summary": f"No relevant passages found for query '{query}'.",
                "citations": [],
                "context_text": "",
            }

        # 5. Resolve Document Titles
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
                logger.warning(f"Failed to lookup document titles in agent tool: {e}")

        # 6. Context Expansion and Citations Formatting
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
            if window_size > 0 and c_id_str:
                try:
                    exp_res = await ContextExpansionService.expand_chunk_context(
                        db=db,
                        chunk_id=uuid.UUID(c_id_str),
                        window_size=window_size,
                        user_id=user_id
                    )
                    expanded_content = exp_res.expanded_text or base_content
                except Exception as err:
                    logger.debug(f"Agent tool context expansion skipped for chunk {c_id_str}: {err}")

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

        summary = f"Retrieved {len(citations)} relevant excerpts from {len(doc_ids_set)} document(s)."
        return {
            "summary": summary,
            "citations": citations,
            "context_text": "\n".join(context_blocks),
        }


class ToolDispatcher:
    """Registry and dispatcher for ReAct agent tools."""

    def __init__(self):
        self._tools: Dict[str, AgentTool] = {
            "search_knowledge_base": SearchKnowledgeBaseTool(),
        }

    def get_tool(self, name: str) -> Optional[AgentTool]:
        return self._tools.get(name)

    def list_tools(self) -> List[AgentTool]:
        return list(self._tools.values())

    def get_tools_description(self) -> str:
        lines = []
        for t in self._tools.values():
            lines.append(f"- {t.name}: {t.description}")
        return "\n".join(lines)

    async def execute_tool(
        self,
        name: str,
        db: AsyncSession,
        user_id: uuid.UUID,
        tool_input: Dict[str, Any],
    ) -> Dict[str, Any]:
        tool = self.get_tool(name)
        if not tool:
            return {
                "summary": f"Error: Tool '{name}' does not exist.",
                "citations": [],
                "context_text": "",
            }
        return await tool.execute(db=db, user_id=user_id, **tool_input)
