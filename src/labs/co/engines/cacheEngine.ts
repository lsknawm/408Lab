import type { SimStep } from '../../../types/core';

export interface CacheConfig {
  addrBits: number; // e.g., 16 or 32
  numLines: number; // 4, 8, 16
  blockSize: number; // 16, 32, 64, 128 bytes
  ways: number; // 1 (direct), 2, 4, or numLines (fully associative)
  replacement: 'LRU' | 'FIFO' | 'LFU';
  writePolicy: 'write-back' | 'write-through';
  cacheHitNs: number;
  memAccessNs: number;
}

export interface CacheLineSnapshot {
  setIdx: number;
  wayIdx: number;
  valid: boolean;
  dirty: boolean;
  tagHex: string;
  blockNum: number | null;
  lruRank: number;
  freq: number;
  status?: 'hit' | 'miss-fill' | 'evict' | 'compare';
}

export interface CacheStepState {
  offsetBits: number;
  indexBits: number;
  tagBits: number;
  numSets: number;
  totalHardwareBits: number;
  bitsPerLine: { valid: number; dirty: number; repl: number; tag: number; data: number };
  lines: CacheLineSnapshot[];
  currentAccess?: {
    raw: string;
    isWrite: boolean;
    addrHex: string;
    addrBin: string;
    tagBin: string;
    indexBin: string;
    offsetBin: string;
    targetSet: number;
    blockNum: number;
    outcome: 'HIT' | 'MISS';
    writeBackTriggered: boolean;
  };
  hits: number;
  misses: number;
  writeBacks: number;
  amat: number;
  accessLog: Array<{ seq: number; op: string; blockNum: number; setIdx: number; tagHex: string; result: string }>;
}

export interface ParsedMemReq {
  isWrite: boolean;
  addr: number;
  raw: string;
}

export function parseCacheAccessSeq(input: string, blockSize: number): ParsedMemReq[] {
  const parts = input
    .split(/[\s,，;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const res: ParsedMemReq[] = [];
  for (const p of parts) {
    let isWrite = false;
    let body = p;
    if (/^[wW]:/.test(p)) {
      isWrite = true;
      body = p.slice(2);
    } else if (/^[rR]:/.test(p)) {
      isWrite = false;
      body = p.slice(2);
    }
    let addr = 0;
    if (/^0x/i.test(body)) {
      addr = parseInt(body, 16);
    } else if (/^b/i.test(body)) {
      // b5 means block 5 -> addr = 5 * blockSize
      const b = parseInt(body.slice(1), 10);
      addr = Number.isFinite(b) ? b * blockSize : 0;
    } else {
      const n = Number(body);
      // If small integers like 0, 4, 8 without 0x, treat as byte address if >= blockSize or block? Actually user might write block nums! Let's support 0x for byte addr, bN for block, or integer byte addr!
      addr = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    }
    if (Number.isFinite(addr)) {
      res.push({ isWrite, addr: addr >>> 0, raw: p });
    }
  }
  return res;
}

export function simulateCache(cfg: CacheConfig, seqStr: string): SimStep<CacheStepState>[] {
  const offsetBits = Math.round(Math.log2(cfg.blockSize));
  const ways = Math.min(cfg.numLines, Math.max(1, cfg.ways));
  const numSets = Math.max(1, Math.floor(cfg.numLines / ways));
  const indexBits = Math.round(Math.log2(numSets));
  const tagBits = Math.max(1, cfg.addrBits - indexBits - offsetBits);

  const validBits = 1;
  const dirtyBits = cfg.writePolicy === 'write-back' ? 1 : 0;
  const replBits = ways > 1 ? Math.ceil(Math.log2(ways)) : 0;
  const dataBits = cfg.blockSize * 8;
  const bitsPerLineTotal = validBits + dirtyBits + replBits + tagBits + dataBits;
  const totalHardwareBits = cfg.numLines * bitsPerLineTotal;

  interface InternalLine {
    setIdx: number;
    wayIdx: number;
    valid: boolean;
    dirty: boolean;
    tag: number;
    tagHex: string;
    blockNum: number | null;
    lastUsedTick: number;
    insertedTick: number;
    freq: number;
  }

  const lines: InternalLine[] = [];
  for (let s = 0; s < numSets; s++) {
    for (let w = 0; w < ways; w++) {
      lines.push({
        setIdx: s,
        wayIdx: w,
        valid: false,
        dirty: false,
        tag: 0,
        tagHex: '-',
        blockNum: null,
        lastUsedTick: 0,
        insertedTick: 0,
        freq: 0,
      });
    }
  }

  const reqs = parseCacheAccessSeq(seqStr, cfg.blockSize);
  const steps: SimStep<CacheStepState>[] = [];
  let hits = 0;
  let misses = 0;
  let writeBacks = 0;
  const accessLog: CacheStepState['accessLog'] = [];

  const snapshotLines = (
    highlightSet?: number,
    highlightWay?: number,
    highlightStatus?: CacheLineSnapshot['status']
  ): CacheLineSnapshot[] =>
    lines.map((l) => ({
      setIdx: l.setIdx,
      wayIdx: l.wayIdx,
      valid: l.valid,
      dirty: l.dirty,
      tagHex: l.tagHex,
      blockNum: l.blockNum,
      lruRank: l.lastUsedTick,
      freq: l.freq,
      status:
        l.setIdx === highlightSet && l.wayIdx === highlightWay
          ? highlightStatus
          : l.setIdx === highlightSet
            ? 'compare'
            : undefined,
    }));

  const calcAmat = () => {
    const total = hits + misses;
    if (total === 0) return cfg.cacheHitNs;
    const hitRate = hits / total;
    return Number((cfg.cacheHitNs + (1 - hitRate) * cfg.memAccessNs).toFixed(2));
  };

  steps.push({
    title: 'Cache 硬件结构参数就绪',
    description: `${cfg.numLines} 行 Cache 分为 ${numSets} 组（每组 ${ways} 路），地址拆分: Tag(${tagBits}b) | Index(${indexBits}b) | Offset(${offsetBits}b)。`,
    codeLine: 1,
    state: {
      offsetBits,
      indexBits,
      tagBits,
      numSets,
      totalHardwareBits,
      bitsPerLine: { valid: validBits, dirty: dirtyBits, repl: replBits, tag: tagBits, data: dataBits },
      lines: snapshotLines(),
      hits: 0,
      misses: 0,
      writeBacks: 0,
      amat: cfg.cacheHitNs,
      accessLog: [],
    },
  });

  for (let tick = 1; tick <= reqs.length; tick++) {
    const req = reqs[tick - 1];
    const blockNum = Math.floor(req.addr / cfg.blockSize);
    const targetSet = numSets === 1 ? 0 : blockNum % numSets;
    const tagVal = Math.floor(blockNum / numSets);
    const tagHex = '0x' + tagVal.toString(16).toUpperCase();

    const maskFull = req.addr >>> 0;
    const addrBin = maskFull.toString(2).padStart(cfg.addrBits, '0').slice(-cfg.addrBits);
    const tagBin = addrBin.slice(0, tagBits);
    const indexBin = indexBits > 0 ? addrBin.slice(tagBits, tagBits + indexBits) : '';
    const offsetBin = addrBin.slice(tagBits + indexBits);
    const addrHex = '0x' + maskFull.toString(16).toUpperCase().padStart(Math.ceil(cfg.addrBits / 4), '0');

    const setLines = lines.filter((l) => l.setIdx === targetSet);
    const hitLine = setLines.find((l) => l.valid && l.tag === tagVal);

    if (hitLine) {
      hits++;
      hitLine.lastUsedTick = tick;
      hitLine.freq++;
      if (req.isWrite && cfg.writePolicy === 'write-back') {
        hitLine.dirty = true;
      }
      accessLog.push({
        seq: tick,
        op: req.isWrite ? '写(W)' : '读(R)',
        blockNum,
        setIdx: targetSet,
        tagHex,
        result: '命中 HIT',
      });
      steps.push({
        title: `#${tick} ${req.isWrite ? '写' : '读'} ${req.raw} (块${blockNum}) → 命中！`,
        description: `定位到组 ${targetSet}，第 ${hitLine.wayIdx} 路 Tag=${tagHex} 匹配且 Valid=1！${
          req.isWrite && cfg.writePolicy === 'write-back' ? '写回法将 Dirty 脏位置 1。' : ''
        }`,
        codeLine: 4,
        state: {
          offsetBits,
          indexBits,
          tagBits,
          numSets,
          totalHardwareBits,
          bitsPerLine: { valid: validBits, dirty: dirtyBits, repl: replBits, tag: tagBits, data: dataBits },
          lines: snapshotLines(targetSet, hitLine.wayIdx, 'hit'),
          currentAccess: {
            raw: req.raw,
            isWrite: req.isWrite,
            addrHex,
            addrBin,
            tagBin,
            indexBin,
            offsetBin,
            targetSet,
            blockNum,
            outcome: 'HIT',
            writeBackTriggered: false,
          },
          hits,
          misses,
          writeBacks,
          amat: calcAmat(),
          accessLog: [...accessLog],
        },
      });
    } else {
      misses++;
      let victim = setLines.find((l) => !l.valid);
      let evictedBlock: number | null = null;
      let wbTriggered = false;

      if (!victim) {
        // Choose victim by replacement policy
        if (cfg.replacement === 'LRU') {
          victim = setLines.reduce((a, b) => (a.lastUsedTick < b.lastUsedTick ? a : b));
        } else if (cfg.replacement === 'FIFO') {
          victim = setLines.reduce((a, b) => (a.insertedTick < b.insertedTick ? a : b));
        } else {
          victim = setLines.reduce((a, b) => (a.freq < b.freq ? a : b));
        }
        evictedBlock = victim.blockNum;
        if (cfg.writePolicy === 'write-back' && victim.dirty) {
          wbTriggered = true;
          writeBacks++;
        }
      }

      victim.valid = true;
      victim.dirty = req.isWrite && cfg.writePolicy === 'write-back';
      victim.tag = tagVal;
      victim.tagHex = tagHex;
      victim.blockNum = blockNum;
      victim.lastUsedTick = tick;
      victim.insertedTick = tick;
      victim.freq = 1;

      accessLog.push({
        seq: tick,
        op: req.isWrite ? '写(W)' : '读(R)',
        blockNum,
        setIdx: targetSet,
        tagHex,
        result: wbTriggered ? '缺失 + 脏块写回' : '缺失 MISS',
      });

      steps.push({
        title: `#${tick} ${req.isWrite ? '写' : '读'} ${req.raw} (块${blockNum}) → 缺失 MISS`,
        description:
          evictedBlock !== null
            ? `组 ${targetSet} 已满，按 ${cfg.replacement} 淘汰第 ${victim.wayIdx} 路（原块 ${evictedBlock}）${
                wbTriggered ? '【原块为脏块，触发写回主存！】' : ''
              }，装入主存块 ${blockNum}。`
            : `组 ${targetSet} 存在空闲行（第 ${victim.wayIdx} 路），直接调入主存块 ${blockNum}。`,
        codeLine: wbTriggered ? 7 : 6,
        state: {
          offsetBits,
          indexBits,
          tagBits,
          numSets,
          totalHardwareBits,
          bitsPerLine: { valid: validBits, dirty: dirtyBits, repl: replBits, tag: tagBits, data: dataBits },
          lines: snapshotLines(targetSet, victim.wayIdx, wbTriggered ? 'evict' : 'miss-fill'),
          currentAccess: {
            raw: req.raw,
            isWrite: req.isWrite,
            addrHex,
            addrBin,
            tagBin,
            indexBin,
            offsetBin,
            targetSet,
            blockNum,
            outcome: 'MISS',
            writeBackTriggered: wbTriggered,
          },
          hits,
          misses,
          writeBacks,
          amat: calcAmat(),
          accessLog: [...accessLog],
        },
      });
    }
  }

  return steps;
}
