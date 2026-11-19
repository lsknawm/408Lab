<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { VueFlow, type Node, type Edge } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const activeTab = ref<'switch' | 'csmacd'>('switch');

type DevType = 'HOST' | 'HUB' | 'SWITCH' | 'ROUTER';
interface NetDevice {
  id: string;
  type: DevType;
  label: string;
  mac?: string;
  x: number;
  y: number;
}
interface NetLink {
  id: string;
  a: string;
  b: string;
}

const devices = ref<NetDevice[]>([
  { id: 'SW1', type: 'SWITCH', label: 'Switch 1', x: 220, y: 120 },
  { id: 'HUB1', type: 'HUB', label: 'Hub 1', x: 90, y: 240 },
  { id: 'H_A', type: 'HOST', label: '主机 A (MAC:AA)', mac: 'AA', x: 20, y: 340 },
  { id: 'H_B', type: 'HOST', label: '主机 B (MAC:BB)', mac: 'BB', x: 140, y: 340 },
  { id: 'H_C', type: 'HOST', label: '主机 C (MAC:CC)', mac: 'CC', x: 270, y: 240 },
  { id: 'R1', type: 'ROUTER', label: 'Router 路由器', x: 370, y: 120 },
  { id: 'SW2', type: 'SWITCH', label: 'Switch 2', x: 510, y: 120 },
  { id: 'H_D', type: 'HOST', label: '主机 D (MAC:DD)', mac: 'DD', x: 460, y: 240 },
  { id: 'H_E', type: 'HOST', label: '主机 E (MAC:EE)', mac: 'EE', x: 570, y: 240 },
]);

const links = ref<NetLink[]>([
  { id: 'l1', a: 'SW1', b: 'HUB1' },
  { id: 'l2', a: 'HUB1', b: 'H_A' },
  { id: 'l3', a: 'HUB1', b: 'H_B' },
  { id: 'l4', a: 'SW1', b: 'H_C' },
  { id: 'l5', a: 'SW1', b: 'R1' },
  { id: 'l6', a: 'R1', b: 'SW2' },
  { id: 'l7', a: 'SW2', b: 'H_D' },
  { id: 'l8', a: 'SW2', b: 'H_E' },
]);

// Switch MAC table: switchId -> { mac: nextHopDeviceId }
const macTables = reactive<Record<string, Record<string, string>>>({
  SW1: {},
  SW2: {},
});

const hosts = computed(() => devices.value.filter((d) => d.type === 'HOST'));
const srcHost = ref('H_A');
const dstHost = ref('H_C');
const activeLinkIds = ref<string[]>([]);
const activeDevIds = ref<string[]>([]);
const simLogs = ref<string[]>(['就绪：选择源主机与目的主机发送以太网帧，观察交换机 MAC 地址表自学习与泛洪/单播转发！']);

// Add custom host to a switch or hub
const newHostParent = ref('SW1');
function addCustomHost() {
  const idx = hosts.value.length + 1;
  const ch = String.fromCharCode(64 + idx);
  const id = `H_${ch}${idx}`;
  const mac = `${ch}${ch}`;
  const parent = devices.value.find((d) => d.id === newHostParent.value);
  devices.value.push({
    id,
    type: 'HOST',
    label: `主机 ${ch}${idx} (${mac})`,
    mac,
    x: (parent?.x ?? 250) + ((idx % 3) - 1) * 70,
    y: (parent?.y ?? 200) + 100,
  });
  links.value.push({ id: `l_${Date.now()}`, a: newHostParent.value, b: id });
}

// Graph analysis for Collision Domains & Broadcast Domains
const domainCounts = computed(() => {
  // Broadcast domains: connected components when removing ROUTER nodes
  const nonRouters = devices.value.filter((d) => d.type !== 'ROUTER').map((d) => d.id);
  const visitedBd = new Set<string>();
  let broadcastDomains = 0;
  for (const id of nonRouters) {
    if (visitedBd.has(id)) continue;
    broadcastDomains++;
    const q = [id];
    visitedBd.add(id);
    while (q.length > 0) {
      const u = q.shift()!;
      for (const l of links.value) {
        const nb = l.a === u ? l.b : l.b === u ? l.a : null;
        if (nb && nonRouters.includes(nb) && !visitedBd.has(nb)) {
          visitedBd.add(nb);
          q.push(nb);
        }
      }
    }
  }

  // Collision domains: connected components when collapsing HUBs (bridges/switches/routers isolate collision domains on each link!)
  // Wait: every non-hub link or hub-star group is 1 collision domain!
  // Let's model accurately: contract all HUB edges, then each remaining edge between non-hubs (or a hub component + its attached hosts) is 1 collision domain!
  const visitedHub = new Set<string>();
  let collisionDomains = 0;
  const hubAttachedLinks = new Set<string>();

  for (const d of devices.value) {
    if (d.type === 'HUB' && !visitedHub.has(d.id)) {
      collisionDomains++;
      const q = [d.id];
      visitedHub.add(d.id);
      while (q.length > 0) {
        const u = q.shift()!;
        for (const l of links.value) {
          const nb = l.a === u ? l.b : l.b === u ? l.a : null;
          if (nb) {
            hubAttachedLinks.add(l.id);
            const nbDev = devices.value.find((x) => x.id === nb);
            if (nbDev?.type === 'HUB' && !visitedHub.has(nb)) {
              visitedHub.add(nb);
              q.push(nb);
            }
          }
        }
      }
    }
  }

  // Any link not touching any HUB is its own point-to-point collision domain
  for (const l of links.value) {
    if (!hubAttachedLinks.has(l.id)) collisionDomains++;
  }

  return { broadcastDomains, collisionDomains };
});

function sendFrame() {
  const s = devices.value.find((d) => d.id === srcHost.value);
  const d = devices.value.find((x) => x.id === dstHost.value);
  if (!s || !d || s.id === d.id) return;

  const srcMac = s.mac || s.id;
  const dstMac = d.mac || d.id;
  const touchedLinks = new Set<string>();
  const touchedDevs = new Set<string>([s.id]);
  const logs: string[] = [`📤 ${s.label} 发送帧 [Src=${srcMac}, Dst=${dstMac}]`];

  // BFS/DFS propagation within L2 domain (stops at Router unless unicast destination is across? Note Switch L2 forwarding stops at Router if Dst is not Router!)
  // Here let's simulate L2 switch self-learning inside the L2 segment containing src, and note if dst is in another broadcast domain!
  const q: Array<{ curId: string; prevId: string | null }> = [{ curId: s.id, prevId: null }];
  const seen = new Set<string>([s.id]);

  while (q.length > 0) {
    const { curId, prevId } = q.shift()!;
    const dev = devices.value.find((x) => x.id === curId)!;
    const neighbors = links.value
      .filter((l) => l.a === curId || l.b === curId)
      .map((l) => ({ linkId: l.id, nbId: l.a === curId ? l.b : l.a }));

    if (dev.type === 'HOST') {
      if (dev.id === d.id && prevId !== null) {
        logs.push(`✅ 目的主机 ${dev.label} 成功收到该数据帧！`);
      } else if (prevId === null) {
        for (const n of neighbors) {
          touchedLinks.add(n.linkId);
          touchedDevs.add(n.nbId);
          if (!seen.has(n.nbId)) {
            seen.add(n.nbId);
            q.push({ curId: n.nbId, prevId: curId });
          }
        }
      }
    } else if (dev.type === 'HUB') {
      logs.push(`🔊 ${dev.label} (物理层设备) 向除入端口外的全部端口广播转发`);
      for (const n of neighbors) {
        if (n.nbId === prevId) continue;
        touchedLinks.add(n.linkId);
        touchedDevs.add(n.nbId);
        if (!seen.has(n.nbId)) {
          seen.add(n.nbId);
          q.push({ curId: n.nbId, prevId: curId });
        }
      }
    } else if (dev.type === 'SWITCH') {
      if (!macTables[dev.id]) macTables[dev.id] = {};
      if (prevId) {
        macTables[dev.id][srcMac] = prevId;
        logs.push(`📝 ${dev.label} 自学习：记录 MAC=${srcMac} → 接自端口(${prevId})`);
      }
      const outHop = macTables[dev.id][dstMac];
      if (outHop) {
        if (outHop === prevId) {
          logs.push(`🗑️ ${dev.label} 查表发现目的 ${dstMac} 就在入端口 (${outHop}) 同侧，丢弃不转发！`);
        } else {
          logs.push(`🎯 ${dev.label} 查表命中 ${dstMac} → 精准单播转发至 (${outHop})！`);
          const targetLink = neighbors.find((n) => n.nbId === outHop);
          if (targetLink) {
            touchedLinks.add(targetLink.linkId);
            touchedDevs.add(outHop);
            if (!seen.has(outHop)) {
              seen.add(outHop);
              q.push({ curId: outHop, prevId: curId });
            }
          }
        }
      } else {
        logs.push(`📡 ${dev.label} 表中无 ${dstMac}，执行未知单播泛洪（除入端口外全转发）`);
        for (const n of neighbors) {
          if (n.nbId === prevId) continue;
          touchedLinks.add(n.linkId);
          touchedDevs.add(n.nbId);
          if (!seen.has(n.nbId)) {
            seen.add(n.nbId);
            q.push({ curId: n.nbId, prevId: curId });
          }
        }
      }
    } else if (dev.type === 'ROUTER') {
      logs.push(`🧱 ${dev.label} 隔离二层广播/泛洪域！若跨网段需三层 IP 路由转发。`);
    }
  }

  activeLinkIds.value = Array.from(touchedLinks);
  activeDevIds.value = Array.from(touchedDevs);
  simLogs.value = logs;
}

function clearMacTables() {
  Object.keys(macTables).forEach((k) => (macTables[k] = {}));
  activeLinkIds.value = [];
  activeDevIds.value = [];
  simLogs.value = ['已清空所有交换机 MAC 地址表，可重新观察首次泛洪与自学习过程。'];
}

const macTableRows = computed(() => {
  const rows: Array<{ sw: string; mac: string; port: string }> = [];
  for (const [sw, tbl] of Object.entries(macTables)) {
    for (const [mac, port] of Object.entries(tbl)) {
      rows.push({ sw, mac, port });
    }
  }
  return rows;
});

const vfNodes = computed<Node[]>(() => {
  const act = new Set(activeDevIds.value);
  return devices.value.map((d) => ({
    id: d.id,
    label: d.label,
    position: { x: d.x, y: d.y },
    style: {
      padding: '7px 10px',
      borderRadius: d.type === 'ROUTER' ? '9999px' : '8px',
      fontSize: '11px',
      fontWeight: 'bold',
      background: act.has(d.id)
        ? '#4f46e5'
        : d.type === 'ROUTER'
          ? '#f59e0b'
          : d.type === 'SWITCH'
            ? '#0ea5e9'
            : d.type === 'HUB'
              ? '#64748b'
              : '#ffffff',
      color: act.has(d.id) || d.type !== 'HOST' ? '#ffffff' : '#0f172a',
      border: act.has(d.id) ? '3px solid #f59e0b' : '1.5px solid #475569',
    },
  }));
});

const vfEdges = computed<Edge[]>(() => {
  const act = new Set(activeLinkIds.value);
  return links.value.map((l) => ({
    id: l.id,
    source: l.a,
    target: l.b,
    animated: act.has(l.id),
    style: {
      stroke: act.has(l.id) ? '#ef4444' : '#94a3b8',
      strokeWidth: act.has(l.id) ? 3 : 1.6,
    },
  }));
});

// Tab 2: CSMA/CD
const busDistM = ref(1000);
const rateMbps = ref(10);
const propSpeed = ref(200); // m / us (2e8 m/s)
const collCount = ref(2);

const csmaRes = computed(() => {
  const tauUs = busDistM.value / propSpeed.value; // microseconds
  const contentionUs = 2 * tauUs;
  const minFrameBits = Math.ceil(contentionUs * rateMbps.value);
  const minFrameBytes = Math.ceil(minFrameBits / 8);
  const k = Math.min(collCount.value, 10);
  const maxR = Math.pow(2, k) - 1;
  return {
    tauUs: tauUs.toFixed(2),
    contentionUs: contentionUs.toFixed(2),
    minFrameBits,
    minFrameBytes,
    k,
    maxR,
    maxBackoffUs: (maxR * contentionUs).toFixed(2),
  };
});
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :has-inspector="activeTab === 'switch'"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <el-tabs v-model="activeTab" class="!mb-0">
          <el-tab-pane label="交换机 MAC 表自学习与广播/冲突域" name="switch">
            <div class="flex flex-wrap items-center justify-between gap-2.5">
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <span>源主机:</span>
                <el-select v-model="srcHost" size="small" style="width: 120px">
                  <el-option v-for="h in hosts" :key="h.id" :label="h.label" :value="h.id" />
                </el-select>
                <span>目的主机:</span>
                <el-select v-model="dstHost" size="small" style="width: 120px">
                  <el-option v-for="h in hosts" :key="h.id" :label="h.label" :value="h.id" />
                </el-select>
                <el-button type="primary" size="small" @click="sendFrame">发送帧并自学习</el-button>
                <el-button size="small" @click="clearMacTables">清空 MAC 表</el-button>
              </div>

              <div class="flex items-center gap-1.5 text-xs">
                <span>加主机到:</span>
                <el-select v-model="newHostParent" size="small" style="width: 98px">
                  <el-option
                    v-for="d in devices.filter((x) => x.type === 'SWITCH' || x.type === 'HUB')"
                    :key="d.id"
                    :label="d.label"
                    :value="d.id"
                  />
                </el-select>
                <el-button size="small" type="success" plain @click="addCustomHost">+ 添加主机</el-button>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="CSMA/CD 争用期、最小帧长与指数退避" name="csmacd">
            <div class="flex flex-wrap items-center gap-4 text-xs">
              <span>最大端到端距离 D (m): <el-input-number v-model="busDistM" :min="100" :max="10000" :step="100" size="small" style="width: 105px" /></span>
              <span>带宽速率 R (Mbps): <el-input-number v-model="rateMbps" :min="1" :max="1000" size="small" style="width: 95px" /></span>
              <span>传播速度 v (m/μs): <el-input-number v-model="propSpeed" :min="100" :max="300" size="small" style="width: 95px" /></span>
              <span>碰撞重传次数 c: <el-input-number v-model="collCount" :min="1" :max="16" size="small" style="width: 85px" /></span>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <template #stage>
      <!-- Stage 1: Switch Topology -->
      <div v-if="activeTab === 'switch'" class="space-y-3">
        <div class="flex flex-wrap gap-2">
          <el-tag type="danger" effect="dark">当前拓扑冲突域数 = {{ domainCounts.collisionDomains }}</el-tag>
          <el-tag type="warning" effect="dark">当前拓扑广播域数 = {{ domainCounts.broadcastDomains }}</el-tag>
          <span class="text-xs text-slate-500">蓝=交换机 (隔离冲突域不隔广播域) · 灰=集线器 Hub (不隔任何域) · 橙=路由器 (隔离广播域)</span>
        </div>

        <div class="h-[340px] w-full rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950">
          <VueFlow :nodes="vfNodes" :edges="vfEdges" fit-view-on-init>
            <Background pattern-color="#cbd5e1" :gap="20" />
          </VueFlow>
        </div>

        <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-1 text-xs font-mono">
          <div v-for="(l, i) in simLogs" :key="i">{{ l }}</div>
        </div>
      </div>

      <!-- Stage 2: CSMA/CD -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono">
        <el-card shadow="never" class="!bg-indigo-50/40 dark:!bg-indigo-950/20">
          <div class="text-xs text-slate-500">单程传播时延 τ = D / v</div>
          <div class="text-2xl font-bold text-indigo-600 my-1">{{ csmaRes.tauUs }} μs</div>
          <div class="text-xs text-slate-400">争用期 (2τ) = {{ csmaRes.contentionUs }} μs</div>
        </el-card>

        <el-card shadow="never" class="!bg-emerald-50/40 dark:!bg-emerald-950/20">
          <div class="text-xs text-slate-500">最小帧长 L_min = 2τ × R</div>
          <div class="text-2xl font-bold text-emerald-600 my-1">{{ csmaRes.minFrameBits }} bit ({{ csmaRes.minFrameBytes }} B)</div>
          <div class="text-xs text-slate-400">只有发送耗时 ≥ 2τ，才能保证冲突信号传回前仍在发送！</div>
        </el-card>

        <el-card shadow="never" class="sm:col-span-2 !bg-amber-50/40 dark:!bg-amber-950/20">
          <div class="text-xs text-slate-500 mb-1">第 {{ collCount }} 次碰撞的二进制指数退避区间</div>
          <div class="text-sm font-bold text-amber-700 dark:text-amber-300">
            k = min({{ collCount }}, 10) = {{ csmaRes.k }} → 从集合 { 0, 1, ..., {{ csmaRes.maxR }} } 中随机取 r 倍争用期
            （最大退避 {{ csmaRes.maxBackoffUs }} μs）
          </div>
          <div v-if="collCount >= 16" class="text-xs text-rose-600 font-bold mt-1">
            ⚠️ 达到重传上限 16 次：停止重传并向高层报告错误！
          </div>
        </el-card>
      </div>
    </template>

    <template #inspector>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <template #header>
          <span class="text-xs font-semibold">交换机自学习 MAC 地址转发表</span>
        </template>
        <el-table :data="macTableRows" size="small" border empty-text="尚未学习到任何 MAC 记录（请先发包）">
          <el-table-column prop="sw" label="交换机" width="75" />
          <el-table-column prop="mac" label="学习到的源MAC" width="110" />
          <el-table-column prop="port" label="对应接出端口" />
        </el-table>
      </el-card>
    </template>
  </LabShell>
</template>
