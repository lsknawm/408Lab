import type { SimStep } from '../../../types/core';
import type { BinaryNodeData } from '../../../utils/treeLayout';

export type SortAlgo =
  | 'insertion'
  | 'binaryInsertion'
  | 'shell'
  | 'bubble'
  | 'quick'
  | 'selection'
  | 'heap'
  | 'merge';

export interface SortStepState {
  arr: number[];
  compareIndices: number[];
  swapIndices: number[];
  sortedIndices: number[];
  pivotIdx?: number;
  lowIdx?: number;
  highIdx?: number;
  comparisons: number;
  moves: number;
  heapSize?: number;
  heapTree?: BinaryNodeData | null;
}

function buildHeapVisual(arr: number[], heapSize: number, compare: number[], swap: number[]): BinaryNodeData | null {
  if (heapSize <= 0) return null;
  const compSet = new Set(compare);
  const swapSet = new Set(swap);
  const make = (idx: number): BinaryNodeData | null => {
    if (idx >= heapSize) return null;
    let highlight: BinaryNodeData['highlight'];
    if (swapSet.has(idx)) highlight = 'imbalanced';
    else if (compSet.has(idx)) highlight = 'active';
    return {
      id: `hp_${idx}`,
      label: String(arr[idx]),
      subLabel: `[${idx + 1}]`,
      highlight,
      left: make(2 * idx + 1),
      right: make(2 * idx + 2),
    };
  };
  return make(0);
}

export function simulateSort(inputArr: number[], algo: SortAlgo, shellGaps?: number[]): SimStep<SortStepState>[] {
  const arr = [...inputArr];
  const n = arr.length;
  const steps: SimStep<SortStepState>[] = [];
  let comparisons = 0;
  let moves = 0;
  const sorted = new Set<number>();

  const pushStep = (
    title: string,
    description: string,
    codeLine: number,
    opts?: {
      compare?: number[];
      swap?: number[];
      pivotIdx?: number;
      lowIdx?: number;
      highIdx?: number;
      heapSize?: number;
    }
  ) => {
    const compare = opts?.compare ?? [];
    const swap = opts?.swap ?? [];
    steps.push({
      title,
      description,
      codeLine,
      state: {
        arr: [...arr],
        compareIndices: compare,
        swapIndices: swap,
        sortedIndices: Array.from(sorted),
        pivotIdx: opts?.pivotIdx,
        lowIdx: opts?.lowIdx,
        highIdx: opts?.highIdx,
        comparisons,
        moves,
        heapSize: opts?.heapSize,
        heapTree:
          algo === 'heap' && opts?.heapSize !== undefined
            ? buildHeapVisual(arr, opts.heapSize, compare, swap)
            : undefined,
      },
    });
  };

  pushStep('初始序列', `待排序列共 ${n} 个元素：[${arr.join(', ')}]`, 1, {
    heapSize: algo === 'heap' ? n : undefined,
  });

  if (algo === 'insertion') {
    sorted.add(0);
    for (let i = 1; i < n; i++) {
      const temp = arr[i];
      moves++;
      let j = i - 1;
      pushStep(`第 ${i} 趟：取出待插元素 ${temp}`, `准备将 arr[${i}]=${temp} 插入到前方有序区 [0..${i - 1}]。`, 3, {
        compare: [i],
      });
      while (j >= 0) {
        comparisons++;
        if (arr[j] > temp) {
          arr[j + 1] = arr[j];
          moves++;
          pushStep(`元素 ${arr[j]} 后移`, `${arr[j]} > ${temp}，后移一位腾出空位。`, 5, { swap: [j, j + 1] });
          j--;
        } else {
          break;
        }
      }
      arr[j + 1] = temp;
      moves++;
      sorted.add(i);
      pushStep(`插入 ${temp} 到位置 ${j + 1}`, `有序区扩展至 [0..${i}]。`, 7, { swap: [j + 1] });
    }
  } else if (algo === 'binaryInsertion') {
    sorted.add(0);
    for (let i = 1; i < n; i++) {
      const temp = arr[i];
      moves++;
      let low = 0;
      let high = i - 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        comparisons++;
        pushStep(`折半查找插入位置 (mid=${mid})`, `比较 ${temp} 与 arr[${mid}]=${arr[mid]}。`, 4, {
          compare: [i, mid],
          lowIdx: low,
          highIdx: high,
        });
        if (arr[mid] > temp) high = mid - 1;
        else low = mid + 1;
      }
      for (let j = i - 1; j >= low; j--) {
        arr[j + 1] = arr[j];
        moves++;
      }
      arr[low] = temp;
      moves++;
      sorted.add(i);
      pushStep(`定位到插入点 ${low} 并后移插入 ${temp}`, `折半插入减少了比较次数，移动次数不变。`, 7, {
        swap: [low],
      });
    }
  } else if (algo === 'shell') {
    const gaps =
      shellGaps && shellGaps.length > 0
        ? shellGaps.filter((g) => g >= 1 && g < n)
        : (() => {
            const g: number[] = [];
            for (let d = Math.floor(n / 2); d >= 1; d = Math.floor(d / 2)) g.push(d);
            return g;
          })();
    if (gaps[gaps.length - 1] !== 1) gaps.push(1);
    for (const d of gaps) {
      pushStep(`希尔增量 d = ${d}`, `对间隔为 ${d} 的各个子序列分别执行直接插入排序。`, 2);
      for (let i = d; i < n; i++) {
        const temp = arr[i];
        moves++;
        let j = i - d;
        while (j >= 0) {
          comparisons++;
          if (arr[j] > temp) {
            arr[j + d] = arr[j];
            moves++;
            pushStep(`增量 ${d} 组内后移`, `arr[${j}]=${arr[j]} > ${temp}，向后移动 d=${d} 步。`, 5, {
              compare: [j, j + d],
              swap: [j + d],
            });
            j -= d;
          } else break;
        }
        arr[j + d] = temp;
        moves++;
      }
    }
    for (let k = 0; k < n; k++) sorted.add(k);
  } else if (algo === 'bubble') {
    for (let i = 0; i < n - 1; i++) {
      let swapped = false;
      for (let j = n - 1; j > i; j--) {
        comparisons++;
        if (arr[j - 1] > arr[j]) {
          [arr[j - 1], arr[j]] = [arr[j], arr[j - 1]];
          moves += 3;
          swapped = true;
          pushStep(`交换逆序对 (${arr[j]}, ${arr[j - 1]})`, `相邻逆序，交换位置将更小元素向前冒泡。`, 5, {
            swap: [j - 1, j],
          });
        } else {
          pushStep(`比较 arr[${j - 1}] 与 arr[${j}]`, `${arr[j - 1]} <= ${arr[j]}，无需交换。`, 4, {
            compare: [j - 1, j],
          });
        }
      }
      sorted.add(i);
      if (!swapped) {
        for (let k = 0; k < n; k++) sorted.add(k);
        pushStep(`本趟未发生交换，提前结束！`, `已有序，冒泡排序在第 ${i + 1} 趟提前终止。`, 7);
        break;
      }
    }
    sorted.add(n - 1);
  } else if (algo === 'quick') {
    const qsort = (low: number, high: number) => {
      if (low >= high) {
        if (low === high) sorted.add(low);
        return;
      }
      const pivot = arr[low];
      moves++;
      let l = low;
      let r = high;
      pushStep(`快排划分 [${low}..${high}]，枢轴 pivot = ${pivot}`, `挖坑法：取最左元素 ${pivot} 作枢轴。`, 3, {
        pivotIdx: low,
        lowIdx: l,
        highIdx: r,
      });
      while (l < r) {
        while (l < r) {
          comparisons++;
          if (arr[r] >= pivot) r--;
          else break;
        }
        if (l < r) {
          arr[l] = arr[r];
          moves++;
          pushStep(`右指针找到小值 ${arr[r]} 填左坑`, `将 arr[${r}]=${arr[r]} 移到左端位置 ${l}。`, 5, {
            swap: [l, r],
            lowIdx: l,
            highIdx: r,
          });
        }
        while (l < r) {
          comparisons++;
          if (arr[l] <= pivot) l++;
          else break;
        }
        if (l < r) {
          arr[r] = arr[l];
          moves++;
          pushStep(`左指针找到大值 ${arr[l]} 填右坑`, `将 arr[${l}]=${arr[l]} 移到右端位置 ${r}。`, 6, {
            swap: [l, r],
            lowIdx: l,
            highIdx: r,
          });
        }
      }
      arr[l] = pivot;
      moves++;
      sorted.add(l);
      pushStep(`枢轴 ${pivot} 最终归位到下标 ${l}`, `左侧元素均 <= ${pivot}，右侧均 >= ${pivot}。`, 7, {
        pivotIdx: l,
      });
      qsort(low, l - 1);
      qsort(l + 1, high);
    };
    qsort(0, n - 1);
  } else if (algo === 'selection') {
    for (let i = 0; i < n - 1; i++) {
      let minIdx = i;
      for (let j = i + 1; j < n; j++) {
        comparisons++;
        if (arr[j] < arr[minIdx]) minIdx = j;
        pushStep(`扫描寻最小值 (当前最小=${arr[minIdx]})`, `比较 arr[${j}]=${arr[j]} 与当前最小 ${arr[minIdx]}。`, 4, {
          compare: [j, minIdx],
        });
      }
      if (minIdx !== i) {
        [arr[i], arr[minIdx]] = [arr[minIdx], arr[i]];
        moves += 3;
      }
      sorted.add(i);
      pushStep(`第 ${i + 1} 趟确定最小值 ${arr[i]}`, `将本趟最小值交换至位置 ${i}。`, 6, { swap: [i, minIdx] });
    }
    sorted.add(n - 1);
  } else if (algo === 'heap') {
    const siftDown = (idx: number, size: number) => {
      let cur = idx;
      while (2 * cur + 1 < size) {
        let child = 2 * cur + 1;
        if (child + 1 < size) {
          comparisons++;
          if (arr[child + 1] > arr[child]) child++;
        }
        comparisons++;
        if (arr[cur] < arr[child]) {
          [arr[cur], arr[child]] = [arr[child], arr[cur]];
          moves += 3;
          pushStep(`堆下沉调整：交换 ${arr[child]} 与 ${arr[cur]}`, `孩子节点更大，交换后继续向下筛选。`, 5, {
            swap: [cur, child],
            heapSize: size,
          });
          cur = child;
        } else {
          break;
        }
      }
    };

    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
      siftDown(i, n);
    }
    pushStep('Floyd 自底向上建大根堆完成！', `堆顶元素 ${arr[0]} 为全序列最大值。`, 6, { heapSize: n });

    for (let end = n - 1; end > 0; end--) {
      [arr[0], arr[end]] = [arr[end], arr[0]];
      moves += 3;
      sorted.add(end);
      pushStep(`堆顶最大值 ${arr[end]} 换至末尾 [${end}]`, `将当前堆顶与末尾交换，有序区扩充，对前 ${end} 个元素重新下沉。`, 8, {
        swap: [0, end],
        heapSize: end,
      });
      siftDown(0, end);
    }
    sorted.add(0);
  } else if (algo === 'merge') {
    const msort = (l: number, r: number) => {
      if (l >= r) return;
      const mid = (l + r) >> 1;
      msort(l, mid);
      msort(mid + 1, r);
      const tmp: number[] = [];
      let i = l;
      let j = mid + 1;
      while (i <= mid && j <= r) {
        comparisons++;
        if (arr[i] <= arr[j]) {
          tmp.push(arr[i++]);
        } else {
          tmp.push(arr[j++]);
        }
        moves++;
      }
      while (i <= mid) {
        tmp.push(arr[i++]);
        moves++;
      }
      while (j <= r) {
        tmp.push(arr[j++]);
        moves++;
      }
      for (let k = 0; k < tmp.length; k++) {
        arr[l + k] = tmp[k];
        moves++;
      }
      if (l === 0 && r === n - 1) {
        for (let k = 0; k < n; k++) sorted.add(k);
      }
      pushStep(`二路归并 [${l}..${mid}] 与 [${mid + 1}..${r}]`, `合并为有序段：[${tmp.join(', ')}]`, 6, {
        swap: Array.from({ length: r - l + 1 }, (_, x) => l + x),
      });
    };
    msort(0, n - 1);
  }

  for (let k = 0; k < n; k++) sorted.add(k);
  pushStep(`排序完成！`, `共比较 ${comparisons} 次，数据移动 ${moves} 次。`, 9);
  return steps;
}

export function benchmarkAllSorts(arr: number[]) {
  const algos: { key: SortAlgo; name: string; stable: string }[] = [
    { key: 'insertion', name: '直接插入', stable: '稳定' },
    { key: 'binaryInsertion', name: '折半插入', stable: '稳定' },
    { key: 'shell', name: '希尔排序', stable: '不稳定' },
    { key: 'bubble', name: '冒泡排序', stable: '稳定' },
    { key: 'quick', name: '快速排序', stable: '不稳定' },
    { key: 'selection', name: '简单选择', stable: '不稳定' },
    { key: 'heap', name: '堆排序', stable: '不稳定' },
    { key: 'merge', name: '二路归并', stable: '稳定' },
  ];

  return algos.map((a) => {
    const s = simulateSort(arr, a.key);
    const last = s[s.length - 1].state;
    return {
      ...a,
      comparisons: last.comparisons,
      moves: last.moves,
    };
  });
}

export interface HashTableResult {
  tableSize: number;
  modP: number;
  strategy: 'linear' | 'quadratic' | 'chaining';
  openSlots: Array<{ index: number; key: number | null; probes: number }>;
  chains: Array<{ index: number; items: number[] }>;
  insertLogs: Array<{ key: number; hash0: number; finalSlot: number; probes: number; path: number[] }>;
  aslSuccessNum: number;
  aslSuccessDen: number;
  aslFailArr: number[];
  aslFailNum: number;
  aslFailDen: number;
  alpha: number;
}

export function simulateHashTable(
  keys: number[],
  m: number,
  p: number,
  strategy: 'linear' | 'quadratic' | 'chaining'
): HashTableResult {
  const tableSize = Math.max(5, Math.min(23, m));
  const modP = Math.max(2, Math.min(tableSize, p));
  const insertLogs: HashTableResult['insertLogs'] = [];

  if (strategy === 'chaining') {
    const chains = Array.from({ length: tableSize }, (_, index) => ({ index, items: [] as number[] }));
    let succSum = 0;
    for (const k of keys) {
      const h0 = ((k % modP) + modP) % modP;
      if (!chains[h0].items.includes(k)) {
        chains[h0].items.push(k);
        const probes = chains[h0].items.length;
        succSum += probes;
        insertLogs.push({ key: k, hash0: h0, finalSlot: h0, probes, path: [h0] });
      }
    }
    const aslFailArr = Array.from({ length: modP }, (_, i) => chains[i].items.length);
    const failSum = aslFailArr.reduce((a, b) => a + b, 0);
    return {
      tableSize,
      modP,
      strategy,
      openSlots: [],
      chains,
      insertLogs,
      aslSuccessNum: succSum,
      aslSuccessDen: insertLogs.length || 1,
      aslFailArr,
      aslFailNum: failSum,
      aslFailDen: modP,
      alpha: Number((insertLogs.length / tableSize).toFixed(3)),
    };
  }

  const slots: Array<{ index: number; key: number | null; probes: number }> = Array.from(
    { length: tableSize },
    (_, index) => ({ index, key: null, probes: 0 })
  );

  let succSum = 0;
  for (const k of keys) {
    const h0 = ((k % modP) + modP) % modP;
    const path: number[] = [];
    let placed = false;
    for (let step = 0; step < tableSize; step++) {
      let offset = 0;
      if (strategy === 'linear') {
        offset = step;
      } else {
        // 0, +1^2, -1^2, +2^2, -2^2...
        if (step > 0) {
          const d = Math.ceil(step / 2);
          offset = step % 2 === 1 ? d * d : -(d * d);
        }
      }
      const pos = ((h0 + offset) % tableSize + tableSize) % tableSize;
      path.push(pos);
      if (slots[pos].key === null) {
        slots[pos].key = k;
        slots[pos].probes = step + 1;
        succSum += step + 1;
        insertLogs.push({ key: k, hash0: h0, finalSlot: pos, probes: step + 1, path });
        placed = true;
        break;
      }
      if (slots[pos].key === k) {
        placed = true;
        break;
      }
    }
    if (!placed) break;
  }

  // Compute fail ASL for entry addresses 0..modP-1
  const aslFailArr: number[] = [];
  for (let addr = 0; addr < modP; addr++) {
    let count = 0;
    for (let step = 0; step < tableSize; step++) {
      let offset = 0;
      if (strategy === 'linear') offset = step;
      else if (step > 0) {
        const d = Math.ceil(step / 2);
        offset = step % 2 === 1 ? d * d : -(d * d);
      }
      const pos = ((addr + offset) % tableSize + tableSize) % tableSize;
      count++;
      if (slots[pos].key === null) break;
    }
    aslFailArr.push(count);
  }
  const failSum = aslFailArr.reduce((a, b) => a + b, 0);

  return {
    tableSize,
    modP,
    strategy,
    openSlots: slots,
    chains: [],
    insertLogs,
    aslSuccessNum: succSum,
    aslSuccessDen: insertLogs.length || 1,
    aslFailArr,
    aslFailNum: failSum,
    aslFailDen: modP,
    alpha: Number((insertLogs.length / tableSize).toFixed(3)),
  };
}
