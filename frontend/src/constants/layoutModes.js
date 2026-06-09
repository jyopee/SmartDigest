export const LAYOUT_MODES = {
  MINDMAP: "mindmap",
  SPLIT: "split",
  LIST: "list",
};

/** @deprecated use LAYOUT_MODES.MINDMAP */
export const LEGACY_GRID_MODE = "grid";

export const LAYOUT_OPTIONS = [
  {
    id: LAYOUT_MODES.MINDMAP,
    label: "Mindmap",
    title: "마인드맵",
    description: "카드를 자유 배치하고 연결",
    icon: "mindmap",
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
  if (!digestId) return LAYOUT_MODES.MINDMAP;
  const saved = localStorage.getItem(`smartdigest_layout_mode_${digestId}`);
  if (saved === LEGACY_GRID_MODE) return LAYOUT_MODES.MINDMAP;
  if (saved && Object.values(LAYOUT_MODES).includes(saved)) return saved;
  return LAYOUT_MODES.MINDMAP;
}

export function saveLayoutMode(digestId, mode) {
  if (!digestId) return;
  localStorage.setItem(`smartdigest_layout_mode_${digestId}`, mode);
}
