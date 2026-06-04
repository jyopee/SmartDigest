# SmartDigest

FastAPI 백엔드 + React 프론트엔드로 분리된 지식 요약/주석 앱입니다.

## 실행 방법

### 1. 백엔드 (FastAPI)

```bash
cd backend
pip install -r ../requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

API 문서: http://127.0.0.1:8000/docs

환경 변수 (선택):

- `GEMINI_API_KEY` — Gemini API 키 (미설정 시 코드 내 기본값 사용)

### 2. 프론트엔드 (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

브라우저: http://localhost:5173

Vite dev server가 `/api` 요청을 `http://127.0.0.1:8000`으로 프록시합니다.  
CORS는 FastAPI `CORSMiddleware`에서 `localhost:5173` 등을 허용하도록 설정되어 있습니다.

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/auth/register` | 회원가입 |
| POST | `/api/auth/login` | 로그인 |
| GET | `/api/digests` | 문서 목록 |
| GET | `/api/digests/{id}` | 문서 상세 |
| POST | `/api/summary/start` | 파일 업로드 후 비동기 요약 작업 시작 (`job_id` 반환) |
| GET | `/api/summary/stream/{job_id}` | SSE로 요약 진행률 스트리밍 |
| POST | `/api/digest/upload` | (레거시) 동기 업로드 및 AI 요약 |
| PATCH | `/api/digests/{id}/filename` | 파일명 변경 |
| DELETE | `/api/digests/{id}` | 문서 삭제 |
| GET | `/api/annotation/{digest_id}` | 주석 목록 |
| POST | `/api/annotation/save` | 주석 저장 |

## 프론트엔드 기능

- 로그인 / 회원가입
- 문서 목록, 검색, 이름 변경, 삭제
- PDF/DOCX 업로드 및 AI 요약
- 마크다운 요약본 렌더링
- 텍스트 드래그 → 커서 위치 주석 모달 → 저장 후 노란 하이라이트
- 하이라이트 hover 시 주석 툴팁 표시

## 레거시

루트의 `app.py`는 이전 Streamlit 버전입니다. 새 구조 사용을 권장합니다.
