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
import ExportMenu      from './components/ExportMenu';

import { parseText }            from './parser/textParser';
import { getLayoutedElements }  from './hooks/useLayout';
import { GraphModel, NodeType } from './models/graphModel';

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
  dir: 'TB' | 'LR'
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
    label:     e.label,
    type:      'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
    style:     { stroke: '#64748b', strokeWidth: 2 },
  }));

  return getLayoutedElements(rfNodes, rfEdges, dir);
}

// ─── App Inner (inside ReactFlowProvider) ─────────────────────────────────────

function AppInner() {
  const [inputText,   setInputText]   = useState(DEFAULT_TEXT);
  const [graphModel,  setGraphModel]  = useState<GraphModel | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [selectedId,      setSelectedId]      = useState<string | null>(null);
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('TB');
  const [showExport,      setShowExport]      = useState(false);

  // Simple undo/redo state stack
  const [history,    setHistory]    = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const canvasRef = useRef<DiagramCanvasHandle>(null);

  // ── Parse ─────────────────────────────────────────────────────────────────
  const handleParse = useCallback(() => {
    const model = parseText(inputText);
    setGraphModel(model);
    const { nodes: ln, edges: le } = modelToFlow(model, layoutDirection);
    setNodes(ln);
    setEdges(le);
    // Reset history
    setHistory([{ nodes: ln, edges: le }]);
    setHistoryIdx(0);
    setTimeout(() => canvasRef.current?.fitView(), 60);
  }, [inputText, layoutDirection, setNodes, setEdges]);

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
          markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
          style:     { stroke: '#64748b', strokeWidth: 2 },
        },
        prev
      );
      pushHistory(nodes, next);
      return next;
    });
  }, [nodes, setEdges, pushHistory]);

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

  return (
    <div className="app">
      <Toolbar
        canUndo={historyIdx > 0}
        canRedo={historyIdx < history.length - 1}
        layoutDirection={layoutDirection}
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
          />
          {showExport && <ExportMenu onClose={() => setShowExport(false)} />}
        </div>

        <NodeEditor
          node={selectedNode}
          onLabelChange={handleLabelChange}
          onTypeChange={handleTypeChange}
          onDelete={handleDeleteNode}
        />
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
