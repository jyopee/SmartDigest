import { useEffect, useRef, useState } from "react";
import { askChat, deleteChat } from "../api/chatService";
import { setDragPayload } from "../utils/dragPayload";

function truncate(text, max = 60) {
  if (!text || text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

export default function QuestionList({
  digestId,
  chats,
  onChange,
  showPageBadge = false,
  draft = null,
  onDraftConsumed,
  onAddToLayout,
  addingToLayoutKey = null,
}) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!draft) return;
    setQuestion("");
    setExpandedId(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [draft]);

  const handleAsk = async (event) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || !digestId) return;

    setAsking(true);
    try {
      const result = await askChat(
        digestId,
        trimmed,
        draft?.selectedText || "",
        draft?.pageNumber || 1
      );
      onChange(result.chats);
      setQuestion("");
      setExpandedId(result.chat?.id ?? null);
      onDraftConsumed?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setAsking(false);
    }
  };

  const handleDelete = async (chat) => {
    if (!window.confirm("이 질문 기록을 삭제할까요?")) return;
    try {
      const result = await deleteChat(chat.id);
      onChange(result.chats);
      if (expandedId === chat.id) setExpandedId(null);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="annotation-tab-content question-tab-content">
      <form className="tab-composer chat-composer" onSubmit={handleAsk}>
        {draft ? (
          <>
            <p className="tab-composer-prompt">어떤 것이 궁금하세요?</p>
            {draft.selectedText && (
              <p className="tab-composer-quote">
                &ldquo;{truncate(draft.selectedText, 80)}&rdquo;
              </p>
            )}
          </>
        ) : (
          <p className="tab-composer-label">
            문서 내용에 대해 AI에게 질문하세요
          </p>
        )}
        <textarea
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="질문을 입력하세요"
        />
        <div className="tab-composer-actions">
          {draft && (
            <button type="button" onClick={() => onDraftConsumed?.()}>
              취소
            </button>
          )}
          <button
            type="submit"
            className="btn-primary"
            disabled={asking || !question.trim()}
          >
            {asking ? "답변 생성 중..." : "질문하기"}
          </button>
        </div>
      </form>

      {!chats.length ? (
        <p className="annotation-empty">
          아직 질문 기록이 없습니다. 텍스트를 드래그한 뒤 &lsquo;AI 질문&rsquo;을 선택하세요.
        </p>
      ) : (
        <ul className="question-list">
          {chats.map((chat) => {
            const expanded = expandedId === chat.id;
            return (
              <li
                key={chat.id}
                className={`question-card question-card--draggable${expanded ? " expanded" : ""}`}
                draggable={Boolean(onAddToLayout)}
                onDragStart={(event) => {
                  setDragPayload(event.dataTransfer, {
                    source: "chat",
                    sourceId: chat.id,
                  });
                }}
              >
                <button
                  type="button"
                  className="question-card-toggle"
                  onClick={() => setExpandedId(expanded ? null : chat.id)}
                >
                  <span className="question-card-title">{chat.question}</span>
                  {showPageBadge && (
                    <span className="annotation-page-badge">p.{chat.page_number || 1}</span>
                  )}
                </button>

                {chat.selected_text && (
                  <p className="question-selected">
                    &ldquo;{truncate(chat.selected_text)}&rdquo;
                  </p>
                )}

                {expanded && (
                  <div className="question-answer-block">
                    <p className="question-answer-label">AI 답변</p>
                    <p className="question-answer">{chat.answer}</p>
                  </div>
                )}

                <div className="annotation-actions">
                  {onAddToLayout && (
                    <button
                      type="button"
                      className="btn-layout-add"
                      onClick={() => onAddToLayout("chat", chat.id)}
                      disabled={addingToLayoutKey === `chat-${chat.id}`}
                    >
                      {addingToLayoutKey === `chat-${chat.id}`
                        ? "추가 중..."
                        : "레이아웃에 추가"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => handleDelete(chat)}
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
