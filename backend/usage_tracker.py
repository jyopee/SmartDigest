"""Gemini API usage logging and daily quota helpers."""

from __future__ import annotations

from contextvars import ContextVar
from datetime import date
from typing import Any, Optional

import database as db

FREE_TIER_DAILY_LIMIT = 20

_current_user_id: ContextVar[Optional[str]] = ContextVar("usage_user_id", default=None)


def set_usage_user(user_id: Optional[str]):
    return _current_user_id.set(user_id)


def reset_usage_user(token) -> None:
    _current_user_id.reset(token)


def today_str() -> str:
    return date.today().isoformat()


def extract_tokens_from_response(response: Any) -> int:
    usage = getattr(response, "usage_metadata", None)
    if usage is None:
        return 0

    total = getattr(usage, "total_token_count", None)
    if total is not None:
        return int(total)

    prompt = int(getattr(usage, "prompt_token_count", 0) or 0)
    candidates = int(getattr(usage, "candidates_token_count", 0) or 0)
    return prompt + candidates


def record_gemini_call(response: Any, user_id: Optional[str] = None) -> None:
    resolved_user_id = user_id or _current_user_id.get()
    if not resolved_user_id:
        return
    db.log_usage(
        resolved_user_id,
        extract_tokens_from_response(response),
        today_str(),
    )


def get_daily_usage(user_id: str) -> dict[str, int | str]:
    summary = db.get_usage_summary(user_id, today_str())
    used_count = int(summary["call_count"])
    remaining = max(0, FREE_TIER_DAILY_LIMIT - used_count)
    percent = min(
        100,
        int((used_count / FREE_TIER_DAILY_LIMIT) * 100)
        if FREE_TIER_DAILY_LIMIT
        else 0,
    )
    return {
        "date": today_str(),
        "user_id": user_id,
        "used_count": used_count,
        "call_count": used_count,
        "tokens_used": summary["tokens_used"],
        "limit": FREE_TIER_DAILY_LIMIT,
        "remaining": remaining,
        "percent": percent,
    }


def is_quota_exhausted(user_id: str) -> bool:
    used_count = int(get_daily_usage(user_id)["used_count"])
    return used_count >= FREE_TIER_DAILY_LIMIT


def sync_usage_to_limit(user_id: str) -> dict[str, int | str]:
    """Align server usage count with API rate-limit exhaustion (429)."""
    summary = db.get_usage_summary(user_id, today_str())
    gap = FREE_TIER_DAILY_LIMIT - int(summary["call_count"])
    for _ in range(max(0, gap)):
        db.log_usage(user_id, 0, today_str())
    return get_daily_usage(user_id)
