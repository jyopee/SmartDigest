export const GRID_COLS = 12;
const DROP_ITEM_ID = "__dropping-elem__";

const TYPE_SORT_ORDER = { main: 0, detail: 1, question: 2 };
const TYPE_ALIASES = { details: "detail", main_topic: "main" };

export function normalizeCardType(rawType, index = 0) {
  const value = String(rawType || "")
    .trim()
    .toLowerCase();
  const mapped = TYPE_ALIASES[value] || value;
  if (mapped === "main" || mapped === "detail" || mapped === "question") {
    return mapped;
  }
  return index === 0 ? "main" : "detail";
}

export function normalizeWeight(rawWeight, cardType) {
  const weight = Number(rawWeight);
  if (Number.isFinite(weight) && weight >= 1 && weight <= 10) {
    return Math.round(weight);
  }
  const defaults = { main: 8, detail: 5, question: 4 };
  return defaults[cardType] ?? 5;
}

export function cardGridDimensions(card) {
  const cardType = normalizeCardType(card?.type);
  const weight = normalizeWeight(card?.weight, cardType);

  if (cardType === "main") {
    if (weight >= 9) return { w: 8, h: 3, minW: 4, minH: 2 };
    if (weight >= 7) return { w: 6, h: 2, minW: 3, minH: 2 };
    if (weight >= 5) return { w: 5, h: 2, minW: 3, minH: 2 };
    return { w: 4, h: 2, minW: 3, minH: 2 };
  }

  if (cardType === "question") {
    return { w: 4, h: 2, minW: 3, minH: 2 };
  }

  if (weight >= 8) return { w: 5, h: 2, minW: 3, minH: 2 };
  if (weight >= 5) return { w: 4, h: 2, minW: 3, minH: 2 };
  return { w: 3, h: 2, minW: 2, minH: 2 };
}

export function buildSmartLayout(cards) {
  if (!cards?.length) return [];

  const sortedCards = [...cards].sort((a, b) => {
    const weightDiff =
      normalizeWeight(b.weight, normalizeCardType(b.type)) -
      normalizeWeight(a.weight, normalizeCardType(a.type));
    if (weightDiff !== 0) return weightDiff;

    const typeDiff =
      (TYPE_SORT_ORDER[normalizeCardType(a.type)] ?? 9) -
      (TYPE_SORT_ORDER[normalizeCardType(b.type)] ?? 9);
    if (typeDiff !== 0) return typeDiff;

    return String(a.title || "").localeCompare(String(b.title || ""), "ko");
  });

  const layout = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;

  for (const card of sortedCards) {
    const dims = cardGridDimensions(card);
    const width = Math.min(dims.w, GRID_COLS);

    if (x > 0 && x + width > GRID_COLS) {
      y += rowHeight;
      x = 0;
      rowHeight = 0;
    }

    layout.push({
      i: String(card.id),
      x,
      y,
      w: width,
      h: dims.h,
      minW: dims.minW,
      minH: dims.minH,
    });

    x += width;
    rowHeight = Math.max(rowHeight, dims.h);

    if (x >= GRID_COLS) {
      y += rowHeight;
      x = 0;
      rowHeight = 0;
    }
  }

  return layout;
}

export function normalizeSmartLayout(savedLayout, cards) {
  if (!cards?.length) return [];

  const cardIds = new Set(cards.map((card) => String(card.id)));
  const seen = new Set();
  const normalized = [];

  for (const item of savedLayout || []) {
    const itemId = String(item?.i ?? "");
    if (!itemId || !cardIds.has(itemId) || seen.has(itemId)) continue;
    seen.add(itemId);
    const card = cards.find((entry) => String(entry.id) === itemId);
    const dims = card ? cardGridDimensions(card) : {};
    normalized.push({
      i: itemId,
      x: Math.max(0, Number(item.x) || 0),
      y: Math.max(0, Number(item.y) || 0),
      w: Math.min(Math.max(Number(item.w) || dims.w || 4, 1), GRID_COLS),
      h: Math.max(Number(item.h) || dims.h || 2, 1),
      minW: Number(item.minW) || dims.minW || 3,
      minH: Number(item.minH) || dims.minH || 2,
    });
  }

  if (!normalized.length) {
    return buildSmartLayout(cards);
  }

  const missingCards = cards.filter((card) => !seen.has(String(card.id)));
  if (!missingCards.length && normalized.length === cards.length) {
    return normalized;
  }

  if (normalized.length < cards.length * 0.5) {
    return buildSmartLayout(cards);
  }

  const maxY = normalized.reduce(
    (max, item) => Math.max(max, item.y + item.h),
    0
  );
  const appended = buildSmartLayout(missingCards).map((item) => ({
    ...item,
    y: item.y + maxY,
  }));

  return [...normalized, ...appended];
}

export function enrichCards(cards) {
  return (cards || []).map((card, index) => ({
    ...card,
    id: String(card.id),
    type: normalizeCardType(card.type, index),
    weight: normalizeWeight(card.weight, normalizeCardType(card.type, index)),
  }));
}

function toGridNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** RGL v2가 요구하는 단일 레이아웃 항목 형식으로 정규화합니다. */
export function sanitizeLayoutItem(item, card, fallback = null) {
  const dims = card ? cardGridDimensions(card) : {};
  const source = item || fallback || {};
  const minW = toGridNumber(source.minW, dims.minW || 3);
  const minH = toGridNumber(source.minH, dims.minH || 2);

  return {
    i: String(card?.id ?? source.i ?? ""),
    x: Math.max(0, Math.round(toGridNumber(source.x, 0))),
    y: Math.max(0, Math.round(toGridNumber(source.y, 0))),
    w: Math.min(
      Math.max(Math.round(toGridNumber(source.w, dims.w || 4)), minW, 1),
      GRID_COLS
    ),
    h: Math.max(Math.round(toGridNumber(source.h, dims.h || 2)), minH, 1),
    minW,
    minH,
  };
}

/** DB 저장용 — 좌표 필드만 남깁니다. */
export function serializeLayoutForStorage(layout) {
  return (layout || []).map((item) => {
    const sanitized = sanitizeLayoutItem(item, { id: item?.i });
    return {
      i: sanitized.i,
      x: sanitized.x,
      y: sanitized.y,
      w: sanitized.w,
      h: sanitized.h,
      minW: sanitized.minW,
      minH: sanitized.minH,
    };
  });
}

/** react-grid-layout 항목에 드래그·리사이즈 속성과 크기 제약을 보장합니다. */
export function applyGridItemCapabilities(layout, cards) {
  const cardMap = new Map((cards || []).map((card) => [String(card.id), card]));

  return (layout || [])
    .filter((item) => cardMap.has(String(item?.i ?? "")))
    .map((item) => {
      const card = cardMap.get(String(item.i));
      const sanitized = sanitizeLayoutItem(item, card);
      const isStatic = Boolean(item.static);

      return {
        ...sanitized,
        isDraggable: isStatic ? false : item.isDraggable !== false,
        isResizable: isStatic ? false : item.isResizable !== false,
      };
    });
}

/** 드래그/리사이즈 직후 — 위치를 유지한 채 카드와 1:1로 맞춥니다. */
export function commitLayoutItems(layout, cards) {
  if (!cards?.length) return [];

  const cardIds = new Set(cards.map((card) => String(card.id)));
  const layoutMap = new Map();
  for (const item of layout || []) {
    const itemId = String(item?.i ?? "");
    if (!itemId || itemId === DROP_ITEM_ID || !cardIds.has(itemId) || layoutMap.has(itemId)) {
      continue;
    }
    layoutMap.set(itemId, item);
  }

  return cards.map((card) => {
    const itemId = String(card.id);
    return sanitizeLayoutItem(layoutMap.get(itemId), card);
  });
}

/** 카드 id와 layout i가 1:1로 맞는지 확인하고 누락 항목을 보충합니다. */
export function ensureLayoutForCards(layout, cards) {
  if (!cards?.length) return [];

  const committed = commitLayoutItems(layout, cards);
  const hasEveryCard = committed.length === cards.length;
  const hasAnyPosition = committed.some((item) => item.x > 0 || item.y > 0);

  if (hasEveryCard && (hasAnyPosition || (layout || []).length >= cards.length)) {
    return committed;
  }

  const normalized = normalizeSmartLayout(layout, cards);
  return commitLayoutItems(normalized, cards);
}
