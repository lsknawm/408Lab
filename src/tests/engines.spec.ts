import { describe, expect, it } from 'vitest';
import { computeKmpArrays, simulateStackSequence } from '../labs/ds/engines/linearEngine';
import { parseBracketTree, serializeBracket, simulateRebuildTree } from '../labs/ds/engines/binaryTreeEngine';
import { simulateBstOrAvl } from '../labs/ds/engines/bstAvlEngine';
import { parseBTreeOps, simulateBTree } from '../labs/ds/engines/btreeEngine';
import { parseEdgeListText, simulateGraphAlgo } from '../labs/ds/engines/graphEngine';
import { simulateHashTable } from '../labs/ds/engines/sortHashEngine';
import { decodeIeee754FromHex, simulateBoothMultiply } from '../labs/co/engines/dataAluEngine';
import { simulateCache } from '../labs/co/engines/cacheEngine';
import { buildPipelineSchedule } from '../labs/co/engines/pipelineEngine';
import { simulateScheduling } from '../labs/os/engines/osSchedEngine';
import { simulateBanker } from '../labs/os/engines/bankerRagEngine';
import { simulatePageReplacement } from '../labs/os/engines/memoryEngine';
import { allocateVlsm, computeIpFragmentation, matchLongestPrefix } from '../labs/cn/engines/ipRouteEngine';
import { simulateTcpCongestion } from '../labs/cn/engines/tcpEngine';

describe('408 Core Algorithm Engines Verification', () => {
  it('DS: KMP next and nextval (1-based 408 convention)', () => {
    const { next, nextval } = computeKmpArrays('ababaa', true);
    expect(next).toEqual([0, 1, 1, 2, 3, 4]);
    expect(nextval).toEqual([0, 1, 0, 1, 0, 4]);
  });

  it('DS: Stack push/pop sequence validation', () => {
    const ok = simulateStackSequence('A,B,C,D,E', 'C,B,D,E,A');
    expect(ok[ok.length - 1].state.status).toBe('valid');

    const bad = simulateStackSequence('A,B,C,D,E', 'D,C,E,A,B');
    expect(bad[bad.length - 1].state.status).toBe('invalid');
  });

  it('DS: Binary tree bracket roundtrip & pre+in rebuild', () => {
    const expr = 'A(B(D,E(G,)),C(,F(H,I)))';
    const root = parseBracketTree(expr);
    expect(serializeBracket(root)).toBe(expr);

    const rebuilt = simulateRebuildTree('pre-in', 'ABDEGCFHI', 'DBGEACHFI');
    expect(rebuilt.error).toBeUndefined();
    expect(serializeBracket(rebuilt.finalRoot)).toBe(expr);
  });

  it('DS: AVL LR rotation restores balance', () => {
    const steps = simulateBstOrAvl([30, 10, 20], 'avl');
    const last = steps[steps.length - 1].state.visualRoot!;
    expect(last.label).toBe('20');
    expect(last.left?.label).toBe('10');
    expect(last.right?.label).toBe('30');
    expect(steps.some((s) => s.state.rotationType?.includes('LR'))).toBe(true);
  });

  it('DS: B-Tree order 3 splits and merges cleanly', () => {
    const ops = parseBTreeOps('10, 20, 30, 40, 50, del:20');
    const steps = simulateBTree(ops, 3);
    const root = steps[steps.length - 1].state.root;
    expect(root).not.toBeNull();
    expect(root!.keys.length).toBeGreaterThanOrEqual(1);
  });

  it('DS: Graph Dijkstra & AOE critical path', () => {
    const g = parseEdgeListText('V1->V2:6, V1->V3:4, V1->V4:5, V2->V5:1, V3->V5:1, V4->V6:2, V5->V7:9, V5->V8:7, V6->V8:4, V7->V9:2, V8->V9:4', true);
    const steps = simulateGraphAlgo(g.vertices, g.edges, true, 'topo-aoe', 'V1');
    const last = steps[steps.length - 1].state;
    expect(last.auxiliaryTitle).toContain('18');
    expect(last.criticalEdgeIds.length).toBeGreaterThanOrEqual(4);
  });

  it('DS: Hash table linear probing ASL', () => {
    const res = simulateHashTable([19, 14, 23, 1], 11, 7, 'linear');
    expect(res.insertLogs.length).toBe(4);
    expect(res.aslFailDen).toBe(7);
  });

  it('CO: IEEE 754 C1A40000H == -20.5', () => {
    const info = decodeIeee754FromHex('C1A40000');
    expect(info?.exactValue).toBe(-20.5);
  });

  it('CO: Booth 5-bit (-5) * (-6) == 30', () => {
    const steps = simulateBoothMultiply(-5, -6, 5);
    expect(steps[steps.length - 1].state.finalDec).toBe(30);
  });

  it('CO: Cache 4-way 32KB / 64B tag bits on 32-bit addr == 19', () => {
    const steps = simulateCache(
      {
        addrBits: 32,
        numLines: 512,
        blockSize: 64,
        ways: 4,
        replacement: 'LRU',
        writePolicy: 'write-back',
        cacheHitNs: 2,
        memAccessNs: 80,
      },
      '0x0000'
    );
    expect(steps[0].state.offsetBits).toBe(6);
    expect(steps[0].state.indexBits).toBe(7);
    expect(steps[0].state.tagBits).toBe(19);
  });

  it('CO: Pipeline detects Load-Use stall even with forwarding', () => {
    const sched = buildPipelineSchedule('LW R1, 0(R2)\nADD R3, R1, R4', true);
    expect(sched.stallCount).toBe(1);
    expect(sched.totalCycles).toBe(7);
  });

  it('OS: CPU Scheduling FCFS & Banker Safety Sequence', () => {
    const schedSteps = simulateScheduling(
      [
        { pid: 'P1', arrival: 0, burst: 4, priority: 1 },
        { pid: 'P2', arrival: 1, burst: 3, priority: 2 },
      ],
      'FCFS'
    );
    const last = schedSteps[schedSteps.length - 1].state;
    expect(last.time).toBe(7);

    const bSteps = simulateBanker(
      [
        { pid: 'P0', max: [7, 5, 3], alloc: [0, 1, 0] },
        { pid: 'P1', max: [3, 2, 2], alloc: [2, 0, 0] },
        { pid: 'P2', max: [9, 0, 2], alloc: [3, 0, 2] },
        { pid: 'P3', max: [2, 2, 2], alloc: [2, 1, 1] },
        { pid: 'P4', max: [4, 3, 3], alloc: [0, 0, 2] },
      ],
      [3, 3, 2]
    );
    expect(bSteps[bSteps.length - 1].state.outcome).toBe('safe');
  });

  it('OS: Belady anomaly on FIFO m=3 vs m=4', () => {
    const s3 = simulatePageReplacement('1,2,3,4,1,2,5,1,2,3,4,5', 3, 'FIFO');
    const s4 = simulatePageReplacement('1,2,3,4,1,2,5,1,2,3,4,5', 4, 'FIFO');
    expect(s3[s3.length - 1].state.pageFaults).toBe(9);
    expect(s4[s4.length - 1].state.pageFaults).toBe(10);
  });

  it('CN: VLSM, IP Fragmentation & Longest Prefix Match', () => {
    const vlsm = allocateVlsm('192.168.1.0/24', '60, 28');
    expect(vlsm.error).toBe('');
    expect(vlsm.rows[0].cidr).toBe('192.168.1.0/26');
    expect(vlsm.rows[1].cidr).toBe('192.168.1.64/27');

    const frag = computeIpFragmentation(3000, 20, 1420, 1420);
    expect(frag.hop1.table.length).toBe(3);
    expect(frag.hop1.table[1].offsetField).toBe(175);

    const lpm = matchLongestPrefix('192.168.1.130', [
      { prefixCidr: '192.168.1.0/24', nextHop: 'A' },
      { prefixCidr: '192.168.1.128/25', nextHop: 'B' },
    ]);
    expect(lpm.winner?.nextHop).toBe('B');
  });

  it('CN: TCP Reno congestion control', () => {
    const pts = simulateTcpCongestion(16, 24, 10, 'Reno', [{ round: 5, kind: '3dup' }]);
    // R1:1, R2:2, R3:4, R4:8, R5(3dup, old cwnd=16 -> ssthresh=8, cwnd=8)
    expect(pts[3].cwnd).toBe(8);
    expect(pts[4].ssthresh).toBe(8);
    expect(pts[4].cwnd).toBe(8);
  });
});
