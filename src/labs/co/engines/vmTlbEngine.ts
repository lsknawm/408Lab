import type { SimStep } from '../../../types/core';

export interface PageTableRow {
  vpn: number;
  valid: boolean;
  pfn: number;
}

export interface TlbEntry {
  slot: number;
  valid: boolean;
  vpn: number;
  pfn: number;
  lastUsed: number;
}

export interface VmStepState {
  stage: 'split' | 'tlb' | 'pagetable' | 'pagefault' | 'pa' | 'cache';
  vaHex: string;
  vpn: number;
  offset: number;
  offsetBits: number;
  vpnBits: number;
  tlbHit: boolean | null;
  pageFault: boolean | null;
  cacheHit: boolean | null;
  pfn: number | null;
  paHex: string;
  tlb: TlbEntry[];
  pageTable: PageTableRow[];
  cacheBlocks: Array<{ slot: number; valid: boolean; tag: number; paddrRange: string }>;
  latencyText: string;
  comboTag: string;
}

export function simulateVmPipeline(
  vaInput: string,
  vaBits: number,
  pageSize: number,
  initialPt: PageTableRow[],
  tlbSize = 4,
  cacheLines = 4
): SimStep<VmStepState>[] {
  const offsetBits = Math.round(Math.log2(pageSize));
  const vpnBits = vaBits - offsetBits;

  const pt: PageTableRow[] = initialPt.map((r) => ({ ...r }));
  const tlb: TlbEntry[] = Array.from({ length: tlbSize }, (_, slot) => ({
    slot,
    valid: false,
    vpn: 0,
    pfn: 0,
    lastUsed: 0,
  }));
  const cacheBlocks = Array.from({ length: cacheLines }, (_, slot) => ({
    slot,
    valid: false,
    tag: -1,
    paddrRange: '-',
  }));

  const vas = vaInput
    .split(/[\s,，;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/^0x/i.test(s) ? parseInt(s, 16) : Number(s)))
    .filter((n) => Number.isFinite(n) && n >= 0);

  const steps: SimStep<VmStepState>[] = [];
  let nextFreePfn = Math.max(0, ...pt.filter((p) => p.valid).map((p) => p.pfn)) + 1;
  const blockSize = 64;

  const cloneSnap = (
    stage: VmStepState['stage'],
    vaHex: string,
    vpn: number,
    offset: number,
    tlbHit: boolean | null,
    pageFault: boolean | null,
    cacheHit: boolean | null,
    pfn: number | null,
    paHex: string,
    latencyText: string,
    comboTag: string
  ): VmStepState => ({
    stage,
    vaHex,
    vpn,
    offset,
    offsetBits,
    vpnBits,
    tlbHit,
    pageFault,
    cacheHit,
    pfn,
    paHex,
    tlb: tlb.map((e) => ({ ...e })),
    pageTable: pt.map((r) => ({ ...r })),
    cacheBlocks: cacheBlocks.map((c) => ({ ...c })),
    latencyText,
    comboTag,
  });

  for (let idx = 0; idx < vas.length; idx++) {
    const va = vas[idx] & ((1 << vaBits) - 1);
    const vaHex = '0x' + va.toString(16).toUpperCase().padStart(Math.ceil(vaBits / 4), '0');
    const vpn = va >>> offsetBits;
    const offset = va & ((1 << offsetBits) - 1);
    const tick = idx + 1;

    steps.push({
      title: `访问 #${tick}：拆解虚拟地址 ${vaHex}`,
      description: `页面大小 ${pageSize}B → 页内偏移占 ${offsetBits} 位，虚页号 VPN 占 ${vpnBits} 位。得 VPN = ${vpn}, Offset = 0x${offset.toString(16).toUpperCase()}。`,
      codeLine: 1,
      state: cloneSnap('split', vaHex, vpn, offset, null, null, null, null, '-', '待查询', '开始寻址'),
    });

    // Step 2: Check TLB
    const tlbEntry = tlb.find((t) => t.valid && t.vpn === vpn);
    let pfn = 0;
    let tlbHit = false;
    let pageFault = false;

    if (tlbEntry) {
      tlbHit = true;
      tlbEntry.lastUsed = tick;
      pfn = tlbEntry.pfn;
      steps.push({
        title: `TLB 快表命中！(VPN ${vpn} → PFN ${pfn})`,
        description: `在 TLB 中直接命中虚页 ${vpn}，跳过慢表查询且绝对不会发生缺页中断！`,
        codeLine: 3,
        state: cloneSnap('tlb', vaHex, vpn, offset, true, false, null, pfn, '-', '~1 ns (快表命中)', 'TLB命中'),
      });
    } else {
      tlbHit = false;
      steps.push({
        title: `TLB 快表缺失 (Miss) → 访问主存页表`,
        description: `TLB 中未缓存虚页 ${vpn}，需按页表基址寄存器访存查第 ${vpn} 项页表。`,
        codeLine: 5,
        state: cloneSnap('tlb', vaHex, vpn, offset, false, null, null, null, '-', '+100 ns (查慢表)', 'TLB缺失'),
      });

      let row = pt.find((r) => r.vpn === vpn);
      if (!row) {
        row = { vpn, valid: false, pfn: 0 };
        pt.push(row);
      }

      if (row.valid) {
        pfn = row.pfn;
        steps.push({
          title: `主存页表命中！(Valid=1, PFN=${pfn})`,
          description: `虚页 ${vpn} 已在内存中，获取实页框号 PFN = ${pfn}，并将 (VPN=${vpn}, PFN=${pfn}) 写回 TLB。`,
          codeLine: 7,
          state: cloneSnap('pagetable', vaHex, vpn, offset, false, false, null, pfn, '-', '~100 ns', 'TLB缺 / 页命中'),
        });
      } else {
        pageFault = true;
        pfn = nextFreePfn++;
        row.valid = true;
        row.pfn = pfn;
        steps.push({
          title: `触发缺页中断 Page Fault！(Valid=0)`,
          description: `虚页 ${vpn} 不在主存！OS 陷入内核态，耗时毫秒级从磁盘调入该页至空闲页框 PFN = ${pfn}，并置 Valid=1。`,
          codeLine: 9,
          state: cloneSnap('pagefault', vaHex, vpn, offset, false, true, null, pfn, '-', '~数百万 ns (磁盘调页!)', 'TLB缺 / 缺页'),
        });
      }

      // Fill TLB (LRU)
      let freeTlb = tlb.find((t) => !t.valid);
      if (!freeTlb) freeTlb = tlb.reduce((a, b) => (a.lastUsed < b.lastUsed ? a : b));
      freeTlb.valid = true;
      freeTlb.vpn = vpn;
      freeTlb.pfn = pfn;
      freeTlb.lastUsed = tick;
    }

    const pa = (pfn << offsetBits) | offset;
    const paHex = '0x' + pa.toString(16).toUpperCase().padStart(Math.ceil(vaBits / 4), '0');

    steps.push({
      title: `拼接物理地址 PA = ${paHex}`,
      description: `保持页内偏移不变，PFN(${pfn}) 与 Offset 拼接得到物理地址 PA = ${paHex}，送往 Cache 查找。`,
      codeLine: 11,
      state: cloneSnap('pa', vaHex, vpn, offset, tlbHit, pageFault, null, pfn, paHex, tlbHit ? '~1 ns' : pageFault ? 'ms级' : '100ns', 'PA合成'),
    });

    // Step 5: Physical Cache lookup (Direct-mapped by block)
    const pBlock = Math.floor(pa / blockSize);
    const cacheSlot = pBlock % cacheLines;
    const cTag = Math.floor(pBlock / cacheLines);
    const cLine = cacheBlocks[cacheSlot];
    const cacheHit = cLine.valid && cLine.tag === cTag;

    if (!cacheHit) {
      cLine.valid = true;
      cLine.tag = cTag;
      cLine.paddrRange = `Blk ${pBlock} (PFN ${pfn})`;
    }

    const comboLabel = `${tlbHit ? 'TLB命中' : 'TLB缺失'} · ${pageFault ? '缺页异常' : '页在主存'} · ${
      cacheHit ? 'Cache命中' : 'Cache缺失'
    }`;

    steps.push({
      title: `物理 Cache ${cacheHit ? '命中 HIT' : '缺失 MISS'} (Slot ${cacheSlot})`,
      description: cacheHit
        ? `物理地址 ${paHex} 在 Cache 槽位 ${cacheSlot} 中命中！组合状态：[${comboLabel}]。`
        : `物理地址 ${paHex} 在 Cache 中未命中，从主存加载块 ${pBlock} 至 Cache 槽位 ${cacheSlot}。组合状态：[${comboLabel}]。`,
      codeLine: 13,
      state: cloneSnap(
        'cache',
        vaHex,
        vpn,
        offset,
        tlbHit,
        pageFault,
        cacheHit,
        pfn,
        paHex,
        pageFault ? '毫秒级 (缺页)' : cacheHit && tlbHit ? '极快 (<5ns)' : '几十~百 ns',
        comboLabel
      ),
    });
  }

  return steps;
}
