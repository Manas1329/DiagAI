import dagre from 'dagre';
import { Node, Edge } from 'reactflow';

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    ranksep: 90,
    nodesep: 55,
    edgesep: 20,
    marginx: 50,
    marginy: 50,
  });

  const sizeMap = new Map<string, { width: number; height: number }>();
  nodes.forEach((n) => {
    const width = Number((n.data?.boxWidth as number) ?? 180);
    const height = Number((n.data?.boxHeight as number) ?? 72);
    const safeWidth = Math.max(120, Math.min(420, Number.isFinite(width) ? width : 180));
    const safeHeight = Math.max(48, Math.min(220, Number.isFinite(height) ? height : 72));
    sizeMap.set(n.id, { width: safeWidth, height: safeHeight });
    g.setNode(n.id, { width: safeWidth, height: safeHeight });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  const layoutedNodes = nodes.map((n) => {
    const pos = g.node(n.id);
    const size = sizeMap.get(n.id) ?? { width: 180, height: 72 };
    return {
      ...n,
      position: {
        x: Math.round(pos.x - size.width / 2),
        y: Math.round(pos.y - size.height / 2),
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
