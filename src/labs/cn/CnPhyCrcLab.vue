<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import EChartBox from '../../components/common/EChartBox.vue';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const activeTab = ref<'wave' | 'crc' | 'channel'>('wave');

// Tab 1: Line Encoding
const bitStream = ref('10110010');
const ieeeConvention = ref(true); // IEEE: 1=High->Low, 0=Low->High

const cleanedBits = computed(() => {
  const b = bitStream.value.replace(/[^01]/g, '');
  return b.length > 0 ? b.slice(0, 16) : '10110010';
});

const waveChartOption = computed(() => {
  const bits = cleanedBits.value.split('');
  const halfTicks: string[] = [];
  const nrz: number[] = [];
  const manch: number[] = [];
  const diffManch: number[] = [];
  const ami: number[] = [];

  let diffLevel = 1; // level before bit boundary
  let amiPolarity = 1;

  bits.forEach((b, idx) => {
    halfTicks.push(`${idx}(${b})`, `${idx}.5`);
    const vNrz = b === '1' ? 1 : -1;
    nrz.push(vNrz + 6, vNrz + 6);

    // Manchester
    const firstHalf = ieeeConvention.value ? (b === '1' ? 1 : -1) : b === '1' ? -1 : 1;
    const secondHalf = -firstHalf;
    manch.push(firstHalf + 3, secondHalf + 3);

    // Differential Manchester: 0 -> boundary transitions, 1 -> no boundary transition
    if (b === '0') diffLevel = -diffLevel;
    diffManch.push(diffLevel, -diffLevel);
    diffLevel = -diffLevel;

    // AMI: 0 -> 0, 1 -> alternates +1/-1
    if (b === '0') {
      ami.push(-3, -3);
    } else {
      ami.push(amiPolarity - 3, amiPolarity - 3);
      amiPolarity = -amiPolarity;
    }
  });

  // Duplicate last sample so step: 'end' reaches the end cleanly
  halfTicks.push(`${bits.length}`);
  nrz.push(nrz[nrz.length - 1]);
  manch.push(manch[manch.length - 1]);
  diffManch.push(diffManch[diffManch.length - 1]);
  ami.push(ami[ami.length - 1]);

  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { top: 36, bottom: 30, left: 70, right: 20 },
    xAxis: { type: 'category', data: halfTicks, splitLine: { show: true } },
    yAxis: {
      type: 'value',
      min: -4.5,
      max: 7.5,
      axisLabel: {
        formatter: (v: number) =>
          v === 6 ? 'NRZ' : v === 3 ? '曼彻斯特' : v === 0 ? '差分曼彻' : v === -3 ? 'AMI' : '',
      },
    },
    series: [
      { name: 'NRZ 不归零', type: 'line', step: 'end', data: nrz, showSymbol: false, lineStyle: { width: 2.5, color: '#3b82f6' } },
      { name: '曼彻斯特', type: 'line', step: 'end', data: manch, showSymbol: false, lineStyle: { width: 2.5, color: '#10b981' } },
      { name: '差分曼彻斯特', type: 'line', step: 'end', data: diffManch, showSymbol: false, lineStyle: { width: 2.5, color: '#f59e0b' } },
      { name: 'AMI 码', type: 'line', step: 'end', data: ami, showSymbol: false, lineStyle: { width: 2.5, color: '#8b5cf6' } },
    ],
  };
});

// Tab 2: CRC
const crcData = ref('101101');
const crcPoly = ref('1101');
const flipBitIdx = ref<number | null>(null);

function mod2Div(dividend: string, divisor: string) {
  const n = divisor.length;
  const buf = dividend.split('').map(Number);
  const steps: Array<{ pos: number; xorWith: string; after: string }> = [];

  for (let i = 0; i <= buf.length - n; i++) {
    if (buf[i] === 1) {
      for (let j = 0; j < n; j++) {
        buf[i + j] = buf[i + j] ^ Number(divisor[j]);
      }
      steps.push({
        pos: i,
        xorWith: ' '.repeat(i) + divisor,
        after: ' '.repeat(i) + buf.slice(i, i + n).join(''),
      });
    } else {
      steps.push({
        pos: i,
        xorWith: ' '.repeat(i) + '0'.repeat(n),
        after: ' '.repeat(i) + buf.slice(i, i + n).join(''),
      });
    }
  }
  const rem = buf.slice(buf.length - (n - 1)).join('');
  return { rem, steps };
}

const crcAnalysis = computed(() => {
  const d = crcData.value.replace(/[^01]/g, '') || '101101';
  let g = crcPoly.value.replace(/[^01]/g, '').replace(/^0+/, '') || '1101';
  if (g.length < 2) g = '11';
  const r = g.length - 1;
  const padded = d + '0'.repeat(r);
  const txDiv = mod2Div(padded, g);
  const txFrame = d + txDiv.rem;

  const rxArr = txFrame.split('');
  if (flipBitIdx.value !== null && flipBitIdx.value >= 0 && flipBitIdx.value < rxArr.length) {
    rxArr[flipBitIdx.value] = rxArr[flipBitIdx.value] === '0' ? '1' : '0';
  }
  const rxFrame = rxArr.join('');
  const rxDiv = mod2Div(rxFrame, g);
  const rxOk = /^0+$/.test(rxDiv.rem);

  return { d, g, r, padded, txDiv, txFrame, rxFrame, rxDiv, rxOk };
});

// Tab 3: Nyquist & Shannon
const bandwidthKhz = ref(3);
const snrDb = ref(30);
const modLevels = ref(16);

const capRes = computed(() => {
  const nyquist = 2 * bandwidthKhz.value * Math.log2(modLevels.value);
  const snrLinear = Math.pow(10, snrDb.value / 10);
  const shannon = bandwidthKhz.value * Math.log2(1 + snrLinear);
  const finalRate = Math.min(nyquist, shannon);
  return {
    nyquist: nyquist.toFixed(2),
    snrLinear: snrLinear.toFixed(1),
    shannon: shannon.toFixed(2),
    finalRate: finalRate.toFixed(2),
  };
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
          <el-tab-pane label="数字编码示波器 (NRZ / 曼彻斯特 / AMI)" name="wave">
            <div class="flex flex-wrap items-center gap-3">
              <el-input v-model="bitStream" style="width: 240px" size="small" class="font-mono">
                <template #prepend>比特流</template>
              </el-input>
              <el-switch
                v-model="ieeeConvention"
                active-text="IEEE 802.3 (1:高→低, 0:低→高)"
                inactive-text="反向约定 (1:低→高)"
              />
            </div>
          </el-tab-pane>

          <el-tab-pane label="CRC 循环冗余校验模2除法" name="crc">
            <div class="flex flex-wrap items-center gap-3">
              <el-input v-model="crcData" size="small" style="width: 210px" class="font-mono">
                <template #prepend>原始数据 D</template>
              </el-input>
              <el-input v-model="crcPoly" size="small" style="width: 190px" class="font-mono">
                <template #prepend>生成多项式 G</template>
              </el-input>
              <el-button size="small" @click="flipBitIdx = null">恢复无误码传输</el-button>
            </div>
          </el-tab-pane>

          <el-tab-pane label="奈奎斯特 & 香农极限计算" name="channel">
            <div class="flex flex-wrap items-center gap-4 text-xs">
              <span>带宽 W (kHz): <el-input-number v-model="bandwidthKhz" :min="1" :max="1000" size="small" style="width: 100px" /></span>
              <span>信噪比 SNR (dB): <el-input-number v-model="snrDb" :min="0" :max="60" size="small" style="width: 95px" /></span>
              <span>调制进制 V:
                <el-select v-model="modLevels" size="small" style="width: 100px">
                  <el-option :value="2" label="2 (1b/码)" />
                  <el-option :value="4" label="4 (2b/码)" />
                  <el-option :value="8" label="8 (3b/码)" />
                  <el-option :value="16" label="16-QAM" />
                  <el-option :value="64" label="64-QAM" />
                </el-select>
              </span>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <template #stage>
      <!-- Stage 1: Waveforms -->
      <div v-if="activeTab === 'wave'" class="space-y-3">
        <div class="text-xs text-slate-500">
          比特率 = 波特率 × 1（NRZ/AMI），而曼彻斯特与差分曼彻斯特每个比特中间跳变一次，<strong>波特率 = 2 × 比特率</strong>！
        </div>
        <EChartBox :option="waveChartOption" height="360px" />
      </div>

      <!-- Stage 2: CRC -->
      <div v-else-if="activeTab === 'crc'" class="space-y-4">
        <div class="flex flex-wrap gap-2 items-center font-mono text-xs">
          <el-tag type="info">r = {{ crcAnalysis.r }} (补 {{ crcAnalysis.r }} 个 0)</el-tag>
          <el-tag type="warning" effect="dark">余数 FCS = {{ crcAnalysis.txDiv.rem }}</el-tag>
          <el-tag type="primary" effect="dark">发送帧 T = {{ crcAnalysis.txFrame }}</el-tag>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <el-card shadow="never" class="!bg-slate-900 text-slate-100 font-mono text-xs">
            <template #header>
              <span class="text-amber-300 font-semibold">发送端模 2 异或长除法过程</span>
            </template>
            <div class="space-y-1 overflow-x-auto whitespace-pre">
              <div>被除数 (补r个0): {{ crcAnalysis.padded }}   (除数 G = {{ crcAnalysis.g }})</div>
              <div v-for="(s, idx) in crcAnalysis.txDiv.steps" :key="idx" class="text-slate-300">
                <div>异或: {{ s.xorWith }}</div>
                <div class="text-emerald-300">余下: {{ s.after }}</div>
              </div>
              <div class="pt-1 border-t border-slate-700 text-amber-300 font-bold">
                最终 r 位余数 FCS = {{ crcAnalysis.txDiv.rem }}
              </div>
            </div>
          </el-card>

          <el-card shadow="never" class="!bg-slate-50 dark:!bg-slate-900/50 space-y-3">
            <template #header>
              <span class="text-xs font-semibold">信道传输交互（点击下方任意比特制造误码）</span>
            </template>
            <div class="flex flex-wrap gap-1 font-mono mb-3">
              <button
                v-for="(b, idx) in crcAnalysis.rxFrame"
                :key="idx"
                type="button"
                :class="[
                  'w-8 h-9 rounded-lg font-bold border transition-all cursor-pointer',
                  flipBitIdx === idx
                    ? 'bg-rose-600 text-white border-rose-700 scale-110'
                    : idx >= crcAnalysis.d.length
                      ? 'bg-amber-100 dark:bg-amber-900/50 border-amber-400 text-amber-700 dark:text-amber-200'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700',
                ]"
                @click="flipBitIdx = flipBitIdx === idx ? null : idx"
              >
                {{ b }}
              </button>
            </div>

            <el-alert
              :type="crcAnalysis.rxOk ? 'success' : 'error'"
              effect="dark"
              :closable="false"
              :title="crcAnalysis.rxOk ? `✓ 接收端余数为 ${crcAnalysis.rxDiv.rem} (全0) → 校验通过！` : `✗ 接收端余数 = ${crcAnalysis.rxDiv.rem} ≠ 0 → 检测到传输误码并丢弃！`"
            />
          </el-card>
        </div>
      </div>

      <!-- Stage 3: Channel Capacity -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
        <el-card shadow="never" class="!bg-indigo-50/40 dark:!bg-indigo-950/20">
          <div class="text-xs text-slate-500">奈奎斯特定理 (无噪理想极限)</div>
          <div class="text-2xl font-bold text-indigo-600 my-1">{{ capRes.nyquist }} kbps</div>
          <div class="text-xs text-slate-400">2 × {{ bandwidthKhz }}k × log₂({{ modLevels }})</div>
        </el-card>
        <el-card shadow="never" class="!bg-amber-50/40 dark:!bg-amber-950/20">
          <div class="text-xs text-slate-500">香农定理 (S/N = {{ capRes.snrLinear }})</div>
          <div class="text-2xl font-bold text-amber-600 my-1">{{ capRes.shannon }} kbps</div>
          <div class="text-xs text-slate-400">{{ bandwidthKhz }}k × log₂(1 + {{ capRes.snrLinear }})</div>
        </el-card>
        <el-card shadow="never" class="!bg-emerald-50/40 dark:!bg-emerald-950/20">
          <div class="text-xs text-slate-500">信道实际最高比特率 (取较小值)</div>
          <div class="text-2xl font-bold text-emerald-600 my-1">{{ capRes.finalRate }} kbps</div>
          <div class="text-xs text-slate-400">同时受限于带宽调制与噪声</div>
        </el-card>
      </div>
    </template>
  </LabShell>
</template>
