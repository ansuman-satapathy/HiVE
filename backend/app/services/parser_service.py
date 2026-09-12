import os
import re
from typing import Dict, Any, List
from pypdf import PdfReader

class DocumentParserService:
    """Service to parse raw files (PDF, Markdown, TXT) into normalized text and metadata."""

    @classmethod
    def parse_file(cls, file_path: str, file_type: str) -> Dict[str, Any]:
        """
        Extract text content and structural metadata from a file.
        Returns:
            {
                "text": str,
                "pages": List[Dict[str, Any]] (optional for multipage PDFs),
                "char_count": int,
                "metadata": Dict[str, Any]
            }
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        file_type = file_type.lower().lstrip(".")

        if file_type == "pdf":
            return cls._parse_pdf(file_path)
        elif file_type in ["md", "markdown"]:
            return cls._parse_markdown(file_path)
        elif file_type in ["txt", "text"]:
            return cls._parse_text(file_path)
        else:
            raise ValueError(f"Unsupported file format: .{file_type}. Supported formats: .pdf, .md, .txt")

    @classmethod
    def _parse_pdf(cls, file_path: str) -> Dict[str, Any]:
        reader = PdfReader(file_path)
        page_records: List[Dict[str, Any]] = []
        full_text_chunks: List[str] = []

        total_pages = len(reader.pages)
        for idx, page in enumerate(reader.pages):
            page_text = page.extract_text() or ""
            # Normalize whitespace: collapse multiple blank lines into two
            normalized_text = re.sub(r'\n{3,}', '\n\n', page_text).strip()
            
            if normalized_text:
                full_text_chunks.append(f"<!-- Page {idx + 1} -->\n{normalized_text}")
                page_records.append({
                    "page_number": idx + 1,
                    "char_count": len(normalized_text),
                })

        combined_text = "\n\n".join(full_text_chunks)

        return {
            "text": combined_text,
            "char_count": len(combined_text),
            "metadata": {
                "total_pages": total_pages,
                "parsed_pages": len(page_records),
                "pdf_metadata": {k: str(v) for k, v in (reader.metadata or {}).items()}
            }
        }

    @classmethod
    def _parse_markdown(cls, file_path: str) -> Dict[str, Any]:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        # Normalize line endings
        normalized_content = content.replace("\r\n", "\n").strip()

        # Extract top-level heading as document title if present
        title_match = re.search(r"^#\s+(.+)$", normalized_content, re.MULTILINE)
        doc_title = title_match.group(1).strip() if title_match else os.path.basename(file_path)

        # Count headings
        headings = re.findall(r"^(#{1,6})\s+(.+)$", normalized_content, re.MULTILINE)

        return {
            "text": normalized_content,
            "char_count": len(normalized_content),
            "metadata": {
                "detected_title": doc_title,
                "heading_count": len(headings),
            }
        }

    @classmethod
    def _parse_text(cls, file_path: str) -> Dict[str, Any]:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
        except UnicodeDecodeError:
            with open(file_path, "r", encoding="latin-1", errors="replace") as f:
                content = f.read()

        normalized_content = content.replace("\r\n", "\n").strip()

        return {
            "text": normalized_content,
            "char_count": len(normalized_content),
            "metadata": {
                "line_count": len(normalized_content.splitlines())
            }
        }
