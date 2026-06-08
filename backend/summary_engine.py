"""Async map-reduce summarization engine."""

from __future__ import annotations

import asyncio
from typing import Any, Awaitable, Callable, Optional

from gemini_client import GEMINI_MODEL, get_client, is_retryable_api_error
from summary_cards import (
    CARD_JSON_INSTRUCTION,
    build_storage_payload,
    cards_to_markdown,
    merge_partial_card_lists,
    parse_cards_json,
)
from usage_tracker import record_gemini_call
from google.genai import types
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

MAX_CONCURRENT_CHUNKS = 2
MAP_MAX_OUTPUT_TOKENS = 4096
REDUCE_MAX_OUTPUT_TOKENS = 8192
API_RETRY_ATTEMPTS = 8
API_RETRY_MIN_WAIT_SEC = 4
API_RETRY_MAX_WAIT_SEC = 60

ProgressCallback = Callable[[Optional[int], str, Optional[int]], Awaitable[None] | None]


def _build_generate_config(max_output_tokens: int) -> types.GenerateContentConfig:
    return types.GenerateContentConfig(
        max_output_tokens=max_output_tokens,
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )


def _build_map_prompt(chunk_info: dict, chunk_text: str) -> str:
    if "start_page" in chunk_info:
        page_label = f"p.{chunk_info['start_page']}-{chunk_info['end_page']}"
        context = f"문서 일부({page_label})"
        page_number = int(chunk_info.get("start_page") or 1)
    else:
        context = "문서 일부"
        page_number = 1

    return (
        f"다음은 긴 문서의 {context}입니다. "
        "내용을 주제(Main) 카드와 상세(Details) 카드로 구분해 한국어 요약하세요. "
        f"각 카드의 page_number는 {page_number}로 설정하세요. "
        f"{CARD_JSON_INSTRUCTION}\n\n"
        f"{chunk_text}"
    )


REDUCE_PROMPT_PREFIX = (
    "아래는 긴 문서를 구간별로 나눠 작성한 카드 JSON 요약들입니다. "
    "중복 카드를 제거·통합하고, 주제(Main)와 상세(Details) 구분을 유지한 "
    "최종 cards JSON을 작성하세요. "
    f"{CARD_JSON_INSTRUCTION}\n\n"
)


@retry(
    retry=retry_if_exception(is_retryable_api_error),
    stop=stop_after_attempt(API_RETRY_ATTEMPTS),
    wait=wait_exponential(
        multiplier=2,
        min=API_RETRY_MIN_WAIT_SEC,
        max=API_RETRY_MAX_WAIT_SEC,
    ),
    reraise=True,
)
def _generate_summary_sync(
    prompt: str,
    max_output_tokens: int,
    user_id: Optional[str] = None,
) -> str:
    response = get_client().models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=_build_generate_config(max_output_tokens),
    )
    record_gemini_call(response, user_id=user_id)
    text = (getattr(response, "text", "") or "").strip()
    if not text:
        raise RuntimeError(f"{GEMINI_MODEL} 응답이 비어 있습니다.")
    return text


async def generate_summary(
    prompt: str,
    *,
    max_output_tokens: int = MAP_MAX_OUTPUT_TOKENS,
    user_id: Optional[str] = None,
) -> str:
    return await asyncio.to_thread(
        _generate_summary_sync,
        prompt,
        max_output_tokens,
        user_id,
    )


async def _summarize_chunk(
    chunk_info: dict,
    idx: int,
    total: int,
    semaphore: asyncio.Semaphore,
    on_progress: Optional[ProgressCallback],
    user_id: Optional[str],
) -> str:
    async with semaphore:
        if on_progress:
            await _emit_progress(on_progress, None, f"청크 {idx}/{total} 분석 중...")

        map_prompt = _build_map_prompt(chunk_info, chunk_info["text"])
        summary_text = await generate_summary(map_prompt, user_id=user_id)

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
    user_id: Optional[str] = None,
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
            chunk_info, idx, total, semaphore, on_progress=None, user_id=user_id
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
    partial_card_lists = [parse_cards_json(text) for text in partial_summaries]

    if total == 1:
        final_cards = partial_card_lists[0]
        final_text = build_storage_payload(final_cards)
    else:
        if on_progress:
            await _emit_progress(on_progress, 88, "최종 통합 중...")

        reduce_prompt = REDUCE_PROMPT_PREFIX + "\n\n---\n\n".join(partial_summaries)

        try:
            reduced_text = await generate_summary(
                reduce_prompt,
                max_output_tokens=REDUCE_MAX_OUTPUT_TOKENS,
                user_id=user_id,
            )
            final_cards = parse_cards_json(reduced_text)
            if not final_cards:
                final_cards = merge_partial_card_lists(partial_card_lists)
            final_text = build_storage_payload(final_cards)
        except Exception:
            final_cards = merge_partial_card_lists(partial_card_lists)
            final_text = build_storage_payload(final_cards)

    page_markdowns = []
    for cards, text in zip(partial_card_lists, partial_summaries):
        page_markdowns.append(cards_to_markdown(cards) if cards else text)

    return {
        "summary": final_text,
        "cards": final_cards,
        "chunks_processed": total,
        "partial_summaries": page_markdowns,
    }
