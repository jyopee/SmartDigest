export default function PageViewToolbar({
  isDirty = false,
  isEditing = false,
  onToggleEdit,
  onSave,
  saving = false,
}) {
  return (
    <div className="viewer-action-group">
      {isDirty && <span className="viewer-action-badge">수정됨</span>}
      <button
        type="button"
        className={`viewer-action-pill viewer-action-pill--ghost${
          isEditing ? " is-active" : ""
        }`}
        onClick={onToggleEdit}
        aria-pressed={isEditing}
      >
        편집
      </button>
      <button
        type="button"
        className="viewer-action-pill viewer-action-pill--primary"
        onClick={onSave}
        disabled={saving || !isDirty}
        title={isDirty ? "편집 내용을 저장합니다" : "변경된 내용이 없습니다"}
      >
        {saving ? "저장 중..." : "저장"}
      </button>
    </div>
  );
}
