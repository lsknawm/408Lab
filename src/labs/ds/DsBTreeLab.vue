<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import { bindLabPlayer, useStepPlayer } from '../../composables/useStepPlayer';
import { layoutBTree, parseBTreeOps, simulateBTree } from './engines/btreeEngine';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const order = ref(3);
const opsInput = ref('10, 20, 30, 40, 50, 60, 70, 25, del:40, del:50');
const quickKey = ref<number | undefined>(35);

const parsedOps = computed(() => parseBTreeOps(opsInput.value));
const steps = computed(() => simulateBTree(parsedOps.value, order.value));
const player = useStepPlayer(steps, 900);
const playerBind = bindLabPlayer(player);

const layout = computed(() => layoutBTree(player.currentStep.value?.state.root ?? null));

function appendOp(type: 'ins' | 'del') {
  if (quickKey.value === undefined) return;
  const tok = type === 'ins' ? `${quickKey.value}` : `del:${quickKey.value}`;
  opsInput.value = opsInput.value.trim() ? `${opsInput.value.trim()}, ${tok}` : tok;
  player.goToEnd();
}

function loadPreset(m: number, seq: string) {
  order.value = m;
  opsInput.value = seq;
  player.reset();
}

const pseudocodeLines = [
  'BTree_Insert_Or_Delete(T, m, op) {',
  '  // 非根节点关键字数: [ceil(m/2)-1, m-1]',
  '  findTargetLeafNode(key);',
  '  if (node.keys.length <= m - 1) return;',
  '  // 上溢分裂: 取第 ceil(m/2) 个关键码上移',
  '  while (node.keys.length == m) {',
  '    splitAndPromote(ceil(m/2));',
  '  }',
  '  // 删除非终端节点: 用直接前驱替换后下探叶层',
  '  replaceWithPredecessor();',
  '  // 下溢: 先左/右丰满兄弟借位，否则与兄弟+父分隔键合并',
  '  if (leftSib.keys > min) borrowFromLeft();',
  '  else mergeWithSiblingAndSeparator();',
  '  if (root.keys.empty()) root = root.child[0]; // 树高-1',
  '}',
];
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :player="playerBind"
    :pseudocode="pseudocodeLines"
    code-title="m 阶 B-树分裂与合并逻辑"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <div class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">B-树阶数 m:</span>
              <el-radio-group v-model="order" size="small">
                <el-radio-button :value="3">3 阶 (2-3树, 上限2)</el-radio-button>
                <el-radio-button :value="4">4 阶 (2-3-4树, 上限3)</el-radio-button>
                <el-radio-button :value="5">5 阶 (考研常考, 2~4键)</el-radio-button>
              </el-radio-group>
            </div>

            <div class="flex flex-wrap gap-1.5">
              <el-button size="small" @click="loadPreset(3, '10, 20, 30, 40, 50, 60, 70')">3阶连环分裂</el-button>
              <el-button size="small" @click="loadPreset(5, '1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, del:20, del:15')">5阶分裂+借位合并</el-button>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
            <div class="md:col-span-8">
              <el-input
                v-model="opsInput"
                size="small"
                class="font-mono"
                placeholder="输入数字插入，del:数字 表示删除，例如 10, 20, 30, del:20"
              >
                <template #prepend>操作序列</template>
              </el-input>
            </div>
            <div class="md:col-span-4 flex items-center gap-2">
              <el-input-number v-model="quickKey" size="small" style="width: 105px" />
              <el-button type="primary" size="small" @click="appendOp('ins')">+ 插入</el-button>
              <el-button type="danger" size="small" plain @click="appendOp('del')">- 删除</el-button>
            </div>
          </div>
        </div>
      </el-card>
    </template>

    <template #stage>
      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-3 text-xs">
          <el-tag size="small" type="info">
            阶数 m = {{ order }} · 关键字范围 [{{ Math.ceil(order / 2) - 1 }}, {{ order - 1 }}]
          </el-tag>
          <span class="inline-flex items-center gap-1.5">
            <span class="w-3 h-3 rounded bg-rose-500 inline-block"></span>上溢 / 下溢节点
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="w-3 h-3 rounded bg-amber-500 inline-block"></span>新分裂 / 借位节点
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="w-3 h-3 rounded bg-indigo-600 inline-block"></span>当前修改节点
          </span>
        </div>

        <div class="w-full overflow-auto rounded-xl border border-slate-200 dark:border-slate-800 lab-grid-bg min-h-[340px] flex items-center justify-center">
          <div v-if="layout.nodes.length === 0" class="text-sm text-slate-400">当前为空 B-树</div>
          <svg v-else :width="layout.width" :height="layout.height" class="select-none mx-auto">
            <line
              v-for="(e, idx) in layout.edges"
              :key="idx"
              :x1="e.x1"
              :y1="e.y1"
              :x2="e.x2"
              :y2="e.y2"
              stroke="#94a3b8"
              stroke-width="2"
            />
            <g v-for="n in layout.nodes" :key="n.id" :transform="`translate(${n.x}, ${n.y})`">
              <rect
                :x="-n.width / 2"
                y="-18"
                :width="n.width"
                height="36"
                rx="8"
                :fill="
                  n.highlight === 'overflow' || n.highlight === 'underflow'
                    ? '#ef4444'
                    : n.highlight === 'new'
                      ? '#f59e0b'
                      : n.highlight === 'active'
                        ? '#4f46e5'
                        : '#ffffff'
                "
                :stroke="
                  n.highlight ? '#1e293b' : '#475569'
                "
                stroke-width="2"
              />
              <text
                dy="0.35em"
                text-anchor="middle"
                :fill="n.highlight ? '#ffffff' : '#0f172a'"
                class="font-mono font-bold text-sm tabular-nums"
              >
                {{ n.keys.join(' | ') }}
              </text>
            </g>
          </svg>
        </div>

        <el-alert
          type="info"
          :closable="false"
          title="B-树 vs B+树 408 核心对照"
          description="B-树每个关键码只出现一次，非叶节点也存记录指针；B+树所有关键码均出现在叶节点（并用有序指针串联支持范围查找），非叶节点仅作为纯索引存在，因而单块索引容量更大、树更矮胖、磁盘 I/O 更少。"
        />
      </div>
    </template>
  </LabShell>
</template>
