# CS408 Lab · 考研 408 全科交互可视化实验室

基于 **Vue 3 + Vite + TypeScript + Element Plus + ECharts + Vue Flow + D3-Hierarchy + KaTeX** 构建的计算机考研 408（数据结构、计算机组成原理、操作系统、计算机网络）交互式可视化学习平台。

## 核心特性

- **四大科目全覆盖（24 个交互实验室）**：
  - **数据结构（45 分）**：栈应用与 KMP（1-based `next`/`nextval`）、二叉树自定义形态（画布点选 `+L/+R`、括号法、前/后+中序重建与线索化）、森林转换/哈夫曼树/并查集、BST/AVL 四旋/红黑树、B-树阶数自定义分裂合并、图论自定义拓扑（BFS/DFS/Prim/Kruskal/Dijkstra/Floyd/AOE）、8 大内部排序对比与散列表 ASL。
  - **计算机组成原理（45 分）**：定点数四码与双符号位溢出、IEEE 754 拆解与 Booth 补码一位乘、主存-Cache 映射替换、TLB+页表+Cache 协同寻址、扩展操作码与九大寻址方式、5 级流水线时空图（Forwarding/Load-Use 气泡）与 CPU 数据通路、多重中断屏蔽字与 DMA 开销对比。
  - **操作系统（35 分）**：进程七状态模型与 CPU 调度甘特图（FCFS/SJF/SRTF/RR/优先级/MLFQ）、PV 同步互斥（含颠倒 `P(mutex)` 死锁复现）、银行家算法与资源分配图 RAG 化简、页面置换（含 Belady 异常）与动态分区合并、UNIX 混合索引与磁盘调度轨迹。
  - **计算机网络（25 分）**：物理层数字编码示波器与 CRC 模 2 除法、停等/GBN/SR 滑动窗口（支持手动丢包）、交换机自学习与广播域/冲突域计算、VLSM/CIDR 二叉划分/IP 分片/最长前缀匹配、RIP 计数到无穷 vs OSPF 收敛、TCP 三次握手/四次挥手与拥塞控制曲线（Reno/Tahoe）。
- **逐帧回放与伪代码追踪**：支持播放/暂停、单步进退、进度拖拽、倍速调节与快捷键（`Space`、`←`、`→`）。
- **考点精讲与随堂真题**：内置 KaTeX 公式卡、考研高频易错避坑与自测真题解析。

## 本地运行

```bash
npm install
npm run dev
```

## 构建与测试

```bash
npm run test
npm run build
```
