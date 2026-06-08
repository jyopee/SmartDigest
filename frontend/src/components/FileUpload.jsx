import { useEffect, useRef, useState } from "react";
import { startSummary } from "../api/client";
import { getSummaryStreamUrl } from "../api/config";
import {
  getQuotaStats,
  isRateLimitError,
} from "../api/usageService";

export default function FileUpload({
  userId,
  onUploaded,
  usage,
  onUsageRefresh,
  onQuotaExhausted,
  onUploadStarted,
  embedded = false,
}) {
  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const eventSourceRef = useRef(null);
  const finishedRef = useRef(false);
  const uploadedFilenameRef = useRef("");

  const closeEventSource = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  useEffect(() => () => closeEventSource(), []);

  const handleStreamError = async (payload) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    closeEventSource();

    const errorText = payload?.error || payload?.message || "분석 중 오류가 발생했습니다.";
    if (isRateLimitError({ message: errorText })) {
      await onQuotaExhausted?.();
      setError("오늘의 학습 한도를 모두 사용했습니다.");
    } else {
      setError(errorText);
      onUsageRefresh?.();
    }
    setPhase("error");
    setMessage("");
  };

  const handleStreamDone = (payload) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    closeEventSource();
    setProgress(100);
    setMessage(
      `"${uploadedFilenameRef.current}" 분석 완료 (${payload.chunks_processed}개 청크)`
    );
    setPhase("done");
    setFile(null);
    onUploaded(payload.digest_id);
    onUsageRefresh?.();
  };

  const subscribeToJob = (jobId) => {
    finishedRef.current = false;
    closeEventSource();

    const es = new EventSource(getSummaryStreamUrl(jobId));
    eventSourceRef.current = es;

    es.addEventListener("progress", (event) => {
      const data = JSON.parse(event.data);
      setProgress(data.progress ?? 0);
      setMessage(data.message ?? "");
      if ((data.progress ?? 0) >= 95) {
        onUsageRefresh?.();
      }
    });

    es.addEventListener("done", (event) => {
      handleStreamDone(JSON.parse(event.data));
    });

    es.addEventListener("error", (event) => {
      if (event.data) {
        handleStreamError(JSON.parse(event.data));
      }
    });

    es.onerror = () => {
      if (finishedRef.current) return;
      handleStreamError({ message: "서버 연결이 끊어졌습니다." });
    };
  };

  const handleUpload = async () => {
    if (!file) return;

    closeEventSource();
    finishedRef.current = false;
    setPhase("running");
    setProgress(0);
    setError("");
    setMessage("분석이 시작되었습니다...");
    uploadedFilenameRef.current = file.name;

    try {
      const result = await startSummary(userId, file);
      onUploadStarted?.();
      setMessage(result.message || "분석이 시작되었습니다.");
      subscribeToJob(result.job_id);
    } catch (err) {
      if (isRateLimitError(err)) {
        await onQuotaExhausted?.();
        setError("오늘의 학습 한도를 모두 사용했습니다.");
      } else {
        setError(err.message);
      }
      setPhase("error");
      setMessage("");
    }
  };

  const isRunning = phase === "running";
  const { isLimitReached } = getQuotaStats(usage);
  const uploadDisabled = !file || isRunning || isLimitReached;

  return (
    <section
      className={`upload-panel${embedded ? " upload-panel--embedded" : " dashboard-card"}`}
    >
      {!embedded && (
        <h2 className="upload-panel-title">새로운 지식 추가</h2>
      )}

      <label className={`upload-file-row${isLimitReached ? " disabled" : ""}`}>
        <span className="upload-file-btn">파일 선택</span>
        <span className="upload-file-name">
          {file ? file.name : "PDF, DOCX, PPTX"}
        </span>
        <input
          type="file"
          accept=".pdf,.docx,.pptx"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          disabled={isRunning || isLimitReached}
        />
      </label>

      <button
        type="button"
        className="upload-submit-btn"
        onClick={handleUpload}
        disabled={uploadDisabled}
      >
        {isRunning ? "AI 분석 중..." : "요약하기"}
      </button>

      {isRunning && (
        <div className="progress-container">
          <div className="progress-bar" role="progressbar" aria-valuenow={progress}>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="upload-progress">
            {message} ({progress}%)
          </p>
        </div>
      )}

      {phase === "done" && message && (
        <p className="upload-progress upload-success">{message}</p>
      )}
      {error && !isLimitReached && <p className="upload-error">{error}</p>}
    </section>
  );
}
