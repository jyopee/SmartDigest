import { useState } from "react";
import { getQuotaStats } from "../api/usageService";

export default function FileUpload({
  usage,
  embedded = false,
  isRunning = false,
  progress = 0,
  message = "",
  error = "",
  phase = "idle",
  onSummarize,
}) {
  const [file, setFile] = useState(null);

  const handleSummarize = async () => {
    if (!file || isRunning) return;
    await onSummarize?.(file);
  };

  const { isLimitReached } = getQuotaStats(usage);
  const uploadDisabled = !file || isRunning || isLimitReached;

  return (
    <section
      className={`upload-panel${embedded ? " upload-panel--embedded" : " dashboard-card"}${
        isRunning ? " upload-panel--loading" : ""
      }`}
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
        onClick={handleSummarize}
        disabled={uploadDisabled}
      >
        {isRunning ? "AI 분석 중..." : "요약하기"}
      </button>

      {isRunning && (
        <div className="progress-container" aria-live="polite">
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
