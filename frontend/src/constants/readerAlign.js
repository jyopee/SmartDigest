export const READER_ALIGN = {
  LEFT: "left",
  CENTER: "center",
  RIGHT: "right",
};

export const READER_ALIGN_OPTIONS = [
  { id: READER_ALIGN.LEFT, label: "좌", title: "왼쪽 정렬" },
  { id: READER_ALIGN.CENTER, label: "중", title: "가운데 정렬" },
  { id: READER_ALIGN.RIGHT, label: "우", title: "오른쪽 정렬" },
];

export function loadReaderAlign(digestId) {
  if (!digestId) return READER_ALIGN.LEFT;
  const saved = localStorage.getItem(`smartdigest_reader_align_${digestId}`);
  if (saved && Object.values(READER_ALIGN).includes(saved)) return saved;
  return READER_ALIGN.LEFT;
}

export function saveReaderAlign(digestId, align) {
  if (!digestId) return;
  localStorage.setItem(`smartdigest_reader_align_${digestId}`, align);
}

export function readerAlignClass(align) {
  const value = Object.values(READER_ALIGN).includes(align)
    ? align
    : READER_ALIGN.LEFT;
  return `reader-prose--align-${value}`;
}
