import re
from typing import List, Dict, Any, Optional

class StructureAwareChunker:
    """
    Splits document text into semantic chunks that preserve heading hierarchies,
    page markers, and paragraph boundaries with configurable token targets and overlap.
    """

    def __init__(
        self,
        target_chunk_tokens: int = 400,
        chunk_overlap_tokens: int = 50,
        chars_per_token: float = 4.0
    ):
        self.target_chars = int(target_chunk_tokens * chars_per_token)
        self.overlap_chars = int(chunk_overlap_tokens * chars_per_token)

    def chunk_document(
        self,
        text: str,
        document_title: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Produce ordered, structured chunks with hierarchical metadata.
        Returns a list of dictionaries ready for DocumentRepository.add_chunks.
        """
        if not text or not text.strip():
            return []

        sections = self._split_by_structural_boundaries(text)
        raw_chunks = self._pack_sections_into_chunks(sections)

        result: List[Dict[str, Any]] = []
        for index, item in enumerate(raw_chunks):
            heading = item.get("heading")
            body = item["content"].strip()
            content = f"## {heading}\n{body}" if heading and not body.startswith(f"## {heading}") else body
            token_count = max(1, len(content) // 4)
            metadata = {
                "section_hierarchy": item.get("hierarchy", []),
                "active_heading": heading or document_title or "General",
                "document_title": document_title,
                "char_length": len(content),
            }

            if item.get("page_number"):
                metadata["page_number"] = item["page_number"]

            result.append({
                "chunk_index": index,
                "content": content,
                "token_count": token_count,
                "chunk_metadata": metadata
            })

        return result

    def _split_by_structural_boundaries(self, text: str) -> List[Dict[str, Any]]:
        heading_or_page_pattern = re.compile(
            r"(^(?:#{1,6}\s+.+|<!--\s*Page\s+(\d+)\s*-->))",
            re.MULTILINE
        )

        splits = heading_or_page_pattern.split(text)
        sections: List[Dict[str, Any]] = []

        current_hierarchy: List[str] = []
        current_heading = "Overview"
        current_page: Optional[int] = None

        i = 0
        while i < len(splits):
            part = splits[i]
            if not part:
                i += 1
                continue

            page_match = re.match(r"^<!--\s*Page\s+(\d+)\s*-->$", part.strip())
            heading_match = re.match(r"^(#{1,6})\s+(.+)$", part.strip())

            if page_match:
                current_page = int(page_match.group(1))
                i += 2
                continue
            elif heading_match:
                level = len(heading_match.group(1))
                heading_text = heading_match.group(2).strip()
                current_heading = heading_text
                current_hierarchy = current_hierarchy[:level - 1] + [heading_text]
                i += 1
                continue
            else:
                body = part.strip()
                if body:
                    sections.append({
                        "body": body,
                        "heading": current_heading,
                        "hierarchy": list(current_hierarchy),
                        "page_number": current_page
                    })
                i += 1

        if not sections and text.strip():
            sections.append({
                "body": text.strip(),
                "heading": "Overview",
                "hierarchy": ["Overview"],
                "page_number": None
            })

        return sections

    def _pack_sections_into_chunks(self, sections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        packed_chunks: List[Dict[str, Any]] = []

        for section in sections:
            body = section["body"]
            paragraphs = re.split(r"\n\s*\n", body)

            current_buffer: List[str] = []
            current_buffer_len = 0

            for para in paragraphs:
                para = para.strip()
                if not para:
                    continue

                if current_buffer_len + len(para) <= self.target_chars:
                    current_buffer.append(para)
                    current_buffer_len += len(para) + 2
                else:
                    if current_buffer:
                        chunk_text = "\n\n".join(current_buffer)
                        packed_chunks.append({
                            "content": chunk_text,
                            "heading": section["heading"],
                            "hierarchy": section["hierarchy"],
                            "page_number": section["page_number"]
                        })

                        # Maintain overlap from end of previous buffer
                        overlap_text = chunk_text[-self.overlap_chars:] if len(chunk_text) > self.overlap_chars else ""
                        current_buffer = [overlap_text, para] if overlap_text else [para]
                        current_buffer_len = sum(len(p) for p in current_buffer)
                    else:
                        # Single massive paragraph: slice cleanly by sentence or characters
                        sub_slices = self._slice_long_text(para, self.target_chars, self.overlap_chars)
                        for sub in sub_slices:
                            packed_chunks.append({
                                "content": sub,
                                "heading": section["heading"],
                                "hierarchy": section["hierarchy"],
                                "page_number": section["page_number"]
                            })
                        current_buffer = []
                        current_buffer_len = 0

            if current_buffer:
                packed_chunks.append({
                    "content": "\n\n".join(current_buffer),
                    "heading": section["heading"],
                    "hierarchy": section["hierarchy"],
                    "page_number": section["page_number"]
                })

        return packed_chunks

    @staticmethod
    def _slice_long_text(text: str, max_chars: int, overlap: int) -> List[str]:
        slices: List[str] = []
        start = 0
        while start < len(text):
            end = start + max_chars
            slices.append(text[start:end])
            start = end - overlap if end < len(text) else end
        return slices
