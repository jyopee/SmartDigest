import { getQuotaStats } from "../api/usageService";
import AccordionBox from "./AccordionBox";

function QuotaProgressLine({ fillPercent, isLimitReached, thin = false }) {
  const clamped = Math.min(100, Math.max(0, fillPercent));
  return (
    <div
      className={`quota-progress-bar${thin ? " quota-progress-bar--thin" : ""}${
        isLimitReached ? " exhausted" : ""
      }`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`남은 호출 ${clamped}%`}
    >
      <div
        className="quota-progress-fill"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export default function UsageAccordion({ usage }) {
  const stats = getQuotaStats(usage ?? {});
  const {
    limit,
    usedCount,
    remaining,
    remainingPercent,
    isLimitReached,
  } = stats;

  const countLabel = (
    <span
      className={`accordion-box-trailing-count${
        isLimitReached ? " is-exhausted" : ""
      }`}
      title={`남은 ${remaining}회 / 최대 ${limit}회`}
    >
      <span className="accordion-box-trailing-prefix">남음</span>
      {remaining}
      <span className="accordion-box-trailing-sep">/</span>
      {limit}
    </span>
  );

  return (
    <AccordionBox
      title="오늘 남은 API 호출"
      defaultExpanded={isLimitReached}
      autoExpand={isLimitReached}
      variant={isLimitReached ? "warning" : "default"}
      showWarningIcon={isLimitReached}
      trailing={countLabel}
      collapsedPreview={
        !isLimitReached ? (
          <QuotaProgressLine
            fillPercent={remainingPercent}
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
          fillPercent={remainingPercent}
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
