import { memo, useMemo } from "react";
import SummaryCard from "./SummaryCard";
import {
  applyAnnotationHighlights,
  stripDecorativeMarkup,
} from "../utils/highlightUtils";

function GridCardItem({
  card,
  annotations,
  searchQuery,
  matchingCardIds,
  searchActiveIndex,
  className = "summary-grid-item",
  onNavigateToSource,
  onDelete,
  deletingCardId,
  textAlign = "left",
}) {
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
    <div
      data-card-id={String(card.id)}
      data-page-number={card.page_number || 1}
      className={`${className}${isMatch ? "" : " is-search-hidden"}${
        isActive ? " is-search-active" : ""
      }`}
    >
      <SummaryCard
        card={card}
        highlightedContent={highlightedContent}
        onNavigateToSource={onNavigateToSource}
        onDelete={onDelete}
        deleting={deletingCardId === card.id}
        textAlign={textAlign}
      />
    </div>
  );
}

export default memo(GridCardItem);
