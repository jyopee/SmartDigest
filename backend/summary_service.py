"""In-memory summary job tracking and async background summarization."""

from __future__ import annotations

import uuid
from typing import Any, Optional

import database as db
from document_extractor import extract_text_from_upload
from gemini_client import format_gemini_error, is_rate_limit_error
from usage_tracker import sync_usage_to_limit
from summary_cards import build_smart_layout
from summary_engine import map_reduce_summarize
from usage_tracker import reset_usage_user, set_usage_user

_jobs: dict[str, dict[str, Any]] = {}


def create_job(user_id: str, filename: str) -> str:
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "message": "분석 대기 중...",
        "user_id": user_id,
        "filename": filename,
        "digest_id": None,
        "summary": None,
        "chunks_processed": 0,
        "error": None,
    }
    return job_id


def get_job(job_id: str) -> Optional[dict[str, Any]]:
    job = _jobs.get(job_id)
    return dict(job) if job else None


def update_job(job_id: str, **fields: Any) -> None:
    if job_id in _jobs:
        _jobs[job_id].update(fields)


def _complete_with_existing_digest(
    job_id: str,
    existing: dict[str, Any],
) -> None:
    update_job(
        job_id,
        status="completed",
        progress=100,
        message="이미 요약된 문서입니다. 기존 결과를 사용합니다.",
        digest_id=existing["id"],
        summary=existing["content"],
        chunks_processed=0,
    )


async def run_summary_job(
    job_id: str,
    user_id: str,
    filename: str,
    raw: bytes,
) -> None:
    usage_token = set_usage_user(user_id)
    try:
        update_job(
            job_id,
            status="running",
            progress=1,
            message="기존 요약 여부를 확인하는 중...",
        )

        existing = db.get_digest_by_filename(user_id, filename)
        if existing:
            _complete_with_existing_digest(job_id, existing)
            return

        is_pptx = filename.lower().endswith(".pptx")
        update_job(
            job_id,
            progress=2,
            message=(
                "PPTX 분석 중... 이미지 슬라이드는 OCR로 텍스트를 읽습니다."
                if is_pptx
                else "파일에서 텍스트를 추출하는 중..."
            ),
        )

        _text, source_chunks = extract_text_from_upload(filename, raw, user_id=user_id)
        if not source_chunks:
            raise ValueError("추출된 텍스트가 없습니다.")

        async def on_progress(progress: Optional[int], message: str, _extra: Optional[int]) -> None:
            fields: dict[str, Any] = {"message": message}
            if progress is not None:
                fields["progress"] = progress
            update_job(job_id, **fields)

        result = await map_reduce_summarize(
            source_chunks,
            on_progress=on_progress,
            user_id=user_id,
        )

        update_job(job_id, progress=95, message="요약 결과를 저장하는 중...")
        pages = result["partial_summaries"] or [result["summary"]]
        default_layout = build_smart_layout(result.get("cards") or [])
        digest_id = db.save_digest_with_pages_and_layout(
            user_id,
            filename,
            result["summary"],
            pages,
            default_layout,
        )

        update_job(
            job_id,
            status="completed",
            progress=100,
            message="분석이 완료되었습니다.",
            digest_id=digest_id,
            chunks_processed=result["chunks_processed"],
            summary=result["summary"],
        )
    except Exception as exc:
        if is_rate_limit_error(exc):
            sync_usage_to_limit(user_id)
        update_job(
            job_id,
            status="error",
            message="분석 중 오류가 발생했습니다.",
            error=format_gemini_error(exc),
        )
    finally:
        reset_usage_user(usage_token)
