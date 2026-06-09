"""Google Search 기반 외부 검증 — 질문하기(Chat) 전용."""

from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import urlparse

from gemini_client import GEMINI_MODEL, get_client, is_retryable_api_error
from google.genai import types
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)
from usage_tracker import record_gemini_call

TRUSTED_SOURCE_RULES: list[tuple[str, int]] = [
    ("wikipedia.org", 10),
    ("ieee.org", 10),
    ("acm.org", 10),
    ("doi.org", 10),
    ("scholar.google", 9),
    ("arxiv.org", 9),
    ("ncbi.nlm.nih.gov", 9),
    ("nature.com", 9),
    ("science.org", 9),
    ("springer.com", 8),
    ("sciencedirect.com", 8),
    (".edu", 8),
    (".gov", 8),
    ("github.com", 6),
    ("stackoverflow.com", 5),
]


def _source_trust_score(url: str) -> int:
    host = (urlparse(url).netloc or "").lower()
    if not host:
        return 0

    best = 0
    for pattern, score in TRUSTED_SOURCE_RULES:
        if pattern.startswith(".") and host.endswith(pattern):
            best = max(best, score)
        elif pattern in host:
            best = max(best, score)
    return best


def rank_sources_by_trust(sources: list[dict[str, str]]) -> list[dict[str, str]]:
    if not sources:
        return []

    ranked = sorted(
        sources,
        key=lambda item: (
            _source_trust_score(item.get("url", "")),
            (item.get("title") or "").lower(),
        ),
        reverse=True,
    )

    enriched: list[dict[str, str]] = []
    for item in ranked:
        url = item.get("url", "")
        score = _source_trust_score(url)
        enriched.append(
            {
                "title": item.get("title") or url,
                "url": url,
                "trust_score": score,
                "trusted": score >= 8,
            }
        )
    return enriched


def extract_grounding_sources(response: Any) -> list[dict[str, str]]:
    """Gemini grounding metadata에서 참고 URL 목록을 추출합니다."""
    sources: list[dict[str, str]] = []
    seen_urls: set[str] = set()

    def add_source(title: str, url: str) -> None:
        clean_url = (url or "").strip()
        if not clean_url or clean_url in seen_urls:
            return
        seen_urls.add(clean_url)
        sources.append(
            {
                "title": (title or clean_url).strip() or clean_url,
                "url": clean_url,
            }
        )

    candidates = getattr(response, "candidates", None) or []
    for candidate in candidates:
        metadata = getattr(candidate, "grounding_metadata", None)
        if metadata is None:
            continue

        chunks = getattr(metadata, "grounding_chunks", None) or []
        for chunk in chunks:
            web = getattr(chunk, "web", None)
            if web is None:
                continue
            add_source(
                getattr(web, "title", "") or "",
                getattr(web, "uri", "") or getattr(web, "url", "") or "",
            )

        supports = getattr(metadata, "grounding_supports", None) or []
        for support in supports:
            chunk_indices = getattr(support, "grounding_chunk_indices", None) or []
            for index in chunk_indices:
                if index < 0 or index >= len(chunks):
                    continue
                web = getattr(chunks[index], "web", None)
                if web is None:
                    continue
                add_source(
                    getattr(web, "title", "") or "",
                    getattr(web, "uri", "") or getattr(web, "url", "") or "",
                )

    return rank_sources_by_trust(sources)


def _build_search_prompt(
    question: str,
    *,
    selected_text: str = "",
    search_queries: list[str] | None = None,
) -> str:
    queries = [q.strip() for q in (search_queries or []) if q and q.strip()]
    if not queries:
        queries = [question.strip()] if question.strip() else []

    query_block = "\n".join(f"{index + 1}. {query}" for index, query in enumerate(queries))

    return (
        "다음 검색 쿼리들을 각각 Google 검색으로 조회해 사실 정보를 수집하세요.\n"
        "출처 우선순위: Wikipedia, IEEE, ACM, 학술 논문(DOI/arXiv), 공식 기술 문서, .edu/.gov 사이트.\n"
        "블로그·커뮤니티만 있는 주장은 단정하지 말고, 신뢰 출처와 교차 확인하세요.\n"
        "각 쿼리에서 확인된 사실을 한국어로 구체적으로 정리하세요. "
        "확인되지 않은 내용은 추측하지 마세요.\n\n"
        f"[검색 쿼리 — 다각도 조회]\n{query_block}\n\n"
        f"[드래그한 텍스트]\n{selected_text.strip() or '(없음)'}\n\n"
        f"[사용자 질문]\n{question.strip()}"
    )


@retry(
    retry=retry_if_exception(is_retryable_api_error),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=3, max=30),
    reraise=True,
)
def _search_sync(
    question: str,
    *,
    selected_text: str = "",
    search_queries: list[str] | None = None,
    user_id: str = "",
) -> tuple[str, list[dict[str, str]]]:
    prompt = _build_search_prompt(
        question,
        selected_text=selected_text,
        search_queries=search_queries,
    )

    response = get_client().models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
            max_output_tokens=2048,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )
    record_gemini_call(response, user_id=user_id or None)

    text = (getattr(response, "text", "") or "").strip()
    sources = extract_grounding_sources(response)
    return text, sources


async def search_external_context(
    question: str,
    *,
    selected_text: str = "",
    search_queries: list[str] | None = None,
    user_id: str = "",
) -> tuple[str, list[dict[str, str]]]:
    return await asyncio.to_thread(
        _search_sync,
        question,
        selected_text=selected_text,
        search_queries=search_queries,
        user_id=user_id,
    )
