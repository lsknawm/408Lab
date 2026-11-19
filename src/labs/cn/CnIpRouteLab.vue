<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import BinaryTreeCanvas from '../../components/common/BinaryTreeCanvas.vue';
import {
  allocateVlsm,
  computeIpFragmentation,
  matchLongestPrefix,
  type RouteEntry,
} from './engines/ipRouteEngine';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const activeTab = ref<'vlsm' | 'frag' | 'lpm'>('vlsm');

// Tab 1: VLSM
const baseCidr = ref('192.168.1.0/24');
const demandsStr = ref('60, 28, 12, 5');
const vlsmRes = computed(() => allocateVlsm(baseCidr.value, demandsStr.value));

// Tab 2: IP Fragmentation
const totalLen = ref(3800);
const headerLen = ref(20);
const mtu1 = ref(1500);
const mtu2 = ref(576);
const fragRes = computed(() => computeIpFragmentation(totalLen.value, headerLen.value, mtu1.value, mtu2.value));

// Tab 3: Longest Prefix Matching
const dstIp = ref('192.168.1.130');
const routeTable = ref<RouteEntry[]>([
  { prefixCidr: '192.168.0.0/16', nextHop: '接口 S0 (默认区)' },
  { prefixCidr: '192.168.1.0/24', nextHop: '接口 E0' },
  { prefixCidr: '192.168.1.128/25', nextHop: '路由器 R2 (最长匹配!)' },
  { prefixCidr: '192.168.1.192/26', nextHop: '路由器 R3' },
  { prefixCidr: '0.0.0.0/0', nextHop: '默认网关' },
]);

const lpmRes = computed(() => matchLongestPrefix(dstIp.value, routeTable.value));

function addRouteRow() {
  routeTable.value.push({ prefixCidr: '192.168.1.128/26', nextHop: '新下一跳' });
}
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
          <el-tab-pane label="VLSM / CIDR 子网划分二叉树" name="vlsm">
            <div class="flex flex-wrap items-center gap-3">
              <el-input v-model="baseCidr" size="small" style="width: 210px" class="font-mono">
                <template #prepend>主网段</template>
              </el-input>
              <el-input v-model="demandsStr" size="small" class="flex-1 min-w-[210px] font-mono">
                <template #prepend>各子网所需主机数</template>
              </el-input>
            </div>
          </el-tab-pane>

          <el-tab-pane label="IP 数据报跨两段链路连续分片" name="frag">
            <div class="flex flex-wrap items-center gap-3 text-xs">
              <span>原总长 (B): <el-input-number v-model="totalLen" :min="100" :max="20000" :step="100" size="small" style="width: 105px" /></span>
              <span>首部 (B): <el-input-number v-model="headerLen" :min="20" :max="60" :step="4" size="small" style="width: 85px" /></span>
              <span>第1段 MTU1: <el-input-number v-model="mtu1" :min="68" :max="9000" size="small" style="width: 100px" /></span>
              <span>第2段 MTU2: <el-input-number v-model="mtu2" :min="68" :max="9000" size="small" style="width: 100px" /></span>
            </div>
          </el-tab-pane>

          <el-tab-pane label="路由表最长前缀匹配" name="lpm">
            <div class="flex flex-wrap items-center gap-3">
              <el-input v-model="dstIp" size="small" style="width: 240px" class="font-mono">
                <template #prepend>目的 IP</template>
              </el-input>
              <el-button size="small" type="primary" plain @click="addRouteRow">+ 新增路由表项</el-button>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <template #stage>
      <!-- Stage 1: VLSM -->
      <div v-if="activeTab === 'vlsm'" class="space-y-4">
        <el-alert v-if="vlsmRes.error" type="error" :title="vlsmRes.error" :closable="false" />
        <template v-else>
          <el-table :data="vlsmRes.rows" size="small" border class="font-mono tabular-nums">
            <el-table-column prop="name" label="子网需求" width="115" />
            <el-table-column prop="cidr" label="分配 CIDR 前缀" width="150" />
            <el-table-column prop="mask" label="子网掩码" width="130" />
            <el-table-column prop="usableRange" label="可用主机范围" />
            <el-table-column prop="broadcastAddr" label="广播地址" width="130" />
            <el-table-column prop="usableCount" label="可用数" width="75" />
          </el-table>

          <div class="text-xs font-semibold text-slate-500">IP 空间二叉前缀树划分结果（绿色=已分配叶块）</div>
          <BinaryTreeCanvas :root="vlsmRes.treeRoot" min-height="280px" />
        </template>
      </div>

      <!-- Stage 2: IP Fragmentation -->
      <div v-else-if="activeTab === 'frag'" class="space-y-4">
        <el-alert
          type="info"
          :closable="false"
          :title="`第1段最大数据载荷 = floor((${mtu1} - ${headerLen})/8)*8 = ${fragRes.hop1.maxPayload}B；第2段最大载荷 = ${fragRes.hop2.maxPayload}B`"
        />

        <div>
          <div class="text-xs font-semibold mb-1.5">经过第 1 段链路 (MTU={{ mtu1 }}B) 后的分片结果（共 {{ fragRes.hop1.table.length }} 片）</div>
          <el-table :data="fragRes.hop1.table" size="small" border class="font-mono">
            <el-table-column prop="fragNo" label="分片#" width="65" />
            <el-table-column prop="totalLen" label="总长度" width="90" />
            <el-table-column prop="payloadLen" label="数据载荷(8的倍数)" width="140" />
            <el-table-column prop="mf" label="MF标志" width="80" />
            <el-table-column prop="offsetBytes" label="起始字节偏移" width="115" />
            <el-table-column prop="offsetField" label="片偏移字段(Offset = 字节/8)" />
          </el-table>
        </div>

        <div>
          <div class="text-xs font-semibold mb-1.5 text-amber-600">再经过第 2 段链路 (MTU={{ mtu2 }}B) 二次分片结果（共 {{ fragRes.hop2.table.length }} 片）</div>
          <el-table :data="fragRes.hop2.table" size="small" border class="font-mono">
            <el-table-column prop="fragNo" label="分片#" width="65" />
            <el-table-column prop="totalLen" label="总长度" width="90" />
            <el-table-column prop="payloadLen" label="数据载荷" width="110" />
            <el-table-column prop="mf" label="MF标志" width="80" />
            <el-table-column prop="offsetBytes" label="起始字节偏移" width="115" />
            <el-table-column prop="offsetField" label="片偏移字段(Offset)" />
          </el-table>
        </div>
      </div>

      <!-- Stage 3: Longest Prefix Matching -->
      <div v-else class="space-y-4">
        <el-alert v-if="lpmRes.error" type="error" :title="lpmRes.error" :closable="false" />
        <template v-else>
          <div class="flex flex-wrap items-center gap-3">
            <el-tag type="info" class="font-mono">目的 IP 二进制: {{ lpmRes.dstBin }}</el-tag>
            <el-tag v-if="lpmRes.winner" type="success" effect="dark">
              最终选中下一跳: {{ lpmRes.winner.prefixCidr }} → {{ lpmRes.winner.nextHop }}
            </el-tag>
          </div>

          <el-table :data="lpmRes.rows" size="small" border class="font-mono">
            <el-table-column label="路由前缀 (可编辑)">
              <template #default="{ $index }">
                <el-input v-model="routeTable[$index].prefixCidr" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="下一跳">
              <template #default="{ $index }">
                <el-input v-model="routeTable[$index].nextHop" size="small" />
              </template>
            </el-table-column>
            <el-table-column prop="maskedResult" label="Dst & Mask 结果" width="135" />
            <el-table-column prop="prefixLen" label="前缀长度" width="85" />
            <el-table-column label="匹配状态" width="120">
              <template #default="{ row }">
                <el-tag
                  v-if="lpmRes.winner && row.prefixCidr === lpmRes.winner.prefixCidr && row.matched"
                  type="success"
                  effect="dark"
                  size="small"
                >
                  ★ 最长匹配胜出
                </el-tag>
                <el-tag v-else-if="row.matched" type="warning" size="small">命中(非最长)</el-tag>
                <el-tag v-else type="info" size="small">未匹配</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </div>
    </template>
  </LabShell>
</template>
