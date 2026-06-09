import api from "./axiosInstance";

function currentUserId() {
  return localStorage.getItem("smartdigest_user") || "";
}

export async function fetchDigestGrid(digestId) {
  const { data } = await api.get(`/api/digests/${digestId}/grid`, {
    params: { user_id: currentUserId() },
  });
  return data;
}

export async function saveDigestGridLayout(digestId, layout) {
  const { data } = await api.put(
    `/api/digests/${digestId}/grid/layout`,
    { layout },
    { params: { user_id: currentUserId() } }
  );
  return data;
}

export async function addGridCardFromSource(digestId, source, sourceId) {
  const { data } = await api.post(
    `/api/digests/${digestId}/grid/cards/from-source`,
    { source, source_id: sourceId },
    { params: { user_id: currentUserId() } }
  );
  return data;
}

export async function deleteGridCard(digestId, cardId) {
  const { data } = await api.delete(
    `/api/digests/${digestId}/grid/cards/${encodeURIComponent(cardId)}`,
    { params: { user_id: currentUserId() } }
  );
  return data;
}
