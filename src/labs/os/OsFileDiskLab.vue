<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import EChartBox from '../../components/common/EChartBox.vue';
import { bindLabPlayer, useStepPlayer } from '../../composables/useStepPlayer';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const activeTab = ref<'disk' | 'inode'>('disk');

// Tab 1: Disk Scheduling
type DiskAlgo = 'FCFS' | 'SSTF' | 'SCAN' | 'CSCAN' | 'LOOK' | 'CLOOK';
const diskAlgo = ref<DiskAlgo>('SCAN');
const startHead = ref(53);
const maxTrack = ref(199);
const directionUp = ref(true);
const reqInput = ref('98, 183, 37, 122, 14, 124, 65, 67');

const parsedReqs = computed(() =>
  reqInput.value
    .split(/[\s,，;]+/)
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= maxTrack.value)
);

function computeDiskPath(algo: DiskAlgo, head: number, maxT: number, up: boolean, reqs: number[]) {
  const path: number[] = [head];
  const pending = [...reqs];

  if (algo === 'FCFS') {
    path.push(...pending);
  } else if (algo === 'SSTF') {
    let cur = head;
    const pool = [...pending];
    while (pool.length > 0) {
      let bestIdx = 0;
      let bestDist = Math.abs(pool[0] - cur);
      for (let i = 1; i < pool.length; i++) {
        const d = Math.abs(pool[i] - cur);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      cur = pool.splice(bestIdx, 1)[0];
      path.push(cur);
    }
  } else {
    const left = pending.filter((x) => x < head).sort((a, b) => b - a); // descending
    const right = pending.filter((x) => x >= head).sort((a, b) => a - b); // ascending
    if (algo === 'LOOK') {
      if (up) path.push(...right, ...left);
      else path.push(...left, ...right);
    } else if (algo === 'CLOOK') {
      if (up) path.push(...right, ...[...left].reverse());
      else path.push(...left, ...[...right].reverse());
    } else if (algo === 'SCAN') {
      if (up) {
        path.push(...right);
        if (left.length > 0) {
          if (right[right.length - 1] !== maxT) path.push(maxT);
          path.push(...left);
        }
      } else {
        path.push(...left);
        if (right.length > 0) {
          if (left[left.length - 1] !== 0) path.push(0);
          path.push(...right);
        }
      }
    } else if (algo === 'CSCAN') {
      if (up) {
        path.push(...right);
        if (left.length > 0) {
          if (right[right.length - 1] !== maxT) path.push(maxT);
          path.push(0);
          path.push(...[...left].reverse());
        }
      } else {
        path.push(...left);
        if (right.length > 0) {
          if (left[left.length - 1] !== 0) path.push(0);
          path.push(maxT);
          path.push(...[...right].reverse());
        }
      }
    }
  }

  let totalMove = 0;
  for (let i = 1; i < path.length; i++) {
    totalMove += Math.abs(path[i] - path[i - 1]);
  }
  const avgMove = reqs.length ? Number((totalMove / reqs.length).toFixed(2)) : 0;
  return { path, totalMove, avgMove };
}

const fullPathRes = computed(() =>
  computeDiskPath(diskAlgo.value, startHead.value, maxTrack.value, directionUp.value, parsedReqs.value)
);

const diskSteps = computed(() => {
  const full = fullPathRes.value.path;
  return full.map((pos, idx) => {
    const partial = full.slice(0, idx + 1);
    let moved = 0;
    for (let i = 1; i < partial.length; i++) moved += Math.abs(partial[i] - partial[i - 1]);
    return {
      title: idx === 0 ? `磁头位于初始柱面 ${pos}` : `移动至柱面 ${pos} (步距 ${Math.abs(pos - full[idx - 1])})`,
      description:
        idx === 0
          ? `采用 ${diskAlgo.value} 调度策略，磁头起始位置 ${pos}。`
          : `从 ${full[idx - 1]} 移至 ${pos}，当前累计寻道长度 = ${moved}。`,
      state: { partialPath: partial, curMove: moved },
    };
  });
});

const diskPlayer = useStepPlayer(diskSteps, 600);
const activePlayerBind = computed(() =>
  activeTab.value === 'disk' ? bindLabPlayer(diskPlayer).value : undefined
);

const diskChartOption = computed(() => {
  const pts = diskPlayer.currentStep.value?.state.partialPath ?? fullPathRes.value.path;
  return {
    tooltip: { trigger: 'axis' },
    grid: { top: 24, bottom: 32, left: 52, right: 24 },
    xAxis: {
      type: 'category',
      data: pts.map((_, i) => (i === 0 ? '起点' : `第${i}步`)),
    },
    yAxis: { type: 'value', min: 0, max: maxTrack.value, name: '柱面号' },
    series: [
      {
        name: '磁头轨迹',
        type: 'line',
        data: pts,
        symbolSize: 9,
        lineStyle: { width: 3, color: '#10b981' },
        itemStyle: { color: '#059669' },
        label: { show: true, position: 'top', fontWeight: 'bold' },
      },
    ],
  };
});

const allDiskCompare = computed(() => {
  const algos: DiskAlgo[] = ['FCFS', 'SSTF', 'SCAN', 'CSCAN', 'LOOK', 'CLOOK'];
  return algos.map((a) => {
    const r = computeDiskPath(a, startHead.value, maxTrack.value, directionUp.value, parsedReqs.value);
    return { algo: a, totalMove: r.totalMove, avgMove: r.avgMove };
  });
});

// Tab 2: UNIX Inode Hybrid Index
const blockSizeKB = ref(4);
const ptrBytes = ref(4);
const directCnt = ref(10);
const ind1Cnt = ref(1);
const ind2Cnt = ref(1);
const ind3Cnt = ref(1);
const targetBlock = ref(1030);

const inodeAnalysis = computed(() => {
  const blockBytes = blockSizeKB.value * 1024;
  const k = Math.floor(blockBytes / ptrBytes.value); // pointers per index block
  const capDirect = directCnt.value;
  const cap1 = ind1Cnt.value * k;
  const cap2 = ind2Cnt.value * k * k;
  const cap3 = ind3Cnt.value * k * k * k;
  const maxBlocks = capDirect + cap1 + cap2 + cap3;
  const maxFileBytes = maxBlocks * blockBytes;
  const maxFileStr =
    maxFileBytes >= 1024 ** 4
      ? `${(maxFileBytes / 1024 ** 4).toFixed(2)} TB`
      : maxFileBytes >= 1024 ** 3
        ? `${(maxFileBytes / 1024 ** 3).toFixed(2)} GB`
        : `${(maxFileBytes / 1024 ** 2).toFixed(2)} MB`;

  const b = targetBlock.value;
  let levelName = '';
  let diskReads = 1;
  let pathSteps: string[] = [];

  if (b < capDirect) {
    levelName = '直接索引 (0级)';
    diskReads = 1;
    pathSteps = [`Inode.i_addr[${b}]`, `直接读取数据块 (共1次访盘)`];
  } else if (b < capDirect + cap1) {
    const rel = b - capDirect;
    const slot = Math.floor(rel / k);
    const idx = rel % k;
    levelName = '一级间接索引';
    diskReads = 2;
    pathSteps = [`Inode 一级项[${slot}]`, `读一级索引块[${idx}]`, `读数据块 (共2次访盘)`];
  } else if (b < capDirect + cap1 + cap2) {
    const rel = b - capDirect - cap1;
    const slot = Math.floor(rel / (k * k));
    const rem = rel % (k * k);
    const idx1 = Math.floor(rem / k);
    const idx2 = rem % k;
    levelName = '二级间接索引';
    diskReads = 3;
    pathSteps = [`Inode 二级项[${slot}]`, `读一级表[${idx1}]`, `读二级表[${idx2}]`, `读数据块 (共3次访盘)`];
  } else if (b < maxBlocks) {
    const rel = b - capDirect - cap1 - cap2;
    const k3 = k * k * k;
    const slot = Math.floor(rel / k3);
    const rem1 = rel % k3;
    const idx1 = Math.floor(rem1 / (k * k));
    const rem2 = rem1 % (k * k);
    const idx2 = Math.floor(rem2 / k);
    const idx3 = rem2 % k;
    levelName = '三级间接索引';
    diskReads = 4;
    pathSteps = [
      `Inode 三级项[${slot}]`,
      `第1层表[${idx1}]`,
      `第2层表[${idx2}]`,
      `第3层表[${idx3}]`,
      `读数据块 (共4次访盘)`,
    ];
  } else {
    levelName = '超出文件最大支持长度！';
    diskReads = 0;
    pathSteps = ['越界错误'];
  }

  return { k, capDirect, cap1, cap2, cap3, maxBlocks, maxFileStr, levelName, diskReads, pathSteps };
});
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :player="activePlayerBind"
    :has-inspector="activeTab === 'disk'"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <el-tabs v-model="activeTab" class="!mb-0">
          <el-tab-pane label="磁盘移臂调度轨迹对比" name="disk">
            <div class="space-y-2.5">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <el-radio-group v-model="diskAlgo" size="small">
                  <el-radio-button value="FCFS">FCFS</el-radio-button>
                  <el-radio-button value="SSTF">SSTF</el-radio-button>
                  <el-radio-button value="SCAN">SCAN (走到底)</el-radio-button>
                  <el-radio-button value="CSCAN">C-SCAN (走到底归零)</el-radio-button>
                  <el-radio-button value="LOOK">LOOK</el-radio-button>
                  <el-radio-button value="CLOOK">C-LOOK</el-radio-button>
                </el-radio-group>

                <el-switch
                  v-model="directionUp"
                  active-text="方向: 向柱面号增大方向"
                  inactive-text="方向: 向 0 号减小方向"
                />
              </div>

              <div class="flex flex-wrap items-center gap-2.5">
                <span class="text-xs text-slate-500">初始磁头:</span>
                <el-input-number v-model="startHead" :min="0" :max="maxTrack" size="small" style="width: 92px" />
                <span class="text-xs text-slate-500">最大柱面:</span>
                <el-input-number v-model="maxTrack" :min="50" :max="999" size="small" style="width: 95px" />
                <el-input v-model="reqInput" size="small" class="flex-1 min-w-[240px] font-mono">
                  <template #prepend>请求序列</template>
                </el-input>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="UNIX Inode 多级混合索引定位" name="inode">
            <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 items-end">
              <div>
                <div class="text-[11px] text-slate-500 mb-1">磁盘块大小 (KB)</div>
                <el-select v-model="blockSizeKB" size="small" style="width: 100%">
                  <el-option :value="1" label="1 KB" />
                  <el-option :value="2" label="2 KB" />
                  <el-option :value="4" label="4 KB" />
                </el-select>
              </div>
              <div>
                <div class="text-[11px] text-slate-500 mb-1">块指针大小 (B)</div>
                <el-select v-model="ptrBytes" size="small" style="width: 100%">
                  <el-option :value="2" label="2 B" />
                  <el-option :value="4" label="4 B" />
                </el-select>
              </div>
              <div>
                <div class="text-[11px] text-slate-500 mb-1">直接块数</div>
                <el-input-number v-model="directCnt" :min="1" :max="12" size="small" style="width: 100%" />
              </div>
              <div>
                <div class="text-[11px] text-slate-500 mb-1">一级间址数</div>
                <el-input-number v-model="ind1Cnt" :min="0" :max="2" size="small" style="width: 100%" />
              </div>
              <div>
                <div class="text-[11px] text-slate-500 mb-1">二级间址数</div>
                <el-input-number v-model="ind2Cnt" :min="0" :max="2" size="small" style="width: 100%" />
              </div>
              <div>
                <div class="text-[11px] text-slate-500 mb-1">三级间址数</div>
                <el-input-number v-model="ind3Cnt" :min="0" :max="1" size="small" style="width: 100%" />
              </div>
              <div>
                <div class="text-[11px] text-indigo-600 font-bold mb-1">查询逻辑块号</div>
                <el-input-number v-model="targetBlock" :min="0" size="small" style="width: 100%" />
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <template #stage>
      <!-- Stage 1: Disk -->
      <div v-if="activeTab === 'disk'" class="space-y-3">
        <div class="flex flex-wrap gap-2 font-mono text-xs">
          <el-tag type="success" effect="dark">总寻道长度: {{ fullPathRes.totalMove }} 柱面</el-tag>
          <el-tag type="warning">平均寻道长度: {{ fullPathRes.avgMove }}</el-tag>
          <el-tag type="info">移动轨迹: {{ fullPathRes.path.join(' → ') }}</el-tag>
        </div>
        <EChartBox :option="diskChartOption" height="310px" />
      </div>

      <!-- Stage 2: Inode -->
      <div v-else class="space-y-4">
        <div class="flex flex-wrap gap-2">
          <el-button size="small" @click="targetBlock = 5">测直接块 (5)</el-button>
          <el-button size="small" @click="targetBlock = inodeAnalysis.capDirect + 20">测一级间址</el-button>
          <el-button size="small" @click="targetBlock = inodeAnalysis.capDirect + inodeAnalysis.cap1 + 50">测二级间址</el-button>
          <el-button size="small" @click="targetBlock = inodeAnalysis.capDirect + inodeAnalysis.cap1 + inodeAnalysis.cap2 + 10">测三级间址</el-button>
        </div>

        <el-descriptions :column="2" border size="small" class="font-mono">
          <el-descriptions-item label="每块容纳指针数 K">{{ inodeAnalysis.k }} 个</el-descriptions-item>
          <el-descriptions-item label="理论最大支持文件">{{ inodeAnalysis.maxFileStr }}</el-descriptions-item>
          <el-descriptions-item label="命中索引层级">
            <el-tag type="primary" effect="dark">{{ inodeAnalysis.levelName }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="Inode已在内存时需访盘">
            <el-tag type="danger" effect="dark">{{ inodeAnalysis.diskReads }} 次</el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div class="text-xs font-semibold text-slate-500 mb-3">精确索引逐层定位路径 (逻辑块号 {{ targetBlock }})</div>
          <el-steps :active="inodeAnalysis.pathSteps.length" finish-status="success" align-center>
            <el-step v-for="(s, i) in inodeAnalysis.pathSteps" :key="i" :title="`步骤 ${i + 1}`" :description="s" />
          </el-steps>
        </div>
      </div>
    </template>

    <template #inspector>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <template #header>
          <span class="text-xs font-semibold">六种磁盘调度算法同序列对比</span>
        </template>
        <el-table :data="allDiskCompare" size="small" border class="font-mono">
          <el-table-column prop="algo" label="算法" />
          <el-table-column prop="totalMove" label="总寻道" />
          <el-table-column prop="avgMove" label="平均寻道" />
        </el-table>
      </el-card>
    </template>
  </LabShell>
</template>
