import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useViewerInteraction } from "../contexts/ViewerInteractionContext";
import { useInView } from "react-intersection-observer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import SummarySearchBar from "./SummarySearchBar";
import LoadingSpinner from "./LoadingSpinner";
import { fetchPageMeta, fetchPageContent } from "../api";
import {
  applyAnnotationHighlights,
  applySearchHighlights,
  setActiveSearchHit,
  stripDecorativeMarkup,
} from "../utils/highlightUtils";
import { readerAlignClass } from "../constants/readerAlign";

function getPageNumberFromNode(node) {
  const section = node?.closest?.("[data-page-number]");
  return section ? Number(section.dataset.pageNumber) : 1;
}

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function SummaryViewer({
  digestId,
  annotations,
  searchOpen = false,
  onSearchClose,
  onVisiblePageChange,
  onLoadedPagesChange,
  onRequestAnnotation,
  onHighlightClick,
  textAlign = "left",
}) {
  const viewerInteraction = useViewerInteraction();
  const requestAnnotation =
    onRequestAnnotation ?? viewerInteraction.onRequestAnnotation;
  const highlightClickHandler =
    onHighlightClick ?? viewerInteraction.onHighlightClick;
  const containerRef = useRef(null);
  const searchHitsRef = useRef([]);
  const searchActiveIndexRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const pendingSearchIndexRef = useRef(null);

  const [loadedPages, setLoadedPages] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [initialLoading, setInitialLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchActiveIndex, setSearchActiveIndex] = useState(0);
  const [searchMatchCount, setSearchMatchCount] = useState(0);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    searchActiveIndexRef.current = 0;
    setSearchActiveIndex(0);
    setSearchMatchCount(0);
  }, []);

  useEffect(() => {
    if (!searchOpen) clearSearch();
  }, [searchOpen, clearSearch]);

  const { ref: sentinelRef, inView } = useInView({
    threshold: 0,
    rootMargin: "240px",
  });

  const annotationsByPage = useMemo(() => {
    const map = new Map();
    for (const ann of annotations) {
      const pageNumber = ann.page_number || 1;
      if (!map.has(pageNumber)) map.set(pageNumber, []);
      map.get(pageNumber).push(ann);
    }
    return map;
  }, [annotations]);

  const resetViewer = useCallback(() => {
    setLoadedPages([]);
    setTotalPages(1);
    setSearchQuery("");
    setSearchActiveIndex(0);
    setSearchMatchCount(0);
    searchHitsRef.current = [];
    pendingSearchIndexRef.current = null;
  }, []);

  const refreshSearchHighlights = useCallback(
    (preferredIndex = null) => {
      const root = containerRef.current;
      if (!root) return [];

      const hits = applySearchHighlights(root, searchQuery);
      searchHitsRef.current = hits;
      setSearchMatchCount(hits.length);

      if (!hits.length) {
        searchActiveIndexRef.current = 0;
        setSearchActiveIndex(0);
        return hits;
      }

      const nextIndex =
        preferredIndex == null
          ? Math.min(searchActiveIndexRef.current, hits.length - 1)
          : Math.max(0, Math.min(preferredIndex, hits.length - 1));

      searchActiveIndexRef.current = nextIndex;
      setSearchActiveIndex(nextIndex);
      setActiveSearchHit(hits, nextIndex);
      return hits;
    },
    [searchQuery]
  );

  const loadPage = useCallback(
    async (pageNumber) => {
      if (!digestId) return null;
      const data = await fetchPageContent(digestId, pageNumber);
      return {
        pageNumber: data.page_number,
        content: data.content || "",
        totalPages: data.total_pages || 1,
      };
    },
    [digestId]
  );

  const appendPage = useCallback((pageData) => {
    setLoadedPages((prev) => {
      if (prev.some((page) => page.pageNumber === pageData.pageNumber)) {
        return prev;
      }
      return [...prev, pageData].sort((a, b) => a.pageNumber - b.pageNumber);
    });
    setTotalPages(pageData.totalPages);
  }, []);

  const loadInitial = useCallback(async () => {
    if (!digestId) return;
    setInitialLoading(true);
    try {
      const meta = await fetchPageMeta(digestId);
      setTotalPages(meta.total_pages || 1);
      const firstPage = await loadPage(1);
      if (firstPage) {
        setLoadedPages([firstPage]);
        setTotalPages(firstPage.totalPages);
        onVisiblePageChange?.(1);
      }
    } finally {
      setInitialLoading(false);
    }
  }, [digestId, loadPage, onVisiblePageChange]);

  const loadNextPage = useCallback(async () => {
    if (!digestId || loadingMoreRef.current) return null;

    const nextPageNumber = loadedPages.length
      ? Math.max(...loadedPages.map((page) => page.pageNumber)) + 1
      : 1;

    if (nextPageNumber > totalPages) return null;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const pageData = await loadPage(nextPageNumber);
      if (pageData) appendPage(pageData);
      return pageData;
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [appendPage, digestId, loadPage, loadedPages, totalPages]);

  const ensurePagesUntilHit = useCallback(
    async (targetIndex) => {
      let guard = 0;
      while (guard < totalPages + 2) {
        await waitForPaint();
        let hits = refreshSearchHighlights(targetIndex);

        if (hits[targetIndex]) return hits[targetIndex];

        const loadedMax = loadedPages.length
          ? Math.max(...loadedPages.map((page) => page.pageNumber))
          : 0;

        if (loadedMax >= totalPages) return null;

        await loadNextPage();
        guard += 1;
      }
      return null;
    },
    [loadNextPage, loadedPages, refreshSearchHighlights, totalPages]
  );

  const scrollToSearchIndex = useCallback(
    async (index) => {
      if (!searchQuery.trim()) return;

      pendingSearchIndexRef.current = index;
      const target = await ensurePagesUntilHit(index);
      pendingSearchIndexRef.current = null;

      if (!target) return;

      const hits = searchHitsRef.current;
      searchActiveIndexRef.current = index;
      setSearchActiveIndex(index);
      setActiveSearchHit(hits, index);
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [ensurePagesUntilHit, searchQuery]
  );

  useEffect(() => {
    resetViewer();
    if (digestId) {
      loadInitial();
    }
  }, [digestId, loadInitial, resetViewer]);

  useEffect(() => {
    if (!inView || initialLoading || loadingMore) return;
    const loadedMax = loadedPages.length
      ? Math.max(...loadedPages.map((page) => page.pageNumber))
      : 0;
    if (loadedMax < totalPages) {
      loadNextPage();
    }
  }, [inView, initialLoading, loadingMore, loadedPages, totalPages, loadNextPage]);

  useEffect(() => {
    onLoadedPagesChange?.(loadedPages.length, totalPages);
  }, [loadedPages.length, totalPages, onLoadedPagesChange]);

  useEffect(() => {
    if (initialLoading) return;
    waitForPaint().then(() => {
      refreshSearchHighlights(pendingSearchIndexRef.current);
    });
  }, [loadedPages, annotations, searchQuery, initialLoading, refreshSearchHighlights]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const sections = root.querySelectorAll("[data-page-number]");
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (!visible.length) return;
        const pageNumber = Number(visible[0].target.dataset.pageNumber);
        onVisiblePageChange?.(pageNumber);
      },
      { root: null, threshold: [0.2, 0.4, 0.6] }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [loadedPages, onVisiblePageChange]);

  const handleDocumentMouseUp = (event) => {
    if (event.target.closest(".sd-highlight, .sd-search-hit")) return;

    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || "";
    if (!selectedText || selectedText.length < 2) return;

    const container = containerRef.current;
    if (!container || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;

    const pageNumber = getPageNumberFromNode(range.commonAncestorContainer);
    requestAnnotation?.({
      x: event.clientX,
      y: event.clientY,
      selectedText,
      pageNumber,
    });
  };

  const handleHighlightClick = (event) => {
    const highlight = event.target.closest(".sd-highlight");
    if (!highlight) return;

    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();

    const annotationId = Number(highlight.dataset.id);
    const pageNumber = getPageNumberFromNode(highlight);
    const pageAnnotations = annotationsByPage.get(pageNumber) || [];
    const annotation = pageAnnotations.find((ann) => ann.id === annotationId);
    if (!annotation) return;

    const rect = highlight.getBoundingClientRect();
    highlightClickHandler?.({
      annotation,
      x: rect.left + rect.width / 2,
      y: rect.bottom,
    });
  };

  const handlePrevSearch = () => {
    if (!searchMatchCount) return;
    const nextIndex =
      (searchActiveIndex - 1 + searchMatchCount) % searchMatchCount;
    scrollToSearchIndex(nextIndex);
  };

  const handleNextSearch = () => {
    if (!searchMatchCount) return;
    const nextIndex = (searchActiveIndex + 1) % searchMatchCount;
    scrollToSearchIndex(nextIndex);
  };

  const loadedMaxPage = loadedPages.length
    ? Math.max(...loadedPages.map((page) => page.pageNumber))
    : 0;

  if (initialLoading) {
    return <LoadingSpinner label="요약문을 불러오는 중..." />;
  }

  return (
    <div className="summary-viewer">
      {searchOpen && (
        <SummarySearchBar
          query={searchQuery}
          onQueryChange={(value) => {
            setSearchQuery(value);
            searchActiveIndexRef.current = 0;
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

      <div
        ref={containerRef}
        className={`document-body summary-scroll-body reader-prose ${readerAlignClass(textAlign)}`}
        onMouseUp={handleDocumentMouseUp}
        onClick={handleHighlightClick}
      >
        {loadedPages.map((page) => {
          const pageAnnotations = annotationsByPage.get(page.pageNumber) || [];
          const highlighted = applyAnnotationHighlights(
            stripDecorativeMarkup(page.content),
            pageAnnotations
          );

          return (
            <section
              key={page.pageNumber}
              className="summary-chunk"
              data-page-number={page.pageNumber}
            >
              {totalPages > 1 && (
                <div className="summary-chunk-label">페이지 {page.pageNumber}</div>
              )}
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {highlighted}
              </ReactMarkdown>
            </section>
          );
        })}

        {loadedMaxPage < totalPages && (
          <div ref={sentinelRef} className="summary-sentinel" aria-hidden="true" />
        )}

        {loadingMore && (
          <LoadingSpinner label="다음 내용을 불러오는 중..." />
        )}

        {!loadingMore && loadedMaxPage >= totalPages && totalPages > 1 && (
          <p className="summary-end-marker">모든 페이지를 불러왔습니다.</p>
        )}
      </div>
    </div>
  );
}

export default memo(SummaryViewer);
