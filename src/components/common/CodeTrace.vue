<script setup lang="ts">
defineProps<{
  title?: string;
  lines: string[];
  activeLine?: number; // 1-based
}>();
</script>

<template>
  <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-100 overflow-hidden text-xs">
    <div class="px-3 py-2 bg-slate-800/80 border-b border-slate-700/70 flex items-center justify-between">
      <span class="font-mono font-semibold text-slate-200">{{ title || '算法伪代码追踪' }}</span>
      <span v-if="activeLine" class="font-mono text-[11px] text-amber-300">Line {{ activeLine }}</span>
    </div>
    <div class="p-2 font-mono max-h-[280px] overflow-y-auto space-y-0.5">
      <div
        v-for="(line, idx) in lines"
        :key="idx"
        :class="[
          'flex items-start gap-2.5 px-2 py-0.5 rounded transition-colors leading-relaxed',
          activeLine === idx + 1
            ? 'bg-indigo-500/35 text-amber-200 border-l-2 border-amber-400'
            : 'text-slate-300 hover:bg-slate-800/60',
        ]"
      >
        <span class="w-5 text-right select-none text-slate-500 shrink-0 tabular-nums">{{ idx + 1 }}</span>
        <pre class="m-0 whitespace-pre-wrap break-words font-mono min-w-0 flex-1">{{ line }}</pre>
      </div>
    </div>
  </div>
</template>
