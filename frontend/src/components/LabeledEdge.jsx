import { memo, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
} from "@xyflow/react";

function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
}) {
  const { setEdges } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data?.label || "");

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 18,
    offset: 28,
  });

  const label = (data?.label || "").trim() || "연관됨";
  const disconnectMode = Boolean(data?.disconnectMode);

  const commitLabel = () => {
    const next = draft.trim() || "연관됨";
    setEdges((edges) =>
      edges.map((edge) =>
        edge.id === id
          ? {
              ...edge,
              data: { ...edge.data, label: next },
              label: next,
            }
          : edge
      )
    );
    data?.onLabelCommit?.(id, next);
    setEditing(false);
  };

  const handleRemove = (event, { silent = false } = {}) => {
    event.stopPropagation();
    data?.onEdgeRemove?.(id, { silent });
  };

  const edgeStyle = {
    stroke: "#475569",
    strokeWidth: 2.2,
    ...style,
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={edgeStyle}
        interactionWidth={20}
      />
      <EdgeLabelRenderer>
        <div
          className="mindmap-edge-label-wrap nodrag nopan"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {editing ? (
            <input
              className="mindmap-edge-label-input"
              value={draft}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitLabel}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitLabel();
                }
                if (event.key === "Escape") {
                  setEditing(false);
                  setDraft(label);
                }
              }}
            />
          ) : (
            <div
              className={`mindmap-edge-label-group${
                disconnectMode ? " is-disconnect-target" : ""
              }`}
            >
              <button
                type="button"
                className="mindmap-edge-label"
                onClick={(event) => {
                  if (!disconnectMode) return;
                  handleRemove(event, { silent: true });
                }}
                onDoubleClick={(event) => {
                  if (disconnectMode) return;
                  event.stopPropagation();
                  setDraft(label);
                  setEditing(true);
                }}
                title={
                  disconnectMode
                    ? "클릭하여 관계 삭제"
                    : "더블클릭하여 연결 관계 수정"
                }
              >
                {label}
              </button>
              <button
                type="button"
                className="mindmap-edge-label-remove"
                onClick={(event) => handleRemove(event)}
                aria-label={`${label} 관계 삭제`}
                title="관계 삭제"
              >
                ×
              </button>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(LabeledEdge);
