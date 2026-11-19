<script setup lang="ts">
import { computed, ref } from 'vue';
import { VueFlow, MarkerType, type Node, type Edge } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import { bindLabPlayer, useStepPlayer } from '../../composables/useStepPlayer';
import {
  simulateBanker,
  simulateRagReduction,
  type BankerProcess,
  type RagEdge,
  type RagResource,
} from './engines/bankerRagEngine';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const activeTab = ref<'banker' | 'rag'>('banker');

// Tab 1: Banker
const procs = ref<BankerProcess[]>([
  { pid: 'P0', max: [7, 5, 3], alloc: [0, 1, 0] },
  { pid: 'P1', max: [3, 2, 2], alloc: [2, 0, 0] },
  { pid: 'P2', max: [9, 0, 2], alloc: [3, 0, 2] },
  { pid: 'P3', max: [2, 2, 2], alloc: [2, 1, 1] },
  { pid: 'P4', max: [4, 3, 3], alloc: [0, 0, 2] },
]);
const available = ref([3, 3, 2]);
const enableReq = ref(false);
const reqPid = ref('P1');
const reqVec = ref([1, 0, 2]);

const bankerSteps = computed(() =>
  simulateBanker(procs.value, available.value, enableReq.value ? reqPid.value : null, reqVec.value)
);
const bankerPlayer = useStepPlayer(bankerSteps, 950);

// Tab 2: RAG
const ragProcs = ref(['P1', 'P2', 'P3', 'P4']);
const ragResources = ref<RagResource[]>([
  { id: 'R1', instances: 2 },
  { id: 'R2', instances: 2 },
]);
const ragEdges = ref<RagEdge[]>([
  { id: 'e1', kind: 'alloc', resource: 'R1', process: 'P1' },
  { id: 'e2', kind: 'alloc', resource: 'R1', process: 'P2' },
  { id: 'e3', kind: 'request', process: 'P1', resource: 'R2' },
  { id: 'e4', kind: 'alloc', resource: 'R2', process: 'P3' },
  { id: 'e5', kind: 'alloc', resource: 'R2', process: 'P4' },
  { id: 'e6', kind: 'request', process: 'P3', resource: 'R1' },
]);

const newEdgeKind = ref<'alloc' | 'request'>('request');
const newEdgeP = ref('P2');
const newEdgeR = ref('R2');

function addRagEdge() {
  ragEdges.value.push({
    id: `re_${Date.now()}`,
    kind: newEdgeKind.value,
    process: newEdgeP.value,
    resource: newEdgeR.value,
  });
}

function loadRagPreset(kind: 'multiSafe' | 'deadlock') {
  if (kind === 'multiSafe') {
    ragProcs.value = ['P1', 'P2', 'P3', 'P4'];
    ragResources.value = [
      { id: 'R1', instances: 2 },
      { id: 'R2', instances: 2 },
    ];
    ragEdges.value = [
      { id: 'e1', kind: 'alloc', resource: 'R1', process: 'P1' },
      { id: 'e2', kind: 'alloc', resource: 'R1', process: 'P2' },
      { id: 'e3', kind: 'request', process: 'P1', resource: 'R2' },
      { id: 'e4', kind: 'alloc', resource: 'R2', process: 'P3' },
      { id: 'e5', kind: 'alloc', resource: 'R2', process: 'P4' },
      { id: 'e6', kind: 'request', process: 'P3', resource: 'R1' },
    ];
  } else {
    ragProcs.value = ['P1', 'P2'];
    ragResources.value = [
      { id: 'R1', instances: 1 },
      { id: 'R2', instances: 1 },
    ];
    ragEdges.value = [
      { id: 'd1', kind: 'alloc', resource: 'R1', process: 'P1' },
      { id: 'd2', kind: 'request', process: 'P1', resource: 'R2' },
      { id: 'd3', kind: 'alloc', resource: 'R2', process: 'P2' },
      { id: 'd4', kind: 'request', process: 'P2', resource: 'R1' },
    ];
  }
}

const ragSteps = computed(() => simulateRagReduction(ragProcs.value, ragResources.value, ragEdges.value));
const ragPlayer = useStepPlayer(ragSteps, 950);

const activePlayerBind = computed(() =>
  activeTab.value === 'banker' ? bindLabPlayer(bankerPlayer).value : bindLabPlayer(ragPlayer).value
);

const ragNodes = computed<Node[]>(() => {
  const reduced = new Set(ragPlayer.currentStep.value?.state.reducedProcs || []);
  const free = ragPlayer.currentStep.value?.state.freeInstances || {};
  const pNodes: Node[] = ragProcs.value.map((p, idx) => ({
    id: p,
    label: p,
    position: { x: 80 + idx * 130, y: 40 },
    style: {
      width: '48px',
      height: '48px',
      borderRadius: '9999px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 'bold',
      background: reduced.has(p) ? '#cbd5e1' : '#4f46e5',
      color: reduced.has(p) ? '#64748b' : '#ffffff',
      border: '2px solid #312e81',
      opacity: reduced.has(p) ? 0.55 : 1,
    },
  }));
  const rNodes: Node[] = ragResources.value.map((r, idx) => ({
    id: r.id,
    label: `${r.id}\n(共${r.instances} / 余${free[r.id] ?? r.instances})`,
    position: { x: 140 + idx * 200, y: 210 },
    style: {
      width: '120px',
      padding: '10px',
      borderRadius: '6px',
      textAlign: 'center',
      fontSize: '12px',
      fontWeight: 'bold',
      background: '#f59e0b',
      color: '#ffffff',
      border: '2px solid #b45309',
    },
  }));
  return [...pNodes, ...rNodes];
});

const ragVfEdges = computed<Edge[]>(() => {
  const removed = new Set(ragPlayer.currentStep.value?.state.removedEdges || []);
  return ragEdges.value.map((e) => {
    const isGone = removed.has(e.id);
    const src = e.kind === 'alloc' ? e.resource : e.process;
    const dst = e.kind === 'alloc' ? e.process : e.resource;
    const color = isGone ? '#e2e8f0' : e.kind === 'alloc' ? '#10b981' : '#ef4444';
    return {
      id: e.id,
      source: src,
      target: dst,
      label: isGone ? '已消去' : e.kind === 'alloc' ? '分配' : '请求',
      animated: !isGone && e.kind === 'request',
      markerEnd: { type: MarkerType.ArrowClosed, color },
      style: {
        stroke: color,
        strokeWidth: isGone ? 1 : 2.4,
        strokeDasharray: e.kind === 'request' && !isGone ? '5 3' : undefined,
      },
    };
  });
});

const bankerPseudo = [
  '// 银行家算法: Request 试分配 + Safety 检验',
  'if (Request[i] > Need[i]) return ERROR;',
  'if (Request[i] > Available) return WAIT;',
  'trialAllocate(i, Request[i]);',
  '// 安全性算法:',
  'Work = Available; Finish[0..n-1] = false;',
  'while (exists i: !Finish[i] && Need[i] <= Work) {',
  '  Work += Allocation[i];',
  '  Finish[i] = true; safeSeq.push(i);',
  '}',
  'if (all Finish == true) return SAFE;',
  'else { rollbackTrial(); return UNSAFE; }',
];
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :player="activePlayerBind"
    :pseudocode="activeTab === 'banker' ? bankerPseudo : []"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <el-tabs v-model="activeTab" class="!mb-0">
          <el-tab-pane label="银行家算法 (自定义矩阵 & 请求检验)" name="banker">
            <div class="space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-2 text-xs">
                  <span class="font-semibold">可用向量 Available (A, B, C):</span>
                  <el-input-number v-model="available[0]" :min="0" :max="20" size="small" style="width: 75px" />
                  <el-input-number v-model="available[1]" :min="0" :max="20" size="small" style="width: 75px" />
                  <el-input-number v-model="available[2]" :min="0" :max="20" size="small" style="width: 75px" />
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  <el-switch v-model="enableReq" active-text="提交 Request 请求" inactive-text="仅静态安全检查" />
                  <template v-if="enableReq">
                    <el-select v-model="reqPid" size="small" style="width: 72px">
                      <el-option v-for="p in procs" :key="p.pid" :label="p.pid" :value="p.pid" />
                    </el-select>
                    <el-input-number v-model="reqVec[0]" :min="0" :max="20" size="small" style="width: 68px" />
                    <el-input-number v-model="reqVec[1]" :min="0" :max="20" size="small" style="width: 68px" />
                    <el-input-number v-model="reqVec[2]" :min="0" :max="20" size="small" style="width: 68px" />
                  </template>
                </div>
              </div>

              <!-- Editable Max / Alloc table -->
              <el-table :data="procs" size="small" border>
                <el-table-column prop="pid" label="进程" width="62" />
                <el-table-column label="最大需求 Max (A, B, C)">
                  <template #default="{ row }">
                    <div class="flex gap-1">
                      <el-input-number v-model="row.max[0]" :min="0" :max="20" size="small" controls-position="right" style="width: 66px" />
                      <el-input-number v-model="row.max[1]" :min="0" :max="20" size="small" controls-position="right" style="width: 66px" />
                      <el-input-number v-model="row.max[2]" :min="0" :max="20" size="small" controls-position="right" style="width: 66px" />
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="已分配 Allocation (A, B, C)">
                  <template #default="{ row }">
                    <div class="flex gap-1">
                      <el-input-number v-model="row.alloc[0]" :min="0" :max="row.max[0]" size="small" controls-position="right" style="width: 66px" />
                      <el-input-number v-model="row.alloc[1]" :min="0" :max="row.max[1]" size="small" controls-position="right" style="width: 66px" />
                      <el-input-number v-model="row.alloc[2]" :min="0" :max="row.max[2]" size="small" controls-position="right" style="width: 66px" />
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </el-tab-pane>

          <el-tab-pane label="资源分配图 (RAG) 化简判死锁" name="rag">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <span>R1实例:<el-input-number v-model="ragResources[0].instances" :min="1" :max="5" size="small" style="width: 76px" /></span>
                <span>R2实例:<el-input-number v-model="ragResources[1].instances" :min="1" :max="5" size="small" style="width: 76px" /></span>
                <el-select v-model="newEdgeKind" size="small" style="width: 105px">
                  <el-option value="request" label="请求边 P→R" />
                  <el-option value="alloc" label="分配边 R→P" />
                </el-select>
                <el-select v-model="newEdgeP" size="small" style="width: 68px">
                  <el-option v-for="p in ragProcs" :key="p" :label="p" :value="p" />
                </el-select>
                <el-select v-model="newEdgeR" size="small" style="width: 68px">
                  <el-option v-for="r in ragResources" :key="r.id" :label="r.id" :value="r.id" />
                </el-select>
                <el-button type="primary" size="small" @click="addRagEdge">+ 添加边</el-button>
                <el-button size="small" type="danger" plain @click="ragEdges = []">清空边</el-button>
              </div>
              <div class="flex gap-1.5">
                <el-button size="small" @click="loadRagPreset('multiSafe')">多实例有环但无死锁例</el-button>
                <el-button size="small" type="warning" plain @click="loadRagPreset('deadlock')">单实例环路死锁例</el-button>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <template #stage>
      <!-- Stage 1: Banker -->
      <div v-if="activeTab === 'banker' && bankerPlayer.currentStep.value" class="space-y-4">
        <div class="flex flex-wrap items-center gap-3">
          <el-tag type="primary" effect="dark" class="font-mono">
            当前 Work = [{{ bankerPlayer.currentStep.value.state.work.join(', ') }}]
          </el-tag>
          <el-tag type="success" class="font-mono">
            安全序列: &lt;{{ bankerPlayer.currentStep.value.state.safeSeq.join(', ') || '检查中' }}&gt;
          </el-tag>
          <el-tag
            v-if="bankerPlayer.currentStep.value.state.outcome"
            :type="bankerPlayer.currentStep.value.state.outcome === 'safe' ? 'success' : 'danger'"
            effect="dark"
          >
            {{ bankerPlayer.currentStep.value.state.outcome === 'safe' ? '✓ 安全状态' : '✗ 不安全/拒绝' }}
          </el-tag>
        </div>

        <el-table :data="bankerPlayer.currentStep.value.state.rows" size="small" border class="font-mono">
          <el-table-column prop="pid" label="进程" width="75" />
          <el-table-column prop="max" label="Max" />
          <el-table-column prop="alloc" label="Allocation" />
          <el-table-column prop="need" label="Need (Max-Alloc)" />
          <el-table-column label="Finish">
            <template #default="{ row }">
              <el-tag :type="row.finish ? 'success' : 'info'" size="small">{{ row.finish ? 'true ✓' : 'false' }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- Stage 2: RAG VueFlow -->
      <div v-else-if="activeTab === 'rag'" class="space-y-3">
        <div class="flex flex-wrap gap-3 text-xs">
          <span class="inline-flex items-center gap-1"><span class="w-4 h-0.5 bg-emerald-500 inline-block"></span>绿色实线：已分配 (R→P)</span>
          <span class="inline-flex items-center gap-1"><span class="w-4 h-0.5 border-t-2 border-dashed border-rose-500 inline-block"></span>红色虚线：请求中 (P→R)</span>
          <el-tag v-if="ragPlayer.currentStep.value?.state.deadlocked === false" type="success" effect="dark">可完全化简 (无死锁)</el-tag>
          <el-tag v-else-if="ragPlayer.currentStep.value?.state.deadlocked === true" type="danger" effect="dark">存在不可化简节点 (死锁!)</el-tag>
        </div>

        <div class="h-[330px] w-full rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950">
          <VueFlow :nodes="ragNodes" :edges="ragVfEdges" fit-view-on-init>
            <Background pattern-color="#cbd5e1" :gap="20" />
          </VueFlow>
        </div>
      </div>
    </template>
  </LabShell>
</template>
