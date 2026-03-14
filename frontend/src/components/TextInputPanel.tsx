import React, { useRef } from 'react';
import { detectFormat } from '../parser/textParser';

const EXAMPLE_TEXT = `User
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

const FORMAT_HINTS = [
  { label: 'Vertical ↓',   sample: 'NodeA\n  ↓\nNodeB\n  ↓\nNodeC' },
  { label: 'Inline →',     sample: 'NodeA -> NodeB -> NodeC' },
  { label: 'Mermaid',      sample: 'flowchart TD\n  A[Node A] --> B[Node B]' },
  { label: 'Bullets',      sample: '- Root\n  - Child A\n  - Child B' },
];

interface TextInputPanelProps {
  text:     string;
  onChange: (text: string) => void;
  onParse:  () => void;
}

const TextInputPanel: React.FC<TextInputPanelProps> = ({ text, onChange, onParse }) => {
  const detected = detectFormat(text);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onParse();
  };

  const loadExample = () => onChange(EXAMPLE_TEXT);

  const insertHint = (sample: string) => onChange(sample);

  return (
    <div className="left-panel">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          Input
        </span>
        <button
          className="btn-ghost"
          onClick={loadExample}
          title="Load example diagram"
          style={{ fontSize: 11 }}
        >
          Load Example
        </button>
      </div>

      {/* Detected format badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>Detected format:</span>
        <span
          style={{
            fontSize: 11, fontWeight: 600,
            background: '#312e81', color: '#a5b4fc',
            padding: '2px 8px', borderRadius: 99,
          }}
        >
          {detected}
        </span>
      </div>

      {/* Textarea */}
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        placeholder="Paste or type your diagram text here…"
        style={{
          flex: 1,
          minHeight: 200,
          resize: 'vertical',
          background:  '#0f172a',
          color:       '#e2e8f0',
          border:      '1px solid #334155',
          borderRadius: 8,
          padding:     '12px',
          fontFamily:  "'Fira Code', 'Consolas', monospace",
          fontSize:    12,
          lineHeight:  1.6,
          outline:     'none',
        }}
      />

      {/* Parse button */}
      <button className="btn-primary" onClick={onParse} style={{ width: '100%' }}>
        ✦ Generate Diagram  <kbd style={{ opacity: 0.6, fontSize: 10 }}>Ctrl + Enter</kbd>
      </button>

      {/* Format quick-insert */}
      <div>
        <p style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>Quick insert format:</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {FORMAT_HINTS.map((h) => (
            <button
              key={h.label}
              className="btn-ghost"
              onClick={() => insertHint(h.sample)}
              style={{ fontSize: 11, padding: '3px 10px' }}
              title={h.sample}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hidden file input for loading diagrams */}
      <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} />
    </div>
  );
};

export default TextInputPanel;
