import React, { useState } from 'react';
import { useReactFlow } from 'reactflow';
import { exportPng, exportSvg, exportPdf } from '../utils/exportUtils';

interface ExportMenuProps {
  onClose: () => void;
}

const ExportMenu: React.FC<ExportMenuProps> = ({ onClose }) => {
  const { getNodes } = useReactFlow();
  const [busy, setBusy] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setLastExport(label);
    } catch (err) {
      console.error(err);
      alert('Export failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const options: Array<{ label: string; ext: string; fn: () => Promise<void>; color: string }> = [
    { label: 'PNG Image',    ext: '.png', color: '#22c55e', fn: () => exportPng(getNodes()) },
    { label: 'SVG Vector',   ext: '.svg', color: '#0284c7', fn: () => exportSvg(getNodes()) },
    { label: 'PDF Document', ext: '.pdf', color: '#f43f5e', fn: () => exportPdf(getNodes()) },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 999,
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        style={{
          position:     'fixed',
          top:          '50%',
          left:         '50%',
          transform:    'translate(-50%,-50%)',
          background:   '#1e293b',
          border:       '1px solid #334155',
          borderRadius: 14,
          padding:      '28px 32px',
          width:        340,
          zIndex:       1000,
          boxShadow:    '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 700 }}>Export Diagram</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 18, cursor: 'pointer', padding: 0 }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {options.map((opt) => (
            <button
              key={opt.ext}
              disabled={busy}
              onClick={() => run(opt.label, opt.fn)}
              style={{
                display:       'flex',
                alignItems:    'center',
                justifyContent:'space-between',
                background:    '#0f172a',
                border:        `1.5px solid ${opt.color}44`,
                borderRadius:  9,
                color:         '#e2e8f0',
                padding:       '12px 16px',
                cursor:        busy ? 'not-allowed' : 'pointer',
                opacity:       busy ? 0.6 : 1,
                transition:    'border-color 0.15s, background 0.15s',
                fontSize:      14,
                fontWeight:    600,
              }}
              onMouseEnter={(e) => {
                if (!busy) (e.currentTarget as HTMLButtonElement).style.borderColor = opt.color;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${opt.color}44`;
              }}
            >
              <span>{opt.label}</span>
              <span
                style={{
                  background: opt.color + '22',
                  color: opt.color,
                  borderRadius: 6,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {opt.ext}
              </span>
            </button>
          ))}
        </div>

        {lastExport && !busy && (
          <p style={{ marginTop: 16, fontSize: 12, color: '#4ade80', textAlign: 'center' }}>
            ✔ {lastExport} downloaded successfully
          </p>
        )}

        {busy && (
          <p style={{ marginTop: 16, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
            Generating export…
          </p>
        )}
      </div>
    </>
  );
};

export default ExportMenu;
