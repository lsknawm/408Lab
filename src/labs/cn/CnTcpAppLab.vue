<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import EChartBox from '../../components/common/EChartBox.vue';
import { bindLabPlayer, useStepPlayer } from '../../composables/useStepPlayer';
import {
  simulateTcpCongestion,
  simulateTcpLifecycle,
  type CongestionEvent,
} from './engines/tcpEngine';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const activeTab = ref<'congestion' | 'fsm' | 'http'>('congestion');

// Tab 1: Congestion Control
const initSsthresh = ref(16);
const rwnd = ref(24);
const maxRounds = ref(22);
const tcpAlgo = ref<'Reno' | 'Tahoe'>('Reno');
const events = ref<CongestionEvent[]>([
  { round: 6, kind: '3dup' },
  { round: 14, kind: 'timeout' },
]);
const newEventRound = ref(10);
const newEventKind = ref<'timeout' | '3dup'>('3dup');

function addEvent() {
  events.value = [...events.value.filter((e) => e.round !== newEventRound.value), { round: newEventRound.value, kind: newEventKind.value }];
}
function removeEvent(round: number) {
  events.value = events.value.filter((e) => e.round !== round);
}

const congPoints = computed(() =>
  simulateTcpCongestion(initSsthresh.value, rwnd.value, maxRounds.value, tcpAlgo.value, events.value)
);

const congSteps = computed(() =>
  congPoints.value.map((pt, idx) => ({
    title: `RTT 轮次 ${pt.round}：cwnd = ${pt.cwnd} MSS, ssthresh = ${pt.ssthresh}`,
    description: pt.eventNote || `当前处于 ${pt.phase}，实际允许发送窗口 min(cwnd, rwnd) = ${pt.sendWin} MSS。`,
    codeLine: pt.eventNote?.includes('Timeout') ? 6 : pt.eventNote ? 8 : pt.cwnd < pt.ssthresh ? 3 : 4,
    state: { slice: congPoints.value.slice(0, idx + 1), cur: pt },
  }))
);

const congPlayer = useStepPlayer(congSteps, 550);

const congChartOption = computed(() => {
  const pts = congPlayer.currentStep.value?.state.slice ?? congPoints.value;
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { top: 36, bottom: 30, left: 48, right: 20 },
    xAxis: { type: 'category', data: pts.map((p) => `R${p.round}`) },
    yAxis: { type: 'value', name: '窗口大小 (MSS)' },
    series: [
      {
        name: '拥塞窗口 cwnd',
        type: 'line',
        data: pts.map((p) => p.cwnd),
        symbolSize: 8,
        lineStyle: { width: 3, color: '#4f46e5' },
        itemStyle: { color: '#4f46e5' },
      },
      {
        name: '慢开始门限 ssthresh',
        type: 'line',
        step: 'end',
        data: pts.map((p) => p.ssthresh),
        showSymbol: false,
        lineStyle: { width: 2, type: 'dashed', color: '#f59e0b' },
      },
      {
        name: '实际发送窗口 min(cwnd,rwnd)',
        type: 'line',
        data: pts.map((p) => p.sendWin),
        showSymbol: false,
        lineStyle: { width: 2, color: '#10b981' },
      },
    ],
  };
});

// Tab 2: Handshake & Teardown
const fsmScenario = ref<'handshake' | 'teardown'>('handshake');
const clientIsn = ref(100);
const serverIsn = ref(300);
const fsmSteps = computed(() => simulateTcpLifecycle(fsmScenario.value, clientIsn.value, serverIsn.value));
const fsmPlayer = useStepPlayer(fsmSteps, 1000);

// Tab 3: DNS & HTTP Timing
const rttMs = ref(20);
const embeddedObjs = ref(5);
const dnsCached = ref(false);

const httpTimings = computed(() => {
  const dnsDelay = dnsCached.value ? 0 : 4 * rttMs.value; // local->root->tld->auth iterative ≈ 4 RTT
  // HTTP/1.0 non-persistent: 2 RTT per object (1 TCP + 1 HTTP) + 2 RTT for base HTML
  const http10 = dnsDelay + (1 + embeddedObjs.value) * 2 * rttMs.value;
  // HTTP/1.1 non-pipelined persistent: 1 TCP + 1 HTML + N * 1 RTT
  const http11NoPipe = dnsDelay + (2 + embeddedObjs.value) * rttMs.value;
  // HTTP/1.1 pipelined / HTTP/2 multiplexed: 1 TCP + 1 HTML + 1 RTT all objects
  const http11Pipe = dnsDelay + 3 * rttMs.value;
  return { dnsDelay, http10, http11NoPipe, http11Pipe };
});

const httpChartOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { top: 24, bottom: 30, left: 60, right: 20 },
  xAxis: { type: 'category', data: ['HTTP/1.0 非持久', 'HTTP/1.1 持久(无流水)', 'HTTP/1.1 流水线 / HTTP/2'] },
  yAxis: { type: 'value', name: '总耗时 (ms)' },
  series: [
    {
      type: 'bar',
      barWidth: '40%',
      label: { show: true, position: 'top', formatter: '{c} ms' },
      data: [
        { value: httpTimings.value.http10, itemStyle: { color: '#ef4444' } },
        { value: httpTimings.value.http11NoPipe, itemStyle: { color: '#f59e0b' } },
        { value: httpTimings.value.http11Pipe, itemStyle: { color: '#10b981' } },
      ],
    },
  ],
}));

const activePlayerBind = computed(() => {
  if (activeTab.value === 'congestion') return bindLabPlayer(congPlayer).value;
  if (activeTab.value === 'fsm') return bindLabPlayer(fsmPlayer).value;
  return undefined;
});

const congPseudo = [
  'cwnd = 1; ssthresh = initSsthresh;',
  'for (each RTT) {',
  '  if (cwnd < ssthresh) cwnd = min(ssthresh, cwnd * 2); // 慢开始',
  '  else cwnd = cwnd + 1; // 拥塞避免',
  '  if (Timeout) {',
  '    ssthresh = max(2, cwnd/2); cwnd = 1;',
  '  } else if (3_Dup_ACK) {',
  '    ssthresh = max(2, cwnd/2); cwnd = (Reno ? ssthresh : 1);',
  '  }',
  '}',
];
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :player="activePlayerBind"
    :pseudocode="activeTab === 'congestion' ? congPseudo : []"
    code-title="TCP 拥塞控制状态机逻辑"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <el-tabs v-model="activeTab" class="!mb-0">
          <el-tab-pane label="TCP 拥塞控制曲线 (注入丢包)" name="congestion">
            <div class="space-y-2.5">
              <div class="flex flex-wrap items-center gap-3 text-xs">
                <el-radio-group v-model="tcpAlgo" size="small">
                  <el-radio-button value="Reno">TCP Reno (含快恢复)</el-radio-button>
                  <el-radio-button value="Tahoe">TCP Tahoe (无快恢复)</el-radio-button>
                </el-radio-group>
                <span>初始 ssthresh: <el-input-number v-model="initSsthresh" :min="4" :max="64" size="small" style="width: 82px" /></span>
                <span>接收窗口 rwnd: <el-input-number v-model="rwnd" :min="4" :max="64" size="small" style="width: 82px" /></span>
                <span>总轮次: <el-input-number v-model="maxRounds" :min="8" :max="35" size="small" style="width: 82px" /></span>
              </div>

              <div class="flex flex-wrap items-center gap-2 text-xs">
                <span class="font-semibold text-slate-500">丢包/拥塞事件注入:</span>
                <el-input-number v-model="newEventRound" :min="2" :max="maxRounds" size="small" style="width: 82px" />
                <el-select v-model="newEventKind" size="small" style="width: 145px">
                  <el-option value="3dup" label="3 个重复 ACK" />
                  <el-option value="timeout" label="超时 Timeout" />
                </el-select>
                <el-button type="primary" size="small" @click="addEvent">+ 注入事件</el-button>

                <el-tag
                  v-for="ev in events"
                  :key="ev.round"
                  :type="ev.kind === 'timeout' ? 'danger' : 'warning'"
                  closable
                  @close="removeEvent(ev.round)"
                >
                  R{{ ev.round }}: {{ ev.kind === 'timeout' ? 'Timeout' : '3-Dup ACK' }}
                </el-tag>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="TCP 三次握手与四次挥手泳道" name="fsm">
            <div class="flex flex-wrap items-center gap-3 text-xs">
              <el-radio-group v-model="fsmScenario" size="small">
                <el-radio-button value="handshake">三次握手建立连接</el-radio-button>
                <el-radio-button value="teardown">四次挥手释放连接 (含半关闭 & 2MSL)</el-radio-button>
              </el-radio-group>
              <span>Client ISN (x): <el-input-number v-model="clientIsn" :min="0" :max="1000" size="small" style="width: 88px" /></span>
              <span>Server ISN (y): <el-input-number v-model="serverIsn" :min="0" :max="1000" size="small" style="width: 88px" /></span>
            </div>
          </el-tab-pane>

          <el-tab-pane label="DNS 解析 & HTTP/1.0·1.1·2.0 耗时对比" name="http">
            <div class="flex flex-wrap items-center gap-4 text-xs">
              <span>网络 RTT (ms): <el-input-number v-model="rttMs" :min="2" :max="200" size="small" style="width: 90px" /></span>
              <span>内嵌对象数 N: <el-input-number v-model="embeddedObjs" :min="0" :max="20" size="small" style="width: 85px" /></span>
              <el-switch
                v-model="dnsCached"
                active-text="本地 DNS 缓存命中 (0ms)"
                inactive-text="未命中: 迭代查询约 4 RTT"
              />
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <template #stage>
      <!-- Stage 1: Congestion Chart -->
      <div v-if="activeTab === 'congestion'" class="space-y-3">
        <EChartBox :option="congChartOption" height="330px" />
      </div>

      <!-- Stage 2: TCP Handshake/Teardown Swimlane -->
      <div v-else-if="activeTab === 'fsm' && fsmPlayer.currentStep.value" class="space-y-4">
        <div class="grid grid-cols-2 gap-4 text-center">
          <div class="p-3 rounded-xl border-2 border-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/30">
            <div class="text-xs text-slate-500">客户端 Client 状态</div>
            <div class="font-mono font-bold text-base text-indigo-600 dark:text-indigo-300">
              {{ fsmPlayer.currentStep.value.state.clientState }}
            </div>
          </div>
          <div class="p-3 rounded-xl border-2 border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/30">
            <div class="text-xs text-slate-500">服务端 Server 状态</div>
            <div class="font-mono font-bold text-base text-emerald-600 dark:text-emerald-300">
              {{ fsmPlayer.currentStep.value.state.serverState }}
            </div>
          </div>
        </div>

        <div class="space-y-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 min-h-[200px]">
          <div
            v-for="(msg, idx) in fsmPlayer.currentStep.value.state.messages"
            :key="idx"
            :class="[
              'flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs font-mono',
              msg.from === 'Client'
                ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
            ]"
          >
            <span class="font-bold">{{ msg.from === 'Client' ? 'Client ────▶ Server' : 'Client ◀──── Server' }}</span>
            <span class="font-bold text-slate-800 dark:text-slate-100">
              [{{ msg.flags }}] seq={{ msg.seq }} {{ msg.ack !== undefined ? `ack=${msg.ack}` : '' }}
            </span>
            <span class="text-slate-500">{{ msg.note }}</span>
          </div>
          <div v-if="fsmPlayer.currentStep.value.state.messages.length === 0" class="text-center text-xs text-slate-400 py-10">
            点击下方播放或下一步观察报文交换
          </div>
        </div>
      </div>

      <!-- Stage 3: HTTP/DNS -->
      <div v-else class="space-y-3">
        <div class="flex flex-wrap gap-2 font-mono text-xs">
          <el-tag type="info">DNS 解析耗时: {{ httpTimings.dnsDelay }} ms</el-tag>
          <el-tag type="danger">HTTP/1.0 总耗时: {{ httpTimings.http10 }} ms</el-tag>
          <el-tag type="warning">HTTP/1.1 无流水: {{ httpTimings.http11NoPipe }} ms</el-tag>
          <el-tag type="success">HTTP/1.1 流水/HTTP2: {{ httpTimings.http11Pipe }} ms</el-tag>
        </div>
        <EChartBox :option="httpChartOption" height="300px" />
      </div>
    </template>
  </LabShell>
</template>
