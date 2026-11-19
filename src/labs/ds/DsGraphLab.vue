<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { VueFlow, MarkerType, type Node, type Edge, type Connection } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import { bindLabPlayer, useStepPlayer } from '../../composables/useStepPlayer';
import {
  buildAdjacencyData,
  parseEdgeListText,
  simulateGraphAlgo,
  type GraphAlgo,
  type GraphEdgeDef,
  type GraphVertex,
} from './engines/graphEngine';
import { ElMessage } from 'element-plus';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const directed = ref(false);
const algo = ref<GraphAlgo>('dijkstra');
const edgeText = ref('A-B:4, A-C:2, B-C:1, B-D:5, C-D:8, C-E:10, D-E:2, D-F:6, E-F:3');

const initialParsed = parseEdgeListText(edgeText.value, false);
const vertices = ref<GraphVertex[]>(initialParsed.vertices);
const edges = ref<GraphEdgeDef[]>(initialParsed.edges);
const startVertex = ref('A');

// Quick manual edge editor
const newVertexName = ref('G');
const newEdgeSrc = ref('A');
const newEdgeDst = ref('B');
const newEdgeWeight = ref(3);

const steps = computed(() =>
  simulateGraphAlgo(vertices.value, edges.value, directed.value, algo.value, startVertex.value)
);
const player = useStepPlayer(steps, 950);
const playerBind = bindLabPlayer(player);

const adjData = computed(() => buildAdjacencyData(vertices.value, edges.value, directed.value));

watch(algo, (val) => {
  if (val === 'topo-aoe' && !directed.value) {
    directed.value = true;
    ElMessage.info('拓扑排序与 AOE 关键路径需要有向图，已自动切换为有向图模式。');
  }
});

function applyEdgeText() {
  const res = parseEdgeListText(edgeText.value, directed.value);
  if (res.vertices.length === 0) {
    ElMessage.warning('未识别到有效顶点或边，请按 A-B:4 格式输入');
    return;
  }
  vertices.value = res.vertices;
  edges.value = res.edges;
  startVertex.value = res.vertices[0].id;
  player.reset();
}

function addVertex() {
  const name = newVertexName.value.trim();
  if (!name || vertices.value.some((v) => v.id === name)) {
    ElMessage.warning('顶点名不能为空且不能重复');
    return;
  }
  vertices.value = [
    ...vertices.value,
    { id: name, label: name, x: 120 + (vertices.value.length * 45) % 340, y: 120 + (vertices.value.length * 35) % 180 },
  ];
  const nextCharCode = name.charCodeAt(0) + 1;
  if (name.length === 1 && nextCharCode <= 90) {
    newVertexName.value = String.fromCharCode(nextCharCode);
  }
}

function addOrUpdateEdge() {
  if (newEdgeSrc.value === newEdgeDst.value) {
    ElMessage.warning('暂不支持自环边');
    return;
  }
  const existing = edges.value.find(
    (e) =>
      (e.source === newEdgeSrc.value && e.target === newEdgeDst.value) ||
      (!directed.value && e.source === newEdgeDst.value && e.target === newEdgeSrc.value)
  );
  if (existing) {
    existing.weight = newEdgeWeight.value;
    edges.value = [...edges.value];
    ElMessage.success(`已更新边 (${newEdgeSrc.value}, ${newEdgeDst.value}) 权值为 ${newEdgeWeight.value}`);
  } else {
    edges.value = [
      ...edges.value,
      {
        id: `e_${newEdgeSrc.value}_${newEdgeDst.value}_${Date.now()}`,
        source: newEdgeSrc.value,
        target: newEdgeDst.value,
        weight: newEdgeWeight.value,
      },
    ];
  }
}

function onConnect(conn: Connection) {
  if (!conn.source || !conn.target || conn.source === conn.target) return;
  edges.value = [
    ...edges.value,
    {
      id: `e_${conn.source}_${conn.target}_${Date.now()}`,
      source: conn.source,
      target: conn.target,
      weight: newEdgeWeight.value || 1,
    },
  ];
}

function onNodeDragStop(evt: { node: Node }) {
  const target = vertices.value.find((v) => v.id === evt.node.id);
  if (target) {
    target.x = Math.round(evt.node.position.x);
    target.y = Math.round(evt.node.position.y);
  }
}

function loadPreset(kind: 'mst' | 'aoe' | 'floyd') {
  if (kind === 'mst') {
    directed.value = false;
    algo.value = 'prim';
    edgeText.value = 'A-B:4, A-C:2, B-C:1, B-D:5, C-D:8, C-E:10, D-E:2, D-F:6, E-F:3';
  } else if (kind === 'aoe') {
    directed.value = true;
    algo.value = 'topo-aoe';
    edgeText.value = 'V1->V2:6, V1->V3:4, V1->V4:5, V2->V5:1, V3->V5:1, V4->V6:2, V5->V7:9, V5->V8:7, V6->V8:4, V7->V9:2, V8->V9:4';
  } else {
    directed.value = true;
    algo.value = 'floyd';
    edgeText.value = 'A->B:3, A->D:7, B->A:8, B->C:2, C->A:5, C->D:1, D->A:2';
  }
  applyEdgeText();
}

const vfNodes = computed<Node[]>(() => {
  const st = player.currentStep.value?.state;
  const visited = new Set(st?.visitedIds || []);
  return vertices.value.map((v) => {
    const isActive = st?.activeVertexId === v.id;
    const isVis = visited.has(v.id);
    return {
      id: v.id,
      label: v.label,
      position: { x: v.x, y: v.y },
      style: {
        width: '44px',
        height: '44px',
        borderRadius: '9999px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        fontFamily: 'var(--font-mono)',
        background: isActive ? '#4f46e5' : isVis ? '#10b981' : '#ffffff',
        color: isActive || isVis ? '#ffffff' : '#0f172a',
        border: isActive ? '3px solid #312e81' : '2px solid #475569',
      },
    };
  });
});

const vfEdges = computed<Edge[]>(() => {
  const st = player.currentStep.value?.state;
  const activeSet = new Set(st?.activeEdgeIds || []);
  const pathSet = new Set(st?.mstOrPathEdgeIds || []);
  const critSet = new Set(st?.criticalEdgeIds || []);

  return edges.value.map((e) => {
    const isCrit = critSet.has(e.id);
    const isActive = activeSet.has(e.id);
    const isPath = pathSet.has(e.id);
    const stroke = isCrit ? '#ef4444' : isActive ? '#f59e0b' : isPath ? '#10b981' : '#94a3b8';
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: String(e.weight),
      animated: isActive || isCrit,
      markerEnd: directed.value
        ? { type: MarkerType.ArrowClosed, color: stroke }
        : undefined,
      style: {
        stroke,
        strokeWidth: isCrit || isActive || isPath ? 3 : 1.8,
      },
      labelStyle: {
        fontFamily: 'var(--font-mono)',
        fontWeight: 700,
        fontSize: '12px',
      },
    };
  });
});

const pseudocodeLines = computed(() => {
  if (algo.value === 'dijkstra') {
    return [
      'dist[start] = 0; others = INF; S = {};',
      'while (|S| < |V|) {',
      '  u = argmin_{v not in S} dist[v];',
      '  S.add(u);',
      '  for (each neighbor v of u)',
      '    if (dist[u] + w(u,v) < dist[v])',
      '      dist[v] = dist[u] + w(u,v); // 松弛',
      '}',
    ];
  }
  if (algo.value === 'floyd') {
    return [
      'A = adjMatrix; // A^(-1)',
      'for (k = 0; k < n; k++)',
      '  for (i = 0; i < n; i++)',
      '    for (j = 0; j < n; j++)',
      '      if (A[i][k] + A[k][j] < A[i][j])',
      '        A[i][j] = A[i][k] + A[k][j];',
    ];
  }
  if (algo.value === 'topo-aoe') {
    return [
      'push all v with indegree[v] == 0 to Queue;',
      'while (!Q.empty()) {',
      '  u = Q.pop(); topoOrder.push(u);',
      '  for (each edge u->v with weight w) {',
      '    ve[v] = max(ve[v], ve[u] + w);',
      '    if (--indegree[v] == 0) Q.push(v);',
      '  }',
      '} if (topoOrder.len < |V|) return CYCLE_DETECTED;',
      'vl[sink] = ve[sink]; // 逆拓扑序求最迟时间',
      'for (u in reverse(topoOrder)) vl[u] = min(vl[v] - w);',
      '// 凡是 e(i)==ve[u] == l(i)==vl[v]-w 为关键活动',
    ];
  }
  return [
    '// 图遍历 / 最小生成树核心流程',
    'initStructure(startVertex);',
    'while (hasCandidate()) {',
    '  pickNextVertexOrMinEdge();',
    '  checkVisitedOrUnionFind();',
    '  updateTreeEdgesAndWeights();',
    '}',
  ];
});
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :player="playerBind"
    :pseudocode="pseudocodeLines"
    :has-inspector="true"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <div class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <el-radio-group v-model="algo" size="small">
                <el-radio-button value="bfs">BFS</el-radio-button>
                <el-radio-button value="dfs">DFS</el-radio-button>
                <el-radio-button value="prim">Prim</el-radio-button>
                <el-radio-button value="kruskal">Kruskal</el-radio-button>
                <el-radio-button value="dijkstra">Dijkstra</el-radio-button>
                <el-radio-button value="floyd">Floyd</el-radio-button>
                <el-radio-button value="topo-aoe">拓扑 & AOE关键路径</el-radio-button>
              </el-radio-group>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <el-switch v-model="directed" active-text="有向图" inactive-text="无向图" />
              <el-select v-model="startVertex" size="small" style="width: 95px" placeholder="起点">
                <el-option v-for="v in vertices" :key="v.id" :label="`起点 ${v.label}`" :value="v.id" />
              </el-select>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-center">
            <div class="lg:col-span-6 flex gap-2">
              <el-input
                v-model="edgeText"
                size="small"
                class="font-mono"
                placeholder="如 A-B:4, A->C:2"
              >
                <template #prepend>边列表</template>
              </el-input>
              <el-button type="primary" size="small" @click="applyEdgeText">生成拓扑</el-button>
            </div>

            <div class="lg:col-span-6 flex flex-wrap items-center gap-1.5">
              <el-input v-model="newVertexName" size="small" style="width: 58px" />
              <el-button size="small" @click="addVertex">+顶点</el-button>
              <el-select v-model="newEdgeSrc" size="small" style="width: 64px">
                <el-option v-for="v in vertices" :key="v.id" :label="v.id" :value="v.id" />
              </el-select>
              <span class="text-xs">{{ directed ? '→' : '—' }}</span>
              <el-select v-model="newEdgeDst" size="small" style="width: 64px">
                <el-option v-for="v in vertices" :key="v.id" :label="v.id" :value="v.id" />
              </el-select>
              <el-input-number v-model="newEdgeWeight" size="small" :min="-20" :max="99" style="width: 85px" />
              <el-button size="small" type="success" plain @click="addOrUpdateEdge">+加/改边</el-button>
              <el-button size="small" @click="loadPreset('aoe')">AOE真题网</el-button>
              <el-button size="small" @click="loadPreset('floyd')">Floyd有向网</el-button>
            </div>
          </div>
        </div>
      </el-card>
    </template>

    <template #stage>
      <div class="space-y-3">
        <div class="text-xs text-slate-500 flex items-center justify-between">
          <span>支持在画布内直接拖拽调整顶点位置、滚轮缩放，或拖动节点边缘连线加边</span>
          <el-tag size="small" type="info">{{ vertices.length }} 顶点 · {{ edges.length }} 边</el-tag>
        </div>

        <div class="h-[360px] w-full rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950">
          <VueFlow
            :nodes="vfNodes"
            :edges="vfEdges"
            fit-view-on-init
            @connect="onConnect"
            @node-drag-stop="onNodeDragStop"
          >
            <Background pattern-color="#cbd5e1" :gap="20" />
            <Controls />
          </VueFlow>
        </div>

        <!-- Auxiliary Table (Prim / Dijkstra / AOE / Floyd) -->
        <div v-if="player.currentStep.value?.state.tableRows?.length" class="overflow-x-auto">
          <el-table :data="player.currentStep.value.state.tableRows" size="small" border>
            <el-table-column
              v-for="h in player.currentStep.value.state.tableHeaders"
              :key="h"
              :prop="h"
              :label="h"
            />
          </el-table>
        </div>

        <div v-if="player.currentStep.value?.state.floydMatrix" class="overflow-x-auto">
          <div class="text-xs font-semibold mb-1.5">Floyd 距离矩阵 (高亮为本轮缩短的距离)</div>
          <table class="w-full text-center font-mono text-xs border-collapse tabular-nums">
            <thead>
              <tr class="bg-slate-100 dark:bg-slate-800">
                <th class="border border-slate-200 dark:border-slate-700 p-1.5">i \ j</th>
                <th
                  v-for="lbl in player.currentStep.value.state.floydLabels"
                  :key="lbl"
                  class="border border-slate-200 dark:border-slate-700 p-1.5"
                >
                  {{ lbl }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rIdx) in player.currentStep.value.state.floydMatrix" :key="rIdx">
                <th class="border border-slate-200 dark:border-slate-700 p-1.5 bg-slate-50 dark:bg-slate-900">
                  {{ player.currentStep.value.state.floydLabels?.[rIdx] }}
                </th>
                <td
                  v-for="(cell, cIdx) in row"
                  :key="cIdx"
                  :class="[
                    'border border-slate-200 dark:border-slate-700 p-1.5',
                    player.currentStep.value.state.floydChanged?.some(([ri, ci]) => ri === rIdx && ci === cIdx)
                      ? 'bg-amber-200 dark:bg-amber-900/60 font-bold text-amber-900 dark:text-amber-200'
                      : '',
                  ]"
                >
                  {{ cell }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <template #inspector>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <template #header>
          <span class="text-xs font-semibold">{{ player.currentStep.value?.state.auxiliaryTitle || '过程监视' }}</span>
        </template>
        <div class="space-y-1.5 font-mono text-xs">
          <div
            v-for="(item, idx) in player.currentStep.value?.state.auxiliaryItems || []"
            :key="idx"
            class="px-2 py-1 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          >
            {{ item }}
          </div>
        </div>
      </el-card>

      <!-- Live Adjacency Matrix & List -->
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <template #header>
          <span class="text-xs font-semibold">实时邻接矩阵 & 邻接表</span>
        </template>
        <div class="space-y-3">
          <div class="overflow-x-auto">
            <table class="w-full text-center font-mono text-[11px] border-collapse tabular-nums">
              <thead>
                <tr class="bg-slate-100 dark:bg-slate-800">
                  <th class="border border-slate-200 dark:border-slate-700 p-1">#</th>
                  <th v-for="v in vertices" :key="v.id" class="border border-slate-200 dark:border-slate-700 p-1">
                    {{ v.label }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, rIdx) in adjData.matrix" :key="rIdx">
                  <th class="border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-900">
                    {{ vertices[rIdx]?.label }}
                  </th>
                  <td
                    v-for="(val, cIdx) in row"
                    :key="cIdx"
                    class="border border-slate-200 dark:border-slate-700 p-1"
                  >
                    {{ val }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="space-y-1 font-mono text-[11px]">
            <div v-for="v in vertices" :key="v.id" class="flex items-center gap-1.5 flex-wrap">
              <el-tag size="small" effect="dark">{{ v.label }}</el-tag>
              <span>→</span>
              <span
                v-for="(nb, i) in adjData.adjList[v.id]"
                :key="i"
                class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                {{ nb.to }}({{ nb.weight }})
              </span>
              <span v-if="!adjData.adjList[v.id]?.length" class="text-slate-400">^</span>
            </div>
          </div>
        </div>
      </el-card>
    </template>
  </LabShell>
</template>
