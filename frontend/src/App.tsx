import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
  MarkerType,
  ReactFlowInstance,
  OnSelectionChangeParams,
} from 'reactflow';
import 'reactflow/dist/style.css';

import TextInputPanel  from './components/TextInputPanel';
import DiagramCanvas, { DiagramCanvasHandle } from './components/DiagramCanvas';
import Toolbar         from './components/Toolbar';
import NodeEditor      from './components/NodeEditor';
import EdgeEditor      from './components/EdgeEditor';
import ExportMenu      from './components/ExportMenu';

import { parseText }            from './parser/textParser';
import { getLayoutedElements }  from './hooks/useLayout';
import { GraphModel, NodeType } from './models/graphModel';

type EdgeTipStyle = 'arrow' | 'none';
type EdgeLineType = 'smoothstep' | 'straight' | 'step' | 'bezier';
type AnchorSide = 'auto' | 'top' | 'right' | 'bottom' | 'left';

function getNodeSize(node: Node) {
  const width = Number((node.data?.boxWidth as number) ?? node.width ?? 180);
  const height = Number((node.data?.boxHeight as number) ?? node.height ?? 72);
  return { width, height };
}

function markerForTip(tip: EdgeTipStyle) {
  if (tip === 'none') return undefined;
  return { type: MarkerType.ArrowClosed, color: '#64748b', width: 18, height: 18 };
}

function getNodeCenter(node: Node) {
  const { width: w, height: h } = getNodeSize(node);
  return { x: node.position.x + w / 2, y: node.position.y + h / 2 };
}

function closestHandlesForPair(source: Node, target: Node) {
  const a = getNodeCenter(source);
  const b = getNodeCenter(target);
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: 'source-right', targetHandle: 'target-left' }
      : { sourceHandle: 'source-left', targetHandle: 'target-right' };
  }

  return dy >= 0
    ? { sourceHandle: 'source-bottom', targetHandle: 'target-top' }
    : { sourceHandle: 'source-top', targetHandle: 'target-bottom' };
}

function withClosestAnchors(es: Edge[], ns: Node[]): Edge[] {
  return es.map((e) => {
    const src = ns.find((n) => n.id === e.source);
    const tgt = ns.find((n) => n.id === e.target);
    if (!src || !tgt) return e;
    const pair = closestHandlesForPair(src, tgt);
    return { ...e, sourceHandle: pair.sourceHandle, targetHandle: pair.targetHandle };
  });
}

function withHierarchicalAnchors(es: Edge[], ns: Node[]): Edge[] {
  return es.map((e) => {
    const src = ns.find((n) => n.id === e.source);
    const tgt = ns.find((n) => n.id === e.target);
    if (!src || !tgt) return e;

    const s = getNodeCenter(src);
    const t = getNodeCenter(tgt);

    // Keep child connection entering from top. If visually reversed, flip anchors.
    if (t.y >= s.y) {
      return { ...e, sourceHandle: 'source-bottom', targetHandle: 'target-top' };
    }
    return { ...e, sourceHandle: 'source-top', targetHandle: 'target-bottom' };
  });
}

type Side = 'top' | 'right' | 'bottom' | 'left';

function extractSide(handle: string | null | undefined, fallback: Side): Side {
  if (!handle) return fallback;
  if (handle.endsWith('top')) return 'top';
  if (handle.endsWith('right')) return 'right';
  if (handle.endsWith('bottom')) return 'bottom';
  if (handle.endsWith('left')) return 'left';
  return fallback;
}

function buildHandle(end: 'source' | 'target', side: Side): string {
  return `${end}-${side}`;
}

function sidePriority(side: Side): Side[] {
  switch (side) {
    case 'top': return ['top', 'right', 'left', 'bottom'];
    case 'right': return ['right', 'bottom', 'top', 'left'];
    case 'bottom': return ['bottom', 'right', 'left', 'top'];
    case 'left': return ['left', 'bottom', 'top', 'right'];
    default: return ['right', 'bottom', 'top', 'left'];
  }
}

function distributeNodeHandles(
  edges: Edge[],
  dir: 'TB' | 'LR',
  end: 'source' | 'target'
): Edge[] {
  const key = end === 'source' ? 'source' : 'target';
  const fallback: Side = end === 'source'
    ? (dir === 'TB' ? 'bottom' : 'right')
    : (dir === 'TB' ? 'top' : 'left');

  const grouped = new Map<string, Edge[]>();
  for (const e of edges) {
    const nodeId = e[key] as string;
    const arr = grouped.get(nodeId) ?? [];
    arr.push(e);
    grouped.set(nodeId, arr);
  }

  const result = edges.map((e) => ({ ...e }));
  const indexById = new Map<string, number>();
  result.forEach((e, i) => indexById.set(e.id, i));

  for (const [, nodeEdges] of grouped) {
    if (nodeEdges.length <= 1) continue;

    const preferred = nodeEdges.map((e) => {
      const h = end === 'source' ? e.sourceHandle : e.targetHandle;
      return extractSide(h, fallback);
    });

    const used = new Set<Side>();
    for (let i = 0; i < nodeEdges.length; i++) {
      const e = nodeEdges[i];
      const pref = preferred[i];
      let assigned: Side | null = null;
      for (const s of sidePriority(pref)) {
        if (!used.has(s)) {
          assigned = s;
          used.add(s);
          break;
        }
      }
      if (!assigned) assigned = pref;

      const idx = indexById.get(e.id);
      if (idx == null) continue;
      if (end === 'source') result[idx].sourceHandle = buildHandle('source', assigned);
      else result[idx].targetHandle = buildHandle('target', assigned);
    }
  }

  return result;
}

function withVerticalPreferredAnchors(es: Edge[], ns: Node[]): Edge[] {
  return es.map((e) => {
    const src = ns.find((n) => n.id === e.source);
    const tgt = ns.find((n) => n.id === e.target);
    if (!src || !tgt) return e;

    const s = getNodeCenter(src);
    const t = getNodeCenter(tgt);
    const dx = t.x - s.x;
    const dy = t.y - s.y;

    // Vertical flow preference: top/bottom anchors for mostly vertical relationships.
    // If relation is strongly lateral, fall back to closest handles.
    if (Math.abs(dy) >= Math.abs(dx)) {
      if (dy >= 0) return { ...e, sourceHandle: 'source-bottom', targetHandle: 'target-top' };
      const loopbackSide: Side = s.x >= t.x ? 'right' : 'left';
      return {
        ...e,
        sourceHandle: buildHandle('source', loopbackSide),
        targetHandle: buildHandle('target', loopbackSide),
        type: 'step',
      };
    }

    const closest = closestHandlesForPair(src, tgt);
    return { ...e, sourceHandle: closest.sourceHandle, targetHandle: closest.targetHandle };
  });
}

function withTreeDecisionAnchors(es: Edge[], ns: Node[]): Edge[] {
  const result = es.map((e) => ({ ...e }));
  const indexById = new Map<string, number>();
  result.forEach((e, i) => indexById.set(e.id, i));
  const centers = new Map(ns.map((n) => [n.id, getNodeCenter(n)]));

  const hasUpwardIncoming = new Set<string>();
  for (const edge of result) {
    const sourceCenter = centers.get(edge.source);
    const targetCenter = centers.get(edge.target);
    if (!sourceCenter || !targetCenter) continue;
    if (sourceCenter.y > targetCenter.y + 4) hasUpwardIncoming.add(edge.target);
  }

  const childSidesForCount = (sourceId: string, count: number): Side[] => {
    if (count <= 1) return ['bottom'];
    if (count === 2) {
      return hasUpwardIncoming.has(sourceId) ? ['left', 'bottom'] : ['left', 'right'];
    }
    if (count === 3) return ['left', 'bottom', 'right'];
    return ['left', 'bottom', 'right', ...Array.from({ length: count - 3 }, (): Side => 'bottom')];
  };

  const grouped = new Map<string, Edge[]>();
  for (const edge of result) {
    const sourceCenter = centers.get(edge.source);
    const targetCenter = centers.get(edge.target);
    if (!sourceCenter || !targetCenter) continue;
    if (targetCenter.y <= sourceCenter.y + 4) continue;
    const bucket = grouped.get(edge.source) ?? [];
    bucket.push(edge);
    grouped.set(edge.source, bucket);
  }

  for (const [, group] of grouped) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((left, right) => {
      const leftCenter = centers.get(left.target);
      const rightCenter = centers.get(right.target);
      return (leftCenter?.x ?? 0) - (rightCenter?.x ?? 0);
    });
    const sourceId = ordered[0]?.source ?? '';
    const sides = childSidesForCount(sourceId, ordered.length);

    ordered.forEach((edge, index) => {
      const edgeIndex = indexById.get(edge.id);
      if (edgeIndex == null) return;
      const side = sides[index] ?? 'bottom';
      result[edgeIndex] = {
        ...result[edgeIndex],
        sourceHandle: buildHandle('source', side),
        targetHandle: 'target-top',
        type: 'step',
      };
    });
  }

  return result;
}

function applyAnchors(es: Edge[], ns: Node[], dir: 'TB' | 'LR', treeMode = false): Edge[] {
  const base = dir === 'LR' ? withClosestAnchors(es, ns) : withVerticalPreferredAnchors(es, ns);
  if (dir === 'LR') return base;
  const spreadSource = distributeNodeHandles(base, dir, 'source');
  const spreadTarget = distributeNodeHandles(spreadSource, dir, 'target');
  if (!treeMode) return spreadTarget;
  return withTreeDecisionAnchors(spreadTarget, ns);
}

function withEdgeLabelStyles(es: Edge[], ns: Node[]): Edge[] {
  return es.map((e) => {
    const src = ns.find((n) => n.id === e.source);
    const tgt = ns.find((n) => n.id === e.target);
    if (!src || !tgt) return { ...e, label: e.label ?? '' };

    const labelText = String(e.label ?? '');

    return {
      ...e,
      label: labelText,
      labelShowBg: labelText.length > 0,
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 6,
      labelBgStyle: {
        fill: '#ffffff',
        fillOpacity: 0.92,
      },
      labelStyle: {
        ...(e.labelStyle ?? {}),
        fontSize: 12,
        fontWeight: 600,
        fill: '#334155',
        whiteSpace: 'nowrap',
      },
    };
  });
}

// ─── Default example ─────────────────────────────────────────────────────────

const DEFAULT_TEXT = `User
  ↓
User Interface
  ↓
Authentication Module
  ↓
Authorization Module (RBAC)
  ↓
Cryptographic Engine
  ↓
Secure Database
  ↓
Logging & Monitoring System`;

// ─── Convert internal model → React Flow nodes/edges ─────────────────────────

function modelToFlow(
  model: GraphModel,
  dir: 'TB' | 'LR',
  edgeTip: EdgeTipStyle
): { nodes: Node[]; edges: Edge[] } {
  const isAscii = String(model.metadata?.inputFormat ?? '') === 'ascii';
  const isTree = String(model.metadata?.inputFormat ?? '') === 'tree';

  const asciiCols = isAscii
    ? model.nodes
      .map((n) => Number((n.metadata as any)?.asciiCol))
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b)
    : [];
  const asciiRows = isAscii
    ? model.nodes
      .map((n) => Number((n.metadata as any)?.asciiRow))
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b)
    : [];

  const minPositiveDelta = (vals: number[]) => {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 1; i < vals.length; i++) {
      const d = vals[i] - vals[i - 1];
      if (d > 0 && d < best) best = d;
    }
    return Number.isFinite(best) ? best : 1;
  };

  const minColDelta = minPositiveDelta(asciiCols);
  const minRowDelta = minPositiveDelta(asciiRows);

  // Adaptive spacing: keep ASCII structure, but avoid compact overlap.
  const colScale = isAscii
    ? Math.max(28, Math.min(72, (180 + 42) / Math.max(1, minColDelta)))
    : 0;
  const rowScale = isAscii
    ? Math.max(48, Math.min(110, (72 + 44) / Math.max(1, minRowDelta)))
    : 0;

  const asciiMinCol = asciiCols.length ? asciiCols[0] : 0;
  const asciiMinRow = asciiRows.length ? asciiRows[0] : 0;
  const asciiMaxCol = asciiCols.length ? asciiCols[asciiCols.length - 1] : 0;
  const uniqueAsciiCols = Array.from(new Set(asciiCols));
  const colRankByValue = new Map<number, number>();
  uniqueAsciiCols.forEach((c, i) => colRankByValue.set(c, i));
  const shouldCompressAsciiCols = isAscii && uniqueAsciiCols.length >= 4 && (asciiMaxCol - asciiMinCol) > 26;
  const compactColStep = 230;

  const rfNodes: Node[] = model.nodes.map((n) => ({
    id:       n.id,
    type:     'custom',
    data:     { id: n.id, label: n.label, nodeType: n.type },
    position: isAscii
      ? {
          x: shouldCompressAsciiCols
            ? Math.round((colRankByValue.get(Number((n.metadata as any)?.asciiCol ?? 0)) ?? 0) * compactColStep + 60)
            : Math.round((Number((n.metadata as any)?.asciiCol ?? 0) - asciiMinCol) * colScale + 60),
          y: Math.round((Number((n.metadata as any)?.asciiRow ?? 0) - asciiMinRow) * rowScale + 60),
        }
      : { x: 0, y: 0 },
  }));

  const rfEdges: Edge[] = model.edges.map((e) => ({
    id:        e.id,
    source:    e.source,
    target:    e.target,
    label:     e.label ?? '',
    type:      'straight',
    markerEnd: markerForTip(e.hasArrow == null ? edgeTip : (e.hasArrow ? 'arrow' : 'none')),
    interactionWidth: 30,
    style:     { stroke: '#64748b', strokeWidth: 2 },
  }));

  if (isAscii) {
    const anchoredAscii = applyAnchors(rfEdges, rfNodes, 'LR', false);
    const routedAscii = anchoredAscii.map((edge) => {
      const src = rfNodes.find((n) => n.id === edge.source);
      const tgt = rfNodes.find((n) => n.id === edge.target);
      if (!src || !tgt) return edge;

      const s = getNodeCenter(src);
      const t = getNodeCenter(tgt);
      const isBackward = t.x < s.x - 8;
      const isBent = Math.abs(t.y - s.y) > 20;
      if (isBackward || isBent) {
        const dx = t.x - s.x;
        const prefersSide = Math.abs(dx) > 36;

        if (prefersSide) {
          const sourceSide = dx >= 0 ? 'source-right' : 'source-left';
          const targetSide = dx >= 0 ? 'target-left' : 'target-right';
          return {
            ...edge,
            type: 'step',
            sourceHandle: sourceSide,
            targetHandle: targetSide,
          };
        }

        // Keep loop/return edges off the same side as primary LR flow.
        if (t.y >= s.y + 8) {
          return {
            ...edge,
            type: 'step',
            sourceHandle: 'source-bottom',
            targetHandle: 'target-top',
          };
        }
        if (t.y <= s.y - 8) {
          return {
            ...edge,
            type: 'step',
            sourceHandle: 'source-top',
            targetHandle: 'target-bottom',
          };
        }
        return {
          ...edge,
          type: 'step',
          sourceHandle: isBackward ? 'source-left' : edge.sourceHandle,
          targetHandle: isBackward ? 'target-right' : edge.targetHandle,
        };
      }
      return edge;
    });

    return { nodes: rfNodes, edges: withEdgeLabelStyles(routedAscii, rfNodes) };
  }

  const layouted = getLayoutedElements(rfNodes, rfEdges, dir);
  const anchored = applyAnchors(layouted.edges, layouted.nodes, dir, isTree);
  return { nodes: layouted.nodes, edges: withEdgeLabelStyles(anchored, layouted.nodes) };
}

// ─── App Inner (inside ReactFlowProvider) ─────────────────────────────────────

function AppInner() {
  const [inputText,   setInputText]   = useState(DEFAULT_TEXT);
  const [graphModel,  setGraphModel]  = useState<GraphModel | null>(null);
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [selectedId,      setSelectedId]      = useState<string | null>(null);
  const [selectedEdgeId,  setSelectedEdgeId]  = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('TB');
  const [showExport,      setShowExport]      = useState(false);
  const [edgeTip,         setEdgeTip]         = useState<EdgeTipStyle>('arrow');
  const [bulkNodeType,    setBulkNodeType]    = useState<NodeType>('process');
  const [instance,        setInstance]        = useState<ReactFlowInstance | null>(null);

  // Simple undo/redo state stack
  const [history,    setHistory]    = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const canvasRef = useRef<DiagramCanvasHandle>(null);
  const dragAxisRef = useRef<Map<string, { startX: number; startY: number; axis: 'x' | 'y' | null }>>(new Map());

  // ── Parse ─────────────────────────────────────────────────────────────────
  const handleParse = useCallback(() => {
    const model = parseText(inputText);
    setGraphModel(model);
    const { nodes: ln, edges: le } = modelToFlow(model, layoutDirection, edgeTip);
    setNodes(ln);
    setEdges(withEdgeLabelStyles(le, ln));
    // Reset history
    setHistory([{ nodes: ln, edges: le }]);
    setHistoryIdx(0);
    setTimeout(() => canvasRef.current?.fitView(), 60);
  }, [inputText, layoutDirection, edgeTip, setNodes, setEdges]);

  // Auto-parse on first mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { handleParse(); }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if ((e.ctrlKey || e.metaKey) && (key === 'y' || (e.shiftKey && key === 'z'))) {
        e.preventDefault(); handleRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // ── History helpers ───────────────────────────────────────────────────────
  const pushHistory = useCallback((ns: Node[], es: Edge[]) => {
    setHistory((prev) => {
      const next = prev.slice(0, historyIdx + 1);
      next.push({ nodes: ns, edges: es });
      if (next.length > 50) next.shift();
      return next;
    });
    setHistoryIdx((prev) => Math.min(prev + 1, 49));
  }, [historyIdx]);

  const handleUndo = useCallback(() => {
    if (historyIdx > 0) {
      const { nodes: ns, edges: es } = history[historyIdx - 1];
      setNodes(ns); setEdges(es);
      setHistoryIdx((prev) => prev - 1);
    }
  }, [history, historyIdx, setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    if (historyIdx < history.length - 1) {
      const { nodes: ns, edges: es } = history[historyIdx + 1];
      setNodes(ns); setEdges(es);
      setHistoryIdx((prev) => prev + 1);
    }
  }, [history, historyIdx, setNodes, setEdges]);

  // ── Connect ───────────────────────────────────────────────────────────────
  const handleConnect = useCallback((conn: Connection) => {
    setEdges((prev) => {
      const next = addEdge(
        {
          ...conn,
          type:      'straight',
          markerStart: markerForTip('none'),
          markerEnd: markerForTip('arrow'),
          label: '',
          interactionWidth: 30,
          style:     { stroke: '#64748b', strokeWidth: 2 },
        },
        prev
      );
      const styled = withEdgeLabelStyles(next, nodes);
      pushHistory(nodes, styled);
      return styled;
    });
  }, [nodes, setEdges, pushHistory]);

  const onNodesChange = useCallback((changes: any) => {
    onNodesChangeBase(changes);
    const shouldSnapshot = Array.isArray(changes) && changes.some((c) =>
      c?.type === 'add' ||
      c?.type === 'remove' ||
      (c?.type === 'position' && c?.dragging === false)
    );
    if (!shouldSnapshot) return;
    setTimeout(() => {
      const ns = instance?.getNodes() ?? nodes;
      const es = instance?.getEdges() ?? edges;
      pushHistory(ns, es);
    }, 0);
  }, [onNodesChangeBase, instance, nodes, edges, pushHistory]);

  const onEdgesChangeTracked = useCallback((changes: any) => {
    onEdgesChange(changes);
    const shouldSnapshot = Array.isArray(changes) && changes.some((c) =>
      c?.type === 'add' || c?.type === 'remove' || c?.type === 'replace'
    );
    if (!shouldSnapshot) return;
    setTimeout(() => {
      const ns = instance?.getNodes() ?? nodes;
      const es = instance?.getEdges() ?? edges;
      pushHistory(ns, es);
    }, 0);
  }, [onEdgesChange, instance, nodes, edges, pushHistory]);

  const handleNodeDragStart = useCallback((_e: React.MouseEvent, node: Node) => {
    dragAxisRef.current.set(node.id, { startX: node.position.x, startY: node.position.y, axis: null });
  }, []);

  const handleNodeDrag = useCallback((e: React.MouseEvent, node: Node) => {
    if (!e.ctrlKey) return;
    const state = dragAxisRef.current.get(node.id);
    if (!state) return;

    const dx = node.position.x - state.startX;
    const dy = node.position.y - state.startY;
    if (!state.axis) state.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';

    setNodes((prev) => prev.map((n) => {
      if (n.id !== node.id) return n;
      return state.axis === 'x'
        ? { ...n, position: { x: node.position.x, y: state.startY } }
        : { ...n, position: { x: state.startX, y: node.position.y } };
    }));
  }, [setNodes]);

  const handleNodeDragStop = useCallback((_e: React.MouseEvent, node: Node) => {
    dragAxisRef.current.delete(node.id);
  }, []);

  const handleNodeDragSnap = useCallback((_e: React.MouseEvent, node: Node) => {
    const self = nodes.find((n) => n.id === node.id);
    if (!self) return;

    const { height } = getNodeSize(self);
    const selfMid = node.position.y + height / 2;
    const threshold = 8;

    let snappedY: number | null = null;
    let best = Number.POSITIVE_INFINITY;

    for (const other of nodes) {
      if (other.id === node.id) continue;
      const { height: oh } = getNodeSize(other);
      const otherMid = other.position.y + oh / 2;

      const dMid = Math.abs(otherMid - selfMid);
      if (dMid < threshold && dMid < best) {
        best = dMid;
        snappedY = otherMid - height / 2;
      }
    }

    if (snappedY == null) return;
    setNodes((prev) => prev.map((n) => n.id === node.id
      ? { ...n, position: { x: node.position.x, y: Math.round(snappedY!) } }
      : n
    ));
  }, [nodes, setNodes]);

  const handleSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelectedNodeIds((params.nodes ?? []).map((n) => n.id));
  }, []);

  // ── Layout ────────────────────────────────────────────────────────────────
  const handleLayoutChange = useCallback((dir: 'TB' | 'LR') => {
    setLayoutDirection(dir);
    const { nodes: ln, edges: le } = getLayoutedElements(nodes, edges, dir);
    const straight = le.map((e) => ({ ...e, type: 'straight' as const }));
    const anchored = applyAnchors(straight, ln, dir);
    const styled = withEdgeLabelStyles(anchored, ln);
    setNodes(ln); setEdges(styled);
    pushHistory(ln, styled);
    setTimeout(() => canvasRef.current?.fitView(), 60);
  }, [nodes, edges, setNodes, setEdges, pushHistory]);

  // ── Node editing ──────────────────────────────────────────────────────────
  const handleLabelChange = useCallback((id: string, label: string) => {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, data: { ...n.data, label } } : n));
  }, [setNodes]);

  const handleTypeChange = useCallback((id: string, nodeType: NodeType) => {
    setNodes((prev) =>
      prev.map((n) => n.id === id ? { ...n, data: { ...n.data, nodeType } } : n)
    );
  }, [setNodes]);

  const handleBulkNodeTypeApply = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    setNodes((prev) => prev.map((n) => selectedNodeIds.includes(n.id)
      ? { ...n, data: { ...n.data, nodeType: bulkNodeType } }
      : n
    ));
  }, [selectedNodeIds, bulkNodeType, setNodes]);

  const handleAlignSelectedTop = useCallback(() => {
    // Deprecated in favor of center alignment.
  }, [selectedNodeIds, nodes, setNodes]);

  const handleAlignSelectedMiddle = useCallback(() => {
    if (selectedNodeIds.length < 2) return;
    const selected = nodes.filter((n) => selectedNodeIds.includes(n.id));
    if (selected.length < 2) return;

    const centerAvg = selected
      .map((n) => n.position.y + getNodeSize(n).height / 2)
      .reduce((a, b) => a + b, 0) / selected.length;

    setNodes((prev) => prev.map((n) => {
      if (!selectedNodeIds.includes(n.id)) return n;
      const h = getNodeSize(n).height;
      return { ...n, position: { ...n.position, y: Math.round(centerAvg - h / 2) } };
    }));
  }, [selectedNodeIds, nodes, setNodes]);

  const handlePositionChange = useCallback((id: string, x: number, y: number) => {
    setNodes((prev) => prev.map((n) => n.id === id
      ? { ...n, position: { x: Math.round(x), y: Math.round(y) } }
      : n
    ));
  }, [setNodes]);

  const handleDeleteNode = useCallback((id: string) => {
    setNodes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      setEdges((prevE) => {
        const nextE = prevE.filter((e) => e.source !== id && e.target !== id);
        pushHistory(next, nextE);
        return nextE;
      });
      return next;
    });
    setSelectedId(null);
  }, [setNodes, setEdges, pushHistory]);

  const handleDeleteEdge = useCallback((id: string) => {
    setEdges((prev) => {
      const next = prev.filter((e) => e.id !== id);
      pushHistory(nodes, next);
      return next;
    });
    setSelectedEdgeId(null);
  }, [setEdges, pushHistory, nodes]);

  const handleBoxColorChange = useCallback((id: string, color: string) => {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, data: { ...n.data, boxColor: color } } : n));
  }, [setNodes]);

  const handleShapeChange = useCallback((id: string, shape: 'rounded' | 'square' | 'pill') => {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, data: { ...n.data, nodeShape: shape } } : n));
  }, [setNodes]);

  const handleSizeChange = useCallback((id: string, width: number, height: number) => {
    const w = Math.max(120, Math.min(420, Number.isFinite(width) ? width : 180));
    const h = Math.max(48, Math.min(220, Number.isFinite(height) ? height : 72));
    setNodes((prev) => prev.map((n) => n.id === id
      ? { ...n, data: { ...n.data, boxWidth: w, boxHeight: h } }
      : n
    ));
  }, [setNodes]);

  const handleAddNode = useCallback(() => {
    const id = `node_${Date.now()}`;
    const anchor = nodes.find((n) => n.id === selectedId);
    const position = anchor
      ? { x: anchor.position.x + 220, y: anchor.position.y + 40 }
      : { x: 120 + (nodes.length % 4) * 220, y: 100 + Math.floor(nodes.length / 4) * 150 };

    const nextNode: Node = {
      id,
      type: 'custom',
      position,
      data: {
        id,
        label: `New Node ${nodes.length + 1}`,
        nodeType: 'none',
        boxColor: '#e2e8f0',
        nodeShape: 'rounded',
      },
    };

    setNodes((prev) => {
      const next = [...prev, nextNode];
      pushHistory(next, edges);
      return next;
    });

    setSelectedEdgeId(null);
    setSelectedId(id);
    setTimeout(() => instance?.fitView({ padding: 0.2 }), 60);
  }, [nodes, selectedId, setNodes, pushHistory, edges, instance]);

  const handleEdgeTipChange = useCallback((tip: EdgeTipStyle) => {
    setEdgeTip(tip);
    setEdges((prev) => prev.map((e) => ({ ...e, markerEnd: markerForTip(tip) })));
  }, [setEdges]);

  const handleEdgeEndTipChange = useCallback((id: string, end: 'start' | 'end', tip: EdgeTipStyle) => {
    setEdges((prev) => prev.map((e) => {
      if (e.id !== id) return e;
      return end === 'start'
        ? { ...e, markerStart: markerForTip(tip) }
        : { ...e, markerEnd: markerForTip(tip) };
    }));
  }, [setEdges]);

  const handleReverseEdgeTips = useCallback((id: string) => {
    setEdges((prev) => prev.map((e) => {
      if (e.id !== id) return e;
      return {
        ...e,
        markerStart: e.markerEnd,
        markerEnd: e.markerStart,
      };
    }));
  }, [setEdges]);

  const sideToHandle = (end: 'source' | 'target', side: AnchorSide): string | undefined => {
    if (side === 'auto') return undefined;
    return `${end}-${side}`;
  };

  const handleEdgeAnchorChange = useCallback((id: string, end: 'source' | 'target', side: AnchorSide) => {
    setEdges((prev) => prev.map((e) => {
      if (e.id !== id) return e;
      if (end === 'source') return { ...e, sourceHandle: sideToHandle('source', side) };
      return { ...e, targetHandle: sideToHandle('target', side) };
    }));
  }, [setEdges]);

  const handleEdgeTypeChange = useCallback((id: string, nextType: EdgeLineType) => {
    setEdges((prev) => prev.map((e) => e.id === id ? { ...e, type: nextType } : e));
  }, [setEdges]);

  const handleEdgeLabelChange = useCallback((id: string, label: string) => {
    setEdges((prev) => withEdgeLabelStyles(prev.map((e) => e.id === id ? { ...e, label } : e), nodes));
  }, [setEdges, nodes]);

  useEffect(() => {
    setEdges((prev) => withEdgeLabelStyles(prev, nodes));
  }, [nodes, setEdges]);

  // ── Save / Load ───────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const payload = { version: 1, graphModel, rfNodes: nodes, rfEdges: edges };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'diagram.diagAI.json'; a.click();
    URL.revokeObjectURL(url);
  }, [graphModel, nodes, edges]);

  const handleLoad = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.graphModel) setGraphModel(data.graphModel);
        if (data.rfNodes)    setNodes(data.rfNodes);
        if (data.rfEdges)    setEdges(data.rfEdges);
        setHistory([{ nodes: data.rfNodes ?? [], edges: data.rfEdges ?? [] }]);
        setHistoryIdx(0);
        setTimeout(() => canvasRef.current?.fitView(), 60);
      } catch {
        alert('Invalid .diagAI.json file. Could not load diagram.');
      }
    };
    reader.readAsText(file);
  }, [setNodes, setEdges]);

  // ── Clear ─────────────────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    if (!window.confirm('Clear the diagram? This cannot be undone.')) return;
    setNodes([]); setEdges([]);
    setGraphModel(null); setSelectedId(null);
    setHistory([]); setHistoryIdx(-1);
  }, [setNodes, setEdges]);

  // ── Selected node ─────────────────────────────────────────────────────────
  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;

  return (
    <div className="app">
      <Toolbar
        canUndo={historyIdx > 0}
        canRedo={historyIdx < history.length - 1}
        layoutDirection={layoutDirection}
        edgeTip={edgeTip}
        onEdgeTipChange={handleEdgeTipChange}
        selectedNodeCount={selectedNodeIds.length}
        bulkNodeType={bulkNodeType}
        onBulkNodeTypeChange={setBulkNodeType}
        onApplyBulkNodeType={handleBulkNodeTypeApply}
        onAlignSelectedMiddle={handleAlignSelectedMiddle}
        onAddNode={handleAddNode}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onLayoutChange={handleLayoutChange}
        onFitView={() => canvasRef.current?.fitView()}
        onSave={handleSave}
        onLoad={handleLoad}
        onExport={() => setShowExport(true)}
        onClear={handleClear}
      />

      <div className="main-content">
        <TextInputPanel
          text={inputText}
          onChange={setInputText}
          onParse={handleParse}
        />

        <div className="canvas-area">
          <DiagramCanvas
            ref={canvasRef}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChangeTracked}
            onConnect={handleConnect}
            onNodeSelect={setSelectedId}
            onEdgeSelect={setSelectedEdgeId}
            onSelectionChange={handleSelectionChange}
            onNodeDragStart={handleNodeDragStart}
            onNodeDrag={handleNodeDrag}
            onNodeDragStop={(e, n) => {
              handleNodeDragStop(e, n);
              handleNodeDragSnap(e, n);
            }}
            onInstanceReady={setInstance}
          />
          {showExport && <ExportMenu onClose={() => setShowExport(false)} />}
        </div>

        {selectedEdge ? (
          <EdgeEditor
            edge={selectedEdge}
            onDelete={handleDeleteEdge}
            onTipChange={handleEdgeEndTipChange}
            onReverseTips={handleReverseEdgeTips}
            onTypeChange={handleEdgeTypeChange}
            onAnchorChange={handleEdgeAnchorChange}
            onLabelChange={handleEdgeLabelChange}
          />
        ) : (
          <NodeEditor
            node={selectedNode}
            onLabelChange={handleLabelChange}
            onTypeChange={handleTypeChange}
            onPositionChange={handlePositionChange}
            onBoxColorChange={handleBoxColorChange}
            onShapeChange={handleShapeChange}
            onSizeChange={handleSizeChange}
            onDelete={handleDeleteNode}
          />
        )}
      </div>
    </div>
  );
}

// ─── Root (wraps in ReactFlowProvider) ───────────────────────────────────────

export default function App() {
  return (
    <ReactFlowProvider>
      <AppInner />
    </ReactFlowProvider>
  );
}
