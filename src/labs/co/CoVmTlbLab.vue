<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import { bindLabPlayer, useStepPlayer } from '../../composables/useStepPlayer';
import { simulateVmPipeline, type PageTableRow } from './engines/vmTlbEngine';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const vaBits = ref(16);
const pageSize = ref(1024);
const vaSeq = ref('0x0420, 0x0840, 0x0428, 0x1010, 0x0844');

const initPageTable = ref<PageTableRow[]>([
  { vpn: 0, valid: true, pfn: 2 },
  { vpn: 1, valid: true, pfn: 5 },
  { vpn: 2, valid: true, pfn: 7 },
  { vpn: 3, valid: false, pfn: 0 },
  { vpn: 4, valid: false, pfn: 0 },
]);

const steps = computed(() =>
  simulateVmPipeline(vaSeq.value, vaBits.value, pageSize.value, initPageTable.value)
);
const player = useStepPlayer(steps, 1000);
const playerBind = bindLabPlayer(player);
const st = computed(() => player.currentStep.value?.state);

const pseudo = [
  '(VPN, Offset) = splitVirtualAddress(VA);',
  'if (TLB_Lookup(VPN, &PFN) == HIT) {',
  '  // TLB 命中绝不发生缺页！',
  '} else {',
  '  pte = PageTable[VPN];',
  '  if (pte.valid == 1) {',
  '    PFN = pte.pfn; TLB_Update(VPN, PFN);',
  '  } else {',
  '    PageFaultTrap(); // OS调页并分配空闲页框',
  '  }',
  '} PA = concat(PFN, Offset);',
  'Cache_Access(PA); // 物理寻址 Cache 查询',
];
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :player="playerBind"
    :pseudocode="pseudo"
    :has-inspector="true"
    code-title="TLB + 页表 + Cache 协同逻辑"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <div class="space-y-3">
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-1.5">
              <span class="text-xs text-slate-500">虚拟地址位宽:</span>
              <el-select v-model="vaBits" size="small" style="width: 90px">
                <el-option :value="16" label="16 位" />
                <el-option :value="20" label="20 位" />
              </el-select>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-xs text-slate-500">页面大小:</span>
              <el-select v-model="pageSize" size="small" style="width: 100px">
                <el-option :value="512" label="512 B" />
                <el-option :value="1024" label="1 KB" />
                <el-option :value="4096" label="4 KB" />
              </el-select>
            </div>
            <el-input v-model="vaSeq" size="small" class="flex-1 min-w-[230px] font-mono">
              <template #prepend>虚地址序列</template>
            </el-input>
          </div>

          <!-- Editable initial page table -->
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span class="text-slate-500 font-semibold">自定义初始页表状态 (点选 Valid 触发或消除缺页):</span>
            <div
              v-for="row in initPageTable"
              :key="row.vpn"
              class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            >
              <span class="font-mono font-bold">VPN {{ row.vpn }}</span>
              <el-switch v-model="row.valid" size="small" />
              <span class="font-mono text-[11px] text-slate-500">{{ row.valid ? `PFN=${row.pfn}` : '不在内存' }}</span>
            </div>
          </div>
        </div>
      </el-card>
    </template>

    <template #stage>
      <div v-if="st" class="space-y-4">
        <!-- 4-Stage Pipeline Indicator -->
        <el-steps
          :active="
            st.stage === 'split'
              ? 0
              : st.stage === 'tlb'
                ? 1
                : st.stage === 'pagetable' || st.stage === 'pagefault'
                  ? 2
                  : st.stage === 'pa'
                    ? 3
                    : 4
          "
          finish-status="success"
          align-center
        >
          <el-step title="VA 拆分" :description="`VPN=${st.vpn} | Off=${st.offset}`" />
          <el-step
            title="TLB 快表"
            :status="st.tlbHit === true ? 'success' : st.tlbHit === false ? 'process' : 'wait'"
            :description="st.tlbHit === true ? 'HIT!' : st.tlbHit === false ? 'MISS → 查页表' : '待查'"
          />
          <el-step
            title="主存页表/调页"
            :status="st.pageFault === true ? 'error' : st.pageFault === false ? 'success' : 'wait'"
            :description="st.pageFault === true ? '缺页中断!' : st.pfn !== null ? `PFN=${st.pfn}` : '-'"
          />
          <el-step title="PA 合成" :description="st.paHex" />
          <el-step
            title="物理 Cache"
            :status="st.cacheHit === true ? 'success' : st.cacheHit === false ? 'warning' : 'wait'"
            :description="st.cacheHit === true ? 'HIT' : st.cacheHit === false ? 'MISS' : '-'"
          />
        </el-steps>

        <!-- Current combo & latency badge -->
        <div class="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div class="font-mono text-sm">
            当前 VA: <strong>{{ st.vaHex }}</strong> → PA: <strong class="text-indigo-600 dark:text-indigo-400">{{ st.paHex }}</strong>
          </div>
          <div class="flex gap-2">
            <el-tag type="primary" effect="dark">{{ st.comboTag }}</el-tag>
            <el-tag type="warning">{{ st.latencyText }}</el-tag>
          </div>
        </div>

        <!-- TLB + PageTable + Cache Side by Side -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div class="text-xs font-semibold mb-1.5">TLB 快表 (4项全相联 LRU)</div>
            <el-table :data="st.tlb" size="small" border class="font-mono">
              <el-table-column prop="slot" label="#" width="38" />
              <el-table-column label="V" width="38">
                <template #default="{ row }">{{ row.valid ? 1 : 0 }}</template>
              </el-table-column>
              <el-table-column prop="vpn" label="VPN" />
              <el-table-column prop="pfn" label="PFN" />
            </el-table>
          </div>

          <div>
            <div class="text-xs font-semibold mb-1.5">主存页表 (运行时状态)</div>
            <el-table :data="st.pageTable" size="small" border class="font-mono">
              <el-table-column prop="vpn" label="VPN" width="55" />
              <el-table-column label="Valid" width="60">
                <template #default="{ row }">
                  <el-tag :type="row.valid ? 'success' : 'danger'" size="small">{{ row.valid ? 1 : 0 }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="pfn" label="PFN" />
            </el-table>
          </div>

          <div>
            <div class="text-xs font-semibold mb-1.5">物理地址 Cache (4行直接映射)</div>
            <el-table :data="st.cacheBlocks" size="small" border class="font-mono">
              <el-table-column prop="slot" label="行" width="42" />
              <el-table-column label="V" width="38">
                <template #default="{ row }">{{ row.valid ? 1 : 0 }}</template>
              </el-table-column>
              <el-table-column prop="paddrRange" label="缓存物理块" />
            </el-table>
          </div>
        </div>
      </div>
    </template>

    <template #inspector>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <template #header>
          <span class="text-xs font-semibold">408 高频合法性组合对照表</span>
        </template>
        <el-table
          :data="[
            { tlb: '命中', pf: '发生', cache: '任意', valid: '✗ 绝不可能', note: 'TLB中必为有效页' },
            { tlb: '命中', pf: '不发生', cache: '命中/缺失', valid: '✓ 可能', note: '最常见高效路径' },
            { tlb: '缺失', pf: '不发生', cache: '命中', valid: '✓ 可能', note: '页表查到PA后恰好在Cache中' },
            { tlb: '缺失', pf: '发生', cache: '缺失', valid: '✓ 可能', note: '最慢路径：调页后Cache也必冷缺失' },
          ]"
          size="small"
          border
        >
          <el-table-column prop="tlb" label="TLB" width="52" />
          <el-table-column prop="pf" label="缺页" width="58" />
          <el-table-column prop="cache" label="Cache" width="75" />
          <el-table-column prop="valid" label="是否可能" />
        </el-table>
      </el-card>
    </template>
  </LabShell>
</template>
