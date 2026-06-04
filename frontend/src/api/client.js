import api from "./axiosInstance";

export async function register(userid, password) {
  const { data } = await api.post("/api/auth/register", { userid, password });
  return data;
}

export async function login(userid, password) {
  const { data } = await api.post("/api/auth/login", { userid, password });
  return data;
}

export async function fetchDigests(userId, search = "") {
  const params = { user_id: userId };
  if (search) params.search = search;
  const { data } = await api.get("/api/digests", { params });
  return data;
}

export async function fetchDigest(userId, digestId) {
  const { data } = await api.get(`/api/digests/${digestId}`, {
    params: { user_id: userId },
  });
  return data;
}

export async function uploadDocument(userId, file) {
  const form = new FormData();
  form.append("user_id", userId);
  form.append("file", file);
  const { data } = await api.post("/api/digest/upload", form);
  return data;
}

export async function startSummary(userId, file) {
  const form = new FormData();
  form.append("user_id", userId);
  form.append("file", file);
  const { data } = await api.post("/api/summary/start", form, {
    timeout: 60_000,
  });
  return data;
}

export async function renameDigest(digestId, userid, oldFilename, newFilename) {
  const { data } = await api.patch(`/api/digests/${digestId}/filename`, {
    userid,
    old_filename: oldFilename,
    new_filename: newFilename,
  });
  return data;
}

export async function deleteDigest(digestId, userId) {
  const { data } = await api.delete(`/api/digests/${digestId}`, {
    params: { user_id: userId },
  });
  return data;
}
