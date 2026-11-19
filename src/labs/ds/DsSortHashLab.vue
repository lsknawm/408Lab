<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import EChartBox from '../../components/common/EChartBox.vue';
import BinaryTreeCanvas from '../../components/common/BinaryTreeCanvas.vue';
import { bindLabPlayer, useStepPlayer } from '../../composables/useStepPlayer';
import {
  benchmarkAllSorts,
  simulateHashTable,
  simulateSort,
  type SortAlgo,
} from './engines/sortHashEngine';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const activeTab = ref<'sort' | 'hash'>('sort');

// Sort State
const sortAlgo = ref<SortAlgo>('quick');
const arrInput = ref('49, 38, 65, 97, 76, 13, 27, 49');
const shellGapInput = ref('4, 2, 1');

const parsedArr = computed(() => {
  const nums = arrInput.value
    .split(/[\s,，]+/)
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n));
  return nums.length > 0 ? nums.slice(0, 16) : [49, 38, 65, 97, 76, 13, 27, 49];
});

const parsedGaps = computed(() =>
  shellGapInput.value
    .split(/[\s,，]+/)
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1)
);

const sortSteps = computed(() => simulateSort(parsedArr.value, sortAlgo.value, parsedGaps.value));
const sortPlayer = useStepPlayer(sortSteps, 600);

const benchmarks = computed(() => benchmarkAllSorts(parsedArr.value));

function randomizeArr() {
  const arr = Array.from({ length: 9 }, () => Math.floor(Math.random() * 88 + 10));
  arrInput.value = arr.join(', ');
  sortPlayer.reset();
}

const sortChartOption = computed(() => {
  const st = sortPlayer.currentStep.value?.state;
  const arr = st?.arr ?? parsedArr.value;
  const comp = new Set(st?.compareIndices ?? []);
  const swap = new Set(st?.swapIndices ?? []);
  const sorted = new Set(st?.sortedIndices ?? []);

  return {
    animationDurationUpdate: 220,
    tooltip: { trigger: 'axis' },
    grid: { top: 28, bottom: 32, left: 36, right: 16 },
    xAxis: {
      type: 'category',
      data: arr.map((v, i) => {
        const tags: string[] = [`[${i}]`];
        if (st?.pivotIdx === i) tags.push('P');
        if (st?.lowIdx === i) tags.push('L');
        if (st?.highIdx === i) tags.push('H');
        return tags.join(' ');
      }),
    },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'bar',
        barWidth: '54%',
        label: { show: true, position: 'top', fontWeight: 'bold' },
        data: arr.map((v, i) => ({
          value: v,
          itemStyle: {
            borderRadius: [6, 6, 0, 0],
            color: swap.has(i)
              ? '#ef4444'
              : st?.pivotIdx === i
                ? '#f59e0b'
                : comp.has(i)
                  ? '#6366f1'
                  : sorted.has(i)
                    ? '#10b981'
                    : '#3b82f6',
          },
        })),
      },
    ],
  };
});

const benchChartOption = computed(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  legend: { top: 0, textStyle: { fontSize: 11 } },
  grid: { top: 32, bottom: 24, left: 68, right: 18 },
  xAxis: { type: 'value' },
  yAxis: { type: 'category', data: benchmarks.value.map((b) => b.name) },
  series: [
    { name: '比较次数', type: 'bar', data: benchmarks.value.map((b) => b.comparisons), itemStyle: { color: '#6366f1' } },
    { name: '移动次数', type: 'bar', data: benchmarks.value.map((b) => b.moves), itemStyle: { color: '#f59e0b' } },
  ],
}));

// Hash Tab State
const hashKeysInput = ref('19, 14, 23, 1, 68, 20, 84, 27, 55, 11, 10, 79');
const hashTableLen = ref(16);
const hashModP = ref(13);
const hashStrategy = ref<'linear' | 'quadratic' | 'chaining'>('linear');

const hashKeys = computed(() =>
  hashKeysInput.value
    .split(/[\s,，]+/)
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n))
);

const hashRes = computed(() =>
  simulateHashTable(hashKeys.value, hashTableLen.value, hashModP.value, hashStrategy.value)
);

const activePlayerBind = computed(() =>
  activeTab.value === 'sort' ? bindLabPlayer(sortPlayer).value : undefined
);

const pseudocodeLines = computed(() => {
  if (sortAlgo.value === 'quick') {
    return [
      'int Partition(ElemType A[], int low, int high) {',
      '  ElemType pivot = A[low];',
      '  while (low < high) {',
      '    while (low < high && A[high] >= pivot) --high;',
      '    A[low] = A[high];',
      '    while (low < high && A[low] <= pivot) ++low;',
      '    A[high] = A[low];',
      '  }',
      '  A[low] = pivot; return low;',
      '}',
    ];
  }
  if (sortAlgo.value === 'heap') {
    return [
      'void BuildMaxHeap(ElemType A[], int len) {',
      '  for (int i = len/2; i >= 1; i--) HeadAdjust(A, i, len);',
      '}',
      'void HeapSort(ElemType A[], int len) {',
      '  BuildMaxHeap(A, len); // 建堆时间 O(n)',
      '  for (int i = len; i > 1; i--) {',
      '    Swap(A[i], A[1]);',
      '    HeadAdjust(A, 1, i - 1);',
      '  }',
      '}',
    ];
  }
  return [
    '// 内部排序核心操作循环',
    'initPointers();',
    'for (pass = 1; pass < n; pass++) {',
    '  compareElements(); // 统计比较次数',
    '  moveOrSwapIfNeeded(); // 统计移动次数',
    '  expandSortedRegion();',
    '}',
  ];
});
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :player="activePlayerBind"
    :pseudocode="activeTab === 'sort' ? pseudocodeLines : []"
    :has-inspector="activeTab === 'sort'"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <el-tabs v-model="activeTab" class="!mb-0">
          <el-tab-pane label="8大内部排序动态对比实验室" name="sort">
            <div class="space-y-2.5">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <el-radio-group v-model="sortAlgo" size="small">
                  <el-radio-button value="insertion">直接插入</el-radio-button>
                  <el-radio-button value="binaryInsertion">折半插入</el-radio-button>
                  <el-radio-button value="shell">希尔排序</el-radio-button>
                  <el-radio-button value="bubble">冒泡排序</el-radio-button>
                  <el-radio-button value="quick">快速排序</el-radio-button>
                  <el-radio-button value="selection">简单选择</el-radio-button>
                  <el-radio-button value="heap">堆排序</el-radio-button>
                  <el-radio-button value="merge">二路归并</el-radio-button>
                </el-radio-group>
                <div class="flex gap-1.5">
                  <el-button size="small" @click="randomizeArr">随机数组</el-button>
                  <el-button size="small" @click="arrInput = '10, 20, 30, 40, 50, 60, 70'">正序</el-button>
                  <el-button size="small" @click="arrInput = '70, 60, 50, 40, 30, 20, 10'">逆序</el-button>
                </div>
              </div>

              <div class="flex flex-wrap gap-2.5 items-center">
                <el-input v-model="arrInput" size="small" class="flex-1 min-w-[240px] font-mono">
                  <template #prepend>待排数组</template>
                </el-input>
                <el-input
                  v-if="sortAlgo === 'shell'"
                  v-model="shellGapInput"
                  size="small"
                  style="width: 190px"
                  class="font-mono"
                >
                  <template #prepend>增量d</template>
                </el-input>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="散列表 (Hash Table) 与 ASL 精确计算" name="hash">
            <div class="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
              <div class="md:col-span-5">
                <el-input v-model="hashKeysInput" size="small" class="font-mono">
                  <template #prepend>关键字序列</template>
                </el-input>
              </div>
              <div class="md:col-span-2 flex items-center gap-1.5">
                <span class="text-xs text-slate-500">表长 m:</span>
                <el-input-number v-model="hashTableLen" :min="5" :max="23" size="small" style="width: 82px" />
              </div>
              <div class="md:col-span-2 flex items-center gap-1.5">
                <span class="text-xs text-slate-500">模数 p:</span>
                <el-input-number v-model="hashModP" :min="2" :max="hashTableLen" size="small" style="width: 82px" />
              </div>
              <div class="md:col-span-3">
                <el-select v-model="hashStrategy" size="small" style="width: 100%">
                  <el-option label="线性探测 (di=0,1,2...)" value="linear" />
                  <el-option label="平方探测 (0,+1,-1,+4,-4...)" value="quadratic" />
                  <el-option label="拉链法 (同义词链)" value="chaining" />
                </el-select>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <template #stage>
      <!-- Sort Stage -->
      <div v-if="activeTab === 'sort'" class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div class="flex flex-wrap gap-3">
            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-indigo-500 inline-block"></span>比较中</span>
            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-rose-500 inline-block"></span>移动/交换</span>
            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-amber-500 inline-block"></span>枢轴 Pivot</span>
            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-emerald-500 inline-block"></span>已归位有序</span>
          </div>
          <div class="flex gap-2 font-mono">
            <el-tag size="small" type="primary">比较: {{ sortPlayer.currentStep.value?.state.comparisons ?? 0 }}</el-tag>
            <el-tag size="small" type="warning">移动: {{ sortPlayer.currentStep.value?.state.moves ?? 0 }}</el-tag>
          </div>
        </div>

        <EChartBox :option="sortChartOption" height="270px" />

        <!-- Synchronized Heap Tree -->
        <div v-if="sortAlgo === 'heap'" class="space-y-1.5">
          <div class="text-xs font-semibold text-indigo-600 dark:text-indigo-300">
            同步大根堆完全二叉树视图 (当前有效堆大小 = {{ sortPlayer.currentStep.value?.state.heapSize ?? 0 }})
          </div>
          <BinaryTreeCanvas :root="sortPlayer.currentStep.value?.state.heapTree ?? null" min-height="250px" />
        </div>
      </div>

      <!-- Hash Stage -->
      <div v-else class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <el-card shadow="never" class="!bg-slate-50 dark:!bg-slate-900/60">
            <div class="text-xs text-slate-400">装填因子 α = n / m</div>
            <div class="text-xl font-mono font-bold text-indigo-600 tabular-nums">
              {{ hashRes.insertLogs.length }} / {{ hashRes.tableSize }} = {{ hashRes.alpha }}
            </div>
          </el-card>
          <el-card shadow="never" class="!bg-emerald-50/50 dark:!bg-emerald-950/20">
            <div class="text-xs text-slate-500">查找成功平均长度 ASL_succ</div>
            <div class="text-xl font-mono font-bold text-emerald-600 tabular-nums">
              {{ hashRes.aslSuccessNum }} / {{ hashRes.aslSuccessDen }} =
              {{ (hashRes.aslSuccessNum / hashRes.aslSuccessDen).toFixed(2) }}
            </div>
          </el-card>
          <el-card shadow="never" class="!bg-amber-50/50 dark:!bg-amber-950/20">
            <div class="text-xs text-slate-500">查找失败 ASL_fail (入口 0..{{ hashRes.modP - 1 }})</div>
            <div class="text-xl font-mono font-bold text-amber-600 tabular-nums">
              {{ hashRes.aslFailNum }} / {{ hashRes.aslFailDen }} =
              {{ (hashRes.aslFailNum / hashRes.aslFailDen).toFixed(2) }}
            </div>
          </el-card>
        </div>

        <!-- Open Addressing Grid -->
        <div v-if="hashStrategy !== 'chaining'" class="overflow-x-auto">
          <table class="w-full text-center font-mono text-xs border-collapse tabular-nums">
            <thead>
              <tr class="bg-slate-100 dark:bg-slate-800">
                <th class="border border-slate-200 dark:border-slate-700 p-1.5">地址</th>
                <th v-for="s in hashRes.openSlots" :key="s.index" class="border border-slate-200 dark:border-slate-700 p-1.5">
                  {{ s.index }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th class="border border-slate-200 dark:border-slate-700 p-1.5 bg-slate-50 dark:bg-slate-900">关键字</th>
                <td
                  v-for="s in hashRes.openSlots"
                  :key="s.index"
                  :class="[
                    'border border-slate-200 dark:border-slate-700 p-2 font-bold',
                    s.key !== null ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300' : 'text-slate-300',
                  ]"
                >
                  {{ s.key ?? '-' }}
                </td>
              </tr>
              <tr>
                <th class="border border-slate-200 dark:border-slate-700 p-1.5 bg-slate-50 dark:bg-slate-900">成功次数</th>
                <td v-for="s in hashRes.openSlots" :key="s.index" class="border border-slate-200 dark:border-slate-700 p-1.5">
                  {{ s.key !== null ? s.probes : '-' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Chaining View -->
        <div v-else class="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
          <div
            v-for="c in hashRes.chains"
            :key="c.index"
            class="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center gap-1.5 flex-wrap"
          >
            <el-tag size="small" effect="dark">[{{ c.index }}]</el-tag>
            <span v-for="(item, idx) in c.items" :key="idx" class="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold">
              {{ item }}
            </span>
            <span v-if="c.items.length === 0" class="text-slate-400">NULL</span>
          </div>
        </div>

        <!-- Fail ASL breakdown -->
        <el-alert type="info" :closable="false">
          <template #title>
            查找失败各入口探测次数（共 p={{ hashRes.modP }} 个初始地址）:
          </template>
          <div class="font-mono text-xs mt-1">
            [{{ hashRes.aslFailArr.map((cnt, idx) => `addr ${idx}:${cnt}次`).join(' , ') }}]
          </div>
        </el-alert>

        <el-table :data="hashRes.insertLogs" size="small" border max-height="230">
          <el-table-column prop="key" label="关键字" width="80" />
          <el-table-column prop="hash0" label="H(key)=key%p" width="110" />
          <el-table-column prop="finalSlot" label="最终落位" width="90" />
          <el-table-column prop="probes" label="查找成功比较次数" width="130" />
          <el-table-column label="探测路径">
            <template #default="{ row }">
              <span class="font-mono text-xs">{{ row.path.join(' → ') }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <template #inspector>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <template #header>
          <span class="text-xs font-semibold">同输入序列下 8 大排序实测开销对比</span>
        </template>
        <EChartBox :option="benchChartOption" height="270px" />
        <el-table :data="benchmarks" size="small" border class="mt-2">
          <el-table-column prop="name" label="算法" />
          <el-table-column prop="comparisons" label="比较" width="60" />
          <el-table-column prop="moves" label="移动" width="60" />
          <el-table-column prop="stable" label="稳定性" width="68" />
        </el-table>
      </el-card>
    </template>
  </LabShell>
</template>
