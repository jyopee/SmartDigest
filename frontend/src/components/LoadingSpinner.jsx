export default function LoadingSpinner({ label = "불러오는 중..." }) {
  return (
    <div className="loading-spinner-wrap" role="status" aria-live="polite">
      <div className="loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
