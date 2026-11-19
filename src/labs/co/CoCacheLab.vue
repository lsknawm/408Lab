<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import { bindLabPlayer, useStepPlayer } from '../../composables/useStepPlayer';
import { simulateCache, type CacheConfig } from './engines/cacheEngine';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const cfg = reactive<CacheConfig>({
  addrBits: 16,
  numLines: 8,
  blockSize: 32,
  ways: 2,
  replacement: 'LRU',
  writePolicy: 'write-back',
  cacheHitNs: 2,
  memAccessNs: 80,
});

const seqStr = ref('R:b0, R:b4, W:b0, R:b8, R:b0, R:b12, R:b4');

const steps = computed(() => simulateCache(cfg, seqStr.value));
const player = useStepPlayer(steps, 950);
const playerBind = bindLabPlayer(player);

const curState = computed(() => player.currentStep.value?.state);
const hitRate = computed(() => {
  if (!curState.value) return '0.0%';
  const tot = curState.value.hits + curState.value.misses;
  return tot === 0 ? '0.0%' : `${((curState.value.hits / tot) * 100).toFixed(1)}%`;
});

function setMappingType(ways: number) {
  cfg.ways = ways;
}

const pseudocodeLines = [
  'splitAddress(addr) -> (Tag, SetIndex, BlockOffset);',
  'set = CacheSets[SetIndex];',
  'if (exists line in set: line.valid && line.tag == Tag) {',
  '  HIT! updateLRU/LFU(); if (write && WB) line.dirty = 1;',
  '} else {',
  '  MISS! victim = findFreeOrSelectVictim(LRU/FIFO/LFU);',
  '  if (victim.valid && victim.dirty && WB) writeBackToMem(victim);',
  '  loadBlockFromMainMem(addr); victim.valid = 1; victim.tag = Tag;',
  '}',
];
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :player="playerBind"
    :pseudocode="pseudocodeLines"
    :has-inspector="true"
    code-title="Cache 查找与替换硬件流程"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <div class="space-y-3">
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div>
              <div class="text-[11px] text-slate-500 mb-1">地址位宽</div>
              <el-select v-model="cfg.addrBits" size="small" style="width: 100%">
                <el-option :value="16" label="16 位 (64KB)" />
                <el-option :value="24" label="24 位 (16MB)" />
                <el-option :value="32" label="32 位 (4GB)" />
              </el-select>
            </div>
            <div>
              <div class="text-[11px] text-slate-500 mb-1">Cache 总行数</div>
              <el-select v-model="cfg.numLines" size="small" style="width: 100%">
                <el-option :value="4" label="4 行" />
                <el-option :value="8" label="8 行" />
                <el-option :value="16" label="16 行" />
              </el-select>
            </div>
            <div>
              <div class="text-[11px] text-slate-500 mb-1">块大小 Block</div>
              <el-select v-model="cfg.blockSize" size="small" style="width: 100%">
                <el-option :value="16" label="16 B" />
                <el-option :value="32" label="32 B" />
                <el-option :value="64" label="64 B" />
                <el-option :value="128" label="128 B" />
              </el-select>
            </div>
            <div>
              <div class="text-[11px] text-slate-500 mb-1">映射相联度</div>
              <el-select :model-value="cfg.ways" size="small" style="width: 100%" @change="setMappingType">
                <el-option :value="1" label="直接映射 (1路)" />
                <el-option :value="2" label="2路组相联" />
                <el-option :value="4" label="4路组相联" />
                <el-option :value="cfg.numLines" label="全相联" />
              </el-select>
            </div>
            <div>
              <div class="text-[11px] text-slate-500 mb-1">替换策略</div>
              <el-select v-model="cfg.replacement" size="small" style="width: 100%">
                <el-option value="LRU" label="LRU (最近最少使用)" />
                <el-option value="FIFO" label="FIFO (先进先出)" />
                <el-option value="LFU" label="LFU (最不经常使用)" />
              </el-select>
            </div>
            <div>
              <div class="text-[11px] text-slate-500 mb-1">写策略</div>
              <el-select v-model="cfg.writePolicy" size="small" style="width: 100%">
                <el-option value="write-back" label="写回法 (带Dirty位)" />
                <el-option value="write-through" label="写直达 (无Dirty位)" />
              </el-select>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <el-input v-model="seqStr" size="small" class="flex-1 min-w-[260px] font-mono">
              <template #prepend>访存序列 (支持 b块号 / 0x地址 / R:读 / W:写)</template>
            </el-input>
            <el-button size="small" @click="seqStr = 'R:b0, R:b4, W:b0, R:b8, R:b0, R:b12, R:b4'">组相联抖动例</el-button>
            <el-button size="small" @click="seqStr = '0x0000, 0x0004, 0x0008, 0x0020, 0x0000, 0x0100'">十六进制地址例</el-button>
          </div>
        </div>
      </el-card>
    </template>

    <template #stage>
      <div v-if="curState" class="space-y-4">
        <!-- Address Split Bar -->
        <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-2">
          <div class="flex flex-wrap items-center justify-between text-xs">
            <span class="font-semibold">主存物理地址划分 ({{ cfg.addrBits }} 位)</span>
            <span class="font-mono text-slate-500">
              硬件总容量 = {{ curState.totalHardwareBits }} bits ({{ (curState.totalHardwareBits / 8).toFixed(1) }} B)
            </span>
          </div>
          <div class="flex w-full h-11 rounded-lg overflow-hidden font-mono text-xs font-bold text-white text-center">
            <div
              class="bg-rose-500 flex flex-col justify-center px-2"
              :style="{ flex: curState.tagBits }"
            >
              <span>Tag ({{ curState.tagBits }}b)</span>
              <span v-if="curState.currentAccess" class="text-[10px] opacity-90 truncate">
                {{ curState.currentAccess.tagBin }}
              </span>
            </div>
            <div
              v-if="curState.indexBits > 0"
              class="bg-indigo-600 flex flex-col justify-center px-2 border-l border-white/30"
              :style="{ flex: Math.max(2, curState.indexBits) }"
            >
              <span>Index ({{ curState.indexBits }}b)</span>
              <span v-if="curState.currentAccess" class="text-[10px] opacity-90">
                组 {{ curState.currentAccess.targetSet }}
              </span>
            </div>
            <div
              class="bg-emerald-600 flex flex-col justify-center px-2 border-l border-white/30"
              :style="{ flex: Math.max(2, curState.offsetBits) }"
            >
              <span>Offset ({{ curState.offsetBits }}b)</span>
              <span v-if="curState.currentAccess" class="text-[10px] opacity-90">
                {{ curState.currentAccess.offsetBin }}
              </span>
            </div>
          </div>
        </div>

        <!-- Cache Lines Table -->
        <el-table :data="curState.lines" size="small" border max-height="320" class="font-mono">
          <el-table-column prop="setIdx" label="组号 Set" width="75" />
          <el-table-column prop="wayIdx" label="路 Way" width="70" />
          <el-table-column label="Valid" width="65">
            <template #default="{ row }">
              <el-tag :type="row.valid ? 'success' : 'info'" size="small">{{ row.valid ? 1 : 0 }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column v-if="cfg.writePolicy === 'write-back'" label="Dirty" width="65">
            <template #default="{ row }">
              <el-tag :type="row.dirty ? 'danger' : 'info'" size="small">{{ row.dirty ? 1 : 0 }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="tagHex" label="标记 Tag" width="100" />
          <el-table-column label="存储主存块号" width="110">
            <template #default="{ row }">
              <span v-if="row.blockNum !== null" class="font-bold">块 {{ row.blockNum }}</span>
              <span v-else class="text-slate-300">-</span>
            </template>
          </el-table-column>
          <el-table-column label="状态">
            <template #default="{ row }">
              <el-tag v-if="row.status === 'hit'" type="success" effect="dark" size="small">命中 HIT</el-tag>
              <el-tag v-else-if="row.status === 'evict'" type="danger" effect="dark" size="small">淘汰写回并填块</el-tag>
              <el-tag v-else-if="row.status === 'miss-fill'" type="warning" effect="dark" size="small">缺失调块写入</el-tag>
              <el-tag v-else-if="row.status === 'compare'" type="primary" effect="plain" size="small">同组比对</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <template #inspector>
      <el-card v-if="curState" shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <template #header>
          <span class="text-xs font-semibold">性能统计与硬件位数明细</span>
        </template>
        <el-descriptions :column="1" size="small" border class="tabular-nums">
          <el-descriptions-item label="命中 / 缺失">{{ curState.hits }} / {{ curState.misses }}</el-descriptions-item>
          <el-descriptions-item label="Cache 命中率">{{ hitRate }}</el-descriptions-item>
          <el-descriptions-item label="脏块写回次数">{{ curState.writeBacks }}</el-descriptions-item>
          <el-descriptions-item label="平均访存时间 AMAT">{{ curState.amat }} ns</el-descriptions-item>
          <el-descriptions-item label="每行开销组成">
            <span class="font-mono text-xs">
              V({{ curState.bitsPerLine.valid }}) + D({{ curState.bitsPerLine.dirty }}) + 替换({{ curState.bitsPerLine.repl }}) + Tag({{ curState.bitsPerLine.tag }}) + Data({{ curState.bitsPerLine.data }}) bit
            </span>
          </el-descriptions-item>
        </el-descriptions>

        <el-table :data="curState.accessLog" size="small" border class="mt-3 font-mono" max-height="200">
          <el-table-column prop="seq" label="#" width="42" />
          <el-table-column prop="op" label="操作" width="60" />
          <el-table-column prop="blockNum" label="块号" width="56" />
          <el-table-column prop="result" label="结果" />
        </el-table>
      </el-card>
    </template>
  </LabShell>
</template>
