import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GridLayout, { WidthProvider } from "react-grid-layout/legacy";
import SummaryCard from "./SummaryCard";
import LoadingSpinner from "./LoadingSpinner";
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
  enrichCards,
  normalizeSmartLayout,
} from "../utils/smartLayoutEngine";
import { buildSourceFocusFromCard } from "../utils/sourceNavigation";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ResponsiveGrid = WidthProvider(GridLayout);

const GRID_COLS = 12;
const ROW_HEIGHT = 84;

function renderCardItem(card, props) {
  const {
    annotations,
    searchQuery,
    matchingCardIds,
    searchActiveIndex,
    className = "summary-grid-item",
    onNavigateToSource,
  } = props;

  const isMatch = !searchQuery.trim() || matchingCardIds.includes(card.id);
  const cardAnnotations = annotations.filter(
    (ann) => (ann.page_number || 1) === (card.page_number || 1)
  );
  const highlighted = applyAnnotationHighlights(
    stripDecorativeMarkup(card.content),
    cardAnnotations
  );

  return (
    <div
      key={card.id}
      data-card-id={card.id}
      data-page-number={card.page_number || 1}
      className={`${className}${isMatch ? "" : " is-search-hidden"}${
        searchQuery.trim() &&
        matchingCardIds[searchActiveIndex % matchingCardIds.length] === card.id
          ? " is-search-active"
          : ""
      }`}
    >
      <SummaryCard
        card={card}
        highlightedContent={highlighted}
        onNavigateToSource={onNavigateToSource}
      />
    </div>
  );
}

export default function SummaryGrid({
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
  const [cards, setCards] = useState([]);
  const [layout, setLayout] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [dropSaving, setDropSaving] = useState(false);
  const saveTimerRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetchDigestGrid(digestId)
      .then((data) => {
        if (cancelled) return;
        const nextCards = enrichCards(data.cards || []);
        const savedLayout = data.layout?.length
          ? normalizeSmartLayout(data.layout, nextCards)
          : buildSmartLayout(nextCards);
        setCards(nextCards);
        setLayout(savedLayout);
        onLayoutChange?.(savedLayout);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [digestId, layoutReloadToken, onLayoutChange]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    []
  );

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
        saveDigestGridLayout(digestId, nextLayout).catch(() => {});
      }, 500);
    },
    [digestId]
  );

  const handleLayoutChange = (nextLayout) => {
    setLayout(nextLayout);
    onLayoutChange?.(nextLayout);
    persistLayout(nextLayout);
  };

  const handleApplySmartLayout = () => {
    const nextLayout = buildSmartLayout(cards);
    setLayout(nextLayout);
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
    event.preventDefault();
    setDropActive(false);
    const payload = readDragPayload(event.dataTransfer);
    if (!payload) return;

    setDropSaving(true);
    setError("");
    try {
      const result = await addGridCardFromSource(
        digestId,
        payload.source,
        payload.sourceId
      );
      onCardsChanged?.();
      const focus = buildSourceFocusFromCard(result.card);
      if (focus) onNavigateToSource?.(focus);
    } catch (err) {
      setError(err.message || "학습 카드를 추가하지 못했습니다.");
    } finally {
      setDropSaving(false);
    }
  };

  const handleMouseUp = (event) => {
    if (event.target.closest(".sd-highlight, .sd-search-hit")) return;

    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || "";
    if (!selectedText || selectedText.length < 2) return;

    const cardNode = event.target.closest("[data-card-id]");
    if (!cardNode || !containerRef.current?.contains(cardNode)) return;

    const range = selection.getRangeAt(0);
    if (!cardNode.contains(range.commonAncestorContainer)) return;

    onRequestAnnotation?.({
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
    onHighlightClick?.({
      annotation,
      x: rect.left + rect.width / 2,
      y: rect.bottom,
    });
  };

  if (loading) {
    return <LoadingSpinner label="요약 카드를 불러오는 중..." />;
  }

  if (error) {
    return <p className="summary-grid-error">{error}</p>;
  }

  if (!cards.length) {
    return <p className="summary-grid-empty">표시할 요약 카드가 없습니다.</p>;
  }

  const handleCardSourceNavigate = (card) => {
    const focus = buildSourceFocusFromCard(card);
    if (focus) onNavigateToSource?.(focus);
  };

  const cardRenderProps = {
    annotations,
    searchQuery,
    matchingCardIds,
    searchActiveIndex,
    onNavigateToSource: handleCardSourceNavigate,
  };

  const mainCards = cards.filter((card) => card.type === "main");
  const detailCards = cards.filter((card) => card.type === "detail");
  const questionCards = cards.filter((card) => card.type === "question");

  return (
    <div
      ref={containerRef}
      className={`summary-grid-wrap summary-layout-${layoutMode}${
        dropActive ? " is-drop-target" : ""
      }${dropSaving ? " is-drop-saving" : ""}`}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dropActive && (
        <div className="summary-grid-drop-overlay" aria-hidden="true">
          <p>여기에 놓아 학습 카드로 추가</p>
        </div>
      )}
      {layoutMode === LAYOUT_MODES.GRID && (
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
        <ResponsiveGrid
          className="summary-grid"
          layout={layout}
          cols={GRID_COLS}
          rowHeight={ROW_HEIGHT}
          margin={[12, 12]}
          containerPadding={[0, 0]}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".summary-card-drag-handle"
          compactType="vertical"
          resizeHandles={["se"]}
        >
          {cards.map((card) =>
            renderCardItem(card, {
              ...cardRenderProps,
              className: "summary-grid-item",
            })
          )}
        </ResponsiveGrid>
        </>
      )}

      {layoutMode === LAYOUT_MODES.SPLIT && (
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

      {layoutMode === LAYOUT_MODES.LIST && (
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
