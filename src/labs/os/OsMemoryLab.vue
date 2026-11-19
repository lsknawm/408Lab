<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import EChartBox from '../../components/common/EChartBox.vue';
import { bindLabPlayer, useStepPlayer } from '../../composables/useStepPlayer';
import {
  simulatePageReplacement,
  type MemBlock,
  type PageAlgo,
  type PartitionAlgo,
} from './engines/memoryEngine';
import { ElMessage } from 'element-plus';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const activeTab = ref<'paging' | 'partition'>('paging');

// Tab 1: Page Replacement
const pageAlgo = ref<PageAlgo>('LRU');
const frameCount = ref(3);
const refStr = ref('7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1');
const showBelady = ref(false);

const pageSteps = computed(() => simulatePageReplacement(refStr.value, frameCount.value, pageAlgo.value));
const pagePlayer = useStepPlayer(pageSteps, 650);

const curPageState = computed(() => pagePlayer.currentStep.value?.state);

function triggerBeladyPreset() {
  pageAlgo.value = 'FIFO';
  refStr.value = '1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5';
  showBelady.value = true;
}

function loadEnhancedClockPreset() {
  pageAlgo.value = 'ENHANCED_CLOCK';
  frameCount.value = 3;
  refStr.value = '1w, 2, 3w, 4, 1, 5w, 2, 3';
}

const beladyChartOption = computed(() => {
  const counts = [2, 3, 4, 5].map((m) => {
    const s = simulatePageReplacement(refStr.value, m, 'FIFO');
    const last = s[s.length - 1]?.state;
    return { m, faults: last?.pageFaults ?? 0 };
  });
  const lruCounts = [2, 3, 4, 5].map((m) => {
    const s = simulatePageReplacement(refStr.value, m, 'LRU');
    const last = s[s.length - 1]?.state;
    return { m, faults: last?.pageFaults ?? 0 };
  });

  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { top: 32, bottom: 28, left: 45, right: 20 },
    xAxis: { type: 'category', data: counts.map((c) => `${c.m} 个物理块`) },
    yAxis: { type: 'value', name: '缺页次数' },
    series: [
      { name: 'FIFO (可能出现Belady异常)', type: 'line', data: counts.map((c) => c.faults), symbolSize: 8, itemStyle: { color: '#ef4444' } },
      { name: 'LRU (栈式算法单调不增)', type: 'line', data: lruCounts.map((c) => c.faults), symbolSize: 8, itemStyle: { color: '#10b981' } },
    ],
  };
});

// Tab 2: Dynamic Partition Allocation
const totalMem = 256;
const partAlgo = ref<PartitionAlgo>('FF');
const blocks = ref<MemBlock[]>([
  { id: 'b1', start: 0, size: 64, jobName: '作业1' },
  { id: 'b2', start: 64, size: 48, jobName: null },
  { id: 'b3', start: 112, size: 52, jobName: '作业2' },
  { id: 'b4', start: 164, size: 92, jobName: null },
]);
const newJobName = ref('作业3');
const newJobSize = ref(36);
const nfPointerStart = ref(0);
const partLog = ref('初始内存 256KB；可按 FF/BF/WF/NF 分配新作业，或点击占用块直接释放观察四类合并！');

function resetPartitions() {
  blocks.value = [
    { id: 'b1', start: 0, size: 64, jobName: '作业1' },
    { id: 'b2', start: 64, size: 48, jobName: null },
    { id: 'b3', start: 112, size: 52, jobName: '作业2' },
    { id: 'b4', start: 164, size: 92, jobName: null },
  ];
  nfPointerStart.value = 0;
  partLog.value = '已重置内存空间。';
}

function allocJob() {
  const name = newJobName.value.trim() || `作业${Date.now() % 100}`;
  const need = newJobSize.value;
  if (blocks.value.some((b) => b.jobName === name)) {
    ElMessage.warning(`作业 ${name} 已在内存中`);
    return;
  }

  const freeList = blocks.value
    .map((b, idx) => ({ b, idx }))
    .filter((item) => item.b.jobName === null && item.b.size >= need);

  if (freeList.length === 0) {
    ElMessage.error(`没有足够大的连续空闲分区容纳 ${need}KB（产生外部碎片）！`);
    partLog.value = `分配失败：所有单个空闲块均小于 ${need}KB！`;
    return;
  }

  let chosenIdx = freeList[0].idx;
  if (partAlgo.value === 'BF') {
    chosenIdx = freeList.reduce((a, b) => (a.b.size <= b.b.size ? a : b)).idx;
  } else if (partAlgo.value === 'WF') {
    chosenIdx = freeList.reduce((a, b) => (a.b.size >= b.b.size ? a : b)).idx;
  } else if (partAlgo.value === 'NF') {
    const after = freeList.find((x) => x.b.start >= nfPointerStart.value);
    chosenIdx = (after || freeList[0]).idx;
  }

  const target = blocks.value[chosenIdx];
  const rem = target.size - need;
  const allocated: MemBlock = { id: `job_${Date.now()}`, start: target.start, size: need, jobName: name };
  const replacement: MemBlock[] = [allocated];
  if (rem > 0) {
    replacement.push({ id: `free_${Date.now()}`, start: target.start + need, size: rem, jobName: null });
  }
  blocks.value.splice(chosenIdx, 1, ...replacement);
  nfPointerStart.value = (target.start + need) % totalMem;
  partLog.value = `[${partAlgo.value}] 为 ${name} (${need}KB) 分配在起始地址 ${target.start}KB 处${rem > 0 ? `，切出剩余空闲块 ${rem}KB` : '，恰好整块分配'}。`;

  const m = name.match(/\d+/);
  if (m) newJobName.value = `作业${Number(m[0]) + 1}`;
}

function freeBlock(idx: number) {
  const b = blocks.value[idx];
  if (!b.jobName) return;
  const freedName = b.jobName;
  b.jobName = null;

  const hasPrevFree = idx > 0 && blocks.value[idx - 1].jobName === null;
  const hasNextFree = idx < blocks.value.length - 1 && blocks.value[idx + 1].jobName === null;

  let mergeMsg = '无相邻空闲区，独立成为空闲分区（情形4）';
  if (hasPrevFree && hasNextFree) mergeMsg = '同时与上下相邻空闲区合并为一体（情形3）！';
  else if (hasPrevFree) mergeMsg = '与前方相邻空闲区合并（情形1）';
  else if (hasNextFree) mergeMsg = '与后方相邻空闲区合并（情形2）';

  // Coalesce adjacent free blocks
  const merged: MemBlock[] = [];
  for (const blk of blocks.value) {
    const last = merged[merged.length - 1];
    if (last && last.jobName === null && blk.jobName === null) {
      last.size += blk.size;
    } else {
      merged.push({ ...blk });
    }
  }
  blocks.value = merged;
  partLog.value = `释放 ${freedName}：${mergeMsg}`;
}

const activePlayerBind = computed(() =>
  activeTab.value === 'paging' ? bindLabPlayer(pagePlayer).value : undefined
);

const pagePseudo = [
  'for (page in referenceString) {',
  '  if (page in Frames) {',
  '    HIT! updateLRU_or_ABit();',
  '  } else { pageFaults++;',
  '    if (hasEmptyFrame()) loadIntoEmpty();',
  '    else {',
  '      victim = selectVictim(OPT / FIFO / LRU / Clock);',
  '      replacements++; replace(victim, page);',
  '    }',
  '  }',
  '}',
];
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :player="activePlayerBind"
    :pseudocode="activeTab === 'paging' ? pagePseudo : []"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <el-tabs v-model="activeTab" class="!mb-0">
          <el-tab-pane label="页面置换算法实验室 (含 Belady 异常)" name="paging">
            <div class="space-y-2.5">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <el-radio-group v-model="pageAlgo" size="small">
                  <el-radio-button value="OPT">OPT (最佳)</el-radio-button>
                  <el-radio-button value="FIFO">FIFO (先进先出)</el-radio-button>
                  <el-radio-button value="LRU">LRU (最近最久未用)</el-radio-button>
                  <el-radio-button value="CLOCK">Clock (NRU)</el-radio-button>
                  <el-radio-button value="ENHANCED_CLOCK">改进型 Clock (A,M)</el-radio-button>
                </el-radio-group>

                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-xs text-slate-500">物理页框数 m:</span>
                  <el-input-number v-model="frameCount" :min="2" :max="6" size="small" style="width: 82px" />
                  <el-button size="small" type="danger" plain @click="triggerBeladyPreset">Belady 异常演示</el-button>
                  <el-button size="small" type="warning" plain @click="loadEnhancedClockPreset">含写操作(w)Clock例</el-button>
                </div>
              </div>

              <el-input v-model="refStr" size="small" class="font-mono">
                <template #prepend>页面访问串 (加 w 表示写操作, 如 3w)</template>
              </el-input>
            </div>
          </el-tab-pane>

          <el-tab-pane label="动态分区分配与空闲块合并" name="partition">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <el-radio-group v-model="partAlgo" size="small">
                <el-radio-button value="FF">首次适应 (FF)</el-radio-button>
                <el-radio-button value="NF">邻近适应 (NF)</el-radio-button>
                <el-radio-button value="BF">最佳适应 (BF)</el-radio-button>
                <el-radio-button value="WF">最坏适应 (WF)</el-radio-button>
              </el-radio-group>

              <div class="flex flex-wrap items-center gap-2">
                <el-input v-model="newJobName" size="small" style="width: 88px" />
                <el-input-number v-model="newJobSize" :min="4" :max="256" size="small" style="width: 96px" />
                <el-button type="primary" size="small" @click="allocJob">分配内存 (KB)</el-button>
                <el-button size="small" @click="resetPartitions">重置</el-button>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <template #stage>
      <!-- Stage 1: Paging -->
      <div v-if="activeTab === 'paging' && curPageState" class="space-y-4">
        <div class="flex flex-wrap items-center gap-3 font-mono text-xs">
          <el-tag type="danger" effect="dark">缺页次数: {{ curPageState.pageFaults }}</el-tag>
          <el-tag type="warning">置换次数: {{ curPageState.replacements }}</el-tag>
          <el-tag type="success">命中次数: {{ curPageState.hits }}</el-tag>
          <el-tag type="info">
            缺页率:
            {{
              curPageState.historyCols.length
                ? ((curPageState.pageFaults / curPageState.historyCols.length) * 100).toFixed(1)
                : '0.0'
            }}%
          </el-tag>
        </div>

        <!-- Current Physical Frames & Clock Hand -->
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
          <div
            v-for="(f, idx) in curPageState.frames"
            :key="idx"
            :class="[
              'p-3 rounded-xl border-2 text-center font-mono transition-all',
              f.isHit
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                : f.isNewOrReplaced
                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/30'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40',
            ]"
          >
            <div class="text-[11px] text-slate-400 flex items-center justify-between">
              <span>框 {{ idx }}</span>
              <span
                v-if="(pageAlgo === 'CLOCK' || pageAlgo === 'ENHANCED_CLOCK') && curPageState.clockPtr === idx"
                class="text-amber-600 font-bold"
              >
                ← 指针
              </span>
            </div>
            <div class="text-2xl font-bold my-1">{{ f.page ?? '-' }}</div>
            <div v-if="pageAlgo === 'CLOCK' || pageAlgo === 'ENHANCED_CLOCK'" class="text-[11px] text-slate-500">
              A={{ f.aBit }} <span v-if="pageAlgo === 'ENHANCED_CLOCK'">| M={{ f.mBit }}</span>
            </div>
          </div>
        </div>

        <!-- History Grid -->
        <div class="overflow-x-auto">
          <table class="w-full text-center font-mono text-xs border-collapse tabular-nums">
            <thead>
              <tr class="bg-slate-100 dark:bg-slate-800">
                <th class="border border-slate-200 dark:border-slate-700 p-1.5 text-left min-w-[70px]">访问页</th>
                <th
                  v-for="(col, cIdx) in curPageState.historyCols"
                  :key="cIdx"
                  class="border border-slate-200 dark:border-slate-700 p-1.5 min-w-[36px]"
                >
                  {{ col.req }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="rIdx in curPageState.framesCount" :key="rIdx">
                <th class="border border-slate-200 dark:border-slate-700 p-1.5 text-left bg-slate-50 dark:bg-slate-900">
                  物理框 {{ rIdx - 1 }}
                </th>
                <td
                  v-for="(col, cIdx) in curPageState.historyCols"
                  :key="cIdx"
                  class="border border-slate-200 dark:border-slate-700 p-1.5"
                >
                  {{ col.frames[rIdx - 1] ?? '' }}
                </td>
              </tr>
              <tr>
                <th class="border border-slate-200 dark:border-slate-700 p-1.5 text-left bg-slate-50 dark:bg-slate-900">结果</th>
                <td
                  v-for="(col, cIdx) in curPageState.historyCols"
                  :key="cIdx"
                  :class="[
                    'border border-slate-200 dark:border-slate-700 p-1.5 font-bold',
                    col.fault ? 'text-rose-600 bg-rose-50/50 dark:bg-rose-950/30' : 'text-emerald-600',
                  ]"
                >
                  {{ col.fault ? (col.replaced !== null ? `缺(换${col.replaced})` : '缺') : '✓' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="showBelady" class="pt-2">
          <div class="text-xs font-semibold text-rose-600 mb-1">
            Belady 异常实证：物理块增加时 FIFO 缺页次数反升（如 m=3→9次，m=4→10次）
          </div>
          <EChartBox :option="beladyChartOption" height="230px" />
        </div>
      </div>

      <!-- Stage 2: Dynamic Partitions -->
      <div v-else class="space-y-4">
        <div class="text-xs text-slate-500">点击任意【已占用彩色块】即可释放该作业，现场验证四类空闲分区合并！</div>

        <div class="flex w-full h-20 rounded-xl overflow-hidden border-2 border-slate-300 dark:border-slate-700">
          <div
            v-for="(blk, idx) in blocks"
            :key="blk.id"
            :style="{ width: `${(blk.size / totalMem) * 100}%` }"
            :class="[
              'flex flex-col items-center justify-center text-xs font-mono border-r border-white/40 last:border-r-0 transition-all',
              blk.jobName
                ? 'bg-indigo-600 text-white cursor-pointer hover:bg-rose-600'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500',
            ]"
            :title="blk.jobName ? '点击释放此作业' : '空闲分区'"
            @click="blk.jobName && freeBlock(idx)"
          >
            <span class="font-bold truncate px-1">{{ blk.jobName || '空闲' }}</span>
            <span class="text-[10px] opacity-85">{{ blk.size }}KB</span>
          </div>
        </div>

        <el-alert type="info" :closable="false" :description="partLog" />

        <el-table :data="blocks" size="small" border class="font-mono">
          <el-table-column prop="start" label="起始地址 (KB)" width="120" />
          <el-table-column prop="size" label="分区大小 (KB)" width="120" />
          <el-table-column label="状态">
            <template #default="{ row }">
              <el-tag :type="row.jobName ? 'primary' : 'success'" size="small">
                {{ row.jobName ? `已分配: ${row.jobName}` : '空闲分区' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template #default="{ row, $index }">
              <el-button v-if="row.jobName" type="danger" link size="small" @click="freeBlock($index)">释放</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>
  </LabShell>
</template>
