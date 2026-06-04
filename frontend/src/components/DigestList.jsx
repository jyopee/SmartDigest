import { useState } from "react";
import { deleteDigest, renameDigest } from "../api/client";

export default function DigestList({
  digests,
  selectedId,
  onSelect,
  onRefresh,
  userId,
}) {
  const [editingId, setEditingId] = useState(null);
  const [newName, setNewName] = useState("");

  const startRename = (digest) => {
    setEditingId(digest.id);
    setNewName(digest.filename);
  };

  const submitRename = async (digest) => {
    if (!newName.trim() || newName === digest.filename) {
      setEditingId(null);
      return;
    }
    await renameDigest(digest.id, userId, digest.filename, newName.trim());
    setEditingId(null);
    onRefresh();
  };

  const handleDelete = async (digest) => {
    if (!window.confirm(`"${digest.filename}" 문서를 삭제할까요?`)) return;
    await deleteDigest(digest.id, userId);
    if (selectedId === digest.id) onSelect(null);
    onRefresh();
  };

  if (!digests.length) {
    return <p className="empty-list">저장된 문서가 없습니다.</p>;
  }

  return (
    <ul className="digest-list">
      {digests.map((digest) => (
        <li key={digest.id} className={selectedId === digest.id ? "active" : ""}>
          {editingId === digest.id ? (
            <div className="rename-row">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitRename(digest)}
              />
              <button type="button" onClick={() => submitRename(digest)}>
                저장
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="digest-title"
                onClick={() => onSelect(digest.id)}
              >
                {digest.filename}
              </button>
              <div className="digest-actions">
                <button type="button" onClick={() => startRename(digest)}>
                  이름
                </button>
                <button type="button" onClick={() => handleDelete(digest)}>
                  삭제
                </button>
              </div>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
