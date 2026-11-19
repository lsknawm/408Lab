import type { TopicMeta } from '../types/core';

export const CO_TOPICS: TopicMeta[] = [
  {
    id: 'co-data-alu',
    subject: 'co',
    chapter: '第2章 数据的表示和运算',
    title: '定点/浮点表示与 Booth 乘除法器',
    subtitle: '原反补移码 / 双符号位溢出 / IEEE 754 拆解 / Booth 补码一位乘寄存器演化',
    difficulty: '高频',
    customizableFeatures: ['任意十进制/十六进制转 IEEE 754', '自定义加减法与位宽判溢出', '自定义二进制乘数演示 Booth 逐拍运算'],
    summary:
      '支持任意实数实时转换为 IEEE 754 单精度 32 位格式，演示变形补码双符号位溢出判断，并逐时钟拍展示 Booth 补码一位乘与原码一位乘中 ACC、MQ、X 寄存器的加减与算术右移过程。',
    keyPoints: [
      '补码表示范围（n 位含 1 位符号位）：[-2^(n-1), 2^(n-1) - 1]，0 有唯一表示；移码真值加上偏置 2^(n-1)，符号位与补码相反，便于比较阶码大小。',
      '双符号位溢出判定：结果双符号位 Sf1 Sf2 为 01 表示正溢出，10 表示负溢出，00 和 11 无溢出（最高位 Sf1 永远代表正确符号）。',
      'IEEE 754 单精度 (32位)：1位符号位 S + 8位阶码 E(偏置127) + 23位尾数 M(规格化隐含前导 1)。',
      'Booth 补码一位乘：根据附加位 y_{n+1} 与最低位 y_n 的差 (y_{n+1} - y_n) 决定 +[X]_补、-[X]_补 或 +0，然后连同符号位算术右移 1 位，共进行 n 次加/移位（最后一次只加不移）。',
    ],
    formulas: [
      { label: 'IEEE 754 单精度规格化真值', formula: '(-1)^S \\times (1.M) \\times 2^{E - 127}, \\quad (1 \\le E \\le 254)' },
      { label: 'IEEE 754 非规格化真值', formula: '(-1)^S \\times (0.M) \\times 2^{-126}, \\quad (E = 0, M \\neq 0)' },
    ],
    pitfalls: [
      '【超级高频】IEEE 754 单精度非规格化数指数是 2^(-126) 而不是 2^(-127)！',
      'int 强转 float 可能丢失精度（int 32位有效数字，float 尾数仅 24 位有效精度）；float 转 int 可能溢出或截断小数（向零舍入）。',
    ],
    quiz: [
      {
        id: 'co-da-q1',
        yearTag: '408 经典真题',
        question: 'IEEE 754 单精度浮点数格式中，十六进制数 C1A40000H 表示的十进制真值是？',
        options: ['-20.5', '-21.5', '-10.25', '20.5'],
        answerIndex: 0,
        explanation: 'C1A40000H = 1100 0001 1010 0100 ... 符号 S=1(负)；阶码 E=10000011=131，真指数 e=131-127=4；尾数 M=01001...，即 1.01001_2 * 2^4 = 10100.1_2 = -20.5。',
      },
    ],
  },
  {
    id: 'co-cache',
    subject: 'co',
    chapter: '第3章 存储系统',
    title: '主存-Cache 地址映射与替换策略',
    subtitle: '直接/组相联/全相联位划分 / 硬件总容量 / LRU·FIFO·LFU 访存命中模拟',
    difficulty: '压轴大题',
    customizableFeatures: ['自定义主存/Cache大小、块大小、相联度', '切换 LRU/FIFO/LFU 及写回/写直达', '自定义访存地址序列'],
    summary:
      '完美覆盖 408 计组最高频大题：自动根据硬件规格推导 Tag/Index/Offset 位数及 Cache 总比特容量（含有效位、脏位、LRU 替换位），并对自定义地址序列进行逐次 Hit/Miss/Write-Back 动态演示。',
    keyPoints: [
      '主存地址划分：| Tag (标记位) | Index (组号 / 行号) | Block Offset (块内偏移) |。块内偏移位数仅取决于块大小 B。',
      '直接映射可视为 1 路组相联，全相联可视为只有 1 组的组相联（Index 为 0 位）。',
      'Cache 总存储容量计算：行数 × (有效位 1b + [若写回法脏位 1b] + [若LRU替换位 log2(k) b] + Tag 位数 + 块数据位数)。',
      '局部性原理：时间局部性（循环复用）与空间局部性（按行序访问数组，步长越大缺失率越高）。',
    ],
    formulas: [
      { label: '平均访存时间 AMAT', formula: 'AMAT = h \\cdot t_c + (1 - h) \\cdot t_m \\text{ (同时访问)} \\quad \\text{或} \\quad t_c + (1 - h) \\cdot t_m \\text{ (先查Cache)}' },
      { label: '组数与 Index 位数', formula: 'S = \\frac{\\text{Cache 总行数}}{k\\text{-路}}, \\quad |Index| = \\log_2 S' },
    ],
    pitfalls: [
      '算 Cache 总位数时，千万不要漏掉 Valid 有效位(1bit) 和写回法(Write-Back)下的 Dirty 修改位(1bit)！题目如果提到“LRU 替换位”，通常 k 路组相联每行需要 log2(k) 位。',
      '按行优先遍历二维数组 a[M][N] 与按列优先遍历的 Cache 命中率天壤之别，这是 408 跨章节代码优化题最常考的点！',
    ],
    quiz: [
      {
        id: 'co-ca-q1',
        yearTag: '408 大题经典子问',
        question: '某 32 位地址机器采用 4 路组相联 Cache，数据区容量 32KB，块大小 64B，采用写回法（含1位有效位和1位脏位，不计LRU位），则 Tag 字段占几位？',
        options: ['17 位', '18 位', '19 位', '20 位'],
        answerIndex: 2,
        explanation: '块内偏移 = log2(64) = 6 位；总行数 = 32KB / 64B = 512 行；组数 S = 512 / 4 = 128 组，故组号 Index = log2(128) = 7 位；Tag = 32 - 7 - 6 = 19 位。',
      },
    ],
  },
  {
    id: 'co-vm-tlb',
    subject: 'co',
    chapter: '第3章 存储系统',
    title: '虚存 TLB + 页表 + Cache 协同寻址',
    subtitle: 'VA 拆分 -> TLB 命中判断 -> 缺页中断 -> PA 合成 -> Cache 查询全链路',
    difficulty: '压轴大题',
    customizableFeatures: ['自定义页大小、TLB 组相联参数与页表内容', '自定义虚拟地址访问序列', '动态高亮全链路命中与缺失组合'],
    summary:
      '打通计组与操作系统的联考压轴难点：以可视化管道展示虚拟地址经过 TLB、主存页表、物理内存与 Cache 的全部可能组合及访存耗时。',
    keyPoints: [
      '虚拟地址 VA = 虚页号 VPN + 页内偏移 Offset；物理地址 PA = 实页框号 PFN + 页内偏移 Offset（页内偏移不变）。',
      'TLB（快表）本质上是页表的专用高速 Cache，用 VPN 的高位作为 TLB Tag、低位作为 TLB Index。',
      '三种缺失严重度排序：TLB 缺失（几十ns，硬件/软件查页表） < Cache 缺失（几十~百ns，访主存） < 缺页 Page Fault（毫秒级，磁盘调页 + 操作系统异常处理）。',
      '全链路最慢情景：TLB Miss -> 查页表发现 Valid=0 触发缺页中断 -> 从磁盘换入页并更新页表与TLB -> 重新访存依然可能 Cache Miss！',
    ],
    formulas: [
      { label: '物理地址宽度转换', formula: 'PA = (\\text{PFN} \\ll |Offset|) \\mid (VA \\& (\\text{PageSize}-1))' },
    ],
    pitfalls: [
      '不存在“TLB 命中但发生缺页中断”的情况！因为只有 Valid=1 的有效页表项才会被装入 TLB。',
      '可能存在“TLB 缺失但数据在 Cache 中命中”的情况！因为只要页面在主存中，查完页表得到 PA 后，该数据块完全可能已经在物理地址索引的 Cache 中了。',
    ],
    quiz: [
      {
        id: 'co-vm-q1',
        yearTag: '408 必考概念',
        question: '在具有 TLB 和 Cache 的虚拟存储系统中，下列哪种情况是不可能发生的？',
        options: ['TLB 命中，Cache 缺失', 'TLB 缺失，Cache 命中', 'TLB 命中，缺页中断', 'TLB 缺失，缺页中断'],
        answerIndex: 2,
        explanation: 'TLB 仅缓存当前已调入主存的有效页表项，若 TLB 命中则说明该页必在主存中，绝对不可能触发缺页中断。',
      },
    ],
  },
  {
    id: 'co-isa',
    subject: 'co',
    chapter: '第4章 指令系统',
    title: '扩展操作码与九大寻址方式',
    subtitle: '变长操作码合法性空间计算 / 9种寻址方式有效地址 EA 与访存次数演示',
    difficulty: '高频',
    customizableFeatures: ['自定义指令字长与各级指令条数校验扩展操作码', '自定义寄存器与内存内容，单步动画追踪 9 种寻址路径'],
    summary:
      '包含两大交互模块：其一校验并自动分配三/二/一/零地址扩展操作码编码区间；其二动态演练立即、直接、间接、寄存器、寄存器间接、基址、变址、相对与堆栈寻址的有效地址计算与访存次数。',
    keyPoints: [
      '扩展操作码基本原则：短操作码不能是长操作码的前缀；每一级必须至少留出若干编码状态作为下一级的前缀标志。',
      '寻址方式核心对比：直接寻址访存 1 次（取操作数）；一次间接寻址访存 2 次；寄存器寻址访存 0 次（取指后直接读寄存器）。',
      '基址寻址 EA = (BR) + A（面向操作系统多道程序重定位，BR 内容对用户不可见）；变址寻址 EA = (IX) + A（面向用户数组循环，A 为首地址，IX 为可修改下标）。',
      '相对寻址 EA = (PC) + A：特别注意取完指令后 PC 已自动加“本条指令字节长度”，然后再加位移量 A！',
    ],
    formulas: [
      { label: '相对寻址转移目标地址', formula: 'EA = (PC_{\\text{当前}} + L_{\\text{本条指令长度}}) + \\text{offset}' },
      { label: '扩展操作码总空间约束', formula: '\\sum_{i} N_i \\cdot 2^{L_i} \\le 2^{\\text{指令总字长}}' },
    ],
    pitfalls: [
      '计算相对寻址或条件跳转指令的目标地址时，务必先让 PC 加上当前指令的长度（如 2B 或 4B），再加补码位移量（有时位移量还要乘2或乘4，如 RISC-V/MIPS 乘4）！',
      '基址寄存器 BR 由系统管理，程序员不可随意改动；变址寄存器 IX 可由程序员通过指令修改。',
    ],
    quiz: [
      {
        id: 'co-isa-q1',
        yearTag: '408 经典计算',
        question: '某指令系统字长 16 位，每个地址码占 4 位。若要求设计 15 条三地址指令、15 条二地址指令和 15 条一地址指令，则最多还能设计多少条零地址指令？',
        options: ['15 条', '16 条', '31 条', '32 条'],
        answerIndex: 1,
        explanation: '三地址用去 15/16，留 1 个前缀 1111；二地址用去 15 个(1111 0000~1110)，留 1111 1111；一地址用去 15 个，留 1111 1111 1111；余下 4 位共 2^4 = 16 个编码全用于零地址指令！',
      },
    ],
  },
  {
    id: 'co-cpu-pipeline',
    subject: 'co',
    chapter: '第5章 中央处理器',
    title: 'CPU 数据通路与 5 级指令流水线',
    subtitle: '单/多周期控制信号流水线流动 / 时空图 / 数据转发与 Load-Use 阻塞',
    difficulty: '压轴大题',
    customizableFeatures: ['自定义 MIPS/RISC-V 汇编指令序列', '一键开关数据转发 Forwarding 与流水线阻塞', '单步追踪数据通路总线信号'],
    summary:
      '前半部分展示单/多周期 CPU 在 IF/ID/EX/MEM/WB 阶段各寄存器与总线上的控制信号激活；后半部分允许用户输入自定义指令序列，自动检测数据冒险/控制冒险并生成 5 级流水线时空图及加速比。',
    keyPoints: [
      '单周期 CPU 时钟周期取决于耗时最长的指令（通常是 Load 指令）；多周期将指令拆分至若干节拍，不同指令占不同周期数。',
      '五级流水线冒险：结构冒险（硬件冲突，如指令与数据共用存储器）、数据冒险（RAW 写后读最核心）、控制冒险（分支跳转）。',
      '解决 RAW 数据冒险：无转发需停顿等待 WB 写回完成（注意前半周期写、后半周期读）；有转发（EX->EX 或 MEM->EX）可将大多数 ALU 冒险消除，但 Load-Use（如 lw 后紧跟使用其目的寄存器的指令）即使有转发也至少需停顿 1 个气泡（Stall）！',
      '硬件微操作序列中，同一时钟周期可并行执行互不冲突的微操作；硬布线速度快但扩展难，微程序控制规整易扩展但相对慢。',
    ],
    formulas: [
      { label: '流水线加速比 (k 段，n 条指令)', formula: 'S_p = \\frac{n \\cdot k}{k + n - 1}, \\quad \\lim_{n \\to \\infty} S_p = k' },
      { label: '实际 CPI (含阻塞气泡)', formula: 'CPI = 1 + \\frac{\\text{Stall Cycles}}{n}' },
    ],
    pitfalls: [
      'Load-Use 冒险在经典 5 级流水线中，即使配备了全套旁路转发电路，仍然必须插入 1 个气泡周期（因为 lw 在 MEM 阶段结束才读出数据，而下条指令在 EX 阶段开始就需要输入）！',
      '计算单条指令微操作时，MDR 既有来自主存的输入，也有向总线输出的操作；注意区分主存读/写信号何时有效。',
    ],
    quiz: [
      {
        id: 'co-cpu-q1',
        yearTag: '408 流水线核心',
        question: '在带转发功能的经典 5 级流水线(IF,ID,EX,MEM,WB)中，执行 `lw R1, 0(R2)` 后紧接着执行 `add R3, R1, R4`，至少需要插入几个气泡(Stall)？',
        options: ['0 个', '1 个', '2 个', '3 个'],
        answerIndex: 1,
        explanation: 'lw 在 MEM 拍末才得到 R1 的新值，而 add 在 EX 拍初就需要 R1 作为 ALU 输入，因此必须将 add 阻塞 1 个周期（ID 拍后插入1个气泡），然后通过 MEM->EX 转发解决。',
      },
    ],
  },
  {
    id: 'co-io-interrupt',
    subject: 'co',
    chapter: '第6-7章 总线与 I/O 系统',
    title: '多重中断屏蔽字与 I/O 控制方式',
    subtitle: '中断响应与处理次序栈演化 / 程序查询·中断驱动·DMA CPU 占用率对比',
    difficulty: '高频',
    customizableFeatures: ['自定义中断优先级与屏蔽字矩阵', '自定义中断到达时间轴', '自定义数据传输率对比 DMA/中断开销'],
    summary:
      '支持用户自行设定中断优先级、中断屏蔽字（1表示屏蔽，0表示允许中断）及请求到达时间点，生成完整嵌套执行甘特图；同时定量计算并可视化程序查询、中断驱动与 DMA 对 CPU 时间的占用。',
    keyPoints: [
      '中断响应优先级由硬件排队器决定，固定不变；中断处理次序可通过软件修改“中断屏蔽字”动态改变！',
      '屏蔽字规则：某设备处理程序运行时，若屏蔽字第 i 位为 1，则屏蔽（不允许）设备 i 打断自己；通常同时屏蔽自身与低优先级设备。',
      '程序查询占用 CPU 极高；中断驱动每次传输 1 字/字节都要保护恢复现场；DMA 由硬件控制器直接在主存和外设间传送整块数据，仅在预处理与后处理（块传送结束）请求 CPU 介入，传送期间采用“周期窃取”。',
    ],
    formulas: [
      { label: '中断/DMA 开销占比', formula: '\\text{CPU 占比} = \\frac{\\text{每秒中断次数} \\times \\text{单次服务周期}}{\\text{CPU 主频}}' },
    ],
    pitfalls: [
      '千万看清“中断响应次序”与“中断处理完成次序”的区别！多重中断中“处理完”往往呈现后进先出(LIFO)的嵌套栈特点。',
      'DMA 周期窃取时，若 DMA 和 CPU 同时请求访问主存，DMA 优先级高于 CPU（因为外设数据若不及时取走会丢失溢出）！',
    ],
    quiz: [
      {
        id: 'co-io-q1',
        yearTag: '408 经典题型',
        question: '关于 DMA 方式与程序中断方式的区别，下列叙述中错误的是？',
        options: [
          '中断方式依靠程序保存现场并传送数据，DMA 方式依靠硬件直接传送数据',
          '中断方式在每个指令周期末尾响应中断，DMA 方式在每个存取周期末尾响应总线请求',
          'DMA 传输结束后不需要向 CPU 发送任何中断请求',
          'DMA 控制器的优先级通常高于 CPU 访存优先级',
        ],
        answerIndex: 2,
        explanation: 'DMA 数据块传送完毕后，仍需要向 CPU 发出“DMA 结束中断”以进行善后处理（如通知操作系统进程就绪）。',
      },
    ],
  },
];
