import React, { useEffect, useRef, useState } from 'react';
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
  const [isExpanded, setIsExpanded] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onParse();
  };

  const loadExample = () => onChange(EXAMPLE_TEXT);

  const insertHint = (sample: string) => onChange(sample);

  const handleParseAndClose = () => {
    onParse();
    setIsExpanded(false);
  };

  useEffect(() => {
    if (!isExpanded) return;

    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsExpanded(false);
    };

    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isExpanded]);

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

      <button
        className="btn-ghost"
        onClick={() => setIsExpanded(true)}
        style={{ width: '100%' }}
        title="Open a larger editor window"
      >
        Open Extended Input Window
      </button>

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

      {isExpanded && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setIsExpanded(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.75)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(1200px, 96vw)',
              height: 'min(85vh, 900px)',
              background: '#0b1220',
              border: '1px solid #334155',
              borderRadius: 12,
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ color: '#cbd5e1', fontSize: 13, letterSpacing: 0.3 }}>Extended Input Editor</strong>
              <button className="btn-ghost" onClick={() => setIsExpanded(false)}>
                Close
              </button>
            </div>

            <textarea
              autoFocus
              value={text}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  handleParseAndClose();
                }
              }}
              spellCheck={false}
              placeholder="Paste or type your diagram text here…"
              style={{
                flex: 1,
                width: '100%',
                resize: 'none',
                background: '#020617',
                color: '#e2e8f0',
                border: '1px solid #334155',
                borderRadius: 10,
                padding: '14px',
                fontFamily: "'Fira Code', 'Consolas', monospace",
                fontSize: 13,
                lineHeight: 1.65,
                outline: 'none',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ color: '#94a3b8', fontSize: 11 }}>
                Press Esc to close, Ctrl + Enter to generate diagram
              </span>
              <button className="btn-primary" onClick={handleParseAndClose}>
                Generate Diagram
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TextInputPanel;
