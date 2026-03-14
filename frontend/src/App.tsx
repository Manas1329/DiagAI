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

function markerForTip(tip: EdgeTipStyle) {
  if (tip === 'none') return undefined;
  return { type: MarkerType.ArrowClosed, color: '#64748b', width: 18, height: 18 };
}

function getNodeCenter(node: Node) {
  const w = Number((node.data?.boxWidth as number) ?? node.width ?? 180);
  const h = Number((node.data?.boxHeight as number) ?? node.height ?? 72);
  return { x: node.position.x + w / 2, y: node.position.y + h / 2 };
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
  const rfNodes: Node[] = model.nodes.map((n) => ({
    id:       n.id,
    type:     'custom',
    data:     { id: n.id, label: n.label, nodeType: n.type },
    position: { x: 0, y: 0 },
  }));

  const rfEdges: Edge[] = model.edges.map((e) => ({
    id:        e.id,
    source:    e.source,
    target:    e.target,
    label:     e.label ?? '',
    type:      'smoothstep',
    markerEnd: markerForTip(edgeTip),
    interactionWidth: 30,
    style:     { stroke: '#64748b', strokeWidth: 2 },
  }));

  const layouted = getLayoutedElements(rfNodes, rfEdges, dir);
  return { nodes: layouted.nodes, edges: withEdgeLabelStyles(layouted.edges, layouted.nodes) };
}

// ─── App Inner (inside ReactFlowProvider) ─────────────────────────────────────

function AppInner() {
  const [inputText,   setInputText]   = useState(DEFAULT_TEXT);
  const [graphModel,  setGraphModel]  = useState<GraphModel | null>(null);
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [selectedId,      setSelectedId]      = useState<string | null>(null);
  const [selectedEdgeId,  setSelectedEdgeId]  = useState<string | null>(null);
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('TB');
  const [showExport,      setShowExport]      = useState(false);
  const [edgeTip,         setEdgeTip]         = useState<EdgeTipStyle>('arrow');
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
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
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
          type:      'smoothstep',
          markerStart: undefined,
          markerEnd: markerForTip(edgeTip),
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
  }, [nodes, setEdges, pushHistory, edgeTip]);

  const onNodesChange = useCallback((changes: any) => {
    onNodesChangeBase(changes);
  }, [onNodesChangeBase]);

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

  // ── Layout ────────────────────────────────────────────────────────────────
  const handleLayoutChange = useCallback((dir: 'TB' | 'LR') => {
    setLayoutDirection(dir);
    const { nodes: ln, edges: le } = getLayoutedElements(nodes, edges, dir);
    setNodes(ln); setEdges(le);
    pushHistory(ln, le);
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
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onNodeSelect={setSelectedId}
            onEdgeSelect={setSelectedEdgeId}
            onNodeDragStart={handleNodeDragStart}
            onNodeDrag={handleNodeDrag}
            onNodeDragStop={handleNodeDragStop}
            onInstanceReady={setInstance}
          />
          {showExport && <ExportMenu onClose={() => setShowExport(false)} />}
        </div>

        {selectedEdge ? (
          <EdgeEditor
            edge={selectedEdge}
            onDelete={handleDeleteEdge}
            onTipChange={handleEdgeEndTipChange}
            onTypeChange={handleEdgeTypeChange}
            onAnchorChange={handleEdgeAnchorChange}
            onLabelChange={handleEdgeLabelChange}
          />
        ) : (
          <NodeEditor
            node={selectedNode}
            onLabelChange={handleLabelChange}
            onTypeChange={handleTypeChange}
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
