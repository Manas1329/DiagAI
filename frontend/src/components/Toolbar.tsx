import React, { useRef } from 'react';

interface ToolbarProps {
  canUndo:          boolean;
  canRedo:          boolean;
  layoutDirection:  'TB' | 'LR';
  edgeTip:          'arrow' | 'dot' | 'none';
  onEdgeTipChange:  (tip: 'arrow' | 'dot' | 'none') => void;
  onAddNode:        () => void;
  onUndo:           () => void;
  onRedo:           () => void;
  onLayoutChange:   (dir: 'TB' | 'LR') => void;
  onFitView:        () => void;
  onSave:           () => void;
  onLoad:           (file: File) => void;
  onExport:         () => void;
  onClear:          () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  canUndo, canRedo, layoutDirection, edgeTip, onEdgeTipChange, onAddNode,
  onUndo, onRedo, onLayoutChange, onFitView,
  onSave, onLoad, onExport, onClear,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoad(file);
      e.target.value = '';
    }
  };

  return (
    <div className="toolbar">
      {/* Brand */}
      <span className="brand">⬡ DiagAI</span>

      <div className="toolbar-sep" />

      {/* Undo / Redo */}
      <button className="btn-tool" disabled={!canUndo} onClick={onUndo} title="Undo (Ctrl+Z)">↩ Undo</button>
      <button className="btn-tool" disabled={!canRedo} onClick={onRedo} title="Redo (Ctrl+Y)">↪ Redo</button>

      <div className="toolbar-sep" />

      {/* Layout toggle */}
      <span style={{ fontSize: 11, color: '#64748b', marginRight: 4 }}>Layout:</span>
      <button
        className={`btn-tool ${layoutDirection === 'TB' ? 'active' : ''}`}
        onClick={() => onLayoutChange('TB')}
        title="Top → Bottom"
      >
        ↕ TB
      </button>
      <button
        className={`btn-tool ${layoutDirection === 'LR' ? 'active' : ''}`}
        onClick={() => onLayoutChange('LR')}
        title="Left → Right"
      >
        ↔ LR
      </button>

      <div className="toolbar-sep" />

      {/* Fit view */}
      <button className="btn-tool" onClick={onFitView} title="Fit diagram to window">⊞ Fit</button>
      <button className="btn-tool" onClick={onAddNode} title="Add a new node to current diagram">＋ Node</button>
      <select
        className="btn-tool"
        value={edgeTip}
        onChange={(e) => onEdgeTipChange(e.target.value as 'arrow' | 'dot' | 'none')}
        title="Edge tip style"
        style={{ minWidth: 110 }}
      >
        <option value="arrow">Tip: Arrow</option>
        <option value="dot">Tip: Dot</option>
        <option value="none">Tip: None</option>
      </select>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Save / Load / Export */}
      <button className="btn-tool" onClick={onSave} title="Save diagram as JSON">💾 Save</button>
      <button className="btn-tool" onClick={() => fileRef.current?.click()} title="Load diagram from JSON">
        📂 Load
      </button>
      <button className="btn-primary" onClick={onExport} title="Export PNG / SVG / PDF">
        ⬇ Export
      </button>
      <button
        className="btn-tool"
        onClick={onClear}
        title="Clear diagram"
        style={{ color: '#f87171' }}
      >
        ✕ Clear
      </button>

      <input
        ref={fileRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
};

export default Toolbar;
