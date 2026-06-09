import { useCallback, useEffect, useRef, useState } from "react";
import { startSummary } from "../api/client";
import { getSummaryStreamUrl } from "../api/config";
import { isRateLimitError } from "../api/usageService";

const IDLE_STATUS = {
  phase: "idle",
  progress: 0,
  message: "",
  error: "",
};

export default function useSummaryJob({
  userId,
  onUploaded,
  onUsageRefresh,
  onQuotaExhausted,
}) {
  const [status, setStatus] = useState(IDLE_STATUS);
  const eventSourceRef = useRef(null);
  const finishedRef = useRef(false);
  const filenameRef = useRef("");

  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => () => closeEventSource(), [closeEventSource]);

  const waitForJobCompletion = useCallback(
    (jobId) =>
      new Promise((resolve, reject) => {
        finishedRef.current = false;
        closeEventSource();

        const es = new EventSource(getSummaryStreamUrl(jobId));
        eventSourceRef.current = es;

        const settle = (callback) => {
          if (finishedRef.current) return;
          finishedRef.current = true;
          closeEventSource();
          callback();
        };

        es.addEventListener("progress", (event) => {
          const data = JSON.parse(event.data);
          setStatus((prev) => ({
            ...prev,
            phase: "running",
            progress: data.progress ?? 0,
            message: data.message ?? prev.message,
            error: "",
          }));
          if ((data.progress ?? 0) >= 95) {
            onUsageRefresh?.();
          }
        });

        es.addEventListener("done", (event) => {
          const payload = JSON.parse(event.data);
          setStatus({
            phase: "done",
            progress: 100,
            message: `"${filenameRef.current}" 분석 완료 (${payload.chunks_processed}개 청크)`,
            error: "",
          });
          onUsageRefresh?.();
          settle(() => resolve(payload));
        });

        es.addEventListener("error", (event) => {
          if (!event.data) return;

          const payload = JSON.parse(event.data);
          const errorText =
            payload?.error || payload?.message || "분석 중 오류가 발생했습니다.";

          (async () => {
            if (isRateLimitError({ message: errorText })) {
              await onQuotaExhausted?.();
              setStatus({
                phase: "error",
                progress: 0,
                message: "",
                error: "오늘의 학습 한도를 모두 사용했습니다.",
              });
            } else {
              setStatus({
                phase: "error",
                progress: 0,
                message: "",
                error: errorText,
              });
              onUsageRefresh?.();
            }
            settle(() => reject(new Error(errorText)));
          })();
        });

        es.onerror = () => {
          if (finishedRef.current) return;
          if (es.readyState !== EventSource.CLOSED) return;

          const errorText = "서버 연결이 끊어졌습니다.";
          setStatus({
            phase: "error",
            progress: 0,
            message: "",
            error: errorText,
          });
          onUsageRefresh?.();
          settle(() => reject(new Error(errorText)));
        };
      }),
    [closeEventSource, onQuotaExhausted, onUsageRefresh]
  );

  const runSummary = useCallback(
    async (file) => {
      if (!file || !userId) return null;

      console.log("요약 요청 시작");
      filenameRef.current = file.name;
      finishedRef.current = false;
      closeEventSource();

      setStatus({
        phase: "running",
        progress: 0,
        message: "분석이 시작되었습니다...",
        error: "",
      });

      let completedDigestId = null;

      try {
        const result = await startSummary(userId, file);
        setStatus((prev) => ({
          ...prev,
          message: result.message || "분석이 시작되었습니다...",
        }));

        const payload = await waitForJobCompletion(result.job_id);
        completedDigestId = payload.digest_id;
      } catch (err) {
        console.error("요약 실패:", err);

        if (!finishedRef.current) {
          if (isRateLimitError(err)) {
            await onQuotaExhausted?.();
            setStatus({
              phase: "error",
              progress: 0,
              message: "",
              error: "오늘의 학습 한도를 모두 사용했습니다.",
            });
          } else {
            setStatus((prev) => ({
              ...prev,
              phase: "error",
              message: "",
              error: err.message || "요약에 실패했습니다.",
            }));
          }
        }
      }

      if (completedDigestId != null) {
        onUploaded?.(completedDigestId);
      }

      console.log("요약 작업 종료");
      return completedDigestId;
    },
    [
      userId,
      closeEventSource,
      waitForJobCompletion,
      onUploaded,
      onQuotaExhausted,
    ]
  );

  const resetStatus = useCallback(() => {
    if (status.phase === "running") return;
    setStatus(IDLE_STATUS);
  }, [status.phase]);

  return {
    status,
    isRunning: status.phase === "running",
    runSummary,
    resetStatus,
  };
}
