import { useRef } from "react";
import { setDragPayload } from "../utils/dragPayload";

function truncate(text, max = 42) {
  if (!text || text.length <= max) return text || "내용 없음";
  return `${text.slice(0, max)}...`;
}

function DragChip({ label, title, payload, tone, onAddToLayout, addingToLayoutKey }) {
  const draggedRef = useRef(false);
  const itemKey = `${payload.source}-${payload.sourceId}`;
  const isAdding = addingToLayoutKey === itemKey;

  const handleDragStart = (event) => {
    draggedRef.current = true;
    setDragPayload(event.dataTransfer, payload);
    event.currentTarget.classList.add("is-dragging");
  };

  const handleDragEnd = (event) => {
    event.currentTarget.classList.remove("is-dragging");
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 0);
  };

  const handleActivate = () => {
    if (isAdding || !onAddToLayout) return;
    onAddToLayout(payload.source, payload.sourceId);
  };

  const handleClick = () => {
    if (draggedRef.current) return;
    handleActivate();
  };

  const handleKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleActivate();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`layout-drag-chip layout-drag-chip--${tone}${
        isAdding ? " is-adding" : ""
      }`}
      draggable={!isAdding}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      title={`${title} — 클릭 또는 그리드로 드래그`}
      aria-busy={isAdding}
    >
      <span className="layout-drag-chip-label">{label}</span>
      <span className="layout-drag-chip-title">
        {isAdding ? "추가 중..." : truncate(title)}
      </span>
    </div>
  );
}

export default function LayoutDragSource({
  notes = [],
  chats = [],
  onAddToLayout,
  addingToLayoutKey = null,
}) {
  if (!notes.length && !chats.length) {
    return (
      <div className="layout-drag-source layout-drag-source--empty">
        <p>
          주석·질문 탭에서 항목을 만들면 여기에 표시되어 레이아웃으로 드래그할 수
          있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="layout-drag-source">
      <div className="layout-drag-source-head">
        <h4 className="layout-drag-source-title">학습 카드 추가</h4>
        <p className="layout-drag-source-guide">
          아래 항목을 클릭하거나 그리드 영역으로 드래그하세요.
        </p>
      </div>
      <div className="layout-drag-source-track">
        {notes.map((note) => (
          <DragChip
            key={`note-${note.id}`}
            label="주석"
            title={note.selected_text || note.content}
            tone="note"
            payload={{ source: "note", sourceId: note.id }}
            onAddToLayout={onAddToLayout}
            addingToLayoutKey={addingToLayoutKey}
          />
        ))}
        {chats.map((chat) => (
          <DragChip
            key={`chat-${chat.id}`}
            label="질문"
            title={chat.question}
            tone="chat"
            payload={{ source: "chat", sourceId: chat.id }}
            onAddToLayout={onAddToLayout}
            addingToLayoutKey={addingToLayoutKey}
          />
        ))}
      </div>
    </div>
  );
}
