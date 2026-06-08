import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { normalizeCardType, normalizeWeight } from "../utils/smartLayoutEngine";

const TYPE_LABELS = {
  main: "주제",
  detail: "상세",
  question: "질문",
};

const SOURCE_LABELS = {
  note: "주석 카드",
  chat: "질문 카드",
};

export default function SummaryCard({ card, highlightedContent, onNavigateToSource }) {
  const cardType = normalizeCardType(card.type);
  const weight = normalizeWeight(card.weight, cardType);
  const sourceLabel = SOURCE_LABELS[card.source];

  return (
    <article
      className={`summary-card summary-card--${cardType}${
        card.source ? ` summary-card--source-${card.source}` : ""
      }`}
    >
      <header className="summary-card-header">
        <span className="summary-card-type">
          {sourceLabel || TYPE_LABELS[cardType]}
        </span>
        {!card.source && (
          <span className="summary-card-weight" title="AI 중요도">
            {weight}
          </span>
        )}
        <h3 className="summary-card-title">{card.title}</h3>
        {card.source && onNavigateToSource && (
          <button
            type="button"
            className="summary-card-source-link"
            onClick={(event) => {
              event.stopPropagation();
              onNavigateToSource(card);
            }}
            title="주석을 작성한 원문 위치로 이동"
          >
            원문 위치로
          </button>
        )}
        <span className="summary-card-drag-handle" title="드래그하여 이동">
          ⋮⋮
        </span>
      </header>
      <div className="summary-card-body document-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {highlightedContent}
        </ReactMarkdown>
      </div>
    </article>
  );
}
