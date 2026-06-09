import { normalizeCardType, normalizeWeight } from "./smartLayoutEngine";

export const MINDMAP_ENGINE = "mindmap";

const VALID_HANDLE_IDS = new Set(["top", "right", "bottom", "left"]);

export function normalizeHandleId(handleId) {
  if (!handleId) return "";
  const raw = String(handleId).trim();
  if (VALID_HANDLE_IDS.has(raw)) return raw;
  const legacy = raw.replace(/-(source|target)$/i, "");
  return VALID_HANDLE_IDS.has(legacy) ? legacy : "";
}

export function toFlowSourceHandle(handleId) {
  const base = normalizeHandleId(handleId);
  return base ? `${base}-source` : "";
}

export function toFlowTargetHandle(handleId) {
  const base = normalizeHandleId(handleId);
  return base ? `${base}-target` : "";
}
export const NODE_STEP_X = 380;
export const NODE_STEP_Y = 240;
export const MINDMAP_PADDING_X = 96;
export const MINDMAP_PADDING_Y = 96;
export const MINDMAP_NODE_WIDTH = 300;
export const MINDMAP_NODE_HEIGHT = 200;

/** 두 카드 위치에 맞는 연결 핸들(방향)을 자동 선택합니다. */
export function pickHandlesForNodes(sourceNode, targetNode) {
  const sw =
    sourceNode?.measured?.width ?? sourceNode?.width ?? MINDMAP_NODE_WIDTH;
  const sh =
    sourceNode?.measured?.height ?? sourceNode?.height ?? MINDMAP_NODE_HEIGHT;
  const tw =
    targetNode?.measured?.width ?? targetNode?.width ?? MINDMAP_NODE_WIDTH;
  const th =
    targetNode?.measured?.height ?? targetNode?.height ?? MINDMAP_NODE_HEIGHT;

  const sx = (sourceNode?.position?.x ?? 0) + sw / 2;
  const sy = (sourceNode?.position?.y ?? 0) + sh / 2;
  const tx = (targetNode?.position?.x ?? 0) + tw / 2;
  const ty = (targetNode?.position?.y ?? 0) + th / 2;

  const dx = tx - sx;
  const dy = ty - sy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "right-source", targetHandle: "left-target" }
      : { sourceHandle: "left-source", targetHandle: "right-target" };
  }

  return dy >= 0
    ? { sourceHandle: "bottom-source", targetHandle: "top-target" }
    : { sourceHandle: "top-source", targetHandle: "bottom-target" };
}

const TYPE_SORT_ORDER = { main: 0, detail: 1, question: 2 };

export function isMindMapLayout(layout) {
  return (
    layout &&
    typeof layout === "object" &&
    !Array.isArray(layout) &&
    layout.engine === MINDMAP_ENGINE
  );
}

function sortCardsForLayout(cards) {
  return [...cards].sort((a, b) => {
    const typeA = normalizeCardType(a.type);
    const typeB = normalizeCardType(b.type);
    const weightDiff =
      normalizeWeight(b.weight, typeB) - normalizeWeight(a.weight, typeA);
    if (weightDiff !== 0) return weightDiff;

    const typeDiff =
      (TYPE_SORT_ORDER[typeA] ?? 9) - (TYPE_SORT_ORDER[typeB] ?? 9);
    if (typeDiff !== 0) return typeDiff;

    return String(a.title || "").localeCompare(String(b.title || ""), "ko");
  });
}

export function buildDefaultMindMapLayout(cards) {
  const sorted = sortCardsForLayout(cards || []);
  const nodes = [];
  let col = 0;
  let row = 0;

  for (const card of sorted) {
    nodes.push({
      id: String(card.id),
      x: MINDMAP_PADDING_X + col * NODE_STEP_X,
      y: MINDMAP_PADDING_Y + row * NODE_STEP_Y,
    });
    col += 1;
    if (col >= 3) {
      col = 0;
      row += 1;
    }
  }

  return {
    engine: MINDMAP_ENGINE,
    nodes,
    edges: [],
  };
}

function migrateGridLayoutToMindMap(gridLayout, cards) {
  const GRID_COL_WIDTH = 96;
  const GRID_ROW_HEIGHT = 72;
  const cardIds = new Set((cards || []).map((card) => String(card.id)));
  const nodes = [];

  for (const item of gridLayout || []) {
    const id = String(item?.i ?? "");
    if (!id || !cardIds.has(id)) continue;
    nodes.push({
      id,
      x: MINDMAP_PADDING_X + (Number(item.x) || 0) * GRID_COL_WIDTH,
      y: MINDMAP_PADDING_Y + (Number(item.y) || 0) * GRID_ROW_HEIGHT,
    });
  }

  if (!nodes.length) {
    return buildDefaultMindMapLayout(cards);
  }

  const seen = new Set(nodes.map((node) => node.id));
  const missing = (cards || []).filter((card) => !seen.has(String(card.id)));
  if (missing.length) {
    const appended = buildDefaultMindMapLayout(missing);
    const maxY = nodes.reduce((max, node) => Math.max(max, node.y), 0);
    appended.nodes.forEach((node, index) => {
      nodes.push({
        ...node,
        y: maxY + NODE_STEP_Y + index * 40,
      });
    });
  }

  return {
    engine: MINDMAP_ENGINE,
    nodes,
    edges: [],
  };
}

export function ensureMindMapLayoutForCards(layout, cards) {
  if (!cards?.length) {
    return { engine: MINDMAP_ENGINE, nodes: [], edges: [] };
  }

  let base = layout;
  if (Array.isArray(layout)) {
    base = migrateGridLayoutToMindMap(layout, cards);
  } else if (!isMindMapLayout(layout)) {
    base = buildDefaultMindMapLayout(cards);
  }

  const cardIds = new Set(cards.map((card) => String(card.id)));
  const seen = new Set();
  const nodes = [];

  for (const node of base.nodes || []) {
    const id = String(node?.id ?? "");
    if (!id || !cardIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    nodes.push({
      id,
      x: Math.round(Number(node.x) || 0),
      y: Math.round(Number(node.y) || 0),
    });
  }

  const missingCards = cards.filter((card) => !seen.has(String(card.id)));
  if (missingCards.length) {
    const maxY = nodes.reduce((max, node) => Math.max(max, node.y), 0);
    missingCards.forEach((card, index) => {
      nodes.push({
        id: String(card.id),
        x: MINDMAP_PADDING_X,
        y: maxY + NODE_STEP_Y + index * NODE_STEP_Y,
      });
    });
  }

  const edges = (base.edges || [])
    .map((edge, index) => {
      const source = String(edge?.source ?? "");
      const target = String(edge?.target ?? "");
      if (!source || !target || !cardIds.has(source) || !cardIds.has(target)) {
        return null;
      }
      return {
        id: String(edge.id || `edge-${source}-${target}-${index}`),
        source,
        target,
        label: String(edge.label || edge.data?.label || "").trim(),
        sourceHandle: normalizeHandleId(edge.sourceHandle),
        targetHandle: normalizeHandleId(edge.targetHandle),
      };
    })
    .filter(Boolean);

  return {
    engine: MINDMAP_ENGINE,
    nodes,
    edges,
  };
}

const SNAPSHOT_CARD_KEYS = [
  "id",
  "type",
  "weight",
  "title",
  "content",
  "page_number",
  "source",
  "source_id",
  "selected_text",
];

export function serializeCardsForSnapshot(cards) {
  return (cards || []).map((card) => {
    const snapshot = {};
    for (const key of SNAPSHOT_CARD_KEYS) {
      if (card?.[key] !== undefined && card?.[key] !== null && card?.[key] !== "") {
        snapshot[key] = card[key];
      }
    }
    snapshot.id = String(snapshot.id ?? card?.id ?? "");
    snapshot.page_number = Number(snapshot.page_number ?? card?.page_number ?? 1) || 1;
    return snapshot;
  });
}

export function serializeMindMapForStorage(layout) {
  const normalized = ensureMindMapLayoutForCards(layout, []);
  return {
    engine: MINDMAP_ENGINE,
    nodes: (layout?.nodes || normalized.nodes).map((node) => ({
      id: String(node.id),
      x: Math.round(Number(node.x) || 0),
      y: Math.round(Number(node.y) || 0),
    })),
    edges: (layout?.edges || []).map((edge, index) => ({
      id: String(edge.id || `edge-${edge.source}-${edge.target}-${index}`),
      source: String(edge.source),
      target: String(edge.target),
      label: String(edge.label || edge.data?.label || "").trim(),
      sourceHandle: normalizeHandleId(edge.sourceHandle),
      targetHandle: normalizeHandleId(edge.targetHandle),
    })),
  };
}

export function mindMapLayoutToFlowState(mindMapLayout, cards, cardProps) {
  const layout = ensureMindMapLayoutForCards(mindMapLayout, cards);
  const cardMap = new Map(cards.map((card) => [String(card.id), card]));

  const nodes = layout.nodes
    .map((node) => {
      const card = cardMap.get(node.id);
      if (!card) return null;
      return {
        id: node.id,
        type: "summaryCard",
        position: { x: node.x, y: node.y },
        data: {
          card,
          ...cardProps,
        },
      };
    })
    .filter(Boolean);

  const edges = layout.edges.map((edge) => {
    const sourceHandle = toFlowSourceHandle(edge.sourceHandle);
    const targetHandle = toFlowTargetHandle(edge.targetHandle);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(sourceHandle ? { sourceHandle } : {}),
      ...(targetHandle ? { targetHandle } : {}),
      type: "labeled",
      label: edge.label || "",
      data: { label: edge.label || "" },
      markerEnd: { type: "arrowclosed", color: "#475569", width: 18, height: 18 },
      style: { stroke: "#475569", strokeWidth: 2.2 },
    };
  });

  return { nodes, edges, layout };
}

export function flowStateToMindMapLayout(nodes, edges) {
  return {
    engine: MINDMAP_ENGINE,
    nodes: (nodes || []).map((node) => ({
      id: String(node.id),
      x: Math.round(node.position?.x || 0),
      y: Math.round(node.position?.y || 0),
    })),
    edges: (edges || []).map((edge, index) => ({
      id: String(edge.id || `edge-${edge.source}-${edge.target}-${index}`),
      source: String(edge.source),
      target: String(edge.target),
      label: String(edge.data?.label || edge.label || "").trim(),
      sourceHandle: normalizeHandleId(edge.sourceHandle),
      targetHandle: normalizeHandleId(edge.targetHandle),
    })),
  };
}
