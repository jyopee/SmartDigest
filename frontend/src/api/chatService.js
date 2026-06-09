import api from "./axiosInstance";

export async function fetchChats(digestId, page = null) {
  const params = page != null ? { page } : undefined;
  const { data } = await api.get(`/api/chat/${digestId}`, { params });
  return data;
}

export async function askChat(
  digestId,
  question,
  selectedText = "",
  pageNumber = 1,
  userId = ""
) {
  const { data } = await api.post("/api/chat/ask", {
    digest_id: digestId,
    user_id: userId,
    question,
    selected_text: selectedText,
    page_number: pageNumber,
  });
  return data;
}

export async function deleteChat(chatId) {
  const { data } = await api.delete(`/api/chat/${chatId}`);
  return data;
}
