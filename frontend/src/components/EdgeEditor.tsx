import React from 'react';
import { Edge, MarkerType } from 'reactflow';

type TipStyle = 'arrow' | 'none';
type AnchorSide = 'auto' | 'top' | 'right' | 'bottom' | 'left';

type EdgeLineType = 'smoothstep' | 'straight' | 'step' | 'bezier';

interface EdgeEditorProps {
  edge: Edge | null;
  onDelete: (id: string) => void;
  onTipChange: (id: string, end: 'start' | 'end', tip: TipStyle) => void;
  onTypeChange: (id: string, edgeType: EdgeLineType) => void;
  onAnchorChange: (id: string, end: 'source' | 'target', side: AnchorSide) => void;
  onLabelChange: (id: string, label: string) => void;
}

function markerToTip(marker: Edge['markerStart'] | Edge['markerEnd']): TipStyle {
  if (!marker) return 'none';
  if (typeof marker === 'string') return marker === 'arrowclosed' ? 'arrow' : 'none';
  if (marker.type !== MarkerType.ArrowClosed) return 'arrow';
  return 'arrow';
}

function handleToSide(handleId: string | null | undefined, end: 'source' | 'target'): AnchorSide {
  if (!handleId) return 'auto';
  const prefix = `${end}-`;
  if (handleId.startsWith(prefix)) {
    const side = handleId.slice(prefix.length);
    if (side === 'top' || side === 'right' || side === 'bottom' || side === 'left') return side;
  }
  return 'auto';
}

const EdgeEditor: React.FC<EdgeEditorProps> = ({ edge, onDelete, onTipChange, onTypeChange, onAnchorChange, onLabelChange }) => {
  if (!edge) {
    return (
      <div className="right-panel">
        <p style={{ color: '#475569', fontSize: 12, lineHeight: 1.6 }}>
          Click a node or connecting line to edit it.
        </p>
      </div>
    );
  }

  const startTip = markerToTip(edge.markerStart);
  const endTip = markerToTip(edge.markerEnd);
  const edgeType = (edge.type as EdgeLineType) ?? 'smoothstep';
  const sourceSide = handleToSide(edge.sourceHandle, 'source');
  const targetSide = handleToSide(edge.targetHandle, 'target');

  return (
    <div className="right-panel">
      <p style={{ fontWeight: 700, fontSize: 13, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 16 }}>
        Edit Connection
      </p>

      <label className="field-label">Line Type</label>
      <select
        className="field-input"
        value={edgeType}
        onChange={(e) => onTypeChange(edge.id, e.target.value as EdgeLineType)}
      >
        <option value="smoothstep">Smooth</option>
        <option value="step">Step</option>
        <option value="straight">Straight</option>
        <option value="bezier">Bezier</option>
      </select>

      <label className="field-label" style={{ marginTop: 14 }}>Label (optional)</label>
      <input
        className="field-input"
        value={String(edge.label ?? '')}
        placeholder="Leave blank for none"
        onChange={(e) => onLabelChange(edge.id, e.target.value)}
      />

      <label className="field-label" style={{ marginTop: 14 }}>Start Tip</label>
      <select
        className="field-input"
        value={startTip}
        onChange={(e) => onTipChange(edge.id, 'start', e.target.value as TipStyle)}
      >
        <option value="arrow">Arrow</option>
        <option value="none">None</option>
      </select>

      <label className="field-label" style={{ marginTop: 14 }}>End Tip</label>
      <select
        className="field-input"
        value={endTip}
        onChange={(e) => onTipChange(edge.id, 'end', e.target.value as TipStyle)}
      >
        <option value="arrow">Arrow</option>
        <option value="none">None</option>
      </select>

      <label className="field-label" style={{ marginTop: 14 }}>Source Anchor</label>
      <select
        className="field-input"
        value={sourceSide}
        onChange={(e) => onAnchorChange(edge.id, 'source', e.target.value as AnchorSide)}
      >
        <option value="auto">Auto</option>
        <option value="top">Top</option>
        <option value="right">Right</option>
        <option value="bottom">Bottom</option>
        <option value="left">Left</option>
      </select>

      <label className="field-label" style={{ marginTop: 14 }}>Target Anchor</label>
      <select
        className="field-input"
        value={targetSide}
        onChange={(e) => onAnchorChange(edge.id, 'target', e.target.value as AnchorSide)}
      >
        <option value="auto">Auto</option>
        <option value="top">Top</option>
        <option value="right">Right</option>
        <option value="bottom">Bottom</option>
        <option value="left">Left</option>
      </select>

      <div style={{ marginTop: 16 }}>
        <label className="field-label">Edge ID (read-only)</label>
        <p style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace', wordBreak: 'break-all' }}>{edge.id}</p>
      </div>

      <button
        onClick={() => onDelete(edge.id)}
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
      >
        Delete Connection
      </button>
    </div>
  );
};

export default EdgeEditor;
