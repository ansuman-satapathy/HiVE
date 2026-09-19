import os
import uuid
import logging
import threading
from typing import List, Dict, Any, Optional
import chromadb
from chromadb.config import Settings as ChromaSettings

from app.core.config import settings
from app.services.embedding_service import EmbeddingFactory, EmbeddingProvider

logger = logging.getLogger("vector_store_service")

COLLECTION_NAME = "quickdesk_document_chunks"


class VectorStoreService:
    """
    Persistent dense vector store management using ChromaDB.
    Maps embeddings directly to DocumentChunk.id with cosine similarity ranking.
    Thread-safe for concurrent parallel ingestion queues.
    """

    _instance: Optional["VectorStoreService"] = None

    def __init__(
        self,
        persist_directory: Optional[str] = None,
        embedding_provider: Optional[EmbeddingProvider] = None,
    ):
        self._lock = threading.Lock()
        self.persist_directory = persist_directory or settings.CHROMA_PERSIST_DIR
        self.embedding_provider = embedding_provider or EmbeddingFactory.get_provider()

        os.makedirs(self.persist_directory, exist_ok=True)
        self.client = chromadb.PersistentClient(
            path=self.persist_directory,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        logger.info(
            f"ChromaDB VectorStore initialized at '{self.persist_directory}'. "
            f"Collection items: {self.collection.count()}"
        )

    @property
    def collection(self):
        """Safely return ChromaDB collection, auto-recreating if missing/deleted."""
        try:
            return self.client.get_collection(name=COLLECTION_NAME)
        except Exception:
            return self.client.get_or_create_collection(
                name=COLLECTION_NAME,
                metadata={"hnsw:space": "cosine"},
            )

    @classmethod
    def get_instance(cls) -> "VectorStoreService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def add_chunks(self, chunks: List[Dict[str, Any]]) -> None:
        """
        Embed and persist document chunks into ChromaDB.
        Each chunk item should contain: id, document_id, chunk_index, content, token_count, chunk_metadata.
        """
        if not chunks:
            return

        ids: List[str] = []
        documents: List[str] = []
        metadatas: List[Dict[str, Any]] = []

        for chunk in chunks:
            chunk_id_str = str(chunk.get("id") or chunk.get("chunk_id") or uuid.uuid4())
            ids.append(chunk_id_str)
            content = chunk.get("content", "")
            documents.append(content)

            meta = {
                "document_id": str(chunk.get("document_id")),
                "chunk_index": int(chunk.get("chunk_index", 0)),
                "token_count": int(chunk.get("token_count", 0)),
            }
            # Persist chunk_metadata attributes into ChromaDB metadata
            chunk_meta = chunk.get("chunk_metadata") or {}
            for k, v in chunk_meta.items():
                if isinstance(v, (str, int, float, bool)):
                    meta[k] = v
                elif v is not None:
                    meta[k] = str(v)

            metadatas.append(meta)

        # Batch embed
        embeddings = self.embedding_provider.embed_documents(documents)

        with self._lock:
            self.collection.upsert(
                ids=ids,
                embeddings=embeddings,
                documents=documents,
                metadatas=metadatas,
            )
        logger.info(f"Successfully upserted {len(ids)} dense vectors into ChromaDB.")
        return len(ids)

    def delete_document_chunks(self, document_id: uuid.UUID | str) -> int:
        """Purge all vectors corresponding to a deleted document safely."""
        doc_id_str = str(document_id)
        try:
            with self._lock:
                coll = self.collection
                count_before = coll.count()
                coll.delete(where={"document_id": doc_id_str})
                count_after = coll.count()
            deleted = count_before - count_after
            logger.info(f"Deleted {deleted} vectors for document '{doc_id_str}' from ChromaDB.")
            return deleted
        except Exception as exc:
            logger.warning(f"ChromaDB error deleting chunks for document {doc_id_str}: {exc}")
            return 0

    def search_dense(
        self,
        query: str,
        top_k: int = 5,
        document_id: Optional[uuid.UUID | str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Execute dense semantic similarity search.
        Returns top matching chunks with normalized cosine similarity scores (0.0 to 1.0).
        """
        if not query or not query.strip():
            return []

        if self.collection.count() == 0:
            return []

        query_embedding = self.embedding_provider.embed_query(query)
        where_clause = None
        if document_id:
            if isinstance(document_id, (list, set, tuple)):
                clean_ids = [str(d) for d in document_id if d]
                if len(clean_ids) == 1:
                    where_clause = {"document_id": clean_ids[0]}
                elif len(clean_ids) > 1:
                    where_clause = {"document_id": {"$in": clean_ids}}
            else:
                where_clause = {"document_id": str(document_id)}

        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, self.collection.count()),
            where=where_clause,
        )

        formatted_results: List[Dict[str, Any]] = []
        if not results or not results["ids"] or not results["ids"][0]:
            return formatted_results

        ids = results["ids"][0]
        distances = results["distances"][0] if results.get("distances") else [0.0] * len(ids)
        documents = results["documents"][0] if results.get("documents") else [""] * len(ids)
        metadatas = results["metadatas"][0] if results.get("metadatas") else [{}] * len(ids)

        for chunk_id, dist, doc_text, meta in zip(ids, distances, documents, metadatas):
            # Chroma returns cosine distance (0: identical, 2: opposite).
            # Convert to cosine similarity score: 1.0 - (distance / 2.0) or max(0, 1.0 - distance)
            similarity = max(0.0, min(1.0, 1.0 - float(dist)))

            formatted_results.append({
                "chunk_id": chunk_id,
                "document_id": meta.get("document_id"),
                "chunk_index": meta.get("chunk_index", 0),
                "content": doc_text,
                "token_count": meta.get("token_count", 0),
                "chunk_metadata": {k: v for k, v in meta.items() if k not in ("document_id", "chunk_index", "token_count")},
                "score": float(round(similarity, 4)),
            })

        formatted_results.sort(key=lambda x: x["score"], reverse=True)
        return formatted_results[:top_k]

    def clear(self) -> None:
        """Reset the vector collection (useful for isolated tests)."""
        try:
            self.client.delete_collection(name=COLLECTION_NAME)
        except Exception:
            pass
        self.client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
