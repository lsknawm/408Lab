import type { SimStep } from '../../../types/core';

export interface CongestionEvent {
  round: number;
  kind: 'timeout' | '3dup';
}

export interface CongestionPoint {
  round: number;
  cwnd: number;
  ssthresh: number;
  sendWin: number;
  phase: string;
  eventNote?: string;
}

export function simulateTcpCongestion(
  initSsthresh: number,
  rwnd: number,
  maxRounds: number,
  algo: 'Reno' | 'Tahoe',
  events: CongestionEvent[]
): CongestionPoint[] {
  const eventMap = new Map<number, 'timeout' | '3dup'>();
  for (const e of events) eventMap.set(e.round, e.kind);

  const points: CongestionPoint[] = [];
  let cwnd = 1;
  let ssthresh = Math.max(2, initSsthresh);

  for (let r = 1; r <= maxRounds; r++) {
    const ev = eventMap.get(r);
    let phase = cwnd < ssthresh ? '慢开始 (指数翻倍)' : '拥塞避免 (线性 +1)';
    let eventNote: string | undefined;

    if (ev === 'timeout') {
      const oldCwnd = cwnd;
      ssthresh = Math.max(2, Math.floor(cwnd / 2));
      cwnd = 1;
      phase = '超时重传 → 慢开始';
      eventNote = `第${r}轮发生 Timeout (原cwnd=${oldCwnd})：ssthresh=${ssthresh}, cwnd重置为1`;
    } else if (ev === '3dup') {
      const oldCwnd = cwnd;
      ssthresh = Math.max(2, Math.floor(cwnd / 2));
      if (algo === 'Reno') {
        cwnd = ssthresh;
        phase = '快重传+快恢复 (Reno)';
        eventNote = `第${r}轮发生 3-Dup ACK (原cwnd=${oldCwnd})：ssthresh=${ssthresh}, cwnd=${cwnd} 直接进入拥塞避免`;
      } else {
        cwnd = 1;
        phase = 'Tahoe 无快恢复 → 重回慢开始';
        eventNote = `第${r}轮发生 3-Dup ACK (Tahoe)：ssthresh=${ssthresh}, cwnd 重置为 1`;
      }
    }

    points.push({
      round: r,
      cwnd,
      ssthresh,
      sendWin: Math.min(cwnd, rwnd),
      phase,
      eventNote,
    });

    // Advance cwnd for next RTT (unless event already happened? Wait: at round r if event happens, we see the drop at round r, then next round grows from new cwnd!)
    if (cwnd < ssthresh) {
      const doubled = cwnd * 2;
      cwnd = doubled > ssthresh ? ssthresh : doubled;
    } else {
      cwnd += 1;
    }
  }

  return points;
}

export interface TcpHandshakeStepState {
  clientState: string;
  serverState: string;
  messages: Array<{
    from: 'Client' | 'Server';
    to: 'Client' | 'Server';
    flags: string;
    seq: number;
    ack?: number;
    note: string;
  }>;
}

export function simulateTcpLifecycle(
  scenario: 'handshake' | 'teardown',
  clientIsn: number,
  serverIsn: number
): SimStep<TcpHandshakeStepState>[] {
  if (scenario === 'handshake') {
    return [
      {
        title: '初始状态：Server 处于 LISTEN，Client 准备建连',
        description: `服务端被动打开监听端口；客户端初始序号 seq = ${clientIsn}。`,
        codeLine: 1,
        state: { clientState: 'CLOSED', serverState: 'LISTEN', messages: [] },
      },
      {
        title: '第一次握手：Client → Server (SYN=1, seq=x)',
        description: `Client 发送 SYN=1, seq=${clientIsn}（SYN 消耗 1 个序号！），进入 SYN_SENT 状态。`,
        codeLine: 2,
        state: {
          clientState: 'SYN_SENT',
          serverState: 'LISTEN',
          messages: [
            {
              from: 'Client',
              to: 'Server',
              flags: 'SYN=1',
              seq: clientIsn,
              note: '请求建立连接 (SYN消耗1个序号)',
            },
          ],
        },
      },
      {
        title: '第二次握手：Server → Client (SYN=1, ACK=1, seq=y, ack=x+1)',
        description: `Server 分配缓存和变量，回复 SYN=1, ACK=1, seq=${serverIsn}, ack=${clientIsn + 1}，进入 SYN_RCVD。`,
        codeLine: 3,
        state: {
          clientState: 'SYN_SENT',
          serverState: 'SYN_RCVD',
          messages: [
            { from: 'Client', to: 'Server', flags: 'SYN=1', seq: clientIsn, note: '请求建连' },
            {
              from: 'Server',
              to: 'Client',
              flags: 'SYN=1, ACK=1',
              seq: serverIsn,
              ack: clientIsn + 1,
              note: '同意建连并确认x (SYN消耗1个序号)',
            },
          ],
        },
      },
      {
        title: '第三次握手：Client → Server (ACK=1, seq=x+1, ack=y+1)',
        description: `Client 确认对端序列号，发送 ACK=1, seq=${clientIsn + 1}, ack=${serverIsn + 1}。注意此普通 ACK 报文若不带数据则不消耗序号！双方进入 ESTABLISHED！`,
        codeLine: 4,
        state: {
          clientState: 'ESTABLISHED',
          serverState: 'ESTABLISHED',
          messages: [
            { from: 'Client', to: 'Server', flags: 'SYN=1', seq: clientIsn, note: '第1次握手' },
            { from: 'Server', to: 'Client', flags: 'SYN=1, ACK=1', seq: serverIsn, ack: clientIsn + 1, note: '第2次握手' },
            {
              from: 'Client',
              to: 'Server',
              flags: 'ACK=1',
              seq: clientIsn + 1,
              ack: serverIsn + 1,
              note: '第3次握手(可携带应用层数据!)',
            },
          ],
        },
      },
    ];
  }

  // 4-way teardown
  const u = clientIsn + 50;
  const v = serverIsn + 80;
  return [
    {
      title: '双方处于已建立连接 ESTABLISHED',
      description: `准备由 Client 发起主动释放连接，当前已发序号至 ${u - 1}，Server 序号至 ${v - 1}。`,
      codeLine: 5,
      state: { clientState: 'ESTABLISHED', serverState: 'ESTABLISHED', messages: [] },
    },
    {
      title: '第一次挥手：Client → Server (FIN=1, seq=u)',
      description: `Client 停止发送数据，发送 FIN=1, seq=${u}（FIN 消耗 1 个序号），进入 FIN_WAIT_1。`,
      codeLine: 6,
      state: {
        clientState: 'FIN_WAIT_1',
        serverState: 'ESTABLISHED',
        messages: [{ from: 'Client', to: 'Server', flags: 'FIN=1', seq: u, note: 'Client 主动关闭发送方向' }],
      },
    },
    {
      title: '第二次挥手：Server → Client (ACK=1, seq=v, ack=u+1)',
      description: `Server 收到 FIN 后回复 ACK=1, seq=${v}, ack=${u + 1}，进入 CLOSE_WAIT；Client 进入 FIN_WAIT_2（半关闭状态：Server 仍可继续向 Client 发完剩余数据！）。`,
      codeLine: 7,
      state: {
        clientState: 'FIN_WAIT_2',
        serverState: 'CLOSE_WAIT',
        messages: [
          { from: 'Client', to: 'Server', flags: 'FIN=1', seq: u, note: '第1次挥手' },
          { from: 'Server', to: 'Client', flags: 'ACK=1', seq: v, ack: u + 1, note: '第2次挥手(进入半关闭!)' },
        ],
      },
    },
    {
      title: '第三次挥手：Server → Client (FIN=1, ACK=1, seq=w, ack=u+1)',
      description: `Server 数据也发完了，发出 FIN=1, ACK=1, seq=${v + 20}, ack=${u + 1}，进入 LAST_ACK。`,
      codeLine: 8,
      state: {
        clientState: 'FIN_WAIT_2',
        serverState: 'LAST_ACK',
        messages: [
          { from: 'Client', to: 'Server', flags: 'FIN=1', seq: u, note: '第1次挥手' },
          { from: 'Server', to: 'Client', flags: 'ACK=1', seq: v, ack: u + 1, note: '第2次挥手' },
          { from: 'Server', to: 'Client', flags: 'FIN=1, ACK=1', seq: v + 20, ack: u + 1, note: '第3次挥手(Server发完)' },
        ],
      },
    },
    {
      title: '第四次挥手：Client → Server (ACK=1) 并进入 TIME_WAIT (2MSL)',
      description: `Client 回复 ACK=1, seq=${u + 1}, ack=${v + 21} 后进入 TIME_WAIT 等待 2MSL 才彻底 CLOSED（防最后一个 ACK 丢失及旧报文残留）；Server 收到后直接进入 CLOSED！`,
      codeLine: 9,
      state: {
        clientState: 'TIME_WAIT (2MSL)',
        serverState: 'CLOSED',
        messages: [
          { from: 'Client', to: 'Server', flags: 'FIN=1', seq: u, note: '第1次挥手' },
          { from: 'Server', to: 'Client', flags: 'ACK=1', seq: v, ack: u + 1, note: '第2次挥手' },
          { from: 'Server', to: 'Client', flags: 'FIN=1, ACK=1', seq: v + 20, ack: u + 1, note: '第3次挥手' },
          { from: 'Client', to: 'Server', flags: 'ACK=1', seq: u + 1, ack: v + 21, note: '第4次挥手(等2MSL!)' },
        ],
      },
    },
  ];
}
