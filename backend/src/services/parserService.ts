// ─── Shared graph model (mirrors frontend/src/models/graphModel.ts) ──────────

export type NodeType =
  | 'actor' | 'process' | 'decision' | 'database'
  | 'api'   | 'service' | 'observability' | 'security';

export interface DiagNode {
  id:        string;
  label:     string;
  type:      NodeType;
  metadata?: Record<string, unknown>;
}

export interface DiagEdge {
  id:      string;
  source:  string;
  target:  string;
  label?:  string;
}

export interface GraphModel {
  id?:      string;
  title?:   string;
  nodes:    DiagNode[];
  edges:    DiagEdge[];
  metadata?: {
    createdAt?:      string;
    inputFormat?:    string;
    originalText?:   string;
    layoutDirection?: string;
    updatedAt?: string;
  };
}

// ─── Node-type detection ─────────────────────────────────────────────────────

const TYPE_PATTERNS: Array<[NodeType, RegExp]> = [
  ['actor',         /\b(user|actor|person|client|customer|human|operator)\b/i],
  ['database',      /\b(database|db|storage|store|cache|redis|mongo|repository|data[\s-]?store)\b/i],
  ['observability', /\b(log|monitor|observ|metric|alert|trace|audit|telemetry)\b/i],
  ['security',      /\b(auth|authenticat|authoriz|rbac|acl|permission|jwt|oauth|crypto|encryp|security|firewall)\b/i],
  ['decision',      /\b(decision|branch|condition|gateway|check|router|validator)\b/i],
  ['api',           /\b(api|rest|graphql|endpoint|gateway|webhook)\b/i],
  ['service',       /\b(service|module|component|handler|processor|worker|queue|engine|pipeline)\b/i],
];

function detectType(label: string): NodeType {
  for (const [type, re] of TYPE_PATTERNS) if (re.test(label)) return type;
  return 'process';
}

function slug(text: string, i: number): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || `node_${i}`;
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

function parseVertical(text: string): GraphModel {
  const ARROW = /^[↓↑→←⬇⬆➡⬅]$|^(->|-->|=>)$/;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const nodes: DiagNode[] = [];
  const edges: DiagEdge[] = [];
  let i = 0;
  let prev: DiagNode | null = null;
  for (const line of lines) {
    if (ARROW.test(line)) continue;
    let node = nodes.find((n) => n.label === line);
    if (!node) { node = { id: slug(line, i++), label: line, type: detectType(line) }; nodes.push(node); }
    if (prev && prev.id !== node.id) {
      const eid = `e_${prev.id}_${node.id}`;
      if (!edges.find((e) => e.id === eid)) edges.push({ id: eid, source: prev.id, target: node.id });
    }
    prev = node;
  }
  return { nodes, edges };
}

function parseArrow(text: string): GraphModel {
  const nodeMap = new Map<string, DiagNode>();
  const edges: DiagEdge[] = [];
  let i = 0;
  const getOrCreate = (label: string) => {
    const found = Array.from(nodeMap.values()).find((n) => n.label === label);
    if (found) return found;
    const n: DiagNode = { id: slug(label, i++), label, type: detectType(label) };
    nodeMap.set(n.id, n);
    return n;
  };
  for (const raw of text.split('\n')) {
    const parts = raw.trim().split(/\s*(?:->|-->|=>|→)\s*/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    for (let j = 0; j < parts.length - 1; j++) {
      const s = getOrCreate(parts[j]);
      const t = getOrCreate(parts[j + 1]);
      const eid = `e_${s.id}_${t.id}`;
      if (!edges.find((e) => e.id === eid)) edges.push({ id: eid, source: s.id, target: t.id });
    }
  }
  return { nodes: Array.from(nodeMap.values()), edges };
}

export function detectFormat(text: string): string {
  if (/^@startuml/i.test(text.trim())) return 'plantuml';
  if (/^(flowchart|graph)\s+(TD|LR|TB|RL|BT)\b/i.test(text.trim())) return 'mermaid';
  if (/\n\s*[↓↑→←⬇⬆]\s*\n/.test(text)) return 'vertical';
  if (/->|-->|=>|→/.test(text)) return 'arrow';
  if (/^\s*[-*•]/m.test(text)) return 'bullet';
  return 'vertical';
}

export function parseText(text: string): GraphModel {
  const format = detectFormat(text);
  const raw = format === 'arrow' ? parseArrow(text) : parseVertical(text);
  return {
    ...raw,
    metadata: {
      createdAt:   new Date().toISOString(),
      inputFormat: format,
      originalText: text,
    },
  };
}
