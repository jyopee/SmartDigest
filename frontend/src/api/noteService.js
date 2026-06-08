import api from "./axiosInstance";

export async function fetchNotes(digestId, page = null) {
  const params = page != null ? { page } : undefined;
  const { data } = await api.get(`/api/notes/${digestId}`, { params });
  return data;
}

export async function saveNote(digestId, selectedText, content, pageNumber = 1) {
  const { data } = await api.post("/api/notes/save", {
    digest_id: digestId,
    selected_text: selectedText,
    content,
    page_number: pageNumber,
  });
  return data;
}

export async function updateNote(noteId, content) {
  const { data } = await api.put(`/api/notes/${noteId}`, { content });
  return data;
}

export async function deleteNote(noteId) {
  const { data } = await api.delete(`/api/notes/${noteId}`);
  return data;
}
