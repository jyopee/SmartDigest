import { useState } from "react";
import { updateAnnotation, deleteAnnotation } from "../api/annotationService";

export default function AnnotationPopup({ annotation, x, y, onClose, onChange }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(annotation.comment);
  const [saving, setSaving] = useState(false);

  const left = Math.min(Math.max(x - 140, 12), window.innerWidth - 292);
  const top = Math.min(y + 8, window.innerHeight - 220);

  const handleEdit = () => {
    setEditText(annotation.comment);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setEditText(annotation.comment);
  };

  const handleSave = async () => {
    const comment = editText.trim();
    if (!comment) return;
    if (comment === annotation.comment) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const result = await updateAnnotation(annotation.id, comment);
      onChange(result.annotations);
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
      const result = await deleteAnnotation(annotation.id);
      onChange(result.annotations);
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
        {annotation.selected_text.length > 50
          ? `${annotation.selected_text.slice(0, 50)}...`
          : annotation.selected_text}
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
            <button type="button" onClick={handleCancel} disabled={saving}>
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
          <p className="annotation-popup-comment">{annotation.comment}</p>
          <div className="annotation-popup-actions">
            <button type="button" onClick={handleEdit} disabled={saving}>
              수정
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={handleDelete}
              disabled={saving}
            >
              삭제
            </button>
          </div>
        </>
      )}
    </div>
  );
}
