"""문서 내 컨텍스트 검색(RAG) — 질문하기(Chat) 전용."""

from __future__ import annotations

import re

import database as db

MAX_PASSAGES = 6
MAX_CONTEXT_CHARS = 5500
MIN_TERM_LEN = 2


def _tokenize(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[\w가-힣]+", (text or "").lower())
        if len(token) >= MIN_TERM_LEN
    }


def _split_passages(content: str) -> list[str]:
    text = (content or "").strip()
    if not text:
        return []

    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", text) if part.strip()]
    if len(paragraphs) > 1:
        return paragraphs

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return lines if lines else [text]


def _score_passage(passage: str, query_terms: set[str]) -> float:
    if not passage or not query_terms:
        return 0.0

    passage_terms = _tokenize(passage)
    if not passage_terms:
        return 0.0

    overlap = len(query_terms & passage_terms)
    if overlap == 0:
        return 0.0

    return overlap / (len(query_terms) ** 0.5)


def _format_passage(page_number: int, passage: str) -> str:
    return f"[문서 p.{page_number}]\n{passage.strip()}"


def retrieve_document_context(
    digest_id: int,
    question: str,
    *,
    selected_text: str = "",
    page_number: int = 1,
    search_queries: list[str] | None = None,
    max_passages: int = MAX_PASSAGES,
    max_chars: int = MAX_CONTEXT_CHARS,
) -> str:
    """현재 문서(digest_pages)에서 질문과 관련된 구절을 추출합니다."""
    pages = db.list_digest_page_contents(digest_id)
    if not pages:
        return ""

    expanded = " ".join(search_queries or [])
    query_terms = _tokenize(f"{question} {selected_text} {expanded}")
    ranked: list[tuple[float, int, str]] = []

    for page in pages:
        page_no = int(page.get("page_number") or 1)
        content = page.get("content") or ""
        page_bonus = 1.5 if page_no == page_number else 0.0

        for passage in _split_passages(content):
            score = _score_passage(passage, query_terms) + page_bonus
            if selected_text.strip() and selected_text.strip() in passage:
                score += 5.0
            if score > 0:
                ranked.append((score, page_no, passage))

    if not ranked:
        current = next((p for p in pages if p.get("page_number") == page_number), pages[0])
        fallback = (current.get("content") or "").strip()
        if not fallback:
            return ""
        trimmed = fallback[:max_chars]
        return _format_passage(int(current.get("page_number") or 1), trimmed)

    ranked.sort(key=lambda item: item[0], reverse=True)

    blocks: list[str] = []
    used_chars = 0
    seen: set[tuple[int, str]] = set()

    for _, page_no, passage in ranked:
        key = (page_no, passage[:120])
        if key in seen:
            continue
        seen.add(key)

        block = _format_passage(page_no, passage)
        if used_chars + len(block) > max_chars and blocks:
            break

        blocks.append(block)
        used_chars += len(block)
        if len(blocks) >= max_passages:
            break

    return "\n\n".join(blocks)
