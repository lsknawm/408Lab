<script setup lang="ts">
import { computed, ref } from 'vue';
import { VueFlow, type Node, type Edge } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import { bindLabPlayer, useStepPlayer } from '../../composables/useStepPlayer';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const mode = ref<'rip-loop' | 'ospf'>('rip-loop');
const linkDown = ref(false);
const splitHorizon = ref(false);
const edgeWeights = ref({ ab: 1, bc: 1, ac: 4, cd: 2 });

// RIP Count-to-Infinity Simulation on R1 -- R2 -- R3 -- NetX (or Net1 -- R1 -- R2 -- R3)
const ripSteps = computed(() => {
  // Topology: Net1 --(1)-- R1 --(1)-- R2 --(1)-- R3
  const steps: Array<{
    title: string;
    description: string;
    codeLine: number;
    state: {
      round: number;
      tables: Array<{ router: string; distToNet1: number; nextHop: string }>;
      net1Down: boolean;
    };
  }> = [];

  let d1 = 1;
  let nh1 = '直连';
  let d2 = 2;
  let nh2 = 'R1';
  let d3 = 3;
  let nh3 = 'R2';

  const snap = (round: number, title: string, description: string, codeLine: number) => {
    steps.push({
      title,
      description,
      codeLine,
      state: {
        round,
        net1Down: linkDown.value,
        tables: [
          { router: 'R1', distToNet1: d1, nextHop: nh1 },
          { router: 'R2', distToNet1: d2, nextHop: nh2 },
          { router: 'R3', distToNet1: d3, nextHop: nh3 },
        ],
      },
    });
  };

  snap(0, '初始收敛稳态 (RIP 正常)', 'R1 直连 Net1 (跳数=1)，R2 经 R1 (2跳)，R3 经 R2 (3跳)。', 1);

  if (!linkDown.value) {
    return steps;
  }

  // Link Net1-R1 goes down!
  d1 = 16;
  nh1 = '不可达';
  snap(1, '💥 R1 检测到直连网段 Net1 故障！置跳数 = 16', 'R1 把到 Net1 的距离改为 16（不可达），等待与邻居交换路由表。', 3);

  if (splitHorizon.value) {
    snap(
      2,
      '开启水平分割：R2 不向 R1 汇报经由 R1 到达的 Net1',
      'R2 收到 R1 的 16 跳通告后因下一跳相同而更新为 16（不可达），R3 随后也更新为 16，瞬间收敛无环路！',
      5
    );
    d2 = 16;
    nh2 = '不可达';
    d3 = 16;
    nh3 = '不可达';
    snap(3, '✓ 快速收敛完成', '所有路由器均知晓 Net1 不可达，未发生计数到无穷！', 6);
    return steps;
  }

  // Simulate classic count-to-infinity up to 16
  for (let round = 2; round <= 16; round++) {
    // Synchronous update: R2 tells R1 it can reach Net1 in d2, R1 tells R2 it can reach in d1
    const oldD1 = d1;
    const oldD2 = d2;
    const oldD3 = d3;

    // R1 receives R2's oldD2 (which is 2 in round 2!) and thinks R2 has another path!
    if (nh1 === '不可达' || nh1 === 'R2') {
      d1 = Math.min(16, oldD2 + 1);
      nh1 = d1 >= 16 ? '不可达' : 'R2';
    }
    // R2 learns from R1 (its next hop)
    d2 = Math.min(16, oldD1 + 1);
    nh2 = d2 >= 16 ? '不可达' : 'R1';
    // R3 learns from R2
    d3 = Math.min(16, oldD2 + 1);
    nh3 = d3 >= 16 ? '不可达' : 'R2';

    snap(
      round,
      `第 ${round} 轮交换：计数增长 (R1=${d1}, R2=${d2}, R3=${d3})`,
      d1 < 16
        ? `R1 误信 R2 的旧路由，更新为经 R2 跳数 ${d1}；下一轮 R2 跟着变成 ${d2}，陷入慢收敛递增！`
        : '所有路由器终于计数到达 16 跳，确认 Net1 彻底不可达（每轮 30s，耗费数分钟！）。',
      4
    );
    if (d1 === 16 && d2 === 16 && d3 === 16) break;
  }

  return steps;
});

// OSPF SPF Simulation on R1, R2, R3, R4 custom weights
const ospfSteps = computed(() => {
  const w = edgeWeights.value;
  const effAc = linkDown.value ? Infinity : w.ac;
  const adj: Record<string, Array<{ to: string; cost: number }>> = {
    R1: [
      { to: 'R2', cost: w.ab },
      ...(effAc < Infinity ? [{ to: 'R3', cost: effAc }] : []),
    ],
    R2: [
      { to: 'R1', cost: w.ab },
      { to: 'R3', cost: w.bc },
    ],
    R3: [
      ...(effAc < Infinity ? [{ to: 'R1', cost: effAc }] : []),
      { to: 'R2', cost: w.bc },
      { to: 'R4', cost: w.cd },
    ],
    R4: [{ to: 'R3', cost: w.cd }],
  };

  const steps: Array<{
    title: string;
    description: string;
    codeLine: number;
    state: {
      settled: string[];
      dist: Record<string, number | string>;
      parent: Record<string, string>;
    };
  }> = [];

  const nodes = ['R1', 'R2', 'R3', 'R4'];
  const dist: Record<string, number> = { R1: 0, R2: Infinity, R3: Infinity, R4: Infinity };
  const parent: Record<string, string> = { R1: '-', R2: '-', R3: '-', R4: '-' };
  const settled = new Set<string>();

  steps.push({
    title: 'OSPF 阶段1：全网泛洪 LSA 同步拓扑数据库 (LSDB)',
    description: `${linkDown.value ? '链路 R1-R3 已断开，R1/R3 立即泛洪最新 LSA 更新全网 LSDB。' : '各路由器向邻居泛洪自身链路状态 LSA，构建一致的带权全网拓扑图。'}`,
    codeLine: 2,
    state: {
      settled: [],
      dist: { R1: 0, R2: '∞', R3: '∞', R4: '∞' },
      parent: { ...parent },
    },
  });

  while (settled.size < nodes.length) {
    let u: string | null = null;
    let best = Infinity;
    for (const n of nodes) {
      if (!settled.has(n) && dist[n] < best) {
        best = dist[n];
        u = n;
      }
    }
    if (!u) break;
    settled.add(u);
    for (const nb of adj[u]) {
      if (!settled.has(nb.to) && dist[u] + nb.cost < dist[nb.to]) {
        dist[nb.to] = dist[u] + nb.cost;
        parent[nb.to] = u;
      }
    }
    steps.push({
      title: `Dijkstra SPF 确定 ${u} 最短路 (代价=${dist[u]})`,
      description: `R1 本地运行 SPF 算法将 ${u} 纳入最短路径树，更新邻居距离。`,
      codeLine: 6,
      state: {
        settled: Array.from(settled),
        dist: Object.fromEntries(nodes.map((n) => [n, dist[n] === Infinity ? '∞' : dist[n]])),
        parent: { ...parent },
      },
    });
  }

  return steps;
});

const ripPlayer = useStepPlayer(ripSteps, 600);
const ospfPlayer = useStepPlayer(ospfSteps, 850);

const activePlayerBind = computed(() =>
  mode.value === 'rip-loop' ? bindLabPlayer(ripPlayer).value : bindLabPlayer(ospfPlayer).value
);

const vfNodes = computed<Node[]>(() => {
  if (mode.value === 'rip-loop') {
    const tbl = ripPlayer.currentStep.value?.state.tables || [];
    const getD = (r: string) => tbl.find((x) => x.router === r)?.distToNet1 ?? '-';
    return [
      { id: 'Net1', label: `Net1 目的网段\n(${linkDown.value ? '链断' : '正常'})`, position: { x: 20, y: 110 }, style: { background: linkDown.value ? '#ef4444' : '#10b981', color: '#fff', fontWeight: 'bold', borderRadius: '8px', padding: '10px' } },
      { id: 'R1', label: `R1\ndist=${getD('R1')}`, position: { x: 190, y: 110 }, style: { background: '#4f46e5', color: '#fff', fontWeight: 'bold', borderRadius: '9999px', padding: '12px', textAlign: 'center' } },
      { id: 'R2', label: `R2\ndist=${getD('R2')}`, position: { x: 340, y: 110 }, style: { background: '#4f46e5', color: '#fff', fontWeight: 'bold', borderRadius: '9999px', padding: '12px', textAlign: 'center' } },
      { id: 'R3', label: `R3\ndist=${getD('R3')}`, position: { x: 490, y: 110 }, style: { background: '#4f46e5', color: '#fff', fontWeight: 'bold', borderRadius: '9999px', padding: '12px', textAlign: 'center' } },
    ];
  }
  const settled = new Set(ospfPlayer.currentStep.value?.state.settled || []);
  const dist = ospfPlayer.currentStep.value?.state.dist || {};
  return [
    { id: 'R1', label: `R1 (根, 0)`, position: { x: 40, y: 110 }, style: { background: '#4f46e5', color: '#fff', fontWeight: 'bold', borderRadius: '9999px', padding: '10px' } },
    { id: 'R2', label: `R2 (d=${dist['R2'] ?? '∞'})`, position: { x: 200, y: 30 }, style: { background: settled.has('R2') ? '#10b981' : '#f8fafc', color: settled.has('R2') ? '#fff' : '#0f172a', fontWeight: 'bold', borderRadius: '9999px', padding: '10px', border: '2px solid #475569' } },
    { id: 'R3', label: `R3 (d=${dist['R3'] ?? '∞'})`, position: { x: 260, y: 190 }, style: { background: settled.has('R3') ? '#10b981' : '#f8fafc', color: settled.has('R3') ? '#fff' : '#0f172a', fontWeight: 'bold', borderRadius: '9999px', padding: '10px', border: '2px solid #475569' } },
    { id: 'R4', label: `R4 (d=${dist['R4'] ?? '∞'})`, position: { x: 450, y: 190 }, style: { background: settled.has('R4') ? '#10b981' : '#f8fafc', color: settled.has('R4') ? '#fff' : '#0f172a', fontWeight: 'bold', borderRadius: '9999px', padding: '10px', border: '2px solid #475569' } },
  ];
});

const vfEdges = computed<Edge[]>(() => {
  if (mode.value === 'rip-loop') {
    return [
      { id: 'n1r1', source: 'Net1', target: 'R1', label: linkDown.value ? '✕ 断开' : '1', style: { stroke: linkDown.value ? '#ef4444' : '#10b981', strokeDasharray: linkDown.value ? '5 5' : undefined, strokeWidth: 2.5 } },
      { id: 'r1r2', source: 'R1', target: 'R2', label: '1', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'r2r3', source: 'R2', target: 'R3', label: '1', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
    ];
  }
  return [
    { id: 'ab', source: 'R1', target: 'R2', label: String(edgeWeights.value.ab), style: { stroke: '#64748b', strokeWidth: 2 } },
    { id: 'bc', source: 'R2', target: 'R3', label: String(edgeWeights.value.bc), style: { stroke: '#64748b', strokeWidth: 2 } },
    { id: 'ac', source: 'R1', target: 'R3', label: linkDown.value ? '✕ 断开' : String(edgeWeights.value.ac), style: { stroke: linkDown.value ? '#ef4444' : '#64748b', strokeDasharray: linkDown.value ? '5 5' : undefined, strokeWidth: 2 } },
    { id: 'cd', source: 'R3', target: 'R4', label: String(edgeWeights.value.cd), style: { stroke: '#64748b', strokeWidth: 2 } },
  ];
});

const pseudoLines = computed(() =>
  mode.value === 'rip-loop'
    ? [
        '// RIP 距离向量交换核心规则 (UDP 520, 最多15跳)',
        'sendEntireRoutingTableToNeighborsEvery30s();',
        'if (directLinkDown) metric = 16; // 无穷大不可达',
        'onReceiveEntry(N, d, sender): newD = min(16, d + 1);',
        '// 水平分割: 不从哪学来再发回去，可遏制计数到无穷',
        'if (newD < curD || nextHop == sender) update(N, newD, sender);',
      ]
    : [
        '// OSPF 链路状态协议 (直接IP封装, 协议号89)',
        'floodLSA_ToAllRoutersInArea();',
        'buildIdenticalLSDB(); // 同步全网拓扑图',
        'runDijkstraSPF(selfAsRoot) {',
        '  // 无环路且断链秒级收敛！',
        '  relaxEdgesAndBuildRoutingTable();',
        '}',
      ]
);
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :player="activePlayerBind"
    :pseudocode="pseudoLines"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <el-radio-group v-model="mode" size="small">
            <el-radio-button value="rip-loop">RIP 距离向量 & 计数到无穷 (慢收敛)</el-radio-button>
            <el-radio-button value="ospf">OSPF LSA 泛洪 & Dijkstra 收敛</el-radio-button>
          </el-radio-group>

          <div class="flex flex-wrap items-center gap-3">
            <el-switch
              v-model="linkDown"
              active-color="#ef4444"
              active-text="💥 断开主链路"
              inactive-text="链路正常"
            />
            <el-switch
              v-if="mode === 'rip-loop'"
              v-model="splitHorizon"
              active-text="开启水平分割"
              inactive-text="关闭水平分割(观察坏消息传得慢)"
            />
          </div>
        </div>

        <div v-if="mode === 'ospf'" class="mt-3 flex flex-wrap gap-3 text-xs items-center">
          <span>自定义链路代价:</span>
          <span>R1-R2: <el-input-number v-model="edgeWeights.ab" :min="1" :max="20" size="small" style="width: 78px" /></span>
          <span>R2-R3: <el-input-number v-model="edgeWeights.bc" :min="1" :max="20" size="small" style="width: 78px" /></span>
          <span>R1-R3: <el-input-number v-model="edgeWeights.ac" :min="1" :max="20" size="small" style="width: 78px" /></span>
          <span>R3-R4: <el-input-number v-model="edgeWeights.cd" :min="1" :max="20" size="small" style="width: 78px" /></span>
        </div>
      </el-card>
    </template>

    <template #stage>
      <div class="space-y-4">
        <div class="h-[270px] w-full rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950">
          <VueFlow :nodes="vfNodes" :edges="vfEdges" fit-view-on-init>
            <Background pattern-color="#cbd5e1" :gap="20" />
          </VueFlow>
        </div>

        <el-table
          v-if="mode === 'rip-loop' && ripPlayer.currentStep.value"
          :data="ripPlayer.currentStep.value.state.tables"
          size="small"
          border
          class="font-mono"
        >
          <el-table-column prop="router" label="路由器" width="90" />
          <el-table-column prop="distToNet1" label="到 Net1 跳数 (16=不可达)" />
          <el-table-column prop="nextHop" label="下一跳" />
        </el-table>

        <el-table
          v-else-if="mode === 'ospf' && ospfPlayer.currentStep.value"
          :data="
            ['R1', 'R2', 'R3', 'R4'].map((r) => ({
              dest: r,
              cost: ospfPlayer.currentStep.value!.state.dist[r],
              prev: ospfPlayer.currentStep.value!.state.parent[r],
              settled: ospfPlayer.currentStep.value!.state.settled.includes(r) ? '✓ 已确定' : '候选',
            }))
          "
          size="small"
          border
          class="font-mono"
        >
          <el-table-column prop="dest" label="目的路由器" width="100" />
          <el-table-column prop="cost" label="从 R1 出发最短代价" />
          <el-table-column prop="prev" label="前驱路由器" />
          <el-table-column prop="settled" label="SPF 树状态" />
        </el-table>
      </div>
    </template>
  </LabShell>
</template>
