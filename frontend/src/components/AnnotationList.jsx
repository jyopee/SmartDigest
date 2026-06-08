import { useState } from "react";
import { updateAnnotation, deleteAnnotation } from "../api/annotationService";

function truncate(text, max = 60) {
  if (!text || text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

export default function AnnotationList({
  annotations,
  onChange,
  embedded = false,
  showPageBadge = false,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = (ann) => {
    setEditingId(ann.id);
    setEditText(ann.comment);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const submitEdit = async (ann) => {
    const comment = editText.trim();
    if (!comment) return;
    if (comment === ann.comment) {
      cancelEdit();
      return;
    }
    setSaving(true);
    try {
      const result = await updateAnnotation(ann.id, comment);
      onChange(result.annotations);
      cancelEdit();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ann) => {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;
    try {
      const result = await deleteAnnotation(ann.id);
      onChange(result.annotations);
      if (editingId === ann.id) cancelEdit();
    } catch (err) {
      alert(err.message);
    }
  };

  if (!annotations.length) {
    return (
      <div className={embedded ? "annotation-tab-content" : "annotation-panel"}>
        {!embedded && <h3 className="annotation-panel-title">주석 목록</h3>}
        <p className="annotation-empty">등록된 주석이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className={embedded ? "annotation-tab-content" : "annotation-panel"}>
      {!embedded && (
        <h3 className="annotation-panel-title">
          주석 목록 <span className="annotation-count">{annotations.length}</span>
        </h3>
      )}
      <ul className="annotation-list">
        {annotations.map((ann) => (
          <li key={ann.id} className="annotation-card">
            <div className="annotation-card-header">
              <p className="annotation-selected">
                &ldquo;{truncate(ann.selected_text)}&rdquo;
              </p>
              {showPageBadge && (
                <span className="annotation-page-badge">
                  p.{ann.page_number || 1}
                </span>
              )}
            </div>

            {editingId === ann.id ? (
              <div className="annotation-edit">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  autoFocus
                />
                <div className="annotation-actions">
                  <button type="button" onClick={cancelEdit} disabled={saving}>
                    취소
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => submitEdit(ann)}
                    disabled={saving || !editText.trim()}
                  >
                    {saving ? "저장 중..." : "확인"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="annotation-comment">{ann.comment}</p>
                <div className="annotation-actions">
                  <button type="button" onClick={() => startEdit(ann)}>
                    수정
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => handleDelete(ann)}
                  >
                    삭제
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
