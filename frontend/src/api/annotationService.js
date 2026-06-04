import api from "./axiosInstance";

/**
 * 문서(digest)에 저장된 드래그 주석 목록을 조회합니다.
 * @param {number} digestId
 * @returns {Promise<Array<{ id: number, selected_text: string, comment: string }>>}
 */
export async function fetchAnnotations(digestId) {
  const { data } = await api.get(`/api/annotation/${digestId}`);
  return data;
}

/**
 * 선택한 텍스트와 주석을 백엔드에 저장합니다.
 * @param {number} digestId
 * @param {string} selectedText
 * @param {string} comment
 * @returns {Promise<{ status: string, annotations: Array }>}
 */
export async function saveAnnotation(digestId, selectedText, comment) {
  const { data } = await api.post("/api/annotation/save", {
    digest_id: digestId,
    selected_text: selectedText,
    comment,
  });
  return data;
}
