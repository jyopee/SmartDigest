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
export const MINDMAP_PADDING_X = 96;
export const MINDMAP_PADDING_Y = 96;
export const MINDMAP_NODE_WIDTH = 300;
export const MINDMAP_NODE_HEIGHT = 200;
/** 카드 간 최소 여백 — 겹침 방지·자동 배치에 공통 적용 */
export const MINDMAP_MIN_GAP_X = 80;
export const MINDMAP_MIN_GAP_Y = 40;
export const NODE_STEP_X = MINDMAP_NODE_WIDTH + MINDMAP_MIN_GAP_X;
export const NODE_STEP_Y = MINDMAP_NODE_HEIGHT + MINDMAP_MIN_GAP_Y;

function normalizeLayoutNode(node) {
  return {
    id: String(node.id),
    x: Math.round(Number(node.x ?? node.position?.x) || 0),
    y: Math.round(Number(node.y ?? node.position?.y) || 0),
  };
}

function getOverlap(nodeA, nodeB) {
  const overlapX =
    Math.min(
      nodeA.x + MINDMAP_NODE_WIDTH + MINDMAP_MIN_GAP_X,
      nodeB.x + MINDMAP_NODE_WIDTH + MINDMAP_MIN_GAP_X
    ) - Math.max(nodeA.x, nodeB.x);
  const overlapY =
    Math.min(
      nodeA.y + MINDMAP_NODE_HEIGHT + MINDMAP_MIN_GAP_Y,
      nodeB.y + MINDMAP_NODE_HEIGHT + MINDMAP_MIN_GAP_Y
    ) - Math.max(nodeA.y, nodeB.y);

  if (overlapX <= 0 || overlapY <= 0) return null;
  return { overlapX, overlapY };
}

function nodePriority(id, priorityId) {
  if (priorityId && id === priorityId) return 2;
  return 1;
}

/** 드래그·데이터 추가 후 겹치는 카드를 밀어냅니다. */
export function resolveNodeCollisions(nodes, priorityId = null) {
  if (!nodes?.length) return [];

  const result = nodes.map(normalizeLayoutNode);
  const maxIterations = Math.max(24, result.length * result.length * 2);
  let changed = true;
  let iterations = 0;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations += 1;

    for (let i = 0; i < result.length; i += 1) {
      for (let j = i + 1; j < result.length; j += 1) {
        const overlap = getOverlap(result[i], result[j]);
        if (!overlap) continue;

        changed = true;
        const priorityDiff =
          nodePriority(result[i].id, priorityId) -
          nodePriority(result[j].id, priorityId);

        let mover = result[j];
        let anchor = result[i];
        if (priorityDiff > 0) {
          mover = result[i];
          anchor = result[j];
        } else if (priorityDiff < 0) {
          mover = result[j];
          anchor = result[i];
        }

        if (overlap.overlapX <= overlap.overlapY) {
          if (mover.x >= anchor.x) {
            mover.x = anchor.x + MINDMAP_NODE_WIDTH + MINDMAP_MIN_GAP_X;
          } else {
            mover.x = anchor.x - MINDMAP_NODE_WIDTH - MINDMAP_MIN_GAP_X;
          }
        } else if (mover.y >= anchor.y) {
          mover.y = anchor.y + MINDMAP_NODE_HEIGHT + MINDMAP_MIN_GAP_Y;
        } else {
          mover.y = anchor.y - MINDMAP_NODE_HEIGHT - MINDMAP_MIN_GAP_Y;
        }

        mover.x = Math.max(MINDMAP_PADDING_X, mover.x);
        mover.y = Math.max(MINDMAP_PADDING_Y, mover.y);

        if (!priorityId || priorityDiff === 0) {
          const partner = mover === result[i] ? result[j] : result[i];
          if (partner.x < MINDMAP_PADDING_X) partner.x = MINDMAP_PADDING_X;
          if (partner.y < MINDMAP_PADDING_Y) partner.y = MINDMAP_PADDING_Y;
        }
      }
    }
  }

  return result;
}

function arrangeBySortedColumns(nodes) {
  const sorted = [...nodes].sort((a, b) => {
    if (a.x !== b.x) return a.x - b.x;
    return a.y - b.y;
  });

  const columnsPerRow = Math.max(2, Math.ceil(Math.sqrt(sorted.length)));
  return sorted.map((node, index) => {
    const col = index % columnsPerRow;
    const row = Math.floor(index / columnsPerRow);
    return {
      id: node.id,
      x: MINDMAP_PADDING_X + col * NODE_STEP_X,
      y: MINDMAP_PADDING_Y + row * NODE_STEP_Y,
    };
  });
}

function arrangeAsTree(nodes, edges) {
  const nodeIds = nodes.map((node) => node.id);
  const children = new Map(nodeIds.map((id) => [id, []]));
  const inDegree = new Map(nodeIds.map((id) => [id, 0]));

  for (const edge of edges || []) {
    const source = String(edge.source ?? "");
    const target = String(edge.target ?? "");
    if (!children.has(source) || !children.has(target) || source === target) {
      continue;
    }
    children.get(source).push(target);
    inDegree.set(target, (inDegree.get(target) || 0) + 1);
  }

  const roots = nodeIds.filter((id) => (inDegree.get(id) || 0) === 0);
  if (!roots.length) roots.push(nodeIds[0]);

  const levels = new Map();
  const visited = new Set();
  const queue = roots.map((id) => ({ id, level: 0 }));

  while (queue.length) {
    const { id, level } = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level).push(id);

    for (const child of children.get(id) || []) {
      if (!visited.has(child)) {
        queue.push({ id: child, level: level + 1 });
      }
    }
  }

  for (const id of nodeIds) {
    if (visited.has(id)) continue;
    const detachedLevel = Math.max(-1, ...levels.keys()) + 1;
    if (!levels.has(detachedLevel)) levels.set(detachedLevel, []);
    levels.get(detachedLevel).push(id);
  }

  const maxRowWidth = Math.max(
    ...[...levels.values()].map((row) => row.length),
    1
  );
  const canvasCenterX =
    MINDMAP_PADDING_X + (maxRowWidth * NODE_STEP_X) / 2;
  const positions = new Map();

  for (const [level, ids] of [...levels.entries()].sort((a, b) => a[0] - b[0])) {
    const rowWidth = ids.length * NODE_STEP_X;
    const startX = canvasCenterX - rowWidth / 2;
    ids.forEach((id, index) => {
      positions.set(id, {
        x: Math.round(startX + index * NODE_STEP_X),
        y: MINDMAP_PADDING_Y + level * NODE_STEP_Y,
      });
    });
  }

  return nodes.map((node) => ({
    id: node.id,
    x: positions.get(node.id)?.x ?? node.x,
    y: positions.get(node.id)?.y ?? node.y,
  }));
}

/** 관계가 있으면 트리 중심 정렬, 없으면 X좌표 기준 격자 정렬 */
export function autoArrangeMindMapLayout(layout, cards) {
  const normalized = ensureMindMapLayoutForCards(layout, cards, {
    resolveCollisions: false,
  });
  const arranged =
    normalized.edges.length > 0
      ? arrangeAsTree(normalized.nodes, normalized.edges)
      : arrangeBySortedColumns(normalized.nodes);

  return {
    engine: MINDMAP_ENGINE,
    nodes: resolveNodeCollisions(arranged),
    edges: normalized.edges,
  };
}

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

export function ensureMindMapLayoutForCards(
  layout,
  cards,
  { resolveCollisions = true } = {}
) {
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

  const resolvedNodes = resolveCollisions
    ? resolveNodeCollisions(nodes)
    : nodes;

  return {
    engine: MINDMAP_ENGINE,
    nodes: resolvedNodes,
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

export function applyLayoutPositionsToFlowNodes(flowNodes, layoutNodes) {
  const posMap = new Map(
    (layoutNodes || []).map((node) => [String(node.id), node])
  );
  return (flowNodes || []).map((node) => {
    const next = posMap.get(String(node.id));
    if (!next) return node;
    return {
      ...node,
      position: { x: next.x, y: next.y },
    };
  });
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
