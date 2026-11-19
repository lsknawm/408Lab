import type { TopicMeta } from '../types/core';

export const CN_TOPICS: TopicMeta[] = [
  {
    id: 'cn-phy-crc',
    subject: 'cn',
    chapter: '第2-3章 物理层与数据链路层',
    title: '数字编码示波器与 CRC 循环冗余校验',
    subtitle: 'NRZ / 曼彻斯特 / 差分曼彻斯特 / AMI 阶跃波形 / 模 2 异或长除法',
    difficulty: '基础',
    customizableFeatures: ['自定义二进制比特流绘制波形', '对比两种曼彻斯特跳变约定', '自定义数据串与生成多项式计算 FCS 并模拟信道误码'],
    summary:
      '利用高精度示波器阶跃折线实时生成物理层多种基带数字编码波形；同时提供交互式 CRC 循环冗余校验模2除法台，展示发送端生成 FCS 与接收端余数检错全过程。',
    keyPoints: [
      '曼彻斯特编码每个码元周期中间发生一次电平跳变（既含时钟同步又传数据），故波特率（码元速率）是比特率的 2 倍！',
      '差分曼彻斯特编码：每比特中间必跳变（用于同步），而“比特边界处是否跳变”决定0或1（同0异1，即遇0跳变，遇1不变），抗极性反转能力更强。',
      'CRC 校验：若生成多项式 G(x) 最高次幂为 r（即二进制长 r+1 位），发送端在原始数据末尾补 r 个 0，做模 2 除法得 r 位余数作为 FCS 帧检验序列拼接发送。',
      '奈奎斯特准则（无噪极限）与香农定理（有噪香农极限）：最终信道最大速率取二者较小值！',
    ],
    formulas: [
      { label: '奈奎斯特与香农公式', formula: 'C_{\\text{Nyquist}} = 2W \\log_2 V, \\quad C_{\\text{Shannon}} = W \\log_2(1 + S/N)' },
      { label: '曼彻斯特编码效率', formula: '\\text{波特率} = 2 \\times \\text{比特率}' },
    ],
    pitfalls: [
      '香农公式里的信噪比 S/N 是**无量纲比值**，如果题目给出的是分贝 dB，务必先用 S/N = 10^(dB/10) 换算！（如 30dB -> 1000）',
      'IEEE 802.3 以太网约定曼彻斯特编码：前高后低为 1，前低后高为 0（部分教材相反，核心记住“中间跳变，波特率翻倍”）。',
    ],
    quiz: [
      {
        id: 'cn-pc-q1',
        yearTag: '408 信道计算必考',
        question: '某带宽为 3kHz 的信道，信噪比为 30dB，采用 16-QAM（每码元带 4 bit）传输时，理论最大比特率受限为？',
        options: ['12 kbps', '24 kbps', '约 30 kbps', '48 kbps'],
        answerIndex: 1,
        explanation: '奈奎斯特定理：2 * 3k * log2(16) = 24 kbps；香农公式：3k * log2(1 + 1000) ≈ 30 kbps；取二者较小值 24 kbps！',
      },
    ],
  },
  {
    id: 'cn-arq',
    subject: 'cn',
    chapter: '第3章 数据链路层',
    title: '滑动窗口与可靠传输协议 (SW/GBN/SR)',
    subtitle: '停等 / 后退N帧 / 选择重传泳道交互 / 窗口上限与序号重叠演示',
    difficulty: '压轴大题',
    customizableFeatures: ['自定义序号位数 k 与收发窗口大小', '传输过程中手动注入帧丢包或 ACK 丢包', '观察信道利用率与超时重传'],
    summary:
      '允许用户配置序号比特数 k、发送窗口 W_T 与接收窗口 W_R，实时校验是否满足防序号混叠条件；通过交互式时空泳道图可随时点击丢弃某个数据帧或 ACK，亲历停等、GBN 累计确认回退与 SR 选择重传的动态演化。',
    keyPoints: [
      '停等协议：W_T = 1, W_R = 1；信道利用率 = T_D / (T_D + RTT + T_ACK)。',
      '后退 N 帧 (GBN)：W_R = 1（只按序接收），采用“累计确认”，序号位数为 k 时要求 W_T <= 2^k - 1（若 W_T = 2^k 会导致新帧与旧重传帧混淆！）。',
      '选择重传 (SR)：W_R > 1（缓存失序帧），逐帧确认无累计，满足 W_T + W_R <= 2^k 且一般取 W_T = W_R <= 2^(k-1)。',
    ],
    formulas: [
      { label: 'GBN 与 SR 窗口上限', formula: '\\text{GBN}: W_T \\le 2^k - 1; \\quad \\text{SR}: W_T + W_R \\le 2^k' },
      { label: '流水线发送信道利用率', formula: 'U = \\min\\left(1, \\frac{W_T \\cdot T_D}{T_D + RTT + T_{ACK}}\\right)' },
    ],
    pitfalls: [
      '计算发送窗口大小限制时，不仅受协议序号位数 $2^k$ 约束，还必须同时考虑带宽时延积和实际给的窗口！有时题问“要达到 100% 信道利用率，至少需要几位序号？”要先求出所需 $W_T$，再求满足 $2^k - 1 \\ge W_T$ 的最小 k！',
    ],
    quiz: [
      {
        id: 'cn-arq-q1',
        yearTag: '408 高频计算',
        question: '采用 4 位比特对数据帧编号的 GBN（后退 N 帧）协议中，发送窗口最大可设为多少？若改用 SR（选择重传）且收发窗口等大，最大各设为多少？',
        options: ['GBN: 15, SR: 8', 'GBN: 16, SR: 8', 'GBN: 15, SR: 7', 'GBN: 8, SR: 4'],
        answerIndex: 0,
        explanation: 'k=4 时 2^4 = 16。GBN 最大发送窗口为 2^4 - 1 = 15；SR 满足 W_T + W_R <= 16 且等大，故最大为 8。',
      },
    ],
  },
  {
    id: 'cn-lan-switch',
    subject: 'cn',
    chapter: '第3章 数据链路层',
    title: '交换机自学习、冲突域与 CSMA/CD',
    subtitle: '可拖拽主机/Hub/Switch/Router 拓扑发包 / MAC 表自学习 / 最小帧长推导',
    difficulty: '高频',
    customizableFeatures: ['自由组合主机、集线器、交换机、路由器', '点击任意两台主机互相发包观察 MAC 表学习与泛洪', '调节总线长度与速率验证最小帧长'],
    summary:
      '借助 Vue Flow 自定义网络二三层拓扑，直观标出所有“冲突域”和“广播域”边界，点击发起主机间通信动画演示交换机学习源 MAC 地址与查表转发；并配套 CSMA/CD 争用期与指数退避演示。',
    keyPoints: [
      '集线器 (Hub) 工作在物理层，所有端口同属一个冲突域、一个广播域；交换机 (Switch) 工作在数据链路层，每个端口隔离为一个独立冲突域，但所有端口同属一个广播域（无 VLAN 时）；路由器 (Router) 隔离广播域！',
      '交换机自学习原则：收到帧后，先把“帧的源 MAC + 入端口号”写入转发表（若已存在则刷新老化时间）；再查“目的 MAC”，命中且不在入端口则单播转发，否则除入端口外全向泛洪！',
      'CSMA/CD 先听后发、边听边发、冲突停发、随机退避（二进制指数退避，k = min(重传次数, 10)，从 [0, 2^k - 1] 选 r 倍争用期 2τ；16次仍失败丢弃）。',
    ],
    formulas: [
      { label: 'CSMA/CD 最小帧长条件', formula: 'L_{\\min} = 2\\tau \\times R = \\frac{2D}{v} \\times R' },
    ],
    pitfalls: [
      '交换机记录的是【源 MAC 地址】对应【接收端口】，转发查的是【目的 MAC 地址】！',
      '10Mbps 传统以太网争用期固定 51.2 us -> 最小帧长 512 bit = 64 字节；千兆以太网提高速率时通过增大“最小帧长（载波延伸）”或缩短最大网段距离维持检测。',
    ],
    quiz: [
      {
        id: 'cn-lan-q1',
        yearTag: '408 必考拓扑题',
        question: '一台 16 端口的以太网交换机连接了 16 台主机，其某一端口又级联了一台 8 口集线器并连了 7 台主机。整个网络中共有多少个冲突域和多少个广播域？',
        options: ['16 个冲突域，1 个广播域', '23 个冲突域，1 个广播域', '17 个冲突域，2 个广播域', '15 个冲突域，1 个广播域'],
        answerIndex: 0,
        explanation: '交换机每个连接设备的端口是一个独立冲突域：若第16口连Hub，则前15口各1个冲突域 + 第16口连整个Hub及7台主机合为1个冲突域 = 共 16 个冲突域（假设交换机总共16口，若16台主机占16口外加级联口则另算；本题设16口全插满，或理解每有连接的交换机端口算1个，Hub合1个）。所有设备同处 1 个广播域！',
      },
    ],
  },
  {
    id: 'cn-ip-route',
    subject: 'cn',
    chapter: '第4章 网络层',
    title: 'CIDR/VLSM 划分、IP 分片与路由匹配',
    subtitle: 'IP 二叉前缀树划分 / 跨多链路的 IP 分片计算 / 路由器最长前缀匹配查表',
    difficulty: '压轴大题',
    customizableFeatures: ['输入任意 CIDR 主网与各子网主机数需求生成二叉树划分', '自定义数据报总长与链式 MTU 计算每片偏移', '自定义路由表条目演示二进制按位匹配'],
    summary:
      '三大网络层高频大题工具合一：自动构建 VLSM 变长子网划分二叉树并核算可用地址范围；精确追踪跨越不同 MTU 链路后的多次 IP 分片及 Offset；逐比特解析路由转发表“最长前缀匹配”。',
    keyPoints: [
      'CIDR 可用主机数计算公式：2^(32 - prefix) - 2（扣除全0网络地址与全1直接广播地址）。',
      'VLSM 分配口诀：按各子网所需主机数**从大到小**依次从二叉地址树切块，避免碎片浪费或掩码重叠！',
      'IP 分片必考规则：除了最后一个分片，其余所有分片的“数据载荷长度”必须是 **8 字节的整数倍**！Offset 字段 = 该分片数据首字节在原数据报载荷中的偏移量 / 8。',
      '最长前缀匹配：目的 IP 分别与各表项子网掩码按位逻辑 AND，若结果等于该表项网络前缀则匹配；多条同时匹配时选前缀长度（掩码中 1 的个数）最长者！',
    ],
    formulas: [
      { label: 'IP 分片片偏移', formula: '\\text{Offset} = \\frac{\\text{数据部分起始字节偏移}}{8}, \\quad \\text{除末片外 } (\\text{TotalLen} - 20) \\bmod 8 = 0' },
    ],
    pitfalls: [
      '【高频坑】计算 IP 分片总长度包含 20B 首部，但计算“Offset”以及判断“是否 8 的倍数”只看【数据部分长度】（TotalLen - 20）！',
      '路由器路由聚合（超网合并）时，必须确保聚合后的前缀内**不包含任何不属于该聚合组的未分配网段**（除非题干明确允许黑洞路由）。',
    ],
    quiz: [
      {
        id: 'cn-ip-q1',
        yearTag: '408 分片必考',
        question: '一个总长度为 3000 字节的 IPv4 数据报（首部 20B）经过 MTU = 1420B 的链路分片，第二片的总长度和片偏移 (Offset) 分别是？',
        options: ['总长 1420B, Offset=175', '总长 1420B, Offset=1400', '总长 1400B, Offset=175', '总长 1420B, Offset=177'],
        answerIndex: 0,
        explanation: '原数据载荷 = 3000 - 20 = 2980B。每片最大载荷 = 1420 - 20 = 1400B（恰好是 8 的倍数 175*8）。故第1片载荷0~1399(总长1420)，第2片载荷1400~2799(总长1420)，Offset = 1400/8 = 175，MF=1；第3片载荷180B(总长200)，Offset = 2800/8 = 350，MF=0。',
      },
    ],
  },
  {
    id: 'cn-routing',
    subject: 'cn',
    chapter: '第4章 网络层',
    title: 'RIP 距离向量 vs OSPF 链路状态路由',
    subtitle: '自定义路由器拓扑与断链故障 / RIP 慢收敛计数到无穷 / OSPF LSA 泛洪与 SPF 树',
    difficulty: '高频',
    customizableFeatures: ['在画布拖拽增删路由器及边权', '一键断开指定链路触发路由故障恢复', '同拓扑对比 RIP 逐轮表交换与 OSPF Dijkstra 收敛'],
    summary:
      '在同一份可自定义拓扑上分别演练 RIP（基于 Bellman-Ford 距离向量）与 OSPF（基于 Dijkstra 链路状态）的收敛过程；支持手动断开链路实时重现 RIP “坏消息传得慢 / 计数到无穷 (16跳不可达)”经典现象！',
    keyPoints: [
      'RIP（应用层 UDP 520 端口）：仅与相邻路由器交换**整个路由表**；度量值是跳数，最大有效跳数 15，16 表示不可达；好消息传得快，坏消息传得慢！',
      'OSPF（网络层直接用 IP 封装，协议号 89）：全网泛洪**与本路由器相邻的所有链路状态 (LSA)**，各路由器同步全网拓扑数据库 LSDB 后独立运行 Dijkstra 算法求最短路径树。',
      'BGP（边界网关协议，应用层 TCP 179 端口）：自治系统 AS 之间的路径向量协议，防环靠 AS-PATH 属性。',
    ],
    formulas: [
      { label: '距离向量 Bellman-Ford 松弛更新', formula: 'D_x(y) = \\min_{v \\in N(x)} \\{ c(x, v) + D_v(y) \\}' },
    ],
    pitfalls: [
      '【协议封装层次考法】RIP 属于应用层协议（使用 UDP）；OSPF 直接用 IP 数据报封装；BGP 属于应用层协议（使用 TCP）！',
      'RIP 更新规则记住三句：原本没有的新增；原本有且下一跳相同无条件覆盖更新；原本有且下一跳不同仅当新距离更小时更新！',
    ],
    quiz: [
      {
        id: 'cn-rt-q1',
        yearTag: '408 协议层级对比',
        question: '关于 RIP、OSPF 和 BGP 协议的封装传输方式，下列配对全部正确的是？',
        options: [
          'RIP-UDP, OSPF-IP, BGP-TCP',
          'RIP-TCP, OSPF-UDP, BGP-IP',
          'RIP-IP, OSPF-TCP, BGP-UDP',
          'RIP-UDP, OSPF-TCP, BGP-TCP',
        ],
        answerIndex: 0,
        explanation: 'RIP 基于 UDP（端口520），OSPF 直接封装在 IP 数据报中（协议号89），BGP 基于可靠的 TCP 连接（端口179）。',
      },
    ],
  },
  {
    id: 'cn-tcp-app',
    subject: 'cn',
    chapter: '第5-6章 传输层与应用层',
    title: 'TCP 状态机、拥塞控制与 DNS/HTTP',
    subtitle: '三次握手·四次挥手·2MSL / cwnd·ssthresh 曲线注入丢包 / HTTP 1.0·1.1·2.0 时序',
    difficulty: '压轴大题',
    customizableFeatures: ['手动触发第2/3次握手丢包与 2MSL 演示', '在任意轮次注入 Timeout 或 3-Dup ACK 绘制拥塞曲线', '自定义内嵌对象数对比 HTTP 与 DNS 耗时'],
    summary:
      '全面覆盖传输层与应用层核心：TCP 三次握手/四次挥手状态机泳道（精确展示 seq/ack 变化）；可编程注入超时与冗余 ACK 的 ECharts 拥塞控制曲线（Reno vs Tahoe）；以及 DNS 迭代递归与 HTTP 持久/非持久/流水线时序对比。',
    keyPoints: [
      'TCP 三次握手：SYN=1 与 FIN=1 虽不携带应用数据，但**都要消耗 1 个序号**！纯 ACK 报文不消耗序号。',
      '四次挥手 TIME_WAIT 等待 2MSL 原因：① 确保最后一个 ACK 能到达对端（若丢失对方会重传 FIN）；② 让本连接持续时间内产生的所有旧报文段从网络中彻底消失。',
      'TCP 拥塞控制（Reno）：初始 cwnd=1 MSS 指数增长（慢开始，每收到1个新确认 cwnd+=1，每个 RTT 翻倍）；cwnd >= ssthresh 转入拥塞避免（每 RTT 线性加 1）；遇到 Timeout 时 ssthresh = cwnd/2, cwnd = 1；遇到 3 个重复 ACK 时执行快重传与快恢复（ssthresh = cwnd/2, cwnd = ssthresh）。',
      '实际发送窗口取 min(rwnd, cwnd)。HTTP/1.1 默认持久连接，HTTP/2 支持二进制分帧与多路复用消除队头阻塞（应用层）。',
    ],
    formulas: [
      { label: '发送窗口实际限制', formula: '\\text{SendWindow} = \\min(rwnd, cwnd)' },
      { label: 'Reno 3-Dup ACK 快恢复', formula: 'ssthresh = \\max(2, \\lfloor cwnd / 2 \\rfloor), \\quad cwnd = ssthresh' },
    ],
    pitfalls: [
      '【高能细节】慢开始阶段，如果 cwnd 从 8 翻倍原本要变 16，但此时 ssthresh=12，则 cwnd 只能增长到 12（而不是超过 ssthresh 到 16 再降回）！下一轮从 12 开始线性 +1。',
      '计算 HTTP 请求包含 N 个对象时，若无流水线持久连接需 2 RTT（建连1 + 请求HTML 1）+ N × 1 RTT；若带流水线只需 2 + 1 = 3 RTT（忽略传输时间）。',
    ],
    quiz: [
      {
        id: 'cn-tcp-q1',
        yearTag: '408 拥塞控制真题',
        question: '主机甲与乙建立 TCP 连接，设初始 ssthresh = 16KB，MSS = 1KB，接收窗口恒为 24KB。当 cwnd 增长到 12KB 时发生超时 (Timeout)，则在超时重传后的第 2 个 RTT 结束时 cwnd 变为多少？',
        options: ['4KB', '6KB', '8KB', '1KB'],
        answerIndex: 0,
        explanation: 'cwnd=12KB 超时后，ssthresh = 12/2 = 6KB，cwnd 重置为 1KB（慢开始重传）。经历第 1 个 RTT 后 cwnd=2KB，经历第 2 个 RTT 后 cwnd=4KB（仍小于 ssthresh=6KB，处于慢开始指数增长阶段）。',
      },
    ],
  },
];
