import os
import re
from typing import Dict, Any, List
from pypdf import PdfReader

def _sanitize_text(text: str) -> str:
    """Strip null bytes and non-printable control characters that violate Postgres UTF-8."""
    if not text:
        return ""
    return text.replace("\x00", "")

class DocumentParserService:
    @classmethod
    def parse_file(cls, file_path: str, file_type: str) -> Dict[str, Any]:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        file_type = file_type.lower().lstrip(".")

        if file_type == "pdf":
            return cls._parse_pdf(file_path)
        elif file_type in ["md", "markdown"]:
            return cls._parse_markdown(file_path)
        elif file_type in ["txt", "text"]:
            return cls._parse_text(file_path)
        elif file_type in ["docx", "doc"]:
            return cls._parse_docx(file_path)
        elif file_type == "csv":
            return cls._parse_csv(file_path)
        elif file_type in ["xlsx", "xls"]:
            return cls._parse_excel(file_path)
        else:
            raise ValueError(
                f"Unsupported file format: .{file_type}. Supported formats: .pdf, .md, .txt, .docx, .csv, .xlsx"
            )

    @classmethod
    def _parse_pdf(cls, file_path: str) -> Dict[str, Any]:
        reader = PdfReader(file_path)
        page_records: List[Dict[str, Any]] = []
        full_text_chunks: List[str] = []

        total_pages = len(reader.pages)
        for idx, page in enumerate(reader.pages):
            page_text = _sanitize_text(page.extract_text() or "")
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
                "pdf_metadata": {_sanitize_text(str(k)): _sanitize_text(str(v)) for k, v in (reader.metadata or {}).items()}
            }
        }

    @classmethod
    def _parse_markdown(cls, file_path: str) -> Dict[str, Any]:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        normalized_content = content.replace("\r\n", "\n").strip()

        title_match = re.search(r"^#\s+(.+)$", normalized_content, re.MULTILINE)
        doc_title = title_match.group(1).strip() if title_match else os.path.basename(file_path)
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

    @classmethod
    def _parse_docx(cls, file_path: str) -> Dict[str, Any]:
        """Parse Microsoft Word .docx documents preserving headings and paragraphs."""
        try:
            import docx  # type: ignore[import-untyped, import-not-found]
        except ImportError:
            raise RuntimeError("python-docx is not installed in the environment")

        doc = docx.Document(file_path)
        paragraphs_text = []
        headings_count = 0
        detected_title = os.path.basename(file_path)

        for p in doc.paragraphs:
            txt = p.text.strip()
            if not txt:
                continue
            if p.style and p.style.name and p.style.name.startswith("Heading"):
                headings_count += 1
                level = 1
                try:
                    level = int(p.style.name.replace("Heading", "").strip())
                except Exception:
                    pass
                paragraphs_text.append(f"{'#' * level} {txt}")
                if not detected_title or detected_title == os.path.basename(file_path):
                    detected_title = txt
            else:
                paragraphs_text.append(txt)

        # Also extract text from tables
        table_rows_count = 0
        for table in doc.tables:
            for row in table.rows:
                row_cells = [cell.text.strip() for cell in row.cells]
                if any(row_cells):
                    paragraphs_text.append(" | ".join(row_cells))
                    table_rows_count += 1

        combined_text = "\n\n".join(paragraphs_text).strip()

        return {
            "text": combined_text,
            "char_count": len(combined_text),
            "metadata": {
                "detected_title": detected_title,
                "paragraph_count": len(doc.paragraphs),
                "headings_count": headings_count,
                "table_rows_count": table_rows_count,
            }
        }

    @classmethod
    def _parse_csv(cls, file_path: str) -> Dict[str, Any]:
        """Parse CSV files into Markdown tables and structured textual records."""
        import csv
        rows = []
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.reader(f)
            for row in reader:
                if any(field.strip() for field in row):
                    rows.append(row)

        if not rows:
            return {"text": "", "char_count": 0, "metadata": {"row_count": 0}}

        header = rows[0]
        markdown_lines = []
        markdown_lines.append(" | ".join(header))
        markdown_lines.append(" | ".join(["---"] * len(header)))

        for r in rows[1:]:
            # Pad row if fewer columns than header
            padded = r + [""] * (len(header) - len(r))
            markdown_lines.append(" | ".join(padded[:len(header)]))

        combined_text = "\n".join(markdown_lines).strip()
        return {
            "text": combined_text,
            "char_count": len(combined_text),
            "metadata": {
                "detected_title": os.path.basename(file_path),
                "row_count": len(rows),
                "column_count": len(header),
            }
        }

    @classmethod
    def _parse_excel(cls, file_path: str) -> Dict[str, Any]:
        """Parse Excel (.xlsx, .xls) sheets into structured Markdown tables."""
        import openpyxl
        wb = openpyxl.load_workbook(file_path, data_only=True, read_only=True)
        sheet_chunks = []
        total_rows = 0

        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            rows_data = []
            for row in ws.iter_rows(values_only=True):
                str_row = [str(cell) if cell is not None else "" for cell in row]
                if any(c.strip() for c in str_row):
                    rows_data.append(str_row)

            if not rows_data:
                continue

            total_rows += len(rows_data)
            header = rows_data[0]
            sheet_md = [f"## Sheet: {sheet_name}", ""]
            sheet_md.append(" | ".join(header))
            sheet_md.append(" | ".join(["---"] * len(header)))

            for r in rows_data[1:]:
                padded = r + [""] * (len(header) - len(r))
                sheet_md.append(" | ".join(padded[:len(header)]))

            sheet_chunks.append("\n".join(sheet_md))

        combined_text = "\n\n".join(sheet_chunks).strip()
        return {
            "text": combined_text,
            "char_count": len(combined_text),
            "metadata": {
                "detected_title": os.path.basename(file_path),
                "sheet_count": len(wb.sheetnames),
                "total_rows": total_rows,
            }
        }
