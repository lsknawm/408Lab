import type { BinaryNodeData } from '../../../utils/treeLayout';

export function ipToInt(ip: string): number | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let val = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const n = Number(p);
    if (n < 0 || n > 255) return null;
    val = (val << 8) | n;
  }
  return val >>> 0;
}

export function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export function intToBin32(n: number): string {
  const b = (n >>> 0).toString(2).padStart(32, '0');
  return `${b.slice(0, 8)}.${b.slice(8, 16)}.${b.slice(16, 24)}.${b.slice(24)}`;
}

export interface SubnetAllocRow {
  name: string;
  needHosts: number;
  cidr: string;
  mask: string;
  networkAddr: string;
  broadcastAddr: string;
  usableRange: string;
  usableCount: number;
}

export function allocateVlsm(baseCidr: string, hostDemandsStr: string) {
  const m = baseCidr.trim().match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/);
  if (!m) return { error: '请输入合法 CIDR 格式，例如 192.168.1.0/24', rows: [] as SubnetAllocRow[], treeRoot: null as BinaryNodeData | null };
  const baseIpInt = ipToInt(m[1]);
  const basePrefix = Number(m[2]);
  if (baseIpInt === null || basePrefix < 8 || basePrefix > 30) {
    return { error: '前缀长度应在 8 ~ 30 之间', rows: [], treeRoot: null };
  }

  const baseMask = basePrefix === 0 ? 0 : (~0 << (32 - basePrefix)) >>> 0;
  const networkStart = (baseIpInt & baseMask) >>> 0;
  const totalAddrs = Math.pow(2, 32 - basePrefix);

  const demands = hostDemandsStr
    .split(/[\s,，;]+/)
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1)
    .map((need, idx) => ({ idx: idx + 1, need }))
    .sort((a, b) => b.need - a.need);

  if (demands.length === 0) {
    return { error: '请输入至少一个子网所需主机数', rows: [], treeRoot: null };
  }

  // Binary Trie node for address space
  interface TrieNode {
    id: string;
    start: number;
    prefix: number;
    allocatedTo?: string;
    left?: TrieNode;
    right?: TrieNode;
  }

  let tid = 1;
  const root: TrieNode = { id: `ip_${tid++}`, start: networkStart, prefix: basePrefix };

  const tryAlloc = (node: TrieNode, targetPrefix: number, label: string): TrieNode | null => {
    if (node.allocatedTo) return null;
    if (node.prefix === targetPrefix) {
      if (!node.left && !node.right) {
        node.allocatedTo = label;
        return node;
      }
      return null;
    }
    if (node.prefix > targetPrefix) return null;
    if (!node.left && !node.right) {
      const halfSize = Math.pow(2, 32 - (node.prefix + 1));
      node.left = { id: `ip_${tid++}`, start: node.start, prefix: node.prefix + 1 };
      node.right = { id: `ip_${tid++}`, start: (node.start + halfSize) >>> 0, prefix: node.prefix + 1 };
    }
    return tryAlloc(node.left!, targetPrefix, label) || tryAlloc(node.right!, targetPrefix, label);
  };

  const rows: SubnetAllocRow[] = [];
  for (const d of demands) {
    const hostBits = Math.max(2, Math.ceil(Math.log2(d.need + 2)));
    const targetPrefix = 32 - hostBits;
    if (targetPrefix < basePrefix) {
      return { error: `需求 ${d.need} 台主机超过主网总容量 (${totalAddrs - 2} 台)`, rows: [], treeRoot: null };
    }
    const label = `子网${d.idx}(需${d.need})`;
    const block = tryAlloc(root, targetPrefix, label);
    if (!block) {
      return { error: `主网地址空间不足，无法分配 ${label}`, rows: [], treeRoot: null };
    }
    const size = Math.pow(2, hostBits);
    const maskInt = (~0 << hostBits) >>> 0;
    const bcast = (block.start + size - 1) >>> 0;
    rows.push({
      name: label,
      needHosts: d.need,
      cidr: `${intToIp(block.start)}/${targetPrefix}`,
      mask: intToIp(maskInt),
      networkAddr: intToIp(block.start),
      broadcastAddr: intToIp(bcast),
      usableRange: `${intToIp((block.start + 1) >>> 0)} ~ ${intToIp((bcast - 1) >>> 0)}`,
      usableCount: size - 2,
    });
  }

  const toVisual = (n: TrieNode): BinaryNodeData => ({
    id: n.id,
    label: `${intToIp(n.start).split('.').slice(-2).join('.')}/${n.prefix}`,
    subLabel: n.allocatedTo || (n.left ? '已划分子块' : '剩余空闲'),
    highlight: n.allocatedTo ? 'found' : n.left ? 'active' : undefined,
    left: n.left ? toVisual(n.left) : null,
    right: n.right ? toVisual(n.right) : null,
  });

  return { error: '', rows, treeRoot: toVisual(root) };
}

export interface IpFragmentRow {
  hop: string;
  fragNo: number;
  totalLen: number;
  payloadLen: number;
  mf: 0 | 1;
  offsetBytes: number;
  offsetField: number;
}

export function computeIpFragmentation(totalBytes: number, headerBytes: number, mtu1: number, mtu2: number) {
  const fragOnce = (
    items: Array<{ payloadLen: number; offsetBytes: number; mf: 0 | 1 }>,
    mtu: number,
    hopName: string
  ) => {
    const maxPayload = Math.floor((mtu - headerBytes) / 8) * 8;
    const out: Array<{ payloadLen: number; offsetBytes: number; mf: 0 | 1 }> = [];
    const table: IpFragmentRow[] = [];

    for (const pkt of items) {
      if (pkt.payloadLen + headerBytes <= mtu) {
        out.push(pkt);
      } else {
        let curOff = pkt.offsetBytes;
        let rem = pkt.payloadLen;
        while (rem > 0) {
          const take = rem > maxPayload ? maxPayload : rem;
          const isLastOfThisPkt = rem <= maxPayload;
          const mf: 0 | 1 = isLastOfThisPkt ? pkt.mf : 1;
          out.push({ payloadLen: take, offsetBytes: curOff, mf });
          curOff += take;
          rem -= take;
        }
      }
    }

    out.forEach((f, idx) => {
      table.push({
        hop: hopName,
        fragNo: idx + 1,
        totalLen: f.payloadLen + headerBytes,
        payloadLen: f.payloadLen,
        mf: f.mf,
        offsetBytes: f.offsetBytes,
        offsetField: f.offsetBytes / 8,
      });
    });
    return { out, table, maxPayload };
  };

  const initial = [{ payloadLen: Math.max(8, totalBytes - headerBytes), offsetBytes: 0, mf: 0 as const }];
  const hop1 = fragOnce(initial, Math.max(headerBytes + 8, mtu1), '第1段链路');
  const hop2 = fragOnce(hop1.out, Math.max(headerBytes + 8, mtu2), '第2段链路');
  return { hop1, hop2 };
}

export interface RouteEntry {
  prefixCidr: string;
  nextHop: string;
}

export function matchLongestPrefix(dstIpStr: string, table: RouteEntry[]) {
  const dstInt = ipToInt(dstIpStr);
  if (dstInt === null) return { error: '目的 IP 格式非法', rows: [], winner: null as RouteEntry | null };

  const rows = table.map((entry) => {
    const m = entry.prefixCidr.trim().match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/);
    if (!m) {
      return { ...entry, prefixLen: -1, matched: false, maskedResult: '格式错' };
    }
    const netInt = ipToInt(m[1]) ?? 0;
    const plen = Number(m[2]);
    const maskInt = plen === 0 ? 0 : (~0 << (32 - plen)) >>> 0;
    const masked = (dstInt & maskInt) >>> 0;
    const targetNet = (netInt & maskInt) >>> 0;
    const matched = masked === targetNet;
    return {
      ...entry,
      prefixLen: plen,
      matched,
      maskedResult: intToIp(masked),
    };
  });

  const matchedRows = rows.filter((r) => r.matched).sort((a, b) => b.prefixLen - a.prefixLen);
  const winner = matchedRows[0] || null;
  return { error: '', dstBin: intToBin32(dstInt), rows, winner };
}
