import { getQuotaStats } from "../api/usageService";
import AccordionBox from "./AccordionBox";

function QuotaProgressLine({ remainingPercent, isLimitReached, thin = false }) {
  return (
    <div
      className={`quota-progress-bar${thin ? " quota-progress-bar--thin" : ""}${
        isLimitReached ? " exhausted" : ""
      }`}
      role="progressbar"
      aria-valuenow={remainingPercent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="quota-progress-fill"
        style={{ width: `${remainingPercent}%` }}
      />
    </div>
  );
}

export default function UsageAccordion({ usage }) {
  if (!usage) return null;

  const {
    limit,
    usedCount,
    remaining,
    remainingPercent,
    isLimitReached,
  } = getQuotaStats(usage);

  const countLabel = (
    <span
      className={`accordion-box-trailing-count${
        isLimitReached ? " is-exhausted" : ""
      }`}
      title={`남은 ${remaining}회 / 최대 ${limit}회`}
    >
      {remaining}
      <span className="accordion-box-trailing-sep">/</span>
      {limit}
    </span>
  );

  return (
    <AccordionBox
      title="오늘의 요약 사용량"
      defaultExpanded={isLimitReached}
      autoExpand={isLimitReached}
      variant={isLimitReached ? "warning" : "default"}
      showWarningIcon={isLimitReached}
      trailing={countLabel}
      collapsedPreview={
        !isLimitReached ? (
          <QuotaProgressLine
            remainingPercent={remainingPercent}
            isLimitReached={isLimitReached}
            thin
          />
        ) : null
      }
      className="usage-accordion"
    >
      <div className="usage-accordion-body">
        <p className="quota-panel-sub">
          {isLimitReached
            ? "일일 한도에 도달했습니다"
            : `오늘 ${usedCount}회 사용 · 남은 ${remaining}회`}
        </p>
        <QuotaProgressLine
          remainingPercent={remainingPercent}
          isLimitReached={isLimitReached}
        />
        {isLimitReached && (
          <p className="quota-exhausted-text">
            오늘의 학습 한도를 모두 사용했습니다.
          </p>
        )}
      </div>
    </AccordionBox>
  );
}
