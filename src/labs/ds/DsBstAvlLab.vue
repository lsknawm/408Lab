<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import BinaryTreeCanvas from '../../components/common/BinaryTreeCanvas.vue';
import { bindLabPlayer, useStepPlayer } from '../../composables/useStepPlayer';
import { simulateBstOrAvl, simulateRedBlackTree } from './engines/bstAvlEngine';
import { ElMessage } from 'element-plus';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const treeMode = ref<'avl' | 'bst' | 'rbt'>('avl');
const seqInput = ref('30, 20, 40, 10, 25, 22');
const singleKey = ref<number | undefined>(27);
const searchKey = ref<number | null>(null);

const parsedKeys = computed(() =>
  seqInput.value
    .split(/[\s,，]+/)
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n))
);

const steps = computed(() => {
  if (treeMode.value === 'rbt') {
    return simulateRedBlackTree(parsedKeys.value);
  }
  return simulateBstOrAvl(parsedKeys.value, treeMode.value, searchKey.value);
});

const player = useStepPlayer(steps, 900);
const playerBind = bindLabPlayer(player);

function appendKey() {
  if (singleKey.value === undefined || !Number.isFinite(singleKey.value)) return;
  if (parsedKeys.value.includes(singleKey.value)) {
    ElMessage.warning(`关键码 ${singleKey.value} 已存在`);
    return;
  }
  seqInput.value = [...parsedKeys.value, singleKey.value].join(', ');
  player.goToEnd();
}

function triggerSearch() {
  if (singleKey.value === undefined) return;
  searchKey.value = singleKey.value;
  player.goToEnd();
}

function loadPreset(kind: 'lr' | 'rl' | 'skew' | 'rbt') {
  searchKey.value = null;
  if (kind === 'lr') {
    treeMode.value = 'avl';
    seqInput.value = '30, 10, 20';
  } else if (kind === 'rl') {
    treeMode.value = 'avl';
    seqInput.value = '10, 30, 20';
  } else if (kind === 'skew') {
    seqInput.value = '10, 20, 30, 40, 50, 60';
  } else {
    treeMode.value = 'rbt';
    seqInput.value = '10, 20, 30, 15, 25, 5, 1, 22';
  }
  player.reset();
}

const pseudocodeLines = computed(() => {
  if (treeMode.value === 'rbt') {
    return [
      'InsertRedNode(T, z);',
      'while (z.parent != NULL && z.parent.color == RED) {',
      '  if (uncle.color == RED) {',
      '    // 叔父爷变色，指针上移至爷爷',
      '    parent.BLACK; uncle.BLACK; grand.RED; z = grand;',
      '  } else { // 叔叔是黑色：按LL/RR/LR/RL旋转',
      '    if (triangleCase) rotate(parent);',
      '    rotate(grand); recolor(newRoot->BLACK, grand->RED);',
      '  }',
      '} T.root.color = BLACK;',
    ];
  }
  return [
    'TreeNode* Insert(TreeNode* T, int key) {',
    '  if (!T) return new Node(key);',
    '  if (key < T->key) T->left = Insert(T->left, key);',
    '  else if (key > T->key) T->right = Insert(T->right, key);',
    '  if (mode == AVL) { updateHeight(T); bf = H(L)-H(R);',
    '    if (bf > 1 && key < T->L->key) return RotateRight(T); // LL',
    '    if (bf < -1 && key > T->R->key) return RotateLeft(T); // RR',
    '    if (bf > 1 && key > T->L->key) { // LR',
    '      T->L = RotateLeft(T->L); return RotateRight(T); }',
    '    if (bf < -1 && key < T->R->key) { // RL',
    '      T->R = RotateRight(T->R); return RotateLeft(T); }',
    '  } return T;',
    '}',
  ];
});
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :player="playerBind"
    :pseudocode="pseudocodeLines"
    :code-title="treeMode === 'rbt' ? '红黑树插入调整' : 'BST / AVL 插入与旋转'"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <div class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <el-radio-group v-model="treeMode" size="small">
              <el-radio-button value="avl">AVL 平衡二叉树 (显示 BF)</el-radio-button>
              <el-radio-button value="bst">普通 BST 二叉排序树</el-radio-button>
              <el-radio-button value="rbt">红黑树 (Red-Black Tree)</el-radio-button>
            </el-radio-group>

            <div class="flex flex-wrap gap-1.5">
              <el-button size="small" @click="loadPreset('lr')">LR 双旋示例</el-button>
              <el-button size="small" @click="loadPreset('rl')">RL 双旋示例</el-button>
              <el-button size="small" @click="loadPreset('skew')">递增序列(对比BST退化)</el-button>
              <el-button size="small" type="danger" plain @click="loadPreset('rbt')">红黑树连调例</el-button>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
            <div class="md:col-span-7">
              <el-input
                v-model="seqInput"
                size="small"
                class="font-mono"
                placeholder="输入插入关键码序列，例如 30, 20, 40, 10, 25, 22"
                @change="searchKey = null"
              >
                <template #prepend>插入序列</template>
              </el-input>
            </div>
            <div class="md:col-span-5 flex flex-wrap items-center gap-2">
              <el-input-number v-model="singleKey" size="small" style="width: 110px" />
              <el-button type="primary" size="small" @click="appendKey">追加插入</el-button>
              <el-button v-if="treeMode !== 'rbt'" type="success" size="small" plain @click="triggerSearch">
                查找追踪
              </el-button>
              <el-button v-if="searchKey !== null" size="small" @click="searchKey = null">清除查找</el-button>
            </div>
          </div>
        </div>
      </el-card>
    </template>

    <template #stage>
      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-3 text-xs">
          <span v-if="treeMode === 'avl'" class="inline-flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-full bg-rose-500 inline-block"></span>红色：最小失衡子树根 (|BF|=2)
          </span>
          <span v-if="treeMode === 'avl'" class="inline-flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>琥珀色：新插入 / 旋转涉及节点
          </span>
          <el-tag
            v-if="player.currentStep.value?.state.rotationType"
            type="danger"
            effect="dark"
            size="small"
          >
            {{ player.currentStep.value.state.rotationType }}
          </el-tag>
        </div>

        <BinaryTreeCanvas
          :root="player.currentStep.value?.state.visualRoot ?? null"
          min-height="360px"
        />
      </div>
    </template>
  </LabShell>
</template>
