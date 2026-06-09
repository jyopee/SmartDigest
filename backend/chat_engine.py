"""Gemini-powered Q&A with document RAG + Google Search verification (Chat only)."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from chat_query_expansion import expand_search_queries
from chat_rag import retrieve_document_context
from chat_search import search_external_context
from gemini_client import GEMINI_MODEL, get_client, is_retryable_api_error
from google.genai import types
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)
from usage_tracker import record_gemini_call

CHAT_SYSTEM_PROMPT = (
    "당신은 문서 기반 Q&A 조교입니다. "
    "아래 [문서 맥락], [검색 쿼리], [외부 검색 결과]를 종합하여 사용자 질문에 한국어로 답하세요.\n\n"
    "규칙:\n"
    "1. 문서 내용을 우선 근거로 사용하세요.\n"
    "2. 외부 검색 정보를 사용할 때는 반드시 '검색 결과에 따르면 ...'으로 시작하는 문장을 포함하고, "
    "구체적인 사실(연도, 기여, 정의, 소속 등)을 상세히 서술하세요.\n"
    "3. 출처 표기: Wikipedia, IEEE, ACM, 학술 논문, 공식 문서 등 신뢰 출처를 우선 인용하고 "
    "[출처: 사이트명] 형식으로 본문에 표기하세요.\n"
    "4. 문서와 검색 결과가 충돌하면 그 차이를 명시하세요.\n"
    "5. 질문에 대한 직접 답이 부족할 때 '정보를 알 수 없습니다'로 끝내지 마세요. "
    "대신 '해당 키워드로 검색했을 때 다음 연관 정보가 확인되었습니다:' 형식으로 "
    "확인된 연관 정보를 bullet로 제시한 뒤, "
    "'혹시 이 중에서 찾으시는 내용이 있나요?'로 범위를 좁히도록 유도하세요.\n"
    "6. 근거가 전혀 없을 때만 모른다고 말하고, 가능한 경우 다음에 어떤 키워드로 좁혀볼지 제안하세요."
)


@dataclass
class ChatAnswerResult:
    answer: str
    sources: list[dict[str, str]] = field(default_factory=list)
    verified: bool = False
    search_queries: list[str] = field(default_factory=list)


def _format_source_lines(sources: list[dict[str, str]]) -> str:
    lines = []
    for item in sources:
        url = item.get("url")
        if not url:
            continue
        title = item.get("title") or url
        trust = item.get("trust_score")
        trusted = item.get("trusted")
        label = title
        if trusted:
            label = f"{title} (신뢰 출처)"
        elif trust:
            label = f"{title} (신뢰도 {trust})"
        lines.append(f"- {label}: {url}")
    return "\n".join(lines)


@retry(
    retry=retry_if_exception(is_retryable_api_error),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=3, max=30),
    reraise=True,
)
def _generate_answer_sync(
    question: str,
    *,
    document_context: str,
    search_summary: str,
    search_sources: list[dict[str, str]],
    search_queries: list[str],
    selected_text: str,
    user_id: str = "",
) -> str:
    context_parts = []

    if document_context.strip():
        context_parts.append(f"[문서 맥락]\n{document_context.strip()}")
    else:
        context_parts.append("[문서 맥락]\n(관련 내용 없음)")

    if search_queries:
        query_lines = "\n".join(f"- {query}" for query in search_queries)
        context_parts.append(f"[생성된 검색 쿼리]\n{query_lines}")

    if search_summary.strip():
        source_lines = _format_source_lines(search_sources)
        search_block = f"[외부 검색 결과]\n{search_summary.strip()}"
        if source_lines:
            search_block += (
                f"\n\n[참고 URL — 신뢰도 순]\n{source_lines}\n"
                "Wikipedia·IEEE·ACM·학술 자료를 우선 인용하세요."
            )
        context_parts.append(search_block)
    else:
        context_parts.append("[외부 검색 결과]\n(검색 결과 없음)")

    if selected_text.strip():
        context_parts.append(f"[선택한 텍스트]\n{selected_text.strip()}")

    context_block = "\n\n".join(context_parts)

    prompt = (
        f"{CHAT_SYSTEM_PROMPT}\n\n"
        f"{context_block}\n\n"
        f"[사용자 질문]\n{question.strip()}"
    )

    response = get_client().models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            max_output_tokens=2048,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )
    record_gemini_call(response, user_id=user_id or None)

    text = (getattr(response, "text", "") or "").strip()
    if not text:
        raise RuntimeError("AI 응답이 비어 있습니다.")
    return text


async def ask_question_rag(
    digest_id: int,
    question: str,
    *,
    selected_text: str = "",
    page_number: int = 1,
    user_id: str = "",
) -> ChatAnswerResult:
    """1) 쿼리 확장 → 2) 문서 RAG + Google Search(병렬) → 3) 종합 답변."""
    search_queries = await expand_search_queries(
        question,
        selected_text=selected_text,
        user_id=user_id,
    )

    document_context, (search_summary, sources) = await asyncio.gather(
        asyncio.to_thread(
            retrieve_document_context,
            digest_id,
            question,
            selected_text=selected_text,
            page_number=page_number,
            search_queries=search_queries,
        ),
        search_external_context(
            question,
            selected_text=selected_text,
            search_queries=search_queries,
            user_id=user_id,
        ),
    )

    answer = await asyncio.to_thread(
        _generate_answer_sync,
        question,
        document_context=document_context,
        search_summary=search_summary,
        search_sources=sources,
        search_queries=search_queries,
        selected_text=selected_text,
        user_id=user_id,
    )

    return ChatAnswerResult(
        answer=answer,
        sources=sources,
        verified=bool(sources),
        search_queries=search_queries,
    )
