import { memo, useCallback } from "react";

function TextLine({
  lineIndex,
  lineKind = "p",
  markupHtml,
  canSplit = false,
  onContextMenuRequest,
  onLineMouseUp,
  onHighlightClick,
}) {
  const handleContextMenu = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      onContextMenuRequest?.(event, lineIndex);
    },
    [lineIndex, onContextMenuRequest]
  );

  const kindClass =
    lineKind && lineKind !== "p" ? ` text-line--${lineKind}` : "";

  return (
    <div
      className={`text-line${kindClass}${canSplit ? " text-line--can-split" : ""}`}
      data-line-index={lineIndex}
      onContextMenu={handleContextMenu}
      onMouseUp={onLineMouseUp}
      onClick={onHighlightClick}
    >
      <div
        className="text-line-body"
        dangerouslySetInnerHTML={{ __html: markupHtml }}
      />
    </div>
  );
}

export default memo(TextLine);
