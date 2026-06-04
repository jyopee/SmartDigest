"""Document text extraction and chunking."""

from __future__ import annotations

import io

import fitz
from docx import Document

PDF_CHUNK_PAGES = 5
TEXT_CHUNK_CHARS = 3000


def chunk_text_by_chars(text: str, chunk_size: int = TEXT_CHUNK_CHARS) -> list[str]:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    if len(normalized) <= chunk_size:
        return [normalized] if normalized.strip() else []

    chunks: list[str] = []
    start = 0
    while start < len(normalized):
        end = min(start + chunk_size, len(normalized))
        if end < len(normalized):
            split_at = normalized.rfind("\n\n", start, end)
            if split_at == -1:
                split_at = normalized.rfind("\n", start, end)
            if split_at != -1 and split_at > start:
                end = split_at
        part = normalized[start:end].strip()
        if part:
            chunks.append(part)
        start = end if end > start else start + chunk_size
    return chunks


def extract_pdf_page_texts(raw: bytes) -> list[str]:
    doc = fitz.open(stream=raw, filetype="pdf")
    try:
        return [page.get_text("text", sort=True) for page in doc]
    finally:
        doc.close()


def build_pdf_chunks(pdf_page_texts: list[str]) -> list[dict]:
    total_pages = len(pdf_page_texts)
    return [
        {
            "text": "\n".join(pdf_page_texts[i : i + PDF_CHUNK_PAGES]),
            "start_page": i + 1,
            "end_page": min(i + PDF_CHUNK_PAGES, total_pages),
        }
        for i in range(0, total_pages, PDF_CHUNK_PAGES)
        if any(pdf_page_texts[i : i + PDF_CHUNK_PAGES])
    ]


def extract_text_from_upload(filename: str, raw: bytes) -> tuple[str, list[dict]]:
    file_type = filename.rsplit(".", 1)[-1].lower()

    if file_type == "pdf":
        pdf_page_texts = extract_pdf_page_texts(raw)
        text = "\n".join(pdf_page_texts)
        source_chunks = build_pdf_chunks(pdf_page_texts)
    elif file_type == "docx":
        document = Document(io.BytesIO(raw))
        text = "\n".join(para.text for para in document.paragraphs if para.text.strip())
        source_chunks = [{"text": chunk} for chunk in chunk_text_by_chars(text)]
    else:
        raise ValueError("PDF 또는 DOCX 파일만 지원합니다.")

    return text, source_chunks
