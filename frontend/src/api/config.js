/** axios 공통 timeout — Gemini 요약 등 장시간 작업 대응 (5분) */
export const API_TIMEOUT = 300_000;

/**
 * API base URL 결정
 *
 * [권장] VITE_API_BASE=http://127.0.0.1:8000
 *   → axios가 백엔드에 직접 연결 (Windows IPv6 localhost 이슈 회피, 백엔드 로그 확인 가능)
 *
 * [대안] VITE_USE_PROXY=true + VITE_API_BASE 비움
 *   → /api/... 상대 경로 → Vite dev server(5173) 프록시 → 127.0.0.1:8000
 */
function resolveApiBase() {
  const explicit = import.meta.env.VITE_API_BASE;
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  if (import.meta.env.DEV && import.meta.env.VITE_USE_PROXY === "true") {
    return "";
  }

  if (import.meta.env.DEV) {
    return "http://127.0.0.1:8000";
  }

  return "";
}

export const API_BASE = resolveApiBase();

/** SSE summary stream URL (EventSource는 axios baseURL을 쓰지 않음) */
export function getSummaryStreamUrl(jobId) {
  const base = API_BASE.replace(/\/$/, "");
  return `${base}/api/summary/stream/${jobId}`;
}

/** 개발 중 실제 요청 대상 (디버깅용) */
export const API_MODE =
  API_BASE === ""
    ? "proxy (/api → vite → 127.0.0.1:8000)"
    : `direct (${API_BASE})`;

if (import.meta.env.DEV) {
  console.info(`[SmartDigest API] ${API_MODE}`);
}
