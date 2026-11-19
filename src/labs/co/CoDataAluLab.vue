<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import { bindLabPlayer, useStepPlayer } from '../../composables/useStepPlayer';
import {
  computeDoubleSignAdd,
  decodeIeee754FromFloat,
  decodeIeee754FromHex,
  simulateBoothMultiply,
  toFixedPointCodes,
} from './engines/dataAluEngine';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const activeTab = ref<'ieee' | 'fixed' | 'booth'>('ieee');

// Tab 1: IEEE 754
const ieeeMode = ref<'dec' | 'hex'>('dec');
const floatInput = ref(-20.5);
const hexInput = ref('C1A40000');

const ieeeInfo = computed(() => {
  if (ieeeMode.value === 'dec') {
    return decodeIeee754FromFloat(Number(floatInput.value));
  }
  return decodeIeee754FromHex(hexInput.value) || decodeIeee754FromFloat(0);
});

// Tab 2: Fixed point + Double-sign overflow
const bitWidth = ref(8);
const fxX = ref(85);
const fxY = ref(64);
const fxOp = ref<'+' | '-'>('+');

const xCodes = computed(() => toFixedPointCodes(fxX.value, bitWidth.value));
const yCodes = computed(() => toFixedPointCodes(fxY.value, bitWidth.value));
const aluAddRes = computed(() => computeDoubleSignAdd(fxX.value, fxY.value, fxOp.value, bitWidth.value));

// Tab 3: Booth
const boothBits = ref(5);
const boothX = ref(-5);
const boothY = ref(-6);
const boothSteps = computed(() => simulateBoothMultiply(boothX.value, boothY.value, boothBits.value));
const boothPlayer = useStepPlayer(boothSteps, 900);

const activePlayerBind = computed(() =>
  activeTab.value === 'booth' ? bindLabPlayer(boothPlayer).value : undefined
);

const boothPseudo = [
  'ACC = 0; MQ = [Y]补; y_{n+1} = 0;',
  'for (i = 1; i <= n; i++) {',
  '  switch (y_{n+1} - y_n) {',
  '    case +1: ACC = ACC + [X]补; break;',
  '    case -1: ACC = ACC + [-X]补; break;',
  '  }',
  '  if (i < n) arithmeticRightShift(ACC, MQ, y_{n+1});',
  '} // 第 n 拍符号位只加不移！',
];
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :player="activePlayerBind"
    :pseudocode="activeTab === 'booth' ? boothPseudo : []"
    code-title="Booth 补码一位乘控制流程"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <el-tabs v-model="activeTab" class="!mb-0">
          <el-tab-pane label="IEEE 754 单精度浮点数拆解" name="ieee">
            <div class="flex flex-wrap items-center gap-3">
              <el-radio-group v-model="ieeeMode" size="small">
                <el-radio-button value="dec">十进制 → IEEE 754</el-radio-button>
                <el-radio-button value="hex">十六进制 → 十进制真值</el-radio-button>
              </el-radio-group>

              <el-input-number
                v-if="ieeeMode === 'dec'"
                v-model="floatInput"
                :step="0.25"
                size="small"
                style="width: 170px"
              />
              <el-input
                v-else
                v-model="hexInput"
                size="small"
                style="width: 160px"
                class="font-mono"
                placeholder="例如 C1A40000"
              />

              <el-button size="small" @click="ieeeMode = 'hex'; hexInput = 'C1A40000'">真题 C1A40000H</el-button>
              <el-button size="small" @click="ieeeMode = 'dec'; floatInput = 0.1">0.1 精度误差</el-button>
              <el-button size="small" @click="ieeeMode = 'hex'; hexInput = '00400000'">非规格化数</el-button>
            </div>
          </el-tab-pane>

          <el-tab-pane label="定点数四码与双符号位溢出检测" name="fixed">
            <div class="flex flex-wrap items-center gap-3">
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-slate-500">字长:</span>
                <el-select v-model="bitWidth" size="small" style="width: 82px">
                  <el-option :value="6" label="6 位" />
                  <el-option :value="8" label="8 位" />
                  <el-option :value="10" label="10 位" />
                </el-select>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-slate-500">X:</span>
                <el-input-number v-model="fxX" size="small" style="width: 110px" />
              </div>
              <el-select v-model="fxOp" size="small" style="width: 68px">
                <el-option label="+" value="+" />
                <el-option label="-" value="-" />
              </el-select>
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-slate-500">Y:</span>
                <el-input-number v-model="fxY" size="small" style="width: 110px" />
              </div>
              <el-button size="small" @click="bitWidth = 8; fxX = 85; fxOp = '+'; fxY = 64">触发正溢出(01)</el-button>
              <el-button size="small" @click="bitWidth = 8; fxX = -85; fxOp = '+'; fxY = -64">触发负溢出(10)</el-button>
            </div>
          </el-tab-pane>

          <el-tab-pane label="Booth 补码一位乘动态演示" name="booth">
            <div class="flex flex-wrap items-center gap-3">
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-slate-500">机器字长:</span>
                <el-select v-model="boothBits" size="small" style="width: 85px">
                  <el-option :value="5" label="5 位" />
                  <el-option :value="6" label="6 位" />
                </el-select>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-slate-500">被乘数 X:</span>
                <el-input-number v-model="boothX" :min="-16" :max="15" size="small" style="width: 105px" />
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-slate-500">乘数 Y:</span>
                <el-input-number v-model="boothY" :min="-16" :max="15" size="small" style="width: 105px" />
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <template #stage>
      <!-- Stage 1: IEEE 754 -->
      <div v-if="activeTab === 'ieee'" class="space-y-4">
        <div class="flex flex-wrap items-center gap-3">
          <el-tag type="primary" effect="dark" size="large" class="font-mono text-base">
            HEX: 0x{{ ieeeInfo.hex }}
          </el-tag>
          <el-tag type="success" size="large">{{ ieeeInfo.kind }}</el-tag>
          <span class="font-mono text-sm font-bold text-slate-700 dark:text-slate-200">
            实际存储十进制精确值 ≈ {{ ieeeInfo.exactValue }}
          </span>
        </div>

        <!-- 32-bit Visual Strip -->
        <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 overflow-x-auto">
          <div class="flex flex-wrap gap-1 font-mono text-xs items-center">
            <div class="flex flex-col items-center mr-2">
              <span class="text-[10px] text-rose-500 font-bold mb-1">S (1b)</span>
              <span class="w-7 h-8 rounded bg-rose-500 text-white font-bold flex items-center justify-center">
                {{ ieeeInfo.sign }}
              </span>
            </div>
            <div class="flex flex-col items-center mr-2">
              <span class="text-[10px] text-amber-600 font-bold mb-1">阶码 E (8b, 移码偏置127 = {{ ieeeInfo.expVal }})</span>
              <div class="flex gap-0.5">
                <span
                  v-for="(b, i) in ieeeInfo.expBits"
                  :key="i"
                  class="w-6 h-8 rounded bg-amber-500 text-white font-bold flex items-center justify-center"
                >
                  {{ b }}
                </span>
              </div>
            </div>
            <div class="flex flex-col items-start">
              <span class="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold mb-1">尾数 M (23b, 规格化隐含前导 1.)</span>
              <div class="flex flex-wrap gap-0.5">
                <span
                  v-for="(b, i) in ieeeInfo.fracBits"
                  :key="i"
                  class="w-5 h-8 rounded bg-indigo-600 text-white font-bold flex items-center justify-center"
                >
                  {{ b }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <el-alert type="info" :closable="false" title="真值展开公式" :description="ieeeInfo.formulaText" />
      </div>

      <!-- Stage 2: Fixed Point & Overflow -->
      <div v-else-if="activeTab === 'fixed'" class="space-y-4">
        <el-table
          :data="[
            { name: `X = ${xCodes.val}`, ...xCodes },
            { name: `Y = ${yCodes.val}`, ...yCodes },
          ]"
          size="small"
          border
          class="font-mono"
        >
          <el-table-column prop="name" label="真值" width="100" />
          <el-table-column prop="signMag" label="原码" />
          <el-table-column prop="ones" label="反码" />
          <el-table-column prop="twos" label="补码" />
          <el-table-column prop="biased" label="移码" />
          <el-table-column prop="doubleTwos" label="双符号位补码" />
        </el-table>

        <el-card shadow="never" class="!bg-slate-50 dark:!bg-slate-900/60">
          <div class="font-mono text-sm space-y-1.5 tabular-nums">
            <div>[X]双补 &nbsp;&nbsp;&nbsp;&nbsp;= {{ aluAddRes.xBin }}</div>
            <div>[{{ fxOp === '-' ? '-Y' : 'Y' }}]双补 &nbsp;&nbsp;= {{ aluAddRes.yBin }}</div>
            <div class="border-t border-slate-300 dark:border-slate-700 pt-1.5 font-bold">
              相加结果 &nbsp;=
              <span class="px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-900/70 text-amber-900 dark:text-amber-200">
                {{ aluAddRes.sf1 }}{{ aluAddRes.sf2 }}
              </span>
              {{ aluAddRes.sumBin.slice(2) }}
            </div>
          </div>
          <div class="mt-3 flex items-center gap-2">
            <el-tag
              :type="aluAddRes.overflowType === 'none' ? 'success' : 'danger'"
              effect="dark"
            >
              {{ aluAddRes.status }}
            </el-tag>
            <span class="text-xs text-slate-500">数学真值: {{ fxX }} {{ fxOp }} {{ fxY }} = {{ aluAddRes.mathResult }}</span>
          </div>
        </el-card>
      </div>

      <!-- Stage 3: Booth Multiply -->
      <div v-else class="space-y-4">
        <template v-if="boothPlayer.currentStep.value">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono tabular-nums">
            <div class="p-3 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/30">
              <div class="text-xs text-indigo-500 mb-1">部分积 ACC (双符号位)</div>
              <div class="text-xl font-bold tracking-widest">{{ boothPlayer.currentStep.value.state.acc }}</div>
            </div>
            <div class="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/30">
              <div class="text-xs text-emerald-600 mb-1">乘数寄存器 MQ</div>
              <div class="text-xl font-bold tracking-widest">{{ boothPlayer.currentStep.value.state.mq }}</div>
            </div>
            <div class="p-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/30">
              <div class="text-xs text-amber-600 mb-1">附加位 y_{n+1} | [X]补</div>
              <div class="text-xl font-bold">
                {{ boothPlayer.currentStep.value.state.yExtra }}
                <span class="text-xs font-normal text-slate-500 ml-2">([X]={{ boothPlayer.currentStep.value.state.xDoubleBin }})</span>
              </div>
            </div>
          </div>

          <el-table :data="boothPlayer.currentStep.value.state.history" size="small" border max-height="260" class="font-mono">
            <el-table-column prop="round" label="拍次" width="60" />
            <el-table-column prop="acc" label="ACC (双符号位)" width="130" />
            <el-table-column prop="mq" label="MQ" width="110" />
            <el-table-column prop="yExtra" label="y_{n+1}" width="75" />
            <el-table-column prop="action" label="操作说明" />
          </el-table>
        </template>
      </div>
    </template>
  </LabShell>
</template>
