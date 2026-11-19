<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import { ElMessage } from 'element-plus';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

type ArqMode = 'SW' | 'GBN' | 'SR';
const mode = ref<ArqMode>('GBN');
const seqBits = ref(3); // 2^3 = 8 seq numbers: 0..7
const wt = ref(4);
const wr = ref(1);

const seqSpace = computed(() => Math.pow(2, seqBits.value));

watch(mode, (m) => {
  if (m === 'SW') {
    wt.value = 1;
    wr.value = 1;
  } else if (m === 'GBN') {
    wt.value = Math.min(4, seqSpace.value - 1);
    wr.value = 1;
  } else {
    wt.value = Math.min(4, Math.floor(seqSpace.value / 2));
    wr.value = wt.value;
  }
  resetArq();
});

const windowValid = computed(() => {
  if (mode.value === 'SW') return wt.value === 1 && wr.value === 1;
  if (mode.value === 'GBN') return wt.value <= seqSpace.value - 1 && wr.value === 1;
  return wt.value + wr.value <= seqSpace.value;
});

interface InFlightPacket {
  uid: number;
  kind: 'DATA' | 'ACK';
  seq: number;
  absIdx: number;
  status: 'flying' | 'delivered' | 'lost';
}

const arq = reactive({
  sendBase: 0,
  nextSeq: 0,
  rcvBase: 0,
  totalFrames: 12,
  ackedAbs: new Set<number>(),
  rcvBufferedAbs: new Set<number>(),
  inFlight: [] as InFlightPacket[],
  uidSeq: 1,
  logs: ['系统初始化就绪：点击【发送方发出新帧】，然后手动控制空中数据包送达或点击丢包测试！'] as string[],
});

function resetArq() {
  arq.sendBase = 0;
  arq.nextSeq = 0;
  arq.rcvBase = 0;
  arq.ackedAbs = new Set();
  arq.rcvBufferedAbs = new Set();
  arq.inFlight = [];
  arq.logs = [`已重置 ${mode.value} 协议（序号空间 0..${seqSpace.value - 1}, W_T=${wt.value}, W_R=${wr.value}）。`];
}

function sendNextFrame() {
  if (arq.nextSeq - arq.sendBase >= wt.value) {
    ElMessage.warning('发送窗口已满！请等待接收方确认或触发超时重传。');
    return;
  }
  if (arq.nextSeq >= arq.totalFrames) {
    ElMessage.info('所有测试帧已全部发送！');
    return;
  }
  const absIdx = arq.nextSeq;
  const seq = absIdx % seqSpace.value;
  arq.nextSeq++;
  arq.inFlight.push({ uid: arq.uidSeq++, kind: 'DATA', seq, absIdx, status: 'flying' });
  arq.logs.unshift(`发送方发出帧 #${absIdx} (Seq=${seq})，发送窗口 [${arq.sendBase} .. ${arq.sendBase + wt.value - 1}]`);
}

function deliverPacket(pkt: InFlightPacket) {
  if (pkt.status !== 'flying') return;
  pkt.status = 'delivered';

  if (pkt.kind === 'DATA') {
    if (mode.value === 'SW' || mode.value === 'GBN') {
      if (pkt.absIdx === arq.rcvBase) {
        arq.rcvBase++;
        arq.logs.unshift(`接收方按序收到帧 #${pkt.absIdx} (Seq=${pkt.seq})，交付上层并回发 ACK(Seq=${pkt.seq})。`);
        arq.inFlight.push({
          uid: arq.uidSeq++,
          kind: 'ACK',
          seq: pkt.seq,
          absIdx: pkt.absIdx,
          status: 'flying',
        });
      } else {
        const lastOk = arq.rcvBase - 1;
        arq.logs.unshift(
          `⚠️ 接收方期望 #${arq.rcvBase}，但收到乱序帧 #${pkt.absIdx} → ${
            mode.value === 'GBN' ? '直接丢弃，重复发送对最新按序帧的 ACK！' : '丢弃'
          }`
        );
        if (lastOk >= 0) {
          arq.inFlight.push({
            uid: arq.uidSeq++,
            kind: 'ACK',
            seq: lastOk % seqSpace.value,
            absIdx: lastOk,
            status: 'flying',
          });
        }
      }
    } else {
      // SR
      if (pkt.absIdx >= arq.rcvBase && pkt.absIdx < arq.rcvBase + wr.value) {
        arq.rcvBufferedAbs.add(pkt.absIdx);
        let advanced = 0;
        while (arq.rcvBufferedAbs.has(arq.rcvBase)) {
          arq.rcvBufferedAbs.delete(arq.rcvBase);
          arq.rcvBase++;
          advanced++;
        }
        arq.logs.unshift(
          `[SR] 接收方缓存帧 #${pkt.absIdx} (Seq=${pkt.seq}) 并发独立 ACK(${pkt.seq})${
            advanced > 0 ? `，接收窗口前滑 ${advanced} 格至 #${arq.rcvBase}` : '（乱序缓存等待前驱）'
          }`
        );
        arq.inFlight.push({
          uid: arq.uidSeq++,
          kind: 'ACK',
          seq: pkt.seq,
          absIdx: pkt.absIdx,
          status: 'flying',
        });
      }
    }
  } else {
    // ACK arrives at sender
    if (mode.value === 'GBN' || mode.value === 'SW') {
      if (pkt.absIdx >= arq.sendBase) {
        for (let k = arq.sendBase; k <= pkt.absIdx; k++) {
          arq.ackedAbs.add(k);
        }
        arq.sendBase = pkt.absIdx + 1;
        arq.logs.unshift(
          `✓ 发送方收到 ACK(Seq=${pkt.seq}) → 累计确认至 #${pkt.absIdx}，发送窗口左沿滑动至 #${arq.sendBase}！`
        );
      } else {
        arq.logs.unshift(`发送方收到重复 ACK(Seq=${pkt.seq})，忽略。`);
      }
    } else {
      // SR ACK
      arq.ackedAbs.add(pkt.absIdx);
      let slid = 0;
      while (arq.ackedAbs.has(arq.sendBase)) {
        arq.sendBase++;
        slid++;
      }
      arq.logs.unshift(
        `[SR] 收到独立 ACK(${pkt.seq}) 标记 #${pkt.absIdx} 已确认${
          slid > 0 ? `，发送窗口前滑 ${slid} 格至 #${arq.sendBase}` : '（等待最老帧确认才能滑窗）'
        }`
      );
    }
  }
}

function losePacket(pkt: InFlightPacket) {
  if (pkt.status !== 'flying') return;
  pkt.status = 'lost';
  arq.logs.unshift(`💥 ${pkt.kind === 'DATA' ? '数据帧' : 'ACK'} #${pkt.absIdx} (Seq=${pkt.seq}) 在信道中丢失！`);
}

function triggerTimeout() {
  if (arq.sendBase >= arq.nextSeq) {
    ElMessage.info('当前没有已发送未确认的在途帧。');
    return;
  }
  if (mode.value === 'GBN' || mode.value === 'SW') {
    arq.logs.unshift(
      `⏰ 超时触发！[GBN 回退 N 帧] 重传窗口内所有未确认帧：#${arq.sendBase} .. #${arq.nextSeq - 1}`
    );
    for (let k = arq.sendBase; k < arq.nextSeq; k++) {
      arq.inFlight.push({
        uid: arq.uidSeq++,
        kind: 'DATA',
        seq: k % seqSpace.value,
        absIdx: k,
        status: 'flying',
      });
    }
  } else {
    // SR: only retransmit unacked frames (specifically sendBase, or all unacked)
    const target = arq.sendBase;
    arq.inFlight.push({
      uid: arq.uidSeq++,
      kind: 'DATA',
      seq: target % seqSpace.value,
      absIdx: target,
      status: 'flying',
    });
    arq.logs.unshift(`⏰ 超时触发！[SR 选择重传] 仅重传最老未确认帧 #${target} (Seq=${target % seqSpace.value})！`);
  }
}

const flyingPackets = computed(() => arq.inFlight.filter((p) => p.status === 'flying'));
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <div class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <el-radio-group v-model="mode" size="small">
              <el-radio-button value="SW">停等协议 (W_T=1, W_R=1)</el-radio-button>
              <el-radio-button value="GBN">GBN 后退 N 帧 (累计确认)</el-radio-button>
              <el-radio-button value="SR">SR 选择重传 (缓存乱序)</el-radio-button>
            </el-radio-group>

            <div class="flex flex-wrap items-center gap-3 text-xs">
              <span>序号位数 k: <el-input-number v-model="seqBits" :min="2" :max="4" size="small" style="width: 78px" @change="resetArq" /></span>
              <span>W_T: <el-input-number v-model="wt" :min="1" :max="seqSpace" :disabled="mode === 'SW'" size="small" style="width: 78px" /></span>
              <span>W_R: <el-input-number v-model="wr" :min="1" :max="seqSpace" :disabled="mode !== 'SR'" size="small" style="width: 78px" /></span>
            </div>
          </div>

          <el-alert
            v-if="!windowValid"
            type="error"
            effect="dark"
            :closable="false"
            title="⚠️ 窗口大小超限！违反防序号混叠条件！"
            :description="
              mode === 'GBN'
                ? `GBN 要求 W_T <= 2^k - 1 = ${seqSpace - 1}，否则发送方无法区分新帧与全部 ACK 丢失后的旧帧重传！`
                : `SR 要求 W_T + W_R <= 2^k = ${seqSpace}！`
            "
          />

          <div class="flex flex-wrap gap-2">
            <el-button type="primary" size="small" @click="sendNextFrame">发送方：发出下一帧</el-button>
            <el-button type="warning" size="small" @click="triggerTimeout">触发超时重传 (Timeout)</el-button>
            <el-button size="small" @click="resetArq">重置链路</el-button>
          </div>
        </div>
      </el-card>
    </template>

    <template #stage>
      <div class="space-y-4">
        <!-- Sender & Receiver Window Strips -->
        <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-3">
          <div>
            <div class="text-xs font-semibold text-indigo-600 dark:text-indigo-300 mb-1.5">
              发送方窗口 [{{ arq.sendBase }} .. {{ arq.sendBase + wt - 1 }}] (蓝框为当前发送窗口)
            </div>
            <div class="flex flex-wrap gap-1.5 font-mono text-xs">
              <div
                v-for="idx in arq.totalFrames"
                :key="idx"
                :class="[
                  'w-12 py-1.5 rounded-lg text-center border-2 transition-all',
                  idx - 1 >= arq.sendBase && idx - 1 < arq.sendBase + wt
                    ? 'border-indigo-500 ring-2 ring-indigo-300/40'
                    : 'border-slate-200 dark:border-slate-700',
                  arq.ackedAbs.has(idx - 1)
                    ? 'bg-emerald-500 text-white'
                    : idx - 1 < arq.nextSeq
                      ? 'bg-amber-500 text-white'
                      : 'bg-white dark:bg-slate-800',
                ]"
              >
                <div class="font-bold">#{{ idx - 1 }}</div>
                <div class="text-[10px]">S={{ (idx - 1) % seqSpace }}</div>
              </div>
            </div>
          </div>

          <div>
            <div class="text-xs font-semibold text-emerald-600 dark:text-emerald-300 mb-1.5">
              接收方窗口 [{{ arq.rcvBase }} .. {{ arq.rcvBase + wr - 1 }}] (绿框为当前期望/可接收窗口)
            </div>
            <div class="flex flex-wrap gap-1.5 font-mono text-xs">
              <div
                v-for="idx in arq.totalFrames"
                :key="idx"
                :class="[
                  'w-12 py-1.5 rounded-lg text-center border-2 transition-all',
                  idx - 1 >= arq.rcvBase && idx - 1 < arq.rcvBase + wr
                    ? 'border-emerald-500 ring-2 ring-emerald-300/40'
                    : 'border-slate-200 dark:border-slate-700',
                  idx - 1 < arq.rcvBase
                    ? 'bg-emerald-600 text-white'
                    : arq.rcvBufferedAbs.has(idx - 1)
                      ? 'bg-cyan-500 text-white'
                      : 'bg-white dark:bg-slate-800',
                ]"
              >
                <div class="font-bold">#{{ idx - 1 }}</div>
                <div class="text-[10px]">S={{ (idx - 1) % seqSpace }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- In-flight interactive channel -->
        <el-card shadow="never" class="!rounded-xl border-indigo-200 dark:border-indigo-900">
          <template #header>
            <div class="flex items-center justify-between text-xs font-semibold">
              <span>传输信道在途报文 ({{ flyingPackets.length }} 个在途，点击决定送达或丢包！)</span>
            </div>
          </template>
          <div v-if="flyingPackets.length === 0" class="text-xs text-slate-400 py-3 text-center">
            信道空闲 — 请点击上方【发送方：发出下一帧】
          </div>
          <div v-else class="flex flex-wrap gap-2.5">
            <div
              v-for="pkt in flyingPackets"
              :key="pkt.uid"
              class="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center gap-2"
            >
              <el-tag :type="pkt.kind === 'DATA' ? 'primary' : 'success'" effect="dark" class="font-mono">
                {{ pkt.kind }} #{{ pkt.absIdx }} (Seq={{ pkt.seq }})
              </el-tag>
              <el-button size="small" type="success" plain @click="deliverPacket(pkt)">✓ 正常到达</el-button>
              <el-button size="small" type="danger" plain @click="losePacket(pkt)">💥 丢包</el-button>
            </div>
          </div>
        </el-card>

        <!-- Logs -->
        <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 max-h-[150px] overflow-y-auto space-y-1 text-xs font-mono">
          <div v-for="(l, i) in arq.logs" :key="i">• {{ l }}</div>
        </div>
      </div>
    </template>
  </LabShell>
</template>
