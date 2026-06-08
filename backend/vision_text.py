"""Extract text from slide images using Gemini vision."""

from __future__ import annotations

from typing import Sequence

from gemini_client import GEMINI_MODEL, get_client, is_retryable_api_error
from usage_tracker import record_gemini_call
from google.genai import types
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

OCR_PROMPT = (
    "이 슬라이드 이미지에 보이는 모든 텍스트를 빠짐없이 추출하세요. "
    "제목, 본문, 표, 각주, 불릿 목록을 원문 순서대로 적으세요. "
    "설명·요약·해석은 하지 말고 텍스트만 출력하세요. "
    "읽을 수 있는 텍스트가 없으면 빈 문자열만 반환하세요."
)


@retry(
    retry=retry_if_exception(is_retryable_api_error),
    stop=stop_after_attempt(6),
    wait=wait_exponential(multiplier=2, min=3, max=45),
    reraise=True,
)
def _ocr_image_sync(
    image_bytes: bytes,
    mime_type: str,
    slide_number: int,
    user_id: str | None = None,
) -> str:
    response = get_client().models.generate_content(
        model=GEMINI_MODEL,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            f"{OCR_PROMPT}\n(슬라이드 번호: {slide_number})",
        ],
        config=types.GenerateContentConfig(
            max_output_tokens=4096,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )
    record_gemini_call(response, user_id=user_id)
    return (getattr(response, "text", "") or "").strip()


def extract_text_from_slide_images(
    images: Sequence[tuple[bytes, str]],
    *,
    slide_number: int,
    user_id: str | None = None,
) -> str:
    parts: list[str] = []
    for image_bytes, mime_type in images:
        if not image_bytes:
            continue
        text = _ocr_image_sync(image_bytes, mime_type, slide_number, user_id)
        if text:
            parts.append(text)
    return "\n\n".join(parts)
