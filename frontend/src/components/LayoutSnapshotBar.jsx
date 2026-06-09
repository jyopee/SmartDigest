import { useCallback, useEffect, useState } from "react";
import { saveDigestGridLayout } from "../api/gridLayoutService";
import {
  serializeCardsForSnapshot,
  serializeMindMapForStorage,
} from "../utils/mindMapLayoutEngine";
import {
  createLayoutSnapshot,
  deleteLayoutSnapshot,
  fetchLayoutSnapshots,
  refreshOriginalLayoutSnapshot,
  restoreLayoutSnapshot,
} from "../api/layoutSnapshotService";
import AccordionBox from "./AccordionBox";

const ORIGINAL_SNAPSHOT_NAME = "원본";

function layoutHasContent(layout) {
  if (!layout) return false;
  if (Array.isArray(layout)) return layout.length > 0;
  return (layout.nodes?.length ?? 0) > 0;
}

function defaultSnapshotName(snapshots) {
  const userSnapshots = snapshots.filter((item) => !item.is_original);
  return `레이아웃 ${userSnapshots.length + 1}`;
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
  currentCards = [],
  activeSnapshotId,
  onActiveSnapshotChange,
  onLayoutRestored,
}) {
  const buildSnapshotPayload = () => ({
    layout: serializeMindMapForStorage(structuredClone(currentLayout)),
    cards: serializeCardsForSnapshot(structuredClone(currentCards)),
  });
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingOriginal, setRefreshingOriginal] = useState(false);
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
    if (!layoutHasContent(currentLayout)) {
      setError("저장할 레이아웃이 없습니다.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const name = defaultSnapshotName(snapshots);
      const payload = buildSnapshotPayload();
      await saveDigestGridLayout(digestId, payload.layout);
      const snapshot = await createLayoutSnapshot(
        digestId,
        name,
        payload.layout,
        payload.cards
      );
      setSnapshots((prev) => {
        const original = prev.filter((item) => item.is_original);
        const userSnapshots = prev.filter((item) => !item.is_original);
        return [
          ...original,
          {
            id: snapshot.id,
            name: snapshot.name,
            created_at: snapshot.created_at,
            is_original: false,
          },
          ...userSnapshots,
        ];
      });
      onActiveSnapshotChange?.(snapshot.id);
    } catch (err) {
      setError(err.message || "스냅샷 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshOriginal = async () => {
    if (!layoutHasContent(currentLayout)) {
      setError("갱신할 레이아웃이 없습니다.");
      return;
    }

    if (
      !window.confirm(
        `현재 레이아웃을 "${ORIGINAL_SNAPSHOT_NAME}" 스냅샷의 기준으로 저장할까요?\n이후 「원본」 복원 시 이 배치가 적용됩니다.`
      )
    ) {
      return;
    }

    setRefreshingOriginal(true);
    setError("");
    try {
      const payload = buildSnapshotPayload();
      await saveDigestGridLayout(digestId, payload.layout);
      const snapshot = await refreshOriginalLayoutSnapshot(
        digestId,
        payload.layout,
        payload.cards
      );
      setSnapshots((prev) => {
        const userSnapshots = prev.filter((item) => !item.is_original);
        return [
          {
            id: snapshot.id,
            name: snapshot.name,
            created_at: snapshot.created_at,
            is_original: true,
          },
          ...userSnapshots,
        ];
      });
      onActiveSnapshotChange?.(snapshot.id);
    } catch (err) {
      setError(err.message || "원본 스냅샷 갱신에 실패했습니다.");
    } finally {
      setRefreshingOriginal(false);
    }
  };

  const handleRestore = async (snapshotId) => {
    setRestoringId(snapshotId);
    setError("");
    try {
      const result = await restoreLayoutSnapshot(digestId, snapshotId);
      onActiveSnapshotChange?.(snapshotId);
      onLayoutRestored?.(result);
      if (!result.cards_restored) {
        setError(
          "이 스냅샷은 배치만 저장되어 있어 삭제된 카드는 복원되지 않습니다. 「현재 레이아웃 저장」으로 다시 저장해 주세요."
        );
      } else {
        setError("");
      }
    } catch (err) {
      setError(err.message || "스냅샷 복원에 실패했습니다.");
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = async (snapshot) => {
    if (snapshot.is_original) return;
    setError("");
    try {
      await deleteLayoutSnapshot(digestId, snapshot.id);
      setSnapshots((prev) => prev.filter((item) => item.id !== snapshot.id));
      if (activeSnapshotId === snapshot.id) {
        onActiveSnapshotChange?.(null);
      }
    } catch (err) {
      setError(err.message || "스냅샷 삭제에 실패했습니다.");
    }
  };

  const activeSnapshot = snapshots.find((item) => item.id === activeSnapshotId);
  const snapshotPreview = loading
    ? "스냅샷을 불러오는 중..."
    : activeSnapshot
      ? `${activeSnapshot.name} 선택됨`
      : snapshots.length
        ? `${snapshots.length}개 저장됨`
        : "저장된 스냅샷 없음";

  return (
    <AccordionBox
      title="레이아웃 스냅샷"
      className="layout-accordion layout-accordion-snapshot"
      collapsedPreview={
        <p className="layout-accordion-preview">{snapshotPreview}</p>
      }
      trailing={
        snapshots.length > 0 ? (
          <span className="layout-accordion-badge">{snapshots.length}</span>
        ) : null
      }
    >
      <div className="layout-snapshot-bar layout-panel-inner">
        <div className="layout-snapshot-bar-head">
          <p className="layout-snapshot-guide">
            카드 내용과 배치를 함께 저장·복원합니다.{" "}
            <strong>{ORIGINAL_SNAPSHOT_NAME}</strong>은 고정이며,{" "}
            <strong>원본 갱신</strong>으로 기준을 바꿀 수 있습니다.
          </p>
          <div className="layout-snapshot-actions">
            <button
            type="button"
            className="layout-snapshot-refresh-btn"
            onClick={handleRefreshOriginal}
            disabled={
              refreshingOriginal || saving || !layoutHasContent(currentLayout)
            }
            title="원본 스냅샷의 기준 배치를 현재 레이아웃으로 바꿉니다"
          >
            {refreshingOriginal ? "갱신 중..." : "원본 갱신"}
            </button>
            <button
              type="button"
              className="layout-snapshot-save-btn"
            onClick={handleSave}
            disabled={
              saving || refreshingOriginal || !layoutHasContent(currentLayout)
            }
            >
              {saving ? "저장 중..." : "현재 레이아웃 저장"}
            </button>
          </div>
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
            const isOriginal = Boolean(snapshot.is_original);
            return (
              <li
                key={snapshot.id}
                className={`layout-snapshot-item${
                  isActive ? " is-active" : ""
                }${isOriginal ? " is-original" : ""}`}
              >
                <button
                  type="button"
                  className="layout-snapshot-restore-btn"
                  onClick={() => handleRestore(snapshot.id)}
                  disabled={isRestoring}
                  title={
                    isOriginal
                      ? "최초 레이아웃으로 복원"
                      : formatSnapshotDate(snapshot.created_at)
                  }
                >
                  <span className="layout-snapshot-name">
                    {snapshot.name}
                    {isOriginal && (
                      <span className="layout-snapshot-original-badge">고정</span>
                    )}
                  </span>
                  <span className="layout-snapshot-date">
                    {snapshot.card_count > 0
                      ? `카드 ${snapshot.card_count}개 · `
                      : ""}
                    {formatSnapshotDate(snapshot.created_at)}
                  </span>
                </button>
                {!isOriginal && (
                  <button
                    type="button"
                    className="layout-snapshot-delete-btn"
                    onClick={() => handleDelete(snapshot)}
                    aria-label={`${snapshot.name} 삭제`}
                    title="삭제"
                  >
                    ×
                  </button>
                )}
              </li>
            );
            })}
          </ul>
        )}
      </div>
    </AccordionBox>
  );
}
