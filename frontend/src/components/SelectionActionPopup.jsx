export default function SelectionActionPopup({
  x,
  y,
  selectedText,
  onAddNote,
  onAskAi,
  onClose,
}) {
  const preview =
    selectedText.length > 48
      ? `${selectedText.slice(0, 48)}...`
      : selectedText;

  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y + 10, window.innerHeight - 120);

  return (
    <div
      className="selection-action-popup"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="selection-action-preview">&ldquo;{preview}&rdquo;</p>
      <div className="selection-action-buttons">
        <button type="button" className="btn-note" onClick={onAddNote}>
          주석 추가
        </button>
        <button type="button" className="btn-ai" onClick={onAskAi}>
          AI 질문
        </button>
      </div>
      <button type="button" className="selection-action-close" onClick={onClose}>
        닫기
      </button>
    </div>
  );
}
