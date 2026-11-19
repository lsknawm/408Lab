<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import EChartBox from '../../components/common/EChartBox.vue';
import { bindLabPlayer, useStepPlayer } from '../../composables/useStepPlayer';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const activeTab = ref<'interrupt' | 'dma'>('interrupt');

// Tab 1: Interrupt Masking
const sources = ['A', 'B', 'C', 'D'] as const;
type SrcId = (typeof sources)[number];

// Mask[running][incoming] === 1 means running blocks incoming
const maskMatrix = reactive<Record<SrcId, Record<SrcId, boolean>>>({
  A: { A: true, B: true, C: true, D: true }, // A blocks all (highest)
  B: { A: false, B: true, C: false, D: true }, // B blocks B, D (lets A, C preempt!)
  C: { A: false, B: true, C: true, D: true }, // C blocks B, C, D
  D: { A: false, B: false, C: false, D: true }, // D blocks only D
});

const requests = reactive<Array<{ id: SrcId; arrive: number; duration: number }>>([
  { id: 'B', arrive: 1, duration: 4 },
  { id: 'D', arrive: 2, duration: 3 },
  { id: 'C', arrive: 3, duration: 3 },
  { id: 'A', arrive: 4, duration: 2 },
]);

const intSteps = computed(() => {
  const maxTime = 20;
  const rem: Record<SrcId, number> = { A: 0, B: 0, C: 0, D: 0 };
  const pending = new Set<SrcId>();
  const stack: SrcId[] = [];
  const timeline: Array<{ t: number; running: string }> = [];
  const respOrder: SrcId[] = [];
  const finishOrder: SrcId[] = [];

  const steps: Array<{
    title: string;
    description: string;
    codeLine: number;
    state: {
      t: number;
      running: string;
      stack: string[];
      pending: string[];
      timeline: Array<{ t: number; running: string }>;
      respOrder: string[];
      finishOrder: string[];
    };
  }> = [];

  for (let t = 0; t < maxTime; t++) {
    // Check arrivals at time t
    const arrivedNow: SrcId[] = [];
    for (const req of requests) {
      if (req.arrive === t) {
        pending.add(req.id);
        rem[req.id] = req.duration;
        arrivedNow.push(req.id);
      }
    }

    // Check if an unmasked higher-priority pending interrupt can preempt current top of stack
    const curTop = stack.length > 0 ? stack[stack.length - 1] : null;
    for (const s of sources) {
      if (pending.has(s) && (!curTop || !maskMatrix[curTop][s])) {
        // Preempt! Hardware selects highest priority unmasked source (A>B>C>D)
        pending.delete(s);
        stack.push(s);
        if (!respOrder.includes(s)) respOrder.push(s);
        break;
      }
    }

    const active = stack.length > 0 ? stack[stack.length - 1] : 'MAIN';
    timeline.push({ t, running: active });

    steps.push({
      title: `时刻 t=${t}: 执行 ${active === 'MAIN' ? '主程序' : `中断源 ${active} 服务程序`}`,
      description: `${
        arrivedNow.length ? `本拍收到中断请求 [${arrivedNow.join(', ')}]。` : ''
      }当前栈顶=${active}，挂起等待中=[${Array.from(pending).join(', ') || '无'}]。`,
      codeLine: active === 'MAIN' ? 2 : 5,
      state: {
        t,
        running: active,
        stack: [...stack],
        pending: Array.from(pending),
        timeline: [...timeline],
        respOrder: [...respOrder],
        finishOrder: [...finishOrder],
      },
    });

    if (stack.length > 0) {
      const top = stack[stack.length - 1];
      rem[top]--;
      if (rem[top] <= 0) {
        stack.pop();
        finishOrder.push(top);
      }
    }

    if (t > 6 && stack.length === 0 && pending.size === 0 && requests.every((r) => r.arrive <= t)) {
      break;
    }
  }

  return steps;
});

const intPlayer = useStepPlayer(intSteps, 750);
const activePlayerBind = computed(() =>
  activeTab.value === 'interrupt' ? bindLabPlayer(intPlayer).value : undefined
);

// Tab 2: Programmed I/O vs Interrupt vs DMA
const cpuFreqMhz = ref(100);
const ioRateMBps = ref(4);
const bytePerTransfer = ref(4); // 4B per word
const intCycles = ref(400);
const dmaBlockBytes = ref(4096);
const dmaSetupCycles = ref(1000);

const ioComparison = computed(() => {
  const cpuHz = cpuFreqMhz.value * 1e6;
  const bytesPerSec = ioRateMBps.value * 1024 * 1024;
  // Programmed I/O: assuming polling constantly during transfer or 100 cycles per query
  const intCountPerSec = bytesPerSec / bytePerTransfer.value;
  const intCpuCycles = intCountPerSec * intCycles.value;
  const intPct = Math.min(100, Number(((intCpuCycles / cpuHz) * 100).toFixed(2)));

  const dmaIntsPerSec = bytesPerSec / dmaBlockBytes.value;
  const dmaCpuCycles = dmaIntsPerSec * dmaSetupCycles.value;
  const dmaPct = Math.min(100, Number(((dmaCpuCycles / cpuHz) * 100).toFixed(3)));

  // Programmed I/O polling during full active period (say 100% if continuous or proportional to wait)
  const pollCyclesPerSec = (bytesPerSec / bytePerTransfer.value) * 120;
  const pollPct = Math.min(100, Number(((pollCyclesPerSec / cpuHz) * 100).toFixed(2)));

  return { pollPct, intPct, dmaPct, intCountPerSec: Math.round(intCountPerSec), dmaIntsPerSec: Math.round(dmaIntsPerSec) };
});

const dmaChartOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { top: 30, bottom: 30, left: 50, right: 20 },
  xAxis: { type: 'category', data: ['程序查询 I/O', '程序中断驱动', 'DMA 块传送'] },
  yAxis: { type: 'value', max: 100, name: 'CPU 占用率 (%)' },
  series: [
    {
      type: 'bar',
      barWidth: '42%',
      label: { show: true, position: 'top', formatter: '{c}%' },
      data: [
        { value: ioComparison.value.pollPct, itemStyle: { color: '#ef4444' } },
        { value: ioComparison.value.intPct, itemStyle: { color: '#f59e0b' } },
        { value: ioComparison.value.dmaPct, itemStyle: { color: '#10b981' } },
      ],
    },
  ],
}));

const intPseudo = [
  '// 多重中断隐指令与屏蔽字处理流程',
  'ExecuteMainProgram();',
  'if (exists pending i && !CurrentMask[i]) {',
  '  SaveContextAndPC_ToStack();',
  '  MaskRegister = NewISR_Mask[i]; // 更换屏蔽字',
  '  EnableInterrupt(); // 开中断允许更高级/未屏蔽者嵌套',
  '  RunISR(i);',
  '  DisableInterrupt(); RestoreContextAndMask();',
  '}',
];
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :player="activePlayerBind"
    :pseudocode="activeTab === 'interrupt' ? intPseudo : []"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <el-tabs v-model="activeTab" class="!mb-0">
          <el-tab-pane label="多重中断屏蔽字与嵌套模拟器" name="interrupt">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <div class="text-xs font-semibold mb-1.5">自定义中断屏蔽字矩阵（1=屏蔽对方，0=允许对方打断自己）</div>
                <table class="w-full text-center font-mono text-xs border-collapse">
                  <thead>
                    <tr class="bg-slate-100 dark:bg-slate-800">
                      <th class="border border-slate-200 dark:border-slate-700 p-1">当前服务\来袭</th>
                      <th v-for="s in sources" :key="s" class="border border-slate-200 dark:border-slate-700 p-1">{{ s }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="rowSrc in sources" :key="rowSrc">
                      <th class="border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-900">{{ rowSrc }}</th>
                      <td v-for="colSrc in sources" :key="colSrc" class="border border-slate-200 dark:border-slate-700 p-1">
                        <el-switch v-model="maskMatrix[rowSrc][colSrc]" size="small" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div>
                <div class="text-xs font-semibold mb-1.5">各中断源到达时刻与持续时长（硬件排队 A &gt; B &gt; C &gt; D）</div>
                <el-table :data="requests" size="small" border>
                  <el-table-column prop="id" label="中断源" width="65" />
                  <el-table-column label="到达时刻 t">
                    <template #default="{ row }">
                      <el-input-number v-model="row.arrive" :min="0" :max="12" size="small" style="width: 95px" />
                    </template>
                  </el-table-column>
                  <el-table-column label="服务拍数">
                    <template #default="{ row }">
                      <el-input-number v-model="row.duration" :min="1" :max="6" size="small" style="width: 95px" />
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="程序查询 / 中断 / DMA CPU开销对比" name="dma">
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <div>
                <div class="text-[11px] text-slate-500 mb-1">CPU 主频 (MHz)</div>
                <el-input-number v-model="cpuFreqMhz" :min="10" :max="2000" size="small" style="width: 100%" />
              </div>
              <div>
                <div class="text-[11px] text-slate-500 mb-1">外设传输率 (MB/s)</div>
                <el-input-number v-model="ioRateMBps" :min="1" :max="100" size="small" style="width: 100%" />
              </div>
              <div>
                <div class="text-[11px] text-slate-500 mb-1">单次中断传字节</div>
                <el-input-number v-model="bytePerTransfer" :min="1" :max="64" size="small" style="width: 100%" />
              </div>
              <div>
                <div class="text-[11px] text-slate-500 mb-1">中断开销 (周期)</div>
                <el-input-number v-model="intCycles" :min="50" :max="2000" size="small" style="width: 100%" />
              </div>
              <div>
                <div class="text-[11px] text-slate-500 mb-1">DMA 块大小 (B)</div>
                <el-input-number v-model="dmaBlockBytes" :min="512" :max="65536" :step="512" size="small" style="width: 100%" />
              </div>
              <div>
                <div class="text-[11px] text-slate-500 mb-1">DMA预处理+后处理</div>
                <el-input-number v-model="dmaSetupCycles" :min="100" :max="5000" size="small" style="width: 100%" />
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <template #stage>
      <!-- Stage 1: Interrupt Timeline -->
      <div v-if="activeTab === 'interrupt' && intPlayer.currentStep.value" class="space-y-4">
        <div class="flex flex-wrap items-center gap-3">
          <el-tag type="primary" effect="dark">
            中断响应次序: {{ intPlayer.currentStep.value.state.respOrder.join(' → ') || '尚无' }}
          </el-tag>
          <el-tag type="success" effect="dark">
            处理完成次序: {{ intPlayer.currentStep.value.state.finishOrder.join(' → ') || '尚无' }}
          </el-tag>
          <el-tag type="warning">
            硬件嵌套栈: [{{ intPlayer.currentStep.value.state.stack.join(' | ') || '主程序' }}]
          </el-tag>
        </div>

        <!-- Execution Timeline Strip -->
        <div class="overflow-x-auto p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div class="text-xs font-semibold text-slate-500 mb-2">CPU 中断嵌套执行时间轴</div>
          <div class="flex gap-1 font-mono text-xs">
            <div
              v-for="slot in intPlayer.currentStep.value.state.timeline"
              :key="slot.t"
              class="flex flex-col items-center shrink-0"
            >
              <div
                :class="[
                  'w-10 h-10 rounded-lg flex items-center justify-center font-bold border',
                  slot.running === 'A'
                    ? 'bg-rose-500 text-white border-rose-600'
                    : slot.running === 'B'
                      ? 'bg-amber-500 text-white border-amber-600'
                      : slot.running === 'C'
                        ? 'bg-indigo-600 text-white border-indigo-700'
                        : slot.running === 'D'
                          ? 'bg-emerald-600 text-white border-emerald-700'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300',
                ]"
              >
                {{ slot.running }}
              </div>
              <span class="text-[10px] text-slate-400 mt-1">t={{ slot.t }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Stage 2: DMA ECharts -->
      <div v-else-if="activeTab === 'dma'" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
          <el-card shadow="never" class="!bg-rose-50/40 dark:!bg-rose-950/20">
            <div class="text-slate-500">程序查询 CPU 占比</div>
            <div class="text-xl font-bold text-rose-600">{{ ioComparison.pollPct }}%</div>
          </el-card>
          <el-card shadow="never" class="!bg-amber-50/40 dark:!bg-amber-950/20">
            <div class="text-slate-500">中断方式 ({{ ioComparison.intCountPerSec.toLocaleString() }} 次/s)</div>
            <div class="text-xl font-bold text-amber-600">{{ ioComparison.intPct }}%</div>
          </el-card>
          <el-card shadow="never" class="!bg-emerald-50/40 dark:!bg-emerald-950/20">
            <div class="text-slate-500">DMA 方式 ({{ ioComparison.dmaIntsPerSec.toLocaleString() }} 次/s)</div>
            <div class="text-xl font-bold text-emerald-600">{{ ioComparison.dmaPct }}%</div>
          </el-card>
        </div>

        <EChartBox :option="dmaChartOption" height="300px" />
      </div>
    </template>
  </LabShell>
</template>
