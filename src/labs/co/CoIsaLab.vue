<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const activeTab = ref<'opcode' | 'addressing'>('opcode');

// Tab 1: Expanding Opcode
const instrLen = ref(16);
const addrBits = ref(4);
const count3 = ref(15);
const count2 = ref(15);
const count1 = ref(15);
const count0 = ref(16);

const opcodeReport = computed(() => {
  const L = instrLen.value;
  const a = addrBits.value;
  const op3Bits = L - 3 * a;
  if (op3Bits <= 0) {
    return { valid: false, error: '指令字长不足以容纳 3 个地址码！', rows: [], usedRatio: 100 };
  }
  const totalSpace = Math.pow(2, L);
  const slot3 = Math.pow(2, 3 * a);
  const slot2 = Math.pow(2, 2 * a);
  const slot1 = Math.pow(2, a);

  const used3 = count3.value * slot3;
  const used2 = count2.value * slot2;
  const used1 = count1.value * slot1;
  const used0 = count0.value;
  const usedSum = used3 + used2 + used1 + used0;
  const valid = usedSum <= totalSpace;

  const max3 = Math.pow(2, op3Bits);
  const remAfter3 = max3 - count3.value;
  const max2 = remAfter3 >= 0 ? remAfter3 * Math.pow(2, a) : 0;
  const remAfter2 = max2 - count2.value;
  const max1 = remAfter2 >= 0 ? remAfter2 * Math.pow(2, a) : 0;
  const remAfter1 = max1 - count1.value;
  const max0 = remAfter1 >= 0 ? remAfter1 * Math.pow(2, a) : 0;

  const prefixFmt = (n: number, bits: number) => n.toString(2).padStart(bits, '0');

  const rows = [
    {
      type: '三地址指令',
      opBits: `${op3Bits} 位`,
      need: count3.value,
      maxAllowed: max3,
      range:
        count3.value > 0 && count3.value <= max3
          ? `${prefixFmt(0, op3Bits)} ~ ${prefixFmt(count3.value - 1, op3Bits)}`
          : count3.value === 0
            ? '未分配'
            : '超限!',
      leftoverPrefixes: Math.max(0, remAfter3),
    },
    {
      type: '二地址指令',
      opBits: `${op3Bits + a} 位`,
      need: count2.value,
      maxAllowed: Math.max(0, max2),
      range:
        remAfter3 > 0 && count2.value > 0 && count2.value <= max2
          ? `前缀(${prefixFmt(count3.value, op3Bits)}) + ${prefixFmt(0, a)} ~ ...`
          : count2.value === 0
            ? '未分配'
            : '空间不足',
      leftoverPrefixes: Math.max(0, remAfter2),
    },
    {
      type: '一地址指令',
      opBits: `${op3Bits + 2 * a} 位`,
      need: count1.value,
      maxAllowed: Math.max(0, max1),
      range:
        remAfter2 > 0 && count1.value > 0 && count1.value <= max1
          ? `保留前缀后 + ${prefixFmt(0, a)} ~ ...`
          : count1.value === 0
            ? '未分配'
            : '空间不足',
      leftoverPrefixes: Math.max(0, remAfter1),
    },
    {
      type: '零地址指令',
      opBits: `${L} 位`,
      need: count0.value,
      maxAllowed: Math.max(0, max0),
      range:
        remAfter1 > 0 && count0.value > 0 && count0.value <= max0
          ? `剩余全编码 (${count0.value}/${max0})`
          : count0.value === 0
            ? '未分配'
            : '空间不足',
      leftoverPrefixes: Math.max(0, max0 - count0.value),
    },
  ];

  return {
    valid: valid && remAfter3 >= 0 && remAfter2 >= 0 && remAfter1 >= 0 && count0.value <= max0,
    error: valid ? '' : '编码总空间溢出：超出 2^L 编码容量！',
    rows,
    max0: Math.max(0, max0),
    usedRatio: Math.min(100, Number(((usedSum / totalSpace) * 100).toFixed(2))),
  };
});

// Tab 2: 9 Addressing Modes
type AddrMode =
  | 'immediate'
  | 'direct'
  | 'indirect'
  | 'register'
  | 'regIndirect'
  | 'base'
  | 'index'
  | 'relative'
  | 'stack';

const addrMode = ref<AddrMode>('relative');
const regs = reactive({
  PC: 100,
  instrBytes: 4,
  A: 12,
  R1: 200,
  BR: 300,
  IX: 4,
  SP: 500,
});

const memCells = reactive<Record<number, number>>({
  12: 200,
  100: 999,
  116: 777,
  200: 456,
  312: 888,
  500: 321,
  456: 666,
});

function readMem(addr: number): number {
  return memCells[addr] ?? (addr * 3 + 7) % 1000;
}

const addressingDetail = computed(() => {
  const A = regs.A;
  switch (addrMode.value) {
    case 'immediate':
      return {
        name: '立即寻址 (Immediate)',
        eaFormula: '无 EA（操作数就在指令地址码 A 中）',
        eaValue: '-',
        operand: A,
        memReadsExclFetch: 0,
        memReadsTotal: 1,
        path: ['指令地址码 A', `直接取出操作数 = ${A}`],
        examNote: '最快，仅取指访存 1 次（不含取指 0 次），常用于赋初值、常数加减；缺点是受限于地址码位数，操作数范围有限。',
      };
    case 'direct':
      return {
        name: '直接寻址 (Direct)',
        eaFormula: 'EA = A',
        eaValue: A,
        operand: readMem(A),
        memReadsExclFetch: 1,
        memReadsTotal: 2,
        path: [`指令地址码 A=${A}`, `访存 M[${A}]`, `操作数 = ${readMem(A)}`],
        examNote: '取指 1 次 + 访存取数 1 次 = 共 2 次访存。',
      };
    case 'indirect': {
      const ptr = readMem(A);
      return {
        name: '一次间接寻址 (Indirect)',
        eaFormula: 'EA = (A)',
        eaValue: ptr,
        operand: readMem(ptr),
        memReadsExclFetch: 2,
        memReadsTotal: 3,
        path: [`指令 A=${A}`, `第1次访存 M[${A}] = ${ptr} (得EA)`, `第2次访存 M[${ptr}] = ${readMem(ptr)}`],
        examNote: '扩大了寻址范围（可达全主存空间），但取数需 2 次访存（含取指共 3 次），便于实现指针与子程序返回。',
      };
    }
    case 'register':
      return {
        name: '寄存器寻址 (Register)',
        eaFormula: 'EA = R_i (操作数在寄存器中)',
        eaValue: 'R1',
        operand: regs.R1,
        memReadsExclFetch: 0,
        memReadsTotal: 1,
        path: ['指令指明寄存器 R1', `直接读出 (R1) = ${regs.R1}`],
        examNote: '取指后不访存（0 次访存取数），指令字长短、执行速度极快！',
      };
    case 'regIndirect':
      return {
        name: '寄存器间接寻址 (Register Indirect)',
        eaFormula: 'EA = (R_i)',
        eaValue: regs.R1,
        operand: readMem(regs.R1),
        memReadsExclFetch: 1,
        memReadsTotal: 2,
        path: [`读寄存器 (R1) = ${regs.R1} 作为 EA`, `访存 M[${regs.R1}] = ${readMem(regs.R1)}`],
        examNote: '比一次间接寻址少 1 次访存！仅需 1 次访存即可取到操作数。',
      };
    case 'base': {
      const ea = regs.BR + A;
      return {
        name: '基址寻址 (Base Addressing)',
        eaFormula: 'EA = (BR) + A',
        eaValue: ea,
        operand: readMem(ea),
        memReadsExclFetch: 1,
        memReadsTotal: 2,
        path: [`(BR)=${regs.BR} + 偏移 A=${A}`, `EA = ${ea}`, `访存 M[${ea}] = ${readMem(ea)}`],
        examNote: 'BR 内容由操作系统设置，对用户程序不可见，主要用于多道程序重定位与扩充寻址空间！',
      };
    }
    case 'index': {
      const ea = regs.IX + A;
      return {
        name: '变址寻址 (Indexed Addressing)',
        eaFormula: 'EA = (IX) + A',
        eaValue: ea,
        operand: readMem(ea),
        memReadsExclFetch: 1,
        memReadsTotal: 2,
        path: [`基首址 A=${A} + 变址 (IX)=${regs.IX}`, `EA = ${ea}`, `访存 M[${ea}] = ${readMem(ea)}`],
        examNote: '面向用户数组遍历！A 为数组起始地址（不变），IX 存放下标（由程序员指令递增修改）。',
      };
    }
    case 'relative': {
      const pcAfterFetch = regs.PC + regs.instrBytes;
      const ea = pcAfterFetch + A;
      return {
        name: '相对寻址 (PC-Relative)',
        eaFormula: 'EA = (PC) + 本指令长度 + A',
        eaValue: ea,
        operand: readMem(ea),
        memReadsExclFetch: 1,
        memReadsTotal: 2,
        path: [
          `取指后 PC 自动变为 ${regs.PC} + ${regs.instrBytes} = ${pcAfterFetch}`,
          `+ 位移量 A=${A} → EA = ${ea}`,
          `跳转目标 / 操作数 M[${ea}] = ${readMem(ea)}`,
        ],
        examNote: '408 必考细节：计算 EA 时必须先将 PC 加上本条指令的字节长度，再加补码偏移量 A！支持程序代码浮动。',
      };
    }
    case 'stack':
      return {
        name: '堆栈寻址 (Stack)',
        eaFormula: 'EA = (SP)',
        eaValue: regs.SP,
        operand: readMem(regs.SP),
        memReadsExclFetch: 1,
        memReadsTotal: 2,
        path: [`栈顶指针 (SP) = ${regs.SP}`, `访存栈顶 M[${regs.SP}] = ${readMem(regs.SP)} (软堆栈)`],
        examNote: '零地址指令典型寻址方式：硬堆栈在 CPU 寄存器内不访存，软堆栈在主存中需访存。',
      };
  }
});
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <el-tabs v-model="activeTab" class="!mb-0">
          <el-tab-pane label="扩展操作码空间校验器" name="opcode">
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <div>
                <div class="text-[11px] text-slate-500 mb-1">指令字长 L (bit)</div>
                <el-input-number v-model="instrLen" :min="8" :max="32" size="small" style="width: 100%" />
              </div>
              <div>
                <div class="text-[11px] text-slate-500 mb-1">单个地址码位数 a</div>
                <el-input-number v-model="addrBits" :min="2" :max="8" size="small" style="width: 100%" />
              </div>
              <div>
                <div class="text-[11px] text-slate-500 mb-1">三地址指令数</div>
                <el-input-number v-model="count3" :min="0" size="small" style="width: 100%" />
              </div>
              <div>
                <div class="text-[11px] text-slate-500 mb-1">二地址指令数</div>
                <el-input-number v-model="count2" :min="0" size="small" style="width: 100%" />
              </div>
              <div>
                <div class="text-[11px] text-slate-500 mb-1">一地址指令数</div>
                <el-input-number v-model="count1" :min="0" size="small" style="width: 100%" />
              </div>
              <div>
                <div class="text-[11px] text-slate-500 mb-1">零地址指令数</div>
                <el-input-number v-model="count0" :min="0" size="small" style="width: 100%" />
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="九大寻址方式与 EA 计算" name="addressing">
            <div class="space-y-2.5">
              <el-radio-group v-model="addrMode" size="small">
                <el-radio-button value="immediate">立即</el-radio-button>
                <el-radio-button value="direct">直接</el-radio-button>
                <el-radio-button value="indirect">间接</el-radio-button>
                <el-radio-button value="register">寄存器</el-radio-button>
                <el-radio-button value="regIndirect">寄存器间接</el-radio-button>
                <el-radio-button value="base">基址(BR)</el-radio-button>
                <el-radio-button value="index">变址(IX)</el-radio-button>
                <el-radio-button value="relative">相对(PC)</el-radio-button>
                <el-radio-button value="stack">堆栈(SP)</el-radio-button>
              </el-radio-group>

              <div class="flex flex-wrap gap-2 items-center text-xs">
                <span>A:<el-input-number v-model="regs.A" size="small" style="width: 82px" /></span>
                <span>PC:<el-input-number v-model="regs.PC" size="small" style="width: 88px" /></span>
                <span>指令长:<el-input-number v-model="regs.instrBytes" :min="1" :max="8" size="small" style="width: 75px" /></span>
                <span>R1:<el-input-number v-model="regs.R1" size="small" style="width: 88px" /></span>
                <span>BR:<el-input-number v-model="regs.BR" size="small" style="width: 88px" /></span>
                <span>IX:<el-input-number v-model="regs.IX" size="small" style="width: 82px" /></span>
                <span>SP:<el-input-number v-model="regs.SP" size="small" style="width: 88px" /></span>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <template #stage>
      <!-- Stage 1: Expanding Opcode -->
      <div v-if="activeTab === 'opcode'" class="space-y-4">
        <div class="flex flex-wrap items-center gap-3">
          <el-tag :type="opcodeReport.valid ? 'success' : 'danger'" effect="dark" size="large">
            {{ opcodeReport.valid ? '✓ 扩展操作码方案合法' : '✗ 编码空间不足或前缀冲突' }}
          </el-tag>
          <span class="text-xs font-mono text-slate-500">
            总编码空间占用率: {{ opcodeReport.usedRatio }}% · 若上述三/二/一地址固定，最多还能设计 {{ opcodeReport.max0 }} 条零地址指令
          </span>
        </div>

        <el-progress
          :percentage="opcodeReport.usedRatio"
          :status="opcodeReport.valid ? 'success' : 'exception'"
          :stroke-width="14"
        />

        <el-table :data="opcodeReport.rows" size="small" border class="font-mono">
          <el-table-column prop="type" label="指令类型" width="110" />
          <el-table-column prop="opBits" label="操作码位宽" width="100" />
          <el-table-column prop="need" label="需求条数" width="90" />
          <el-table-column prop="maxAllowed" label="本级最大容量" width="115" />
          <el-table-column prop="leftoverPrefixes" label="留给下级前缀数" width="130" />
          <el-table-column prop="range" label="编码分配示例" />
        </el-table>
      </div>

      <!-- Stage 2: 9 Addressing Modes -->
      <div v-else class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="text-base font-bold text-indigo-600 dark:text-indigo-400">
            {{ addressingDetail.name }}
          </div>
          <div class="flex gap-2">
            <el-tag type="warning">有效地址 EA = {{ addressingDetail.eaValue }}</el-tag>
            <el-tag type="success" effect="dark">取数访存: {{ addressingDetail.memReadsExclFetch }} 次 (含取指共 {{ addressingDetail.memReadsTotal }} 次)</el-tag>
          </div>
        </div>

        <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-3">
          <div class="font-mono text-sm font-semibold text-slate-700 dark:text-slate-200">
            核心公式：{{ addressingDetail.eaFormula }}
          </div>
          <el-steps :active="addressingDetail.path.length" finish-status="success" align-center>
            <el-step v-for="(stepTxt, i) in addressingDetail.path" :key="i" :title="`Step ${i + 1}`" :description="stepTxt" />
          </el-steps>
          <div class="text-center font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400 pt-2">
            最终获得操作数 = {{ addressingDetail.operand }}
          </div>
        </div>

        <el-alert type="info" :closable="false" title="408 考点对比提示" :description="addressingDetail.examNote" />
      </div>
    </template>
  </LabShell>
</template>
