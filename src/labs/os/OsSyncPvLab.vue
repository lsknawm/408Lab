<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { TopicMeta } from '../../types/core';
import LabShell from '../../components/common/LabShell.vue';
import { ElMessage } from 'element-plus';

defineProps<{ topic: TopicMeta; mastered: boolean }>();
const emit = defineEmits<{ (e: 'toggleMastered'): void }>();

const model = ref<'pc' | 'rw' | 'philo'>('pc');

// ================= 1. Producer-Consumer =================
const bufCap = ref(3);
const wrongOrder = ref(false);
const pcState = reactive({
  buffer: [] as string[],
  semMutex: 1,
  semEmpty: 3,
  semFull: 0,
  blockedQueue: [] as string[],
  prodPc: 0, // 0: P(empty/mutex), 1: P(mutex/empty), 2: put item, 3: V(mutex), 4: V(full)
  consPc: 0, // 0: P(full/mutex), 1: P(mutex/full), 2: get item, 3: V(mutex), 4: V(empty)
  prodBlocked: false,
  consBlocked: false,
  itemSeq: 1,
  logs: ['系统初始化：mutex = 1, empty = 3, full = 0。可以自由交替推进生产者与消费者！'] as string[],
});

function resetPc() {
  pcState.buffer = [];
  pcState.semMutex = 1;
  pcState.semEmpty = bufCap.value;
  pcState.semFull = 0;
  pcState.blockedQueue = [];
  pcState.prodPc = 0;
  pcState.consPc = 0;
  pcState.prodBlocked = false;
  pcState.consBlocked = false;
  pcState.itemSeq = 1;
  pcState.logs = [`已重置：缓冲区大小 N=${bufCap.value}，顺序模式=${wrongOrder.value ? '⚠️ 错误(先P(mutex))' : '✓ 正确(先P(同步))'}`];
}

function tryWakeBlocked() {
  if (pcState.prodBlocked) {
    const waitingFor = wrongOrder.value ? (pcState.prodPc === 0 ? 'mutex' : 'empty') : pcState.prodPc === 0 ? 'empty' : 'mutex';
    if (waitingFor === 'empty' && pcState.semEmpty >= 0) {
      pcState.prodBlocked = false;
      pcState.prodPc++;
      pcState.blockedQueue = pcState.blockedQueue.filter((x) => !x.startsWith('生产者'));
      pcState.logs.unshift('生产者被 V(empty) 唤醒，继续执行！');
    } else if (waitingFor === 'mutex' && pcState.semMutex >= 0) {
      pcState.prodBlocked = false;
      pcState.prodPc++;
      pcState.blockedQueue = pcState.blockedQueue.filter((x) => !x.startsWith('生产者'));
      pcState.logs.unshift('生产者被 V(mutex) 唤醒，进入临界区！');
    }
  }
  if (pcState.consBlocked) {
    const waitingFor = wrongOrder.value ? (pcState.consPc === 0 ? 'mutex' : 'full') : pcState.consPc === 0 ? 'full' : 'mutex';
    if (waitingFor === 'full' && pcState.semFull >= 0) {
      pcState.consBlocked = false;
      pcState.consPc++;
      pcState.blockedQueue = pcState.blockedQueue.filter((x) => !x.startsWith('消费者'));
      pcState.logs.unshift('消费者被 V(full) 唤醒，继续执行！');
    } else if (waitingFor === 'mutex' && pcState.semMutex >= 0) {
      pcState.consBlocked = false;
      pcState.consPc++;
      pcState.blockedQueue = pcState.blockedQueue.filter((x) => !x.startsWith('消费者'));
      pcState.logs.unshift('消费者被 V(mutex) 唤醒，进入临界区！');
    }
  }
}

function stepProducer() {
  if (pcState.prodBlocked) {
    ElMessage.warning('生产者当前处于阻塞态！请先推进消费者释放资源。');
    return;
  }
  const pc = pcState.prodPc;
  const doP = (semKey: 'semMutex' | 'semEmpty', label: string) => {
    pcState[semKey]--;
    if (pcState[semKey] < 0) {
      pcState.prodBlocked = true;
      pcState.blockedQueue.push(`生产者(等${label})`);
      pcState.logs.unshift(`生产者执行 P(${label}) 后 ${label}=${pcState[semKey]} < 0 → 阻塞排队！`);
    } else {
      pcState.prodPc++;
      pcState.logs.unshift(`生产者执行 P(${label}) 成功，${label}=${pcState[semKey]}。`);
    }
  };

  if (pc === 0) {
    if (wrongOrder.value) doP('semMutex', 'mutex');
    else doP('semEmpty', 'empty');
  } else if (pc === 1) {
    if (wrongOrder.value) doP('semEmpty', 'empty');
    else doP('semMutex', 'mutex');
  } else if (pc === 2) {
    const item = `#${pcState.itemSeq++}`;
    pcState.buffer.push(item);
    pcState.prodPc++;
    pcState.logs.unshift(`生产者向缓冲区放入产品 ${item}。`);
  } else if (pc === 3) {
    pcState.semMutex++;
    pcState.prodPc++;
    pcState.logs.unshift(`生产者执行 V(mutex)，mutex=${pcState.semMutex}。`);
    tryWakeBlocked();
  } else if (pc === 4) {
    pcState.semFull++;
    pcState.prodPc = 0;
    pcState.logs.unshift(`生产者执行 V(full)，full=${pcState.semFull}，完成一轮生产。`);
    tryWakeBlocked();
  }
}

function stepConsumer() {
  if (pcState.consBlocked) {
    ElMessage.warning('消费者当前处于阻塞态！请先推进生产者释放资源。');
    return;
  }
  const pc = pcState.consPc;
  const doP = (semKey: 'semMutex' | 'semFull', label: string) => {
    pcState[semKey]--;
    if (pcState[semKey] < 0) {
      pcState.consBlocked = true;
      pcState.blockedQueue.push(`消费者(等${label})`);
      pcState.logs.unshift(`消费者执行 P(${label}) 后 ${label}=${pcState[semKey]} < 0 → 阻塞排队！`);
    } else {
      pcState.consPc++;
      pcState.logs.unshift(`消费者执行 P(${label}) 成功，${label}=${pcState[semKey]}。`);
    }
  };

  if (pc === 0) {
    if (wrongOrder.value) doP('semMutex', 'mutex');
    else doP('semFull', 'full');
  } else if (pc === 1) {
    if (wrongOrder.value) doP('semFull', 'full');
    else doP('semMutex', 'mutex');
  } else if (pc === 2) {
    const item = pcState.buffer.shift() || '?';
    pcState.consPc++;
    pcState.logs.unshift(`消费者从缓冲区取出产品 ${item}。`);
  } else if (pc === 3) {
    pcState.semMutex++;
    pcState.consPc++;
    pcState.logs.unshift(`消费者执行 V(mutex)，mutex=${pcState.semMutex}。`);
    tryWakeBlocked();
  } else if (pc === 4) {
    pcState.semEmpty++;
    pcState.consPc = 0;
    pcState.logs.unshift(`消费者执行 V(empty)，empty=${pcState.semEmpty}，完成一轮消费。`);
    tryWakeBlocked();
  }
}

const isDeadlocked = computed(() => pcState.prodBlocked && pcState.consBlocked);

// ================= 2. Readers-Writers =================
const rwFair = ref(false);
const rwState = reactive({
  readCount: 0,
  rwSem: 1,
  wQueueSem: 1,
  activeReaders: [] as string[],
  activeWriter: null as string | null,
  waitingWriters: [] as string[],
  waitingReaders: [] as string[],
  nextId: 1,
  logs: ['可点击上方按钮模拟读者进入、写者请求，对比读优先(写饥饿) vs 读写公平！'] as string[],
});

function resetRw() {
  rwState.readCount = 0;
  rwState.rwSem = 1;
  rwState.wQueueSem = 1;
  rwState.activeReaders = [];
  rwState.activeWriter = null;
  rwState.waitingWriters = [];
  rwState.waitingReaders = [];
  rwState.nextId = 1;
  rwState.logs = [`已切换为 ${rwFair.value ? '读写公平法 (带排队信号量 S)' : '读者优先法'}`];
}

function addReader() {
  const name = `R${rwState.nextId++}`;
  if (rwFair.value && rwState.waitingWriters.length > 0) {
    rwState.waitingReaders.push(name);
    rwState.logs.unshift(`公平模式：有写者 ${rwState.waitingWriters[0]} 在先排队，新读者 ${name} 阻塞在排队信号量 S 后，防止写者饥饿！`);
    return;
  }
  if (rwState.activeWriter) {
    rwState.waitingReaders.push(name);
    rwState.logs.unshift(`写者 ${rwState.activeWriter} 正在写，读者 ${name} 阻塞等待 rw=1。`);
    return;
  }
  rwState.readCount++;
  rwState.activeReaders.push(name);
  if (rwState.readCount === 1) rwState.rwSem = 0;
  rwState.logs.unshift(`读者 ${name} 开始读（当前共有 ${rwState.readCount} 位读者并行，rw=${rwState.rwSem}）。`);
}

function addWriter() {
  const name = `W${rwState.nextId++}`;
  if (rwState.activeWriter || rwState.activeReaders.length > 0) {
    rwState.waitingWriters.push(name);
    rwState.logs.unshift(`写者 ${name} 请求写：临界区非空，阻塞等待（当前等待写者: ${rwState.waitingWriters.length}）。`);
    return;
  }
  rwState.activeWriter = name;
  rwState.rwSem = 0;
  rwState.logs.unshift(`写者 ${name} 独占进入临界区开始写！`);
}

function finishOneReader() {
  const r = rwState.activeReaders.shift();
  if (!r) return;
  rwState.readCount--;
  if (rwState.readCount === 0) {
    rwState.rwSem = 1;
    if (rwState.waitingWriters.length > 0) {
      const w = rwState.waitingWriters.shift()!;
      rwState.activeWriter = w;
      rwState.rwSem = 0;
      rwState.logs.unshift(`最后一位读者 ${r} 退出并 V(rw)，唤醒等待中的写者 ${w}！`);
      return;
    }
  }
  rwState.logs.unshift(`读者 ${r} 读毕退出（剩余读者 ${rwState.readCount}）。`);
}

function finishWriter() {
  if (!rwState.activeWriter) return;
  const old = rwState.activeWriter;
  rwState.activeWriter = null;
  rwState.rwSem = 1;
  if (rwState.waitingReaders.length > 0 && (!rwFair.value || rwState.waitingWriters.length === 0)) {
    while (rwState.waitingReaders.length > 0) {
      const r = rwState.waitingReaders.shift()!;
      rwState.activeReaders.push(r);
      rwState.readCount++;
    }
    rwState.rwSem = 0;
    rwState.logs.unshift(`写者 ${old} 完成并 V(rw)，唤醒等待中的读者 [${rwState.activeReaders.join(',')}]！`);
  } else if (rwState.waitingWriters.length > 0) {
    const w = rwState.waitingWriters.shift()!;
    rwState.activeWriter = w;
    rwState.rwSem = 0;
    rwState.logs.unshift(`写者 ${old} 完成，唤醒下一位写者 ${w}！`);
  } else {
    rwState.logs.unshift(`写者 ${old} 完成并释放 rw=1。`);
  }
}

// ================= 3. Dining Philosophers =================
const philoSafe = ref(false);
const forks = reactive([1, 1, 1, 1, 1]); // 1 means free
const philoStates = reactive<Array<'thinking' | 'holdingLeft' | 'eating' | 'blocked'>>([
  'thinking',
  'thinking',
  'thinking',
  'thinking',
  'thinking',
]);

function resetPhilo() {
  for (let i = 0; i < 5; i++) {
    forks[i] = 1;
    philoStates[i] = 'thinking';
  }
}

function stepPhilo(idx: number) {
  const left = idx;
  const right = (idx + 1) % 5;
  const st = philoStates[idx];
  if (st === 'thinking') {
    if (philoSafe.value) {
      // Atomic or odd-even
      if (forks[left] === 1 && forks[right] === 1) {
        forks[left] = 0;
        forks[right] = 0;
        philoStates[idx] = 'eating';
      } else {
        ElMessage.info(`哲学家 P${idx} 需同时拿到左右筷子(${left},${right})才拿，避免占1根死锁！`);
      }
    } else {
      if (forks[left] === 1) {
        forks[left] = 0;
        philoStates[idx] = 'holdingLeft';
      } else {
        philoStates[idx] = 'blocked';
      }
    }
  } else if (st === 'holdingLeft') {
    if (forks[right] === 1) {
      forks[right] = 0;
      philoStates[idx] = 'eating';
    } else {
      philoStates[idx] = 'blocked';
    }
  } else if (st === 'eating') {
    forks[left] = 1;
    forks[right] = 1;
    philoStates[idx] = 'thinking';
    // Unblock neighbors if holdingLeft and waiting
    for (let k = 0; k < 5; k++) {
      if (philoStates[k] === 'blocked') {
        const rk = (k + 1) % 5;
        if (forks[rk] === 1) {
          forks[rk] = 0;
          philoStates[k] = 'eating';
        }
      }
    }
  }
}

function triggerAllPickLeft() {
  philoSafe.value = false;
  resetPhilo();
  for (let i = 0; i < 5; i++) stepPhilo(i);
  for (let i = 0; i < 5; i++) stepPhilo(i);
}

const philoDeadlock = computed(() => philoStates.every((s) => s === 'blocked'));

const pcPseudo = computed(() =>
  wrongOrder.value
    ? [
        '// ⚠️ 错误顺序: 先锁 mutex 再等同步信号量!',
        'Producer() { P(mutex); P(empty); put(); V(mutex); V(full); }',
        'Consumer() { P(mutex); P(full);  get(); V(mutex); V(empty); }',
        '// 满/空时将永久互锁死锁!',
      ]
    : [
        '// ✓ 正确顺序: 先申请同步信号量，再申请互斥 mutex',
        'Producer() { P(empty); P(mutex); put(); V(mutex); V(full); }',
        'Consumer() { P(full);  P(mutex); get(); V(mutex); V(empty); }',
      ]
);
</script>

<template>
  <LabShell
    :topic="topic"
    :mastered="mastered"
    :pseudocode="model === 'pc' ? pcPseudo : []"
    @toggle-mastered="emit('toggleMastered')"
  >
    <template #controls>
      <el-card shadow="never" class="!rounded-xl border-slate-200 dark:border-slate-800">
        <el-tabs v-model="model" class="!mb-0">
          <el-tab-pane label="生产者-消费者 (含错误顺序死锁复现)" name="pc">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex flex-wrap items-center gap-3">
                <div class="flex items-center gap-1.5">
                  <span class="text-xs text-slate-500">缓冲区容量 N:</span>
                  <el-input-number v-model="bufCap" :min="1" :max="6" size="small" style="width: 85px" @change="resetPc" />
                </div>
                <el-switch
                  v-model="wrongOrder"
                  active-color="#ef4444"
                  active-text="⚠️ 颠倒为 P(mutex) 在前"
                  inactive-text="✓ 正确先 P(同步)"
                  @change="resetPc"
                />
              </div>

              <div class="flex flex-wrap gap-2">
                <el-button type="primary" size="small" @click="stepProducer">推进生产者一步 (PC={{ pcState.prodPc }})</el-button>
                <el-button type="success" size="small" @click="stepConsumer">推进消费者一步 (PC={{ pcState.consPc }})</el-button>
                <el-button size="small" @click="resetPc">重置</el-button>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="读者-写者模型 (读优先 vs 公平)" name="rw">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <el-switch
                v-model="rwFair"
                active-text="读写公平法 (队列信号量 S)"
                inactive-text="读者优先法 (写者可能饥饿)"
                @change="resetRw"
              />
              <div class="flex flex-wrap gap-2">
                <el-button type="primary" size="small" @click="addReader">+ 读者请求进入</el-button>
                <el-button type="warning" size="small" @click="addWriter">+ 写者请求进入</el-button>
                <el-button size="small" @click="finishOneReader">1位读者完成</el-button>
                <el-button size="small" @click="finishWriter">写者完成</el-button>
                <el-button size="small" @click="resetRw">重置</el-button>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="哲学家进餐问题" name="philo">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <el-switch
                v-model="philoSafe"
                active-text="AND型同时拿两根筷子 (无死锁)"
                inactive-text="逐根先拿左再拿右 (易死锁)"
                @change="resetPhilo"
              />
              <div class="flex gap-2">
                <el-button type="danger" size="small" @click="triggerAllPickLeft">一键复现 5 人全拿左筷死锁</el-button>
                <el-button size="small" @click="resetPhilo">重置餐桌</el-button>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <template #stage>
      <!-- Stage 1: Producer-Consumer -->
      <div v-if="model === 'pc'" class="space-y-4">
        <el-alert
          v-if="isDeadlocked"
          type="error"
          effect="dark"
          :closable="false"
          title="💀 死锁发生！生产者与消费者均已永久阻塞！"
          description="因为先加了 P(mutex) 互斥锁，持有锁的一方在等 empty/full，另一方则卡在 P(mutex) 无法进入临界区释放空间/产品！"
        />

        <div class="grid grid-cols-3 gap-3 font-mono text-center">
          <div class="p-3 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20">
            <div class="text-xs text-slate-500">mutex (互斥)</div>
            <div class="text-2xl font-bold" :class="pcState.semMutex < 0 ? 'text-rose-600' : 'text-indigo-600'">
              {{ pcState.semMutex }}
            </div>
          </div>
          <div class="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20">
            <div class="text-xs text-slate-500">empty (空槽)</div>
            <div class="text-2xl font-bold" :class="pcState.semEmpty < 0 ? 'text-rose-600' : 'text-emerald-600'">
              {{ pcState.semEmpty }}
            </div>
          </div>
          <div class="p-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20">
            <div class="text-xs text-slate-500">full (产品)</div>
            <div class="text-2xl font-bold" :class="pcState.semFull < 0 ? 'text-rose-600' : 'text-amber-600'">
              {{ pcState.semFull }}
            </div>
          </div>
        </div>

        <!-- Buffer Slots -->
        <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div class="text-xs font-semibold text-slate-500 mb-2">共享有界缓冲区 (容量 {{ bufCap }})</div>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="idx in bufCap"
              :key="idx"
              :class="[
                'w-20 h-14 rounded-xl border-2 flex items-center justify-center font-mono font-bold text-sm transition-all',
                pcState.buffer[idx - 1]
                  ? 'bg-indigo-600 text-white border-indigo-700'
                  : 'bg-white dark:bg-slate-800 border-dashed border-slate-300 dark:border-slate-700 text-slate-400',
              ]"
            >
              {{ pcState.buffer[idx - 1] || '空位' }}
            </div>
          </div>
        </div>

        <!-- Blocked Queue & Logs -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div class="text-xs font-semibold text-rose-500 mb-2">阻塞队列 Blocked Queue</div>
            <div class="flex flex-wrap gap-1.5">
              <el-tag v-for="b in pcState.blockedQueue" :key="b" type="danger" effect="dark">{{ b }}</el-tag>
              <span v-if="pcState.blockedQueue.length === 0" class="text-xs text-slate-400">当前无阻塞进程</span>
            </div>
          </div>
          <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 max-h-[140px] overflow-y-auto space-y-1 text-xs font-mono">
            <div v-for="(l, i) in pcState.logs" :key="i" class="text-slate-600 dark:text-slate-300">• {{ l }}</div>
          </div>
        </div>
      </div>

      <!-- Stage 2: Readers-Writers -->
      <div v-else-if="model === 'rw'" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20">
            <div class="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-2">
              正在访问共享文件的进程 (readCount={{ rwState.readCount }}, rw={{ rwState.rwSem }})
            </div>
            <div class="flex flex-wrap gap-2 min-h-[48px] items-center">
              <el-tag v-for="r in rwState.activeReaders" :key="r" type="success" effect="dark">{{ r }} (读)</el-tag>
              <el-tag v-if="rwState.activeWriter" type="danger" effect="dark">{{ rwState.activeWriter }} (独占写)</el-tag>
              <span v-if="!rwState.activeWriter && rwState.activeReaders.length === 0" class="text-xs text-slate-400">文件空闲</span>
            </div>
          </div>

          <div class="p-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20">
            <div class="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">等待队列</div>
            <div class="flex flex-wrap gap-1.5">
              <el-tag v-for="w in rwState.waitingWriters" :key="w" type="warning" effect="dark">{{ w }} (等写)</el-tag>
              <el-tag v-for="r in rwState.waitingReaders" :key="r" type="info">{{ r }} (等读)</el-tag>
              <span v-if="rwState.waitingWriters.length + rwState.waitingReaders.length === 0" class="text-xs text-slate-400">无等待进程</span>
            </div>
          </div>
        </div>

        <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 max-h-[150px] overflow-y-auto space-y-1 text-xs font-mono">
          <div v-for="(l, i) in rwState.logs" :key="i">• {{ l }}</div>
        </div>
      </div>

      <!-- Stage 3: Dining Philosophers -->
      <div v-else class="space-y-4">
        <el-alert
          v-if="philoDeadlock"
          type="error"
          effect="dark"
          :closable="false"
          title="💀 5 位哲学家全部手持左筷并等待右筷，构成循环等待死锁！"
        />
        <div class="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <el-card
            v-for="idx in 5"
            :key="idx"
            shadow="never"
            class="text-center cursor-pointer hover:border-indigo-500 transition-colors"
            @click="stepPhilo(idx - 1)"
          >
            <div class="font-mono font-bold text-base mb-1">哲学家 P{{ idx - 1 }}</div>
            <el-tag
              size="small"
              :type="
                philoStates[idx - 1] === 'eating'
                  ? 'success'
                  : philoStates[idx - 1] === 'blocked'
                    ? 'danger'
                    : philoStates[idx - 1] === 'holdingLeft'
                      ? 'warning'
                      : 'info'
              "
            >
              {{
                philoStates[idx - 1] === 'eating'
                  ? '正在进餐'
                  : philoStates[idx - 1] === 'blocked'
                    ? '阻塞等右筷'
                    : philoStates[idx - 1] === 'holdingLeft'
                      ? '拿了左筷'
                      : '思考中'
              }}
            </el-tag>
            <div class="mt-2 text-[11px] font-mono text-slate-500">
              左筷{{ idx - 1 }}({{ forks[idx - 1] }}) · 右筷{{ idx % 5 }}({{ forks[idx % 5] }})
            </div>
            <div class="mt-2 text-[11px] text-indigo-500">点击单步推进</div>
          </el-card>
        </div>
      </div>
    </template>
  </LabShell>
</template>
