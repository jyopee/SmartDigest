export const LAYOUT_MODES = {
  GRID: "grid",
  SPLIT: "split",
  LIST: "list",
};

export const LAYOUT_OPTIONS = [
  {
    id: LAYOUT_MODES.GRID,
    label: "Grid",
    title: "격자 배치",
    description: "카드를 자유롭게 드래그·리사이즈",
    icon: "grid",
  },
  {
    id: LAYOUT_MODES.SPLIT,
    label: "Split",
    title: "좌우 분할",
    description: "주제와 상세를 양쪽에 배치",
    icon: "split",
  },
  {
    id: LAYOUT_MODES.LIST,
    label: "List",
    title: "세로 목록",
    description: "카드를 위에서 아래로 정렬",
    icon: "list",
  },
];

export function loadLayoutMode(digestId) {
  if (!digestId) return LAYOUT_MODES.GRID;
  const saved = localStorage.getItem(`smartdigest_layout_mode_${digestId}`);
  if (saved && Object.values(LAYOUT_MODES).includes(saved)) return saved;
  return LAYOUT_MODES.GRID;
}

export function saveLayoutMode(digestId, mode) {
  if (!digestId) return;
  localStorage.setItem(`smartdigest_layout_mode_${digestId}`, mode);
}
