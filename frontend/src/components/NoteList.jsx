import { useEffect, useRef, useState } from "react";
import { updateNote, deleteNote } from "../api/noteService";
import { setDragPayload } from "../utils/dragPayload";

function truncate(text, max = 60) {
  if (!text || text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

export default function NoteList({
  notes,
  onChange,
  showPageBadge = false,
  draft = null,
  onDraftConsumed,
  onSaveDraft,
  saving = false,
  onAddToLayout,
  addingToLayoutKey = null,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [draftText, setDraftText] = useState("");
  const draftRef = useRef(null);

  useEffect(() => {
    if (!draft) return;
    setDraftText("");
    requestAnimationFrame(() => draftRef.current?.focus());
  }, [draft]);

  const startEdit = (note) => {
    setEditingId(note.id);
    setEditText(note.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const submitEdit = async (note) => {
    const content = editText.trim();
    if (!content) return;
    if (content === note.content) {
      cancelEdit();
      return;
    }
    try {
      const result = await updateNote(note.id, content);
      onChange(result.notes);
      cancelEdit();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (note) => {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;
    try {
      const result = await deleteNote(note.id);
      onChange(result.notes);
      if (editingId === note.id) cancelEdit();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDraftSubmit = async (event) => {
    event.preventDefault();
    const content = draftText.trim();
    if (!content || !draft) return;
    await onSaveDraft(content);
    setDraftText("");
    onDraftConsumed?.();
  };

  return (
    <div className="annotation-tab-content note-tab-content">
      {draft && (
        <form className="tab-composer note-composer" onSubmit={handleDraftSubmit}>
          <p className="tab-composer-label">선택한 텍스트에 메모를 남기세요</p>
          <p className="tab-composer-quote">
            &ldquo;{truncate(draft.selectedText, 80)}&rdquo;
          </p>
          <textarea
            ref={draftRef}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={4}
            placeholder="주석 내용을 입력하세요"
          />
          <div className="tab-composer-actions">
            <button
              type="button"
              onClick={() => {
                setDraftText("");
                onDraftConsumed?.();
              }}
            >
              취소
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || !draftText.trim()}
            >
              {saving ? "저장 중..." : "주석 저장"}
            </button>
          </div>
        </form>
      )}

      {!notes.length && !draft ? (
        <p className="annotation-empty">
          등록된 주석이 없습니다. 텍스트를 드래그한 뒤 &lsquo;주석 추가&rsquo;를 선택하세요.
        </p>
      ) : (
        <ul className="annotation-list">
          {notes.map((note) => (
            <li
              key={note.id}
              className="annotation-card annotation-card--draggable"
              draggable={Boolean(onAddToLayout)}
              onDragStart={(event) => {
                setDragPayload(event.dataTransfer, {
                  source: "note",
                  sourceId: note.id,
                });
              }}
            >
              <div className="annotation-card-header">
                <p className="annotation-selected">
                  &ldquo;{truncate(note.selected_text)}&rdquo;
                </p>
                {showPageBadge && (
                  <span className="annotation-page-badge">p.{note.page_number || 1}</span>
                )}
              </div>

              {editingId === note.id ? (
                <div className="annotation-edit">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                  <div className="annotation-actions">
                    <button type="button" onClick={cancelEdit}>
                      취소
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => submitEdit(note)}
                      disabled={!editText.trim()}
                    >
                      확인
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="annotation-comment">{note.content}</p>
                  <div className="annotation-actions">
                    {onAddToLayout && (
                      <button
                        type="button"
                        className="btn-layout-add"
                        onClick={() => onAddToLayout("note", note.id)}
                        disabled={addingToLayoutKey === `note-${note.id}`}
                      >
                        {addingToLayoutKey === `note-${note.id}`
                          ? "추가 중..."
                          : "레이아웃에 추가"}
                      </button>
                    )}
                    <button type="button" onClick={() => startEdit(note)}>
                      수정
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => handleDelete(note)}
                    >
                      삭제
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
