import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import GridCardItem from "./GridCardItem";
import SummaryCard from "./SummaryCard";
import MindMapCanvas from "./MindMapCanvas";
import LoadingSpinner from "./LoadingSpinner";
import { useViewerInteraction } from "../contexts/ViewerInteractionContext";
import {
  addGridCardFromSource,
  deleteGridCard,
  fetchDigestGrid,
  saveDigestGridLayout,
} from "../api/gridLayoutService";
import { readDragPayload } from "../utils/dragPayload";
import { LAYOUT_MODES } from "../constants/layoutModes";
import {
  applyAnnotationHighlights,
  stripDecorativeMarkup,
} from "../utils/highlightUtils";
import { enrichCards } from "../utils/smartLayoutEngine";
import {
  buildDefaultMindMapLayout,
  ensureMindMapLayoutForCards,
} from "../utils/mindMapLayoutEngine";
import { buildSourceFocusFromCard } from "../utils/sourceNavigation";

function renderCardItem(card, props) {
  const {
    annotations,
    searchQuery,
    matchingCardIds,
    searchActiveIndex,
    className = "summary-grid-item",
    onNavigateToSource,
    onDeleteCard,
    deletingCardId,
  } = props;

  const deleteProps = {
    onDelete: onDeleteCard,
    deleting: deletingCardId === card.id,
  };

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
        onDelete={deleteProps.onDelete}
        deletingCardId={deletingCardId}
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
        {...deleteProps}
      />
    </div>
  );
}

function SummaryGrid({
  digestId,
  layoutMode = LAYOUT_MODES.MINDMAP,
  layoutReloadToken = 0,
  restorePayload = null,
  onCardsChanged,
  onCurrentCardsChange,
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
  const [mindMapLayout, setMindMapLayout] = useState({
    engine: "mindmap",
    nodes: [],
    edges: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [dropSaving, setDropSaving] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState(null);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const saveTimerRef = useRef(null);
  const containerRef = useRef(null);
  const latestLayoutRef = useRef({ engine: "mindmap", nodes: [], edges: [] });
  const prevLayoutModeRef = useRef(layoutMode);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetchDigestGrid(digestId)
      .then((data) => {
        if (cancelled) return;
        const nextCards = enrichCards(data.cards || []);
        const savedLayout = ensureMindMapLayoutForCards(data.layout, nextCards);
        latestLayoutRef.current = savedLayout;
        setCards(nextCards);
        setMindMapLayout(savedLayout);
        setLayoutRevision((prev) => prev + 1);
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
    const previousMode = prevLayoutModeRef.current;
    prevLayoutModeRef.current = layoutMode;
    if (
      layoutMode === LAYOUT_MODES.MINDMAP &&
      previousMode !== LAYOUT_MODES.MINDMAP &&
      latestLayoutRef.current
    ) {
      setMindMapLayout(latestLayoutRef.current);
      setLayoutRevision((prev) => prev + 1);
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
    onCurrentCardsChange?.(cards);
  }, [cards, onCurrentCardsChange]);

  useEffect(() => {
    if (!restorePayload?.token || !restorePayload.layout) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    const nextCards = restorePayload.cardsRestored
      ? enrichCards(restorePayload.cards || [])
      : cards;
    const savedLayout = ensureMindMapLayoutForCards(
      restorePayload.layout,
      nextCards
    );
    latestLayoutRef.current = savedLayout;
    setCards(nextCards);
    setMindMapLayout(savedLayout);
    setLayoutRevision((prev) => prev + 1);
    queueMicrotask(() => onLayoutChange?.(savedLayout));
  }, [restorePayload?.token]);

  useEffect(() => {
    if (layoutMode !== LAYOUT_MODES.MINDMAP) return;
    if (!searchQuery.trim() || !matchingCardIds.length) return;
    const targetId = matchingCardIds[searchActiveIndex % matchingCardIds.length];
    const node = containerRef.current?.querySelector(`[data-card-id="${targetId}"]`);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [layoutMode, searchQuery, searchActiveIndex, matchingCardIds]);

  const persistLayout = useCallback(
    (nextLayout) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveDigestGridLayout(digestId, nextLayout).catch(() => {});
      }, 500);
    },
    [digestId]
  );

  const handleMindMapLayoutChange = useCallback(
    (nextLayout) => {
      latestLayoutRef.current = nextLayout;
      setMindMapLayout(nextLayout);
      onLayoutChange?.(nextLayout);
    },
    [onLayoutChange]
  );

  const handleApplyDefaultLayout = () => {
    const nextLayout = buildDefaultMindMapLayout(cards);
    latestLayoutRef.current = nextLayout;
    setMindMapLayout(nextLayout);
    setLayoutRevision((prev) => prev + 1);
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
    if (event.target.closest(".react-flow__node, .mindmap-card-node")) {
      if (event.target.closest(".sd-highlight, .sd-search-hit")) return;
    }
    if (event.target.closest(".react-flow__pane")) return;

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

  const handleDeleteCard = useCallback(
    async (card) => {
      if (!card?.id) return;
      const label = card.title || "카드";
      const followUp = card.source
        ? "주석·질문 원본은 유지됩니다."
        : "삭제한 요약 카드는 다시 요약하기 전까지 복구할 수 없습니다.";
      if (
        !window.confirm(
          `"${label}"을(를) 레이아웃에서 제거할까요?\n${followUp}`
        )
      ) {
        return;
      }

      setDeletingCardId(card.id);
      setError("");
      try {
        const result = await deleteGridCard(digestId, card.id);
        const nextLayout = ensureMindMapLayoutForCards(
          result.layout,
          cards.filter((item) => item.id !== card.id)
        );
        latestLayoutRef.current = nextLayout;
        setCards((prev) => prev.filter((item) => item.id !== card.id));
        setMindMapLayout(nextLayout);
        setLayoutRevision((prev) => prev + 1);
        onLayoutChange?.(nextLayout);
        onCardsChanged?.();
      } catch (err) {
        setError(err.message || "카드를 제거하지 못했습니다.");
      } finally {
        setDeletingCardId(null);
      }
    },
    [digestId, cards, onCardsChanged, onLayoutChange]
  );

  const cardRenderProps = useMemo(
    () => ({
      annotations,
      searchQuery,
      matchingCardIds,
      searchActiveIndex,
      onNavigateToSource: handleCardSourceNavigate,
      onDeleteCard: handleDeleteCard,
      deletingCardId,
    }),
    [
      annotations,
      searchQuery,
      matchingCardIds,
      searchActiveIndex,
      handleCardSourceNavigate,
      handleDeleteCard,
      deletingCardId,
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
        layoutMode === LAYOUT_MODES.MINDMAP ? " summary-layout-mindmap" : ""
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

      {cards.length > 0 && layoutMode === LAYOUT_MODES.MINDMAP && (
        <MindMapCanvas
          cards={cards}
          mindMapLayout={mindMapLayout}
          cardProps={cardRenderProps}
          layoutRevision={layoutRevision}
          onLayoutChange={handleMindMapLayoutChange}
          onPersistLayout={persistLayout}
          onApplyDefaultLayout={handleApplyDefaultLayout}
          searchQuery={searchQuery}
          matchingCardIds={matchingCardIds}
          searchActiveIndex={searchActiveIndex}
        />
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
