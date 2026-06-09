/** 개발 모드 전용 성능 측정 헬퍼 (React Profiler 보조) */
export function perfMark(label) {
  if (!import.meta.env.DEV || typeof performance === "undefined") {
    return () => {};
  }

  const startMark = `${label}-start`;
  const endMark = `${label}-end`;
  performance.mark(startMark);
  const startedAt = performance.now();

  return () => {
    performance.mark(endMark);
    try {
      performance.measure(label, startMark, endMark);
    } catch {
      /* duplicate measure in StrictMode */
    }
    const duration = performance.now() - startedAt;
    console.debug(`[perf] ${label}: ${duration.toFixed(1)}ms`);
  };
}

export function perfLogRender(componentName, extra = "") {
  if (!import.meta.env.DEV) return;
  console.debug(`[render] ${componentName}${extra ? ` ${extra}` : ""}`);
}
