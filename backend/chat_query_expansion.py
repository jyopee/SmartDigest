"""드래그·질문 기반 검색 쿼리 확장 — 질문하기(Chat) 전용."""

from __future__ import annotations

import asyncio
import json
import re

from gemini_client import GEMINI_MODEL, get_client, is_retryable_api_error
from google.genai import types
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)
from usage_tracker import record_gemini_call

MAX_QUERIES = 5
MIN_QUERIES = 3


def _parse_queries_json(raw: str) -> list[str]:
    text = (raw or "").strip()
    if not text:
        return []

    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return []

    candidates = parsed.get("queries") if isinstance(parsed, dict) else parsed
    if not isinstance(candidates, list):
        return []

    queries: list[str] = []
    seen: set[str] = set()
    for item in candidates:
        query = str(item or "").strip()
        if not query:
            continue
        key = query.lower()
        if key in seen:
            continue
        seen.add(key)
        queries.append(query)
        if len(queries) >= MAX_QUERIES:
            break
    return queries


def _fallback_queries(
    question: str,
    selected_text: str = "",
) -> list[str]:
    """AI 확장 실패 시 최소한의 다각도 쿼리를 구성합니다."""
    seed = (selected_text or question or "").strip()
    if not seed:
        return [question.strip()] if question.strip() else []

    queries: list[str] = []
    seen: set[str] = set()

    def add(query: str) -> None:
        clean = query.strip()
        if not clean:
            return
        key = clean.lower()
        if key in seen:
            return
        seen.add(key)
        queries.append(clean)

    add(seed)
    if question.strip() and question.strip().lower() != seed.lower():
        add(f"{seed} {question.strip()}")

    if re.search(r"[A-Za-z]", seed):
        add(f"{seed} biography")
        add(f"{seed} research contributions")
    else:
        add(f"{seed} 개요")
        add(f"{seed} 관련 연구")

    if question.strip():
        add(question.strip())

    return queries[:MAX_QUERIES]


@retry(
    retry=retry_if_exception(is_retryable_api_error),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=3, max=30),
    reraise=True,
)
def _expand_sync(
    question: str,
    *,
    selected_text: str = "",
    document_context: str = "",
    user_id: str = "",
) -> list[str]:
    focus = selected_text.strip() or question.strip()
    if not focus:
        return []

    context_hint = ""
    if document_context.strip():
        snippet = document_context.strip()[:1200]
        context_hint = f"\n[문서 맥락 일부]\n{snippet}\n"

    prompt = (
        "당신은 웹 검색 쿼리 설계 전문가입니다. "
        "사용자가 드래그한 텍스트와 질문을 바탕으로, Google 검색에 적합한 "
        f"영어 중심 검색 쿼리를 {MIN_QUERIES}~{MAX_QUERIES}개 생성하세요.\n\n"
        "규칙:\n"
        "1. 드래그 문장을 그대로 복사하지 말고, 각기 다른 조사 각도를 만드세요.\n"
        "   (예: 인물 → biography / research / specific work, 기술 → definition / paper / application)\n"
        "2. 고유명사·전문 용어는 원문 표기를 유지하세요.\n"
        "3. JSON만 출력: {\"queries\": [\"...\", \"...\"]}\n\n"
        f"[드래그한 텍스트]\n{selected_text.strip() or '(없음)'}\n\n"
        f"[사용자 질문]\n{question.strip() or '(없음)'}"
        f"{context_hint}"
    )

    response = get_client().models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            max_output_tokens=512,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )
    record_gemini_call(response, user_id=user_id or None)

    parsed = _parse_queries_json(getattr(response, "text", "") or "")
    if len(parsed) >= MIN_QUERIES:
        return parsed

    merged = _fallback_queries(question, selected_text)
    for query in parsed:
        if query.lower() not in {item.lower() for item in merged}:
            merged.append(query)
    return merged[:MAX_QUERIES] if merged else [focus]


async def expand_search_queries(
    question: str,
    *,
    selected_text: str = "",
    document_context: str = "",
    user_id: str = "",
) -> list[str]:
    # 드래그 텍스트가 없으면 AI 호출 없이 로컬 쿼리만 사용 (속도·할당량 절약)
    if not selected_text.strip():
        return _fallback_queries(question, selected_text)

    return await asyncio.to_thread(
        _expand_sync,
        question,
        selected_text=selected_text,
        document_context=document_context,
        user_id=user_id,
    )
