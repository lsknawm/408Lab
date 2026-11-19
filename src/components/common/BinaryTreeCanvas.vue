<script setup lang="ts">
import { computed } from 'vue';
import {
  layoutBinaryTree,
  type BinaryNodeData,
  type ThreadLink,
} from '../../utils/treeLayout';

const props = withDefaults(
  defineProps<{
    root: BinaryNodeData | null;
    editable?: boolean;
    selectedId?: string | null;
    threads?: ThreadLink[];
    minHeight?: string;
    emptyText?: string;
  }>(),
  {
    editable: false,
    selectedId: null,
    threads: () => [],
    minHeight: '340px',
    emptyText: '当前为空树 — 请点击下方添加根节点或使用序列构建',
  }
);

const emit = defineEmits<{
  (e: 'select', nodeId: string): void;
  (e: 'addChild', parentId: string, side: 'left' | 'right'): void;
  (e: 'addRoot'): void;
}>();

const layout = computed(() => layoutBinaryTree(props.root));

const nodeMap = computed(() => {
  const m = new Map<string, (typeof layout.value.nodes)[number]>();
  for (const n of layout.value.nodes) m.set(n.id, n);
  return m;
});

const threadPaths = computed(() => {
  const res: Array<{ d: string; kind: 'pred' | 'succ' }> = [];
  for (const t of props.threads) {
    const a = nodeMap.value.get(t.fromId);
    const b = nodeMap.value.get(t.toId);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const curveOffset = t.kind === 'pred' ? -36 : 36;
    const cx = (a.x + b.x) / 2 + (Math.abs(dx) < 20 ? curveOffset : 0);
    const cy = (a.y + b.y) / 2 + (dy >= 0 ? -24 : 24) + (t.kind === 'pred' ? 12 : -12);
    res.push({
      d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`,
      kind: t.kind,
    });
  }
  return res;
});

function nodeFill(n: (typeof layout.value.nodes)[number]) {
  if (n.colorTag === 'red') return '#dc2626';
  if (n.colorTag === 'black') return '#1e293b';
  if (n.highlight === 'imbalanced') return '#ef4444';
  if (n.highlight === 'active') return '#4f46e5';
  if (n.highlight === 'rotated' || n.highlight === 'new') return '#f59e0b';
  if (n.highlight === 'found' || n.highlight === 'visited') return '#10b981';
  return '#ffffff';
}

function nodeTextFill(n: (typeof layout.value.nodes)[number]) {
  if (
    n.colorTag === 'red' ||
    n.colorTag === 'black' ||
    n.highlight === 'imbalanced' ||
    n.highlight === 'active' ||
    n.highlight === 'rotated' ||
    n.highlight === 'new' ||
    n.highlight === 'found' ||
    n.highlight === 'visited'
  ) {
    return '#ffffff';
  }
  return '#0f172a';
}

function nodeStroke(n: (typeof layout.value.nodes)[number]) {
  if (props.selectedId === n.id) return '#4f46e5';
  if (n.colorTag === 'red') return '#991b1b';
  if (n.colorTag === 'black') return '#94a3b8';
  if (n.highlight === 'imbalanced') return '#b91c1c';
  if (n.highlight === 'active') return '#312e81';
  if (n.highlight === 'visited' || n.highlight === 'found') return '#047857';
  return '#64748b';
}
</script>

<template>
  <div
    class="relative w-full overflow-auto rounded-xl border border-slate-200 dark:border-slate-800 lab-grid-bg flex items-center justify-center"
    :style="{ minHeight }"
  >
    <div v-if="!root" class="text-center p-6 space-y-3">
      <div class="text-sm text-slate-500 dark:text-slate-400">{{ emptyText }}</div>
      <el-button v-if="editable" type="primary" size="small" @click="emit('addRoot')">
        + 创建根节点
      </el-button>
    </div>

    <svg
      v-else
      :width="layout.width"
      :height="layout.height"
      class="select-none mx-auto block"
    >
      <defs>
        <marker
          id="thread-succ-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
        </marker>
        <marker
          id="thread-pred-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#06b6d4" />
        </marker>
      </defs>

      <!-- Structural Edges -->
      <g>
        <line
          v-for="e in layout.edges"
          :key="`${e.fromId}-${e.toId}`"
          :x1="e.x1"
          :y1="e.y1"
          :x2="e.x2"
          :y2="e.y2"
          stroke="#94a3b8"
          stroke-width="2"
          class="svg-edge"
        />
      </g>

      <!-- Threading Links -->
      <g v-if="threadPaths.length > 0">
        <path
          v-for="(tp, i) in threadPaths"
          :key="i"
          :d="tp.d"
          fill="none"
          :stroke="tp.kind === 'succ' ? '#f59e0b' : '#06b6d4'"
          stroke-width="1.6"
          stroke-dasharray="5 3"
          :marker-end="tp.kind === 'succ' ? 'url(#thread-succ-arrow)' : 'url(#thread-pred-arrow)'"
        />
      </g>

      <!-- Nodes -->
      <g
        v-for="n in layout.nodes"
        :key="n.id"
        :transform="`translate(${n.x}, ${n.y})`"
        class="svg-node cursor-pointer"
        @click="emit('select', n.id)"
      >
        <!-- Selection Halo -->
        <circle
          v-if="selectedId === n.id"
          r="25"
          fill="none"
          stroke="#6366f1"
          stroke-width="2"
          stroke-dasharray="4 2"
        />

        <!-- Node Body -->
        <circle
          r="20"
          :fill="nodeFill(n)"
          :stroke="nodeStroke(n)"
          :stroke-width="selectedId === n.id ? 3 : 2"
        />

        <!-- Label -->
        <text
          dy="0.35em"
          text-anchor="middle"
          :fill="nodeTextFill(n)"
          class="font-mono text-sm font-bold pointer-events-none"
        >
          {{ n.label }}
        </text>

        <!-- Badge (e.g. BF or weight) -->
        <g v-if="n.badge" transform="translate(18, -18)">
          <rect x="-14" y="-9" width="28" height="16" rx="6" fill="#0f172a" />
          <text
            dy="0.3em"
            text-anchor="middle"
            fill="#fbbf24"
            class="font-mono text-[10px] font-semibold"
          >
            {{ n.badge }}
          </text>
        </g>

        <!-- SubLabel (e.g. ltag/rtag or code) -->
        <text
          v-if="n.subLabel"
          y="33"
          text-anchor="middle"
          class="font-mono text-[10px] fill-slate-500 dark:fill-slate-400"
        >
          {{ n.subLabel }}
        </text>

        <!-- Interactive +L / +R quick slots in editable mode -->
        <g v-if="editable && !n.hasLeft" transform="translate(-26, 24)" @click.stop="emit('addChild', n.id, 'left')">
          <circle r="10" fill="#eef2ff" stroke="#6366f1" stroke-width="1.2" stroke-dasharray="2 2" />
          <text dy="0.35em" text-anchor="middle" fill="#4f46e5" class="font-mono text-[10px] font-bold">+L</text>
        </g>
        <g v-if="editable && !n.hasRight" transform="translate(26, 24)" @click.stop="emit('addChild', n.id, 'right')">
          <circle r="10" fill="#eef2ff" stroke="#6366f1" stroke-width="1.2" stroke-dasharray="2 2" />
          <text dy="0.35em" text-anchor="middle" fill="#4f46e5" class="font-mono text-[10px] font-bold">+R</text>
        </g>
      </g>
    </svg>
  </div>
</template>
