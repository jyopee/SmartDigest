"""Gemini-powered Q&A for selected document excerpts."""

from __future__ import annotations

import asyncio

from gemini_client import GEMINI_MODEL, get_client, is_retryable_api_error
from google.genai import types
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)


@retry(
    retry=retry_if_exception(is_retryable_api_error),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=3, max=30),
    reraise=True,
)
def _ask_sync(question: str, selected_text: str, page_content: str) -> str:
    context_parts = []
    if page_content.strip():
        context_parts.append(f"[페이지 요약]\n{page_content.strip()}")
    if selected_text.strip():
        context_parts.append(f"[선택한 텍스트]\n{selected_text.strip()}")

    context_block = "\n\n".join(context_parts) if context_parts else "(컨텍스트 없음)"

    prompt = (
        "당신은 문서 요약을 돕는 AI 조교입니다. "
        "아래 문서 맥락만 근거로 사용해 사용자 질문에 한국어로 답하세요. "
        "맥락에 없는 내용은 추측하지 말고, 모르면 모른다고 말하세요.\n\n"
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
    text = (getattr(response, "text", "") or "").strip()
    if not text:
        raise RuntimeError("AI 응답이 비어 있습니다.")
    return text


async def ask_question(
    question: str,
    *,
    selected_text: str = "",
    page_content: str = "",
) -> str:
    return await asyncio.to_thread(
        _ask_sync,
        question,
        selected_text,
        page_content,
    )
