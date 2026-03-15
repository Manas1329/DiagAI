import { GraphModel, DiagNode, DiagEdge, NodeType } from '../models/graphModel';

// ─── Node-type auto-detection patterns ────────────────────────────────────────

const NODE_TYPE_PATTERNS: Array<[NodeType, RegExp]> = [
  ['actor',         /\b(user|actor|person|client|customer|human|operator|end[\s-]?user)\b/i],
  ['database',      /\b(database|db|storage|store|cache|redis|postgres|mysql|mongo|repository|data[\s-]?store|warehouse)\b/i],
  ['observability', /\b(log|monitor|observ|metric|alert|trace|audit|analytic|telemetry|siem|splunk)\b/i],
  ['security',      /\b(auth|authenticat|authoriz|rbac|acl|permission|jwt|oauth|crypto|encrypt|security|firewall|vpn|tls|ssl|mfa)\b/i],
  ['decision',      /\b(decision|branch|condition|if|gateway|check|validator|policy|choose|select|option)\b/i],
  ['api',           /\b(api|rest|graphql|endpoint|gateway|webhook|http|grpc|route|proxy)\b/i],
  ['service',       /\b(service|module|component|handler|processor|worker|queue|bus|engine|pipeline|scheduler)\b/i],
];

const FILE_TYPE_RE = /\b[a-z0-9][\w-]*\.(?:pdf|doc|docx|xls|xlsx|csv|txt|json|xml|yaml|yml|png|jpe?g|gif|bmp|svg|zip|rar|7z|tar|gz|mp3|wav|mp4|avi|mov|ppt|pptx)\b/i;
const FILE_TYPE_WORD_RE = /\b(pdf|docx?|xlsx?|csv|txt|json|xml|yaml|yml|png|jpe?g|gif|svg|zip|rar|7z|mp3|wav|mp4|avi|mov|pptx?)\b/i;

function detectNodeType(label: string): NodeType {
  if (label.trimEnd().endsWith('?')) return 'decision';
  if (FILE_TYPE_RE.test(label) || FILE_TYPE_WORD_RE.test(label)) return 'none';
  for (const [type, pattern] of NODE_TYPE_PATTERNS) {
    if (pattern.test(label)) return type;
  }
  return 'process';
}

// ─── ID helpers ───────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

function makeId(label: string, index: number): string {
  const slug = slugify(label);
  return slug || `node_${index}`;
}

// ─── Format detection ─────────────────────────────────────────────────────────

export type InputFormat = 'arrow' | 'vertical' | 'bullet' | 'tree' | 'ascii' | 'mermaid' | 'plantuml';

export function detectFormat(text: string): InputFormat {
  const trimmed = text.trim();
  if (/^@startuml/i.test(trimmed)) return 'plantuml';
  if (/^(flowchart|graph)\s+(TD|LR|TB|RL|BT)\b/i.test(trimmed)) return 'mermaid';
  if (/^\s*\|\s*--/m.test(text) || /^\s*\|\s*$/m.test(text)) return 'tree';
  if (/(?:─{2,}|-{2,})/.test(text) && /[│|└┘┌┐]/.test(text)) return 'ascii';
  if (/[├└│]/m.test(text)) return 'tree';
  if (/\n\s*[↓↑→←⬇⬆➡⬅▼▲►◄]\s*\n/.test(text)) return 'vertical';
  if (/->|-->|=>|→|─{2,}|-{3,}/.test(text)) return 'arrow';
  if (/^\s*[-*•]/m.test(text)) return 'bullet';
  // Fallback: treat line-breaks as implicit vertical flow
  return 'vertical';
}

function splitChain(line: string): string[] {
  return line
    .split(/\s*(?:->|-->|=>|→|─{2,}|-{3,})\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitChainWithConnectors(line: string): { parts: string[]; connectors: string[] } {
  const connRe = /\s*(->|-->|=>|→|─{2,}|-{3,})\s*/g;
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
  return /->|-->|=>|→/.test(connector);
}

// ─── Parser implementations ───────────────────────────────────────────────────

/** Parses `A -> B -> C` style input (inline or multi-line). */
function parseArrow(text: string): GraphModel {
  const nodeMap = new Map<string, DiagNode>();
  const edges: DiagEdge[] = [];
  let counter = 0;

  const getOrCreate = (label: string): DiagNode => {
    const existing = Array.from(nodeMap.values()).find((n) => n.label === label);
    if (existing) return existing;
    const node: DiagNode = { id: makeId(label, counter++), label, type: detectNodeType(label) };
    nodeMap.set(node.id, node);
    return node;
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const { parts, connectors } = splitChainWithConnectors(line);
    if (parts.length < 2) continue;
    for (let i = 0; i < parts.length - 1; i++) {
      const src = getOrCreate(parts[i]);
      const tgt = getOrCreate(parts[i + 1]);
      const edgeId = `e_${src.id}_${tgt.id}`;
      const hasArrow = connectorHasArrow(connectors[i] ?? '->');
      if (!edges.find((e) => e.id === edgeId)) {
        edges.push({ id: edgeId, source: src.id, target: tgt.id, hasArrow });
      }
    }
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

/** Parses unicode tree lines (├ └ │) and mixed branch chains. */
function parseTree(text: string): GraphModel {
  const nodeMap = new Map<string, DiagNode>();
  const edges: DiagEdge[] = [];
  const stack: Array<DiagNode | null> = [];
  let counter = 0;
  let pendingConnector = false;
  let pendingDown = false;
  let lastNode: DiagNode | null = null;
  let lastLevel = 0;

  const getOrCreate = (label: string): DiagNode => {
    const existing = Array.from(nodeMap.values()).find((n) => n.label === label);
    if (existing) return existing;
    const node: DiagNode = { id: makeId(label, counter++), label, type: detectNodeType(label) };
    nodeMap.set(node.id, node);
    return node;
  };

  const addEdge = (source: string, target: string, hasArrow = false) => {
    if (source === target) return;
    const id = `e_${source}_${target}`;
    if (!edges.some((e) => e.id === id)) edges.push({ id, source, target, hasArrow });
  };

  const getIndentLevel = (raw: string): number => {
    let i = 0;
    let level = 0;
    while (i < raw.length) {
      if (raw.startsWith('│   ', i) || raw.startsWith('|   ', i) || raw.startsWith('    ', i)) {
        level++;
        i += 4;
        continue;
      }
      break;
    }

    const labelStart = raw.search(/[A-Za-z0-9]/);
    const prefix = labelStart >= 0 ? raw.slice(0, labelStart) : raw;

    // Lines with branch glyphs are always children of current level/root context.
    const leading = raw.slice(0, Math.min(raw.length, 12));
    if (/[├└]/.test(leading)) level += 1;

    // Pipe prefixes indicate nested branch depth, even with uneven spaces.
    const pipeCount = (prefix.match(/[│|]/g) ?? []).length;
    if (pipeCount > 0) level = Math.max(level, pipeCount + 1);

    return level;
  };

  const cleanContent = (raw: string): string => {
    let content = raw;

    // Remove common tree line prefixes before label text.
    content = content.replace(/^[\s│|]*/, '');
    content = content.replace(/^[├└+`|]?\s*[─-]{1,3}\s*/, '');
    content = content.replace(/^[│|]+\s*/, '');

    return content.trim();
  };

  for (const rawLine of text.split('\n')) {
    if (!rawLine.trim()) continue;
    const trimmed = rawLine.trim();

    if (/^[↓↑→←⬇⬆➡⬅▼▲►◄|│\s-]+$/.test(trimmed) && !/[A-Za-z0-9]/.test(trimmed)) {
      const pipeOnly = /^[|│\s]+$/.test(trimmed);
      pendingConnector = !pipeOnly;
      if (/[↓⬇]/.test(trimmed)) pendingDown = true;
      continue;
    }

    const level = getIndentLevel(rawLine);
    let content = cleanContent(rawLine);
    if (!content) continue;

    const { parts, connectors } = splitChainWithConnectors(content);
    if (parts.length === 0) continue;

    const firstNode = getOrCreate(parts[0]);
    let parent = level > 0 ? stack[level - 1] : null;

    // If computed level is noisy, fall back to nearest known ancestor.
    if (!parent && level > 0) {
      for (let j = Math.min(level - 1, stack.length - 1); j >= 0; j--) {
        if (stack[j]) {
          parent = stack[j];
          break;
        }
      }
    }

    // Vertical down arrows should connect from the previous concrete node.
    if (pendingConnector && lastNode && level >= lastLevel) {
      addEdge(lastNode.id, firstNode.id, pendingDown);
    } else if (pendingConnector && lastNode && level < lastLevel) {
      // Going back up the tree – connect from the last node seen at this level
      const ancestor = stack[level] ?? lastNode;
      addEdge(ancestor.id, firstNode.id, pendingDown);
    } else if (parent) {
      addEdge(parent.id, firstNode.id, false);
    }

    let prev = firstNode;
    for (let i = 1; i < parts.length; i++) {
      const next = getOrCreate(parts[i]);
      addEdge(prev.id, next.id, connectorHasArrow(connectors[i - 1] ?? '->'));
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

/** Parses ASCII connector layouts (---, |, ─, │, loopbacks). */
function parseAscii(text: string): GraphModel {
  const lines = text.split('\n');
  const nodeMap = new Map<string, DiagNode>();
  const nodesWithPos: Array<{ node: DiagNode; row: number; start: number; end: number; center: number }> = [];
  const edges: DiagEdge[] = [];
  let counter = 0;

  const getOrCreate = (label: string, row?: number, col?: number): DiagNode => {
    const clean = label.trim();
    const existing = Array.from(nodeMap.values()).find((n) => n.label === clean);
    if (existing) {
      if (row != null && col != null) {
        existing.metadata = {
          ...(existing.metadata ?? {}),
          asciiRow: Math.min(Number((existing.metadata as any)?.asciiRow ?? row), row),
          asciiCol: Math.min(Number((existing.metadata as any)?.asciiCol ?? col), col),
        };
      }
      return existing;
    }
    const node: DiagNode = {
      id: makeId(clean, counter++),
      label: clean,
      type: detectNodeType(clean),
      metadata: row != null && col != null ? { asciiRow: row, asciiCol: col } : undefined,
    };
    nodeMap.set(node.id, node);
    return node;
  };

  const addEdge = (source: DiagNode, target: DiagNode, hasArrow = false) => {
    if (source.id === target.id) return;
    const id = `e_${source.id}_${target.id}`;
    if (!edges.some((e) => e.id === id)) edges.push({ id, source: source.id, target: target.id, hasArrow });
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
      const node = getOrCreate(label, row, center);
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
    for (let i = 0; i < arr.length - 1; i++) {
      const left = arr[i];
      const right = arr[i + 1];
      const segment = lines[left.row].slice(left.end, right.start);
      if (!/[─\-=→←]/.test(segment)) continue;
      const hasArrow = /[←→<>]/.test(segment);
      if (/←/.test(segment) && !/→/.test(segment)) addEdge(right.node, left.node, hasArrow);
      else addEdge(left.node, right.node, hasArrow);
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
    if (sawUp && !sawDown) addEdge(lower.node, top.node, sawUp || sawDown);
    else addEdge(top.node, lower.node, sawUp || sawDown);
  }

  // Loopback pattern: arrow hint line + "└── Improve ──┘" line.
  for (let r = 1; r < lines.length; r++) {
    const line = lines[r];
    if (!/[└┘]/.test(line)) continue;

    const labelMatch = line.match(TOKEN_RE);
    if (!labelMatch || labelMatch.length !== 1) continue;
    const loopLabel = labelMatch[0];
    const col = line.indexOf(loopLabel) + Math.floor(loopLabel.length / 2);
    const loop = getOrCreate(loopLabel, r, Math.max(0, col));

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

    if (downNode) addEdge(downNode, loop, true);
    if (upNode) addEdge(loop, upNode, true);
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

/** Parses vertical ↓ arrow-between-lines format (or plain line-per-node). */
function parseVertical(text: string): GraphModel {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const nodes: DiagNode[] = [];
  const edges: DiagEdge[] = [];
  const ARROW_RE = /^[↓↑→←⬇⬆➡⬅▼▲►◄]$|^(->|-->|=>)$/;
  const CONNECTOR_RE = /^[↓↑→←⬇⬆➡⬅▼▲►◄|│\s-]+$/;

  let counter = 0;
  let prevNode: DiagNode | null = null;
  let pendingArrow = false;

  for (const line of lines) {
    if (ARROW_RE.test(line)) {
      pendingArrow = true;
      continue;
    }
    if (CONNECTOR_RE.test(line) && !/[A-Za-z0-9]/.test(line)) {
      pendingArrow = pendingArrow || /[↓↑→←⬇⬆➡⬅▼▲►◄]/.test(line);
      continue;
    }

    // Deduplicate nodes with same label
    let node = nodes.find((n) => n.label === line) ?? null;
    if (!node) {
      node = { id: makeId(line, counter++), label: line, type: detectNodeType(line) };
      nodes.push(node);
    }
    if (prevNode && prevNode.id !== node.id) {
      const edgeId = `e_${prevNode.id}_${node.id}`;
      if (!edges.find((e) => e.id === edgeId)) {
        edges.push({ id: edgeId, source: prevNode.id, target: node.id, hasArrow: pendingArrow });
      }
    }
    prevNode = node;
    pendingArrow = false;
  }

  return { nodes, edges };
}

/** Parses indented bullet hierarchy (-  * •  or plain indent). */
function parseBullet(text: string): GraphModel {
  const lines = text.split('\n').filter((l) => l.trim());
  const nodes: DiagNode[] = [];
  const edges: DiagEdge[] = [];
  let counter = 0;
  const stack: Array<{ level: number; node: DiagNode }> = [];

  for (const line of lines) {
    const match = line.match(/^(\s*)([-*•]\s*)?(.+)$/);
    if (!match) continue;
    const level = match[1].length;
    const label = match[3].trim();
    if (!label) continue;

    const node: DiagNode = { id: makeId(label, counter++), label, type: detectNodeType(label) };
    nodes.push(node);

    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
    if (stack.length > 0) {
      const parent = stack[stack.length - 1].node;
      edges.push({ id: `e_${parent.id}_${node.id}`, source: parent.id, target: node.id });
    }
    stack.push({ level, node });
  }

  return { nodes, edges };
}

/** Parses Mermaid flowchart TD/LR syntax. */
function parseMermaid(text: string): GraphModel {
  const nodeMap = new Map<string, DiagNode>();
  const edges: DiagEdge[] = [];
  let counter = 0;

  const getOrCreate = (rawId: string, label?: string): DiagNode => {
    if (nodeMap.has(rawId)) return nodeMap.get(rawId)!;
    const nodeLabel = label || rawId;
    const node: DiagNode = {
      id: makeId(rawId, counter++),
      label: nodeLabel,
      type: detectNodeType(nodeLabel),
    };
    nodeMap.set(rawId, node);
    return node;
  };

  const contentLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(flowchart|graph|sequenceDiagram)\s/i.test(l));

  for (const line of contentLines) {
    // e.g.  A[Label] --> B[Label] : EdgeLabel
    const edgeMatch = line.match(
      /^(\w[\w\s-]*)(?:\[([^\]]+)\])?\s*(?:-->?|->|=>)\s*(\w[\w\s-]*)(?:\[([^\]]+)\])?(?:\s*:\s*(.+))?$/
    );
    if (edgeMatch) {
      const [, sId, sLabel, tId, tLabel, edgeLabel] = edgeMatch;
      const src = getOrCreate(sId.trim(), sLabel?.trim());
      const tgt = getOrCreate(tId.trim(), tLabel?.trim());
      edges.push({
        id: `e_${src.id}_${tgt.id}`,
        source: src.id,
        target: tgt.id,
        label: edgeLabel?.trim(),
        hasArrow: true,
      });
      continue;
    }
    // Standalone: A[Label]
    const nodeMatch = line.match(/^(\w[\w\s-]*)\[([^\]]+)\]$/);
    if (nodeMatch) getOrCreate(nodeMatch[1].trim(), nodeMatch[2].trim());
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

/** Parses PlantUML @startuml ... @enduml syntax (basic). */
function parsePlantUML(text: string): GraphModel {
  // Normalise to arrow-style and delegate
  const content = text
    .replace(/@startuml[\s\S]*?@enduml/, (m) => m)
    .replace(/@startuml/i, '')
    .replace(/@enduml/i, '')
    .replace(/\s*-+>\s*/g, ' -> ');
  return parseArrow(content);
}

// ─── Deduplication & enrichment ───────────────────────────────────────────────

function deduplicateNodeIds(model: GraphModel): GraphModel {
  const seen = new Set<string>();
  const idMap = new Map<string, string>(); // old → new
  const nodes = model.nodes.map((n, i) => {
    let id = n.id;
    if (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    idMap.set(n.id, id);
    return { ...n, id };
  });
  const edges = model.edges.map((e) => ({
    ...e,
    source: idMap.get(e.source) ?? e.source,
    target: idMap.get(e.target) ?? e.target,
  }));
  return { ...model, nodes, edges };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function parseText(text: string): GraphModel {
  const format = detectFormat(text);

  const raw: GraphModel = (() => {
    switch (format) {
      case 'mermaid':  return parseMermaid(text);
      case 'arrow':    return parseArrow(text);
      case 'bullet':   return parseBullet(text);
      case 'tree':     return parseTree(text);
      case 'ascii':    return parseAscii(text);
      case 'plantuml': return parsePlantUML(text);
      default:         return parseVertical(text);   // 'vertical'
    }
  })();

  const model = deduplicateNodeIds(raw);
  const outDegree = new Map<string, number>();
  for (const e of model.edges) {
    outDegree.set(e.source, (outDegree.get(e.source) ?? 0) + 1);
  }
  const incoming = new Map<string, number>();
  for (const e of model.edges) {
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
  }
  const children = new Map<string, string[]>();
  for (const e of model.edges) {
    const target = model.nodes.find((n) => n.id === e.target)?.label ?? '';
    const arr = children.get(e.source) ?? [];
    arr.push(target.toLowerCase());
    children.set(e.source, arr);
  }

  const choiceWord = /\b(choose|select|option|decision|branch|condition|if|validate|check|approve|reject|success|error|retry|valid|invalid|login|register|exit)\b/i;

  const nodes = model.nodes.map((n) => {
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
    ...model,
    nodes,
    metadata: {
      createdAt: new Date().toISOString(),
      layoutDirection: 'TB',
      inputFormat: format,
      originalText: text,
    },
  };
}
