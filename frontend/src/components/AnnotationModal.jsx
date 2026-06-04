export default function AnnotationModal({
  x,
  y,
  selectedText,
  onClose,
  onSave,
  saving,
}) {
  const preview =
    selectedText.length > 40
      ? `${selectedText.slice(0, 40)}...`
      : selectedText;

  const handleSubmit = (event) => {
    event.preventDefault();
    const comment = event.target.comment.value.trim();
    if (!comment) return;
    onSave(comment);
  };

  const left = Math.min(x, window.innerWidth - 320);
  const top = Math.min(y + 12, window.innerHeight - 220);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="annotation-modal"
        style={{ left, top }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span>주석 작성</span>
          <button type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <p className="modal-preview">"{preview}"</p>
        <form onSubmit={handleSubmit}>
          <textarea
            name="comment"
            rows={4}
            placeholder="주석 내용을 입력하세요"
            autoFocus
          />
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              취소
            </button>
            <button type="submit" disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
