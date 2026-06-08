export default function PageMiniFooter({
  currentPage,
  totalPages,
  onPageChange,
}) {
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <div className="page-mini-footer" aria-label="페이지 이동">
      <button
        type="button"
        className="page-mini-footer-btn"
        onClick={() => onPageChange?.(currentPage - 1)}
        disabled={!canGoPrev}
        aria-label="이전 페이지"
      >
        ‹
      </button>
      <span className="page-mini-footer-indicator">
        <strong>{currentPage}</strong>
        <span className="page-mini-footer-sep">/</span>
        {totalPages}
      </span>
      <button
        type="button"
        className="page-mini-footer-btn"
        onClick={() => onPageChange?.(currentPage + 1)}
        disabled={!canGoNext}
        aria-label="다음 페이지"
      >
        ›
      </button>
    </div>
  );
}
