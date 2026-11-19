<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import { bindLabPlayer, useStepPlayer } from '../../composables/useStepPlayer';
import {
  simulateInfixToPostfix,
  simulateKmp,
  simulateStackSequence,
} from './engines/linearEngine';
import { ElMessage } from 'element-plus';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const activeTab = ref<'stack' | 'infix' | 'queue' | 'kmp'>('kmp');

// Tab 1: Stack Sequence
const pushSeqInput = ref('A, B, C, D, E');
const targetSeqInput = ref('C, B, D, E, A');
const stackSteps = computed(() => simulateStackSequence(pushSeqInput.value, targetSeqInput.value));
const stackPlayer = useStepPlayer(stackSteps, 850);

// Tab 2: Infix to Postfix
const infixInput = ref('(3 + 4) * 5 - 6 / 2');
const infixSteps = computed(() => simulateInfixToPostfix(infixInput.value));
const infixPlayer = useStepPlayer(infixSteps, 850);

// Tab 3: Circular Queue
const queueCap = ref(6);
const queueArr = ref<(string | null)[]>(['A', 'B', 'C', null, null, null]);
const qFront = ref(0);
const qRear = ref(3);
const qNextVal = ref('D');
const qLog = ref('初始队列含 A, B, C；牺牲一个单元判满，最多存 MaxSize - 1 = 5 个元素。');

const qLen = computed(() => (qRear.value - qFront.value + queueCap.value) % queueCap.value);
const qIsEmpty = computed(() => qFront.value === qRear.value);
const qIsFull = computed(() => (qRear.value + 1) % queueCap.value === qFront.value);

function resetQueue(cap: number) {
  queueCap.value = cap;
  queueArr.value = new Array(cap).fill(null);
  qFront.value = 0;
  qRear.value = 0;
  qLog.value = `已重置循环队列，容量 MaxSize = ${cap}（可用空间 ${cap - 1}）。`;
}

function enqueue() {
  if (qIsFull.value) {
    ElMessage.warning('队列已满：(rear + 1) % MaxSize == front！');
    qLog.value = '入队失败：满足判满条件 (rear + 1) % MaxSize == front！';
    return;
  }
  const val = qNextVal.value.trim() || String(Math.floor(Math.random() * 90 + 10));
  queueArr.value[qRear.value] = val;
  const oldRear = qRear.value;
  qRear.value = (qRear.value + 1) % queueCap.value;
  qLog.value = `EnQueue(${val})：存入下标 ${oldRear}，rear 由 ${oldRear} 移动至 ${qRear.value}。`;
  // Auto increment letter if single alpha
  if (/^[A-Z]$/.test(val)) {
    qNextVal.value = val === 'Z' ? 'A' : String.fromCharCode(val.charCodeAt(0) + 1);
  }
}

function dequeue() {
  if (qIsEmpty.value) {
    ElMessage.warning('队列已空：front == rear！');
    qLog.value = '出队失败：满足判空条件 front == rear！';
    return;
  }
  const val = queueArr.value[qFront.value];
  const oldFront = qFront.value;
  queueArr.value[oldFront] = null;
  qFront.value = (qFront.value + 1) % queueCap.value;
  qLog.value = `DeQueue() -> ${val}：清空下标 ${oldFront}，front 由 ${oldFront} 移动至 ${qFront.value}。`;
}

// Tab 4: KMP
const kmpText = ref('ababcabcacbab');
const kmpPattern = ref('abcac');
const kmpOneBased = ref(true);
const kmpUseNextVal = ref(true);
const kmpSteps = computed(() =>
  simulateKmp(kmpText.value.trim(), kmpPattern.value.trim(), kmpOneBased.value, kmpUseNextVal.value)
);
const kmpPlayer = useStepPlayer(kmpSteps, 750);

const activePlayerBind = computed(() => {
  if (activeTab.value === 'stack') return bindLabPlayer(stackPlayer).value;
  if (activeTab.value === 'infix') return bindLabPlayer(infixPlayer).value;
  if (activeTab.value === 'kmp') return bindLabPlayer(kmpPlayer).value;
  return undefined;
});

const pseudocodeLines = computed(() => {
  if (activeTab.value === 'stack') {
    return [
      'Stack S; i = 0; j = 0;',
      'while (j < target.length) {',
      '  if (!S.empty() && S.top() == target[j]) {',
      '    S.pop(); output.push(target[j++]);',
      '  } else if (i < pushSeq.length) {',
      '    S.push(pushSeq[i++]);',
      '  } else {',
      '    return false; // 死路，非法出栈序列',
      '  }',
      '} return true;',
    ];
  }
  if (activeTab.value === 'infix') {
    return [
      'for (token in infixTokens) {',
      '  if (isOperand(token))',
      '    postfix.push(token);',
      '  else if (token == "(") opStack.push(token);',
      '  else if (token == ")") popUntilLeftParen();',
      '  else {',
      '    while (prec(opStack.top()) >= prec(token)) pop();',
      '    opStack.push(token);',
      '  }',
      '} popAllRemainingOps();',
      '// 后缀求值阶段:',
      'for (tk in postfix) if (num) evalStack.push(tk);',
      'else { r = pop(); l = pop(); evalStack.push(l op r); }',
      'return evalStack.top();',
    ];
  }
  if (activeTab.value === 'kmp') {
    return [
      'buildNextAndNextval(P);',
      'i = 1; j = 1; // 若0-based则 i=0, j=0',
      'while (i <= S.len && j <= P.len) {',
      '  if (j == 0 || S[i] == P[j]) {',
      '    ++i; ++j; // 主串指针绝不回溯',
      '  } else {',
      '    j = useNextVal ? nextval[j] : next[j];',
      '  }',
      '}',
      'if (j > P.len) return i - P.len; else return 0;',
    ];
  }
  return [];
});

const queueNodes = computed(() => {
  const n = queueCap.value;
  const cx = 180;
  const cy = 160;
  const r = 108;
  return Array.from({ length: n }, (_, idx) => {
    const angle = (idx / n) * Math.PI * 2 - Math.PI / 2;
    return {
      idx,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      val: queueArr.value[idx],
      isFront: qFront.value === idx,
      isRear: qRear.value === idx,
    };
  });
});
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :player="activePlayerBind"
    :pseudocode="pseudocodeLines"
    :code-title="activeTab === 'kmp' ? 'KMP 模式匹配伪代码' : activeTab === 'stack' ? '出栈合法性判定' : '表达式转换与求值'"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <el-tabs v-model="activeTab" class="!mb-0">
          <el-tab-pane label="KMP 匹配与 next/nextval" name="kmp">
            <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div class="md:col-span-4">
                <div class="text-xs text-slate-500 mb-1">自定义主串 S</div>
                <el-input v-model="kmpText" placeholder="例如 ababcabcacbab" class="font-mono" />
              </div>
              <div class="md:col-span-3">
                <div class="text-xs text-slate-500 mb-1">自定义模式串 P</div>
                <el-input v-model="kmpPattern" placeholder="例如 abcac" class="font-mono" />
              </div>
              <div class="md:col-span-5 flex flex-wrap items-center gap-3">
                <el-switch
                  v-model="kmpOneBased"
                  active-text="1-based (408教材)"
                  inactive-text="0-based"
                />
                <el-switch
                  v-model="kmpUseNextVal"
                  active-text="使用 nextval"
                  inactive-text="使用 next"
                />
                <el-button
                  size="small"
                  plain
                  @click="kmpText = 'aaabaaaab'; kmpPattern = 'aaaab';"
                >
                  最坏回溯用例
                </el-button>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="出栈序列合法性验证" name="stack">
            <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div class="md:col-span-4">
                <div class="text-xs text-slate-500 mb-1">入栈序列（逗号或空格分隔）</div>
                <el-input v-model="pushSeqInput" class="font-mono" />
              </div>
              <div class="md:col-span-4">
                <div class="text-xs text-slate-500 mb-1">目标出栈序列</div>
                <el-input v-model="targetSeqInput" class="font-mono" />
              </div>
              <div class="md:col-span-4 flex flex-wrap gap-2">
                <el-button size="small" @click="pushSeqInput = 'A,B,C,D,E'; targetSeqInput = 'C,B,D,E,A'">合法例</el-button>
                <el-button size="small" type="danger" plain @click="pushSeqInput = 'A,B,C,D,E'; targetSeqInput = 'D,C,E,A,B'">非法例 (真题)</el-button>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="中缀转后缀 & 求值" name="infix">
            <div class="flex flex-wrap items-end gap-3">
              <div class="flex-1 min-w-[220px]">
                <div class="text-xs text-slate-500 mb-1">自定义中缀表达式（支持数字或单字母变量、+ - * / 及括号）</div>
                <el-input v-model="infixInput" class="font-mono" />
              </div>
              <el-button size="small" @click="infixInput = '(3 + 4) * 5 - 6 / 2'">数值示例</el-button>
              <el-button size="small" @click="infixInput = 'a + b * (c - d) - e / f'">符号示例</el-button>
            </div>
          </el-tab-pane>

          <el-tab-pane label="循环队列盘交互" name="queue">
            <div class="flex flex-wrap items-center gap-3">
              <div class="flex items-center gap-2">
                <span class="text-xs text-slate-500">队列容量 MaxSize:</span>
                <el-input-number
                  :model-value="queueCap"
                  :min="4"
                  :max="10"
                  size="small"
                  @change="(v: number | undefined) => v && resetQueue(v)"
                />
              </div>
              <el-input v-model="qNextVal" size="small" style="width: 90px" placeholder="入队值" />
              <el-button type="primary" size="small" @click="enqueue">入队 EnQueue</el-button>
              <el-button type="warning" size="small" @click="dequeue">出队 DeQueue</el-button>
              <el-button size="small" @click="resetQueue(queueCap)">清空</el-button>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <template #stage>
      <!-- Stage 1: Stack Sequence -->
      <div v-if="activeTab === 'stack'" class="space-y-4">
        <template v-if="stackPlayer.currentStep.value">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <div class="text-xs font-semibold text-slate-500 mb-2">输入序列 (待压入指针 ↑)</div>
              <div class="flex flex-wrap gap-1.5">
                <div
                  v-for="(item, idx) in stackPlayer.currentStep.value.state.pushSeq"
                  :key="idx"
                  :class="[
                    'w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold border text-sm transition-all',
                    idx < stackPlayer.currentStep.value.state.pushIdx
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 border-slate-300 dark:border-slate-700'
                      : idx === stackPlayer.currentStep.value.state.pushIdx
                        ? 'bg-indigo-600 text-white border-indigo-700 scale-105 shadow'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700',
                  ]"
                >
                  {{ item }}
                </div>
              </div>
            </div>

            <div class="p-3 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/30">
              <div class="text-xs font-semibold text-indigo-600 dark:text-indigo-300 mb-2">辅助栈 (栈顶在上方)</div>
              <div class="flex flex-col-reverse items-center gap-1.5 min-h-[160px] justify-start p-2 border-x-2 border-b-2 border-indigo-400/70 rounded-b-xl bg-white/60 dark:bg-slate-900/60">
                <div
                  v-for="(el, sIdx) in stackPlayer.currentStep.value.state.stack"
                  :key="sIdx"
                  :class="[
                    'w-28 h-8 rounded-md flex items-center justify-center font-mono font-bold text-sm border',
                    sIdx === stackPlayer.currentStep.value.state.stack.length - 1
                      ? 'bg-amber-500 text-white border-amber-600 shadow'
                      : 'bg-indigo-100 dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 border-indigo-300 dark:border-indigo-700',
                  ]"
                >
                  {{ el }}
                  <span v-if="sIdx === stackPlayer.currentStep.value.state.stack.length - 1" class="ml-2 text-[10px]">(Top)</span>
                </div>
                <span v-if="stackPlayer.currentStep.value.state.stack.length === 0" class="text-xs text-slate-400 my-auto">空栈</span>
              </div>
            </div>

            <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <div class="text-xs font-semibold text-slate-500 mb-2">目标输出对比</div>
              <div class="flex flex-wrap gap-1.5 mb-3">
                <div
                  v-for="(item, idx) in stackPlayer.currentStep.value.state.targetSeq"
                  :key="idx"
                  :class="[
                    'w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold border text-sm',
                    idx < stackPlayer.currentStep.value.state.output.length
                      ? 'bg-emerald-500 text-white border-emerald-600'
                      : idx === stackPlayer.currentStep.value.state.targetIdx
                        ? 'bg-amber-100 dark:bg-amber-900/50 border-amber-500 text-amber-700 dark:text-amber-300 ring-2 ring-amber-400'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700',
                  ]"
                >
                  {{ item }}
                </div>
              </div>
              <el-tag
                v-if="stackPlayer.currentStep.value.state.status === 'valid'"
                type="success"
                effect="dark"
              >
                合法出栈序列
              </el-tag>
              <el-tag
                v-else-if="stackPlayer.currentStep.value.state.status === 'invalid'"
                type="danger"
                effect="dark"
              >
                非法出栈序列！
              </el-tag>
            </div>
          </div>
        </template>
      </div>

      <!-- Stage 2: Infix to Postfix -->
      <div v-else-if="activeTab === 'infix'" class="space-y-4">
        <template v-if="infixPlayer.currentStep.value">
          <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
            <div class="text-xs text-slate-500 mb-2">中缀表达式 Token 扫描</div>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="(tk, idx) in infixPlayer.currentStep.value.state.tokens"
                :key="idx"
                :class="[
                  'px-2.5 py-1 rounded-md font-mono font-semibold text-sm border',
                  infixPlayer.currentStep.value.state.phase === 'convert' && infixPlayer.currentStep.value.state.cursor === idx
                    ? 'bg-indigo-600 text-white border-indigo-700 scale-105'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700',
                ]"
              >
                {{ tk }}
              </span>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="p-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20">
              <div class="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">运算符栈 (OP Stack)</div>
              <div class="flex flex-col-reverse gap-1 min-h-[120px] items-center justify-start">
                <div
                  v-for="(op, idx) in infixPlayer.currentStep.value.state.opStack"
                  :key="idx"
                  class="w-24 py-1 text-center font-mono font-bold rounded bg-amber-500 text-white"
                >
                  {{ op }}
                </div>
                <span v-if="infixPlayer.currentStep.value.state.opStack.length === 0" class="text-xs text-slate-400 my-auto">空</span>
              </div>
            </div>

            <div class="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20">
              <div class="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-2">后缀表达式输出队列</div>
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="(tk, idx) in infixPlayer.currentStep.value.state.postfix"
                  :key="idx"
                  :class="[
                    'px-2.5 py-1 rounded font-mono font-bold text-sm border',
                    infixPlayer.currentStep.value.state.phase !== 'convert' && infixPlayer.currentStep.value.state.cursor === idx
                      ? 'bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-300'
                      : 'bg-white dark:bg-slate-800 border-emerald-300 dark:border-emerald-800',
                  ]"
                >
                  {{ tk }}
                </span>
              </div>
            </div>

            <div class="p-3 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20">
              <div class="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-2">操作数求值栈</div>
              <div class="flex flex-col-reverse gap-1 min-h-[120px] items-center justify-start">
                <div
                  v-for="(v, idx) in infixPlayer.currentStep.value.state.evalStack"
                  :key="idx"
                  class="w-24 py-1 text-center font-mono font-bold rounded bg-indigo-600 text-white tabular-nums"
                >
                  {{ v }}
                </div>
                <span v-if="infixPlayer.currentStep.value.state.evalStack.length === 0" class="text-xs text-slate-400 my-auto">
                  待求值 / 符号表达式
                </span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Stage 3: Circular Queue -->
      <div v-else-if="activeTab === 'queue'" class="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        <div class="flex justify-center">
          <svg width="360" height="320" class="select-none">
            <circle cx="180" cy="160" r="108" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="6 4" />
            <g v-for="node in queueNodes" :key="node.idx" :transform="`translate(${node.x}, ${node.y})`">
              <circle
                r="26"
                :fill="node.val ? '#4f46e5' : '#f8fafc'"
                :stroke="node.isFront || node.isRear ? '#f59e0b' : '#94a3b8'"
                :stroke-width="node.isFront || node.isRear ? 3 : 1.5"
              />
              <text
                dy="0.3em"
                text-anchor="middle"
                :fill="node.val ? '#ffffff' : '#94a3b8'"
                class="font-mono font-bold text-sm"
              >
                {{ node.val || '-' }}
              </text>
              <text y="-32" text-anchor="middle" class="font-mono text-[11px] fill-slate-500">
                [{{ node.idx }}]
              </text>
              <text
                v-if="node.isFront"
                y="40"
                text-anchor="middle"
                fill="#10b981"
                class="font-mono text-[11px] font-bold"
              >
                front
              </text>
              <text
                v-if="node.isRear"
                :y="node.isFront ? 54 : 40"
                text-anchor="middle"
                fill="#f59e0b"
                class="font-mono text-[11px] font-bold"
              >
                rear
              </text>
            </g>
            <text x="180" y="156" text-anchor="middle" class="text-xs fill-slate-500 font-semibold">
              长度: {{ qLen }} / {{ queueCap - 1 }}
            </text>
            <text x="180" y="176" text-anchor="middle" class="text-[11px] fill-slate-400 font-mono">
              front={{ qFront }}, rear={{ qRear }}
            </text>
          </svg>
        </div>

        <div class="space-y-3">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="当前队头指针 front">{{ qFront }}</el-descriptions-item>
            <el-descriptions-item label="当前队尾指针 rear">{{ qRear }}</el-descriptions-item>
            <el-descriptions-item label="队列长度 (rear - front + N) % N">{{ qLen }}</el-descriptions-item>
            <el-descriptions-item label="判空条件 (front == rear)">
              <el-tag :type="qIsEmpty ? 'warning' : 'info'" size="small">{{ qIsEmpty ? '空 (Empty)' : '非空' }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="判满条件 ((rear+1)%N == front)">
              <el-tag :type="qIsFull ? 'danger' : 'success'" size="small">{{ qIsFull ? '已满 (Full)' : '可入队' }}</el-tag>
            </el-descriptions-item>
          </el-descriptions>
          <el-alert type="info" :closable="false" :description="qLog" />
        </div>
      </div>

      <!-- Stage 4: KMP -->
      <div v-else-if="activeTab === 'kmp'" class="space-y-4">
        <template v-if="kmpPlayer.currentStep.value">
          <!-- Next & Nextval Table -->
          <div class="overflow-x-auto">
            <div class="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              模式串 P 及其 {{ kmpOneBased ? '1-based (408教材版)' : '0-based' }} 跳转数组：
            </div>
            <table class="w-full text-center font-mono text-xs border-collapse tabular-nums">
              <tbody>
                <tr class="bg-slate-100 dark:bg-slate-800/80">
                  <th class="border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-left">下标 j</th>
                  <td
                    v-for="(_, idx) in kmpPlayer.currentStep.value.state.pattern.length"
                    :key="idx"
                    class="border border-slate-200 dark:border-slate-700 px-2 py-1.5 font-semibold"
                  >
                    {{ idx + (kmpOneBased ? 1 : 0) }}
                  </td>
                </tr>
                <tr>
                  <th class="border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-left bg-slate-50 dark:bg-slate-900">P[j]</th>
                  <td
                    v-for="(ch, idx) in kmpPlayer.currentStep.value.state.pattern"
                    :key="idx"
                    class="border border-slate-200 dark:border-slate-700 px-2 py-1.5 font-bold text-indigo-600 dark:text-indigo-400"
                  >
                    {{ ch }}
                  </td>
                </tr>
                <tr>
                  <th class="border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-left bg-slate-50 dark:bg-slate-900">next[j]</th>
                  <td
                    v-for="(nv, idx) in kmpPlayer.currentStep.value.state.next"
                    :key="idx"
                    class="border border-slate-200 dark:border-slate-700 px-2 py-1.5"
                  >
                    {{ nv }}
                  </td>
                </tr>
                <tr class="bg-amber-50/60 dark:bg-amber-950/20">
                  <th class="border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-left">nextval[j]</th>
                  <td
                    v-for="(nvv, idx) in kmpPlayer.currentStep.value.state.nextval"
                    :key="idx"
                    class="border border-slate-200 dark:border-slate-700 px-2 py-1.5 font-bold text-amber-600 dark:text-amber-400"
                  >
                    {{ nvv }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Alignment Visualization -->
          <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 overflow-x-auto">
            <div class="text-xs text-slate-500 mb-3">
              主串 S 与模式串 P 实时对齐（i 不回溯，失配时 P 整体右滑）：
            </div>
            <div class="inline-block space-y-2 font-mono">
              <!-- Text Row -->
              <div class="flex items-center gap-1">
                <span class="w-12 text-xs text-slate-400">主串 S:</span>
                <div
                  v-for="(ch, idx) in kmpPlayer.currentStep.value.state.text"
                  :key="idx"
                  class="flex flex-col items-center"
                >
                  <span class="text-[10px] text-slate-400 mb-0.5">{{ idx + (kmpOneBased ? 1 : 0) }}</span>
                  <div
                    :class="[
                      'w-9 h-9 rounded-lg flex items-center justify-center font-bold border text-sm transition-all',
                      idx === kmpPlayer.currentStep.value.state.i
                        ? kmpPlayer.currentStep.value.state.mismatch
                          ? 'bg-rose-500 text-white border-rose-600 scale-105'
                          : 'bg-indigo-600 text-white border-indigo-700 scale-105'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700',
                    ]"
                  >
                    {{ ch }}
                  </div>
                </div>
              </div>

              <!-- Pattern Row Shifted -->
              <div class="flex items-center gap-1">
                <span class="w-12 text-xs text-slate-400">模式 P:</span>
                <div
                  v-for="blank in Math.max(0, kmpPlayer.currentStep.value.state.i - Math.max(0, kmpPlayer.currentStep.value.state.j))"
                  :key="'b-' + blank"
                  class="w-9 h-9 shrink-0"
                />
                <div
                  v-for="(ch, pIdx) in kmpPlayer.currentStep.value.state.pattern"
                  :key="'p-' + pIdx"
                  class="flex flex-col items-center"
                >
                  <div
                    :class="[
                      'w-9 h-9 rounded-lg flex items-center justify-center font-bold border text-sm transition-all',
                      pIdx < kmpPlayer.currentStep.value.state.j
                        ? 'bg-emerald-500 text-white border-emerald-600'
                        : pIdx === kmpPlayer.currentStep.value.state.j
                          ? kmpPlayer.currentStep.value.state.mismatch
                            ? 'bg-rose-500 text-white border-rose-600'
                            : 'bg-indigo-600 text-white border-indigo-700'
                          : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700',
                    ]"
                  >
                    {{ ch }}
                  </div>
                  <span class="text-[10px] text-slate-400 mt-0.5">{{ pIdx + (kmpOneBased ? 1 : 0) }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </LabShell>
</template>
