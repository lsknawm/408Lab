<script setup lang="ts">
import { computed, provide } from 'vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, BarChart, PieChart, RadarChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  MarkLineComponent,
  MarkPointComponent,
  DataZoomComponent,
} from 'echarts/components';
import VChart, { THEME_KEY } from 'vue-echarts';
import { useDark } from '@vueuse/core';

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  RadarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  MarkLineComponent,
  MarkPointComponent,
  DataZoomComponent,
]);

defineProps<{
  option: Record<string, unknown>;
  height?: string;
}>();

const isDark = useDark();
const theme = computed(() => (isDark.value ? 'dark' : undefined));
provide(THEME_KEY, theme);
</script>

<template>
  <div class="w-full" :style="{ height: height || '320px' }">
    <VChart :option="option" :theme="theme" autoresize class="w-full h-full" />
  </div>
</template>
