import logging
from uuid import UUID
from typing import List, Optional, Dict, Any, Tuple
from sqlmodel.ext.asyncio.session import AsyncSession
from fastapi import HTTPException, status

from app.models.document import DocumentChunk, Document
from app.db.repositories.document_repo import DocumentRepository
from app.schemas.document import ExpandedContextResult

logger = logging.getLogger(__name__)


class ContextExpansionService:
    @staticmethod
    def clean_merge_texts(texts: List[str]) -> str:
        """
        Cleanly concatenate sequential texts while removing redundant overlapping boundary text.
        Many chunkers create 50-100 token overlaps between chunk N and chunk N+1.
        We find the longest suffix of text[i] that matches the prefix of text[i+1] and deduplicate it.
        """
        if not texts:
            return ""
        if len(texts) == 1:
            return texts[0].strip()

        merged = texts[0].strip()

        for next_text in texts[1:]:
            next_clean = next_text.strip()
            if not next_clean:
                continue

            # Look for suffix-prefix overlap
            # Start search from min(len(merged), len(next_clean), 300) characters down to 15
            max_check = min(len(merged), len(next_clean), 300)
            overlap_len = 0

            for length in range(max_check, 15, -1):
                suffix = merged[-length:]
                prefix = next_clean[:length]
                if suffix.lower() == prefix.lower():
                    overlap_len = length
                    break

            if overlap_len > 0:
                # Merge by appending only the non-overlapping portion
                addition = next_clean[overlap_len:].lstrip()
                if addition:
                    merged = f"{merged} {addition}"
            else:
                # No overlap detected: join with newline or space based on paragraph boundaries
                if merged.endswith((".", "!", "?", ":", "\n")):
                    merged = f"{merged}\n\n{next_clean}"
                else:
                    merged = f"{merged} {next_clean}"

        return merged.strip()

    @classmethod
    async def expand_chunk_context(
        cls,
        db: AsyncSession,
        chunk_id: UUID,
        window_size: int = 1,
        max_tokens: Optional[int] = None,
        user_id: Optional[UUID] = None
    ) -> ExpandedContextResult:
        """
        Expands the context window around a specific anchor chunk:
        1. Look up anchor chunk and parent document.
        2. Validate user ownership if user_id is provided.
        3. Query sibling chunks from [index - window_size] to [index + window_size].
        4. Cleanly merge chunk texts removing boundary overlaps.
        5. Enforce optional max_tokens budget prioritizing the anchor chunk.
        6. Extract section breadcrumbs and parent document identifiers.
        """
        anchor_chunk = await DocumentRepository.get_chunk_by_id(db, chunk_id)
        if not anchor_chunk:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Chunk with ID '{chunk_id}' not found."
            )

        parent_doc = await DocumentRepository.get_by_id(db, anchor_chunk.document_id)
        if not parent_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent document for chunk '{chunk_id}' not found."
            )

        if user_id and parent_doc.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to document chunk."
            )

        # Window boundary indices
        start_idx = max(0, anchor_chunk.chunk_index - max(0, window_size))
        end_idx = anchor_chunk.chunk_index + max(0, window_size)

        siblings = await DocumentRepository.get_sibling_chunks(
            db=db,
            document_id=anchor_chunk.document_id,
            start_index=start_idx,
            end_index=end_idx
        )

        if not siblings:
            siblings = [anchor_chunk]

        # Ensure anchor chunk is definitely present
        if not any(c.id == anchor_chunk.id for c in siblings):
            siblings.append(anchor_chunk)
            siblings.sort(key=lambda c: c.chunk_index)

        # Handle token budget constraint if provided
        selected_siblings = siblings
        if max_tokens and max_tokens > 0:
            # Anchor chunk must always be included
            total_tokens = anchor_chunk.token_count or len(anchor_chunk.content.split())
            chosen_chunks = {anchor_chunk.chunk_index: anchor_chunk}

            # Greedily expand outwards from anchor (alternating left and right)
            left_offset = 1
            right_offset = 1
            while total_tokens < max_tokens:
                added = False
                # Try adding left sibling
                l_cand = next((c for c in siblings if c.chunk_index == anchor_chunk.chunk_index - left_offset), None)
                if l_cand and l_cand.chunk_index not in chosen_chunks:
                    c_tokens = l_cand.token_count or len(l_cand.content.split())
                    if total_tokens + c_tokens <= max_tokens:
                        chosen_chunks[l_cand.chunk_index] = l_cand
                        total_tokens += c_tokens
                        left_offset += 1
                        added = True

                # Try adding right sibling
                r_cand = next((c for c in siblings if c.chunk_index == anchor_chunk.chunk_index + right_offset), None)
                if r_cand and r_cand.chunk_index not in chosen_chunks:
                    c_tokens = r_cand.token_count or len(r_cand.content.split())
                    if total_tokens + c_tokens <= max_tokens:
                        chosen_chunks[r_cand.chunk_index] = r_cand
                        total_tokens += c_tokens
                        right_offset += 1
                        added = True

                if not added:
                    break

            selected_siblings = [chosen_chunks[k] for k in sorted(chosen_chunks.keys())]

        # Deduplicate and merge texts cleanly
        merged_text = cls.clean_merge_texts([s.content for s in selected_siblings])

        # Compute combined token count
        combined_token_count = sum(s.token_count for s in selected_siblings if s.token_count)
        if combined_token_count == 0:
            combined_token_count = len(merged_text.split())

        # Collect unique section breadcrumbs
        breadcrumbs: List[str] = []
        for s in selected_siblings:
            meta = s.chunk_metadata or {}
            section = meta.get("section") or meta.get("heading") or meta.get("title")
            if section and section not in breadcrumbs:
                breadcrumbs.append(str(section))

        included_indices = [s.chunk_index for s in selected_siblings]
        included_ids = [s.id for s in selected_siblings]

        return ExpandedContextResult(
            anchor_chunk_id=anchor_chunk.id,
            document_id=parent_doc.id,
            document_filename=parent_doc.filename,
            included_chunk_indices=included_indices,
            included_chunk_ids=included_ids,
            expanded_text=merged_text,
            token_count=combined_token_count,
            section_breadcrumbs=breadcrumbs,
            metadata={
                "file_type": parent_doc.file_type,
                "file_size_bytes": parent_doc.file_size_bytes,
                "doc_metadata": parent_doc.doc_metadata,
                "total_document_chunks": parent_doc.chunk_count,
            }
        )

    @classmethod
    async def expand_multiple_chunks(
        cls,
        db: AsyncSession,
        chunk_ids: List[UUID],
        window_size: int = 1,
        max_total_tokens: Optional[int] = None,
        user_id: Optional[UUID] = None
    ) -> List[ExpandedContextResult]:
        """
        Expands a set of retrieved chunks while clustering overlapping windows from the same document.
        Avoids redundant identical passages if retrieved chunks are immediate neighbors.
        """
        if not chunk_ids:
            return []

        expanded_results: List[ExpandedContextResult] = []
        covered_chunk_ids = set()

        for c_id in chunk_ids:
            if c_id in covered_chunk_ids:
                continue

            try:
                res = await cls.expand_chunk_context(
                    db=db,
                    chunk_id=c_id,
                    window_size=window_size,
                    max_tokens=max_total_tokens,
                    user_id=user_id
                )
                for inc_id in res.included_chunk_ids:
                    covered_chunk_ids.add(inc_id)

                expanded_results.append(res)
            except HTTPException:
                continue

        return expanded_results
