import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NodeType, NODE_COLORS } from '../models/graphModel';

export interface CustomNodeData {
  id: string;
  label: string;
  nodeType: NodeType;
}

const CustomNode: React.FC<NodeProps<CustomNodeData>> = ({ data, selected }) => {
  const colors = NODE_COLORS[data.nodeType] ?? NODE_COLORS.process;

  return (
    <div
      style={{
        background:   colors.bg,
        border:       `2px solid ${selected ? '#6366f1' : colors.border}`,
        color:        colors.text,
        borderRadius: '10px',
        minWidth:     '170px',
        maxWidth:     '220px',
        padding:      '10px 14px',
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
        style={{
          background:  colors.border,
          width:        9,
          height:       9,
          border:       '2px solid #fff',
          borderRadius: '50%',
        }}
      />

      {/* Node body */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        {/* Icon + Label row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span role="img" aria-label={data.nodeType} style={{ fontSize: 16, flexShrink: 0 }}>
            {colors.icon}
          </span>
          <span
            style={{
              fontSize:   13,
              fontWeight: 600,
              textAlign:  'center',
              lineHeight: 1.35,
              wordBreak:  'break-word',
            }}
          >
            {data.label}
          </span>
        </div>

        {/* Type badge */}
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
      </div>

      {/* Source handle (bottom — outgoing edges) */}
      <Handle
        type="source"
        position={Position.Bottom}
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
        id="left-target"
        style={{ background: colors.border, width: 8, height: 8, border: '2px solid #fff', opacity: 0.6 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        style={{ background: colors.border, width: 8, height: 8, border: '2px solid #fff', opacity: 0.6 }}
      />
    </div>
  );
};

export default memo(CustomNode);
