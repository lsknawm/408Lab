import type { SimStep } from '../../../types/core';

export interface BankerProcess {
  pid: string;
  max: number[];
  alloc: number[];
}

export interface BankerStepState {
  available: number[];
  work: number[];
  finish: boolean[];
  safeSeq: string[];
  activeRowIdx?: number;
  rows: Array<{
    pid: string;
    max: string;
    alloc: string;
    need: string;
    finish: boolean;
  }>;
  outcome?: 'safe' | 'unsafe' | 'error';
}

export function simulateBanker(
  procs: BankerProcess[],
  availInput: number[],
  reqPid?: string | null,
  reqVec?: number[]
): SimStep<BankerStepState>[] {
  const m = availInput.length;
  const n = procs.length;
  const maxMat = procs.map((p) => [...p.max]);
  const allocMat = procs.map((p) => [...p.alloc]);
  const avail = [...availInput];

  const needMat = () =>
    procs.map((_, i) => Array.from({ length: m }, (__, j) => Math.max(0, maxMat[i][j] - allocMat[i][j])));

  const makeRows = (finish: boolean[]) => {
    const nd = needMat();
    return procs.map((p, i) => ({
      pid: p.pid,
      max: maxMat[i].join(' '),
      alloc: allocMat[i].join(' '),
      need: nd[i].join(' '),
      finish: finish[i],
    }));
  };

  const steps: SimStep<BankerStepState>[] = [];

  // Optional Request check first
  if (reqPid && reqVec && reqVec.some((v) => v > 0)) {
    const pIdx = procs.findIndex((p) => p.pid === reqPid);
    if (pIdx !== -1) {
      const nd = needMat()[pIdx];
      const leNeed = reqVec.every((v, j) => v <= nd[j]);
      if (!leNeed) {
        steps.push({
          title: `请求被拒绝：Request > Need[${reqPid}]`,
          description: `请求 [${reqVec.join(', ')}] 超过了进程 ${reqPid} 声明的最大尚需 Need [${nd.join(', ')}]，出错拒绝！`,
          codeLine: 2,
          state: {
            available: [...avail],
            work: [...avail],
            finish: Array(n).fill(false),
            safeSeq: [],
            activeRowIdx: pIdx,
            rows: makeRows(Array(n).fill(false)),
            outcome: 'error',
          },
        });
        return steps;
      }

      const leAvail = reqVec.every((v, j) => v <= avail[j]);
      if (!leAvail) {
        steps.push({
          title: `请求阻塞：Request > Available`,
          description: `请求 [${reqVec.join(', ')}] 超过了系统当前空闲资源 [${avail.join(', ')}]，${reqPid} 必须阻塞等待！`,
          codeLine: 3,
          state: {
            available: [...avail],
            work: [...avail],
            finish: Array(n).fill(false),
            safeSeq: [],
            activeRowIdx: pIdx,
            rows: makeRows(Array(n).fill(false)),
            outcome: 'error',
          },
        });
        return steps;
      }

      // Trial allocation
      for (let j = 0; j < m; j++) {
        avail[j] -= reqVec[j];
        allocMat[pIdx][j] += reqVec[j];
      }
      steps.push({
        title: `对 ${reqPid} 试分配 [${reqVec.join(', ')}]`,
        description: `满足 Request <= Need 且 Request <= Available，更新试分配后 Available=[${avail.join(', ')}]，现启动安全性检查！`,
        codeLine: 4,
        state: {
          available: [...avail],
          work: [...avail],
          finish: Array(n).fill(false),
          safeSeq: [],
          activeRowIdx: pIdx,
          rows: makeRows(Array(n).fill(false)),
        },
      });
    }
  }

  // Safety algorithm
  const work = [...avail];
  const finish = Array(n).fill(false);
  const safeSeq: string[] = [];
  const nd = needMat();

  steps.push({
    title: '启动安全性检查算法',
    description: `初始化 Work = Available = [${work.join(', ')}]，所有 Finish[i] = false。`,
    codeLine: 6,
    state: {
      available: [...avail],
      work: [...work],
      finish: [...finish],
      safeSeq: [],
      rows: makeRows(finish),
    },
  });

  let progress = true;
  while (safeSeq.length < n && progress) {
    progress = false;
    for (let i = 0; i < n; i++) {
      if (!finish[i] && nd[i].every((val, j) => val <= work[j])) {
        for (let j = 0; j < m; j++) work[j] += allocMat[i][j];
        finish[i] = true;
        safeSeq.push(procs[i].pid);
        progress = true;
        steps.push({
          title: `选中进程 ${procs[i].pid} (Need <= Work)`,
          description: `${procs[i].pid} 的 Need [${nd[i].join(', ')}] <= Work，运行完毕后回收其 Allocation [${allocMat[i].join(', ')}]，新 Work = [${work.join(', ')}]。`,
          codeLine: 9,
          state: {
            available: [...avail],
            work: [...work],
            finish: [...finish],
            safeSeq: [...safeSeq],
            activeRowIdx: i,
            rows: makeRows(finish),
          },
        });
        break;
      }
    }
  }

  if (safeSeq.length === n) {
    steps.push({
      title: `系统处于安全状态！安全序列: <${safeSeq.join(', ')}>`,
      description: `所有 ${n} 个进程均能顺利完成，存在安全序列 <${safeSeq.join(', ')}>。${reqPid ? '试分配正式生效！' : ''}`,
      codeLine: 11,
      state: {
        available: [...avail],
        work: [...work],
        finish: [...finish],
        safeSeq: [...safeSeq],
        rows: makeRows(finish),
        outcome: 'safe',
      },
    });
  } else {
    steps.push({
      title: '⚠️ 系统处于不安全状态！未找到安全序列',
      description: `当前 Work=[${work.join(', ')}] 已无法满足任何剩余进程的需求！${reqPid ? '必须回滚试分配并拒绝该请求！' : '存在死锁风险！'}`,
      codeLine: 12,
      state: {
        available: [...avail],
        work: [...work],
        finish: [...finish],
        safeSeq: [...safeSeq],
        rows: makeRows(finish),
        outcome: 'unsafe',
      },
    });
  }

  return steps;
}

export interface RagResource {
  id: string;
  instances: number;
}

export interface RagEdge {
  id: string;
  kind: 'alloc' | 'request'; // alloc: R -> P, request: P -> R
  process: string;
  resource: string;
}

export interface RagStepState {
  reducedProcs: string[];
  removedEdges: string[];
  freeInstances: Record<string, number>;
  deadlocked: boolean | null;
}

export function simulateRagReduction(
  procs: string[],
  resources: RagResource[],
  edges: RagEdge[]
): SimStep<RagStepState>[] {
  const steps: SimStep<RagStepState>[] = [];
  const free: Record<string, number> = {};
  resources.forEach((r) => (free[r.id] = r.instances));
  edges.forEach((e) => {
    if (e.kind === 'alloc' && free[e.resource] !== undefined) {
      free[e.resource]--;
    }
  });

  const reduced = new Set<string>();
  const removedEdges = new Set<string>();

  steps.push({
    title: '初始化资源分配图 (RAG) 化简',
    description: `计算各资源当前剩余空闲实例：${resources.map((r) => `${r.id}余${free[r.id]}`).join('，')}。`,
    codeLine: 1,
    state: {
      reducedProcs: [],
      removedEdges: [],
      freeInstances: { ...free },
      deadlocked: null,
    },
  });

  let progress = true;
  while (reduced.size < procs.length && progress) {
    progress = false;
    for (const p of procs) {
      if (reduced.has(p)) continue;
      // Count requests from p per resource
      const reqCount: Record<string, number> = {};
      edges
        .filter((e) => e.kind === 'request' && e.process === p && !removedEdges.has(e.id))
        .forEach((e) => (reqCount[e.resource] = (reqCount[e.resource] || 0) + 1));

      const canSatisfy = Object.entries(reqCount).every(([r, cnt]) => (free[r] ?? 0) >= cnt);
      if (canSatisfy) {
        reduced.add(p);
        progress = true;
        // Remove all edges incident to p & reclaim allocated instances
        edges.forEach((e) => {
          if (e.process === p && !removedEdges.has(e.id)) {
            removedEdges.add(e.id);
            if (e.kind === 'alloc') free[e.resource]++;
          }
        });
        steps.push({
          title: `化简消去进程 ${p} 及其全部关联边`,
          description: `${p} 的全部请求均可被当前空闲实例满足！运行结束并释放所占资源，当前可用：${resources.map((r) => `${r.id}=${free[r.id]}`).join(', ')}。`,
          codeLine: 4,
          state: {
            reducedProcs: Array.from(reduced),
            removedEdges: Array.from(removedEdges),
            freeInstances: { ...free },
            deadlocked: null,
          },
        });
        break;
      }
    }
  }

  const allReduced = reduced.size === procs.length;
  steps.push({
    title: allReduced ? '✓ 图可完全化简：系统绝无死锁！' : '💀 图不可完全化简：发生死锁！',
    description: allReduced
      ? '所有进程都化简成孤立节点（即使原图存在环路，只要因多实例能完全化简，就无死锁！）。'
      : `剩余进程 [${procs.filter((p) => !reduced.has(p)).join(', ')}] 相互阻塞，形成死锁！`,
    codeLine: 7,
    state: {
      reducedProcs: Array.from(reduced),
      removedEdges: Array.from(removedEdges),
      freeInstances: { ...free },
      deadlocked: !allReduced,
    },
  });

  return steps;
}
