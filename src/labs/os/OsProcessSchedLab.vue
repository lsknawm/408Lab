<script setup lang="ts">
import { computed, ref } from 'vue';
import { VueFlow, MarkerType, type Node, type Edge } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import { bindLabPlayer, useStepPlayer } from '../../composables/useStepPlayer';
import {
  simulateScheduling,
  type ProcessDef,
  type SchedAlgo,
} from './engines/osSchedEngine';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const activeTab = ref<'sched' | 'states'>('sched');

// Tab 1: CPU Scheduling
const algo = ref<SchedAlgo>('RR');
const quantum = ref(2);
const procs = ref<ProcessDef[]>([
  { pid: 'P1', arrival: 0, burst: 5, priority: 2 },
  { pid: 'P2', arrival: 1, burst: 3, priority: 1 },
  { pid: 'P3', arrival: 2, burst: 4, priority: 3 },
  { pid: 'P4', arrival: 4, burst: 2, priority: 2 },
]);

function addProc() {
  const idx = procs.value.length + 1;
  procs.value.push({ pid: `P${idx}`, arrival: idx, burst: 3, priority: 2 });
}
function removeProc(idx: number) {
  if (procs.value.length > 1) procs.value.splice(idx, 1);
}

const steps = computed(() => simulateScheduling(procs.value, algo.value, quantum.value));
const player = useStepPlayer(steps, 650);

const activePlayerBind = computed(() =>
  activeTab.value === 'sched' ? bindLabPlayer(player).value : undefined
);

const pidColors: Record<string, string> = {
  P1: '#4f46e5',
  P2: '#10b981',
  P3: '#f59e0b',
  P4: '#ec4899',
  P5: '#06b6d4',
  P6: '#8b5cf6',
  IDLE: '#cbd5e1',
};

// Tab 2: 7-State Model
type ProcStateId = 'NEW' | 'READY' | 'RUNNING' | 'BLOCKED' | 'READY_SUSP' | 'BLOCKED_SUSP' | 'EXIT';
const curState = ref<ProcStateId>('READY');
const lastEvent = ref('进程已创建并加载入内存，正在就绪队列等待调度');

const stateTransitions: Array<{ from: ProcStateId; to: ProcStateId; label: string; edgeId: string }> = [
  { from: 'NEW', to: 'READY', label: '提交允许进入内存', edgeId: 'e_new_rdy' },
  { from: 'READY', to: 'RUNNING', label: '调度程序选中 (Dispatch)', edgeId: 'e_rdy_run' },
  { from: 'RUNNING', to: 'READY', label: '时间片用完 / 被高优先级抢占', edgeId: 'e_run_rdy' },
  { from: 'RUNNING', to: 'BLOCKED', label: '请求 I/O 或 wait(S) 阻塞', edgeId: 'e_run_blk' },
  { from: 'BLOCKED', to: 'READY', label: 'I/O 完成 / signal(S) 唤醒', edgeId: 'e_blk_rdy' },
  { from: 'RUNNING', to: 'EXIT', label: '运行结束 / exit()', edgeId: 'e_run_ext' },
  { from: 'READY', to: 'READY_SUSP', label: '挂起 (Swap Out 到外存)', edgeId: 'e_rdy_rs' },
  { from: 'READY_SUSP', to: 'READY', label: '激活 (Swap In 回内存)', edgeId: 'e_rs_rdy' },
  { from: 'BLOCKED', to: 'BLOCKED_SUSP', label: '内存紧张，阻塞进程被挂起至外存', edgeId: 'e_blk_bs' },
  { from: 'BLOCKED_SUSP', to: 'BLOCKED', label: '激活调回内存 (仍在等事件)', edgeId: 'e_bs_blk' },
  { from: 'BLOCKED_SUSP', to: 'READY_SUSP', label: '外存中等待的事件已发生！', edgeId: 'e_bs_rs' },
];

const availableActions = computed(() =>
  stateTransitions.filter((t) => t.from === curState.value)
);

function triggerStateTransition(tr: (typeof stateTransitions)[number]) {
  curState.value = tr.to;
  lastEvent.value = `触发 [${tr.label}]：状态由 ${tr.from} 迁移至 ${tr.to}`;
}

const stateNodes = computed<Node[]>(() => {
  const defs: Array<{ id: ProcStateId; label: string; x: number; y: number }> = [
    { id: 'NEW', label: '创建态 NEW', x: 20, y: 120 },
    { id: 'READY', label: '就绪态 READY', x: 170, y: 120 },
    { id: 'RUNNING', label: '运行态 RUNNING', x: 350, y: 40 },
    { id: 'BLOCKED', label: '阻塞态 BLOCKED', x: 350, y: 200 },
    { id: 'EXIT', label: '终止态 EXIT', x: 520, y: 40 },
    { id: 'READY_SUSP', label: '就绪挂起 (外存)', x: 170, y: 290 },
    { id: 'BLOCKED_SUSP', label: '阻塞挂起 (外存)', x: 350, y: 290 },
  ];
  return defs.map((d) => ({
    id: d.id,
    label: d.label,
    position: { x: d.x, y: d.y },
    style: {
      width: '132px',
      padding: '8px',
      borderRadius: '10px',
      textAlign: 'center',
      fontSize: '12px',
      fontWeight: 'bold',
      background: curState.value === d.id ? '#10b981' : '#ffffff',
      color: curState.value === d.id ? '#ffffff' : '#0f172a',
      border: curState.value === d.id ? '3px solid #047857' : '1.5px solid #94a3b8',
    },
  }));
});

const stateEdges = computed<Edge[]>(() =>
  stateTransitions.map((t) => {
    const canFire = t.from === curState.value;
    return {
      id: t.edgeId,
      source: t.from,
      target: t.to,
      label: canFire ? t.label.split(' ')[0] : undefined,
      animated: canFire,
      markerEnd: { type: MarkerType.ArrowClosed, color: canFire ? '#10b981' : '#cbd5e1' },
      style: { stroke: canFire ? '#10b981' : '#cbd5e1', strokeWidth: canFire ? 2.6 : 1.4 },
    };
  })
);
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :player="activePlayerBind"
    :has-inspector="activeTab === 'sched'"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <el-tabs v-model="activeTab" class="!mb-0">
          <el-tab-pane label="CPU 调度甘特图实验室" name="sched">
            <div class="space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <el-radio-group v-model="algo" size="small">
                  <el-radio-button value="FCFS">FCFS</el-radio-button>
                  <el-radio-button value="SJF">SJF (非抢占)</el-radio-button>
                  <el-radio-button value="SRTF">SRTF (抢占)</el-radio-button>
                  <el-radio-button value="RR">RR 时间片轮转</el-radio-button>
                  <el-radio-button value="PRIO">优先级(非抢占)</el-radio-button>
                  <el-radio-button value="PRIO_PREEMPT">优先级(抢占)</el-radio-button>
                  <el-radio-button value="MLFQ">多级反馈队列 MLFQ</el-radio-button>
                </el-radio-group>

                <div v-if="algo === 'RR'" class="flex items-center gap-1.5">
                  <span class="text-xs text-slate-500">时间片 q:</span>
                  <el-input-number v-model="quantum" :min="1" :max="8" size="small" style="width: 85px" />
                </div>
              </div>

              <!-- Editable process list -->
              <el-table :data="procs" size="small" border>
                <el-table-column label="进程" width="85">
                  <template #default="{ row }">
                    <el-input v-model="row.pid" size="small" />
                  </template>
                </el-table-column>
                <el-table-column label="到达时间 AT">
                  <template #default="{ row }">
                    <el-input-number v-model="row.arrival" :min="0" :max="50" size="small" style="width: 105px" />
                  </template>
                </el-table-column>
                <el-table-column label="服务时间 BT">
                  <template #default="{ row }">
                    <el-input-number v-model="row.burst" :min="1" :max="20" size="small" style="width: 105px" />
                  </template>
                </el-table-column>
                <el-table-column label="优先级 (越小越高)">
                  <template #default="{ row }">
                    <el-input-number v-model="row.priority" :min="1" :max="10" size="small" style="width: 105px" />
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="80" align="center">
                  <template #default="{ $index }">
                    <el-button type="danger" link size="small" @click="removeProc($index)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>
              <el-button size="small" type="primary" plain @click="addProc">+ 添加进程</el-button>
            </div>
          </el-tab-pane>

          <el-tab-pane label="进程七状态模型状态机" name="states">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">触发系统事件:</span>
              <el-button
                v-for="act in availableActions"
                :key="act.edgeId"
                type="success"
                size="small"
                @click="triggerStateTransition(act)"
              >
                {{ act.label }}
              </el-button>
              <el-button size="small" @click="curState = 'NEW'; lastEvent = '新进程刚创建'">重置到 NEW</el-button>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <template #stage>
      <!-- Stage 1: Gantt Chart -->
      <div v-if="activeTab === 'sched' && player.currentStep.value" class="space-y-4">
        <div class="flex flex-wrap items-center gap-3 text-xs">
          <el-tag type="primary" effect="dark">当前时刻: t = {{ player.currentStep.value.state.time }}</el-tag>
          <el-tag type="success">正在运行: {{ player.currentStep.value.state.running }}</el-tag>
          <span class="font-mono text-slate-500">
            就绪队列: [{{ player.currentStep.value.state.readyQueue.join(', ') || '空' }}]
          </span>
        </div>

        <!-- Visual Gantt Strip -->
        <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 overflow-x-auto">
          <div class="text-xs font-semibold text-slate-500 mb-2">动态 CPU 调度甘特图</div>
          <div class="flex items-stretch min-w-max">
            <div
              v-for="(blk, idx) in player.currentStep.value.state.gantt"
              :key="idx"
              class="flex flex-col"
              :style="{ width: `${(blk.end - blk.start) * 34}px` }"
            >
              <div
                class="h-11 flex items-center justify-center text-white font-mono font-bold text-xs border-r border-white/40 first:rounded-l-lg last:rounded-r-lg"
                :style="{ backgroundColor: pidColors[blk.pid] || '#64748b' }"
              >
                {{ blk.pid }}
              </div>
              <div class="flex justify-between text-[10px] font-mono text-slate-500 mt-1 px-0.5 tabular-nums">
                <span>{{ idx === 0 ? blk.start : '' }}</span>
                <span>{{ blk.end }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Per-process metrics -->
        <el-table :data="player.currentStep.value.state.metrics" size="small" border class="font-mono tabular-nums">
          <el-table-column prop="pid" label="进程" width="70" />
          <el-table-column prop="arrival" label="到达" width="65" />
          <el-table-column prop="burst" label="服务" width="65" />
          <el-table-column prop="finish" label="完成时刻" width="85" />
          <el-table-column prop="turnaround" label="周转时间 T" width="95" />
          <el-table-column prop="weightedTurnaround" label="带权周转 W" width="105" />
          <el-table-column prop="wait" label="等待时间" />
        </el-table>
      </div>

      <!-- Stage 2: 7-State VueFlow -->
      <div v-else-if="activeTab === 'states'" class="space-y-3">
        <el-alert type="success" :closable="false" :title="lastEvent" />
        <div class="h-[370px] w-full rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950">
          <VueFlow :nodes="stateNodes" :edges="stateEdges" fit-view-on-init>
            <Background pattern-color="#cbd5e1" :gap="20" />
          </VueFlow>
        </div>
      </div>
    </template>

    <template #inspector>
      <el-card v-if="player.currentStep.value" shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <template #header>
          <span class="text-xs font-semibold">调度性能汇总与剩余时间</span>
        </template>
        <el-descriptions :column="1" size="small" border class="tabular-nums mb-3">
          <el-descriptions-item label="平均周转时间">{{ player.currentStep.value.state.avgTurnaround }}</el-descriptions-item>
          <el-descriptions-item label="平均带权周转时间">{{ player.currentStep.value.state.avgWeighted }}</el-descriptions-item>
          <el-descriptions-item label="平均等待时间">{{ player.currentStep.value.state.avgWait }}</el-descriptions-item>
        </el-descriptions>

        <div class="space-y-1.5 text-xs">
          <div class="font-semibold text-slate-500">各进程剩余执行时间</div>
          <div v-for="p in procs" :key="p.pid" class="flex items-center gap-2 font-mono">
            <span class="w-8 font-bold">{{ p.pid }}</span>
            <el-progress
              class="flex-1"
              :percentage="Math.round(((p.burst - (player.currentStep.value.state.remaining[p.pid] ?? p.burst)) / p.burst) * 100)"
              :stroke-width="10"
            />
            <span class="w-12 text-right">剩 {{ player.currentStep.value.state.remaining[p.pid] ?? 0 }}</span>
          </div>
        </div>
      </el-card>
    </template>
  </LabShell>
</template>
