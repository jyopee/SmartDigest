import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { Handle, Position } from "@xyflow/react";
import SummaryCard from "./SummaryCard";
import {
  applyAnnotationHighlights,
  stripDecorativeMarkup,
} from "../utils/highlightUtils";

const HANDLES = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
];

function SummaryCardNode({ data, selected }) {
  const {
    card,
    annotations = [],
    searchQuery = "",
    matchingCardIds = [],
    searchActiveIndex = 0,
    onNavigateToSource,
    onDeleteCard,
    deletingCardId,
    connectMode = false,
    isConnectSource = false,
    positionAnimating = false,
    textAlign = "left",
    isDashboardFocus = false,
  } = data;

  const highlightedContent = useMemo(() => {
    const cardAnnotations = annotations.filter(
      (ann) => (ann.page_number || 1) === (card.page_number || 1)
    );
    return applyAnnotationHighlights(
      stripDecorativeMarkup(card.content),
      cardAnnotations
    );
  }, [annotations, card.content, card.page_number]);

  const isMatch = !searchQuery.trim() || matchingCardIds.includes(card.id);
  const isActive =
    searchQuery.trim() &&
    matchingCardIds[searchActiveIndex % matchingCardIds.length] === card.id;

  return (
    <motion.div
      className={`mindmap-card-node${selected ? " is-selected" : ""}${
        isMatch ? "" : " is-search-hidden"
      }${isActive ? " is-search-active" : ""}${
        connectMode ? " is-connect-mode" : ""
      }${isConnectSource ? " is-connect-source" : ""}${
        positionAnimating ? " is-position-animating" : ""
      }${isDashboardFocus ? " is-dashboard-focus" : ""}`}
      data-card-id={String(card.id)}
      data-page-number={card.page_number || 1}
      animate={{ scale: 1, opacity: 1 }}
      transition={{
        duration: positionAnimating ? 0.32 : 0.18,
        ease: [0.4, 0, 0.2, 1],
      }}
    >
      {HANDLES.map((handle) => (
        <Handle
          key={`${handle.id}-target`}
          id={`${handle.id}-target`}
          type="target"
          position={handle.position}
          className="mindmap-handle mindmap-handle-target"
        />
      ))}
      {HANDLES.map((handle) => (
        <Handle
          key={`${handle.id}-source`}
          id={`${handle.id}-source`}
          type="source"
          position={handle.position}
          className="mindmap-handle mindmap-handle-source"
        />
      ))}
      <SummaryCard
        card={card}
        highlightedContent={highlightedContent}
        onNavigateToSource={onNavigateToSource}
        onDelete={onDeleteCard}
        deleting={deletingCardId === card.id}
        textAlign={textAlign}
      />
    </motion.div>
  );
}

export default memo(SummaryCardNode);
