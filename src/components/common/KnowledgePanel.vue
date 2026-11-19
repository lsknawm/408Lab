<script setup lang="ts">
import { ref, watch } from 'vue';
import type { TopicMeta } from '../../types/core';
import KatexMath from './KatexMath.vue';
import { Check, Close, WarningFilled, Reading, Trophy } from '@element-plus/icons-vue';

const props = defineProps<{
  topic: TopicMeta;
}>();

const selectedAnswers = ref<Record<string, number | undefined>>({});
const submitted = ref<Record<string, boolean>>({});

watch(
  () => props.topic.id,
  () => {
    selectedAnswers.value = {};
    submitted.value = {};
  }
);

function submitQuiz(qid: string) {
  submitted.value[qid] = true;
}

function resetQuiz(qid: string) {
  selectedAnswers.value[qid] = undefined;
  submitted.value[qid] = false;
}
</script>

<template>
  <div class="space-y-4">
    <!-- Overview & Key Points -->
    <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
            <el-icon class="text-indigo-500"><Reading /></el-icon>
            <span>408 考纲核心精讲</span>
          </div>
          <el-tag size="small" effect="plain">{{ topic.chapter }}</el-tag>
        </div>
      </template>

      <p class="text-sm leading-relaxed text-slate-600 dark:text-slate-300 mb-4">
        {{ topic.summary }}
      </p>

      <div class="space-y-2.5">
        <div
          v-for="(pt, idx) in topic.keyPoints"
          :key="idx"
          class="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800"
        >
          <el-tag size="small" type="primary" effect="dark" class="!rounded-full shrink-0 mt-0.5">
            {{ idx + 1 }}
          </el-tag>
          <span class="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{{ pt }}</span>
        </div>
      </div>
    </el-card>

    <!-- Formulas -->
    <el-card
      v-if="topic.formulas && topic.formulas.length > 0"
      shadow="never"
      class="!rounded-xl border-slate-200 dark:border-slate-800"
    >
      <template #header>
        <div class="font-semibold text-slate-800 dark:text-slate-100">核心计算公式</div>
      </template>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          v-for="(f, idx) in topic.formulas"
          :key="idx"
          class="p-3 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50"
        >
          <div class="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">{{ f.label }}</div>
          <div class="py-1 text-slate-900 dark:text-slate-100 overflow-x-auto">
            <KatexMath :expr="f.formula" :display-mode="true" />
          </div>
          <div v-if="f.note" class="text-xs text-slate-500 dark:text-slate-400 mt-1 text-center">
            {{ f.note }}
          </div>
        </div>
      </div>
    </el-card>

    <!-- Pitfalls -->
    <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
      <template #header>
        <div class="flex items-center gap-2 font-semibold text-amber-600 dark:text-amber-400">
          <el-icon><WarningFilled /></el-icon>
          <span>考研真题高频易错避坑</span>
        </div>
      </template>
      <div class="space-y-2.5">
        <el-alert
          v-for="(pit, idx) in topic.pitfalls"
          :key="idx"
          type="warning"
          :closable="false"
          show-icon
        >
          <template #default>
            <span class="text-sm leading-relaxed">{{ pit }}</span>
          </template>
        </el-alert>
      </div>
    </el-card>

    <!-- Interactive Quiz -->
    <el-card
      v-if="topic.quiz.length > 0"
      shadow="never"
      class="!rounded-xl border-slate-200 dark:border-slate-800"
    >
      <template #header>
        <div class="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
          <el-icon><Trophy /></el-icon>
          <span>随堂真题自测</span>
        </div>
      </template>
      <div class="space-y-5">
        <div
          v-for="(q, qIdx) in topic.quiz"
          :key="q.id"
          class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40"
        >
          <div class="flex items-center gap-2 mb-2">
            <el-tag size="small" type="success" effect="plain">Q{{ qIdx + 1 }}</el-tag>
            <el-tag v-if="q.yearTag" size="small" type="info" effect="plain">{{ q.yearTag }}</el-tag>
          </div>
          <p class="text-sm font-medium text-slate-800 dark:text-slate-100 mb-3 leading-relaxed">
            {{ q.question }}
          </p>
          <el-radio-group
            v-model="selectedAnswers[q.id]"
            :disabled="!!submitted[q.id]"
            class="!flex !flex-col !items-start gap-2 w-full"
          >
            <el-radio
              v-for="(opt, oIdx) in q.options"
              :key="oIdx"
              :value="oIdx"
              class="!mr-0 !w-full !h-auto py-1.5 px-2.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors"
            >
              <span class="text-sm whitespace-normal leading-snug">
                <strong class="font-mono mr-1.5">{{ String.fromCharCode(65 + oIdx) }}.</strong>{{ opt }}
              </span>
            </el-radio>
          </el-radio-group>

          <div class="mt-3 flex items-center gap-2">
            <el-button
              v-if="!submitted[q.id]"
              type="primary"
              size="small"
              :disabled="selectedAnswers[q.id] === undefined"
              @click="submitQuiz(q.id)"
            >
              核对答案
            </el-button>
            <el-button v-else size="small" @click="resetQuiz(q.id)">重做此题</el-button>

            <template v-if="submitted[q.id]">
              <el-tag
                v-if="selectedAnswers[q.id] === q.answerIndex"
                type="success"
                effect="dark"
                size="small"
              >
                <span class="inline-flex items-center gap-1"><el-icon><Check /></el-icon>回答正确</span>
              </el-tag>
              <el-tag v-else type="danger" effect="dark" size="small">
                <span class="inline-flex items-center gap-1">
                  <el-icon><Close /></el-icon>
                  正确答案：{{ String.fromCharCode(65 + q.answerIndex) }}
                </span>
              </el-tag>
            </template>
          </div>

          <el-alert
            v-if="submitted[q.id]"
            class="!mt-3"
            :type="selectedAnswers[q.id] === q.answerIndex ? 'success' : 'info'"
            :closable="false"
            title="真题解析"
            :description="q.explanation"
          />
        </div>
      </div>
    </el-card>
  </div>
</template>
