import api from "./axiosInstance";

/**
 * 문서 페이지 메타 정보를 조회합니다.
 * @param {number} digestId
 * @returns {Promise<{ total_pages: number, pages: Array<{ page_number: number, content_length: number }> }>}
 */
export async function fetchPageMeta(digestId) {
  const { data } = await api.get(`/api/digests/${digestId}/pages`);
  return data;
}

/**
 * 특정 페이지 내용을 조회합니다.
 * @param {number} digestId
 * @param {number} page
 */
export async function fetchPageContent(digestId, page) {
  const { data } = await api.get(`/api/digests/${digestId}/pages`, {
    params: { page },
  });
  return data;
}

/**
 * 특정 페이지 내용을 저장합니다.
 * @param {number} digestId
 * @param {number} page
 * @param {string} content
 */
export async function savePageContent(digestId, page, content) {
  const { data } = await api.put(
    `/api/digests/${digestId}/pages`,
    { content },
    { params: { page } }
  );
  return data;
}

/**
 * 특정 페이지를보내기용 데이터로 조회합니다.
 * @param {number} digestId
 * @param {number} page
 */
export async function fetchPageExport(digestId, page) {
  const { data } = await api.get(`/api/digests/${digestId}/pages/export`, {
    params: { page },
  });
  return data;
}

export function downloadMarkdownFile(filename, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
