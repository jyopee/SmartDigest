export const GRID_COLS = 12;

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
    if (weight >= 9) return { w: 12, h: 4, minW: 4, minH: 2 };
    if (weight >= 7) return { w: 8, h: 3, minW: 4, minH: 2 };
    if (weight >= 5) return { w: 6, h: 3, minW: 3, minH: 2 };
    return { w: 6, h: 2, minW: 3, minH: 2 };
  }

  if (cardType === "question") {
    return { w: 5, h: 2, minW: 3, minH: 2 };
  }

  if (weight >= 8) return { w: 6, h: 3, minW: 3, minH: 2 };
  if (weight >= 5) return { w: 4, h: 2, minW: 3, minH: 2 };
  return { w: 4, h: 2, minW: 3, minH: 2 };
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
      i: card.id,
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
  const cardIds = new Set(cards.map((card) => card.id));
  const seen = new Set();
  const normalized = [];

  for (const item of savedLayout || []) {
    if (!item?.i || !cardIds.has(item.i) || seen.has(item.i)) continue;
    seen.add(item.i);
    normalized.push({
      i: item.i,
      x: Number(item.x) || 0,
      y: Number(item.y) || 0,
      w: Number(item.w) || 4,
      h: Number(item.h) || 2,
      minW: Number(item.minW) || 3,
      minH: Number(item.minH) || 2,
    });
  }

  const missingCards = cards.filter((card) => !seen.has(card.id));
  if (!missingCards.length) {
    return normalized.length ? normalized : buildSmartLayout(cards);
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
    type: normalizeCardType(card.type, index),
    weight: normalizeWeight(card.weight, normalizeCardType(card.type, index)),
  }));
}
