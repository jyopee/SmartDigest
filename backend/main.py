import sys
from pathlib import Path

# Vercel entrypoint(backend.main:app) loads this module from the repo root.
# Ensure sibling modules (database, summary_service, …) resolve like local uvicorn.
_backend_dir = Path(__file__).resolve().parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

import json
import asyncio
import os
from typing import Any, Literal, Optional
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

import database as db
import summary_service as summary_jobs
from chat_engine import ask_question_rag
from document_extractor import extract_text_from_upload
from gemini_client import close_client, format_gemini_error
from summary_cards import (
    add_card_from_source,
    build_default_mindmap_layout,
    build_smart_layout,
    build_storage_payload,
    is_mindmap_layout,
    normalize_layout_for_cards,
    parse_digest_content,
    remove_card_from_grid,
)
from summary_engine import map_reduce_summarize
from usage_tracker import (
    get_daily_usage,
    is_quota_exhausted,
    reset_usage_user,
    set_usage_user,
    sync_usage_to_limit,
)

# --- Lifespan for Startup/Shutdown ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield
    close_client()

app = FastAPI(title="SmartDigest API", version="1.0.0", lifespan=lifespan)

_cors_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_cors_origins.extend(
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
)
_vercel_url = os.getenv("VERCEL_URL", "").strip()
if _vercel_url:
    _cors_origins.append(f"https://{_vercel_url}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Schemas ---

class AuthRequest(BaseModel):
    userid: str = Field(min_length=3)
    password: str = Field(min_length=1)

class RenameRequest(BaseModel):
    userid: str
    old_filename: str
    new_filename: str

class AnnotationRequest(BaseModel):
    digest_id: int
    selected_text: str
    comment: str
    page_number: int = Field(default=1, ge=1)

class AnnotationUpdateRequest(BaseModel):
    comment: str

class NoteRequest(BaseModel):
    digest_id: int
    selected_text: str = ""
    content: str
    page_number: int = Field(default=1, ge=1)

class NoteUpdateRequest(BaseModel):
    content: str

class ChatAskRequest(BaseModel):
    digest_id: int
    user_id: str
    question: str
    selected_text: str = ""
    page_number: int = Field(default=1, ge=1)

class SplitPointRecord(BaseModel):
    anchor: str = ""
    block_index: int = Field(default=-1, ge=-1)

class PageSaveRequest(BaseModel):
    content: str

class PageSplitsSaveRequest(BaseModel):
    split_points: list[SplitPointRecord] = []

class GridLayoutSaveRequest(BaseModel):
    layout: Any

class LayoutSnapshotCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    layout: Any
    cards: list | None = None

class OriginalSnapshotRefreshRequest(BaseModel):
    layout: Any
    cards: list | None = None


def _layout_has_content(layout: Any) -> bool:
    if not layout:
        return False
    if isinstance(layout, list):
        return len(layout) > 0
    if is_mindmap_layout(layout):
        return len(layout.get("nodes") or []) > 0
    return False

class GridCardFromSourceRequest(BaseModel):
    source: Literal["note", "chat"]
    source_id: int = Field(ge=1)

# --- Routes ---

@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.post("/api/auth/register")
async def register(body: AuthRequest):
    if not db.add_user(body.userid, body.password):
        raise HTTPException(status_code=409, detail="이미 존재하는 아이디입니다.")
    return {"status": "success", "userid": body.userid}

@app.post("/api/auth/login")
async def login(body: AuthRequest):
    if not db.check_user(body.userid, body.password):
        raise HTTPException(status_code=401, detail="계정 정보가 틀립니다.")
    return {"status": "success", "userid": body.userid}

@app.get("/api/digests")
async def list_digests(user_id: str = Query(...), search: Optional[str] = None):
    rows = db.search_my_digests(user_id, search) if search else db.get_my_digests(user_id)
    return [{"id": d[0], "filename": d[1], "content": d[2]} for d in rows]

@app.get("/api/digests/{digest_id}")
async def get_digest(digest_id: int, user_id: str = Query(...)):
    digest = db.get_digest_by_id(user_id, digest_id)
    if not digest:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    return digest

@app.patch("/api/digests/{digest_id}/filename")
async def rename_digest(digest_id: int, body: RenameRequest):
    digest = db.get_digest_by_id(body.userid, digest_id)
    if not digest:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    if digest["filename"] != body.old_filename:
        raise HTTPException(status_code=400, detail="현재 파일명과 일치하지 않습니다.")
    db.update_filename(body.userid, body.old_filename, body.new_filename)
    return {"status": "success", "filename": body.new_filename}

@app.delete("/api/digests/{digest_id}")
async def delete_digest(digest_id: int, user_id: str = Query(...)):
    if not db.delete_digest_by_id(user_id, digest_id):
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    return {"status": "success"}

QUOTA_EXCEEDED_MESSAGE = "오늘의 학습 한도를 모두 사용했습니다."


@app.get("/api/usage/today")
async def get_usage_today(user_id: str = Query(...)):
    return get_daily_usage(user_id)


@app.post("/api/usage/mark-exhausted")
async def mark_usage_exhausted(user_id: str = Query(...)):
    """Sync DB usage to daily limit after a 429 / rate-limit response."""
    return sync_usage_to_limit(user_id)


@app.post("/api/summary/start")
async def start_summary(
    background_tasks: BackgroundTasks,
    user_id: str = Form(...),
    file: UploadFile = File(...),
):
    if is_quota_exhausted(user_id):
        raise HTTPException(status_code=429, detail=QUOTA_EXCEEDED_MESSAGE)

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")

    job_id = summary_jobs.create_job(user_id, file.filename)
    background_tasks.add_task(
        summary_jobs.run_summary_job,
        job_id,
        user_id,
        file.filename,
        raw,
    )
    return {
        "status": "started",
        "job_id": job_id,
        "message": "분석이 시작되었습니다.",
    }


async def _summary_event_generator(job_id: str):
    while True:
        job = summary_jobs.get_job(job_id)
        if not job:
            yield {
                "event": "error",
                "data": json.dumps({"message": "작업을 찾을 수 없습니다."}, ensure_ascii=False),
            }
            break

        payload = {
            "progress": job["progress"],
            "message": job["message"],
            "status": job["status"],
        }

        if job["status"] == "completed":
            payload["digest_id"] = job["digest_id"]
            payload["chunks_processed"] = job["chunks_processed"]
            yield {
                "event": "progress",
                "data": json.dumps(payload, ensure_ascii=False),
            }
            yield {
                "event": "done",
                "data": json.dumps(payload, ensure_ascii=False),
            }
            break

        if job["status"] == "error":
            payload["error"] = job["error"]
            yield {
                "event": "error",
                "data": json.dumps(payload, ensure_ascii=False),
            }
            break

        yield {
            "event": "progress",
            "data": json.dumps(payload, ensure_ascii=False),
        }
        await asyncio.sleep(0.5)


@app.get("/api/summary/stream/{job_id}")
async def stream_summary(job_id: str):
    if not summary_jobs.get_job(job_id):
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    return EventSourceResponse(_summary_event_generator(job_id))


@app.post("/api/digest/upload")
async def upload_document(user_id: str = Form(...), file: UploadFile = File(...)):
    if is_quota_exhausted(user_id):
        raise HTTPException(status_code=429, detail=QUOTA_EXCEEDED_MESSAGE)

    existing = db.get_digest_by_filename(user_id, file.filename)
    if existing:
        return {
            "status": "already_exists",
            "digest_id": existing["id"],
            "summary": existing["content"],
            "chunks_processed": 0,
            "message": "이미 요약된 문서입니다. 기존 결과를 반환합니다.",
        }

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")

    _text, source_chunks = extract_text_from_upload(file.filename, raw, user_id=user_id)
    if not source_chunks:
        raise HTTPException(status_code=400, detail="추출된 텍스트가 없습니다.")

    usage_token = set_usage_user(user_id)
    try:
        result = await map_reduce_summarize(source_chunks, user_id=user_id)
    finally:
        reset_usage_user(usage_token)
    pages = result["partial_summaries"] or [result["summary"]]
    default_layout = build_default_mindmap_layout(result.get("cards") or [])
    digest_id = db.save_digest_with_pages_and_layout(
        user_id,
        file.filename,
        result["summary"],
        pages,
        default_layout,
        cards=result.get("cards") or [],
    )
    return {
        "status": "success",
        "digest_id": digest_id,
        **result,
    }


@app.get("/api/digests/{digest_id}/grid")
async def get_digest_grid(digest_id: int, user_id: str = Query(...)):
    digest = db.get_digest_by_id(user_id, digest_id)
    if not digest:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")

    parsed = parse_digest_content(digest["content"])
    cards = parsed["cards"]
    raw_layout = db.get_digest_grid_layout(digest_id)
    layout = normalize_layout_for_cards(raw_layout, cards)
    should_persist = (
        _layout_has_content(layout)
        and (
            not raw_layout
            or (is_mindmap_layout(layout) and not is_mindmap_layout(raw_layout))
        )
    )
    if should_persist:
        db.save_digest_grid_layout(digest_id, layout)
    db.ensure_original_layout_snapshot(digest_id, layout, cards=cards)

    return {
        "digest_id": digest_id,
        "version": parsed["version"],
        "cards": cards,
        "layout": layout,
    }


@app.put("/api/digests/{digest_id}/grid/layout")
async def save_digest_grid_layout(
    digest_id: int,
    body: GridLayoutSaveRequest,
    user_id: str = Query(...),
):
    digest = db.get_digest_by_id(user_id, digest_id)
    if not digest:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")

    if not _layout_has_content(body.layout):
        raise HTTPException(status_code=400, detail="레이아웃이 비어 있습니다.")

    db.save_digest_grid_layout(digest_id, body.layout)
    return {"status": "success", "digest_id": digest_id, "layout": body.layout}


@app.get("/api/digests/{digest_id}/grid/snapshots")
async def list_digest_layout_snapshots(
    digest_id: int, user_id: str = Query(...)
):
    digest = db.get_digest_by_id(user_id, digest_id)
    if not digest:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")

    return {
        "digest_id": digest_id,
        "snapshots": db.list_layout_snapshots(digest_id),
    }


@app.post("/api/digests/{digest_id}/grid/snapshots")
async def create_digest_layout_snapshot(
    digest_id: int,
    body: LayoutSnapshotCreateRequest,
    user_id: str = Query(...),
):
    digest = db.get_digest_by_id(user_id, digest_id)
    if not digest:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")

    if not _layout_has_content(body.layout):
        raise HTTPException(status_code=400, detail="레이아웃이 비어 있습니다.")

    snapshot_name = body.name.strip()
    if snapshot_name == db.ORIGINAL_SNAPSHOT_NAME:
        raise HTTPException(
            status_code=400,
            detail=f"'{db.ORIGINAL_SNAPSHOT_NAME}'은(는) 예약된 스냅샷 이름입니다.",
        )

    snapshot = db.create_layout_snapshot(
        digest_id,
        snapshot_name,
        body.layout,
        cards=body.cards,
    )
    return {"status": "success", "snapshot": snapshot}


@app.put("/api/digests/{digest_id}/grid/snapshots/original")
async def refresh_digest_original_snapshot(
    digest_id: int,
    body: OriginalSnapshotRefreshRequest,
    user_id: str = Query(...),
):
    digest = db.get_digest_by_id(user_id, digest_id)
    if not digest:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")

    if not _layout_has_content(body.layout):
        raise HTTPException(status_code=400, detail="레이아웃이 비어 있습니다.")

    snapshot = db.refresh_original_layout_snapshot(
        digest_id,
        body.layout,
        cards=body.cards,
    )
    if not snapshot:
        raise HTTPException(status_code=500, detail="원본 스냅샷을 갱신하지 못했습니다.")

    return {"status": "success", "snapshot": snapshot}


@app.post("/api/digests/{digest_id}/grid/snapshots/{snapshot_id}/restore")
async def restore_digest_layout_snapshot(
    digest_id: int,
    snapshot_id: int,
    user_id: str = Query(...),
):
    digest = db.get_digest_by_id(user_id, digest_id)
    if not digest:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")

    snapshot = db.restore_layout_snapshot(digest_id, snapshot_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="스냅샷을 찾을 수 없습니다.")

    restored_cards = snapshot.get("cards")
    if restored_cards:
        db.update_digest_content(
            digest_id, build_storage_payload(restored_cards)
        )

    return {
        "status": "success",
        "digest_id": digest_id,
        "snapshot_id": snapshot_id,
        "layout": snapshot["layout"],
        "cards": restored_cards or [],
        "cards_restored": bool(restored_cards),
    }


@app.post("/api/digests/{digest_id}/grid/cards/from-source")
async def add_digest_grid_card_from_source(
    digest_id: int,
    body: GridCardFromSourceRequest,
    user_id: str = Query(...),
):
    digest = db.get_digest_by_id(user_id, digest_id)
    if not digest:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")

    if body.source == "note":
        payload = db.get_note_by_id(body.source_id)
        if not payload or payload["digest_id"] != digest_id:
            raise HTTPException(status_code=404, detail="주석을 찾을 수 없습니다.")
    else:
        payload = db.get_chat_by_id(body.source_id)
        if not payload or payload["digest_id"] != digest_id:
            raise HTTPException(status_code=404, detail="질문 기록을 찾을 수 없습니다.")

    parsed = parse_digest_content(digest["content"])
    layout = normalize_layout_for_cards(
        db.get_digest_grid_layout(digest_id), parsed["cards"]
    )
    try:
        card, next_layout, next_cards, already_exists = add_card_from_source(
            parsed["cards"],
            layout,
            body.source,
            payload,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not already_exists:
        db.update_digest_content(digest_id, build_storage_payload(next_cards))
        db.save_digest_grid_layout(digest_id, next_layout)

    return {
        "status": "success",
        "digest_id": digest_id,
        "card": card,
        "layout": next_layout,
        "already_exists": already_exists,
    }


@app.delete("/api/digests/{digest_id}/grid/cards/{card_id}")
async def delete_digest_grid_card(
    digest_id: int,
    card_id: str,
    user_id: str = Query(...),
):
    digest = db.get_digest_by_id(user_id, digest_id)
    if not digest:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")

    parsed = parse_digest_content(digest["content"])
    layout = normalize_layout_for_cards(
        db.get_digest_grid_layout(digest_id), parsed["cards"]
    )
    try:
        next_cards, next_layout = remove_card_from_grid(
            parsed["cards"], layout, card_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    db.update_digest_content(digest_id, build_storage_payload(next_cards))
    db.save_digest_grid_layout(digest_id, next_layout)

    return {
        "status": "success",
        "digest_id": digest_id,
        "card_id": card_id,
        "layout": next_layout,
    }


@app.delete("/api/digests/{digest_id}/grid/snapshots/{snapshot_id}")
async def delete_digest_layout_snapshot(
    digest_id: int,
    snapshot_id: int,
    user_id: str = Query(...),
):
    digest = db.get_digest_by_id(user_id, digest_id)
    if not digest:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")

    snapshot = db.get_layout_snapshot(digest_id, snapshot_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="스냅샷을 찾을 수 없습니다.")
    if snapshot.get("is_original"):
        raise HTTPException(
            status_code=403,
            detail="원본 스냅샷은 삭제할 수 없습니다.",
        )

    if not db.delete_layout_snapshot(digest_id, snapshot_id):
        raise HTTPException(status_code=404, detail="스냅샷을 찾을 수 없습니다.")

    return {"status": "success", "snapshot_id": snapshot_id}


@app.get("/api/digests/{digest_id}/pages")
async def get_digest_pages(digest_id: int, page: Optional[int] = Query(None, ge=1)):
    digest_exists = db.get_digest_content_by_id(digest_id)
    if digest_exists is None:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")

    if page is None:
        return db.get_digest_pages_meta(digest_id)

    page_data = db.get_digest_page(digest_id, page)
    if not page_data:
        raise HTTPException(status_code=404, detail="페이지를 찾을 수 없습니다.")

    meta = db.get_digest_pages_meta(digest_id)
    return {
        **page_data,
        "total_pages": meta["total_pages"],
        "digest_id": digest_id,
    }


@app.put("/api/digests/{digest_id}/pages")
async def save_digest_page(
    digest_id: int,
    body: PageSaveRequest,
    page: int = Query(..., ge=1),
):
    if db.get_digest_content_by_id(digest_id) is None:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")

    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="페이지 내용이 비어 있습니다.")

    if not db.update_digest_page(digest_id, page, content):
        raise HTTPException(status_code=404, detail="페이지를 찾을 수 없습니다.")

    meta = db.get_digest_pages_meta(digest_id)
    return {
        "status": "success",
        "digest_id": digest_id,
        "page_number": page,
        "content": content,
        "total_pages": meta["total_pages"],
    }


@app.put("/api/digests/{digest_id}/pages/splits")
async def save_digest_page_splits(
    digest_id: int,
    body: PageSplitsSaveRequest,
    page: int = Query(..., ge=1),
):
    if db.get_digest_content_by_id(digest_id) is None:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")

    split_points = [
        {"anchor": point.anchor.strip(), "block_index": point.block_index}
        for point in body.split_points
    ]

    if not db.update_digest_page_split_points(digest_id, page, split_points):
        raise HTTPException(status_code=404, detail="페이지를 찾을 수 없습니다.")

    page_data = db.get_digest_page(digest_id, page)
    meta = db.get_digest_pages_meta(digest_id)
    return {
        "status": "success",
        "digest_id": digest_id,
        "page_number": page,
        "split_points": page_data["split_points"] if page_data else [],
        "total_pages": meta["total_pages"],
    }


@app.get("/api/digests/{digest_id}/pages/export")
async def export_digest_page(digest_id: int, page: int = Query(..., ge=1)):
    page_data = db.get_digest_page(digest_id, page)
    if not page_data:
        raise HTTPException(status_code=404, detail="페이지를 찾을 수 없습니다.")

    digest = db.get_digest_by_id_for_export(digest_id)
    filename = digest["filename"] if digest else f"digest_{digest_id}"
    stem = filename.rsplit(".", 1)[0]
    return {
        "filename": f"{stem}_page{page}.md",
        "content": page_data["content"],
        "page_number": page,
        "digest_id": digest_id,
    }


@app.post("/api/annotation/save")
async def save_annotation(body: AnnotationRequest):
    db.ensure_digest_pages(body.digest_id)
    db.save_note(
        body.digest_id,
        body.selected_text.strip(),
        body.comment.strip(),
        body.page_number,
    )
    notes = db.get_notes(body.digest_id)
    return {"status": "success", "annotations": _notes_as_annotations(notes), "notes": notes}

@app.get("/api/annotation/{digest_id}")
async def get_annotations(digest_id: int, page: Optional[int] = Query(None, ge=1)):
    notes = db.get_notes(digest_id, page_number=page)
    return _notes_as_annotations(notes)

@app.put("/api/annotation/{annotation_id}")
async def update_annotation(annotation_id: int, body: AnnotationUpdateRequest):
    comment = body.comment.strip()
    if not comment:
        raise HTTPException(status_code=400, detail="주석 내용을 입력하세요.")
    digest_id = db.update_note_by_id(annotation_id, comment)
    if digest_id is None:
        raise HTTPException(status_code=404, detail="주석을 찾을 수 없습니다.")
    notes = db.get_notes(digest_id)
    return {"status": "success", "annotations": _notes_as_annotations(notes), "notes": notes}

@app.delete("/api/annotation/{annotation_id}")
async def delete_annotation(annotation_id: int):
    digest_id = db.delete_note_by_id(annotation_id)
    if digest_id is None:
        raise HTTPException(status_code=404, detail="주석을 찾을 수 없습니다.")
    notes = db.get_notes(digest_id)
    return {"status": "success", "annotations": _notes_as_annotations(notes), "notes": notes}


def _notes_as_annotations(notes: list[dict]) -> list[dict]:
    return [
        {
            "id": note["id"],
            "selected_text": note["selected_text"],
            "comment": note["content"],
            "page_number": note["page_number"],
        }
        for note in notes
    ]


@app.post("/api/notes/save")
async def save_note(body: NoteRequest):
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="주석 내용을 입력하세요.")
    db.ensure_digest_pages(body.digest_id)
    db.save_note(
        body.digest_id,
        body.selected_text.strip(),
        content,
        body.page_number,
    )
    return {"status": "success", "notes": db.get_notes(body.digest_id)}


@app.get("/api/notes/{digest_id}")
async def get_notes(digest_id: int, page: Optional[int] = Query(None, ge=1)):
    return db.get_notes(digest_id, page_number=page)


@app.put("/api/notes/{note_id}")
async def update_note(note_id: int, body: NoteUpdateRequest):
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="주석 내용을 입력하세요.")
    digest_id = db.update_note_by_id(note_id, content)
    if digest_id is None:
        raise HTTPException(status_code=404, detail="주석을 찾을 수 없습니다.")
    return {"status": "success", "notes": db.get_notes(digest_id)}


@app.delete("/api/notes/{note_id}")
async def delete_note(note_id: int):
    digest_id = db.delete_note_by_id(note_id)
    if digest_id is None:
        raise HTTPException(status_code=404, detail="주석을 찾을 수 없습니다.")
    return {"status": "success", "notes": db.get_notes(digest_id)}


@app.post("/api/chat/ask")
async def chat_ask(body: ChatAskRequest):
    question = body.question.strip()
    user_id = body.user_id.strip()
    if not question:
        raise HTTPException(status_code=400, detail="질문을 입력하세요.")
    if not user_id:
        raise HTTPException(status_code=400, detail="사용자 정보가 없습니다.")

    if is_quota_exhausted(user_id):
        raise HTTPException(status_code=429, detail=QUOTA_EXCEEDED_MESSAGE)

    if db.get_digest_content_by_id(body.digest_id) is None:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")

    usage_token = set_usage_user(user_id)
    try:
        result = await ask_question_rag(
            body.digest_id,
            question,
            selected_text=body.selected_text.strip(),
            page_number=body.page_number,
            user_id=user_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=format_gemini_error(exc)) from exc
    finally:
        reset_usage_user(usage_token)

    chat_id = db.save_chat_exchange(
        body.digest_id,
        question,
        result.answer,
        selected_text=body.selected_text.strip(),
        page_number=body.page_number,
        sources=result.sources,
        verified=result.verified,
    )
    chats = db.get_chat_history(body.digest_id)
    created = next((c for c in chats if c["id"] == chat_id), None)
    return {"status": "success", "chat": created, "chats": chats}


@app.get("/api/chat/{digest_id}")
async def get_chats(digest_id: int, page: Optional[int] = Query(None, ge=1)):
    return db.get_chat_history(digest_id, page_number=page)


@app.delete("/api/chat/{chat_id}")
async def delete_chat(chat_id: int):
    digest_id = db.delete_chat_by_id(chat_id)
    if digest_id is None:
        raise HTTPException(status_code=404, detail="질문 기록을 찾을 수 없습니다.")
    return {"status": "success", "chats": db.get_chat_history(digest_id)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
