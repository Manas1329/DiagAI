// Shared graph model (mirrors frontend/src/models/graphModel.ts)

export type NodeType =
  | 'none' | 'actor' | 'process' | 'decision' | 'database'
  | 'api' | 'service' | 'observability' | 'security';

export interface DiagNode {
  id: string;
  label: string;
  type: NodeType;
  metadata?: Record<string, unknown>;
}

export interface DiagEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  hasArrow?: boolean;
}

export interface GraphModel {
  id?: string;
  title?: string;
  nodes: DiagNode[];
  edges: DiagEdge[];
  metadata?: {
    createdAt?: string;
    inputFormat?: string;
    originalText?: string;
    layoutDirection?: string;
    updatedAt?: string;
  };
}

const TYPE_PATTERNS: Array<[NodeType, RegExp]> = [
  ['actor', /\b(user|actor|person|client|customer|human|operator)\b/i],
  ['database', /\b(database|db|storage|store|cache|redis|mongo|repository|data[\s-]?store)\b/i],
  ['observability', /\b(log|monitor|observ|metric|alert|trace|audit|telemetry)\b/i],
  ['security', /\b(auth|authenticat|authoriz|rbac|acl|permission|jwt|oauth|crypto|encryp|security|firewall)\b/i],
  ['decision', /\b(decision|branch|condition|gateway|check|validator|choose|select|option)\b/i],
  ['api', /\b(api|rest|graphql|endpoint|gateway|webhook)\b/i],
  ['service', /\b(service|module|component|handler|processor|worker|queue|engine|pipeline)\b/i],
];

const TREE_PIPES = '\\u2502|'; // \u2502 = BOX DRAWINGS LIGHT VERTICAL
const TREE_BRANCH = '\\u251c\\u2514'; // \u251c, \u2514
const DOWN_ARROWS = '\\u2193\\u2b07\\u25bc'; // down arrow variants
const ANY_ARROWS = '\\u2191\\u2193\\u2190\\u2192\\u2b06\\u2b07\\u27a1\\u2b05\\u25bc\\u25b2\\u25ba\\u25c4';

function detectType(label: string): NodeType {
  for (const [type, re] of TYPE_PATTERNS) {
    if (re.test(label)) return type;
  }
  return 'process';
}

function slug(text: string, i: number): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || `node_${i}`;
}

function splitChainWithConnectors(line: string): { parts: string[]; connectors: string[] } {
  const connRe = /\s*(->|-->|=>|\u2192|\u2500{2,})\s*/g;
  const parts: string[] = [];
  const connectors: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = connRe.exec(line)) !== null) {
    parts.push(line.slice(last, m.index).trim());
    connectors.push(m[1]);
    last = connRe.lastIndex;
  }

  parts.push(line.slice(last).trim());
  return { parts: parts.filter(Boolean), connectors };
}

function connectorHasArrow(connector: string): boolean {
  return /->|-->|=>|\u2192/.test(connector);
}

function parseVertical(text: string): GraphModel {
  const ARROW = new RegExp(`^[${ANY_ARROWS}]$|^(->|-->|=>)$`);
  const CONNECTOR = new RegExp(`^[${ANY_ARROWS}${TREE_PIPES}\\s-]+$`);
  const rawLines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const nodes: DiagNode[] = [];
  const edges: DiagEdge[] = [];
  let i = 0;
  let prevNode: DiagNode | null = null;
  let pendingArrow = false;

  for (const line of rawLines) {
    if (ARROW.test(line)) {
      pendingArrow = true;
      continue;
    }
    if (CONNECTOR.test(line) && !/[A-Za-z0-9]/.test(line)) {
      pendingArrow = pendingArrow || new RegExp(`[${ANY_ARROWS}]`).test(line);
      continue;
    }

    let node = nodes.find((n) => n.label === line) ?? null;
    if (!node) {
      node = { id: slug(line, i++), label: line, type: detectType(line) };
      nodes.push(node);
    }

    if (prevNode && prevNode.id !== node.id) {
      const id = `e_${prevNode.id}_${node.id}`;
      if (!edges.some((e) => e.id === id)) {
        edges.push({ id, source: prevNode.id, target: node.id, hasArrow: pendingArrow });
      }
    }

    prevNode = node;
    pendingArrow = false;
  }

  return { nodes, edges };
}

function parseArrow(text: string): GraphModel {
  const nodeMap = new Map<string, DiagNode>();
  const edges: DiagEdge[] = [];
  let i = 0;

  const getOrCreate = (label: string): DiagNode => {
    const found = Array.from(nodeMap.values()).find((n) => n.label === label);
    if (found) return found;
    const n: DiagNode = { id: slug(label, i++), label, type: detectType(label) };
    nodeMap.set(n.id, n);
    return n;
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const { parts, connectors } = splitChainWithConnectors(line);
    if (parts.length < 2) continue;

    for (let j = 0; j < parts.length - 1; j++) {
      const source = getOrCreate(parts[j]);
      const target = getOrCreate(parts[j + 1]);
      const id = `e_${source.id}_${target.id}`;
      if (!edges.some((e) => e.id === id)) {
        edges.push({ id, source: source.id, target: target.id, hasArrow: connectorHasArrow(connectors[j] ?? '->') });
      }
    }
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

function parseTree(text: string): GraphModel {
  const nodeMap = new Map<string, DiagNode>();
  const edges: DiagEdge[] = [];
  const stack: Array<DiagNode | null> = [];
  let i = 0;
  let pendingConnector = false;
  let pendingDown = false;
  let lastNode: DiagNode | null = null;
  let lastLevel = 0;

  const getOrCreate = (label: string): DiagNode => {
    const found = Array.from(nodeMap.values()).find((n) => n.label === label);
    if (found) return found;
    const n: DiagNode = { id: slug(label, i++), label, type: detectType(label) };
    nodeMap.set(n.id, n);
    return n;
  };

  const addEdge = (source: string, target: string, hasArrow = false) => {
    if (source === target) return;
    const id = `e_${source}_${target}`;
    if (!edges.some((e) => e.id === id)) edges.push({ id, source, target, hasArrow });
  };

  const levelOf = (raw: string): number => {
    let p = 0;
    let level = 0;
    while (p < raw.length) {
      if (raw.startsWith('\u2502   ', p) || raw.startsWith('|   ', p) || raw.startsWith('    ', p)) {
        level++;
        p += 4;
        continue;
      }
      break;
    }

    const labelStart = raw.search(/[A-Za-z0-9]/);
    const prefix = labelStart >= 0 ? raw.slice(0, labelStart) : raw;
    const leading = raw.slice(0, Math.min(raw.length, 12));
    if (new RegExp(`[${TREE_BRANCH}]`).test(leading)) level += 1;

    const pipeCount = (prefix.match(new RegExp(`[${TREE_PIPES}]`, 'g')) ?? []).length;
    if (pipeCount > 0) level = Math.max(level, pipeCount + 1);

    return level;
  };

  const cleanContent = (raw: string): string => {
    let content = raw;
    content = content.replace(new RegExp(`^[\\s${TREE_PIPES}]*`), '');
    content = content.replace(new RegExp(`^[${TREE_BRANCH}]?\\s*[\\u2500-]{1,3}\\s*`), '');
    content = content.replace(new RegExp(`^[${TREE_PIPES}]+\\s*`), '');
    return content.trim();
  };

  for (const rawLine of text.split('\n')) {
    if (!rawLine.trim()) continue;
    const trimmed = rawLine.trim();

    if (new RegExp(`^[${ANY_ARROWS}${TREE_PIPES}\\s-]+$`).test(trimmed) && !/[A-Za-z0-9]/.test(trimmed)) {
      pendingConnector = true;
      if (new RegExp(`[${DOWN_ARROWS}]`).test(trimmed)) pendingDown = true;
      continue;
    }

    const level = levelOf(rawLine);
    const content = cleanContent(rawLine);
    const { parts, connectors } = splitChainWithConnectors(content);
    if (parts.length === 0) continue;

    const firstNode = getOrCreate(parts[0]);
    let parent = level > 0 ? stack[level - 1] : null;

    if (!parent && level > 0) {
      for (let j = Math.min(level - 1, stack.length - 1); j >= 0; j--) {
        if (stack[j]) {
          parent = stack[j];
          break;
        }
      }
    }

    if (pendingConnector && lastNode && level >= lastLevel) addEdge(lastNode.id, firstNode.id, pendingDown);
    else if (parent) addEdge(parent.id, firstNode.id, false);

    let prev = firstNode;
    for (let j = 1; j < parts.length; j++) {
      const next = getOrCreate(parts[j]);
      addEdge(prev.id, next.id, connectorHasArrow(connectors[j - 1] ?? '->'));
      prev = next;
    }

    stack[level] = prev;
    stack.length = level + 1;
    pendingConnector = false;
    pendingDown = false;
    lastNode = prev;
    lastLevel = level;
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

export function detectFormat(text: string): string {
  if (/^\s*\|\s*--/m.test(text) || /^\s*\|\s*$/m.test(text)) return 'tree';
  if (/(?:\u2500{2,}|-{2,})/.test(text) && /[\u2502|\u2514\u2518\u250c\u2510]/.test(text)) return 'ascii';
  if (/[\u251c\u2514\u2502]/m.test(text)) return 'tree';
  if (/\n\s*[\u2191\u2193\u2190\u2192\u2b06\u2b07\u27a1\u2b05\u25bc\u25b2\u25ba\u25c4]\s*\n/.test(text)) return 'vertical';
  if (/->|-->|=>|\u2192|\u2500{2,}/.test(text)) return 'arrow';
  return 'vertical';
}

export function parseText(text: string): GraphModel {
  const format = detectFormat(text);
  const raw = format === 'tree'
    ? parseTree(text)
    : format === 'arrow'
      ? parseArrow(text)
      : parseVertical(text);

  const outDegree = new Map<string, number>();
  for (const e of raw.edges) outDegree.set(e.source, (outDegree.get(e.source) ?? 0) + 1);
  const children = new Map<string, string[]>();
  for (const e of raw.edges) {
    const target = raw.nodes.find((n) => n.id === e.target)?.label ?? '';
    const arr = children.get(e.source) ?? [];
    arr.push(target.toLowerCase());
    children.set(e.source, arr);
  }
  const choiceWord = /\b(choose|select|option|decision|branch|condition|if|validate|check|approve|reject|success|error|retry|valid|invalid|login|register|exit)\b/i;

  const nodes = raw.nodes.map((n) => {
    if (n.type !== 'process') return n;
    const out = outDegree.get(n.id) ?? 0;
    if (out < 2) return n;

    const labelSuggestsDecision = choiceWord.test(n.label);
    const childSuggestsDecision = (children.get(n.id) ?? []).some((label) => choiceWord.test(label));
    if (labelSuggestsDecision || childSuggestsDecision) {
      return { ...n, type: 'decision' as NodeType };
    }
    return { ...n, type: 'none' as NodeType };
  });

  return {
    ...raw,
    nodes,
    metadata: {
      createdAt: new Date().toISOString(),
      inputFormat: format,
      originalText: text,
    },
  };
}
