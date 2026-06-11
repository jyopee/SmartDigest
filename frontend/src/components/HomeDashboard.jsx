import { useMemo, useState } from "react";
import { getQuotaStats } from "../api/usageService";
import { resolveRecentDigests } from "../utils/recentDigests";
import RandomMemoryCard from "./RandomMemoryCard";

const TUTORIAL_STEPS = [
  {
    title: "문서 업로드",
    body: "상단의 「새로운 지식 추가」에서 PDF·DOCX·TXT를 올리면 AI가 요약본을 만들어 줍니다.",
  },
  {
    title: "읽고 정리하기",
    body: "전체 보기·페이지 보기에서 본문을 읽고, 드래그로 주석·AI 질문을 남겨 보세요.",
  },
  {
    title: "학습 카드 배치",
    body: "레이아웃 탭에서 카드를 배치하고 관계를 연결해 나만의 지식 지도를 완성하세요.",
  },
];

function StatCard({ label, value, hint, accent = "blue" }) {
  return (
    <article className={`dashboard-stat-card dashboard-stat-card--${accent}`}>
      <p className="dashboard-stat-label">{label}</p>
      <p className="dashboard-stat-value">{value}</p>
      {hint ? <p className="dashboard-stat-hint">{hint}</p> : null}
    </article>
  );
}

function DocumentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 3h7l5 5v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M15 3v5h5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export default function HomeDashboard({
  digests = [],
  usage,
  userId,
  onSelectDigest,
  onOpenKnowledgeCard,
}) {
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const stats = getQuotaStats(usage ?? {});
  const recentDigests = useMemo(
    () => resolveRecentDigests(digests, userId),
    [digests, userId]
  );

  const handleSampleStart = () => {
    if (!digests.length) return;
    onSelectDigest?.(digests[0].id);
  };

  return (
    <div className="home-dashboard">
      <section className="dashboard-hero dashboard-card">
        <div className="dashboard-hero-copy">
          <p className="dashboard-hero-eyebrow">SmartDigest 홈</p>
          <h2>SmartDigest와 함께 지식을 정리해 보세요</h2>
          <p>
            문서를 업로드하고 요약·주석·질문·학습 카드로 나만의 지식창고를
            만들어 보세요.
          </p>
        </div>
        <div className="dashboard-hero-actions">
          <button
            type="button"
            className="dashboard-cta dashboard-cta--primary"
            onClick={() => setTutorialOpen((prev) => !prev)}
            aria-expanded={tutorialOpen}
          >
            {tutorialOpen ? "튜토리얼 닫기" : "사용법 튜토리얼 보기"}
          </button>
          <button
            type="button"
            className="dashboard-cta dashboard-cta--ghost"
            onClick={handleSampleStart}
            disabled={!digests.length}
          >
            샘플 문서로 시작하기
          </button>
        </div>
      </section>

      {tutorialOpen && (
        <section className="dashboard-tutorial dashboard-card" aria-label="사용법 튜토리얼">
          <h3 className="dashboard-section-title">3단계로 시작하기</h3>
          <ol className="dashboard-tutorial-steps">
            {TUTORIAL_STEPS.map((step) => (
              <li key={step.title}>
                <strong>{step.title}</strong>
                <span>{step.body}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="dashboard-stats" aria-label="학습 통계">
        <h3 className="dashboard-section-title">학습 통계</h3>
        <div className="dashboard-stats-grid">
          <StatCard
            label="총 문서 수"
            value={digests.length}
            hint="지식창고에 저장된 문서"
            accent="blue"
          />
          <StatCard
            label="오늘 학습량"
            value={`${stats.usedCount}회`}
            hint={`일일 한도 ${stats.limit}회`}
            accent="violet"
          />
          <RandomMemoryCard
            digests={digests}
            onOpenCard={onOpenKnowledgeCard}
          />
        </div>
      </section>

      <section className="dashboard-recent" aria-label="최근 본 문서">
        <div className="dashboard-recent-header">
          <h3 className="dashboard-section-title">최근 본 문서</h3>
          {recentDigests.length > 0 && (
            <p className="dashboard-recent-hint">가로로 스크롤해 빠르게 열 수 있어요</p>
          )}
        </div>

        {recentDigests.length ? (
          <div className="recent-docs-track" role="list">
            {recentDigests.map((digest) => (
              <button
                key={digest.id}
                type="button"
                role="listitem"
                className="recent-doc-card"
                onClick={() => onSelectDigest?.(digest.id)}
              >
                <span className="recent-doc-card-icon">
                  <DocumentIcon />
                </span>
                <span className="recent-doc-card-title">{digest.filename}</span>
                <span className="recent-doc-card-action">열기</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="dashboard-empty-recent dashboard-card">
            <p>아직 열어본 문서가 없습니다.</p>
            <p>문서를 업로드하거나 왼쪽 목록에서 선택해 보세요.</p>
          </div>
        )}
      </section>
    </div>
  );
}
