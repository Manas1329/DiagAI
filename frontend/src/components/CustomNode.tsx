import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NodeType, NODE_COLORS } from '../models/graphModel';

export interface CustomNodeData {
  id: string;
  label: string;
  nodeType: NodeType;
  boxColor?: string;
  nodeShape?: 'rounded' | 'square' | 'pill';
  boxWidth?: number;
  boxHeight?: number;
}

const CustomNode: React.FC<NodeProps<CustomNodeData>> = ({ data, selected }) => {
  const colors = NODE_COLORS[data.nodeType] ?? NODE_COLORS.process;
  const isNoneType = data.nodeType === 'none';
  const boxWidth = Number((data.boxWidth as number) ?? 180);
  const boxHeight = Number((data.boxHeight as number) ?? 72);

  const borderRadius = (() => {
    if (!isNoneType) return '10px';
    if (data.nodeShape === 'square') return '2px';
    if (data.nodeShape === 'pill') return '999px';
    return '10px';
  })();

  const nodeBg = isNoneType ? (data.boxColor ?? '#e2e8f0') : colors.bg;

  return (
    <div
      style={{
        background:   nodeBg,
        border:       `2px solid ${selected ? '#6366f1' : colors.border}`,
        color:        colors.text,
        borderRadius,
        width:        `${boxWidth}px`,
        height:       `${boxHeight}px`,
        padding:      '10px 14px',
        boxSizing:    'border-box',
        boxShadow:    selected
          ? '0 0 0 3px rgba(99,102,241,0.35), 0 4px 14px rgba(0,0,0,0.18)'
          : '0 2px 8px rgba(0,0,0,0.10)',
        cursor:       'grab',
        userSelect:   'none',
        fontFamily:   'inherit',
        transition:   'box-shadow 0.15s ease, border-color 0.15s ease',
        position:     'relative',
      }}
    >
      {/* Target handle (top — incoming edges) */}
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        style={{
          background:  colors.border,
          width:        9,
          height:       9,
          border:       '2px solid #fff',
          borderRadius: '50%',
        }}
      />

      {/* Node body */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          height: '100%',
        }}
      >
        {/* Icon + Label row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%' }}>
          {!isNoneType && (
            <span role="img" aria-label={data.nodeType} style={{ fontSize: 16, flexShrink: 0 }}>
              {colors.icon}
            </span>
          )}
          <span
            style={{
              fontSize:   13,
              fontWeight: 600,
              textAlign:  'center',
              lineHeight: 1.35,
              wordBreak:  'break-word',
              maxWidth:   '100%',
            }}
          >
            {data.label}
          </span>
        </div>

        {/* Type badge */}
        {!isNoneType && (
          <span
            style={{
              fontSize:      9,
              fontWeight:    600,
              letterSpacing: '0.9px',
              textTransform: 'uppercase',
              opacity:       0.55,
              marginTop:     2,
            }}
          >
            {data.nodeType}
          </span>
        )}
      </div>

      {/* Source handle (bottom — outgoing edges) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        style={{
          background:  colors.border,
          width:        9,
          height:       9,
          border:       '2px solid #fff',
          borderRadius: '50%',
        }}
      />

      {/* Side handles for LR layouts */}
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        style={{ background: colors.border, width: 8, height: 8, border: '2px solid #fff', opacity: 0.6 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        style={{ background: colors.border, width: 8, height: 8, border: '2px solid #fff', opacity: 0.6 }}
      />

      <Handle
        type="source"
        position={Position.Top}
        id="source-top"
        style={{ background: colors.border, width: 7, height: 7, border: '2px solid #fff', opacity: 0.45 }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="target-bottom"
        style={{ background: colors.border, width: 7, height: 7, border: '2px solid #fff', opacity: 0.45 }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="source-left"
        style={{ background: colors.border, width: 7, height: 7, border: '2px solid #fff', opacity: 0.45 }}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="target-right"
        style={{ background: colors.border, width: 7, height: 7, border: '2px solid #fff', opacity: 0.45 }}
      />
    </div>
  );
};

export default memo(CustomNode);
