import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  addEdge,
  applyEdgeChanges,
  useEdgesState,
  useNodesState,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import SummaryCardNode from "./SummaryCardNode";
import LabeledEdge from "./LabeledEdge";
import {
  flowStateToMindMapLayout,
  mindMapLayoutToFlowState,
  pickHandlesForNodes,
} from "../utils/mindMapLayoutEngine";

const nodeTypes = { summaryCard: SummaryCardNode };
const edgeTypes = { labeled: LabeledEdge };

function buildEdgeId(source, target) {
  return `edge-${source}-${target}`;
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-.8.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l.8-.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AutoLayoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function UnlinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 9l6 6M15 9l-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M10 8l-1.2-1.2a4 4 0 0 0-5.6 5.6L5 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 16l1.2 1.2a4 4 0 0 0 5.6-5.6L19 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function getRelationGuide(connectMode, disconnectMode, pendingSourceId) {
  if (disconnectMode) {
    return {
      mode: "disconnect",
      text: "삭제할 관계 라벨을 클릭하세요",
    };
  }
  if (connectMode) {
    return {
      mode: "connect",
      text: pendingSourceId
        ? "연결할 두 번째 카드를 클릭하세요"
        : "연결할 첫 번째 카드를 클릭하세요",
    };
  }
  return {
    mode: "idle",
    text: "연결은 카드 두 번 클릭 · 해제는 관계 라벨 클릭",
  };
}

function withNodeUiState(nodes, cardProps, connectMode, pendingSourceId) {
  return (nodes || []).map((node) => ({
    ...node,
    data: {
      ...node.data,
      ...cardProps,
      card: node.data?.card,
      connectMode,
      isConnectSource: pendingSourceId === node.id,
    },
  }));
}

function MindMapFlow({
  cards,
  mindMapLayout,
  cardProps,
  onLayoutChange,
  onPersistLayout,
  onApplyDefaultLayout,
  searchActiveIndex,
  matchingCardIds,
  searchQuery,
  layoutRevision,
}) {
  const { fitView, setCenter } = useReactFlow();
  const persistTimerRef = useRef(null);
  const nodesRef = useRef([]);
  const edgesRef = useRef([]);
  const layoutRevisionRef = useRef(layoutRevision);

  const [connectMode, setConnectMode] = useState(false);
  const [disconnectMode, setDisconnectMode] = useState(false);
  const [pendingSourceId, setPendingSourceId] = useState(null);

  const initialState = useMemo(
    () => mindMapLayoutToFlowState(mindMapLayout, cards, cardProps),
    [layoutRevision]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialState.nodes);
  const [edges, setEdges] = useEdgesState(initialState.edges);

  nodesRef.current = nodes;
  edgesRef.current = edges;

  const emitLayout = useCallback(
    (nextNodes, nextEdges) => {
      if (cards.length > 0 && !nextNodes.length) return;

      const nextLayout = flowStateToMindMapLayout(nextNodes, nextEdges);
      onLayoutChange?.(nextLayout);
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        onPersistLayout?.(nextLayout);
      }, 500);
    },
    [cards.length, onLayoutChange, onPersistLayout]
  );

  const handleEdgeRemove = useCallback(
    (edgeId, { silent = false } = {}) => {
      const target = edgesRef.current.find((edge) => edge.id === edgeId);
      const label = (target?.data?.label || target?.label || "연관됨").trim();

      if (
        !silent &&
        !window.confirm(`"${label}" 관계를 삭제할까요?`)
      ) {
        return;
      }

      setEdges((currentEdges) => {
        const nextEdges = currentEdges.filter((edge) => edge.id !== edgeId);
        emitLayout(nodesRef.current, nextEdges);
        return nextEdges;
      });
    },
    [setEdges, emitLayout]
  );

  const handleEdgeLabelCommit = useCallback(
    (edgeId, label) => {
      setEdges((currentEdges) => {
        const nextEdges = currentEdges.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                data: { ...edge.data, label },
                label,
              }
            : edge
        );
        emitLayout(nodesRef.current, nextEdges);
        return nextEdges;
      });
    },
    [setEdges, emitLayout]
  );

  const enrichEdges = useCallback(
    (nextEdges) =>
      (nextEdges || []).map((edge) => ({
        ...edge,
        selectable: true,
        deletable: true,
        focusable: true,
        data: {
          ...edge.data,
          disconnectMode,
          onLabelCommit: handleEdgeLabelCommit,
          onEdgeRemove: handleEdgeRemove,
        },
      })),
    [disconnectMode, handleEdgeLabelCommit, handleEdgeRemove]
  );

  const appendConnectionEdge = useCallback(
    (sourceId, targetId, handles) => {
      const label =
        window.prompt("연결 관계를 입력하세요", "연관됨") ?? "연관됨";
      const trimmedLabel = label.trim() || "연관됨";

      setEdges((currentEdges) => {
        const edgeId = buildEdgeId(sourceId, targetId);
        const withoutDuplicate = currentEdges.filter((edge) => edge.id !== edgeId);
        const nextEdges = enrichEdges(
          addEdge(
            {
              id: edgeId,
              source: sourceId,
              target: targetId,
              sourceHandle: handles.sourceHandle,
              targetHandle: handles.targetHandle,
              type: "labeled",
              data: { label: trimmedLabel },
              label: trimmedLabel,
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: "#475569",
                width: 18,
                height: 18,
              },
              style: { stroke: "#475569", strokeWidth: 2.2 },
            },
            withoutDuplicate
          )
        );
        emitLayout(nodesRef.current, nextEdges);
        return nextEdges;
      });
    },
    [setEdges, emitLayout, enrichEdges]
  );

  useEffect(
    () => () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    if (layoutRevisionRef.current === layoutRevision) return;
    layoutRevisionRef.current = layoutRevision;

    const nextState = mindMapLayoutToFlowState(mindMapLayout, cards, cardProps);
    setNodes(withNodeUiState(nextState.nodes, cardProps, connectMode, pendingSourceId));
    setEdges(enrichEdges(nextState.edges));
  }, [
    layoutRevision,
    mindMapLayout,
    cards,
    cardProps,
    connectMode,
    pendingSourceId,
    setNodes,
    setEdges,
    enrichEdges,
  ]);

  useEffect(() => {
    setNodes((currentNodes) =>
      withNodeUiState(currentNodes, cardProps, connectMode, pendingSourceId)
    );
  }, [cardProps, connectMode, pendingSourceId, setNodes]);

  useEffect(() => {
    if (!connectMode && !disconnectMode) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setPendingSourceId(null);
      setConnectMode(false);
      setDisconnectMode(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [connectMode, disconnectMode]);

  useEffect(() => {
    if (!nodes.length) return;
    const frame = requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 240 });
    });
    return () => cancelAnimationFrame(frame);
  }, [layoutRevision, nodes.length, fitView]);

  useEffect(() => {
    if (!searchQuery.trim() || !matchingCardIds.length) return;
    const targetId =
      matchingCardIds[searchActiveIndex % matchingCardIds.length];
    const targetNode = nodes.find((node) => node.id === targetId);
    if (!targetNode) return;
    setCenter(targetNode.position.x + 140, targetNode.position.y + 90, {
      zoom: 1,
      duration: 320,
    });
  }, [searchQuery, searchActiveIndex, matchingCardIds, nodes, setCenter]);

  const handleNodeDragStop = useCallback(() => {
    emitLayout(nodesRef.current, edgesRef.current);
  }, [emitLayout]);

  const handleEdgesChange = useCallback(
    (changes) => {
      setEdges((currentEdges) => {
        const nextEdges = applyEdgeChanges(changes, currentEdges);
        if (changes.some((change) => change.type === "remove")) {
          queueMicrotask(() => emitLayout(nodesRef.current, nextEdges));
        }
        return nextEdges;
      });
    },
    [setEdges, emitLayout]
  );

  const handleNodeClick = useCallback(
    (event, node) => {
      if (!connectMode) return;
      if (event.target.closest("button, a, input, textarea, .sd-highlight")) {
        return;
      }

      if (!pendingSourceId) {
        setPendingSourceId(node.id);
        return;
      }

      if (pendingSourceId === node.id) {
        setPendingSourceId(null);
        return;
      }

      const sourceNode = nodesRef.current.find(
        (item) => item.id === pendingSourceId
      );
      if (!sourceNode) {
        setPendingSourceId(node.id);
        return;
      }

      const handles = pickHandlesForNodes(sourceNode, node);
      appendConnectionEdge(pendingSourceId, node.id, handles);
      setPendingSourceId(null);
    },
    [connectMode, pendingSourceId, appendConnectionEdge]
  );

  const handlePaneClick = useCallback(() => {
    if (connectMode) {
      setPendingSourceId(null);
    }
  }, [connectMode]);

  const toggleConnectMode = useCallback(() => {
    setConnectMode((prev) => {
      if (prev) setPendingSourceId(null);
      if (!prev) setDisconnectMode(false);
      return !prev;
    });
  }, []);

  const toggleDisconnectMode = useCallback(() => {
    setDisconnectMode((prev) => {
      if (!prev) {
        setConnectMode(false);
        setPendingSourceId(null);
      }
      return !prev;
    });
  }, []);

  const guide = getRelationGuide(connectMode, disconnectMode, pendingSourceId);

  return (
    <div className="mindmap-flow-wrap">
      <ReactFlow
        className={`mindmap-flow${connectMode ? " is-connect-mode" : ""}${
          disconnectMode ? " is-disconnect-mode" : ""
        }`}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.25}
        maxZoom={2}
        zoomOnScroll
        panOnScroll={false}
        selectionOnDrag={false}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        edgesFocusable
        deleteKeyCode={["Backspace", "Delete"]}
        elevateNodesOnSelect
        elevateEdgesOnSelect={false}
        nodeDragHandle=".summary-card-drag-handle"
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: "labeled",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#475569",
            width: 18,
            height: 18,
          },
          style: { stroke: "#475569", strokeWidth: 2.2 },
        }}
      >
        <Background variant="dots" gap={20} size={1.2} color="#cbd5e1" />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          className="mindmap-minimap"
          position="top-right"
          nodeColor="#93c5fd"
          maskColor="rgba(248, 250, 252, 0.75)"
          pannable
          zoomable
        />
      </ReactFlow>

      <div
        className={`mindmap-relation-panel is-${guide.mode}`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="mindmap-mode-switch" role="group" aria-label="관계 도구">
          <button
            type="button"
            className={`mindmap-mode-btn mindmap-mode-btn--connect${
              connectMode ? " is-active" : ""
            }`}
            onClick={toggleConnectMode}
            aria-pressed={connectMode}
          >
            <LinkIcon />
            <span>연결</span>
          </button>
          <button
            type="button"
            className={`mindmap-mode-btn mindmap-mode-btn--disconnect${
              disconnectMode ? " is-active" : ""
            }`}
            onClick={toggleDisconnectMode}
            aria-pressed={disconnectMode}
          >
            <UnlinkIcon />
            <span>해제</span>
          </button>
        </div>
        <p className="mindmap-relation-guide">{guide.text}</p>
      </div>

      {onApplyDefaultLayout && (
        <button
          type="button"
          className="mindmap-auto-layout-btn"
          onClick={onApplyDefaultLayout}
          onPointerDown={(event) => event.stopPropagation()}
          title="카드를 격자 형태로 다시 배치합니다"
        >
          <AutoLayoutIcon />
          <span>자동 배치</span>
        </button>
      )}
    </div>
  );
}

function MindMapCanvas(props) {
  return (
    <div className="mindmap-canvas">
      <ReactFlowProvider>
        <MindMapFlow {...props} />
      </ReactFlowProvider>
    </div>
  );
}

export default memo(MindMapCanvas);
