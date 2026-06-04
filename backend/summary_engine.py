"""Async map-reduce summarization engine."""

from __future__ import annotations

import asyncio
import os
from typing import Any, Awaitable, Callable, Optional

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

GEMINI_MODEL = "gemini-2.5-flash"
MAX_CONCURRENT_CHUNKS = 4
MAP_MAX_OUTPUT_TOKENS = 4096
REDUCE_MAX_OUTPUT_TOKENS = 8192
API_RETRY_ATTEMPTS = 8
API_RETRY_MIN_WAIT_SEC = 4
API_RETRY_MAX_WAIT_SEC = 60

API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyCU7obwVNIY3Rqy4iffaLQtmuIHRhaet5k")
client = genai.Client(api_key=API_KEY)

ProgressCallback = Callable[[Optional[int], str, Optional[int]], Awaitable[None] | None]


def _is_retryable_api_error(exc: BaseException) -> bool:
    if isinstance(exc, genai_errors.APIError):
        return exc.code in (429, 500, 503, 408)
    message = str(exc).lower()
    return any(
        token in message
        for token in ("429", "quota", "resource exhausted", "rate limit", "too many requests")
    )


def _build_generate_config(max_output_tokens: int) -> types.GenerateContentConfig:
    return types.GenerateContentConfig(
        max_output_tokens=max_output_tokens,
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )


def _build_map_prompt(chunk_info: dict, chunk_text: str) -> str:
    if "start_page" in chunk_info:
        page_label = f"p.{chunk_info['start_page']}-{chunk_info['end_page']}"
        context = f"문서 일부({page_label})"
    else:
        context = "문서 일부"

    return (
        f"다음은 긴 문서의 {context}입니다. "
        "핵심 주제, 주요 논점, 중요한 수치·사실, 결론을 빠짐없이 한국어로 요약하세요. "
        "원문에 없는 내용은 추가하지 마세요.\n\n"
        f"{chunk_text}"
    )


REDUCE_PROMPT_PREFIX = (
    "아래는 긴 문서를 구간별로 나눠 작성한 부분 요약들입니다. "
    "중복을 제거하고, 전체 흐름이 자연스럽게 이어지도록 "
    "가독성 높은 마크다운 구조(제목, 소제목, 불릿)로 최종 통합 요약을 작성하세요.\n\n"
)


@retry(
    retry=retry_if_exception(_is_retryable_api_error),
    stop=stop_after_attempt(API_RETRY_ATTEMPTS),
    wait=wait_exponential(
        multiplier=2,
        min=API_RETRY_MIN_WAIT_SEC,
        max=API_RETRY_MAX_WAIT_SEC,
    ),
    reraise=True,
)
def _generate_summary_sync(prompt: str, max_output_tokens: int) -> str:
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=_build_generate_config(max_output_tokens),
    )
    text = (getattr(response, "text", "") or "").strip()
    if not text:
        raise RuntimeError(f"{GEMINI_MODEL} 응답이 비어 있습니다.")
    return text


async def generate_summary(
    prompt: str,
    *,
    max_output_tokens: int = MAP_MAX_OUTPUT_TOKENS,
) -> str:
    return await asyncio.to_thread(_generate_summary_sync, prompt, max_output_tokens)


async def _summarize_chunk(
    chunk_info: dict,
    idx: int,
    total: int,
    semaphore: asyncio.Semaphore,
    on_progress: Optional[ProgressCallback],
) -> str:
    async with semaphore:
        if on_progress:
            await _emit_progress(on_progress, None, f"청크 {idx}/{total} 분석 중...")

        map_prompt = _build_map_prompt(chunk_info, chunk_info["text"])
        summary_text = await generate_summary(map_prompt)

        if on_progress:
            await _emit_progress(on_progress, None, f"청크 {idx}/{total} 완료")

        return summary_text


async def _emit_progress(
    callback: ProgressCallback,
    progress: Optional[int],
    message: str,
) -> None:
    result = callback(progress, message, None)
    if asyncio.iscoroutine(result):
        await result


def _calc_map_progress(completed: int, total: int) -> int:
    map_start, map_end = 5, 85
    if total <= 0:
        return map_start
    return map_start + int(completed / total * (map_end - map_start))


async def map_reduce_summarize(
    source_chunks: list[dict],
    on_progress: Optional[ProgressCallback] = None,
) -> dict[str, Any]:
    total = len(source_chunks)
    if total == 0:
        raise ValueError("요약할 청크가 없습니다.")

    if on_progress:
        await _emit_progress(
            on_progress,
            5,
            f"텍스트 추출 완료. {total}개 청크 병렬 분석을 시작합니다.",
        )

    semaphore = asyncio.Semaphore(min(MAX_CONCURRENT_CHUNKS, total))
    completed = 0
    progress_lock = asyncio.Lock()

    async def track_progress(idx: int, chunk_info: dict) -> str:
        nonlocal completed
        if on_progress:
            await _emit_progress(
                on_progress,
                _calc_map_progress(completed, total),
                f"청크 {idx}/{total} 분석 중...",
            )
        summary = await _summarize_chunk(
            chunk_info, idx, total, semaphore, on_progress=None
        )
        async with progress_lock:
            completed += 1
            if on_progress:
                pct = _calc_map_progress(completed, total)
                await _emit_progress(
                    on_progress,
                    pct,
                    f"청크 {idx}/{total} 완료 ({completed}/{total} 처리됨)",
                )
        return summary

    tasks = [
        track_progress(idx, chunk_info)
        for idx, chunk_info in enumerate(source_chunks, start=1)
    ]
    partial_summaries = list(await asyncio.gather(*tasks))

    if total == 1:
        final_text = partial_summaries[0]
    else:
        if on_progress:
            await _emit_progress(on_progress, 88, "최종 통합 중...")

        reduce_prompt = REDUCE_PROMPT_PREFIX + "\n\n---\n\n".join(partial_summaries)

        try:
            final_text = await generate_summary(
                reduce_prompt,
                max_output_tokens=REDUCE_MAX_OUTPUT_TOKENS,
            )
        except Exception:
            final_text = "\n\n---\n\n".join(partial_summaries)

    return {
        "summary": final_text,
        "chunks_processed": total,
        "partial_summaries": partial_summaries,
    }
