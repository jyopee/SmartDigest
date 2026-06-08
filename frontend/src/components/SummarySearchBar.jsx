import { useEffect, useRef } from "react";

export default function SummarySearchBar({
  query,
  onQueryChange,
  matchCount,
  activeIndex,
  onPrev,
  onNext,
  onClear,
  onClose,
}) {
  const inputRef = useRef(null);

  const hasQuery = query.trim().length > 0;
  const hasMatches = matchCount > 0;
  const displayIndex = hasMatches ? activeIndex + 1 : 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleClose = () => {
    onClear?.();
    onClose?.();
  };

  return (
    <div className="summary-search-bar">
      <div className="summary-search-input-wrap">
        <input
          ref={inputRef}
          type="search"
          className="summary-search-input"
          placeholder="요약문에서 단어 검색"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="요약문 검색"
        />
        {hasQuery && (
          <button
            type="button"
            className="summary-search-clear"
            onClick={onClear}
            aria-label="검색어 지우기"
          >
            ×
          </button>
        )}
      </div>

      <div className="summary-search-nav">
        <span className="summary-search-count" aria-live="polite">
          {hasQuery
            ? hasMatches
              ? `${displayIndex}/${matchCount}`
              : "0/0"
            : "검색"}
        </span>
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasMatches || matchCount <= 1}
          aria-label="이전 검색 결과"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasMatches || matchCount <= 1}
          aria-label="다음 검색 결과"
        >
          ›
        </button>
      </div>

      <button
        type="button"
        className="summary-search-close-btn"
        onClick={handleClose}
        aria-label="검색 비활성화"
      >
        ×
      </button>
    </div>
  );
}
