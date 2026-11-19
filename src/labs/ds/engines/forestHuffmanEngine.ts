import type { SimStep } from '../../../types/core';
import type { BinaryNodeData, GeneralTreeData } from '../../../utils/treeLayout';

export interface ForestNode {
  id: string;
  label: string;
  children: ForestNode[];
}

let fSeq = 1;
export function genFId() {
  return `fn_${fSeq++}`;
}

export function parseForestString(input: string): ForestNode[] {
  const parts = input
    .split(/[;；]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return [];

  const parseOne = (str: string): ForestNode => {
    const s = str.replace(/\s+/g, '');
    let pos = 0;
    const readNode = (): ForestNode => {
      let label = '';
      while (pos < s.length && !['(', ')', ','].includes(s[pos])) {
        label += s[pos++];
      }
      if (!label) throw new Error('节点标签不能为空');
      const node: ForestNode = { id: genFId(), label, children: [] };
      if (pos < s.length && s[pos] === '(') {
        pos++;
        while (pos < s.length && s[pos] !== ')') {
          node.children.push(readNode());
          if (pos < s.length && s[pos] === ',') pos++;
        }
        if (pos < s.length && s[pos] === ')') pos++;
        else throw new Error('括号不匹配，缺少 ")"');
      }
      return node;
    };
    const res = readNode();
    if (pos < s.length) throw new Error(`多余字符 "${s.slice(pos)}"`);
    return res;
  };

  return parts.map(parseOne);
}

export function serializeForest(roots: ForestNode[]): string {
  const ser = (n: ForestNode): string => {
    if (n.children.length === 0) return n.label;
    return `${n.label}(${n.children.map(ser).join(',')})`;
  };
  return roots.map(ser).join('; ');
}

export function forestToGeneralLayout(roots: ForestNode[], activeId?: string): GeneralTreeData[] {
  const conv = (n: ForestNode): GeneralTreeData => ({
    id: n.id,
    label: n.label,
    highlight: n.id === activeId ? 'active' : undefined,
    children: n.children.map(conv),
  });
  return roots.map(conv);
}

export function convertForestToBinary(roots: ForestNode[]): BinaryNodeData | null {
  if (roots.length === 0) return null;

  const convTree = (node: ForestNode): BinaryNodeData => {
    const bNode: BinaryNodeData = {
      id: node.id,
      label: node.label,
      left: null,
      right: null,
    };
    if (node.children.length > 0) {
      bNode.left = convTree(node.children[0]);
      let cur = bNode.left;
      for (let i = 1; i < node.children.length; i++) {
        cur.right = convTree(node.children[i]);
        cur = cur.right;
      }
    }
    return bNode;
  };

  const bRoots = roots.map(convTree);
  for (let i = 0; i < bRoots.length - 1; i++) {
    bRoots[i].right = bRoots[i + 1];
  }
  return bRoots[0];
}

export interface ForestStepState {
  generalRoots: GeneralTreeData[];
  binaryRoot: BinaryNodeData | null;
}

export function simulateForestToBinary(roots: ForestNode[]): SimStep<ForestStepState>[] {
  const steps: SimStep<ForestStepState>[] = [];
  if (roots.length === 0) return steps;

  const fullBinary = convertForestToBinary(roots);
  const revealed = new Set<string>();

  const filterBin = (n: BinaryNodeData | null, activeId?: string): BinaryNodeData | null => {
    if (!n || !revealed.has(n.id)) return null;
    return {
      ...n,
      highlight: n.id === activeId ? 'active' : 'visited',
      left: filterBin(n.left ?? null, activeId),
      right: filterBin(n.right ?? null, activeId),
    };
  };

  steps.push({
    title: '准备转换森林为二叉树',
    description: `森林共 ${roots.length} 棵树。规则：每个节点左指针指向长子，右指针指向右邻兄弟（各树根互为兄弟）。`,
    codeLine: 1,
    state: { generalRoots: forestToGeneralLayout(roots), binaryRoot: null },
  });

  // Pre-order reveal of the converted binary tree
  const walk = (b: BinaryNodeData | null, reason: string) => {
    if (!b) return;
    revealed.add(b.id);
    steps.push({
      title: `链接节点 ${b.label}`,
      description: reason,
      codeLine: 4,
      state: {
        generalRoots: forestToGeneralLayout(roots, b.id),
        binaryRoot: filterBin(fullBinary, b.id),
      },
    });
    if (b.left) walk(b.left, `${b.label} 的第一个孩子是 ${b.left.label} → 挂为 ${b.label} 的左孩子。`);
    if (b.right) walk(b.right, `${b.label} 的右兄弟/下一棵树根是 ${b.right.label} → 挂为 ${b.label} 的右孩子。`);
  };

  walk(fullBinary, `取第一棵树的根 ${fullBinary?.label} 作为最终二叉树的根节点。`);

  steps.push({
    title: '森林转换二叉树完成',
    description: `原森林的先根序列与右图二叉树先序相同；原森林的中序（各树后根）与右图二叉树中序相同。`,
    codeLine: 8,
    state: {
      generalRoots: forestToGeneralLayout(roots),
      binaryRoot: fullBinary,
    },
  });
  return steps;
}

export interface HuffmanEntry {
  symbol: string;
  weight: number;
  code: string;
}

export interface HuffmanStepState {
  forestRoots: BinaryNodeData[];
  codes: HuffmanEntry[];
  wpl: number;
  wplTerms: string[];
}

export function simulateHuffman(input: string): { steps: SimStep<HuffmanStepState>[]; error?: string } {
  const tokens = input
    .split(/[,，;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (tokens.length < 2) {
    return { steps: [], error: '至少需要 2 个权值节点才能构造哈夫曼树！' };
  }

  interface HNode {
    id: string;
    symbol?: string;
    weight: number;
    left: HNode | null;
    right: HNode | null;
  }

  const items: HNode[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    const parts = tk.split(/[:：\s]+/);
    let sym = '';
    let w = NaN;
    if (parts.length >= 2) {
      sym = parts[0];
      w = Number(parts[1]);
    } else {
      sym = `w${i + 1}`;
      w = Number(parts[0]);
    }
    if (!Number.isFinite(w) || w <= 0) {
      return { steps: [], error: `权值 "${tk}" 必须为正数` };
    }
    items.push({ id: `hf_${i}`, symbol: sym, weight: w, left: null, right: null });
  }

  const toBin = (n: HNode, newId?: string, chosenIds?: Set<string>): BinaryNodeData => ({
    id: n.id,
    label: n.symbol ? `${n.symbol}:${n.weight}` : `${n.weight}`,
    highlight: n.id === newId ? 'new' : chosenIds?.has(n.id) ? 'active' : undefined,
    left: n.left ? toBin(n.left, newId, chosenIds) : null,
    right: n.right ? toBin(n.right, newId, chosenIds) : null,
  });

  const steps: SimStep<HuffmanStepState>[] = [];
  let pool: HNode[] = [...items].sort((a, b) => a.weight - b.weight);
  let internalSeq = 1;
  let wpl = 0;
  const wplTerms: string[] = [];

  steps.push({
    title: '初始化单节点森林并按权值升序排列',
    description: `共 ${pool.length} 个带权叶节点：${pool.map((p) => `${p.symbol}(${p.weight})`).join(', ')}`,
    codeLine: 1,
    state: {
      forestRoots: pool.map((p) => toBin(p)),
      codes: [],
      wpl: 0,
      wplTerms: [],
    },
  });

  while (pool.length > 1) {
    pool.sort((a, b) => a.weight - b.weight);
    const min1 = pool.shift()!;
    const min2 = pool.shift()!;
    const sum = Number((min1.weight + min2.weight).toFixed(2));
    const parent: HNode = {
      id: `h_int_${internalSeq++}`,
      weight: sum,
      left: min1,
      right: min2,
    };
    wpl = Number((wpl + sum).toFixed(2));
    wplTerms.push(String(sum));
    pool.push(parent);

    const chosen = new Set([min1.id, min2.id]);
    steps.push({
      title: `合并最小两棵树：${min1.weight} + ${min2.weight} = ${sum}`,
      description: `选出当前最小权值 ${min1.weight}（左枝 0）与 ${min2.weight}（右枝 1）合并为新节点 ${sum}，WPL 累加 ${sum}。`,
      codeLine: 4,
      state: {
        forestRoots: pool.map((p) => toBin(p, parent.id, chosen)),
        codes: [],
        wpl,
        wplTerms: [...wplTerms],
      },
    });
  }

  const finalTree = pool[0];
  const codes: HuffmanEntry[] = [];
  const collectCodes = (n: HNode | null, prefix: string) => {
    if (!n) return;
    if (!n.left && !n.right) {
      codes.push({ symbol: n.symbol || String(n.weight), weight: n.weight, code: prefix || '0' });
      return;
    }
    collectCodes(n.left, prefix + '0');
    collectCodes(n.right, prefix + '1');
  };
  collectCodes(finalTree, '');
  codes.sort((a, b) => a.weight - b.weight);

  const annotateTree = (n: HNode): BinaryNodeData => ({
    id: n.id,
    label: n.symbol ? `${n.symbol}` : `${n.weight}`,
    badge: n.symbol ? `${n.weight}` : undefined,
    highlight: !n.left && !n.right ? 'found' : undefined,
    left: n.left ? annotateTree(n.left) : null,
    right: n.right ? annotateTree(n.right) : null,
  });

  steps.push({
    title: `哈夫曼树构造完毕，最小 WPL = ${wpl}`,
    description: `所有叶节点均得到唯一前缀编码（左分支标 0，右分支标 1），WPL = ${wplTerms.join(' + ')} = ${wpl}。`,
    codeLine: 7,
    state: {
      forestRoots: [annotateTree(finalTree)],
      codes,
      wpl,
      wplTerms,
    },
  });

  return { steps };
}

export interface DsuStepState {
  parent: number[];
  size: number[];
  roots: GeneralTreeData[];
  maxHeight: number;
}

export function simulateUnionFind(
  n: number,
  opsStr: string,
  optimize: boolean
): SimStep<DsuStepState>[] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const size = Array.from({ length: n }, () => 1);
  const steps: SimStep<DsuStepState>[] = [];

  const buildForest = (activeSet?: Set<number>): { roots: GeneralTreeData[]; maxHeight: number } => {
    const map = new Map<number, GeneralTreeData>();
    for (let i = 0; i < n; i++) {
      map.set(i, {
        id: `dsu_${i}`,
        label: String(i),
        badge: parent[i] === i ? (optimize ? `sz:${size[i]}` : 'root') : undefined,
        highlight: activeSet?.has(i) ? 'active' : undefined,
        children: [],
      });
    }
    const roots: GeneralTreeData[] = [];
    for (let i = 0; i < n; i++) {
      if (parent[i] === i) {
        roots.push(map.get(i)!);
      } else {
        map.get(parent[i])!.children!.push(map.get(i)!);
      }
    }
    const heightOf = (node: GeneralTreeData): number => {
      if (!node.children || node.children.length === 0) return 1;
      return 1 + Math.max(...node.children.map(heightOf));
    };
    const maxHeight = roots.length ? Math.max(...roots.map(heightOf)) : 0;
    return { roots, maxHeight };
  };

  const snap = (title: string, description: string, codeLine: number, active?: number[]) => {
    const { roots, maxHeight } = buildForest(active ? new Set(active) : undefined);
    steps.push({
      title,
      description,
      codeLine,
      state: { parent: [...parent], size: [...size], roots, maxHeight },
    });
  };

  snap(
    '初始化并查集',
    `共 ${n} 个独立单节点集合 0..${n - 1}，当前模式：${optimize ? '按大小(Size)合并 + Find路径压缩' : '朴素合并(直接挂载)无压缩'}。`,
    1
  );

  const find = (x: number): number => {
    if (!optimize) {
      let cur = x;
      while (parent[cur] !== cur) cur = parent[cur];
      return cur;
    }
    let root = x;
    while (parent[root] !== root) root = parent[root];
    let cur = x;
    while (cur !== root) {
      const nxt = parent[cur];
      parent[cur] = root;
      cur = nxt;
    }
    return root;
  };

  const lines = opsStr
    .split(/[;,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const op of lines) {
    const uMatch = op.match(/^u(?:nion)?\s*\(?\s*(\d+)\s*[\s,]\s*(\d+)\s*\)?$/i);
    const fMatch = op.match(/^f(?:ind)?\s*\(?\s*(\d+)\s*\)?$/i);
    if (uMatch) {
      const a = Number(uMatch[1]);
      const b = Number(uMatch[2]);
      if (a >= 0 && a < n && b >= 0 && b < n) {
        const ra = find(a);
        const rb = find(b);
        if (ra === rb) {
          snap(`Union(${a}, ${b})：已在同一集合`, `${a} 和 ${b} 的根均为 ${ra}，无需合并。`, 4, [a, b, ra]);
        } else {
          if (optimize) {
            if (size[ra] < size[rb]) {
              parent[ra] = rb;
              size[rb] += size[ra];
              snap(`Union(${a}, ${b})：小树 ${ra} 并入大树 ${rb}`, `按 Size 优化：${ra}(sz=${size[ra]}) 并入 ${rb}，合并后根 ${rb} 规模为 ${size[rb]}。`, 6, [ra, rb]);
            } else {
              parent[rb] = ra;
              size[ra] += size[rb];
              snap(`Union(${a}, ${b})：小树 ${rb} 并入大树 ${ra}`, `按 Size 优化：${rb}(sz=${size[rb]}) 并入 ${ra}，合并后根 ${ra} 规模为 ${size[ra]}。`, 6, [ra, rb]);
            }
          } else {
            parent[rb] = ra;
            size[ra] += size[rb];
            snap(`朴素 Union(${a}, ${b})：${rb} 挂到 ${ra} 下`, `未按秩合并，直接令 parent[${rb}] = ${ra}。`, 6, [ra, rb]);
          }
        }
      }
    } else if (fMatch) {
      const x = Number(fMatch[1]);
      if (x >= 0 && x < n) {
        const r = find(x);
        snap(
          `Find(${x}) -> 根 ${r}`,
          optimize ? `查找 ${x} 的根为 ${r}，沿途节点已直接挂到根 ${r} 下（路径压缩）！` : `查找 ${x} 的根为 ${r}（无压缩）。`,
          8,
          [x, r]
        );
      }
    }
  }

  return steps;
}
