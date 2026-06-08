export default function PageToolbar({
  mode = "scroll",
  currentPage,
  totalPages,
  loadedPages = totalPages,
  onPageChange,
  isDirty = false,
  showEdit = false,
  isEditing = false,
  onToggleEdit,
  onSave,
  onExport,
  saving,
}) {
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;
  const isPageMode = mode === "page";

  return (
    <div className="page-toolbar">
      <div className="page-toolbar-nav">
        {isPageMode && (
          <button
            type="button"
            onClick={() => onPageChange?.(currentPage - 1)}
            disabled={!canGoPrev}
            aria-label="이전 페이지"
          >
            ‹
          </button>
        )}
        <span className="page-indicator">
          페이지 <strong>{currentPage}</strong> / {totalPages}
        </span>
        {isPageMode && (
          <button
            type="button"
            onClick={() => onPageChange?.(currentPage + 1)}
            disabled={!canGoNext}
            aria-label="다음 페이지"
          >
            ›
          </button>
        )}
        {!isPageMode && loadedPages < totalPages && (
          <span className="page-loaded-badge">{loadedPages}페이지 로드됨</span>
        )}
      </div>

      <div className="page-toolbar-actions">
        {isDirty && <span className="page-dirty-badge">수정됨</span>}
        {showEdit && (
          <button
            type="button"
            className={`btn-page-edit${isEditing ? " active" : ""}`}
            onClick={onToggleEdit}
            aria-pressed={isEditing}
          >
            편집
          </button>
        )}
        <button
          type="button"
          className="btn-page-save"
          onClick={onSave}
          disabled={saving || !isDirty}
          title={isDirty ? "편집 내용을 저장합니다" : "변경된 내용이 없습니다"}
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        <button type="button" className="btn-page-export" onClick={onExport}>
          보내기
        </button>
      </div>
    </div>
  );
}
