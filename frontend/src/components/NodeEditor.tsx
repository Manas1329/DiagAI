import React from 'react';
import { Node } from 'reactflow';
import { NodeType, NODE_TYPES_LIST, NODE_COLORS } from '../models/graphModel';

interface NodeEditorProps {
  node:           Node | null;
  onLabelChange:  (id: string, label: string) => void;
  onTypeChange:   (id: string, type: NodeType) => void;
  onDelete:       (id: string) => void;
}

const NodeEditor: React.FC<NodeEditorProps> = ({ node, onLabelChange, onTypeChange, onDelete }) => {
  if (!node) {
    return (
      <div className="right-panel">
        <p style={{ color: '#475569', fontSize: 12, lineHeight: 1.6 }}>
          Click a node to edit its label, type, or delete it.
        </p>

        <div style={{ marginTop: 24 }}>
          <p style={{ fontSize: 11, color: '#64748b', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px' }}>
            Node types
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {NODE_TYPES_LIST.map((t) => {
              const c = NODE_COLORS[t];
              return (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 12, height: 12, borderRadius: 3,
                      background: c.bg, border: `2px solid ${c.border}`,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    {c.icon} {t}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const { id, data } = node;
  const nodeType: NodeType = data.nodeType ?? 'process';

  return (
    <div className="right-panel">
      <p style={{ fontWeight: 700, fontSize: 13, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 16 }}>
        Edit Node
      </p>

      {/* Label */}
      <label className="field-label">Label</label>
      <input
        className="field-input"
        value={data.label as string}
        onChange={(e) => onLabelChange(id, e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Node label"
      />

      {/* Type */}
      <label className="field-label" style={{ marginTop: 14 }}>Type</label>
      <select
        className="field-input"
        value={nodeType}
        onChange={(e) => onTypeChange(id, e.target.value as NodeType)}
      >
        {NODE_TYPES_LIST.map((t) => (
          <option key={t} value={t}>
            {NODE_COLORS[t].icon} {t}
          </option>
        ))}
      </select>

      {/* Preview chip */}
      <div
        style={{
          marginTop: 12,
          padding: '6px 12px',
          borderRadius: 8,
          background: NODE_COLORS[nodeType].bg,
          border: `1.5px solid ${NODE_COLORS[nodeType].border}`,
          color: NODE_COLORS[nodeType].text,
          fontSize: 12,
          fontWeight: 600,
          textAlign: 'center',
        }}
      >
        {NODE_COLORS[nodeType].icon} {data.label}
      </div>

      {/* Node ID (read-only info) */}
      <div style={{ marginTop: 16 }}>
        <label className="field-label">ID (read-only)</label>
        <p style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace', wordBreak: 'break-all' }}>{id}</p>
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(id)}
        style={{
          marginTop: 20,
          width: '100%',
          background: 'transparent',
          border: '1.5px solid #f87171',
          color: '#f87171',
          borderRadius: 7,
          padding: '7px 0',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.background = '#450a0a'; }}
        onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.background = 'transparent'; }}
      >
        🗑 Delete Node
      </button>
    </div>
  );
};

export default NodeEditor;
