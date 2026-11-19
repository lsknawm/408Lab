import type { SimStep } from '../../../types/core';
import type { BinaryNodeData } from '../../../utils/treeLayout';

interface AvlNode {
  id: string;
  key: number;
  height: number;
  left: AvlNode | null;
  right: AvlNode | null;
}

let seqId = 1;
const nid = () => `avl_${seqId++}`;

function h(n: AvlNode | null): number {
  return n ? n.height : 0;
}

function bf(n: AvlNode | null): number {
  return n ? h(n.left) - h(n.right) : 0;
}

function updateHeight(n: AvlNode): void {
  n.height = 1 + Math.max(h(n.left), h(n.right));
}

function cloneAvl(n: AvlNode | null): AvlNode | null {
  if (!n) return null;
  return { id: n.id, key: n.key, height: n.height, left: cloneAvl(n.left), right: cloneAvl(n.right) };
}

function toVisualAvl(
  n: AvlNode | null,
  showBf: boolean,
  marks?: { active?: Set<number>; imbalanced?: Set<number>; rotated?: Set<number>; newKey?: number }
): BinaryNodeData | null {
  if (!n) return null;
  let highlight: BinaryNodeData['highlight'];
  if (marks?.imbalanced?.has(n.key)) highlight = 'imbalanced';
  else if (marks?.rotated?.has(n.key)) highlight = 'rotated';
  else if (marks?.newKey === n.key) highlight = 'new';
  else if (marks?.active?.has(n.key)) highlight = 'active';
  return {
    id: n.id,
    label: String(n.key),
    badge: showBf ? `BF:${bf(n)}` : undefined,
    highlight,
    left: toVisualAvl(n.left, showBf, marks),
    right: toVisualAvl(n.right, showBf, marks),
  };
}

function rotateRight(y: AvlNode): AvlNode {
  const x = y.left!;
  const T2 = x.right;
  x.right = y;
  y.left = T2;
  updateHeight(y);
  updateHeight(x);
  return x;
}

function rotateLeft(x: AvlNode): AvlNode {
  const y = x.right!;
  const T2 = y.left;
  y.left = x;
  x.right = T2;
  updateHeight(x);
  updateHeight(y);
  return y;
}

export interface SearchTreeState {
  visualRoot: BinaryNodeData | null;
  rotationType?: string;
}

export function simulateBstOrAvl(
  keys: number[],
  mode: 'bst' | 'avl',
  searchTarget?: number | null
): SimStep<SearchTreeState>[] {
  const steps: SimStep<SearchTreeState>[] = [];
  let root: AvlNode | null = null;

  steps.push({
    title: `初始化空 ${mode === 'avl' ? 'AVL 平衡二叉树' : 'BST 二叉排序树'}`,
    description: `准备按顺序插入关键码序列：[${keys.join(', ')}]。`,
    codeLine: 1,
    state: { visualRoot: null },
  });

  function insertRec(node: AvlNode | null, key: number, path: number[]): AvlNode {
    if (!node) {
      return { id: nid(), key, height: 1, left: null, right: null };
    }
    path.push(node.key);
    if (key < node.key) {
      node.left = insertRec(node.left, key, path);
    } else if (key > node.key) {
      node.right = insertRec(node.right, key, path);
    } else {
      return node;
    }
    updateHeight(node);

    if (mode === 'bst') return node;

    const balance = bf(node);
    if (balance > 1 && key < node.left!.key) {
      // LL
      steps.push({
        title: `检测到 LL 型失衡 (失衡根 ${node.key}, BF=+2)`,
        description: `节点 ${node.key} 的左子树比右子树高 2，且新节点 ${key} 插入在左孩子 ${node.left!.key} 的左子树中 → 执行右单旋 (LL)。`,
        codeLine: 6,
        state: {
          visualRoot: toVisualAvl(cloneAvl(root), true, {
            imbalanced: new Set([node.key]),
            active: new Set([node.left!.key]),
            newKey: key,
          }),
          rotationType: 'LL 右单旋',
        },
      });
      const res = rotateRight(node);
      return res;
    }
    if (balance < -1 && key > node.right!.key) {
      // RR
      steps.push({
        title: `检测到 RR 型失衡 (失衡根 ${node.key}, BF=-2)`,
        description: `节点 ${node.key} 的右子树比左子树高 2，且新节点 ${key} 插入在右孩子 ${node.right!.key} 的右子树中 → 执行左单旋 (RR)。`,
        codeLine: 7,
        state: {
          visualRoot: toVisualAvl(cloneAvl(root), true, {
            imbalanced: new Set([node.key]),
            active: new Set([node.right!.key]),
            newKey: key,
          }),
          rotationType: 'RR 左单旋',
        },
      });
      return rotateLeft(node);
    }
    if (balance > 1 && key > node.left!.key) {
      // LR
      const bKey = node.left!.key;
      const cKey = node.left!.right!.key;
      steps.push({
        title: `检测到 LR 型失衡 (失衡根 ${node.key}, BF=+2)`,
        description: `节点 ${node.key} 失衡，新节点插入在左孩子 ${bKey} 的右子树 (${cKey}) 中 → 先对 ${bKey} 左旋，再对 ${node.key} 右旋！`,
        codeLine: 8,
        state: {
          visualRoot: toVisualAvl(cloneAvl(root), true, {
            imbalanced: new Set([node.key]),
            active: new Set([bKey, cKey]),
            newKey: key,
          }),
          rotationType: 'LR 先左后右双旋',
        },
      });
      node.left = rotateLeft(node.left!);
      steps.push({
        title: `LR 第 1 步完成：左旋左孩子 ${bKey}`,
        description: `已将 ${cKey} 提拔为 ${node.key} 的新左孩子，转化为 LL 形态；下一步对 ${node.key} 右旋。`,
        codeLine: 9,
        state: {
          visualRoot: toVisualAvl(cloneAvl(root), true, {
            imbalanced: new Set([node.key]),
            rotated: new Set([cKey, bKey]),
          }),
          rotationType: 'LR 第1步(左旋)',
        },
      });
      return rotateRight(node);
    }
    if (balance < -1 && key < node.right!.key) {
      // RL
      const bKey = node.right!.key;
      const cKey = node.right!.left!.key;
      steps.push({
        title: `检测到 RL 型失衡 (失衡根 ${node.key}, BF=-2)`,
        description: `节点 ${node.key} 失衡，新节点插入在右孩子 ${bKey} 的左子树 (${cKey}) 中 → 先对 ${bKey} 右旋，再对 ${node.key} 左旋！`,
        codeLine: 10,
        state: {
          visualRoot: toVisualAvl(cloneAvl(root), true, {
            imbalanced: new Set([node.key]),
            active: new Set([bKey, cKey]),
            newKey: key,
          }),
          rotationType: 'RL 先右后左双旋',
        },
      });
      node.right = rotateRight(node.right!);
      steps.push({
        title: `RL 第 1 步完成：右旋右孩子 ${bKey}`,
        description: `已将 ${cKey} 提拔为 ${node.key} 的新右孩子，转化为 RR 形态；下一步对 ${node.key} 左旋。`,
        codeLine: 11,
        state: {
          visualRoot: toVisualAvl(cloneAvl(root), true, {
            imbalanced: new Set([node.key]),
            rotated: new Set([cKey, bKey]),
          }),
          rotationType: 'RL 第1步(右旋)',
        },
      });
      return rotateLeft(node);
    }
    return node;
  }

  for (const k of keys) {
    const path: number[] = [];
    const beforeCount = steps.length;
    root = insertRec(root, k, path);
    const hadRotation = steps.length > beforeCount;
    steps.push({
      title: hadRotation ? `旋转修复完成，插入 ${k} 后重归平衡` : `插入节点 ${k}`,
      description: hadRotation
        ? `完成旋转调整后，全树所有节点平衡因子 |BF| <= 1。`
        : `沿查找路径 [${path.join(' → ') || '直接作根'}] 定位空位并插入 ${k}。`,
      codeLine: 4,
      state: {
        visualRoot: toVisualAvl(cloneAvl(root), mode === 'avl', { newKey: k }),
      },
    });
  }

  // Optional search simulation at end
  if (searchTarget !== null && searchTarget !== undefined && Number.isFinite(searchTarget)) {
    let cur = root;
    const path: number[] = [];
    while (cur) {
      path.push(cur.key);
      if (searchTarget === cur.key) {
        steps.push({
          title: `查找成功：命中 ${searchTarget}`,
          description: `共比较 ${path.length} 次（路径：${path.join(' → ')}），成功找到目标 ${searchTarget}！`,
          codeLine: 13,
          state: {
            visualRoot: toVisualAvl(cloneAvl(root), mode === 'avl', {
              active: new Set(path),
              newKey: searchTarget,
            }),
          },
        });
        break;
      }
      steps.push({
        title: `查找比较 ${searchTarget} 与 ${cur.key}`,
        description:
          searchTarget < cur.key
            ? `${searchTarget} < ${cur.key}，进入左子树继续查找。`
            : `${searchTarget} > ${cur.key}，进入右子树继续查找。`,
        codeLine: 14,
        state: {
          visualRoot: toVisualAvl(cloneAvl(root), mode === 'avl', { active: new Set(path) }),
        },
      });
      cur = searchTarget < cur.key ? cur.left : cur.right;
    }
    if (!cur) {
      steps.push({
        title: `查找失败：${searchTarget} 不存在`,
        description: `沿路径 [${path.join(' → ')}] 走入空指针 NULL，共比较 ${path.length} 次，未找到 ${searchTarget}。`,
        codeLine: 15,
        state: {
          visualRoot: toVisualAvl(cloneAvl(root), mode === 'avl', { active: new Set(path) }),
        },
      });
    }
  }

  return steps;
}

// Red-Black Tree Implementation
interface RbNode {
  id: string;
  key: number;
  red: boolean;
  left: RbNode | null;
  right: RbNode | null;
  parent: RbNode | null;
}

function toVisualRb(n: RbNode | null, activeKey?: number): BinaryNodeData | null {
  if (!n) return null;
  return {
    id: n.id,
    label: String(n.key),
    colorTag: n.red ? 'red' : 'black',
    highlight: n.key === activeKey ? 'active' : undefined,
    left: toVisualRb(n.left, activeKey),
    right: toVisualRb(n.right, activeKey),
  };
}

export function simulateRedBlackTree(keys: number[]): SimStep<SearchTreeState>[] {
  const steps: SimStep<SearchTreeState>[] = [];
  let root: RbNode | null = null;

  const rotLeft = (x: RbNode) => {
    const y = x.right!;
    x.right = y.left;
    if (y.left) y.left.parent = x;
    y.parent = x.parent;
    if (!x.parent) root = y;
    else if (x === x.parent.left) x.parent.left = y;
    else x.parent.right = y;
    y.left = x;
    x.parent = y;
  };

  const rotRight = (y: RbNode) => {
    const x = y.left!;
    y.left = x.right;
    if (x.right) x.right.parent = y;
    x.parent = y.parent;
    if (!y.parent) root = x;
    else if (y === y.parent.left) y.parent.left = x;
    else y.parent.right = x;
    x.right = y;
    y.parent = x;
  };

  steps.push({
    title: '初始化空红黑树',
    description: '红黑树新插入节点默认着红色（以不破坏“黑路同”性质），随后按叔叔颜色修复“不红红”冲突。',
    codeLine: 1,
    state: { visualRoot: null },
  });

  for (const key of keys) {
    let parent: RbNode | null = null;
    let cur = root;
    let dup = false;
    while (cur) {
      parent = cur;
      if (key < cur.key) cur = cur.left;
      else if (key > cur.key) cur = cur.right;
      else {
        dup = true;
        break;
      }
    }
    if (dup) continue;

    let z: RbNode = { id: nid(), key, red: true, left: null, right: null, parent };
    if (!parent) root = z;
    else if (key < parent.key) parent.left = z;
    else parent.right = z;

    steps.push({
      title: `插入红色节点 ${key}`,
      description: parent
        ? `将新节点 ${key}（红色）插入到父节点 ${parent.key} 下。`
        : `将 ${key} 作为根节点，随后染黑满足“根叶黑”。`,
      codeLine: 3,
      state: { visualRoot: toVisualRb(root, key) },
    });

    while (z.parent && z.parent.red) {
      const p = z.parent;
      const g = p.parent!;
      if (p === g.left) {
        const u = g.right;
        if (u && u.red) {
          p.red = false;
          u.red = false;
          g.red = true;
          steps.push({
            title: `叔叔 ${u.key} 为红 → 叔父爷变色上溢`,
            description: `父 ${p.key} 与叔 ${u.key} 染黑，爷 ${g.key} 染红，并将检查指针上移至 ${g.key}。`,
            codeLine: 5,
            state: { visualRoot: toVisualRb(root, g.key) },
          });
          z = g;
        } else {
          if (z === p.right) {
            z = p;
            rotLeft(z);
          }
          const np = z.parent!;
          const ng = np.parent!;
          np.red = false;
          ng.red = true;
          rotRight(ng);
          steps.push({
            title: `叔叔为黑 → 旋转 + 父爷变色修复`,
            description: `以爷节点 ${ng.key} 为中心执行右旋（若 LR 型则先左旋），父 ${np.key} 变黑，原爷 ${ng.key} 变红。`,
            codeLine: 8,
            state: { visualRoot: toVisualRb(root, np.key) },
          });
          break;
        }
      } else {
        const u = g.left;
        if (u && u.red) {
          p.red = false;
          u.red = false;
          g.red = true;
          steps.push({
            title: `叔叔 ${u.key} 为红 → 叔父爷变色上溢`,
            description: `父 ${p.key} 与叔 ${u.key} 染黑，爷 ${g.key} 染红，指针上移至 ${g.key}。`,
            codeLine: 5,
            state: { visualRoot: toVisualRb(root, g.key) },
          });
          z = g;
        } else {
          if (z === p.left) {
            z = p;
            rotRight(z);
          }
          const np = z.parent!;
          const ng = np.parent!;
          np.red = false;
          ng.red = true;
          rotLeft(ng);
          steps.push({
            title: `叔叔为黑 → 旋转 + 父爷变色修复`,
            description: `以爷节点 ${ng.key} 为中心执行左旋（若 RL 型则先右旋），父 ${np.key} 变黑，原爷 ${ng.key} 变红。`,
            codeLine: 8,
            state: { visualRoot: toVisualRb(root, np.key) },
          });
          break;
        }
      }
    }

    if (root && root.red) {
      root.red = false;
      steps.push({
        title: `根节点 ${root.key} 强制染黑`,
        description: `保证“根叶黑”性质：根节点永远保持黑色。`,
        codeLine: 10,
        state: { visualRoot: toVisualRb(root) },
      });
    }
  }

  return steps;
}
