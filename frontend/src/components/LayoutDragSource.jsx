import { setDragPayload } from "../utils/dragPayload";

function truncate(text, max = 42) {
  if (!text || text.length <= max) return text || "내용 없음";
  return `${text.slice(0, max)}...`;
}

function DragChip({ label, title, payload, tone }) {
  const handleDragStart = (event) => {
    setDragPayload(event.dataTransfer, payload);
    event.currentTarget.classList.add("is-dragging");
  };

  const handleDragEnd = (event) => {
    event.currentTarget.classList.remove("is-dragging");
  };

  return (
    <button
      type="button"
      className={`layout-drag-chip layout-drag-chip--${tone}`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      title={`${title} — 그리드로 드래그`}
    >
      <span className="layout-drag-chip-label">{label}</span>
      <span className="layout-drag-chip-title">{truncate(title)}</span>
    </button>
  );
}

export default function LayoutDragSource({ notes = [], chats = [] }) {
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
          아래 항목을 그리드 영역으로 드래그하세요.
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
          />
        ))}
        {chats.map((chat) => (
          <DragChip
            key={`chat-${chat.id}`}
            label="질문"
            title={chat.question}
            tone="chat"
            payload={{ source: "chat", sourceId: chat.id }}
          />
        ))}
      </div>
    </div>
  );
}
