import { useEffect, useRef, useState } from "react";
import { startSummary } from "../api/client";
import { getSummaryStreamUrl } from "../api/config";

export default function FileUpload({ userId, onUploaded }) {
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

  const handleStreamError = (payload) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    closeEventSource();
    setError(payload?.error || payload?.message || "분석 중 오류가 발생했습니다.");
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
      setMessage(result.message || "분석이 시작되었습니다.");
      subscribeToJob(result.job_id);
    } catch (err) {
      setError(err.message);
      setPhase("error");
      setMessage("");
    }
  };

  const isRunning = phase === "running";

  return (
    <section className="upload-panel">
      <h2>새로운 지식 추가</h2>
      <input
        type="file"
        accept=".pdf,.docx"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        disabled={isRunning}
      />
      <button type="button" onClick={handleUpload} disabled={!file || isRunning}>
        {isRunning ? "AI 분석 중..." : "AI 분석 시작 및 저장"}
      </button>

      {isRunning && (
        <div className="progress-container">
          <div
            className="progress-bar"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
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
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
