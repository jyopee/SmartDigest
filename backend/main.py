import json
import asyncio
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

import database as db
import summary_service as summary_jobs
from document_extractor import extract_text_from_upload
from summary_engine import map_reduce_summarize

# --- Lifespan for Startup/Shutdown ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield

app = FastAPI(title="SmartDigest API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
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

@app.post("/api/summary/start")
async def start_summary(
    background_tasks: BackgroundTasks,
    user_id: str = Form(...),
    file: UploadFile = File(...),
):
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

    _text, source_chunks = extract_text_from_upload(file.filename, raw)
    if not source_chunks:
        raise HTTPException(status_code=400, detail="추출된 텍스트가 없습니다.")

    result = await map_reduce_summarize(source_chunks)
    db.save_digest(user_id, file.filename, result["summary"])
    digests = db.get_my_digests(user_id)
    return {
        "status": "success",
        "digest_id": digests[0][0] if digests else None,
        **result,
    }

@app.post("/api/annotation/save")
async def save_annotation(body: AnnotationRequest):
    db.save_selection_comment(body.digest_id, body.selected_text.strip(), body.comment.strip())
    return {"status": "success", "annotations": db.get_selection_comments(body.digest_id)}

@app.get("/api/annotation/{digest_id}")
async def get_annotations(digest_id: int):
    return db.get_selection_comments(digest_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
