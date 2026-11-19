<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import BinaryTreeCanvas from '../../components/common/BinaryTreeCanvas.vue';
import { bindLabPlayer, useStepPlayer } from '../../composables/useStepPlayer';
import {
  computeTreeStats,
  genNodeId,
  mutateAddChild,
  mutateDeleteNode,
  mutateRenameNode,
  parseBracketTree,
  parseExtendedPreorder,
  serializeBracket,
  simulateRebuildTree,
  simulateThreading,
  simulateTreeTraversal,
  toVisualTree,
  type RawBNode,
} from './engines/binaryTreeEngine';
import { ElMessage } from 'element-plus';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const initialTree = parseBracketTree('A(B(D,E(G,)),C(,F(H,I)))');
const customRoot = ref<RawBNode | null>(initialTree);
const selectedNodeId = ref<string | null>(initialTree?.id ?? null);
const newChildLabel = ref('X');
const renameInput = ref('');

// Creation modes
const buildMethod = ref<'canvas' | 'bracket' | 'extpre' | 'rebuild'>('canvas');
const bracketInput = ref('A(B(D,E(G,)),C(,F(H,I)))');
const extPreInput = ref('ABD##EG###C#FH##I##');
const rebuildMode = ref<'pre-in' | 'post-in'>('pre-in');
const primarySeq = ref('ABDEGCFHI');
const inorderSeq = ref('DBGEACHFI');

// Algorithm modes
const algoMode = ref<
  'edit' | 'preorder' | 'inorder' | 'postorder' | 'levelorder' | 'inorder-iter' | 'preorder-iter' | 'thread-in' | 'thread-pre' | 'thread-post' | 'rebuild-anim'
>('inorder');

const treeStats = computed(() => computeTreeStats(customRoot.value));

const rebuildResult = computed(() => {
  if (algoMode.value !== 'rebuild-anim') return null;
  return simulateRebuildTree(rebuildMode.value, primarySeq.value, inorderSeq.value);
});

const simSteps = computed(() => {
  if (algoMode.value === 'edit') return [];
  if (algoMode.value === 'rebuild-anim') {
    return rebuildResult.value?.steps ?? [];
  }
  if (algoMode.value === 'thread-in') return simulateThreading(customRoot.value, 'inorder');
  if (algoMode.value === 'thread-pre') return simulateThreading(customRoot.value, 'preorder');
  if (algoMode.value === 'thread-post') return simulateThreading(customRoot.value, 'postorder');
  return simulateTreeTraversal(customRoot.value, algoMode.value);
});

const player = useStepPlayer(simSteps, 800);
const playerBind = computed(() =>
  algoMode.value === 'edit' ? undefined : bindLabPlayer(player).value
);

watch(customRoot, (r) => {
  bracketInput.value = serializeBracket(r);
});

function nextAutoLabel(): string {
  const used = new Set<string>();
  const walk = (n: RawBNode | null) => {
    if (!n) return;
    used.add(n.label);
    walk(n.left);
    walk(n.right);
  };
  walk(customRoot.value);
  for (let c = 65; c <= 90; c++) {
    const ch = String.fromCharCode(c);
    if (!used.has(ch)) return ch;
  }
  return `N${used.size + 1}`;
}

function handleAddRoot() {
  const root: RawBNode = { id: genNodeId(), label: 'A', left: null, right: null };
  customRoot.value = root;
  selectedNodeId.value = root.id;
  algoMode.value = 'edit';
}

function handleAddChild(parentId: string, side: 'left' | 'right') {
  const label = nextAutoLabel();
  customRoot.value = mutateAddChild(customRoot.value, parentId, side, label);
  ElMessage.success(`已添加 ${side === 'left' ? '左' : '右'}孩子 ${label}`);
}

function handleSelectNode(id: string) {
  selectedNodeId.value = id;
  const find = (n: RawBNode | null): string => {
    if (!n) return '';
    if (n.id === id) return n.label;
    return find(n.left) || find(n.right);
  };
  renameInput.value = find(customRoot.value);
}

function applyRename() {
  if (!selectedNodeId.value || !renameInput.value.trim()) return;
  customRoot.value = mutateRenameNode(customRoot.value, selectedNodeId.value, renameInput.value.trim());
}

function applyDeleteSelected() {
  if (!selectedNodeId.value) return;
  customRoot.value = mutateDeleteNode(customRoot.value, selectedNodeId.value);
  selectedNodeId.value = customRoot.value?.id ?? null;
}

function applyBracket() {
  try {
    const parsed = parseBracketTree(bracketInput.value);
    customRoot.value = parsed;
    selectedNodeId.value = parsed?.id ?? null;
    ElMessage.success('已按括号表示法生成二叉树！');
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '括号表示法格式错误');
  }
}

function applyExtPre() {
  const parsed = parseExtendedPreorder(extPreInput.value);
  customRoot.value = parsed;
  selectedNodeId.value = parsed?.id ?? null;
  ElMessage.success('已按扩展先序序列生成二叉树！');
}

function applyRebuild(animate: boolean) {
  const res = simulateRebuildTree(rebuildMode.value, primarySeq.value, inorderSeq.value);
  if (res.error) {
    ElMessage.error(res.error);
    return;
  }
  customRoot.value = res.finalRoot;
  selectedNodeId.value = res.finalRoot?.id ?? null;
  if (animate) {
    algoMode.value = 'rebuild-anim';
    player.reset();
  } else {
    ElMessage.success('已重建唯一二叉树！');
  }
}

function loadPreset(type: 'balanced' | 'skewLeft' | 'skewRight' | 'complete') {
  const map = {
    balanced: 'A(B(D,E(G,)),C(,F(H,I)))',
    skewLeft: 'A(B(C(D,),),)',
    skewRight: 'A(,B(,C(,D)))',
    complete: '1(2(4(8,9),5(10,)),3(6,7))',
  };
  customRoot.value = parseBracketTree(map[type]);
  selectedNodeId.value = customRoot.value?.id ?? null;
}

const currentVisual = computed(() => {
  if (algoMode.value === 'edit') {
    return toVisualTree(customRoot.value);
  }
  return player.currentStep.value?.state.visualRoot ?? toVisualTree(customRoot.value);
});

const currentThreads = computed(() => {
  if (algoMode.value === 'edit') return [];
  return player.currentStep.value?.state.threads ?? [];
});

const pseudocodeLines = computed(() => {
  if (algoMode.value === 'inorder-iter') {
    return [
      'Stack S; BiTree p = T;',
      'while (p != NULL || !IsEmpty(S)) {',
      '  if (p != NULL) {',
      '    Push(S, p); p = p->lchild;',
      '  } else {',
      '    Pop(S, p); visit(p);',
      '    p = p->rchild;',
      '  }',
      '}',
    ];
  }
  if (algoMode.value.startsWith('thread')) {
    return [
      'void InThread(ThreadTree &p, ThreadTree &pre) {',
      '  if (p != NULL) {',
      '    InThread(p->lchild, pre);',
      '    if (p->lchild == NULL) { p->lchild = pre; p->ltag = 1; }',
      '    if (pre != NULL && pre->rchild == NULL) {',
      '      pre->rchild = p; pre->rtag = 1;',
      '    }',
      '    pre = p; InThread(p->rchild, pre);',
      '  } // 注：先序需注意 ltag==0 才递归左子树避免死循环!',
      '}',
    ];
  }
  if (algoMode.value === 'levelorder') {
    return [
      'InitQueue(Q); EnQueue(Q, T);',
      'while (!IsEmpty(Q)) {',
      '  DeQueue(Q, p); visit(p);',
      '  if (p->lchild) EnQueue(Q, p->lchild);',
      '  if (p->rchild) EnQueue(Q, p->rchild);',
      '}',
    ];
  }
  return [
    'void Traverse(BiTree T) {',
    '  if (T != NULL) {',
    '    // 先序在此 visit(T)',
    '    Traverse(T->lchild); // 中序在此 visit(T)',
    '    Traverse(T->rchild); // 后序在此 visit(T)',
    '  }',
    '}',
  ];
});
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :player="playerBind"
    :pseudocode="pseudocodeLines"
    :has-inspector="true"
    code-title="二叉树算法追踪"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <div class="space-y-3">
          <!-- Custom Tree Builder Tabs -->
          <div class="flex flex-wrap items-center justify-between gap-2">
            <el-radio-group v-model="buildMethod" size="small">
              <el-radio-button value="canvas">画布自由捏树</el-radio-button>
              <el-radio-button value="bracket">括号表示法</el-radio-button>
              <el-radio-button value="extpre">扩展先序 (# 空节点)</el-radio-button>
              <el-radio-button value="rebuild">遍历序列重建</el-radio-button>
            </el-radio-group>

            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-xs text-slate-400">快速形态:</span>
              <el-button size="small" @click="loadPreset('balanced')">教材标准树</el-button>
              <el-button size="small" @click="loadPreset('complete')">完全二叉树</el-button>
              <el-button size="small" @click="loadPreset('skewLeft')">左单支斜树</el-button>
              <el-button size="small" @click="loadPreset('skewRight')">右单支斜树</el-button>
              <el-button size="small" type="danger" plain @click="customRoot = null; selectedNodeId = null; algoMode = 'edit'">
                清空树
              </el-button>
            </div>
          </div>

          <!-- Builder Detail Bar -->
          <div
            v-if="buildMethod === 'canvas'"
            class="flex flex-wrap items-center gap-2.5 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"
          >
            <el-tag size="small" type="primary" effect="plain">
              提示：点击画布上节点的 +L 或 +R 即可自由长出左/右孩子！
            </el-tag>
            <template v-if="selectedNodeId">
              <span class="text-xs text-slate-500">已选中节点:</span>
              <el-input v-model="renameInput" size="small" style="width: 90px" />
              <el-button size="small" type="primary" plain @click="applyRename">改名</el-button>
              <el-button size="small" type="danger" plain @click="applyDeleteSelected">删除该子树</el-button>
            </template>
          </div>

          <div v-else-if="buildMethod === 'bracket'" class="flex flex-wrap items-center gap-2">
            <el-input
              v-model="bracketInput"
              size="small"
              class="flex-1 min-w-[240px] font-mono"
              placeholder="例如 A(B(D,E),C(,F))"
            />
            <el-button type="primary" size="small" @click="applyBracket">按括号生成树形态</el-button>
          </div>

          <div v-else-if="buildMethod === 'extpre'" class="flex flex-wrap items-center gap-2">
            <el-input
              v-model="extPreInput"
              size="small"
              class="flex-1 min-w-[240px] font-mono"
              placeholder="例如 ABD##EG###C#FH##I##"
            />
            <el-button type="primary" size="small" @click="applyExtPre">按扩展先序生成</el-button>
          </div>

          <div v-else-if="buildMethod === 'rebuild'" class="flex flex-wrap items-end gap-2.5">
            <div>
              <div class="text-[11px] text-slate-500 mb-1">重建依据</div>
              <el-select v-model="rebuildMode" size="small" style="width: 130px">
                <el-option label="先序 + 中序" value="pre-in" />
                <el-option label="后序 + 中序" value="post-in" />
              </el-select>
            </div>
            <div class="flex-1 min-w-[140px]">
              <div class="text-[11px] text-slate-500 mb-1">{{ rebuildMode === 'pre-in' ? '先序序列' : '后序序列' }}</div>
              <el-input v-model="primarySeq" size="small" class="font-mono" />
            </div>
            <div class="flex-1 min-w-[140px]">
              <div class="text-[11px] text-slate-500 mb-1">中序序列</div>
              <el-input v-model="inorderSeq" size="small" class="font-mono" />
            </div>
            <el-button type="primary" size="small" @click="applyRebuild(true)">生成并动态演示重建</el-button>
            <el-button size="small" @click="applyRebuild(false)">直接生成树</el-button>
          </div>

          <!-- Algorithm Selector -->
          <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">演示算法:</span>
            <el-radio-group v-model="algoMode" size="small">
              <el-radio-button value="edit">仅自由编辑</el-radio-button>
              <el-radio-button value="preorder">先序(递归)</el-radio-button>
              <el-radio-button value="inorder">中序(递归)</el-radio-button>
              <el-radio-button value="postorder">后序(递归)</el-radio-button>
              <el-radio-button value="inorder-iter">中序(显式栈)</el-radio-button>
              <el-radio-button value="preorder-iter">先序(显式栈)</el-radio-button>
              <el-radio-button value="levelorder">层序遍历</el-radio-button>
              <el-radio-button value="thread-in">中序线索化</el-radio-button>
              <el-radio-button value="thread-pre">先序线索化</el-radio-button>
              <el-radio-button value="thread-post">后序线索化</el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </el-card>
    </template>

    <template #stage>
      <div class="space-y-3">
        <!-- Legend for threading -->
        <div v-if="algoMode.startsWith('thread')" class="flex flex-wrap items-center gap-4 text-xs">
          <span class="inline-flex items-center gap-1.5">
            <span class="w-5 h-0.5 border-t-2 border-dashed border-cyan-500 inline-block"></span>
            青色虚线: 前驱线索 (ltag=1)
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="w-5 h-0.5 border-t-2 border-dashed border-amber-500 inline-block"></span>
            琥珀虚线: 后继线索 (rtag=1)
          </span>
          <span class="text-slate-400">节点下方 L/R 标识 tag 位（0=孩子, 1=线索）</span>
        </div>

        <BinaryTreeCanvas
          :root="currentVisual"
          :editable="buildMethod === 'canvas' && algoMode !== 'rebuild-anim'"
          :selected-id="selectedNodeId"
          :threads="currentThreads"
          min-height="360px"
          @add-root="handleAddRoot"
          @select="handleSelectNode"
          @add-child="handleAddChild"
        />

        <!-- Live Stats Strip -->
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
          <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <div class="text-[11px] text-slate-400">总节点 n</div>
            <div class="font-mono font-bold text-base tabular-nums">{{ treeStats.total }}</div>
          </div>
          <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <div class="text-[11px] text-slate-400">树高 h</div>
            <div class="font-mono font-bold text-base tabular-nums">{{ treeStats.height }}</div>
          </div>
          <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <div class="text-[11px] text-slate-400">度0 (叶 n₀)</div>
            <div class="font-mono font-bold text-base text-emerald-600 tabular-nums">{{ treeStats.n0 }}</div>
          </div>
          <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <div class="text-[11px] text-slate-400">度1 (n₁)</div>
            <div class="font-mono font-bold text-base tabular-nums">{{ treeStats.n1 }}</div>
          </div>
          <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <div class="text-[11px] text-slate-400">度2 (n₂)</div>
            <div class="font-mono font-bold text-base text-indigo-600 tabular-nums">{{ treeStats.n2 }}</div>
          </div>
          <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <div class="text-[11px] text-slate-400">空链域 (n+1)</div>
            <div class="font-mono font-bold text-base text-amber-600 tabular-nums">{{ treeStats.nullLinks }}</div>
          </div>
        </div>
      </div>
    </template>

    <template #inspector>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <template #header>
          <span class="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {{ player.currentStep.value?.state.stackOrQueueLabel || '实时状态监视' }}
          </span>
        </template>

        <div class="space-y-3">
          <div>
            <div class="text-[11px] text-slate-400 mb-1">当前输出序列</div>
            <div class="min-h-[34px] p-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 font-mono text-xs flex flex-wrap gap-1">
              <el-tag
                v-for="(item, idx) in player.currentStep.value?.state.output || []"
                :key="idx"
                size="small"
                type="success"
                effect="dark"
              >
                {{ item }}
              </el-tag>
              <span v-if="!player.currentStep.value?.state.output?.length" class="text-slate-400">尚未访问节点</span>
            </div>
          </div>

          <div>
            <div class="text-[11px] text-slate-400 mb-1">
              {{ player.currentStep.value?.state.stackOrQueueLabel || '栈/队列内容' }}
            </div>
            <div class="min-h-[80px] max-h-[200px] overflow-y-auto p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 font-mono text-xs">
              <div
                v-for="(item, idx) in player.currentStep.value?.state.stackOrQueue || []"
                :key="idx"
                class="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                {{ item }}
              </div>
              <span v-if="!player.currentStep.value?.state.stackOrQueue?.length" class="text-slate-400">空</span>
            </div>
          </div>
        </div>
      </el-card>
    </template>
  </LabShell>
</template>
