import { memo, useCallback, useMemo } from "react";
import { isListStubLabel } from "../utils/markdownLineStyle";

function isVisible(lineIndex, visibleStart, visibleEnd) {
  if (visibleStart == null || visibleEnd == null) return true;
  return lineIndex >= visibleStart && lineIndex <= visibleEnd;
}

function childSubtreeVisible(node, visibleStart, visibleEnd) {
  if (isVisible(node.lineIndex, visibleStart, visibleEnd)) return true;
  return (node.children || []).some((child) =>
    childSubtreeVisible(child, visibleStart, visibleEnd)
  );
}

function getDisplayDepth(node, minDepth) {
  return Math.max(node.depth ?? 0, minDepth ?? 0);
}

function ListRow({
  depth = 0,
  kind = "list",
  lineIndex,
  markup,
  order,
  nested = false,
  canSplit = false,
  showSplit = false,
  onContextMenuRequest,
  onLineMouseUp,
  onHighlightClick,
  renderSplitDivider,
}) {
  const handleContextMenu = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      onContextMenuRequest?.(event, lineIndex);
    },
    [lineIndex, onContextMenuRequest]
  );

  const bullet =
    kind === "olist" ? `${order ?? 1}.` : nested || depth > 0 ? "◦" : "•";

  return (
    <>
      <div
        className={`reader-list-row${
          depth > 0 ? " reader-list-row--nested" : ""
        }${canSplit ? " text-line--can-split" : ""}`}
        data-line-index={lineIndex}
        style={{ "--reader-list-depth": depth }}
        onContextMenu={handleContextMenu}
        onMouseUp={onLineMouseUp}
        onClick={onHighlightClick}
      >
        <span className="reader-list-gutter" aria-hidden="true">
          {bullet}
        </span>
        <span
          className="reader-list-content"
          dangerouslySetInnerHTML={{ __html: markup }}
        />
      </div>
      {showSplit && renderSplitDivider?.(lineIndex)}
    </>
  );
}

function ListTreeNodes({
  nodes = [],
  minDepth,
  canSplitAfter,
  splitAfterLineIndexes = [],
  visibleStart,
  visibleEnd,
  onContextMenuRequest,
  onLineMouseUp,
  onHighlightClick,
  renderSplitDivider,
}) {
  return nodes.map((node) => (
    <ListTreeNode
      key={`list-node-${node.lineIndex}`}
      node={node}
      minDepth={minDepth}
      canSplitAfter={canSplitAfter}
      splitAfterLineIndexes={splitAfterLineIndexes}
      visibleStart={visibleStart}
      visibleEnd={visibleEnd}
      onContextMenuRequest={onContextMenuRequest}
      onLineMouseUp={onLineMouseUp}
      onHighlightClick={onHighlightClick}
      renderSplitDivider={renderSplitDivider}
    />
  ));
}

function ListTreeNode({
  node,
  minDepth,
  canSplitAfter,
  splitAfterLineIndexes = [],
  visibleStart,
  visibleEnd,
  onContextMenuRequest,
  onLineMouseUp,
  onHighlightClick,
  renderSplitDivider,
}) {
  const { lineIndex, kind, markup, order, text } = node;
  const displayDepth = getDisplayDepth(node, minDepth);
  const hasChildren = node.children?.length > 0;
  const childMinDepth = hasChildren ? displayDepth + 1 : undefined;

  if (
    !isVisible(lineIndex, visibleStart, visibleEnd) &&
    !node.children?.some((child) =>
      childSubtreeVisible(child, visibleStart, visibleEnd)
    )
  ) {
    return null;
  }

  const showNode = isVisible(lineIndex, visibleStart, visibleEnd);

  return (
    <div
      className={`reader-list-node${
        hasChildren && isListStubLabel(text) ? " reader-list-node--stub" : ""
      }`}
    >
      {showNode && (
        <ListRow
          depth={displayDepth}
          kind={kind}
          lineIndex={lineIndex}
          markup={markup}
          order={order}
          nested={displayDepth > 0}
          canSplit={canSplitAfter?.(lineIndex)}
          showSplit={splitAfterLineIndexes.includes(lineIndex)}
          onContextMenuRequest={onContextMenuRequest}
          onLineMouseUp={onLineMouseUp}
          onHighlightClick={onHighlightClick}
          renderSplitDivider={renderSplitDivider}
        />
      )}

      {hasChildren && (
        <div className="reader-list-children">
          <ListTreeNodes
            nodes={node.children}
            minDepth={childMinDepth}
            canSplitAfter={canSplitAfter}
            splitAfterLineIndexes={splitAfterLineIndexes}
            visibleStart={visibleStart}
            visibleEnd={visibleEnd}
            onContextMenuRequest={onContextMenuRequest}
            onLineMouseUp={onLineMouseUp}
            onHighlightClick={onHighlightClick}
            renderSplitDivider={renderSplitDivider}
          />
        </div>
      )}
    </div>
  );
}

function attachMarkupToTree(nodes, renderMarkupForLine) {
  return nodes.map((treeNode) => {
    const { line, children } = treeNode;
    const rendered = renderMarkupForLine(line.sourceLine, line.lineIndex);
    return {
      lineIndex: line.lineIndex,
      kind: rendered.kind,
      markup: rendered.markup,
      order: line.order,
      depth: line.depth,
      text: line.text,
      children: attachMarkupToTree(children, renderMarkupForLine),
    };
  });
}

function TextListBlock({
  tree = [],
  visibleStart,
  visibleEnd,
  canSplitAfter,
  splitAfterLineIndexes = [],
  renderMarkupForLine,
  onContextMenuRequest,
  onLineMouseUp,
  onHighlightClick,
  renderSplitDivider,
}) {
  const nodes = useMemo(
    () => attachMarkupToTree(tree, renderMarkupForLine),
    [tree, renderMarkupForLine]
  );

  return (
    <div className="reader-list-block">
      <ListTreeNodes
        nodes={nodes}
        canSplitAfter={canSplitAfter}
        splitAfterLineIndexes={splitAfterLineIndexes}
        visibleStart={visibleStart}
        visibleEnd={visibleEnd}
        onContextMenuRequest={onContextMenuRequest}
        onLineMouseUp={onLineMouseUp}
        onHighlightClick={onHighlightClick}
        renderSplitDivider={renderSplitDivider}
      />
    </div>
  );
}

export default memo(TextListBlock);
