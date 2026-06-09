export default function PageSplitContextMenu({
  x,
  y,
  mode = "split",
  onConfirm,
  onClose,
}) {
  const left = Math.min(x, window.innerWidth - 200);
  const top = Math.min(y, window.innerHeight - 80);
  const isCancel = mode === "cancel";

  return (
    <div
      className="page-split-context-menu"
      style={{ left, top }}
      onMouseDown={(event) => event.stopPropagation()}
      role="menu"
    >
      <button
        type="button"
        className={`page-split-context-action${
          isCancel ? " page-split-context-action--cancel" : ""
        }`}
        onClick={onConfirm}
      >
        {isCancel ? "페이지 나누기 취소" : "페이지 나누기"}
      </button>
      <button type="button" className="page-split-context-close" onClick={onClose}>
        닫기
      </button>
    </div>
  );
}
