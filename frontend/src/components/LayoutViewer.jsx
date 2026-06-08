import { useCallback, useEffect, useState } from "react";
import SummarySearchBar from "./SummarySearchBar";
import SummaryGrid from "./SummaryGrid";
import LayoutSnapshotBar from "./LayoutSnapshotBar";
import LayoutDragSource from "./LayoutDragSource";

export default function LayoutViewer({
  digestId,
  layoutMode,
  notes = [],
  chats = [],
  layoutReloadToken = 0,
  onLayoutReload,
  onNavigateToSource,
  annotations,
  searchOpen = false,
  onSearchClose,
  onRequestAnnotation,
  onHighlightClick,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActiveIndex, setSearchActiveIndex] = useState(0);
  const [searchMatchCount, setSearchMatchCount] = useState(0);
  const [currentLayout, setCurrentLayout] = useState([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState(null);
  const [internalReloadToken, setInternalReloadToken] = useState(0);
  const gridReloadToken = layoutReloadToken + internalReloadToken;

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchActiveIndex(0);
    setSearchMatchCount(0);
  }, []);

  useEffect(() => {
    if (!searchOpen) clearSearch();
  }, [searchOpen, clearSearch]);

  useEffect(() => {
    clearSearch();
    setCurrentLayout([]);
    setActiveSnapshotId(null);
  }, [digestId, clearSearch]);

  const handleGridSearchMatches = useCallback((count) => {
    setSearchMatchCount(count);
    setSearchActiveIndex((prev) => (prev >= count ? 0 : prev));
  }, []);

  const handlePrevSearch = () => {
    if (!searchMatchCount) return;
    setSearchActiveIndex(
      (prev) => (prev - 1 + searchMatchCount) % searchMatchCount
    );
  };

  const handleNextSearch = () => {
    if (!searchMatchCount) return;
    setSearchActiveIndex((prev) => (prev + 1) % searchMatchCount);
  };

  return (
    <div className="summary-viewer layout-viewer">
      {searchOpen && (
        <SummarySearchBar
          query={searchQuery}
          onQueryChange={(value) => {
            setSearchQuery(value);
            setSearchActiveIndex(0);
          }}
          matchCount={searchMatchCount}
          activeIndex={searchActiveIndex}
          onPrev={handlePrevSearch}
          onNext={handleNextSearch}
          onClear={clearSearch}
          onClose={onSearchClose}
        />
      )}

      <LayoutSnapshotBar
        digestId={digestId}
        currentLayout={currentLayout}
        activeSnapshotId={activeSnapshotId}
        onActiveSnapshotChange={setActiveSnapshotId}
        onLayoutRestored={() => {
          setInternalReloadToken((prev) => prev + 1);
        }}
      />

      <LayoutDragSource notes={notes} chats={chats} />

      <SummaryGrid
        digestId={digestId}
        layoutMode={layoutMode}
        layoutReloadToken={gridReloadToken}
        onCardsChanged={() => {
          setInternalReloadToken((prev) => prev + 1);
          onLayoutReload?.();
        }}
        annotations={annotations}
        searchQuery={searchQuery}
        searchActiveIndex={searchActiveIndex}
        onSearchMatchesChange={handleGridSearchMatches}
        onLayoutChange={setCurrentLayout}
        onNavigateToSource={onNavigateToSource}
        onRequestAnnotation={onRequestAnnotation}
        onHighlightClick={onHighlightClick}
      />
    </div>
  );
}
