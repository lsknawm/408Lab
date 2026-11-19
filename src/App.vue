<script setup lang="ts">
import { computed, defineAsyncComponent, markRaw, ref, type Component } from 'vue';
import { onKeyStroke, useDark, useLocalStorage, useToggle } from '@vueuse/core';
import { ALL_TOPICS, SUBJECTS, getTopicById } from './data/syllabus';
import type { SubjectId, TopicMeta } from './types/core';
import EChartBox from './components/common/EChartBox.vue';

import {
  Check,
  Cpu,
  Connection,
  DataAnalysis,
  Menu as MenuIcon,
  Moon,
  Odometer,
  Operation,
  Search,
  Share,
  Sunny,
} from '@element-plus/icons-vue';

const LAB_COMPONENTS: Record<string, Component> = {
  'ds-linear': markRaw(defineAsyncComponent(() => import('./labs/ds/DsLinearLab.vue'))),
  'ds-btree-custom': markRaw(defineAsyncComponent(() => import('./labs/ds/DsBinaryTreeLab.vue'))),
  'ds-forest-huffman': markRaw(defineAsyncComponent(() => import('./labs/ds/DsForestHuffmanLab.vue'))),
  'ds-bst-avl': markRaw(defineAsyncComponent(() => import('./labs/ds/DsBstAvlLab.vue'))),
  'ds-mway-btree': markRaw(defineAsyncComponent(() => import('./labs/ds/DsBTreeLab.vue'))),
  'ds-graph': markRaw(defineAsyncComponent(() => import('./labs/ds/DsGraphLab.vue'))),
  'ds-sort-hash': markRaw(defineAsyncComponent(() => import('./labs/ds/DsSortHashLab.vue'))),
  'co-data-alu': markRaw(defineAsyncComponent(() => import('./labs/co/CoDataAluLab.vue'))),
  'co-cache': markRaw(defineAsyncComponent(() => import('./labs/co/CoCacheLab.vue'))),
  'co-vm-tlb': markRaw(defineAsyncComponent(() => import('./labs/co/CoVmTlbLab.vue'))),
  'co-isa': markRaw(defineAsyncComponent(() => import('./labs/co/CoIsaLab.vue'))),
  'co-cpu-pipeline': markRaw(defineAsyncComponent(() => import('./labs/co/CoCpuPipelineLab.vue'))),
  'co-io-interrupt': markRaw(defineAsyncComponent(() => import('./labs/co/CoIoInterruptLab.vue'))),
  'os-process-sched': markRaw(defineAsyncComponent(() => import('./labs/os/OsProcessSchedLab.vue'))),
  'os-sync-pv': markRaw(defineAsyncComponent(() => import('./labs/os/OsSyncPvLab.vue'))),
  'os-deadlock': markRaw(defineAsyncComponent(() => import('./labs/os/OsDeadlockLab.vue'))),
  'os-memory': markRaw(defineAsyncComponent(() => import('./labs/os/OsMemoryLab.vue'))),
  'os-file-disk': markRaw(defineAsyncComponent(() => import('./labs/os/OsFileDiskLab.vue'))),
  'cn-phy-crc': markRaw(defineAsyncComponent(() => import('./labs/cn/CnPhyCrcLab.vue'))),
  'cn-arq': markRaw(defineAsyncComponent(() => import('./labs/cn/CnArqLab.vue'))),
  'cn-lan-switch': markRaw(defineAsyncComponent(() => import('./labs/cn/CnLanSwitchLab.vue'))),
  'cn-ip-route': markRaw(defineAsyncComponent(() => import('./labs/cn/CnIpRouteLab.vue'))),
  'cn-routing': markRaw(defineAsyncComponent(() => import('./labs/cn/CnRoutingLab.vue'))),
  'cn-tcp-app': markRaw(defineAsyncComponent(() => import('./labs/cn/CnTcpAppLab.vue'))),
};

const isDark = useDark();
const toggleDark = useToggle(isDark);

const activeTopicId = useLocalStorage<string>('cs408_active_topic', 'ds-btree-custom');
const masteredIds = useLocalStorage<string[]>('cs408_mastered_ids', []);

const activeTopic = computed(() => getTopicById(activeTopicId.value));
const activeSubject = computed<SubjectId>({
  get: () => activeTopic.value.subject,
  set: (subj) => {
    const first = ALL_TOPICS.find((t) => t.subject === subj);
    if (first) activeTopicId.value = first.id;
  },
});

const activeLabComponent = computed(() => LAB_COMPONENTS[activeTopic.value.id] || LAB_COMPONENTS['ds-btree-custom']);

const subjectTopics = computed(() => ALL_TOPICS.filter((t) => t.subject === activeSubject.value));

const groupedChapters = computed(() => {
  const map = new Map<string, TopicMeta[]>();
  for (const t of subjectTopics.value) {
    if (!map.has(t.chapter)) map.set(t.chapter, []);
    map.get(t.chapter)!.push(t);
  }
  return Array.from(map.entries()).map(([chapter, topics]) => ({ chapter, topics }));
});

const masteredSet = computed(() => new Set(masteredIds.value));

function toggleMastered(id: string) {
  if (masteredSet.value.has(id)) {
    masteredIds.value = masteredIds.value.filter((x) => x !== id);
  } else {
    masteredIds.value = [...masteredIds.value, id];
  }
}

// Search / Command Palette & Mobile Drawer & Dashboard Dialog
const searchDialogVisible = ref(false);
const searchQuery = ref('');
const mobileDrawerVisible = ref(false);
const dashboardVisible = ref(false);

const filteredSearchTopics = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return ALL_TOPICS;
  return ALL_TOPICS.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.subtitle.toLowerCase().includes(q) ||
      t.chapter.toLowerCase().includes(q) ||
      t.summary.toLowerCase().includes(q)
  );
});

onKeyStroke('k', (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    searchDialogVisible.value = true;
  }
});

function selectTopic(id: string) {
  activeTopicId.value = id;
  searchDialogVisible.value = false;
  mobileDrawerVisible.value = false;
}

const subjectStats = computed(() =>
  SUBJECTS.map((s) => {
    const list = ALL_TOPICS.filter((t) => t.subject === s.id);
    const done = list.filter((t) => masteredSet.value.has(t.id)).length;
    return {
      ...s,
      total: list.length,
      done,
      pct: Math.round((done / list.length) * 100),
    };
  })
);

const totalMasteryPct = computed(() =>
  Math.round((masteredIds.value.length / ALL_TOPICS.length) * 100)
);

const dashboardChartOption = computed(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [
    {
      name: '408 分值权重',
      type: 'pie',
      radius: ['42%', '70%'],
      center: ['50%', '44%'],
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { formatter: '{b}\n{c}分 ({d}%)' },
      data: SUBJECTS.map((s) => ({
        name: s.name,
        value: s.scoreWeight,
        itemStyle: { color: s.accentColor },
      })),
    },
  ],
}));

function subjectIcon(id: SubjectId) {
  if (id === 'ds') return Share;
  if (id === 'co') return Cpu;
  if (id === 'os') return Operation;
  return Connection;
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
    <!-- Top Bar -->
    <header
      class="sticky top-0 z-30 h-[60px] border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3 md:px-5 flex items-center justify-between gap-2 shrink-0"
    >
      <div class="flex items-center gap-2.5 min-w-0">
        <el-button
          class="lg:!hidden shrink-0"
          circle
          size="small"
          @click="mobileDrawerVisible = true"
        >
          <el-icon><MenuIcon /></el-icon>
        </el-button>

        <div class="flex items-center gap-2 shrink-0">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center font-mono font-bold text-sm shadow-sm">
            408
          </div>
          <div class="hidden sm:block leading-tight whitespace-nowrap">
            <div class="font-bold text-sm tracking-tight">CS408 Lab</div>
            <div class="text-[11px] text-slate-400">考研 408 全科交互可视化实验室</div>
          </div>
        </div>

        <!-- 4 Subjects Switcher (Desktop lg+) -->
        <div class="hidden lg:flex items-center gap-1 ml-2 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl shrink-0">
          <button
            v-for="s in SUBJECTS"
            :key="s.id"
            type="button"
            :class="[
              'px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer border-0 whitespace-nowrap shrink-0',
              activeSubject === s.id
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'bg-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100',
            ]"
            @click="activeSubject = s.id"
          >
            <el-icon :style="{ color: s.accentColor }"><component :is="subjectIcon(s.id)" /></el-icon>
            <span>{{ s.name }}</span>
            <span class="hidden xl:inline text-[10px] opacity-65 font-mono">({{ s.scoreWeight }}')</span>
          </button>
        </div>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <el-button size="small" plain @click="searchDialogVisible = true">
          <el-icon class="mr-1"><Search /></el-icon>
          <span class="hidden sm:inline">搜知识点</span>
          <kbd class="hidden xl:inline ml-1.5 text-[10px] px-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
            Ctrl+K
          </kbd>
        </el-button>

        <el-button size="small" type="primary" plain @click="dashboardVisible = true">
          <el-icon class="mr-1"><Odometer /></el-icon>
          <span class="hidden sm:inline">进度 {{ masteredIds.length }}/{{ ALL_TOPICS.length }}</span>
        </el-button>

        <el-button circle size="small" @click="toggleDark()">
          <el-icon>
            <Sunny v-if="isDark" />
            <Moon v-else />
          </el-icon>
        </el-button>
      </div>
    </header>

    <!-- Tablet / Mobile 4-Subject Strip (< lg) -->
    <div class="lg:hidden flex overflow-x-auto gap-1.5 px-3 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
      <el-button
        v-for="s in SUBJECTS"
        :key="s.id"
        size="small"
        class="!shrink-0"
        :type="activeSubject === s.id ? 'primary' : 'default'"
        :plain="activeSubject !== s.id"
        @click="activeSubject = s.id"
      >
        {{ s.name }} ({{ s.scoreWeight }}')
      </el-button>
    </div>

    <div class="flex-1 flex max-w-[1600px] w-full mx-auto min-w-0">
      <!-- Left Sidebar (Desktop) -->
      <aside
        class="hidden lg:block w-[270px] border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3 shrink-0"
      >
        <div class="space-y-4 sticky top-[76px] max-h-[calc(100vh-92px)] overflow-y-auto pr-1">
          <!-- Subject summary pill -->
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
            <div class="flex items-center justify-between mb-1">
              <span class="font-bold text-sm">
                {{ SUBJECTS.find((x) => x.id === activeSubject)?.name }}
              </span>
              <el-tag size="small" effect="dark">
                {{ SUBJECTS.find((x) => x.id === activeSubject)?.scoreWeight }} 分 / 150
              </el-tag>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 m-0 leading-relaxed">
              {{ SUBJECTS.find((x) => x.id === activeSubject)?.description }}
            </p>
          </div>

          <!-- Grouped Chapters -->
          <div v-for="grp in groupedChapters" :key="grp.chapter" class="space-y-1.5">
            <div class="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {{ grp.chapter }}
            </div>
            <button
              v-for="t in grp.topics"
              :key="t.id"
              type="button"
              :class="[
                'w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-2',
                activeTopicId === t.id
                  ? 'bg-indigo-50/90 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-200 shadow-xs'
                  : 'bg-transparent border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300',
              ]"
              @click="selectTopic(t.id)"
            >
              <div class="min-w-0">
                <div class="text-xs font-semibold leading-snug truncate">{{ t.title }}</div>
                <div class="text-[11px] text-slate-400 truncate mt-0.5">{{ t.difficulty }} · 可自定义</div>
              </div>
              <el-icon v-if="masteredSet.has(t.id)" class="text-emerald-500 shrink-0 mt-0.5"><Check /></el-icon>
            </button>
          </div>
        </div>
      </aside>

      <!-- Main Lab Content -->
      <main class="flex-1 p-3 md:p-5 min-w-0">
        <component
          :is="activeLabComponent"
          :key="activeTopic.id"
          :topic="activeTopic"
          :mastered="masteredSet.has(activeTopic.id)"
          @toggle-mastered="toggleMastered(activeTopic.id)"
        />
      </main>
    </div>

    <!-- Mobile Topic Drawer -->
    <el-drawer v-model="mobileDrawerVisible" title="408 章节知识点目录" direction="ltr" size="290px">
      <div class="space-y-4">
        <div v-for="grp in groupedChapters" :key="grp.chapter" class="space-y-1.5">
          <div class="text-[11px] font-bold text-slate-400">{{ grp.chapter }}</div>
          <el-button
            v-for="t in grp.topics"
            :key="t.id"
            class="!w-full !justify-start !ml-0"
            :type="activeTopicId === t.id ? 'primary' : 'default'"
            :plain="activeTopicId !== t.id"
            size="small"
            @click="selectTopic(t.id)"
          >
            {{ t.title }}
          </el-button>
        </div>
      </div>
    </el-drawer>

    <!-- Quick Search Dialog (Ctrl+K) -->
    <el-dialog v-model="searchDialogVisible" title="快速定位 408 知识点" width="600px" destroy-on-close>
      <el-input
        v-model="searchQuery"
        placeholder="输入关键词，例如：AVL、Cache、银行家、KMP、B-树、TCP、流水线、OSPF..."
        clearable
        autofocus
        class="mb-3"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>

      <div class="max-h-[360px] overflow-y-auto space-y-1.5">
        <div
          v-for="t in filteredSearchTopics"
          :key="t.id"
          class="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-indigo-400 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 cursor-pointer flex items-center justify-between gap-2"
          @click="selectTopic(t.id)"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <el-tag size="small" effect="plain">
                {{ SUBJECTS.find((s) => s.id === t.subject)?.name }}
              </el-tag>
              <span class="font-semibold text-sm truncate">{{ t.title }}</span>
            </div>
            <div class="text-xs text-slate-400 truncate mt-0.5">{{ t.subtitle }}</div>
          </div>
          <el-tag size="small" :type="t.difficulty === '压轴大题' ? 'danger' : 'warning'">
            {{ t.difficulty }}
          </el-tag>
        </div>
      </div>
    </el-dialog>

    <!-- Study Dashboard Dialog -->
    <el-dialog v-model="dashboardVisible" title="408 考研全科学习进度看板" width="680px">
      <div class="space-y-4">
        <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div>
            <div class="text-xs text-slate-500">全科 24 个核心实验室掌握度</div>
            <div class="text-2xl font-mono font-bold text-indigo-600">
              {{ masteredIds.length }} / {{ ALL_TOPICS.length }} ({{ totalMasteryPct }}%)
            </div>
          </div>
          <el-icon class="text-4xl text-indigo-500"><DataAnalysis /></el-icon>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <el-card v-for="st in subjectStats" :key="st.id" shadow="never">
            <div class="flex items-center justify-between mb-1.5">
              <span class="font-bold text-sm">{{ st.name }} ({{ st.scoreWeight }}分)</span>
              <span class="font-mono text-xs">{{ st.done }}/{{ st.total }}</span>
            </div>
            <el-progress :percentage="st.pct" :color="st.accentColor" />
          </el-card>
        </div>

        <EChartBox :option="dashboardChartOption" height="240px" />
      </div>
    </el-dialog>
  </div>
</template>
