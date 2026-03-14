import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  addEdge,
  MarkerType,
  ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import CustomNode from './CustomNode';

const nodeTypes = { custom: CustomNode };

export interface DiagramCanvasHandle {
  fitView: () => void;
}

interface DiagramCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange:  (changes: NodeChange[]) => void;
  onEdgesChange:  (changes: EdgeChange[]) => void;
  onConnect:      (conn: Connection) => void;
  onNodeSelect:   (id: string | null) => void;
  onInstanceReady?: (instance: ReactFlowInstance) => void;
}

const DiagramCanvas = forwardRef<DiagramCanvasHandle, DiagramCanvasProps>(
  ({ nodes, edges, onNodesChange, onEdgesChange, onConnect, onNodeSelect, onInstanceReady }, ref) => {
    const instanceRef = useRef<ReactFlowInstance | null>(null);

    useImperativeHandle(ref, () => ({
      fitView: () => instanceRef.current?.fitView({ padding: 0.2 }),
    }));

    return (
      <div style={{ width: '100%', height: '100%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={(conn) => {
            onConnect(conn);
          }}
          onNodeClick={(_e, node) => onNodeSelect(node.id)}
          onPaneClick={() => onNodeSelect(null)}
          nodeTypes={nodeTypes}
          onInit={(instance) => {
            instanceRef.current = instance;
            onInstanceReady?.(instance);
          }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          deleteKeyCode="Delete"
          defaultEdgeOptions={{
            type:      'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
            style:     { stroke: '#64748b', strokeWidth: 2 },
            animated:  false,
          }}
          connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2 }}
        >
          <Background color="#cbd5e1" gap={18} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(n) => {
              const palette: Record<string, string> = {
                none: '#94a3b8',
                actor: '#3b82f6', process: '#22c55e', decision: '#eab308',
                database: '#06b6d4', api: '#f97316', security: '#ec4899',
                observability: '#8b5cf6', service: '#0284c7',
              };
              return palette[n.data?.nodeType as string] ?? '#94a3b8';
            }}
            maskColor="rgba(241,245,249,0.6)"
            style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}
          />
        </ReactFlow>
      </div>
    );
  }
);

DiagramCanvas.displayName = 'DiagramCanvas';
export default DiagramCanvas;
