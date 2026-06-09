import { useEffect, useRef, useState } from "react";

export default function NoteComposePopup({
  selectedText,
  x,
  y,
  saving = false,
  onSave,
  onClose,
}) {
  const [text, setText] = useState("");
  const textareaRef = useRef(null);

  useEffect(() => {
    setText("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [selectedText]);

  const preview =
    selectedText.length > 50
      ? `${selectedText.slice(0, 50)}...`
      : selectedText;

  const left = Math.min(Math.max(x - 140, 12), window.innerWidth - 292);
  const top = Math.min(y + 10, window.innerHeight - 260);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const content = text.trim();
    if (!content || saving) return;
    await onSave(content);
  };

  return (
    <div
      className="annotation-popup note-compose-popup"
      style={{ left, top }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <form onSubmit={handleSubmit}>
        <p className="annotation-popup-quote">&ldquo;{preview}&rdquo;</p>
        <textarea
          ref={textareaRef}
          className="note-compose-textarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          placeholder="주석 내용을 입력하세요"
          autoFocus
        />
        <div className="annotation-popup-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={saving || !text.trim()}
          >
            {saving ? "저장 중..." : "주석 저장"}
          </button>
        </div>
      </form>
    </div>
  );
}
