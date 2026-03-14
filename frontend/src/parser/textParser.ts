import { GraphModel, DiagNode, DiagEdge, NodeType } from '../models/graphModel';

// ─── Node-type auto-detection patterns ────────────────────────────────────────

const NODE_TYPE_PATTERNS: Array<[NodeType, RegExp]> = [
  ['actor',         /\b(user|actor|person|client|customer|human|operator|end[\s-]?user)\b/i],
  ['database',      /\b(database|db|storage|store|cache|redis|postgres|mysql|mongo|repository|data[\s-]?store|warehouse)\b/i],
  ['observability', /\b(log|monitor|observ|metric|alert|trace|audit|analytic|telemetry|siem|splunk)\b/i],
  ['security',      /\b(auth|authenticat|authoriz|rbac|acl|permission|jwt|oauth|crypto|encrypt|security|firewall|vpn|tls|ssl|mfa)\b/i],
  ['decision',      /\b(decision|branch|condition|if|switch|gateway|check|router|validator|policy)\b/i],
  ['api',           /\b(api|rest|graphql|endpoint|gateway|webhook|http|grpc|route|proxy)\b/i],
  ['service',       /\b(service|module|component|handler|processor|worker|queue|bus|engine|pipeline|scheduler)\b/i],
];

function detectNodeType(label: string): NodeType {
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

export type InputFormat = 'arrow' | 'vertical' | 'bullet' | 'tree' | 'mermaid' | 'plantuml';

export function detectFormat(text: string): InputFormat {
  const trimmed = text.trim();
  if (/^@startuml/i.test(trimmed)) return 'plantuml';
  if (/^(flowchart|graph)\s+(TD|LR|TB|RL|BT)\b/i.test(trimmed)) return 'mermaid';
  if (/[├└│]/m.test(text)) return 'tree';
  if (/\n\s*[↓↑→←⬇⬆➡⬅▼▲►◄]\s*\n/.test(text)) return 'vertical';
  if (/->|-->|=>|→|─{2,}/.test(text)) return 'arrow';
  if (/^\s*[-*•]/m.test(text)) return 'bullet';
  // Fallback: treat line-breaks as implicit vertical flow
  return 'vertical';
}

function splitChain(line: string): string[] {
  return line
    .split(/\s*(?:->|-->|=>|→|─{2,})\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
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
    const parts = splitChain(line);
    if (parts.length < 2) continue;
    for (let i = 0; i < parts.length - 1; i++) {
      const src = getOrCreate(parts[i]);
      const tgt = getOrCreate(parts[i + 1]);
      const edgeId = `e_${src.id}_${tgt.id}`;
      if (!edges.find((e) => e.id === edgeId)) {
        edges.push({ id: edgeId, source: src.id, target: tgt.id });
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
  let pendingDown = false;
  let lastNode: DiagNode | null = null;

  const getOrCreate = (label: string): DiagNode => {
    const existing = Array.from(nodeMap.values()).find((n) => n.label === label);
    if (existing) return existing;
    const node: DiagNode = { id: makeId(label, counter++), label, type: detectNodeType(label) };
    nodeMap.set(node.id, node);
    return node;
  };

  const addEdge = (source: string, target: string) => {
    if (source === target) return;
    const id = `e_${source}_${target}`;
    if (!edges.some((e) => e.id === id)) edges.push({ id, source, target });
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
      if (/[↓⬇]/.test(trimmed)) pendingDown = true;
      continue;
    }

    const level = getIndentLevel(rawLine);
    let content = cleanContent(rawLine);
    if (!content) continue;

    const parts = splitChain(content);
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
    if (pendingDown && lastNode) {
      addEdge(lastNode.id, firstNode.id);
    } else if (parent) {
      addEdge(parent.id, firstNode.id);
    }

    let prev = firstNode;
    for (let i = 1; i < parts.length; i++) {
      const next = getOrCreate(parts[i]);
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

/** Parses vertical ↓ arrow-between-lines format (or plain line-per-node). */
function parseVertical(text: string): GraphModel {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const nodes: DiagNode[] = [];
  const edges: DiagEdge[] = [];
  const ARROW_RE = /^[↓↑→←⬇⬆➡⬅▼▲►◄]$|^(->|-->|=>)$/;

  let counter = 0;
  let prevNode: DiagNode | null = null;

  for (const line of lines) {
    if (ARROW_RE.test(line)) continue; // skip standalone arrow lines

    // Deduplicate nodes with same label
    let node = nodes.find((n) => n.label === line) ?? null;
    if (!node) {
      node = { id: makeId(line, counter++), label: line, type: detectNodeType(line) };
      nodes.push(node);
    }
    if (prevNode && prevNode.id !== node.id) {
      const edgeId = `e_${prevNode.id}_${node.id}`;
      if (!edges.find((e) => e.id === edgeId)) {
        edges.push({ id: edgeId, source: prevNode.id, target: node.id });
      }
    }
    prevNode = node;
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
      case 'plantuml': return parsePlantUML(text);
      default:         return parseVertical(text);   // 'vertical'
    }
  })();

  const model = deduplicateNodeIds(raw);

  return {
    ...model,
    metadata: {
      createdAt: new Date().toISOString(),
      layoutDirection: 'TB',
      inputFormat: format,
      originalText: text,
    },
  };
}
