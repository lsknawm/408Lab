import type { SimStep } from '../../../types/core';

export interface ProcessDef {
  pid: string;
  arrival: number;
  burst: number;
  priority: number; // smaller number = higher priority
}

export type SchedAlgo = 'FCFS' | 'SJF' | 'SRTF' | 'RR' | 'PRIO' | 'PRIO_PREEMPT' | 'MLFQ';

export interface GanttBlock {
  pid: string;
  start: number;
  end: number;
}

export interface SchedMetricsRow {
  pid: string;
  arrival: number;
  burst: number;
  finish: number;
  turnaround: number;
  weightedTurnaround: number;
  wait: number;
}

export interface SchedStepState {
  time: number;
  running: string;
  readyQueue: string[];
  gantt: GanttBlock[];
  remaining: Record<string, number>;
  metrics: SchedMetricsRow[];
  avgTurnaround: number;
  avgWeighted: number;
  avgWait: number;
}

export function simulateScheduling(
  procs: ProcessDef[],
  algo: SchedAlgo,
  quantum = 2
): SimStep<SchedStepState>[] {
  if (procs.length === 0) return [];
  const sorted = [...procs].sort((a, b) => a.arrival - b.arrival || a.pid.localeCompare(b.pid));
  const rem: Record<string, number> = {};
  const finishTime: Record<string, number> = {};
  sorted.forEach((p) => (rem[p.pid] = p.burst));

  const gantt: GanttBlock[] = [];
  const steps: SimStep<SchedStepState>[] = [];

  // For RR & MLFQ queues
  const rrQueue: string[] = [];
  const mlfqQueues: [string[], string[], string[]] = [[], [], []];
  const procLevel: Record<string, number> = {};
  sorted.forEach((p) => (procLevel[p.pid] = 0));

  let curRunning: string | null = null;
  let sliceLeft = 0;
  const arrived = new Set<string>();
  let completedCount = 0;
  let t = 0;
  const maxT = 200;

  const buildMetrics = () => {
    const rows: SchedMetricsRow[] = sorted
      .filter((p) => finishTime[p.pid] !== undefined)
      .map((p) => {
        const fin = finishTime[p.pid];
        const tat = fin - p.arrival;
        const wtat = Number((tat / p.burst).toFixed(2));
        const wait = tat - p.burst;
        return {
          pid: p.pid,
          arrival: p.arrival,
          burst: p.burst,
          finish: fin,
          turnaround: tat,
          weightedTurnaround: wtat,
          wait,
        };
      });
    const cnt = rows.length || 1;
    return {
      metrics: rows,
      avgTurnaround: Number((rows.reduce((s, r) => s + r.turnaround, 0) / cnt).toFixed(2)),
      avgWeighted: Number((rows.reduce((s, r) => s + r.weightedTurnaround, 0) / cnt).toFixed(2)),
      avgWait: Number((rows.reduce((s, r) => s + r.wait, 0) / cnt).toFixed(2)),
    };
  };

  while (completedCount < sorted.length && t < maxT) {
    // 1. Enqueue newly arrived processes at time t
    const newlyArrived = sorted.filter((p) => p.arrival === t && !arrived.has(p.pid));
    for (const p of newlyArrived) {
      arrived.add(p.pid);
      if (algo === 'RR') rrQueue.push(p.pid);
      else if (algo === 'MLFQ') mlfqQueues[0].push(p.pid);
    }

    // 2. Check if current running process finished at end of t-1 (handled after t-1) or needs slice rotation
    if (algo === 'RR' && curRunning && sliceLeft === 0) {
      rrQueue.push(curRunning);
      curRunning = null;
    } else if (algo === 'MLFQ' && curRunning && sliceLeft === 0) {
      const nextLvl = Math.min(2, procLevel[curRunning] + 1);
      procLevel[curRunning] = nextLvl;
      mlfqQueues[nextLvl].push(curRunning);
      curRunning = null;
    } else if (algo === 'MLFQ' && curRunning) {
      // Preempt if a higher-level queue became non-empty
      const curLvl = procLevel[curRunning];
      if ((curLvl > 0 && mlfqQueues[0].length > 0) || (curLvl > 1 && mlfqQueues[1].length > 0)) {
        mlfqQueues[curLvl].push(curRunning);
        curRunning = null;
      }
    }

    // 3. Select process to run during [t, t+1)
    const readyCandidates = sorted.filter((p) => arrived.has(p.pid) && rem[p.pid] > 0 && p.pid !== curRunning);

    if (algo === 'FCFS') {
      if (!curRunning && readyCandidates.length > 0) {
        curRunning = readyCandidates[0].pid;
      }
    } else if (algo === 'SJF') {
      if (!curRunning && readyCandidates.length > 0) {
        readyCandidates.sort((a, b) => a.burst - b.burst || a.arrival - b.arrival);
        curRunning = readyCandidates[0].pid;
      }
    } else if (algo === 'SRTF') {
      const pool = sorted.filter((p) => arrived.has(p.pid) && rem[p.pid] > 0);
      if (pool.length > 0) {
        pool.sort((a, b) => rem[a.pid] - rem[b.pid] || a.arrival - b.arrival);
        curRunning = pool[0].pid;
      }
    } else if (algo === 'PRIO') {
      if (!curRunning && readyCandidates.length > 0) {
        readyCandidates.sort((a, b) => a.priority - b.priority || a.arrival - b.arrival);
        curRunning = readyCandidates[0].pid;
      }
    } else if (algo === 'PRIO_PREEMPT') {
      const pool = sorted.filter((p) => arrived.has(p.pid) && rem[p.pid] > 0);
      if (pool.length > 0) {
        pool.sort((a, b) => a.priority - b.priority || a.arrival - b.arrival);
        curRunning = pool[0].pid;
      }
    } else if (algo === 'RR') {
      if (!curRunning && rrQueue.length > 0) {
        curRunning = rrQueue.shift()!;
        sliceLeft = quantum;
      }
    } else if (algo === 'MLFQ') {
      if (!curRunning) {
        for (let lvl = 0; lvl < 3; lvl++) {
          if (mlfqQueues[lvl].length > 0) {
            curRunning = mlfqQueues[lvl].shift()!;
            sliceLeft = lvl === 0 ? 1 : lvl === 1 ? 2 : 4;
            break;
          }
        }
      }
    }

    const runId = curRunning ?? 'IDLE';
    if (gantt.length > 0 && gantt[gantt.length - 1].pid === runId && gantt[gantt.length - 1].end === t) {
      gantt[gantt.length - 1].end = t + 1;
    } else {
      gantt.push({ pid: runId, start: t, end: t + 1 });
    }

    const readySnapshot =
      algo === 'RR'
        ? [...rrQueue]
        : algo === 'MLFQ'
          ? [...mlfqQueues[0], ...mlfqQueues[1], ...mlfqQueues[2]]
          : sorted
              .filter((p) => arrived.has(p.pid) && rem[p.pid] > 0 && p.pid !== curRunning)
              .map((p) => p.pid);

    if (curRunning) {
      rem[curRunning]--;
      if (sliceLeft > 0) sliceLeft--;
    }

    const finJustNow = curRunning && rem[curRunning] === 0;
    if (finJustNow && curRunning) {
      finishTime[curRunning] = t + 1;
      completedCount++;
    }

    const mRes = buildMetrics();
    steps.push({
      title: `时间 [${t}, ${t + 1}): ${runId === 'IDLE' ? 'CPU 空闲' : `运行进程 ${runId}`}`,
      description: `${
        newlyArrived.length ? `新到达: [${newlyArrived.map((x) => x.pid).join(', ')}]。` : ''
      }${finJustNow ? `进程 ${curRunning} 在 t=${t + 1} 运行完毕！` : `就绪队列: [${readySnapshot.join(', ') || '空'}]`}`,
      codeLine: curRunning ? 4 : 2,
      state: {
        time: t + 1,
        running: runId,
        readyQueue: readySnapshot,
        gantt: gantt.map((b) => ({ ...b })),
        remaining: { ...rem },
        ...mRes,
      },
    });

    if (finJustNow) {
      curRunning = null;
      sliceLeft = 0;
    }

    t++;
  }

  return steps;
}
