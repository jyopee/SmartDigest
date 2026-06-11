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

export function normalizeReaderAlign(align) {
  return Object.values(READER_ALIGN).includes(align)
    ? align
    : READER_ALIGN.LEFT;
}

export function readerAlignClass(align) {
  return `reader-prose--align-${normalizeReaderAlign(align)}`;
}

/** 정렬 상태를 className + 인라인 스타일로 즉시 반영 */
export function readerAlignStyle(align, { blockPosition = true } = {}) {
  const value = normalizeReaderAlign(align);
  const style = {
    "--reader-align": value,
    textAlign: value,
  };

  if (blockPosition) {
    if (value === READER_ALIGN.CENTER) {
      style.marginLeft = "auto";
      style.marginRight = "auto";
    } else if (value === READER_ALIGN.RIGHT) {
      style.marginLeft = "auto";
      style.marginRight = "0";
    } else {
      style.marginLeft = "0";
      style.marginRight = "auto";
    }
  }

  return style;
}
