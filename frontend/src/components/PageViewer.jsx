import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import SummarySearchBar from "./SummarySearchBar";
import LoadingSpinner from "./LoadingSpinner";
import { fetchPageContent } from "../api";
import {
  applyAnnotationHighlights,
  applySearchHighlightsToMarkup,
  buildCrossPageSearchIndex,
  stripDecorativeMarkup,
} from "../utils/highlightUtils";
import { focusDocumentSource } from "../utils/sourceNavigation";

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

export default function PageViewer({
  digestId,
  pageNumber,
  totalPages,
  annotations,
  searchOpen = false,
  onSearchClose,
  onPageChange,
  onContentChange,
  saveVersion = 0,
  isEditing = false,
  onEditingChange,
  onRequestAnnotation,
  onHighlightClick,
  sourceFocus = null,
}) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const searchActiveIndexRef = useRef(0);
  const searchScanIdRef = useRef(0);
  const pageNumberRef = useRef(pageNumber);
  const onPageChangeRef = useRef(onPageChange);

  pageNumberRef.current = pageNumber;
  onPageChangeRef.current = onPageChange;

  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const wasEditingRef = useRef(false);
  const savedContentRef = useRef("");
  const prevSaveVersionRef = useRef(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActiveIndex, setSearchActiveIndex] = useState(0);
  const [searchResults, setSearchResults] = useState([]);
  const [searchScanning, setSearchScanning] = useState(false);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    searchActiveIndexRef.current = 0;
    setSearchActiveIndex(0);
  }, []);

  useEffect(() => {
    if (!searchOpen) clearSearch();
  }, [searchOpen, clearSearch]);

  const pageAnnotations = useMemo(
    () => annotations.filter((ann) => (ann.page_number || 1) === pageNumber),
    [annotations, pageNumber]
  );

  const activeLocalIndex = useMemo(() => {
    const hit = searchResults[searchActiveIndex];
    if (!hit || hit.pageNumber !== pageNumber || !searchQuery.trim()) return -1;
    return hit.localIndex;
  }, [searchResults, searchActiveIndex, pageNumber, searchQuery]);

  const renderedContent = useMemo(() => {
    const annotated = applyAnnotationHighlights(
      stripDecorativeMarkup(content),
      pageAnnotations
    );
    return applySearchHighlightsToMarkup(
      annotated,
      searchQuery,
      activeLocalIndex
    );
  }, [content, pageAnnotations, searchQuery, activeLocalIndex]);

  const goToGlobalSearchIndex = useCallback(
    (globalIndex) => {
      const target = searchResults[globalIndex];
      if (!target) return;

      searchActiveIndexRef.current = globalIndex;
      setSearchActiveIndex(globalIndex);

      if (target.pageNumber !== pageNumber) {
        onPageChange?.(target.pageNumber);
      }
    },
    [searchResults, pageNumber, onPageChange]
  );

  const loadPageText = useCallback(
    async (targetPage) => {
      const data = await fetchPageContent(digestId, targetPage);
      return data.content || "";
    },
    [digestId]
  );

  useEffect(() => {
    setSearchQuery("");
    setSearchResults([]);
    searchActiveIndexRef.current = 0;
    setSearchActiveIndex(0);
  }, [digestId]);

  useEffect(() => {
    if (!digestId) return;

    onEditingChange?.(false);
    prevSaveVersionRef.current = 0;
    setLoading(true);
    fetchPageContent(digestId, pageNumber)
      .then((data) => {
        const nextContent = data.content || "";
        savedContentRef.current = nextContent;
        setContent(nextContent);
      })
      .catch(() => {
        savedContentRef.current = "";
        setContent("");
      })
      .finally(() => setLoading(false));
  }, [digestId, pageNumber]);

  useEffect(() => {
    onContentChange?.({
      content,
      isDirty: content !== savedContentRef.current,
    });
  }, [content, onContentChange]);

  useEffect(() => {
    if (saveVersion <= prevSaveVersionRef.current) return;
    prevSaveVersionRef.current = saveVersion;
    savedContentRef.current = content;
    onContentChange?.({ content, isDirty: false });
  }, [saveVersion, content, onContentChange]);

  useEffect(() => {
    if (!digestId || !searchQuery.trim()) {
      setSearchResults([]);
      setSearchScanning(false);
      return;
    }

    const scanId = searchScanIdRef.current + 1;
    searchScanIdRef.current = scanId;
    setSearchScanning(true);

    buildCrossPageSearchIndex(totalPages, searchQuery, loadPageText)
      .then((results) => {
        if (searchScanIdRef.current !== scanId) return;
        setSearchResults(results);

        if (!results.length) {
          searchActiveIndexRef.current = 0;
          setSearchActiveIndex(0);
          return;
        }

        const target = results[0];
        searchActiveIndexRef.current = 0;
        setSearchActiveIndex(0);

        if (target.pageNumber !== pageNumberRef.current) {
          onPageChangeRef.current?.(target.pageNumber);
        }
      })
      .finally(() => {
        if (searchScanIdRef.current === scanId) {
          setSearchScanning(false);
        }
      });
  }, [digestId, searchQuery, totalPages, loadPageText]);

  useEffect(() => {
    if (loading || activeLocalIndex < 0) return;

    waitForPaint().then(() => {
      const target = containerRef.current?.querySelector(
        `.sd-search-hit[data-search-index="${activeLocalIndex}"]`
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [loading, pageNumber, activeLocalIndex, renderedContent]);

  useEffect(() => {
    if (!sourceFocus || loading) return;
    if ((sourceFocus.pageNumber || 1) !== pageNumber) return;

    waitForPaint().then(() => {
      focusDocumentSource(containerRef.current, sourceFocus);
    });
  }, [sourceFocus, pageNumber, loading, renderedContent]);

  const handleDocumentMouseUp = (event) => {
    if (event.target.closest(".sd-highlight, .sd-search-hit")) return;

    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || "";
    if (!selectedText || selectedText.length < 2) return;

    const container = containerRef.current;
    if (!container || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;

    onRequestAnnotation?.({
      x: event.clientX,
      y: event.clientY,
      selectedText,
      pageNumber,
    });
  };

  useEffect(() => {
    if (wasEditingRef.current && !isEditing && editorRef.current) {
      setContent(editorRef.current.innerText);
    }
    wasEditingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing || !editorRef.current) return;
    editorRef.current.textContent = content;
    editorRef.current.focus();
  }, [isEditing, pageNumber]);

  const handleEditorInput = () => {
    if (!editorRef.current) return;
    setContent(editorRef.current.innerText);
  };

  const handleHighlightClick = (event) => {
    const highlight = event.target.closest(".sd-highlight");
    if (!highlight) return;

    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();

    const annotationId = Number(highlight.dataset.id);
    const annotation = pageAnnotations.find((ann) => ann.id === annotationId);
    if (!annotation) return;

    const rect = highlight.getBoundingClientRect();
    onHighlightClick?.({
      annotation,
      x: rect.left + rect.width / 2,
      y: rect.bottom,
    });
  };

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
          matchCount={searchResults.length}
          activeIndex={searchActiveIndex}
          onPrev={() => {
            if (!searchResults.length) return;
            const next =
              (searchActiveIndex - 1 + searchResults.length) %
              searchResults.length;
            goToGlobalSearchIndex(next);
          }}
          onNext={() => {
            if (!searchResults.length) return;
            const next = (searchActiveIndex + 1) % searchResults.length;
            goToGlobalSearchIndex(next);
          }}
          onClear={clearSearch}
          onClose={onSearchClose}
        />
      )}

      {searchScanning && (
        <p className="search-scan-status">전체 {totalPages}페이지 검색 중...</p>
      )}

      <div className="page-viewer-body">
        {loading && (
          <div className="page-loading-overlay">
            <LoadingSpinner label="페이지를 불러오는 중..." />
          </div>
        )}

        <div
          ref={containerRef}
          className={`document-body${isEditing ? " is-editing" : ""}`}
          data-page-number={pageNumber}
          onMouseUp={isEditing ? undefined : handleDocumentMouseUp}
          onClick={isEditing ? undefined : handleHighlightClick}
        >
          {isEditing ? (
            <div
              ref={editorRef}
              className="page-inline-editor"
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              spellCheck={false}
              role="textbox"
              aria-label="요약 내용 편집"
            />
          ) : (
            <ReactMarkdown
              key={`page-${pageNumber}`}
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
            >
              {renderedContent}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
}
