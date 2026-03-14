// ─── Canonical graph model ────────────────────────────────────────────────────

export type NodeType =
  | 'actor'
  | 'process'
  | 'decision'
  | 'database'
  | 'api'
  | 'service'
  | 'observability'
  | 'security';

export interface DiagNode {
  id: string;
  label: string;
  type: NodeType;
  style?: Record<string, string | number>;
  metadata?: Record<string, unknown>;
}

export interface DiagEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  direction?: 'forward' | 'backward' | 'bidirectional';
  edgeType?: string;
}

export interface DiagGroup {
  id: string;
  label: string;
  nodeIds: string[];
  style?: Record<string, string | number>;
}

export interface GraphModel {
  id?: string;
  title?: string;
  nodes: DiagNode[];
  edges: DiagEdge[];
  groups?: DiagGroup[];
  metadata?: {
    createdAt?: string;
    updatedAt?: string;
    layoutDirection?: 'TB' | 'LR' | 'BT' | 'RL';
    inputFormat?: string;
    originalText?: string;
  };
}

// ─── Visual style per node type ───────────────────────────────────────────────

export const NODE_COLORS: Record<
  NodeType,
  { bg: string; border: string; text: string; icon: string }
> = {
  actor:         { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af', icon: '👤' },
  process:       { bg: '#dcfce7', border: '#22c55e', text: '#15803d', icon: '⚙️' },
  decision:      { bg: '#fef9c3', border: '#eab308', text: '#854d0e', icon: '🔀' },
  database:      { bg: '#cffafe', border: '#06b6d4', text: '#0e7490', icon: '🗄️' },
  api:           { bg: '#fed7aa', border: '#f97316', text: '#9a3412', icon: '🔌' },
  security:      { bg: '#fce7f3', border: '#ec4899', text: '#9d174d', icon: '🔒' },
  observability: { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6', icon: '👁️' },
  service:       { bg: '#e0f2fe', border: '#0284c7', text: '#0c4a6e', icon: '📦' },
};

export const NODE_TYPES_LIST: NodeType[] = [
  'actor', 'process', 'decision', 'database',
  'api', 'service', 'observability', 'security',
];
