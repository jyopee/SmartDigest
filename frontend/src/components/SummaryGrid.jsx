import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import GridLayout from "react-grid-layout/legacy";
import GridCardItem from "./GridCardItem";
import SummaryCard from "./SummaryCard";
import LoadingSpinner from "./LoadingSpinner";
import { useViewerInteraction } from "../contexts/ViewerInteractionContext";
import {
  addGridCardFromSource,
  fetchDigestGrid,
  saveDigestGridLayout,
} from "../api/gridLayoutService";
import { readDragPayload } from "../utils/dragPayload";
import { LAYOUT_MODES } from "../constants/layoutModes";
import {
  applyAnnotationHighlights,
  stripDecorativeMarkup,
} from "../utils/highlightUtils";
import {
  buildSmartLayout,
  commitLayoutItems,
  enrichCards,
  ensureLayoutForCards,
  serializeLayoutForStorage,
} from "../utils/smartLayoutEngine";
import { buildSourceFocusFromCard } from "../utils/sourceNavigation";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const GRID_COLS = 12;
const ROW_HEIGHT = 52;

function renderCardItem(card, props) {
  const {
    annotations,
    searchQuery,
    matchingCardIds,
    searchActiveIndex,
    className = "summary-grid-item",
    onNavigateToSource,
  } = props;

  if (className === "summary-grid-item") {
    return (
      <GridCardItem
        key={String(card.id)}
        card={card}
        annotations={annotations}
        searchQuery={searchQuery}
        matchingCardIds={matchingCardIds}
        searchActiveIndex={searchActiveIndex}
        className={className}
        onNavigateToSource={onNavigateToSource}
      />
    );
  }

  const cardAnnotations = annotations.filter(
    (ann) => (ann.page_number || 1) === (card.page_number || 1)
  );
  const highlighted = applyAnnotationHighlights(
    stripDecorativeMarkup(card.content),
    cardAnnotations
  );

  return (
    <div
      key={String(card.id)}
      data-card-id={String(card.id)}
      data-page-number={card.page_number || 1}
      className={className}
    >
      <SummaryCard
        card={card}
        highlightedContent={highlighted}
        onNavigateToSource={onNavigateToSource}
      />
    </div>
  );
}

function SummaryGrid({
  digestId,
  layoutMode = LAYOUT_MODES.GRID,
  layoutReloadToken = 0,
  onCardsChanged,
  annotations = [],
  searchQuery = "",
  searchActiveIndex = 0,
  onSearchMatchesChange,
  onLayoutChange,
  onNavigateToSource,
  onRequestAnnotation,
  onHighlightClick,
}) {
  const viewerInteraction = useViewerInteraction();
  const requestAnnotation =
    onRequestAnnotation ?? viewerInteraction.onRequestAnnotation;
  const highlightClickHandler =
    onHighlightClick ?? viewerInteraction.onHighlightClick;

  const [cards, setCards] = useState([]);
  const [layout, setLayout] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [dropSaving, setDropSaving] = useState(false);
  const [gridRevision, setGridRevision] = useState(0);
  const [gridWidth, setGridWidth] = useState(0);
  const saveTimerRef = useRef(null);
  const containerRef = useRef(null);
  const gridMountRef = useRef(null);
  const latestLayoutRef = useRef([]);
  const prevLayoutModeRef = useRef(layoutMode);
  const isInteractingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetchDigestGrid(digestId)
      .then((data) => {
        if (cancelled) return;
        const nextCards = enrichCards(data.cards || []);
        const savedLayout = ensureLayoutForCards(data.layout, nextCards);
        latestLayoutRef.current = savedLayout;
        setCards(nextCards);
        setLayout(savedLayout);
        setGridRevision((prev) => prev + 1);
        queueMicrotask(() => onLayoutChange?.(savedLayout));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) startTransition(() => setLoading(false));
      });

    return () => {
      cancelled = true;
    };
  }, [digestId, layoutReloadToken]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (layoutMode !== LAYOUT_MODES.GRID || loading) return undefined;

    const node = gridMountRef.current;
    if (!node) return undefined;

    let frame = null;
    const measure = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = Math.round(node.getBoundingClientRect().width);
        if (width > 0) setGridWidth(width);
        frame = null;
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [layoutMode, loading, gridRevision, digestId]);

  useEffect(() => {
    const previousMode = prevLayoutModeRef.current;
    prevLayoutModeRef.current = layoutMode;
    if (
      layoutMode === LAYOUT_MODES.GRID &&
      previousMode !== LAYOUT_MODES.GRID &&
      latestLayoutRef.current.length
    ) {
      setLayout(latestLayoutRef.current);
      setGridRevision((prev) => prev + 1);
    }
  }, [layoutMode]);

  const matchingCardIds = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return cards.map((card) => card.id);
    return cards
      .filter((card) => {
        const haystack = `${card.title}\n${card.content}`.toLowerCase();
        return haystack.includes(query);
      })
      .map((card) => card.id);
  }, [cards, searchQuery]);

  useEffect(() => {
    onSearchMatchesChange?.(matchingCardIds.length);
  }, [matchingCardIds.length, onSearchMatchesChange]);

  useEffect(() => {
    if (!searchQuery.trim() || !matchingCardIds.length) return;
    const targetId = matchingCardIds[searchActiveIndex % matchingCardIds.length];
    const node = containerRef.current?.querySelector(`[data-card-id="${targetId}"]`);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [searchQuery, searchActiveIndex, matchingCardIds]);

  const persistLayout = useCallback(
    (nextLayout) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveDigestGridLayout(
          digestId,
          serializeLayoutForStorage(nextLayout)
        ).catch(() => {});
      }, 500);
    },
    [digestId]
  );

  const handleLayoutInteractionStop = useCallback(
    (nextLayout) => {
      isInteractingRef.current = false;
      const committed = commitLayoutItems(nextLayout, cards);
      latestLayoutRef.current = committed;
      onLayoutChange?.(committed);
      persistLayout(committed);
    },
    [cards, onLayoutChange, persistLayout]
  );

  const handleDragStart = useCallback(() => {
    isInteractingRef.current = true;
  }, []);

  const handleDragStop = useCallback(
    (nextLayout) => {
      handleLayoutInteractionStop(nextLayout);
    },
    [handleLayoutInteractionStop]
  );

  const handleResizeStart = useCallback(() => {
    isInteractingRef.current = true;
  }, []);

  const handleResizeStop = useCallback(
    (nextLayout) => {
      handleLayoutInteractionStop(nextLayout);
    },
    [handleLayoutInteractionStop]
  );

  const handleApplySmartLayout = () => {
    const nextLayout = ensureLayoutForCards(buildSmartLayout(cards), cards);
    latestLayoutRef.current = nextLayout;
    setLayout(nextLayout);
    setGridRevision((prev) => prev + 1);
    onLayoutChange?.(nextLayout);
    persistLayout(nextLayout);
  };

  const handleDragOver = (event) => {
    if (!readDragPayload(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  };

  const handleDragLeave = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setDropActive(false);
    }
  };

  const handleDrop = async (event) => {
    const payload = readDragPayload(event.dataTransfer);
    if (!payload) return;

    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);

    setDropSaving(true);
    setError("");
    try {
      await addGridCardFromSource(digestId, payload.source, payload.sourceId);
      onCardsChanged?.();
    } catch (err) {
      setError(err.message || "학습 카드를 추가하지 못했습니다.");
    } finally {
      setDropSaving(false);
    }
  };

  const handleMouseUp = (event) => {
    if (isInteractingRef.current) return;
    if (event.target.closest(".react-grid-item, .react-resizable-handle")) return;
    if (event.target.closest(".sd-highlight, .sd-search-hit")) return;

    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || "";
    if (!selectedText || selectedText.length < 2) return;

    const cardNode = event.target.closest("[data-card-id]");
    if (!cardNode || !containerRef.current?.contains(cardNode)) return;

    const range = selection.getRangeAt(0);
    if (!cardNode.contains(range.commonAncestorContainer)) return;

    requestAnnotation?.({
      x: event.clientX,
      y: event.clientY,
      selectedText,
      pageNumber: Number(cardNode.dataset.pageNumber) || 1,
    });
  };

  const handleClick = (event) => {
    const highlight = event.target.closest(".sd-highlight");
    if (!highlight) return;

    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();

    const annotationId = Number(highlight.dataset.id);
    const annotation = annotations.find((ann) => ann.id === annotationId);
    if (!annotation) return;

    const rect = highlight.getBoundingClientRect();
    highlightClickHandler?.({
      annotation,
      x: rect.left + rect.width / 2,
      y: rect.bottom,
    });
  };

  const handleCardSourceNavigate = useCallback(
    (card) => {
      const focus = buildSourceFocusFromCard(card);
      if (focus) onNavigateToSource?.(focus);
    },
    [onNavigateToSource]
  );

  const cardRenderProps = useMemo(
    () => ({
      annotations,
      searchQuery,
      matchingCardIds,
      searchActiveIndex,
      onNavigateToSource: handleCardSourceNavigate,
    }),
    [
      annotations,
      searchQuery,
      matchingCardIds,
      searchActiveIndex,
      handleCardSourceNavigate,
    ]
  );

  const mainCards = useMemo(
    () => cards.filter((card) => card.type === "main"),
    [cards]
  );
  const detailCards = useMemo(
    () => cards.filter((card) => card.type === "detail"),
    [cards]
  );
  const questionCards = useMemo(
    () => cards.filter((card) => card.type === "question"),
    [cards]
  );

  const gridMinHeight = useMemo(() => {
    if (!layout.length) return 240;
    const maxRow = layout.reduce(
      (max, item) => Math.max(max, (Number(item.y) || 0) + (Number(item.h) || 0)),
      0
    );
    return maxRow * (ROW_HEIGHT + 10) + 32;
  }, [layout]);

  const gridChildren = useMemo(
    () =>
      cards.map((card) => {
        const cardAnnotations = annotations.filter(
          (ann) => (ann.page_number || 1) === (card.page_number || 1)
        );
        const highlightedContent = applyAnnotationHighlights(
          stripDecorativeMarkup(card.content),
          cardAnnotations
        );
        const isMatch =
          !searchQuery.trim() || matchingCardIds.includes(card.id);
        const isActive =
          searchQuery.trim() &&
          matchingCardIds[searchActiveIndex % matchingCardIds.length] ===
            card.id;

        return (
          <div
            key={String(card.id)}
            data-card-id={String(card.id)}
            data-page-number={card.page_number || 1}
            className={`summary-grid-item${isMatch ? "" : " is-search-hidden"}${
              isActive ? " is-search-active" : ""
            }`}
          >
            <SummaryCard
              card={card}
              highlightedContent={highlightedContent}
              onNavigateToSource={handleCardSourceNavigate}
            />
          </div>
        );
      }),
    [
      cards,
      annotations,
      searchQuery,
      matchingCardIds,
      searchActiveIndex,
      handleCardSourceNavigate,
    ]
  );

  if (loading) {
    return <LoadingSpinner label="요약 카드를 불러오는 중..." />;
  }

  if (error) {
    return <p className="summary-grid-error">{error}</p>;
  }

  return (
    <div
      ref={containerRef}
      className={`summary-grid-wrap summary-layout-${layoutMode}${
        layoutMode === LAYOUT_MODES.GRID ? " summary-layout-grid" : ""
      }${dropActive ? " is-drop-target" : ""}${dropSaving ? " is-drop-saving" : ""}${
        !cards.length ? " summary-grid-wrap--empty" : ""
      }`}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
      onDragOverCapture={handleDragOver}
      onDragLeave={handleDragLeave}
      onDropCapture={handleDrop}
    >
      {dropActive && (
        <div className="summary-grid-drop-overlay" aria-hidden="true">
          <p>여기에 놓아 학습 카드로 추가</p>
        </div>
      )}

      {dropSaving && (
        <p className="summary-grid-drop-status">학습 카드를 추가하는 중...</p>
      )}

      {!cards.length && (
        <p className="summary-grid-empty">
          표시할 요약 카드가 없습니다. 위에서 주석·질문을 드래그해 추가하세요.
        </p>
      )}

      {cards.length > 0 && layoutMode === LAYOUT_MODES.GRID && (
        <>
        <div className="smart-layout-toolbar">
          <p className="smart-layout-guide">
            AI 중요도(weight)에 따라 카드 크기가 자동 배치됩니다. 주제는 크게, 상세·질문은 작게 표시됩니다.
          </p>
          <button
            type="button"
            className="smart-layout-apply-btn"
            onClick={handleApplySmartLayout}
          >
            스마트 배치 다시 적용
          </button>
        </div>
        <div
          ref={gridMountRef}
          className="summary-grid-root"
          style={{ minHeight: gridMinHeight }}
        >
          {gridWidth > 0 && (
            <GridLayout
              key={`summary-grid-${digestId}-${gridRevision}`}
              className="summary-grid"
              width={gridWidth}
              layout={layout}
              cols={GRID_COLS}
              rowHeight={ROW_HEIGHT}
              margin={[10, 10]}
              containerPadding={[0, 0]}
              style={{ minHeight: gridMinHeight }}
              isDraggable
              isResizable
              useCSSTransforms
              draggableHandle=".summary-card-drag-handle"
              draggableCancel=".summary-card-body, .summary-card-source-link, button, a, .sd-highlight"
              compactType="vertical"
              resizeHandles={["se"]}
              onDragStart={handleDragStart}
              onDragStop={handleDragStop}
              onResizeStart={handleResizeStart}
              onResizeStop={handleResizeStop}
            >
              {gridChildren}
            </GridLayout>
          )}
        </div>
        </>
      )}

      {cards.length > 0 && layoutMode === LAYOUT_MODES.SPLIT && (
        <div className="summary-split-layout">
          <section className="summary-split-column">
            <h4 className="summary-split-heading">주제</h4>
            <div className="summary-split-stack">
              {(mainCards.length ? mainCards : cards).map((card) =>
                renderCardItem(card, {
                  ...cardRenderProps,
                  className: "summary-split-item",
                })
              )}
            </div>
          </section>
          <section className="summary-split-column">
            <h4 className="summary-split-heading">상세</h4>
            <div className="summary-split-stack">
              {(detailCards.length ? detailCards : cards.filter((c) => c.type !== "main")).map((card) =>
                renderCardItem(card, {
                  ...cardRenderProps,
                  className: "summary-split-item",
                })
              )}
            </div>
          </section>
          {questionCards.length > 0 && (
            <section className="summary-split-column summary-split-column--question">
              <h4 className="summary-split-heading">질문</h4>
              <div className="summary-split-stack">
                {questionCards.map((card) =>
                  renderCardItem(card, {
                    ...cardRenderProps,
                    className: "summary-split-item",
                  })
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {cards.length > 0 && layoutMode === LAYOUT_MODES.LIST && (
        <div className="summary-list-layout">
          {cards.map((card) =>
            renderCardItem(card, {
              ...cardRenderProps,
              className: "summary-list-item",
            })
          )}
        </div>
      )}
    </div>
  );
}

export default memo(SummaryGrid);
