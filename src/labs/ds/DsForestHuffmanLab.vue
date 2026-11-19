<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import BinaryTreeCanvas from '../../components/common/BinaryTreeCanvas.vue';
import { bindLabPlayer, useStepPlayer } from '../../composables/useStepPlayer';
import { layoutGeneralTree } from '../../utils/treeLayout';
import {
  genFId,
  parseForestString,
  serializeForest,
  simulateForestToBinary,
  simulateHuffman,
  simulateUnionFind,
  type ForestNode,
} from './engines/forestHuffmanEngine';
import { ElMessage } from 'element-plus';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const activeTab = ref<'forest' | 'huffman' | 'dsu'>('forest');

// Tab 1: Forest -> Binary Tree
const forestInput = ref('A(B(E,F),C,D(G)); H(I,J)');
const forestRoots = ref<ForestNode[]>(parseForestString(forestInput.value));
const selectedFNodeId = ref<string | null>(forestRoots.value[0]?.id ?? null);

const forestSteps = computed(() => simulateForestToBinary(forestRoots.value));
const forestPlayer = useStepPlayer(forestSteps, 850);

function applyForestString() {
  try {
    const parsed = parseForestString(forestInput.value);
    forestRoots.value = parsed;
    selectedFNodeId.value = parsed[0]?.id ?? null;
    ElMessage.success(`成功解析含 ${parsed.length} 棵树的森林！`);
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '森林括号格式错误');
  }
}

function addForestRoot() {
  const used = new Set<string>();
  const walk = (n: ForestNode) => {
    used.add(n.label);
    n.children.forEach(walk);
  };
  forestRoots.value.forEach(walk);
  let label = 'T';
  for (let c = 65; c <= 90; c++) {
    const ch = String.fromCharCode(c);
    if (!used.has(ch)) {
      label = ch;
      break;
    }
  }
  forestRoots.value = [...forestRoots.value, { id: genFId(), label, children: [] }];
  forestInput.value = serializeForest(forestRoots.value);
}

function addChildToSelected() {
  if (!selectedFNodeId.value) return;
  const used = new Set<string>();
  const walk = (n: ForestNode) => {
    used.add(n.label);
    n.children.forEach(walk);
  };
  forestRoots.value.forEach(walk);
  let label = 'X';
  for (let c = 65; c <= 90; c++) {
    const ch = String.fromCharCode(c);
    if (!used.has(ch)) {
      label = ch;
      break;
    }
  }
  const cloneAndAdd = (list: ForestNode[]): ForestNode[] =>
    list.map((n) => ({
      ...n,
      children:
        n.id === selectedFNodeId.value
          ? [...n.children, { id: genFId(), label, children: [] }]
          : cloneAndAdd(n.children),
    }));
  forestRoots.value = cloneAndAdd(forestRoots.value);
  forestInput.value = serializeForest(forestRoots.value);
}

const generalLayout = computed(() => {
  const roots = forestPlayer.currentStep.value?.state.generalRoots ?? [];
  return layoutGeneralTree(roots);
});

// Tab 2: Huffman
const huffmanInput = ref('A:5, B:29, C:7, D:8, E:14, F:23, G:3, H:11');
const huffmanSim = computed(() => simulateHuffman(huffmanInput.value));
const huffmanSteps = computed(() => huffmanSim.value.steps);
const huffmanPlayer = useStepPlayer(huffmanSteps, 900);

// Tab 3: DSU
const dsuSize = ref(8);
const dsuOptimize = ref(true);
const dsuOps = ref('union(0,1); union(2,3); union(4,5); union(6,7); union(0,2); union(4,6); union(0,4); find(7)');
const dsuSteps = computed(() => simulateUnionFind(dsuSize.value, dsuOps.value, dsuOptimize.value));
const dsuPlayer = useStepPlayer(dsuSteps, 900);

const dsuLayout = computed(() => {
  const roots = dsuPlayer.currentStep.value?.state.roots ?? [];
  return layoutGeneralTree(roots, { nodeGapX: 54, levelGapY: 72, treeGap: 42 });
});

const activePlayerBind = computed(() => {
  if (activeTab.value === 'forest') return bindLabPlayer(forestPlayer).value;
  if (activeTab.value === 'huffman') return bindLabPlayer(huffmanPlayer).value;
  return bindLabPlayer(dsuPlayer).value;
});

const pseudocodeLines = computed(() => {
  if (activeTab.value === 'forest') {
    return [
      '// 左孩子右兄弟转换规则',
      'BNode* ForestToBinary(Forest F) {',
      '  for (each tree T_i in F) {',
      '    root[i]->lchild = firstChild(T_i);',
      '    connectSiblingsAsRightChild(T_i);',
      '    if (i > 0) root[i-1]->rchild = root[i];',
      '  }',
      '  return root[0];',
      '}',
    ];
  }
  if (activeTab.value === 'huffman') {
    return [
      'PriorityQueue Q = all weighted nodes;',
      'while (Q.size() > 1) {',
      '  min1 = Q.popMin(); min2 = Q.popMin();',
      '  parent = new Node(min1.w + min2.w);',
      '  parent.left = min1; parent.right = min2;',
      '  Q.push(parent);',
      '} return Q.top();',
    ];
  }
  return [
    'int Find(int x) {',
    '  if (parent[x] != x)',
    '    parent[x] = Find(parent[x]); // 路径压缩',
    '  return parent[x];',
    '}',
    'void Union(int a, int b) {',
    '  ra = Find(a); rb = Find(b);',
    '  if (size[ra] < size[rb]) parent[ra] = rb;',
    '}',
  ];
});
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :player="activePlayerBind"
    :pseudocode="pseudocodeLines"
    :has-inspector="activeTab !== 'forest'"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <el-tabs v-model="activeTab" class="!mb-0">
          <el-tab-pane label="树/森林与二叉树转换" name="forest">
            <div class="flex flex-wrap items-center gap-2">
              <el-input
                v-model="forestInput"
                size="small"
                class="flex-1 min-w-[240px] font-mono"
                placeholder="用分号 ; 分隔多棵树，例如 A(B,C); D(E,F)"
              />
              <el-button type="primary" size="small" @click="applyForestString">生成森林</el-button>
              <el-button size="small" @click="addForestRoot">+ 新增树根</el-button>
              <el-button size="small" :disabled="!selectedFNodeId" @click="addChildToSelected">
                + 为选中节点加孩子
              </el-button>
            </div>
          </el-tab-pane>

          <el-tab-pane label="哈夫曼树与编码 (WPL)" name="huffman">
            <div class="flex flex-wrap items-center gap-2">
              <div class="text-xs text-slate-500">权值集合 (格式 符号:权值 或纯数字):</div>
              <el-input v-model="huffmanInput" size="small" class="flex-1 min-w-[240px] font-mono" />
              <el-button size="small" @click="huffmanInput = 'A:5, B:29, C:7, D:8, E:14, F:23, G:3, H:11'">经典教材例</el-button>
              <el-button size="small" @click="huffmanInput = '2, 3, 5, 7, 11, 13, 17'">素数权值例</el-button>
            </div>
            <el-alert
              v-if="huffmanSim.error"
              class="!mt-2"
              type="error"
              :title="huffmanSim.error"
              :closable="false"
            />
          </el-tab-pane>

          <el-tab-pane label="并查集 (Union-Find) 优化对比" name="dsu">
            <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              <div class="md:col-span-2 flex items-center gap-2">
                <span class="text-xs text-slate-500">元素数:</span>
                <el-input-number v-model="dsuSize" :min="4" :max="10" size="small" />
              </div>
              <div class="md:col-span-6">
                <el-input v-model="dsuOps" size="small" class="font-mono" placeholder="union(0,1); find(3)" />
              </div>
              <div class="md:col-span-4 flex flex-wrap items-center gap-2">
                <el-switch
                  v-model="dsuOptimize"
                  active-text="按大小合并+路径压缩"
                  inactive-text="朴素无优化"
                />
                <el-button
                  size="small"
                  plain
                  @click="dsuSize = 7; dsuOps = 'union(1,0); union(2,1); union(3,2); union(4,3); union(5,4); find(5)'"
                >
                  退化长链测试
                </el-button>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <template #stage>
      <!-- Tab 1: Forest vs Binary Tree side-by-side -->
      <div v-if="activeTab === 'forest'" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <div class="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-between">
            <span>原始一般树 / 森林（点击节点可选中加孩子）</span>
            <el-tag size="small" type="info">{{ forestRoots.length }} 棵树</el-tag>
          </div>
          <div class="w-full overflow-auto rounded-xl border border-slate-200 dark:border-slate-800 lab-grid-bg min-h-[320px] flex items-center justify-center">
            <svg :width="generalLayout.width" :height="generalLayout.height" class="select-none mx-auto">
              <line
                v-for="e in generalLayout.edges"
                :key="`${e.fromId}-${e.toId}`"
                :x1="e.x1"
                :y1="e.y1"
                :x2="e.x2"
                :y2="e.y2"
                stroke="#94a3b8"
                stroke-width="2"
              />
              <g
                v-for="n in generalLayout.nodes"
                :key="n.id"
                :transform="`translate(${n.x}, ${n.y})`"
                class="cursor-pointer"
                @click="selectedFNodeId = n.id"
              >
                <circle
                  r="19"
                  :fill="n.highlight === 'active' ? '#4f46e5' : selectedFNodeId === n.id ? '#e0e7ff' : '#ffffff'"
                  :stroke="selectedFNodeId === n.id ? '#4f46e5' : '#64748b'"
                  :stroke-width="selectedFNodeId === n.id ? 3 : 2"
                />
                <text
                  dy="0.35em"
                  text-anchor="middle"
                  :fill="n.highlight === 'active' ? '#ffffff' : '#0f172a'"
                  class="font-mono font-bold text-sm"
                >
                  {{ n.label }}
                </text>
              </g>
            </svg>
          </div>
        </div>

        <div class="space-y-1.5">
          <div class="text-xs font-semibold text-indigo-600 dark:text-indigo-300 flex items-center justify-between">
            <span>等价二叉树（左子 = 长子，右子 = 右兄弟）</span>
            <el-tag size="small" type="primary">LCRS 映射</el-tag>
          </div>
          <BinaryTreeCanvas
            :root="forestPlayer.currentStep.value?.state.binaryRoot ?? null"
            min-height="320px"
            empty-text="点击播放查看逐步转换过程"
          />
        </div>
      </div>

      <!-- Tab 2: Huffman -->
      <div v-else-if="activeTab === 'huffman'" class="space-y-3">
        <div class="flex flex-wrap gap-3 items-center">
          <el-tag type="warning" effect="dark">
            当前累计 WPL = {{ huffmanPlayer.currentStep.value?.state.wpl ?? 0 }}
          </el-tag>
          <span v-if="huffmanPlayer.currentStep.value?.state.wplTerms.length" class="text-xs font-mono text-slate-500">
            (= {{ huffmanPlayer.currentStep.value.state.wplTerms.join(' + ') }})
          </span>
        </div>
        <div class="flex flex-wrap gap-4 overflow-x-auto p-3 rounded-xl border border-slate-200 dark:border-slate-800 lab-grid-bg min-h-[340px] items-start justify-center">
          <div
            v-for="(treeRoot, idx) in huffmanPlayer.currentStep.value?.state.forestRoots || []"
            :key="treeRoot.id || idx"
            class="min-w-[120px]"
          >
            <BinaryTreeCanvas :root="treeRoot" min-height="260px" />
          </div>
        </div>
      </div>

      <!-- Tab 3: DSU -->
      <div v-else-if="activeTab === 'dsu'" class="space-y-3">
        <div class="flex flex-wrap items-center gap-3">
          <el-tag type="success">当前最大树高: {{ dsuPlayer.currentStep.value?.state.maxHeight ?? 1 }}</el-tag>
          <span class="text-xs font-mono text-slate-500">
            parent[] = [{{ (dsuPlayer.currentStep.value?.state.parent || []).join(', ') }}]
          </span>
        </div>
        <div class="w-full overflow-auto rounded-xl border border-slate-200 dark:border-slate-800 lab-grid-bg min-h-[300px] flex items-center justify-center">
          <svg :width="dsuLayout.width" :height="dsuLayout.height" class="select-none mx-auto">
            <line
              v-for="e in dsuLayout.edges"
              :key="`${e.fromId}-${e.toId}`"
              :x1="e.x1"
              :y1="e.y1"
              :x2="e.x2"
              :y2="e.y2"
              stroke="#64748b"
              stroke-width="2"
            />
            <g v-for="n in dsuLayout.nodes" :key="n.id" :transform="`translate(${n.x}, ${n.y})`">
              <circle
                r="18"
                :fill="n.highlight === 'active' ? '#10b981' : '#ffffff'"
                :stroke="n.highlight === 'active' ? '#047857' : '#4f46e5'"
                stroke-width="2"
              />
              <text
                dy="0.35em"
                text-anchor="middle"
                :fill="n.highlight === 'active' ? '#ffffff' : '#0f172a'"
                class="font-mono font-bold text-sm"
              >
                {{ n.label }}
              </text>
              <text v-if="n.badge" y="-23" text-anchor="middle" class="font-mono text-[10px] fill-amber-600 font-bold">
                {{ n.badge }}
              </text>
            </g>
          </svg>
        </div>
      </div>
    </template>

    <template #inspector>
      <el-card v-if="activeTab === 'huffman'" shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <template #header>
          <span class="text-xs font-semibold">哈夫曼前缀编码表 (WPL = {{ huffmanPlayer.currentStep.value?.state.wpl ?? 0 }})</span>
        </template>
        <el-table
          :data="huffmanPlayer.currentStep.value?.state.codes || []"
          size="small"
          border
          empty-text="播放至最后一步查看完整编码表"
        >
          <el-table-column prop="symbol" label="符号" width="70" />
          <el-table-column prop="weight" label="权值" width="70" />
          <el-table-column prop="code" label="哈夫曼编码">
            <template #default="{ row }">
              <span class="font-mono font-bold text-indigo-600 dark:text-indigo-400">{{ row.code }}</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card v-else-if="activeTab === 'dsu'" shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <template #header>
          <span class="text-xs font-semibold">并查集底层数组视图</span>
        </template>
        <div class="grid grid-cols-2 gap-1.5 font-mono text-xs tabular-nums">
          <div
            v-for="(p, idx) in dsuPlayer.currentStep.value?.state.parent || []"
            :key="idx"
            class="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          >
            <span class="text-slate-500">idx {{ idx }}</span>
            <span class="font-bold text-indigo-600 dark:text-indigo-400">p={{ p }}</span>
          </div>
        </div>
      </el-card>
    </template>
  </LabShell>
</template>
