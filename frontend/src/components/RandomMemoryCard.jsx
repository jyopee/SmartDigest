import { useEffect, useState } from "react";
import {
  extractCardSummary,
  fetchAllKnowledgeCards,
  pickRandomKnowledgeCard,
} from "../utils/knowledgeCardMemory";

export default function RandomMemoryCard({ digests = [], onOpenCard }) {
  const [loading, setLoading] = useState(false);
  const [memoryCard, setMemoryCard] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRandomMemory() {
      if (!digests.length) {
        setMemoryCard(null);
        return;
      }

      setLoading(true);
      try {
        const cards = await fetchAllKnowledgeCards(digests);
        if (cancelled) return;
        setMemoryCard(pickRandomKnowledgeCard(cards));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRandomMemory();
    return () => {
      cancelled = true;
    };
  }, [digests]);

  const handleClick = () => {
    if (!memoryCard || loading) return;
    onOpenCard?.({
      digestId: memoryCard.digestId,
      cardId: memoryCard.id,
      card: memoryCard,
    });
  };

  const title = memoryCard?.title?.trim() || "제목 없음";
  const summary = extractCardSummary(memoryCard?.content);
  const digestLabel = memoryCard?.digestFilename || "";

  return (
    <article
      className={`dashboard-stat-card dashboard-stat-card--memory${
        memoryCard ? " is-interactive" : " is-empty"
      }`}
    >
      <p className="dashboard-stat-label">오늘의 지식 (Random Memory)</p>

      {loading ? (
        <p className="dashboard-memory-status">지식 카드를 불러오는 중...</p>
      ) : memoryCard ? (
        <button
          type="button"
          className="dashboard-memory-button"
          onClick={handleClick}
          title={`${digestLabel} · ${title}`}
        >
          <p className="dashboard-memory-title">{title}</p>
          <p className="dashboard-memory-summary">
            {summary || "핵심 요약이 아직 없습니다."}
          </p>
          {digestLabel ? (
            <p className="dashboard-memory-source">{digestLabel}</p>
          ) : null}
          <span className="dashboard-memory-action">마인드맵에서 보기</span>
        </button>
      ) : (
        <p className="dashboard-memory-empty">
          아직 저장된 지식이 없습니다. 첫 지식 카드를 만들어보세요!
        </p>
      )}
    </article>
  );
}
