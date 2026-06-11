import { memo, useCallback, useEffect, useState } from "react";
import SummarySearchBar from "./SummarySearchBar";
import SummaryGrid from "./SummaryGrid";
import LayoutSnapshotBar from "./LayoutSnapshotBar";
import LayoutDragSource from "./LayoutDragSource";

function LayoutViewer({
  digestId,
  layoutMode,
  notes = [],
  chats = [],
  layoutReloadToken = 0,
  onLayoutReload,
  onNavigateToSource,
  onAddToLayout,
  addingToLayoutKey = null,
  annotations,
  searchOpen = false,
  onSearchClose,
  onRequestAnnotation,
  onHighlightClick,
  textAlign = "left",
  focusCardId = null,
  onFocusCardClear,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActiveIndex, setSearchActiveIndex] = useState(0);
  const [searchMatchCount, setSearchMatchCount] = useState(0);
  const [currentLayout, setCurrentLayout] = useState([]);
  const [currentCards, setCurrentCards] = useState([]);
  const [restorePayload, setRestorePayload] = useState(null);
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
    setCurrentCards([]);
    setRestorePayload(null);
    setActiveSnapshotId(null);
  }, [digestId, clearSearch]);

  const handleGridSearchMatches = useCallback((count) => {
    setSearchMatchCount(count);
    setSearchActiveIndex((prev) => (prev >= count ? 0 : prev));
  }, []);

  const handleLayoutChange = useCallback((nextLayout) => {
    setCurrentLayout(nextLayout);
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

      <div className="layout-viewer-panels">
        <LayoutSnapshotBar
          digestId={digestId}
          currentLayout={currentLayout}
          currentCards={currentCards}
          activeSnapshotId={activeSnapshotId}
          onActiveSnapshotChange={setActiveSnapshotId}
          onLayoutRestored={(result) => {
            if (result?.layout) {
              setCurrentLayout(result.layout);
            }
            setRestorePayload({
              layout: result?.layout,
              cards: result?.cards || [],
              cardsRestored: Boolean(result?.cards_restored),
              token: Date.now(),
            });
          }}
        />

        <LayoutDragSource
          notes={notes}
          chats={chats}
          onAddToLayout={onAddToLayout}
          addingToLayoutKey={addingToLayoutKey}
        />
      </div>

      <SummaryGrid
        digestId={digestId}
        layoutMode={layoutMode}
        layoutReloadToken={gridReloadToken}
        restorePayload={restorePayload}
        onCurrentCardsChange={setCurrentCards}
        onCardsChanged={() => {
          setInternalReloadToken((prev) => prev + 1);
          onLayoutReload?.();
        }}
        annotations={annotations}
        searchQuery={searchQuery}
        searchActiveIndex={searchActiveIndex}
        onSearchMatchesChange={handleGridSearchMatches}
        onLayoutChange={handleLayoutChange}
        onNavigateToSource={onNavigateToSource}
        onRequestAnnotation={onRequestAnnotation}
        onHighlightClick={onHighlightClick}
        textAlign={textAlign}
        focusCardId={focusCardId}
        onFocusCardClear={onFocusCardClear}
      />
    </div>
  );
}

export default memo(LayoutViewer);
