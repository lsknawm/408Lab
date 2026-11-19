import type { SimStep } from '../../../types/core';

export type PageAlgo = 'OPT' | 'FIFO' | 'LRU' | 'CLOCK' | 'ENHANCED_CLOCK';

export interface PageAccessReq {
  page: number;
  write: boolean;
  raw: string;
}

export interface PageFrameSlot {
  page: number | null;
  aBit: 0 | 1;
  mBit: 0 | 1;
  isNewOrReplaced?: boolean;
  isHit?: boolean;
}

export interface PageReplStepState {
  framesCount: number;
  reqs: PageAccessReq[];
  stepIdx: number;
  clockPtr: number;
  frames: PageFrameSlot[];
  pageFaults: number;
  replacements: number;
  hits: number;
  historyCols: Array<{
    req: string;
    frames: (number | null)[];
    fault: boolean;
    replaced: number | null;
  }>;
}

export function parsePageRefs(input: string): PageAccessReq[] {
  return input
    .split(/[\s,，;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const write = /w$/i.test(s);
      const num = parseInt(s.replace(/[rwRW]$/i, ''), 10);
      return { page: Number.isFinite(num) ? num : 0, write, raw: s };
    });
}

export function simulatePageReplacement(
  refStr: string,
  frameCount: number,
  algo: PageAlgo
): SimStep<PageReplStepState>[] {
  const reqs = parsePageRefs(refStr);
  const m = Math.max(2, Math.min(6, frameCount));
  const steps: SimStep<PageReplStepState>[] = [];

  const frames: Array<{
    page: number | null;
    aBit: 0 | 1;
    mBit: 0 | 1;
    loadTick: number;
    lastUseTick: number;
  }> = Array.from({ length: m }, () => ({
    page: null,
    aBit: 0,
    mBit: 0,
    loadTick: 0,
    lastUseTick: 0,
  }));

  let clockPtr = 0;
  let pageFaults = 0;
  let replacements = 0;
  let hits = 0;
  const historyCols: PageReplStepState['historyCols'] = [];

  const snap = (
    title: string,
    description: string,
    codeLine: number,
    stepIdx: number,
    activeSlot?: number,
    wasHit?: boolean
  ) => {
    steps.push({
      title,
      description,
      codeLine,
      state: {
        framesCount: m,
        reqs,
        stepIdx,
        clockPtr,
        frames: frames.map((f, idx) => ({
          page: f.page,
          aBit: f.aBit,
          mBit: f.mBit,
          isNewOrReplaced: activeSlot === idx && !wasHit,
          isHit: activeSlot === idx && wasHit,
        })),
        pageFaults,
        replacements,
        hits,
        historyCols: historyCols.map((c) => ({ ...c, frames: [...c.frames] })),
      },
    });
  };

  snap(`初始化 ${m} 个物理页框 (${algo})`, `准备访问共 ${reqs.length} 个页面引用。`, 1, -1);

  for (let i = 0; i < reqs.length; i++) {
    const req = reqs[i];
    const hitIdx = frames.findIndex((f) => f.page === req.page);

    if (hitIdx !== -1) {
      hits++;
      frames[hitIdx].lastUseTick = i + 1;
      frames[hitIdx].aBit = 1;
      if (req.write) frames[hitIdx].mBit = 1;

      historyCols.push({
        req: req.raw,
        frames: frames.map((f) => f.page),
        fault: false,
        replaced: null,
      });
      snap(
        `第 ${i + 1} 次访问 ${req.raw} → 命中！`,
        `页面 ${req.page} 已在物理框 ${hitIdx} 中，无需缺页中断。${req.write ? '写操作置 M=1。' : ''}`,
        3,
        i,
        hitIdx,
        true
      );
      continue;
    }

    // Page Fault
    pageFaults++;
    const emptyIdx = frames.findIndex((f) => f.page === null);
    if (emptyIdx !== -1) {
      frames[emptyIdx].page = req.page;
      frames[emptyIdx].aBit = 1;
      frames[emptyIdx].mBit = req.write ? 1 : 0;
      frames[emptyIdx].loadTick = i + 1;
      frames[emptyIdx].lastUseTick = i + 1;
      if (algo === 'CLOCK' || algo === 'ENHANCED_CLOCK') {
        clockPtr = (emptyIdx + 1) % m;
      }

      historyCols.push({
        req: req.raw,
        frames: frames.map((f) => f.page),
        fault: true,
        replaced: null,
      });
      snap(
        `第 ${i + 1} 次访问 ${req.raw} → 缺页（装入空闲框 ${emptyIdx}）`,
        `物理框尚有空位，直接装入页面 ${req.page}（注：直接装入空框记为缺页，不算页面置换！）。`,
        5,
        i,
        emptyIdx,
        false
      );
      continue;
    }

    // Need Replacement
    replacements++;
    let victimIdx = 0;
    let reason = '';

    if (algo === 'FIFO') {
      victimIdx = frames.reduce((best, f, idx) => (f.loadTick < frames[best].loadTick ? idx : best), 0);
      reason = `淘汰最先进入的页面 ${frames[victimIdx].page}`;
    } else if (algo === 'LRU') {
      victimIdx = frames.reduce((best, f, idx) => (f.lastUseTick < frames[best].lastUseTick ? idx : best), 0);
      reason = `淘汰最久未使用的页面 ${frames[victimIdx].page}`;
    } else if (algo === 'OPT') {
      let farthest = -1;
      for (let idx = 0; idx < m; idx++) {
        const nextPos = reqs.slice(i + 1).findIndex((r) => r.page === frames[idx].page);
        const dist = nextPos === -1 ? Infinity : nextPos;
        if (dist > farthest) {
          farthest = dist;
          victimIdx = idx;
        }
      }
      reason = `OPT 预测淘汰未来最久才用到（或不再用）的页面 ${frames[victimIdx].page}`;
    } else if (algo === 'CLOCK') {
      let scanned = 0;
      while (true) {
        if (frames[clockPtr].aBit === 0) {
          victimIdx = clockPtr;
          clockPtr = (clockPtr + 1) % m;
          break;
        }
        frames[clockPtr].aBit = 0;
        clockPtr = (clockPtr + 1) % m;
        scanned++;
        if (scanned > m * 2) break;
      }
      reason = `Clock 指针扫描并淘汰 A=0 的页面 ${frames[victimIdx].page}，指针移至框 ${clockPtr}`;
    } else {
      // ENHANCED_CLOCK: (0,0) -> (0,1) clearing A -> (0,0) -> (0,1)
      let found = false;
      // Round 1: look for (0,0) without modifying A
      for (let k = 0; k < m; k++) {
        const idx = (clockPtr + k) % m;
        if (frames[idx].aBit === 0 && frames[idx].mBit === 0) {
          victimIdx = idx;
          clockPtr = (idx + 1) % m;
          found = true;
          reason = `改进Clock 第1轮找到未访问未修改页 (0,0) → 淘汰 ${frames[idx].page}`;
          break;
        }
      }
      // Round 2: look for (0,1), clearing A=0 along the way
      if (!found) {
        for (let k = 0; k < m; k++) {
          const idx = (clockPtr + k) % m;
          if (frames[idx].aBit === 0 && frames[idx].mBit === 1) {
            victimIdx = idx;
            clockPtr = (idx + 1) % m;
            found = true;
            reason = `改进Clock 第2轮找到 (0,1) 并写回脏页 → 淘汰 ${frames[idx].page}`;
            break;
          }
          frames[idx].aBit = 0;
        }
      }
      // Round 3: look for (0,0) after A cleared
      if (!found) {
        for (let k = 0; k < m; k++) {
          const idx = (clockPtr + k) % m;
          if (frames[idx].aBit === 0 && frames[idx].mBit === 0) {
            victimIdx = idx;
            clockPtr = (idx + 1) % m;
            found = true;
            reason = `改进Clock 第3轮(清A后)找到 (0,0) → 淘汰 ${frames[idx].page}`;
            break;
          }
        }
      }
      // Round 4: (0,1)
      if (!found) {
        for (let k = 0; k < m; k++) {
          const idx = (clockPtr + k) % m;
          if (frames[idx].aBit === 0 && frames[idx].mBit === 1) {
            victimIdx = idx;
            clockPtr = (idx + 1) % m;
            reason = `改进Clock 第4轮(清A后)淘汰 (0,1) 页 ${frames[idx].page}`;
            break;
          }
        }
      }
    }

    const oldPage = frames[victimIdx].page;
    frames[victimIdx].page = req.page;
    frames[victimIdx].aBit = 1;
    frames[victimIdx].mBit = req.write ? 1 : 0;
    frames[victimIdx].loadTick = i + 1;
    frames[victimIdx].lastUseTick = i + 1;

    historyCols.push({
      req: req.raw,
      frames: frames.map((f) => f.page),
      fault: true,
      replaced: oldPage,
    });
    snap(
      `第 ${i + 1} 次访问 ${req.raw} → 缺页置换 (换出 ${oldPage})`,
      reason,
      8,
      i,
      victimIdx,
      false
    );
  }

  return steps;
}

export interface MemBlock {
  id: string;
  start: number;
  size: number;
  jobName: string | null; // null means free
}

export type PartitionAlgo = 'FF' | 'BF' | 'WF' | 'NF';
