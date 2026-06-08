import { useState } from "react";
import { updateNote, deleteNote } from "../api/noteService";

export default function NotePopup({ note, x, y, onClose, onChange }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(note.content);
  const [saving, setSaving] = useState(false);

  const left = Math.min(Math.max(x - 140, 12), window.innerWidth - 292);
  const top = Math.min(y + 8, window.innerHeight - 220);

  const handleSave = async () => {
    const content = editText.trim();
    if (!content) return;
    if (content === note.content) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const result = await updateNote(note.id, content);
      onChange(result.notes);
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const result = await deleteNote(note.id);
      onChange(result.notes);
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="annotation-popup"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="annotation-popup-quote">
        &ldquo;
        {note.selected_text.length > 50
          ? `${note.selected_text.slice(0, 50)}...`
          : note.selected_text}
        &rdquo;
      </p>

      {editing ? (
        <div className="annotation-popup-edit">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
            autoFocus
          />
          <div className="annotation-popup-actions">
            <button type="button" onClick={() => setEditing(false)} disabled={saving}>
              취소
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={saving || !editText.trim()}
            >
              {saving ? "저장 중..." : "확인"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="annotation-popup-comment">{note.content}</p>
          <div className="annotation-popup-actions">
            <button
              type="button"
              onClick={() => {
                setEditText(note.content);
                setEditing(true);
              }}
              disabled={saving}
            >
              수정
            </button>
            <button type="button" className="btn-danger" onClick={handleDelete} disabled={saving}>
              삭제
            </button>
          </div>
        </>
      )}
    </div>
  );
}
