<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onKeyStroke } from '@vueuse/core';
import type { TopicMeta } from '../../types/core';
import KnowledgePanel from './KnowledgePanel.vue';
import CodeTrace from './CodeTrace.vue';
import {
  VideoPlay,
  VideoPause,
  DArrowLeft,
  DArrowRight,
  ArrowLeft,
  ArrowRight,
  Check,
  MagicStick,
  Reading,
  Monitor,
} from '@element-plus/icons-vue';

export interface PlayerLike {
  stepIndex: { value: number } | number;
  totalSteps: { value: number } | number;
  isPlaying: { value: boolean } | boolean;
  speed: { value: number } | number;
  currentStep?: { value: { title: string; description: string; codeLine?: number } | undefined };
  togglePlay: () => void;
  prev: () => void;
  next: () => void;
  reset: () => void;
  goToEnd: () => void;
  jumpTo: (idx: number) => void;
}

const props = withDefaults(
  defineProps<{
    topic: TopicMeta;
    mastered: boolean;
    player?: {
      stepIndex: number;
      totalSteps: number;
      isPlaying: boolean;
      speed: number;
      stepTitle?: string;
      stepDesc?: string;
      codeLine?: number;
      togglePlay: () => void;
      prev: () => void;
      next: () => void;
      reset: () => void;
      goToEnd: () => void;
      jumpTo: (idx: number) => void;
      setSpeed: (s: number) => void;
    };
    pseudocode?: string[];
    codeTitle?: string;
    hasInspector?: boolean;
  }>(),
  {
    hasInspector: false,
  }
);

const emit = defineEmits<{
  (e: 'toggleMastered'): void;
}>();

const viewMode = ref<'lab' | 'knowledge'>('lab');
const viewOptions = [
  { label: '交互动态实验室', value: 'lab' },
  { label: '考点精讲与真题', value: 'knowledge' },
];

watch(
  () => props.topic.id,
  () => {
    viewMode.value = 'lab';
  }
);

const difficultyType = computed(() => {
  if (props.topic.difficulty === '压轴大题') return 'danger';
  if (props.topic.difficulty === '高频') return 'warning';
  return 'success';
});

const sliderModel = computed({
  get: () => props.player?.stepIndex ?? 0,
  set: (v: number) => props.player?.jumpTo(v),
});

const speedModel = computed({
  get: () => props.player?.speed ?? 1,
  set: (v: number) => props.player?.setSpeed(v),
});

function isEditingElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

onKeyStroke(' ', (e) => {
  if (!props.player || viewMode.value !== 'lab' || isEditingElement(e.target)) return;
  e.preventDefault();
  props.player.togglePlay();
});
onKeyStroke('ArrowLeft', (e) => {
  if (!props.player || viewMode.value !== 'lab' || isEditingElement(e.target)) return;
  e.preventDefault();
  props.player.prev();
});
onKeyStroke('ArrowRight', (e) => {
  if (!props.player || viewMode.value !== 'lab' || isEditingElement(e.target)) return;
  e.preventDefault();
  props.player.next();
});
</script>

<template>
  <div class="flex flex-col gap-3.5 h-full">
    <!-- Topic Header -->
    <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-1.5 min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-medium text-slate-500 dark:text-slate-400">{{ topic.chapter }}</span>
            <el-tag :type="difficultyType" size="small" effect="light">{{ topic.difficulty }}</el-tag>
            <el-tag
              v-for="feat in topic.customizableFeatures"
              :key="feat"
              size="small"
              type="info"
              effect="plain"
              class="!border-dashed"
            >
              <span class="inline-flex items-center gap-1">
                <el-icon><MagicStick /></el-icon>{{ feat }}
              </span>
            </el-tag>
          </div>
          <h1 class="text-lg md:text-xl font-bold text-slate-900 dark:text-slate-50 tracking-tight m-0">
            {{ topic.title }}
          </h1>
          <p class="text-xs md:text-sm text-slate-500 dark:text-slate-400 m-0">
            {{ topic.subtitle }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <el-segmented v-model="viewMode" :options="viewOptions" size="default">
            <template #default="{ item }">
              <span class="inline-flex items-center gap-1.5 px-1">
                <el-icon v-if="item.value === 'lab'"><Monitor /></el-icon>
                <el-icon v-else><Reading /></el-icon>
                <span>{{ item.label }}</span>
              </span>
            </template>
          </el-segmented>

          <el-button
            :type="mastered ? 'success' : 'default'"
            :plain="!mastered"
            @click="emit('toggleMastered')"
          >
            <el-icon class="mr-1"><Check /></el-icon>
            {{ mastered ? '已掌握' : '标记掌握' }}
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- Main Interactive Lab View -->
    <template v-if="viewMode === 'lab'">
      <!-- Custom Structure & Config Panel -->
      <div v-if="$slots.controls">
        <slot name="controls" />
      </div>

      <!-- Visualization Stage + Optional Inspector -->
      <div
        :class="[
          'grid gap-3.5 items-start',
          hasInspector || (pseudocode && pseudocode.length > 0)
            ? 'grid-cols-1 xl:grid-cols-12'
            : 'grid-cols-1',
        ]"
      >
        <div
          :class="
            hasInspector || (pseudocode && pseudocode.length > 0)
              ? 'xl:col-span-8 min-w-0'
              : 'col-span-1 min-w-0'
          "
        >
          <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
            <slot name="stage" />
          </el-card>
        </div>

        <div
          v-if="hasInspector || (pseudocode && pseudocode.length > 0)"
          class="xl:col-span-4 space-y-3.5 min-w-0"
        >
          <CodeTrace
            v-if="pseudocode && pseudocode.length > 0"
            :title="codeTitle"
            :lines="pseudocode"
            :active-line="player?.codeLine"
          />
          <slot name="inspector" />
        </div>
      </div>

      <!-- Dynamic Step Transport Bar -->
      <el-card
        v-if="player && player.totalSteps > 0"
        shadow="never"
        class="!rounded-xl border-slate-200 dark:border-slate-800 sticky bottom-2 z-20 backdrop-blur-md bg-white/95 dark:bg-slate-900/95"
      >
        <div class="space-y-2.5">
          <!-- Narration Banner -->
          <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/70">
            <div class="flex items-start gap-2.5 min-w-0 flex-1">
              <el-tag size="small" type="primary" effect="dark" class="shrink-0 tabular-nums font-mono">
                {{ player.stepIndex + 1 }} / {{ player.totalSteps }}
              </el-tag>
              <div class="text-sm leading-snug text-slate-800 dark:text-slate-100">
                <strong v-if="player.stepTitle" class="mr-2">{{ player.stepTitle }}</strong>
                <span class="text-slate-600 dark:text-slate-300">{{ player.stepDesc }}</span>
              </div>
            </div>
            <span class="text-[11px] text-slate-400 hidden sm:inline shrink-0">
              快捷键: Space 播放/暂停 · ← / → 单步
            </span>
          </div>

          <!-- Controls & Slider -->
          <div class="flex flex-wrap items-center gap-3">
            <el-button-group class="shrink-0">
              <el-tooltip content="回到首步" placement="top">
                <el-button size="small" :disabled="player.stepIndex === 0" @click="player.reset">
                  <el-icon><DArrowLeft /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="上一步 (←)" placement="top">
                <el-button size="small" :disabled="player.stepIndex === 0" @click="player.prev">
                  <el-icon><ArrowLeft /></el-icon>
                </el-button>
              </el-tooltip>
              <el-button
                size="small"
                type="primary"
                :disabled="player.totalSteps <= 1"
                @click="player.togglePlay"
              >
                <el-icon class="mr-1">
                  <VideoPause v-if="player.isPlaying" />
                  <VideoPlay v-else />
                </el-icon>
                {{ player.isPlaying ? '暂停' : '播放' }}
              </el-button>
              <el-tooltip content="下一步 (→)" placement="top">
                <el-button
                  size="small"
                  :disabled="player.stepIndex >= player.totalSteps - 1"
                  @click="player.next"
                >
                  <el-icon><ArrowRight /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="跳至末步" placement="top">
                <el-button
                  size="small"
                  :disabled="player.stepIndex >= player.totalSteps - 1"
                  @click="player.goToEnd"
                >
                  <el-icon><DArrowRight /></el-icon>
                </el-button>
              </el-tooltip>
            </el-button-group>

            <div class="flex-1 min-w-[160px] px-2">
              <el-slider
                v-model="sliderModel"
                :min="0"
                :max="Math.max(0, player.totalSteps - 1)"
                :show-tooltip="false"
                :disabled="player.totalSteps <= 1"
              />
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <span class="text-xs text-slate-500">倍速</span>
              <el-select v-model="speedModel" size="small" style="width: 82px">
                <el-option label="0.5x" :value="0.5" />
                <el-option label="1.0x" :value="1" />
                <el-option label="1.5x" :value="1.5" />
                <el-option label="2.0x" :value="2" />
                <el-option label="3.0x" :value="3" />
              </el-select>
            </div>
          </div>
        </div>
      </el-card>
    </template>

    <!-- Knowledge & Quiz View -->
    <KnowledgePanel v-else :topic="topic" />
  </div>
</template>
