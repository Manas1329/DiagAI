// ─── Shared graph model (mirrors frontend/src/models/graphModel.ts) ──────────

export type NodeType =
  | 'none'  | 'actor' | 'process' | 'decision' | 'database'
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
    const parts = raw.trim().split(/\s*(?:->|-->|=>|→|─{2,})\s*/).map((s) => s.trim()).filter(Boolean);
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

function parseTree(text: string): GraphModel {
  const nodeMap = new Map<string, DiagNode>();
  const edges: DiagEdge[] = [];
  const stack: Array<DiagNode | null> = [];
  let i = 0;
  let pendingDown = false;
  let lastNode: DiagNode | null = null;

  const getOrCreate = (label: string): DiagNode => {
    const found = Array.from(nodeMap.values()).find((n) => n.label === label);
    if (found) return found;
    const n: DiagNode = { id: slug(label, i++), label, type: detectType(label) };
    nodeMap.set(n.id, n);
    return n;
  };

  const addEdge = (source: string, target: string) => {
    if (source === target) return;
    const id = `e_${source}_${target}`;
    if (!edges.some((e) => e.id === id)) edges.push({ id, source, target });
  };

  const levelOf = (raw: string): number => {
    let p = 0;
    let level = 0;
    while (p < raw.length) {
      if (raw.startsWith('│   ', p) || raw.startsWith('|   ', p) || raw.startsWith('    ', p)) {
        level++;
        p += 4;
        continue;
      }
      break;
    }

    const labelStart = raw.search(/[A-Za-z0-9]/);
    const prefix = labelStart >= 0 ? raw.slice(0, labelStart) : raw;
    const leading = raw.slice(0, Math.min(raw.length, 12));
    if (/[├└]/.test(leading)) level += 1;

    const pipeCount = (prefix.match(/[│|]/g) ?? []).length;
    if (pipeCount > 0) level = Math.max(level, pipeCount + 1);

    return level;
  };

  const cleanContent = (raw: string): string => {
    let content = raw;
    content = content.replace(/^[\s│|]*/, '');
    content = content.replace(/^[├└+`|]?\s*[─-]{1,3}\s*/, '');
    content = content.replace(/^[│|]+\s*/, '');
    return content.trim();
  };

  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    const trimmed = raw.trim();

    if (/^[↓↑→←⬇⬆➡⬅▼▲►◄|│\s-]+$/.test(trimmed) && !/[A-Za-z0-9]/.test(trimmed)) {
      if (/[↓⬇]/.test(trimmed)) pendingDown = true;
      continue;
    }

    const level = levelOf(raw);
    const content = cleanContent(raw);
    const parts = content.split(/\s*(?:->|-->|=>|→|─{2,})\s*/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) continue;

    const first = getOrCreate(parts[0]);
    let parent = level > 0 ? stack[level - 1] : null;

    if (!parent && level > 0) {
      for (let j = Math.min(level - 1, stack.length - 1); j >= 0; j--) {
        if (stack[j]) {
          parent = stack[j];
          break;
        }
      }
    }

    if (pendingDown && lastNode) addEdge(lastNode.id, first.id);
    else if (parent) addEdge(parent.id, first.id);

    let prev = first;
    for (let p = 1; p < parts.length; p++) {
      const next = getOrCreate(parts[p]);
      addEdge(prev.id, next.id);
      prev = next;
    }

    stack[level] = prev;
    stack.length = level + 1;
    pendingDown = false;
    lastNode = prev;
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

function parseAscii(text: string): GraphModel {
  const lines = text.split('\n');
  const nodeMap = new Map<string, DiagNode>();
  const nodesWithPos: Array<{ node: DiagNode; row: number; start: number; end: number; center: number }> = [];
  const edges: DiagEdge[] = [];
  let i = 0;

  const getOrCreate = (label: string): DiagNode => {
    const clean = label.trim();
    const found = Array.from(nodeMap.values()).find((n) => n.label === clean);
    if (found) return found;
    const n: DiagNode = { id: slug(clean, i++), label: clean, type: detectType(clean) };
    nodeMap.set(n.id, n);
    return n;
  };

  const addEdge = (source: DiagNode, target: DiagNode) => {
    if (source.id === target.id) return;
    const id = `e_${source.id}_${target.id}`;
    if (!edges.some((e) => e.id === id)) edges.push({ id, source: source.id, target: target.id });
  };

  const TOKEN_RE = /[A-Za-z0-9][A-Za-z0-9_./()]*?(?:\s+[A-Za-z0-9][A-Za-z0-9_./()]*)*(?=\s*(?:[─\-|│←→↑↓]|$))/g;

  lines.forEach((line, row) => {
    let match: RegExpExecArray | null;
    while ((match = TOKEN_RE.exec(line)) !== null) {
      const label = match[0].trim();
      if (!label) continue;
      const start = match.index;
      const end = start + label.length;
      const center = Math.floor((start + end) / 2);
      const node = getOrCreate(label);
      nodesWithPos.push({ node, row, start, end, center });
    }
  });

  const byRow = new Map<number, Array<{ node: DiagNode; row: number; start: number; end: number; center: number }>>();
  for (const n of nodesWithPos) {
    const arr = byRow.get(n.row) ?? [];
    arr.push(n);
    byRow.set(n.row, arr);
  }

  for (const arr of byRow.values()) {
    arr.sort((a, b) => a.start - b.start);
    for (let j = 0; j < arr.length - 1; j++) {
      const left = arr[j];
      const right = arr[j + 1];
      const segment = lines[left.row].slice(left.end, right.start);
      if (!/[─\-=→←]/.test(segment)) continue;
      if (/←/.test(segment) && !/→/.test(segment)) addEdge(right.node, left.node);
      else addEdge(left.node, right.node);
    }
  }

  for (const top of nodesWithPos) {
    const lower = nodesWithPos
      .filter((n) => n.row > top.row && Math.abs(n.center - top.center) <= 2)
      .sort((a, b) => a.row - b.row)[0];

    if (!lower) continue;

    let hasVertical = false;
    let sawUp = false;
    let sawDown = false;

    for (let r = top.row + 1; r < lower.row; r++) {
      const line = lines[r] ?? '';
      const from = Math.max(0, top.center - 2);
      const to = Math.min(line.length, top.center + 3);
      const window = line.slice(from, to);
      if (/[|│↑↓]/.test(window)) hasVertical = true;
      if (/↑/.test(window)) sawUp = true;
      if (/↓/.test(window)) sawDown = true;
    }

    if (!hasVertical) continue;
    if (sawUp && !sawDown) addEdge(lower.node, top.node);
    else addEdge(top.node, lower.node);
  }

  for (let r = 1; r < lines.length; r++) {
    const line = lines[r];
    if (!/[└┘]/.test(line)) continue;

    const labelMatch = line.match(TOKEN_RE);
    if (!labelMatch || labelMatch.length !== 1) continue;
    const loop = getOrCreate(labelMatch[0]);

    const arrowLine = lines[r - 1] ?? '';
    const upCol = arrowLine.indexOf('↑');
    const downCol = arrowLine.indexOf('↓');
    if (upCol < 0 && downCol < 0) continue;

    const nearestAbove = (col: number) => nodesWithPos
      .filter((n) => n.row < r)
      .sort((a, b) => {
        const ra = Math.abs(a.center - col) + (r - a.row) * 0.1;
        const rb = Math.abs(b.center - col) + (r - b.row) * 0.1;
        return ra - rb;
      })[0]?.node;

    const upNode = upCol >= 0 ? nearestAbove(upCol) : undefined;
    const downNode = downCol >= 0 ? nearestAbove(downCol) : undefined;

    if (downNode) addEdge(downNode, loop);
    if (upNode) addEdge(loop, upNode);
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

export function detectFormat(text: string): string {
  if (/^@startuml/i.test(text.trim())) return 'plantuml';
  if (/^(flowchart|graph)\s+(TD|LR|TB|RL|BT)\b/i.test(text.trim())) return 'mermaid';
  if (/(?:─{2,}|-{2,})/.test(text) && /[│|└┘┌┐]/.test(text)) return 'ascii';
  if (/[├└│]/m.test(text)) return 'tree';
  if (/\n\s*[↓↑→←⬇⬆]\s*\n/.test(text)) return 'vertical';
  if (/->|-->|=>|→|─{2,}/.test(text)) return 'arrow';
  if (/^\s*[-*•]/m.test(text)) return 'bullet';
  return 'vertical';
}

export function parseText(text: string): GraphModel {
  const format = detectFormat(text);
  const raw = format === 'tree'
    ? parseTree(text)
    : format === 'ascii'
      ? parseAscii(text)
    : format === 'arrow'
      ? parseArrow(text)
      : parseVertical(text);
  return {
    ...raw,
    metadata: {
      createdAt:   new Date().toISOString(),
      inputFormat: format,
      originalText: text,
    },
  };
}
