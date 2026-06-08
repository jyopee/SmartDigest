"""Shared Gemini API client configuration and lifecycle."""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from google import genai

# backend/에서 실행해도 프로젝트 루트의 .env를 읽도록 함.
# override=True: 셸/시스템에 남아 있는 예전 GEMINI_API_KEY(sk- 등)보다 .env를 우선함.
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"

_client: Optional[genai.Client] = None
_client_lock = threading.Lock()


def _normalize_api_key(raw: str) -> str:
    """Strip whitespace and optional surrounding quotes from .env values."""
    key = raw.strip()
    if len(key) >= 2 and key[0] == key[-1] and key[0] in "\"'":
        key = key[1:-1].strip()
    return key


def get_api_key() -> str:
    api_key = _normalize_api_key(os.getenv("GEMINI_API_KEY", ""))
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY 환경 변수가 설정되지 않았습니다. "
            "Google AI Studio(https://aistudio.google.com/apikey)에서 "
            "API 키를 발급한 뒤 .env 파일에 설정해 주세요."
        )
    if api_key.startswith("sk-"):
        raise RuntimeError(
            "GEMINI_API_KEY에 OpenAI 형식의 키(sk-...)가 설정되어 있습니다. "
            "Google AI Studio(https://aistudio.google.com/apikey)에서 "
            "Gemini API 키(AIza... 또는 AQ....)를 발급해 .env에 넣어 주세요."
        )
    return api_key


def get_client() -> genai.Client:
    """Return a process-wide Gemini client (created once, reused safely)."""
    global _client

    if _client is not None:
        return _client

    with _client_lock:
        if _client is None:
            _client = genai.Client(api_key=get_api_key())
        return _client


def close_client() -> None:
    """Close the shared client on application shutdown."""
    global _client

    with _client_lock:
        if _client is None:
            return

        close_method = getattr(_client, "close", None)
        if callable(close_method):
            close_method()

        _client = None


def is_rate_limit_error(exc: BaseException) -> bool:
    if is_daily_quota_exhausted(exc):
        return True

    try:
        from google.genai import errors as genai_errors
    except ImportError:
        genai_errors = None  # type: ignore[assignment]

    if genai_errors is not None and isinstance(exc, genai_errors.APIError):
        if exc.code == 429:
            return True

    lowered = str(exc).lower()
    return any(
        token in lowered
        for token in (
            "429",
            "resource_exhausted",
            "resource exhausted",
            "rate limit",
            "too many requests",
            "quota",
        )
    )


def is_daily_quota_exhausted(exc: BaseException) -> bool:
    lowered = str(exc).lower()
    compact = lowered.replace("_", "").replace("-", "")
    return "freetier" in compact and (
        "perday" in compact
        or "perdayperprojectpermodel" in compact
        or "generate_requestsperday" in compact
    )


def is_retryable_api_error(exc: BaseException) -> bool:
    """Return True for transient errors; daily quota exhaustion is not retryable."""
    if is_daily_quota_exhausted(exc):
        return False

    try:
        from google.genai import errors as genai_errors
    except ImportError:
        genai_errors = None  # type: ignore[assignment]

    if genai_errors is not None and isinstance(exc, genai_errors.APIError):
        return exc.code in (429, 500, 503, 408)

    lowered = str(exc).lower()
    return any(
        token in lowered
        for token in ("429", "quota", "resource exhausted", "rate limit", "too many requests")
    )


def format_gemini_error(exc: BaseException) -> str:
    message = str(exc)
    lowered = message.lower()

    if is_daily_quota_exhausted(exc):
        return (
            f"Gemini API 무료 일일 한도(모델: {GEMINI_MODEL}, 하루 20회)를 초과했습니다. "
            "긴 문서는 청크마다 API를 호출하므로 요청 수가 빠르게 소진됩니다. "
            "내일 한도가 초기화된 뒤 다시 시도하거나, "
            "Google Cloud에서 결제를 활성화해 유료 할당량을 사용하세요. "
            "사용량: https://ai.dev/rate-limit"
        )
    if "resource_exhausted" in lowered or "429" in message:
        return (
            "Gemini API 요청 한도를 초과했습니다. "
            "잠시 후 다시 시도하거나, "
            "사용량을 확인하세요: https://ai.dev/rate-limit"
        )
    if "client has been closed" in lowered:
        return (
            "AI 클라이언트 연결이 종료되었습니다. "
            "백엔드를 재시작한 뒤 다시 시도해 주세요."
        )
    if (
        "permission_denied" in lowered
        or "api_key_invalid" in lowered
        or "api key not valid" in lowered
        or "api key" in lowered
        or "leaked" in lowered
    ):
        return (
            "Gemini API 키가 유효하지 않습니다. "
            "Google AI Studio(https://aistudio.google.com/apikey)에서 "
            "새 Gemini API 키(AIza... 또는 AQ....)를 발급해 "
            "프로젝트 루트 .env 파일의 GEMINI_API_KEY에 넣고 백엔드를 재시작해 주세요."
        )
    if "gemini_api_key" in lowered and "설정되지 않았습니다" in message:
        return message
    return message
