import { useCallback, useEffect, useState } from "react";
import {
  createLayoutSnapshot,
  deleteLayoutSnapshot,
  fetchLayoutSnapshots,
  restoreLayoutSnapshot,
} from "../api/layoutSnapshotService";

function defaultSnapshotName(count) {
  return `레이아웃 ${count + 1}`;
}

function formatSnapshotDate(value) {
  if (!value) return "";
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LayoutSnapshotBar({
  digestId,
  currentLayout,
  activeSnapshotId,
  onActiveSnapshotChange,
  onLayoutRestored,
}) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  const [error, setError] = useState("");

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await fetchLayoutSnapshots(digestId);
      setSnapshots(next);
    } catch (err) {
      setError(err.message || "스냅샷을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [digestId]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  const handleSave = async () => {
    if (!currentLayout?.length) {
      setError("저장할 레이아웃이 없습니다.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const name = defaultSnapshotName(snapshots.length);
      const snapshot = await createLayoutSnapshot(digestId, name, currentLayout);
      setSnapshots((prev) => [
        { id: snapshot.id, name: snapshot.name, created_at: snapshot.created_at },
        ...prev,
      ]);
      onActiveSnapshotChange?.(snapshot.id);
    } catch (err) {
      setError(err.message || "스냅샷 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (snapshotId) => {
    setRestoringId(snapshotId);
    setError("");
    try {
      const result = await restoreLayoutSnapshot(digestId, snapshotId);
      onActiveSnapshotChange?.(snapshotId);
      onLayoutRestored?.(result.layout);
    } catch (err) {
      setError(err.message || "스냅샷 복원에 실패했습니다.");
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = async (snapshotId) => {
    setError("");
    try {
      await deleteLayoutSnapshot(digestId, snapshotId);
      setSnapshots((prev) => prev.filter((item) => item.id !== snapshotId));
      if (activeSnapshotId === snapshotId) {
        onActiveSnapshotChange?.(null);
      }
    } catch (err) {
      setError(err.message || "스냅샷 삭제에 실패했습니다.");
    }
  };

  return (
    <div className="layout-snapshot-bar">
      <div className="layout-snapshot-bar-head">
        <div>
          <h4 className="layout-snapshot-title">레이아웃 스냅샷</h4>
          <p className="layout-snapshot-guide">
            현재 배치를 저장해 두었다가 나중에 다시 불러올 수 있습니다.
          </p>
        </div>
        <button
          type="button"
          className="layout-snapshot-save-btn"
          onClick={handleSave}
          disabled={saving || !currentLayout?.length}
        >
          {saving ? "저장 중..." : "현재 레이아웃 저장"}
        </button>
      </div>

      {error && <p className="layout-snapshot-error">{error}</p>}

      {loading ? (
        <p className="layout-snapshot-empty">스냅샷을 불러오는 중...</p>
      ) : snapshots.length === 0 ? (
        <p className="layout-snapshot-empty">저장된 스냅샷이 없습니다.</p>
      ) : (
        <ul className="layout-snapshot-list">
          {snapshots.map((snapshot) => {
            const isActive = activeSnapshotId === snapshot.id;
            const isRestoring = restoringId === snapshot.id;
            return (
              <li
                key={snapshot.id}
                className={`layout-snapshot-item${isActive ? " is-active" : ""}`}
              >
                <button
                  type="button"
                  className="layout-snapshot-restore-btn"
                  onClick={() => handleRestore(snapshot.id)}
                  disabled={isRestoring}
                  title={formatSnapshotDate(snapshot.created_at)}
                >
                  <span className="layout-snapshot-name">{snapshot.name}</span>
                  <span className="layout-snapshot-date">
                    {formatSnapshotDate(snapshot.created_at)}
                  </span>
                </button>
                <button
                  type="button"
                  className="layout-snapshot-delete-btn"
                  onClick={() => handleDelete(snapshot.id)}
                  aria-label={`${snapshot.name} 삭제`}
                  title="삭제"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
