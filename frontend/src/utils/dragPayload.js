export const DRAG_MIME = "application/x-smartdigest-drag";

export function encodeDragPayload(payload) {
  return JSON.stringify(payload);
}

export function decodeDragPayload(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      (parsed.source === "note" || parsed.source === "chat") &&
      Number.isFinite(Number(parsed.sourceId))
    ) {
      return {
        source: parsed.source,
        sourceId: Number(parsed.sourceId),
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function setDragPayload(dataTransfer, payload) {
  if (!dataTransfer) return;
  const encoded = encodeDragPayload(payload);
  dataTransfer.setData(DRAG_MIME, encoded);
  dataTransfer.setData("text/plain", encoded);
  dataTransfer.effectAllowed = "copy";
}

export function readDragPayload(dataTransfer) {
  if (!dataTransfer) return null;
  return (
    decodeDragPayload(dataTransfer.getData(DRAG_MIME)) ||
    decodeDragPayload(dataTransfer.getData("text/plain"))
  );
}
