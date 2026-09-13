import re
import uuid
import logging
from typing import List, Dict, Any, Optional
from rank_bm25 import BM25Plus

logger = logging.getLogger("bm25_service")

class BM25IndexService:
    """
    In-memory BM25 lexical inverted index for document chunks.
    Ensures exact matching on technical identifiers, SKUs, error codes, UUIDs, and function names.
    """
    _instance: Optional["BM25IndexService"] = None

    def __init__(self):
        self.chunk_records: List[Dict[str, Any]] = []
        self.corpus_tokens: List[List[str]] = []
        self.bm25_index: Optional[BM25Okapi] = None

    @classmethod
    def get_instance(cls) -> "BM25IndexService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @staticmethod
    def tokenize(text: str) -> List[str]:
        """
        Tokenize text preserving alphanumeric terms, symbols/underscores (e.g. error codes, method names).
        Lowercases for case-insensitive lexical matching.
        """
        if not text:
            return []
        # Matches words containing letters, numbers, underscores, and hyphens
        tokens = re.findall(r"[a-zA-Z0-9_\-]+", text.lower())
        return tokens

    def index_chunks(self, chunks: List[Dict[str, Any]]) -> None:
        """
        Index a batch of chunk dictionaries.
        Each chunk dict must contain:
            - chunk_id: UUID or str
            - document_id: UUID or str
            - content: str
            - chunk_index: int (optional)
            - chunk_metadata: dict (optional)
        """
        if not chunks:
            return

        new_records = []
        new_tokens = []
        for chunk in chunks:
            content = chunk.get("content", "")
            tokens = self.tokenize(content)
            new_records.append({
                "chunk_id": str(chunk.get("id") or chunk.get("chunk_id") or uuid.uuid4()),
                "document_id": str(chunk.get("document_id")),
                "chunk_index": chunk.get("chunk_index", 0),
                "content": content,
                "token_count": chunk.get("token_count", len(tokens)),
                "chunk_metadata": chunk.get("chunk_metadata", {})
            })
            new_tokens.append(tokens)

        self.chunk_records.extend(new_records)
        self.corpus_tokens.extend(new_tokens)
        self._rebuild_bm25()
        logger.info(f"Indexed {len(new_records)} chunks in BM25. Total corpus size: {len(self.chunk_records)}")

    def remove_document_chunks(self, document_id: uuid.UUID | str) -> None:
        """
        Remove all indexed chunks belonging to a deleted document.
        """
        doc_id_str = str(document_id)
        filtered_records = []
        filtered_tokens = []
        removed_count = 0

        for rec, toks in zip(self.chunk_records, self.corpus_tokens):
            if rec["document_id"] != doc_id_str:
                filtered_records.append(rec)
                filtered_tokens.append(toks)
            else:
                removed_count += 1

        if removed_count > 0:
            self.chunk_records = filtered_records
            self.corpus_tokens = filtered_tokens
            self._rebuild_bm25()
            logger.info(f"Removed {removed_count} chunks for document {doc_id_str} from BM25 index.")

    def search_sparse(
        self,
        query: str,
        top_k: int = 5,
        document_id: Optional[uuid.UUID | str] = None
    ) -> List[Dict[str, Any]]:
        """
        Search indexed chunks using BM25 lexical ranking.
        Returns top matching chunks with 'bm25_score'.
        """
        if not self.bm25_index or not self.chunk_records:
            return []

        query_tokens = self.tokenize(query)
        if not query_tokens:
            return []

        scores = self.bm25_index.get_scores(query_tokens)

        # Filter and rank candidates
        doc_id_str = str(document_id) if document_id else None
        results = []

        for idx, score in enumerate(scores):
            if score <= 0.0:
                continue

            record = self.chunk_records[idx]
            if doc_id_str and record["document_id"] != doc_id_str:
                continue

            item = dict(record)
            item["bm25_score"] = float(round(score, 4))
            results.append(item)

        results.sort(key=lambda x: x["bm25_score"], reverse=True)
        return results[:top_k]

    def _rebuild_bm25(self) -> None:
        if self.corpus_tokens:
            self.bm25_index = BM25Plus(self.corpus_tokens)
        else:
            self.bm25_index = None

    def clear(self) -> None:
        """Reset index for testing or cold reload."""
        self.chunk_records = []
        self.corpus_tokens = []
        self.bm25_index = None
