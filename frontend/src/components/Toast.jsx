import { useCallback, useEffect, useRef, useState } from "react";

export function useToast(durationMs = 2800) {
  const [message, setMessage] = useState("");
  const timerRef = useRef(null);

  const clearToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setMessage("");
  }, []);

  const showToast = useCallback(
    (nextMessage) => {
      if (!nextMessage) return;
      clearToast();
      setMessage(nextMessage);
      timerRef.current = setTimeout(clearToast, durationMs);
    },
    [clearToast, durationMs]
  );

  useEffect(() => () => clearToast(), [clearToast]);

  return { message, showToast, clearToast };
}

export default function Toast({ message }) {
  if (!message) return null;

  return (
    <div className="sd-toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
