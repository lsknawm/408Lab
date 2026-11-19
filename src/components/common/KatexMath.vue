<script setup lang="ts">
import { computed } from 'vue';
import katex from 'katex';

const props = withDefaults(
  defineProps<{
    expr: string;
    displayMode?: boolean;
  }>(),
  { displayMode: false }
);

const renderedHtml = computed(() => {
  try {
    return katex.renderToString(props.expr, {
      displayMode: props.displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch {
    return props.expr;
  }
});
</script>

<template>
  <span
    :class="displayMode ? 'block my-1.5 overflow-x-auto text-center' : 'inline-block align-middle'"
    v-html="renderedHtml"
  />
</template>
