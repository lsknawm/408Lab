import type { SimStep } from '../../../types/core';
import type { BinaryNodeData, ThreadLink } from '../../../utils/treeLayout';

export interface RawBNode {
  id: string;
  label: string;
  left: RawBNode | null;
  right: RawBNode | null;
}

let uidSeq = 1;
export function genNodeId(): string {
  return `n_${uidSeq++}`;
}

export function cloneTree(node: RawBNode | null): RawBNode | null {
  if (!node) return null;
  return {
    id: node.id,
    label: node.label,
    left: cloneTree(node.left),
    right: cloneTree(node.right),
  };
}

export function toVisualTree(
  node: RawBNode | null,
  opts?: {
    activeId?: string | null;
    visitedIds?: Set<string>;
    newId?: string | null;
    subLabels?: Record<string, string>;
  }
): BinaryNodeData | null {
  if (!node) return null;
  let highlight: BinaryNodeData['highlight'];
  if (opts?.activeId === node.id) highlight = 'active';
  else if (opts?.newId === node.id) highlight = 'new';
  else if (opts?.visitedIds?.has(node.id)) highlight = 'visited';
  return {
    id: node.id,
    label: node.label,
    highlight,
    subLabel: opts?.subLabels?.[node.id],
    left: toVisualTree(node.left, opts),
    right: toVisualTree(node.right, opts),
  };
}

export function serializeBracket(node: RawBNode | null): string {
  if (!node) return '';
  if (!node.left && !node.right) return node.label;
  return `${node.label}(${serializeBracket(node.left)},${serializeBracket(node.right)})`;
}

export function parseBracketTree(input: string): RawBNode | null {
  const s = input.replace(/\s+/g, '');
  if (!s) return null;
  let pos = 0;

  function parseNode(): RawBNode | null {
    if (pos >= s.length || s[pos] === ',' || s[pos] === ')') return null;
    let label = '';
    while (pos < s.length && !['(', ')', ','].includes(s[pos])) {
      label += s[pos++];
    }
    const node: RawBNode = { id: genNodeId(), label, left: null, right: null };
    if (pos < s.length && s[pos] === '(') {
      pos++; // skip '('
      node.left = parseNode();
      if (pos < s.length && s[pos] === ',') {
        pos++; // skip ','
        node.right = parseNode();
      }
      if (pos < s.length && s[pos] === ')') {
        pos++; // skip ')'
      } else {
        throw new Error('括号不匹配：缺少右括号 ")"');
      }
    }
    return node;
  }

  const root = parseNode();
  if (pos < s.length) {
    throw new Error(`多余字符 "${s.slice(pos)}"`);
  }
  return root;
}

export function parseExtendedPreorder(input: string): RawBNode | null {
  const s = input.trim();
  if (!s) return null;
  // Support space-separated tokens or single-char string
  const tokens = /\s/.test(s) ? s.split(/\s+/) : s.split('');
  let idx = 0;

  function build(): RawBNode | null {
    if (idx >= tokens.length) return null;
    const tk = tokens[idx++];
    if (tk === '#' || tk === '^' || tk === 'null') return null;
    const node: RawBNode = { id: genNodeId(), label: tk, left: null, right: null };
    node.left = build();
    node.right = build();
    return node;
  }

  return build();
}

export function computeTreeStats(root: RawBNode | null) {
  let total = 0;
  let n0 = 0;
  let n1 = 0;
  let n2 = 0;

  function dfs(n: RawBNode | null): number {
    if (!n) return 0;
    total++;
    const deg = (n.left ? 1 : 0) + (n.right ? 1 : 0);
    if (deg === 0) n0++;
    else if (deg === 1) n1++;
    else n2++;
    return 1 + Math.max(dfs(n.left), dfs(n.right));
  }

  const height = dfs(root);
  return { total, height, n0, n1, n2, nullLinks: total + 1 };
}

export function mutateAddChild(
  root: RawBNode | null,
  parentId: string,
  side: 'left' | 'right',
  label: string
): RawBNode | null {
  if (!root) return null;
  const copy = cloneTree(root)!;
  function dfs(n: RawBNode | null): boolean {
    if (!n) return false;
    if (n.id === parentId) {
      const child: RawBNode = { id: genNodeId(), label, left: null, right: null };
      if (side === 'left' && !n.left) n.left = child;
      else if (side === 'right' && !n.right) n.right = child;
      return true;
    }
    return dfs(n.left) || dfs(n.right);
  }
  dfs(copy);
  return copy;
}

export function mutateRenameNode(root: RawBNode | null, id: string, label: string): RawBNode | null {
  if (!root) return null;
  const copy = cloneTree(root)!;
  function dfs(n: RawBNode | null) {
    if (!n) return;
    if (n.id === id) n.label = label;
    dfs(n.left);
    dfs(n.right);
  }
  dfs(copy);
  return copy;
}

export function mutateDeleteNode(root: RawBNode | null, id: string): RawBNode | null {
  if (!root) return null;
  if (root.id === id) return null;
  const copy = cloneTree(root)!;
  function dfs(n: RawBNode | null) {
    if (!n) return;
    if (n.left?.id === id) {
      n.left = null;
      return;
    }
    if (n.right?.id === id) {
      n.right = null;
      return;
    }
    dfs(n.left);
    dfs(n.right);
  }
  dfs(copy);
  return copy;
}

export interface TreeSimState {
  visualRoot: BinaryNodeData | null;
  stackOrQueueLabel: string;
  stackOrQueue: string[];
  output: string[];
  threads: ThreadLink[];
}

export function simulateTreeTraversal(
  root: RawBNode | null,
  mode: 'preorder' | 'inorder' | 'postorder' | 'levelorder' | 'preorder-iter' | 'inorder-iter'
): SimStep<TreeSimState>[] {
  const steps: SimStep<TreeSimState>[] = [];
  if (!root) {
    return [{
      title: '空树',
      description: '当前二叉树为空，请先创建一个根节点或加载示例树形。',
      state: { visualRoot: null, stackOrQueueLabel: '栈/队列', stackOrQueue: [], output: [], threads: [] },
    }];
  }

  const visited = new Set<string>();
  const output: string[] = [];

  if (mode === 'levelorder') {
    const queue: RawBNode[] = [root];
    steps.push({
      title: '初始化队列，根节点入队',
      description: `将根节点 ${root.label} 放入辅助队列。`,
      codeLine: 2,
      state: {
        visualRoot: toVisualTree(root, { activeId: root.id, visitedIds: visited }),
        stackOrQueueLabel: '辅助队列 Queue',
        stackOrQueue: queue.map((x) => x.label),
        output: [],
        threads: [],
      },
    });
    while (queue.length > 0) {
      const cur = queue.shift()!;
      visited.add(cur.id);
      output.push(cur.label);
      if (cur.left) queue.push(cur.left);
      if (cur.right) queue.push(cur.right);
      steps.push({
        title: `出队并访问 ${cur.label}`,
        description: `访问 ${cur.label}，并将其非空左/右孩子按序入队。当前队列：[${queue.map((x) => x.label).join(', ')}]`,
        codeLine: 5,
        state: {
          visualRoot: toVisualTree(root, { activeId: cur.id, visitedIds: visited }),
          stackOrQueueLabel: '辅助队列 Queue',
          stackOrQueue: queue.map((x) => x.label),
          output: [...output],
          threads: [],
        },
      });
    }
    return steps;
  }

  if (mode === 'inorder-iter') {
    const stack: RawBNode[] = [];
    let p: RawBNode | null = root;
    steps.push({
      title: '非递归中序初始化',
      description: `指针 p 指向根节点 ${root.label}，辅助栈为空。`,
      codeLine: 1,
      state: {
        visualRoot: toVisualTree(root, { activeId: root.id }),
        stackOrQueueLabel: '显式辅助栈 Stack',
        stackOrQueue: [],
        output: [],
        threads: [],
      },
    });
    while (p || stack.length > 0) {
      if (p) {
        stack.push(p);
        const cur = p;
        p = p.left;
        steps.push({
          title: `沿左链入栈 ${cur.label}`,
          description: `p 指向 ${cur.label}，将其压入栈中并继续向左孩子深入 (${p ? p.label : 'NULL'})。`,
          codeLine: 4,
          state: {
            visualRoot: toVisualTree(root, { activeId: cur.id, visitedIds: visited }),
            stackOrQueueLabel: '显式辅助栈 Stack',
            stackOrQueue: stack.map((x) => x.label),
            output: [...output],
            threads: [],
          },
        });
      } else {
        const popped = stack.pop()!;
        visited.add(popped.id);
        output.push(popped.label);
        p = popped.right;
        steps.push({
          title: `左空弹栈访问 ${popped.label}，转向右子树`,
          description: `弹出栈顶 ${popped.label} 并访问输出，随后令 p 指向其右孩子 (${p ? p.label : 'NULL'})。`,
          codeLine: 7,
          state: {
            visualRoot: toVisualTree(root, { activeId: popped.id, visitedIds: visited }),
            stackOrQueueLabel: '显式辅助栈 Stack',
            stackOrQueue: stack.map((x) => x.label),
            output: [...output],
            threads: [],
          },
        });
      }
    }
    return steps;
  }

  if (mode === 'preorder-iter') {
    const stack: RawBNode[] = [root];
    steps.push({
      title: '非递归先序初始化',
      description: `根节点 ${root.label} 入栈。注意非递归先序入栈时应先压右孩子再压左孩子！`,
      codeLine: 1,
      state: {
        visualRoot: toVisualTree(root, { activeId: root.id }),
        stackOrQueueLabel: '显式辅助栈 Stack',
        stackOrQueue: stack.map((x) => x.label),
        output: [],
        threads: [],
      },
    });
    while (stack.length > 0) {
      const cur = stack.pop()!;
      visited.add(cur.id);
      output.push(cur.label);
      if (cur.right) stack.push(cur.right);
      if (cur.left) stack.push(cur.left);
      steps.push({
        title: `弹栈访问 ${cur.label}`,
        description: `访问 ${cur.label}，若存在孩子则先右 (${cur.right?.label ?? '无'}) 后左 (${cur.left?.label ?? '无'}) 压栈。`,
        codeLine: 4,
        state: {
          visualRoot: toVisualTree(root, { activeId: cur.id, visitedIds: visited }),
          stackOrQueueLabel: '显式辅助栈 Stack',
          stackOrQueue: stack.map((x) => x.label),
          output: [...output],
          threads: [],
        },
      });
    }
    return steps;
  }

  // Recursive Pre / In / Post
  const callStack: string[] = [];
  const visitOrderName = mode === 'preorder' ? '先序' : mode === 'inorder' ? '中序' : '后序';

  function rec(n: RawBNode | null) {
    if (!n) return;
    callStack.push(`${visitOrderName}(${n.label})`);
    steps.push({
      title: `递归进入 ${n.label}`,
      description: `压入递归栈帧 ${visitOrderName}(${n.label})。`,
      codeLine: 2,
      state: {
        visualRoot: toVisualTree(root, { activeId: n.id, visitedIds: visited }),
        stackOrQueueLabel: '递归调用栈 Call Stack',
        stackOrQueue: [...callStack],
        output: [...output],
        threads: [],
      },
    });

    if (mode === 'preorder') {
      visited.add(n.id);
      output.push(n.label);
      steps.push({
        title: `访问节点 ${n.label} (根)`,
        description: `先序遍历先访问当前根节点 ${n.label}，再遍历左/右子树。`,
        codeLine: 3,
        state: {
          visualRoot: toVisualTree(root, { activeId: n.id, visitedIds: visited }),
          stackOrQueueLabel: '递归调用栈 Call Stack',
          stackOrQueue: [...callStack],
          output: [...output],
          threads: [],
        },
      });
    }

    rec(n.left);

    if (mode === 'inorder') {
      visited.add(n.id);
      output.push(n.label);
      steps.push({
        title: `访问节点 ${n.label} (左已毕)`,
        description: `${n.label} 左子树遍历完毕，现在中序访问 ${n.label}。`,
        codeLine: 4,
        state: {
          visualRoot: toVisualTree(root, { activeId: n.id, visitedIds: visited }),
          stackOrQueueLabel: '递归调用栈 Call Stack',
          stackOrQueue: [...callStack],
          output: [...output],
          threads: [],
        },
      });
    }

    rec(n.right);

    if (mode === 'postorder') {
      visited.add(n.id);
      output.push(n.label);
      steps.push({
        title: `访问节点 ${n.label} (左右皆毕)`,
        description: `${n.label} 的左右子树均处理完毕，后序访问 ${n.label}。`,
        codeLine: 5,
        state: {
          visualRoot: toVisualTree(root, { activeId: n.id, visitedIds: visited }),
          stackOrQueueLabel: '递归调用栈 Call Stack',
          stackOrQueue: [...callStack],
          output: [...output],
          threads: [],
        },
      });
    }

    callStack.pop();
  }

  rec(root);
  steps.push({
    title: `${visitOrderName}遍历完成`,
    description: `最终遍历序列：${output.join(' → ')}`,
    codeLine: 6,
    state: {
      visualRoot: toVisualTree(root, { visitedIds: visited }),
      stackOrQueueLabel: '递归调用栈 Call Stack',
      stackOrQueue: [],
      output: [...output],
      threads: [],
    },
  });
  return steps;
}

export function simulateThreading(
  root: RawBNode | null,
  order: 'preorder' | 'inorder' | 'postorder'
): SimStep<TreeSimState>[] {
  const steps: SimStep<TreeSimState>[] = [];
  if (!root) return steps;

  const seq: RawBNode[] = [];
  function collect(n: RawBNode | null) {
    if (!n) return;
    if (order === 'preorder') seq.push(n);
    collect(n.left);
    if (order === 'inorder') seq.push(n);
    collect(n.right);
    if (order === 'postorder') seq.push(n);
  }
  collect(root);

  const ltagMap: Record<string, 0 | 1> = {};
  const rtagMap: Record<string, 0 | 1> = {};
  const allNodes: RawBNode[] = [];
  (function grab(n: RawBNode | null) {
    if (!n) return;
    allNodes.push(n);
    ltagMap[n.id] = n.left ? 0 : 1;
    rtagMap[n.id] = n.right ? 0 : 1;
    grab(n.left);
    grab(n.right);
  })(root);

  const buildSubLabels = () => {
    const res: Record<string, string> = {};
    for (const n of allNodes) {
      res[n.id] = `L:${ltagMap[n.id]} R:${rtagMap[n.id]}`;
    }
    return res;
  };

  const threads: ThreadLink[] = [];
  const visited = new Set<string>();
  const output: string[] = [];

  steps.push({
    title: `开始构建${order === 'preorder' ? '先序' : order === 'inorder' ? '中序' : '后序'}线索二叉树`,
    description: `初始化前驱指针 pre = NULL，节点 tag=0 表示指向孩子，tag=1 表示指向前驱/后继线索。`,
    codeLine: 1,
    state: {
      visualRoot: toVisualTree(root, { subLabels: buildSubLabels() }),
      stackOrQueueLabel: '线索生成记录',
      stackOrQueue: [],
      output: [],
      threads: [],
    },
  });

  let pre: RawBNode | null = null;
  const threadLogs: string[] = [];

  for (const p of seq) {
    visited.add(p.id);
    output.push(p.label);
    const msgs: string[] = [];

    if (!p.left && pre) {
      threads.push({ fromId: p.id, toId: pre.id, kind: 'pred' });
      msgs.push(`${p.label}.lchild 为空 → 前驱线索指向 ${pre.label}`);
      threadLogs.push(`${p.label}.lchild → ${pre.label} (前驱)`);
    } else if (!p.left && !pre) {
      msgs.push(`${p.label}.lchild 为空且 pre=NULL → 前驱为空`);
    }

    if (pre && !pre.right) {
      threads.push({ fromId: pre.id, toId: p.id, kind: 'succ' });
      msgs.push(`pre(${pre.label}).rchild 为空 → 后继线索指向 ${p.label}`);
      threadLogs.push(`${pre.label}.rchild → ${p.label} (后继)`);
    }

    pre = p;
    steps.push({
      title: `线索化访问 ${p.label}`,
      description: msgs.length > 0 ? msgs.join('；') : `${p.label} 左右孩子均非空(tag=0)，更新 pre = ${p.label}。`,
      codeLine: 4,
      state: {
        visualRoot: toVisualTree(root, { activeId: p.id, visitedIds: visited, subLabels: buildSubLabels() }),
        stackOrQueueLabel: '已建立的虚线线索',
        stackOrQueue: [...threadLogs],
        output: [...output],
        threads: [...threads],
      },
    });
  }

  steps.push({
    title: '线索化完成！',
    description: `最后一个节点 ${pre?.label} 的后继线索置 NULL（rtag=1）。青色虚线为前驱线索，琥珀色虚线为后继线索。`,
    codeLine: 8,
    state: {
      visualRoot: toVisualTree(root, { visitedIds: visited, subLabels: buildSubLabels() }),
      stackOrQueueLabel: '已建立的虚线线索',
      stackOrQueue: [...threadLogs],
      output: [...output],
      threads: [...threads],
    },
  });

  return steps;
}

export function simulateRebuildTree(
  mode: 'pre-in' | 'post-in',
  primaryStr: string,
  inStr: string
): { steps: SimStep<TreeSimState>[]; finalRoot: RawBNode | null; error?: string } {
  const splitTokens = (s: string) =>
    /\s/.test(s.trim()) ? s.trim().split(/\s+/).filter(Boolean) : s.trim().split('').filter(Boolean);

  const prim = splitTokens(primaryStr);
  const ino = splitTokens(inStr);

  if (prim.length === 0 || prim.length !== ino.length) {
    return {
      steps: [],
      finalRoot: null,
      error: '两个序列长度必须相等且非空！',
    };
  }

  const steps: SimStep<TreeSimState>[] = [];
  const traceLogs: string[] = [];

  // Validate character multiset matches
  const sortedP = [...prim].sort().join(',');
  const sortedI = [...ino].sort().join(',');
  if (sortedP !== sortedI) {
    return {
      steps: [],
      finalRoot: null,
      error: '两个序列包含的节点元素集合不一致，无法重建！',
    };
  }

  function build(pStart: number, pEnd: number, iStart: number, iEnd: number): RawBNode | null {
    if (pStart > pEnd || iStart > iEnd) return null;
    const rootVal = mode === 'pre-in' ? prim[pStart] : prim[pEnd];
    const rootIdx = ino.indexOf(rootVal, iStart);
    if (rootIdx === -1 || rootIdx > iEnd) {
      throw new Error(`无法在中序序列 [${ino.slice(iStart, iEnd + 1).join('')}] 中定位根节点 '${rootVal}'，请检查序列合法性！`);
    }
    const leftSize = rootIdx - iStart;
    const node: RawBNode = { id: genNodeId(), label: rootVal, left: null, right: null };

    traceLogs.push(
      `确定根 ${rootVal}：左中序 [${ino.slice(iStart, rootIdx).join('') || '空'}]，右中序 [${ino.slice(rootIdx + 1, iEnd + 1).join('') || '空'}]`
    );

    if (mode === 'pre-in') {
      node.left = build(pStart + 1, pStart + leftSize, iStart, rootIdx - 1);
      node.right = build(pStart + leftSize + 1, pEnd, rootIdx + 1, iEnd);
    } else {
      node.left = build(pStart, pStart + leftSize - 1, iStart, rootIdx - 1);
      node.right = build(pStart + leftSize, pEnd - 1, rootIdx + 1, iEnd);
    }
    return node;
  }

  try {
    // Build final tree first, then record step-by-step partial growth via progressive reveal
    const finalRoot = build(0, prim.length - 1, 0, ino.length - 1);
    const revealedIds = new Set<string>();

    const filterVisible = (n: RawBNode | null): BinaryNodeData | null => {
      if (!n || !revealedIds.has(n.id)) return null;
      return {
        id: n.id,
        label: n.label,
        highlight: 'visited',
        left: filterVisible(n.left),
        right: filterVisible(n.right),
      };
    };

    const preWalkReveal = (n: RawBNode | null, logIdx: { v: number }) => {
      if (!n) return;
      revealedIds.add(n.id);
      const msg = traceLogs[logIdx.v++] || `创建节点 ${n.label}`;
      const vis = filterVisible(finalRoot);
      steps.push({
        title: `重建节点 ${n.label}`,
        description: msg,
        codeLine: 4,
        state: {
          visualRoot: vis,
          stackOrQueueLabel: '划分子树日志',
          stackOrQueue: traceLogs.slice(0, logIdx.v),
          output: Array.from(revealedIds).length ? [...traceLogs.slice(0, logIdx.v).map((s) => s.split('：')[0].replace('确定根 ', ''))] : [],
          threads: [],
        },
      });
      preWalkReveal(n.left, logIdx);
      preWalkReveal(n.right, logIdx);
    };

    preWalkReveal(finalRoot, { v: 0 });
    return { steps, finalRoot };
  } catch (err) {
    return {
      steps: [],
      finalRoot: null,
      error: err instanceof Error ? err.message : '序列不合法，无法构成二叉树',
    };
  }
}
