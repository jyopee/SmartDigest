import { memo, useCallback, useEffect, useMemo, useState } from "react";
import TextLine from "./TextLine";
import TextListBlock from "./TextListBlock";
import PageSplitDivider from "./PageSplitDivider";
import PageSplitContextMenu from "./PageSplitContextMenu";
import {
  applyAnnotationHighlights,
  applySearchHighlightsToMarkup,
  countSearchMatches,
} from "../utils/highlightUtils";
import {
  buildLinePages,
  normalizeLineSplitPoints,
  splitContentIntoLines,
} from "../utils/pageSplitUtils";
import {
  buildLineDisplayGroups,
  parseMarkdownLine,
} from "../utils/markdownLineStyle";

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function annotationsForLine(annotations, lineText) {
  return annotations.filter((ann) => {
    const selected = (ann.selected_text || "").trim();
    return selected && lineText.includes(selected);
  });
}

function renderLineMarkup(
  line,
  annotations,
  searchQuery,
  activeLocalIndex,
  searchIndexStart
) {
  const { kind, text } = parseMarkdownLine(line);
  const plain = text || "\u00a0";
  const lineAnnotations = annotationsForLine(annotations, line);
  let markup = applyAnnotationHighlights(escapeHtml(plain), lineAnnotations);
  markup = applySearchHighlightsToMarkup(
    markup,
    searchQuery,
    activeLocalIndex,
    searchIndexStart
  );
  return { kind, markup };
}

function SplittableMarkdownBody({
  content,
  splitPoints,
  activeVirtualPage = 1,
  onSplitPointsChange,
  annotations = [],
  searchQuery = "",
  activeLocalIndex = -1,
  onLineMouseUp,
  onHighlightClick,
}) {
  const [splitMenu, setSplitMenu] = useState(null);

  const lines = useMemo(() => splitContentIntoLines(content), [content]);

  const normalizedSplitPoints = useMemo(
    () => normalizeLineSplitPoints(splitPoints, lines.length),
    [splitPoints, lines.length]
  );

  const virtualPages = useMemo(
    () => buildLinePages(lines, normalizedSplitPoints),
    [lines, normalizedSplitPoints]
  );

  const activePage = virtualPages[activeVirtualPage - 1] || virtualPages[0];

  const searchIndexByLine = useMemo(() => {
    const offsets = new Map();
    let cursor = 0;

    lines.forEach((line, index) => {
      offsets.set(index, cursor);
      cursor += countSearchMatches(line, searchQuery);
    });

    return offsets;
  }, [lines, searchQuery]);

  const canSplitAfter = useCallback(
    (lineIndex) =>
      lineIndex >= 0 &&
      lineIndex < lines.length - 1 &&
      !normalizedSplitPoints.includes(lineIndex),
    [lines.length, normalizedSplitPoints]
  );

  const canCancelSplit = useCallback(
    (lineIndex) => normalizedSplitPoints.includes(lineIndex),
    [normalizedSplitPoints]
  );

  const applySplitChange = useCallback(
    (nextPoints, { manual = false } = {}) => {
      const normalized = normalizeLineSplitPoints(nextPoints, lines.length);
      onSplitPointsChange(normalized, { manual });
    },
    [lines.length, onSplitPointsChange]
  );

  useEffect(() => {
    if (!splitMenu) return undefined;

    const closeMenu = (event) => {
      if (event?.target?.closest?.(".page-split-context-menu")) return;
      setSplitMenu(null);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setSplitMenu(null);
    };

    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [splitMenu]);

  const handleSplitAfter = useCallback(
    (lineIndex) => {
      if (!canSplitAfter(lineIndex)) return;

      applySplitChange(
        [...normalizedSplitPoints, lineIndex].sort((a, b) => a - b),
        { manual: true }
      );
      setSplitMenu(null);
    },
    [canSplitAfter, normalizedSplitPoints, applySplitChange]
  );

  const handleCancelSplit = useCallback(
    (lineIndex) => {
      applySplitChange(
        normalizedSplitPoints.filter((point) => point !== lineIndex),
        { manual: true }
      );
      setSplitMenu(null);
    },
    [normalizedSplitPoints, applySplitChange]
  );

  const handleContextMenuRequest = useCallback(
    (event, lineIndex) => {
      if (canSplitAfter(lineIndex)) {
        setSplitMenu({
          x: event.clientX,
          y: event.clientY,
          lineIndex,
          mode: "split",
        });
        return;
      }

      if (canCancelSplit(lineIndex)) {
        setSplitMenu({
          x: event.clientX,
          y: event.clientY,
          lineIndex,
          mode: "cancel",
        });
      }
    },
    [canSplitAfter, canCancelSplit]
  );

  const handleMenuConfirm = useCallback(() => {
    if (!splitMenu) return;

    if (splitMenu.mode === "cancel") {
      handleCancelSplit(splitMenu.lineIndex);
      return;
    }

    handleSplitAfter(splitMenu.lineIndex);
  }, [splitMenu, handleCancelSplit, handleSplitAfter]);

  const renderMarkupForLine = useCallback(
    (line, lineIndex) => {
      const searchIndexStart = searchIndexByLine.get(lineIndex) ?? 0;
      return renderLineMarkup(
        line,
        annotations,
        searchQuery,
        activeLocalIndex,
        searchIndexStart
      );
    },
    [annotations, searchQuery, activeLocalIndex, searchIndexByLine]
  );

  const displayGroups = useMemo(() => {
    if (!lines.length) return [];

    return buildLineDisplayGroups(lines).map((group) => {
      if (group.type === "single") {
        const { lineIndex, sourceLine } = group.line;
        const rendered = renderMarkupForLine(sourceLine, lineIndex);
        return {
          type: "single",
          lineIndex,
          lineKind: rendered.kind,
          lineMarkup: rendered.markup,
        };
      }

      return {
        type: "list-block",
        tree: group.tree,
        lineIndexes: group.lines.map((line) => line.lineIndex),
      };
    });
  }, [lines, renderMarkupForLine]);

  const activeDisplayGroups = useMemo(() => {
    if (!activePage?.lines?.length) return [];
    const pageStart = activePage.startLine;
    const pageEnd = pageStart + activePage.lines.length - 1;

    return displayGroups.filter((group) => {
      if (group.type === "single") {
        return group.lineIndex >= pageStart && group.lineIndex <= pageEnd;
      }
      return group.lineIndexes.some(
        (lineIndex) => lineIndex >= pageStart && lineIndex <= pageEnd
      );
    });
  }, [displayGroups, activePage]);

  if (!lines.length || !activePage) {
    return <p className="page-split-empty">표시할 내용이 없습니다.</p>;
  }

  const leadingSplitLine =
    activePage.startLine > 0 ? activePage.startLine - 1 : null;

  return (
    <div className="splittable-body">
      {leadingSplitLine !== null &&
        normalizedSplitPoints.includes(leadingSplitLine) && (
          <PageSplitDivider
            lineIndex={leadingSplitLine}
            onMerge={handleCancelSplit}
          />
        )}

      {activeDisplayGroups.map((group) => {
        if (group.type === "list-block") {
          return (
            <div
              key={`list-block-${group.lineIndexes[0]}`}
              className="text-line-wrap text-line-wrap--list-block"
            >
              <TextListBlock
                tree={group.tree}
                visibleStart={activePage.startLine}
                visibleEnd={activePage.startLine + activePage.lines.length - 1}
                canSplitAfter={canSplitAfter}
                splitAfterLineIndexes={normalizedSplitPoints}
                renderMarkupForLine={renderMarkupForLine}
                onContextMenuRequest={handleContextMenuRequest}
                onLineMouseUp={onLineMouseUp}
                onHighlightClick={onHighlightClick}
                renderSplitDivider={(lineIndex) => (
                  <PageSplitDivider
                    lineIndex={lineIndex}
                    onMerge={handleCancelSplit}
                  />
                )}
              />
            </div>
          );
        }

        const { lineIndex, lineKind, lineMarkup } = group;
        return (
          <div key={`line-wrap-${lineIndex}`} className="text-line-wrap">
            <TextLine
              lineIndex={lineIndex}
              lineKind={lineKind}
              markupHtml={lineMarkup}
              canSplit={canSplitAfter(lineIndex)}
              onContextMenuRequest={handleContextMenuRequest}
              onLineMouseUp={onLineMouseUp}
              onHighlightClick={onHighlightClick}
            />
            {normalizedSplitPoints.includes(lineIndex) && (
              <PageSplitDivider
                lineIndex={lineIndex}
                onMerge={handleCancelSplit}
              />
            )}
          </div>
        );
      })}

      {splitMenu && (
        <PageSplitContextMenu
          x={splitMenu.x}
          y={splitMenu.y}
          mode={splitMenu.mode}
          onConfirm={handleMenuConfirm}
          onClose={() => setSplitMenu(null)}
        />
      )}
    </div>
  );
}

export default memo(SplittableMarkdownBody);
