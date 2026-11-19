import { hierarchy, tree } from 'd3-hierarchy';
import type { SimStep } from '../../../types/core';

export interface BNode {
  id: string;
  keys: number[];
  children: BNode[];
  highlight?: 'active' | 'overflow' | 'underflow' | 'new';
}

export interface BPlusNode {
  id: string;
  keys: number[];
  isLeaf: boolean;
  children: BPlusNode[];
}

let bSeq = 1;
const bid = () => `bt_${bSeq++}`;

function cloneB(n: BNode | null): BNode | null {
  if (!n) return null;
  return {
    id: n.id,
    keys: [...n.keys],
    highlight: n.highlight,
    children: n.children.map((c) => cloneB(c)!),
  };
}

function clearHighlights(n: BNode | null) {
  if (!n) return;
  n.highlight = undefined;
  n.children.forEach(clearHighlights);
}

export interface BTreeStepState {
  root: BNode | null;
  order: number;
  minKeys: number;
  maxKeys: number;
}

export interface BTreeOp {
  type: 'ins' | 'del';
  key: number;
}

export function parseBTreeOps(str: string): BTreeOp[] {
  const parts = str
    .split(/[\s,，;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const ops: BTreeOp[] = [];
  for (const p of parts) {
    if (p.toLowerCase().startsWith('del:') || p.startsWith('-')) {
      const num = Number(p.replace(/^del:/i, '').replace(/^-/, ''));
      if (Number.isFinite(num)) ops.push({ type: 'del', key: num });
    } else {
      const num = Number(p.replace(/^ins:/i, '').replace(/^\+/, ''));
      if (Number.isFinite(num)) ops.push({ type: 'ins', key: num });
    }
  }
  return ops;
}

export function simulateBTree(ops: BTreeOp[], m: number): SimStep<BTreeStepState>[] {
  const order = Math.max(3, Math.min(5, m));
  const maxKeys = order - 1;
  const minKeys = Math.ceil(order / 2) - 1;
  const splitIdx = Math.ceil(order / 2) - 1; // 0-based index of promoted key when length === order

  const steps: SimStep<BTreeStepState>[] = [];
  let root: BNode | null = null;

  const snap = (title: string, description: string, codeLine: number) => {
    steps.push({
      title,
      description,
      codeLine,
      state: { root: cloneB(root), order, minKeys, maxKeys },
    });
  };

  snap(
    `初始化 ${order} 阶 B-树`,
    `每个非根节点最少 ${minKeys} 个关键字、最多 ${maxKeys} 个关键字；节点满 ${order} 个触发上溢分裂（取第 ${splitIdx + 1} 个关键字上升）。`,
    1
  );

  const insertKey = (key: number) => {
    if (!root) {
      root = { id: bid(), keys: [key], children: [], highlight: 'new' };
      snap(`创建根节点并插入 ${key}`, `空树插入首个关键字 ${key}。`, 3);
      clearHighlights(root);
      return;
    }

    // Find leaf path
    const path: { node: BNode; childIdx: number }[] = [];
    let cur = root;
    while (cur.children.length > 0) {
      let i = 0;
      while (i < cur.keys.length && key > cur.keys[i]) i++;
      if (i < cur.keys.length && cur.keys[i] === key) {
        cur.highlight = 'active';
        snap(`关键字 ${key} 已存在`, `在节点 [${cur.keys.join(', ')}] 中已存在 ${key}，跳过插入。`, 3);
        clearHighlights(root);
        return;
      }
      path.push({ node: cur, childIdx: i });
      cur = cur.children[i];
    }

    if (cur.keys.includes(key)) {
      cur.highlight = 'active';
      snap(`关键字 ${key} 已存在`, `终端节点 [${cur.keys.join(', ')}] 已包含 ${key}。`, 3);
      clearHighlights(root);
      return;
    }

    // Insert sorted into leaf
    cur.keys.push(key);
    cur.keys.sort((a, b) => a - b);
    cur.highlight = cur.keys.length > maxKeys ? 'overflow' : 'new';

    if (cur.keys.length <= maxKeys) {
      snap(`向终端节点插入 ${key}`, `节点 [${cur.keys.join(', ')}] 关键字数未超 ${maxKeys}，直接插入完成。`, 4);
      clearHighlights(root);
      return;
    }

    snap(
      `触发上溢：节点 [${cur.keys.join(', ')}] 达到 ${order} 个关键字`,
      `超过上限 ${maxKeys}！按 ⌈${order}/2⌉ 规则将第 ${splitIdx + 1} 个关键字 (${cur.keys[splitIdx]}) 上升至父节点。`,
      5
    );

    // Split upward
    let overflowNode = cur;
    while (overflowNode.keys.length > maxKeys) {
      const upKey = overflowNode.keys[splitIdx];
      const leftKeys = overflowNode.keys.slice(0, splitIdx);
      const rightKeys = overflowNode.keys.slice(splitIdx + 1);
      const leftChildren = overflowNode.children.slice(0, splitIdx + 1);
      const rightChildren = overflowNode.children.slice(splitIdx + 1);

      overflowNode.keys = leftKeys;
      overflowNode.children = leftChildren;
      overflowNode.highlight = 'active';

      const rightNode: BNode = {
        id: bid(),
        keys: rightKeys,
        children: rightChildren,
        highlight: 'new',
      };

      if (path.length === 0) {
        const newRoot: BNode = {
          id: bid(),
          keys: [upKey],
          children: [overflowNode, rightNode],
          highlight: 'new',
        };
        root = newRoot;
        snap(
          `分裂生成新根 [${upKey}]，树高 +1`,
          `原根节点分裂为 [${leftKeys.join(',')}] 与 [${rightKeys.join(',')}]，关键字 ${upKey} 成为新根！`,
          7
        );
        clearHighlights(root);
        break;
      } else {
        const parentEntry = path.pop()!;
        const parent = parentEntry.node;
        const idx = parentEntry.childIdx;
        parent.keys.splice(idx, 0, upKey);
        parent.children.splice(idx + 1, 0, rightNode);
        parent.highlight = parent.keys.length > maxKeys ? 'overflow' : 'active';

        snap(
          `关键字 ${upKey} 上移至父节点`,
          `左右分裂为 [${leftKeys.join(',')}] 与 [${rightKeys.join(',')}]，${upKey} 插入父节点形成 [${parent.keys.join(',')}]。`,
          6
        );
        if (parent.keys.length <= maxKeys) {
          clearHighlights(root);
          break;
        }
        overflowNode = parent;
      }
    }
  };

  const deleteKey = (key: number) => {
    if (!root) return;
    // Locate node containing key
    const path: { node: BNode; childIdx: number }[] = [];
    let cur: BNode | null = root;
    let foundIdx = -1;

    while (cur) {
      let i = 0;
      while (i < cur.keys.length && key > cur.keys[i]) i++;
      if (i < cur.keys.length && cur.keys[i] === key) {
        foundIdx = i;
        break;
      }
      if (cur.children.length === 0) {
        snap(`删除失败：未找到 ${key}`, `B-树中不存在关键字 ${key}。`, 9);
        return;
      }
      path.push({ node: cur, childIdx: i });
      cur = cur.children[i];
    }

    if (!cur || foundIdx === -1) return;

    // If internal node, replace with predecessor (rightmost of left child)
    if (cur.children.length > 0) {
      const internal = cur;
      path.push({ node: internal, childIdx: foundIdx });
      let pred = internal.children[foundIdx];
      while (pred.children.length > 0) {
        const lastIdx = pred.children.length - 1;
        path.push({ node: pred, childIdx: lastIdx });
        pred = pred.children[lastIdx];
      }
      const predVal = pred.keys[pred.keys.length - 1];
      internal.keys[foundIdx] = predVal;
      pred.keys.pop();
      internal.highlight = 'active';
      pred.highlight = pred.keys.length < minKeys ? 'underflow' : 'active';
      snap(
        `内部节点删除 ${key} → 用直接前驱 ${predVal} 替换`,
        `用左子树最大关键字 ${predVal} 替换 ${key}，转化为删除终端节点中的 ${predVal}。`,
        10
      );
      cur = pred;
    } else {
      cur.keys.splice(foundIdx, 1);
      cur.highlight = cur !== root && cur.keys.length < minKeys ? 'underflow' : 'active';
      snap(
        `从终端节点删除 ${key}`,
        cur === root || cur.keys.length >= minKeys
          ? `删除 ${key} 后关键字数满足下限要求。`
          : `删除 ${key} 后关键字数 (${cur.keys.length}) 低于下限 ${minKeys}，触发下溢调整！`,
        11
      );
    }

    // Handle underflow upward
    while (cur !== root && cur.keys.length < minKeys) {
      const parentEntry = path.pop()!;
      const parent = parentEntry.node;
      const idx = parentEntry.childIdx;
      const leftSib = idx > 0 ? parent.children[idx - 1] : null;
      const rightSib = idx < parent.children.length - 1 ? parent.children[idx + 1] : null;

      if (leftSib && leftSib.keys.length > minKeys) {
        const borrowed = leftSib.keys.pop()!;
        const sep = parent.keys[idx - 1];
        parent.keys[idx - 1] = borrowed;
        cur.keys.unshift(sep);
        if (leftSib.children.length > 0) {
          cur.children.unshift(leftSib.children.pop()!);
        }
        clearHighlights(root);
        cur.highlight = 'new';
        snap(
          `向丰满左兄弟借位 (${borrowed})`,
          `父分隔键 ${sep} 下移至当前节点，左兄弟最大键 ${borrowed} 上移补位。`,
          12
        );
        break;
      } else if (rightSib && rightSib.keys.length > minKeys) {
        const borrowed = rightSib.keys.shift()!;
        const sep = parent.keys[idx];
        parent.keys[idx] = borrowed;
        cur.keys.push(sep);
        if (rightSib.children.length > 0) {
          cur.children.push(rightSib.children.shift()!);
        }
        clearHighlights(root);
        cur.highlight = 'new';
        snap(
          `向丰满右兄弟借位 (${borrowed})`,
          `父分隔键 ${sep} 下移至当前节点，右兄弟最小键 ${borrowed} 上移补位。`,
          12
        );
        break;
      } else if (leftSib) {
        const sep = parent.keys.splice(idx - 1, 1)[0];
        leftSib.keys.push(sep, ...cur.keys);
        leftSib.children.push(...cur.children);
        parent.children.splice(idx, 1);
        clearHighlights(root);
        leftSib.highlight = 'active';
        snap(
          `与左兄弟及父分隔键 ${sep} 合并`,
          `左右兄弟均不够借，将左兄弟、父分隔键 ${sep} 与当前节点合并为 [${leftSib.keys.join(',')}]。`,
          13
        );
        cur = parent;
      } else if (rightSib) {
        const sep = parent.keys.splice(idx, 1)[0];
        cur.keys.push(sep, ...rightSib.keys);
        cur.children.push(...rightSib.children);
        parent.children.splice(idx + 1, 1);
        clearHighlights(root);
        cur.highlight = 'active';
        snap(
          `与右兄弟及父分隔键 ${sep} 合并`,
          `左右兄弟均不够借，将当前节点、父分隔键 ${sep} 与右兄弟合并为 [${cur.keys.join(',')}]。`,
          13
        );
        cur = parent;
      }
    }

    if (root && root.keys.length === 0) {
      if (root.children.length > 0) {
        root = root.children[0];
        clearHighlights(root);
        snap('原根节点已空，树高 -1', `合并导致原根变空，其唯一孩子成为新根！`, 14);
      } else {
        root = null;
        snap('B-树已清空', `最后一个关键字已删除。`, 14);
      }
    } else {
      clearHighlights(root);
    }
  };

  for (const op of ops) {
    if (op.type === 'ins') insertKey(op.key);
    else deleteKey(op.key);
  }

  return steps;
}

export interface BTreeLayoutNode {
  id: string;
  keys: number[];
  x: number;
  y: number;
  width: number;
  highlight?: BNode['highlight'];
}

export interface BTreeLayoutEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function layoutBTree(root: BNode | null) {
  if (!root) return { nodes: [] as BTreeLayoutNode[], edges: [] as BTreeLayoutEdge[], width: 560, height: 260 };

  const h = hierarchy<BNode>(root, (d) => (d.children.length > 0 ? d.children : undefined));
  const laid = tree<BNode>()
    .nodeSize([148, 92])
    .separation((a, b) => {
      const wa = Math.max(1, a.data.keys.length);
      const wb = Math.max(1, b.data.keys.length);
      return (wa + wb) * 0.25 + (a.parent === b.parent ? 0.5 : 0.75);
    })(h);

  const desc = laid.descendants();
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = 0;
  for (const d of desc) {
    if (d.x < minX) minX = d.x;
    if (d.x > maxX) maxX = d.x;
    if (d.y > maxY) maxY = d.y;
  }
  const padX = 95;
  const padY = 48;
  const shiftX = -minX + padX;

  const posMap = new Map<string, { x: number; y: number; width: number }>();
  const nodes: BTreeLayoutNode[] = desc.map((d) => {
    const w = Math.max(46, d.data.keys.length * 32 + 16);
    const x = d.x + shiftX;
    const y = d.y + padY;
    posMap.set(d.data.id, { x, y, width: w });
    return {
      id: d.data.id,
      keys: d.data.keys,
      x,
      y,
      width: w,
      highlight: d.data.highlight,
    };
  });

  const edges: BTreeLayoutEdge[] = [];
  for (const d of desc) {
    if (d.parent) {
      const p = posMap.get(d.parent.data.id)!;
      const c = posMap.get(d.data.id)!;
      edges.push({ x1: p.x, y1: p.y + 18, x2: c.x, y2: c.y - 18 });
    }
  }

  return {
    nodes,
    edges,
    width: Math.max(600, maxX - minX + padX * 2),
    height: Math.max(280, maxY + padY * 2 + 20),
  };
}
