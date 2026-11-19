import { hierarchy, tree } from 'd3-hierarchy';

export interface BinaryNodeData {
  id: string;
  label: string;
  left?: BinaryNodeData | null;
  right?: BinaryNodeData | null;
  // Optional metadata for AVL / RB / Huffman / Threading
  badge?: string;
  colorTag?: 'red' | 'black' | 'default';
  highlight?: 'active' | 'visited' | 'imbalanced' | 'rotated' | 'found' | 'new';
  subLabel?: string;
}

export interface LayoutNode {
  id: string;
  label: string;
  x: number;
  y: number;
  parentId?: string;
  side?: 'left' | 'right';
  badge?: string;
  colorTag?: 'red' | 'black' | 'default';
  highlight?: BinaryNodeData['highlight'];
  subLabel?: string;
  hasLeft: boolean;
  hasRight: boolean;
}

export interface LayoutEdge {
  fromId: string;
  toId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  side: 'left' | 'right';
}

export interface ThreadLink {
  fromId: string;
  toId: string;
  kind: 'pred' | 'succ';
}

interface InternalDatum {
  id: string;
  label: string;
  isGhost?: boolean;
  side?: 'left' | 'right';
  raw?: BinaryNodeData;
  children?: InternalDatum[];
}

/**
 * Converts a binary tree into a d3-hierarchy tree where left vs right child
 * orientation is strictly preserved by inserting invisible ghost spacers
 * whenever a node has only one child!
 */
export function layoutBinaryTree(
  root: BinaryNodeData | null | undefined,
  opts?: { nodeGapX?: number; levelGapY?: number; paddingX?: number; paddingY?: number }
): { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number } {
  if (!root) {
    return { nodes: [], edges: [], width: 640, height: 300 };
  }

  const nodeGapX = opts?.nodeGapX ?? 64;
  const levelGapY = opts?.levelGapY ?? 84;
  const paddingX = opts?.paddingX ?? 60;
  const paddingY = opts?.paddingY ?? 48;

  let ghostSeq = 0;
  const toInternal = (node: BinaryNodeData, side?: 'left' | 'right'): InternalDatum => {
    const hasL = !!node.left;
    const hasR = !!node.right;
    const children: InternalDatum[] = [];
    if (hasL || hasR) {
      if (node.left) {
        children.push(toInternal(node.left, 'left'));
      } else {
        children.push({ id: `__ghost_${++ghostSeq}`, label: '', isGhost: true, side: 'left' });
      }
      if (node.right) {
        children.push(toInternal(node.right, 'right'));
      } else {
        children.push({ id: `__ghost_${++ghostSeq}`, label: '', isGhost: true, side: 'right' });
      }
    }
    return {
      id: node.id,
      label: node.label,
      side,
      raw: node,
      children: children.length > 0 ? children : undefined,
    };
  };

  const rootDatum = toInternal(root);
  const h = hierarchy<InternalDatum>(rootDatum);
  const treeLayout = tree<InternalDatum>().nodeSize([nodeGapX, levelGapY]);
  const laid = treeLayout(h);

  const realDesc = laid.descendants().filter((d) => !d.data.isGhost);
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = 0;
  for (const d of realDesc) {
    if (d.x < minX) minX = d.x;
    if (d.x > maxX) maxX = d.x;
    if (d.y > maxY) maxY = d.y;
  }
  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(maxX)) maxX = 0;

  const shiftX = -minX + paddingX;
  const shiftY = paddingY;

  const posMap = new Map<string, { x: number; y: number }>();
  const nodes: LayoutNode[] = realDesc.map((d) => {
    const x = d.x + shiftX;
    const y = d.y + shiftY;
    posMap.set(d.data.id, { x, y });
    return {
      id: d.data.id,
      label: d.data.label,
      x,
      y,
      parentId: d.parent?.data.id,
      side: d.data.side,
      badge: d.data.raw?.badge,
      colorTag: d.data.raw?.colorTag,
      highlight: d.data.raw?.highlight,
      subLabel: d.data.raw?.subLabel,
      hasLeft: !!d.data.raw?.left,
      hasRight: !!d.data.raw?.right,
    };
  });

  const edges: LayoutEdge[] = [];
  for (const n of nodes) {
    if (n.parentId && n.side) {
      const p = posMap.get(n.parentId);
      if (p) {
        edges.push({
          fromId: n.parentId,
          toId: n.id,
          x1: p.x,
          y1: p.y,
          x2: n.x,
          y2: n.y,
          side: n.side,
        });
      }
    }
  }

  return {
    nodes,
    edges,
    width: Math.max(560, maxX - minX + paddingX * 2),
    height: Math.max(280, maxY + paddingY * 2 + 24),
  };
}

export interface GeneralTreeData {
  id: string;
  label: string;
  children?: GeneralTreeData[];
  highlight?: 'active' | 'visited' | 'new' | 'found';
  badge?: string;
}

export function layoutGeneralTree(
  roots: GeneralTreeData[],
  opts?: { nodeGapX?: number; levelGapY?: number; treeGap?: number }
) {
  const nodeGapX = opts?.nodeGapX ?? 68;
  const levelGapY = opts?.levelGapY ?? 82;
  const treeGap = opts?.treeGap ?? 70;
  const paddingX = 56;
  const paddingY = 48;

  const allNodes: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    parentId?: string;
    highlight?: GeneralTreeData['highlight'];
    badge?: string;
  }> = [];
  const allEdges: Array<{ fromId: string; toId: string; x1: number; y1: number; x2: number; y2: number }> = [];

  let cursorX = paddingX;
  let maxY = 220;

  for (const r of roots) {
    const h = hierarchy<GeneralTreeData>(r);
    const laid = tree<GeneralTreeData>().nodeSize([nodeGapX, levelGapY])(h);
    const desc = laid.descendants();
    let minX = Infinity;
    let maxX = -Infinity;
    for (const d of desc) {
      if (d.x < minX) minX = d.x;
      if (d.x > maxX) maxX = d.x;
      if (d.y + paddingY > maxY) maxY = d.y + paddingY;
    }
    const shiftX = cursorX - minX;
    const pos = new Map<string, { x: number; y: number }>();

    for (const d of desc) {
      const x = d.x + shiftX;
      const y = d.y + paddingY;
      pos.set(d.data.id, { x, y });
      allNodes.push({
        id: d.data.id,
        label: d.data.label,
        x,
        y,
        parentId: d.parent?.data.id,
        highlight: d.data.highlight,
        badge: d.data.badge,
      });
    }
    for (const d of desc) {
      if (d.parent) {
        const p = pos.get(d.parent.data.id)!;
        const c = pos.get(d.data.id)!;
        allEdges.push({ fromId: d.parent.data.id, toId: d.data.id, x1: p.x, y1: p.y, x2: c.x, y2: c.y });
      }
    }
    cursorX += maxX - minX + treeGap;
  }

  return {
    nodes: allNodes,
    edges: allEdges,
    width: Math.max(580, cursorX),
    height: Math.max(280, maxY + 60),
  };
}
