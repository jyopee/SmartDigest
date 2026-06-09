import { READER_ALIGN_OPTIONS } from "../constants/readerAlign";

export default function ReaderAlignToolbar({ value, onChange }) {
  return (
    <div
      className="reader-align-toolbar"
      role="group"
      aria-label="본문 정렬"
    >
      <span className="reader-align-label">정렬</span>
      {READER_ALIGN_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`reader-align-btn${value === option.id ? " is-active" : ""}`}
          title={option.title}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
