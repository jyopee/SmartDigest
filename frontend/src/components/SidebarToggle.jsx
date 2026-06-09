export default function SidebarToggle({ open, onToggle }) {
  return (
    <button
      type="button"
      className={`sidebar-toggle${open ? " is-open" : ""}`}
      onClick={onToggle}
      aria-label={open ? "사이드바 숨기기" : "사이드바 보기"}
      aria-expanded={open}
      title={open ? "사이드바 숨기기" : "사이드바 보기"}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        {open ? (
          <path
            d="M10 3L5 8l5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M6 3l5 5-5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </button>
  );
}
