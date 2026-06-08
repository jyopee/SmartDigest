import api from "./axiosInstance";

function currentUserId() {
  return localStorage.getItem("smartdigest_user") || "";
}

export async function fetchLayoutSnapshots(digestId) {
  const { data } = await api.get(`/api/digests/${digestId}/grid/snapshots`, {
    params: { user_id: currentUserId() },
  });
  return data.snapshots || [];
}

export async function createLayoutSnapshot(digestId, name, layout) {
  const { data } = await api.post(
    `/api/digests/${digestId}/grid/snapshots`,
    { name, layout },
    { params: { user_id: currentUserId() } }
  );
  return data.snapshot;
}

export async function restoreLayoutSnapshot(digestId, snapshotId) {
  const { data } = await api.post(
    `/api/digests/${digestId}/grid/snapshots/${snapshotId}/restore`,
    null,
    { params: { user_id: currentUserId() } }
  );
  return data;
}

export async function deleteLayoutSnapshot(digestId, snapshotId) {
  const { data } = await api.delete(
    `/api/digests/${digestId}/grid/snapshots/${snapshotId}`,
    { params: { user_id: currentUserId() } }
  );
  return data;
}
