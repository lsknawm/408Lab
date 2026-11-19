<script setup lang="ts">
import { computed, ref } from 'vue';
import { VueFlow, MarkerType, type Node, type Edge } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import { bindLabPlayer, useStepPlayer } from '../../composables/useStepPlayer';
import { buildPipelineSchedule, simulateDatapath } from './engines/pipelineEngine';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const activeTab = ref<'pipeline' | 'datapath'>('pipeline');

// Tab 1: Pipeline
const asmInput = ref(`LW R1, 0(R2)
ADD R3, R1, R4
SUB R5, R3, R6
SW R5, 4(R2)`);
const forwarding = ref(true);
const currentCycleLimit = ref(99);

const schedule = computed(() => buildPipelineSchedule(asmInput.value, forwarding.value));
const displayCycle = computed({
  get: () => Math.min(currentCycleLimit.value, schedule.value.totalCycles),
  set: (v: number) => {
    currentCycleLimit.value = v;
  },
});

function stageBadgeClass(tag: string) {
  if (tag === 'IF') return 'bg-sky-500 text-white';
  if (tag === 'ID') return 'bg-indigo-500 text-white';
  if (tag === 'EX') return 'bg-amber-500 text-white';
  if (tag === 'MEM') return 'bg-emerald-500 text-white';
  if (tag === 'WB') return 'bg-violet-500 text-white';
  if (tag === 'STALL') return 'bg-rose-500 text-white animate-pulse';
  return 'bg-slate-100 dark:bg-slate-800/50 text-transparent';
}

// Tab 2: Datapath
const instrKind = ref<'LW' | 'ADD' | 'BEQ'>('LW');
const dpSteps = computed(() => simulateDatapath(instrKind.value));
const dpPlayer = useStepPlayer(dpSteps, 1000);

const activePlayerBind = computed(() =>
  activeTab.value === 'datapath' ? bindLabPlayer(dpPlayer).value : undefined
);

const dpNodes = computed<Node[]>(() => {
  const active = new Set(dpPlayer.currentStep.value?.state.activeNodes || []);
  const defs = [
    { id: 'PC', label: 'PC 程序计数器', x: 30, y: 30 },
    { id: 'MAR', label: 'MAR 地址寄存器', x: 185, y: 30 },
    { id: 'MEM', label: '主存 Memory', x: 345, y: 30 },
    { id: 'MDR', label: 'MDR 数据寄存器', x: 345, y: 130 },
    { id: 'IR', label: 'IR 指令寄存器', x: 185, y: 130 },
    { id: 'CU', label: 'CU 控制单元', x: 30, y: 130 },
    { id: 'GPR', label: 'GPR 通用寄存器组', x: 185, y: 230 },
    { id: 'ALU', label: 'ALU 算术逻辑单元', x: 345, y: 230 },
    { id: 'Z', label: 'Z 暂存器', x: 495, y: 230 },
  ];
  return defs.map((d) => ({
    id: d.id,
    label: d.label,
    position: { x: d.x, y: d.y },
    style: {
      width: '126px',
      padding: '8px',
      borderRadius: '10px',
      textAlign: 'center',
      fontSize: '12px',
      fontWeight: 'bold',
      background: active.has(d.id) ? '#4f46e5' : '#ffffff',
      color: active.has(d.id) ? '#ffffff' : '#0f172a',
      border: active.has(d.id) ? '2px solid #f59e0b' : '1.5px solid #94a3b8',
    },
  }));
});

const dpEdges = computed<Edge[]>(() => {
  const active = new Set(dpPlayer.currentStep.value?.state.activeEdges || []);
  const defs = [
    { id: 'e_pc_mar', source: 'PC', target: 'MAR' },
    { id: 'e_mar_mem', source: 'MAR', target: 'MEM' },
    { id: 'e_mem_mdr', source: 'MEM', target: 'MDR' },
    { id: 'e_mdr_ir', source: 'MDR', target: 'IR' },
    { id: 'e_ir_cu', source: 'IR', target: 'CU' },
    { id: 'e_ir_gpr', source: 'IR', target: 'GPR' },
    { id: 'e_gpr_alu', source: 'GPR', target: 'ALU' },
    { id: 'e_alu_z', source: 'ALU', target: 'Z' },
    { id: 'e_z_mar', source: 'Z', target: 'MAR' },
    { id: 'e_mdr_gpr', source: 'MDR', target: 'GPR' },
    { id: 'e_z_gpr', source: 'Z', target: 'GPR' },
    { id: 'e_alu_pc', source: 'ALU', target: 'PC' },
  ];
  return defs.map((e) => {
    const on = active.has(e.id);
    return {
      ...e,
      animated: on,
      markerEnd: { type: MarkerType.ArrowClosed, color: on ? '#f59e0b' : '#cbd5e1' },
      style: { stroke: on ? '#f59e0b' : '#cbd5e1', strokeWidth: on ? 3 : 1.3 },
    };
  });
});

const dpPseudo = [
  '// T1: IF 取指令阶段',
  'MAR <- (PC); MemRead; IR <- M[MAR]; PC <- (PC)+4;',
  '// T2: ID 译码并读取源寄存器',
  'CU <- decode(IR); A,B <- GPR[rs1, rs2];',
  '// T3: EX 执行 / 算址 / 分支判定',
  'Z <- ALU(A, B or Imm); if (Branch && Zero) PC <- Target;',
  '// T4: MEM 主存读写 (仅 Load/Store 激活)',
  'if (LW/SW) MAR <- Z; MDR <- M[MAR];',
  '// T5: WB 写回目的寄存器',
  'if (RegWrite) GPR[rd] <- (MemtoReg ? MDR : Z);',
];
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :player="activePlayerBind"
    :pseudocode="activeTab === 'datapath' ? dpPseudo : []"
    :has-inspector="true"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <el-tabs v-model="activeTab" class="!mb-0">
          <el-tab-pane label="5 级指令流水线时空图 & 冒险检测" name="pipeline">
            <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
              <div class="md:col-span-6">
                <div class="text-xs text-slate-500 mb-1">自定义指令序列 (每行一条：ADD/SUB/LW/SW)</div>
                <el-input v-model="asmInput" type="textarea" :rows="4" class="font-mono text-xs" />
              </div>
              <div class="md:col-span-6 space-y-2.5">
                <div class="flex flex-wrap items-center gap-3">
                  <el-switch
                    v-model="forwarding"
                    active-text="开启数据转发 (Forwarding)"
                    inactive-text="关闭转发 (纯阻塞)"
                  />
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <el-button
                    size="small"
                    @click="asmInput = 'LW R1, 0(R2)\nADD R3, R1, R4\nSUB R5, R3, R6\nSW R5, 4(R2)'"
                  >
                    Load-Use + ALU转发例
                  </el-button>
                  <el-button
                    size="small"
                    @click="asmInput = 'ADD R1, R2, R3\nSUB R4, R1, R5\nAND R6, R1, R7\nOR R8, R4, R6'"
                  >
                    纯 ALU RAW 冒险例
                  </el-button>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-slate-500 shrink-0">推进时钟周期:</span>
                  <el-slider v-model="displayCycle" :min="1" :max="Math.max(1, schedule.totalCycles)" class="flex-1" />
                  <el-button size="small" @click="currentCycleLimit = 99">显示全周期</el-button>
                </div>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="CPU 数据通路与控制信号流" name="datapath">
            <div class="flex flex-wrap items-center gap-3">
              <span class="text-xs text-slate-500">选择观察指令:</span>
              <el-radio-group v-model="instrKind" size="small">
                <el-radio-button value="LW">LW R1, 4(R2) (5拍全周期)</el-radio-button>
                <el-radio-button value="ADD">ADD R1, R2, R3 (跳过MEM)</el-radio-button>
                <el-radio-button value="BEQ">BEQ R1, R2, +8 (分支跳)</el-radio-button>
              </el-radio-group>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <template #stage>
      <!-- Stage 1: Pipeline Space-Time Diagram -->
      <div v-if="activeTab === 'pipeline'" class="space-y-4">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
          <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div class="text-[11px] text-slate-400">总时钟周期</div>
            <div class="text-lg font-bold text-indigo-600">{{ schedule.totalCycles }}</div>
          </div>
          <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div class="text-[11px] text-slate-400">阻塞气泡 (Stall)</div>
            <div class="text-lg font-bold text-rose-600">{{ schedule.stallCount }}</div>
          </div>
          <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div class="text-[11px] text-slate-400">实际 CPI</div>
            <div class="text-lg font-bold text-amber-600">{{ schedule.cpi }}</div>
          </div>
          <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div class="text-[11px] text-slate-400">流水线加速比 Sp</div>
            <div class="text-lg font-bold text-emerald-600">{{ schedule.speedup }}x</div>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-center font-mono text-xs border-collapse tabular-nums">
            <thead>
              <tr class="bg-slate-100 dark:bg-slate-800">
                <th class="border border-slate-200 dark:border-slate-700 px-3 py-2 text-left min-w-[140px]">指令</th>
                <th
                  v-for="c in schedule.totalCycles"
                  :key="c"
                  class="border border-slate-200 dark:border-slate-700 px-2 py-2 min-w-[44px]"
                >
                  T{{ c }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(ins, rIdx) in schedule.instrs" :key="rIdx">
                <td class="border border-slate-200 dark:border-slate-700 px-3 py-2 text-left font-bold bg-slate-50 dark:bg-slate-900 whitespace-nowrap">
                  {{ ins.raw }}
                </td>
                <td
                  v-for="cIdx in schedule.totalCycles"
                  :key="cIdx"
                  class="border border-slate-200 dark:border-slate-700 p-1"
                >
                  <div
                    v-if="cIdx <= displayCycle && schedule.grid[rIdx]?.[cIdx - 1]"
                    :class="[
                      'py-1.5 rounded font-bold text-[11px]',
                      stageBadgeClass(schedule.grid[rIdx][cIdx - 1]),
                    ]"
                  >
                    {{ schedule.grid[rIdx][cIdx - 1] === 'STALL' ? '气泡' : schedule.grid[rIdx][cIdx - 1] }}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Stage 2: Datapath -->
      <div v-else class="space-y-3">
        <div class="h-[330px] w-full rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950">
          <VueFlow :nodes="dpNodes" :edges="dpEdges" fit-view-on-init>
            <Background pattern-color="#cbd5e1" :gap="20" />
          </VueFlow>
        </div>

        <div v-if="dpPlayer.currentStep.value" class="flex flex-wrap gap-1.5 items-center">
          <span class="text-xs font-semibold text-slate-500">当前激活控制信号:</span>
          <el-tag
            v-for="sig in dpPlayer.currentStep.value.state.signals"
            :key="sig"
            type="warning"
            effect="dark"
            size="small"
            class="font-mono"
          >
            {{ sig }}
          </el-tag>
        </div>
      </div>
    </template>

    <template #inspector>
      <el-card v-if="activeTab === 'pipeline'" shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <template #header>
          <span class="text-xs font-semibold">冒险冲突与旁路转发分析</span>
        </template>
        <div v-if="schedule.hazardNotes.length === 0" class="text-xs text-emerald-600">
          当前指令序列无数据冒险冲突！
        </div>
        <div v-else class="space-y-2">
          <el-alert
            v-for="(h, idx) in schedule.hazardNotes"
            :key="idx"
            :type="h.kind === 'stall' ? 'error' : 'success'"
            :closable="false"
            :title="`T${h.cycle} 周期`"
            :description="h.msg"
          />
        </div>
      </el-card>

      <el-card v-else shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <template #header>
          <span class="text-xs font-semibold">CPU 内部关键寄存器实时值</span>
        </template>
        <el-descriptions v-if="dpPlayer.currentStep.value" :column="1" size="small" border class="font-mono">
          <el-descriptions-item label="当前阶段">{{ dpPlayer.currentStep.value.state.phase }}</el-descriptions-item>
          <el-descriptions-item label="PC">{{ dpPlayer.currentStep.value.state.regValues.PC }}</el-descriptions-item>
          <el-descriptions-item label="IR">{{ dpPlayer.currentStep.value.state.regValues.IR }}</el-descriptions-item>
          <el-descriptions-item label="MAR">{{ dpPlayer.currentStep.value.state.regValues.MAR }}</el-descriptions-item>
          <el-descriptions-item label="MDR">{{ dpPlayer.currentStep.value.state.regValues.MDR }}</el-descriptions-item>
          <el-descriptions-item label="ALU/Z">{{ dpPlayer.currentStep.value.state.regValues.ALU_Z }}</el-descriptions-item>
        </el-descriptions>
      </el-card>
    </template>
  </LabShell>
</template>
