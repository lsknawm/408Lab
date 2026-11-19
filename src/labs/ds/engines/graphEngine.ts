import type { SimStep } from '../../../types/core';

export interface GraphVertex {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface GraphEdgeDef {
  id: string;
  source: string;
  target: string;
  weight: number;
}

export type GraphAlgo = 'bfs' | 'dfs' | 'prim' | 'kruskal' | 'dijkstra' | 'floyd' | 'topo-aoe';

export interface GraphSimState {
  activeVertexId?: string | null;
  visitedIds: string[];
  activeEdgeIds: string[];
  mstOrPathEdgeIds: string[];
  criticalEdgeIds: string[];
  auxiliaryTitle: string;
  auxiliaryItems: string[];
  tableHeaders?: string[];
  tableRows?: Record<string, string | number>[];
  floydMatrix?: (number | string)[][];
  floydLabels?: string[];
  floydChanged?: Array<[number, number]>;
}

export function parseEdgeListText(
  text: string,
  directed: boolean
): { vertices: GraphVertex[]; edges: GraphEdgeDef[] } {
  const lines = text
    .split(/[,，;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const vNames = new Set<string>();
  const rawEdges: Array<{ u: string; v: string; w: number }> = [];

  for (const line of lines) {
    // Support A->B:4, A-B:4, A B 4, A->B
    const m = line.match(/^([a-zA-Z0-9_]+)\s*(?:->|--|-|—|\s)\s*([a-zA-Z0-9_]+)(?:\s*[:：\s]\s*(-?\d+(?:\.\d+)?))?$/);
    if (m) {
      const u = m[1];
      const v = m[2];
      const w = m[3] !== undefined ? Number(m[3]) : 1;
      vNames.add(u);
      vNames.add(v);
      rawEdges.push({ u, v, w });
    } else if (/^[a-zA-Z0-9_]+$/.test(line)) {
      vNames.add(line);
    }
  }

  const names = Array.from(vNames);
  const n = names.length;
  const cx = 290;
  const cy = 180;
  const r = Math.min(145, 70 + n * 12);

  const vertices: GraphVertex[] = names.map((name, i) => {
    const angle = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
    return {
      id: name,
      label: name,
      x: Math.round(cx + r * Math.cos(angle)),
      y: Math.round(cy + r * Math.sin(angle)),
    };
  });

  const edges: GraphEdgeDef[] = rawEdges.map((e, idx) => ({
    id: `e_${e.u}_${e.v}_${idx}`,
    source: e.u,
    target: e.v,
    weight: e.w,
  }));

  void directed;
  return { vertices, edges };
}

export function buildAdjacencyData(
  vertices: GraphVertex[],
  edges: GraphEdgeDef[],
  directed: boolean
) {
  const n = vertices.length;
  const idxMap = new Map<string, number>();
  vertices.forEach((v, i) => idxMap.set(v.id, i));

  const matrix: (number | '∞')[][] = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => (r === c ? 0 : '∞'))
  );
  const adjList: Record<string, Array<{ to: string; weight: number; edgeId: string }>> = {};
  vertices.forEach((v) => (adjList[v.id] = []));

  for (const e of edges) {
    const u = idxMap.get(e.source);
    const v = idxMap.get(e.target);
    if (u === undefined || v === undefined) continue;
    matrix[u][v] = e.weight;
    adjList[e.source].push({ to: e.target, weight: e.weight, edgeId: e.id });
    if (!directed) {
      matrix[v][u] = e.weight;
      adjList[e.target].push({ to: e.source, weight: e.weight, edgeId: e.id });
    }
  }

  return { matrix, adjList, idxMap };
}

export function simulateGraphAlgo(
  vertices: GraphVertex[],
  edges: GraphEdgeDef[],
  directed: boolean,
  algo: GraphAlgo,
  startId: string
): SimStep<GraphSimState>[] {
  const steps: SimStep<GraphSimState>[] = [];
  if (vertices.length === 0) {
    return [{
      title: '空图',
      description: '请先添加顶点和边或选择预设拓扑。',
      state: {
        visitedIds: [],
        activeEdgeIds: [],
        mstOrPathEdgeIds: [],
        criticalEdgeIds: [],
        auxiliaryTitle: '状态',
        auxiliaryItems: [],
      },
    }];
  }

  const start = vertices.some((v) => v.id === startId) ? startId : vertices[0].id;
  const { adjList, idxMap, matrix } = buildAdjacencyData(vertices, edges, directed);

  if (algo === 'bfs') {
    const visited = new Set<string>([start]);
    const queue: string[] = [start];
    const order: string[] = [];
    const treeEdges: string[] = [];

    steps.push({
      title: `BFS 初始化：起点 ${start} 入队`,
      description: `标记 ${start} 已访问并入队，准备按层逐波扩展。`,
      codeLine: 2,
      state: {
        activeVertexId: start,
        visitedIds: [start],
        activeEdgeIds: [],
        mstOrPathEdgeIds: [],
        criticalEdgeIds: [],
        auxiliaryTitle: 'BFS 队列 & 访问序列',
        auxiliaryItems: [`Queue: [${queue.join(', ')}]`, `Order: []`],
      },
    });

    while (queue.length > 0) {
      const u = queue.shift()!;
      order.push(u);
      for (const nb of adjList[u] || []) {
        if (!visited.has(nb.to)) {
          visited.add(nb.to);
          queue.push(nb.to);
          treeEdges.push(nb.edgeId);
          steps.push({
            title: `从 ${u} 发现未访问邻接点 ${nb.to}`,
            description: `访问并标记 ${nb.to}，将生成树边 (${u}, ${nb.to}) 加入并把 ${nb.to} 入队。`,
            codeLine: 6,
            state: {
              activeVertexId: nb.to,
              visitedIds: [...order, ...queue],
              activeEdgeIds: [nb.edgeId],
              mstOrPathEdgeIds: [...treeEdges],
              criticalEdgeIds: [],
              auxiliaryTitle: 'BFS 队列 & 访问序列',
              auxiliaryItems: [`Queue: [${queue.join(', ')}]`, `Order: [${order.join(' → ')}]`],
            },
          });
        }
      }
    }
    steps.push({
      title: 'BFS 遍历完成',
      description: `最终 BFS 访问序列：${order.join(' → ')}`,
      codeLine: 9,
      state: {
        visitedIds: order,
        activeEdgeIds: [],
        mstOrPathEdgeIds: [...treeEdges],
        criticalEdgeIds: [],
        auxiliaryTitle: 'BFS 最终结果',
        auxiliaryItems: [`Order: [${order.join(' → ')}]`],
      },
    });
    return steps;
  }

  if (algo === 'dfs') {
    const visited = new Set<string>();
    const order: string[] = [];
    const treeEdges: string[] = [];
    const callStack: string[] = [];

    const dfsRec = (u: string) => {
      visited.add(u);
      order.push(u);
      callStack.push(u);
      steps.push({
        title: `DFS 访问顶点 ${u}`,
        description: `标记 ${u} 已访问，沿邻接边向下深搜。当前递归栈：[${callStack.join(' → ')}]`,
        codeLine: 3,
        state: {
          activeVertexId: u,
          visitedIds: [...order],
          activeEdgeIds: [],
          mstOrPathEdgeIds: [...treeEdges],
          criticalEdgeIds: [],
          auxiliaryTitle: 'DFS 递归栈 & 遍历序',
          auxiliaryItems: [`Stack: [${callStack.join(', ')}]`, `Order: [${order.join(' → ')}]`],
        },
      });
      for (const nb of adjList[u] || []) {
        if (!visited.has(nb.to)) {
          treeEdges.push(nb.edgeId);
          dfsRec(nb.to);
        }
      }
      callStack.pop();
    };

    dfsRec(start);
    steps.push({
      title: 'DFS 遍历完成',
      description: `最终 DFS 访问序列：${order.join(' → ')}`,
      codeLine: 7,
      state: {
        visitedIds: [...order],
        activeEdgeIds: [],
        mstOrPathEdgeIds: [...treeEdges],
        criticalEdgeIds: [],
        auxiliaryTitle: 'DFS 最终结果',
        auxiliaryItems: [`Order: [${order.join(' → ')}]`],
      },
    });
    return steps;
  }

  if (algo === 'prim') {
    const inMst = new Set<string>([start]);
    const mstEdges: string[] = [];
    let totalCost = 0;
    const lowcost: Record<string, number> = {};
    const closest: Record<string, string> = {};
    const closestEdge: Record<string, string> = {};

    vertices.forEach((v) => {
      lowcost[v.id] = v.id === start ? 0 : Infinity;
      closest[v.id] = start;
    });
    for (const nb of adjList[start] || []) {
      if (nb.weight < lowcost[nb.to]) {
        lowcost[nb.to] = nb.weight;
        closest[nb.to] = start;
        closestEdge[nb.to] = nb.edgeId;
      }
    }

    const makeRows = () =>
      vertices.map((v) => ({
        顶点: v.id,
        已入树: inMst.has(v.id) ? '✓' : '×',
        lowcost: lowcost[v.id] === Infinity ? '∞' : lowcost[v.id],
        前驱点: closest[v.id],
      }));

    steps.push({
      title: `Prim 初始化：起点 ${start} 加入生成树`,
      description: `初始化所有顶点到树集合的最小边权 lowcost[]。`,
      codeLine: 2,
      state: {
        activeVertexId: start,
        visitedIds: [start],
        activeEdgeIds: [],
        mstOrPathEdgeIds: [],
        criticalEdgeIds: [],
        auxiliaryTitle: `MST 总代价: 0`,
        auxiliaryItems: [],
        tableHeaders: ['顶点', '已入树', 'lowcost', '前驱点'],
        tableRows: makeRows(),
      },
    });

    while (inMst.size < vertices.length) {
      let bestV: string | null = null;
      let bestW = Infinity;
      for (const v of vertices) {
        if (!inMst.has(v.id) && lowcost[v.id] < bestW) {
          bestW = lowcost[v.id];
          bestV = v.id;
        }
      }
      if (!bestV) {
        steps.push({
          title: '图不连通，Prim 停止',
          description: '剩余顶点无法从当前生成树到达，无法构成单一生成树。',
          codeLine: 5,
          state: {
            visitedIds: Array.from(inMst),
            activeEdgeIds: [],
            mstOrPathEdgeIds: [...mstEdges],
            criticalEdgeIds: [],
            auxiliaryTitle: `MST 部分代价: ${totalCost}`,
            auxiliaryItems: [],
            tableHeaders: ['顶点', '已入树', 'lowcost', '前驱点'],
            tableRows: makeRows(),
          },
        });
        break;
      }

      inMst.add(bestV);
      totalCost += bestW;
      if (closestEdge[bestV]) mstEdges.push(closestEdge[bestV]);

      for (const nb of adjList[bestV] || []) {
        if (!inMst.has(nb.to) && nb.weight < lowcost[nb.to]) {
          lowcost[nb.to] = nb.weight;
          closest[nb.to] = bestV;
          closestEdge[nb.to] = nb.edgeId;
        }
      }

      steps.push({
        title: `选入最小跨越边 (${closest[bestV]} — ${bestV}, 权 ${bestW})`,
        description: `贪心选取 lowcost 最小的顶点 ${bestV} 并入 MST，累计代价 = ${totalCost}，更新其邻居的 lowcost[]。`,
        codeLine: 6,
        state: {
          activeVertexId: bestV,
          visitedIds: Array.from(inMst),
          activeEdgeIds: closestEdge[bestV] ? [closestEdge[bestV]] : [],
          mstOrPathEdgeIds: [...mstEdges],
          criticalEdgeIds: [],
          auxiliaryTitle: `MST 当前总权值: ${totalCost}`,
          auxiliaryItems: [],
          tableHeaders: ['顶点', '已入树', 'lowcost', '前驱点'],
          tableRows: makeRows(),
        },
      });
    }
    return steps;
  }

  if (algo === 'kruskal') {
    const sortedEdges = [...edges].sort((a, b) => a.weight - b.weight);
    const parent: Record<string, string> = {};
    vertices.forEach((v) => (parent[v.id] = v.id));
    const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const mstEdges: string[] = [];
    let totalCost = 0;
    const logs: string[] = [];

    steps.push({
      title: 'Kruskal 初始化：按边权升序排列所有边',
      description: `共 ${sortedEdges.length} 条边，使用并查集逐条判环贪心加边。`,
      codeLine: 1,
      state: {
        visitedIds: [],
        activeEdgeIds: [],
        mstOrPathEdgeIds: [],
        criticalEdgeIds: [],
        auxiliaryTitle: '边权升序队列 & MST代价: 0',
        auxiliaryItems: sortedEdges.map((e) => `${e.source}-${e.target}(w=${e.weight})`),
      },
    });

    for (const e of sortedEdges) {
      const ra = find(e.source);
      const rb = find(e.target);
      if (ra !== rb) {
        parent[rb] = ra;
        mstEdges.push(e.id);
        totalCost += e.weight;
        logs.push(`✓ 选入 ${e.source}-${e.target} (w=${e.weight})`);
        steps.push({
          title: `选入边 (${e.source}, ${e.target}) 权=${e.weight}`,
          description: `${e.source} 与 ${e.target} 属于不同连通分量，合并之！MST 累计代价 = ${totalCost}。`,
          codeLine: 5,
          state: {
            visitedIds: Array.from(new Set(mstEdges.flatMap((id) => {
              const ed = edges.find((x) => x.id === id);
              return ed ? [ed.source, ed.target] : [];
            }))),
            activeEdgeIds: [e.id],
            mstOrPathEdgeIds: [...mstEdges],
            criticalEdgeIds: [],
            auxiliaryTitle: `MST 累计代价: ${totalCost}`,
            auxiliaryItems: [...logs],
          },
        });
      } else {
        logs.push(`× 舍弃 ${e.source}-${e.target} (w=${e.weight}, 成环)`);
        steps.push({
          title: `跳过边 (${e.source}, ${e.target})：形成环路`,
          description: `${e.source} 与 ${e.target} 已连通（同根 ${ra}），加入将成环，舍弃！`,
          codeLine: 7,
          state: {
            visitedIds: Array.from(new Set(mstEdges.flatMap((id) => {
              const ed = edges.find((x) => x.id === id);
              return ed ? [ed.source, ed.target] : [];
            }))),
            activeEdgeIds: [e.id],
            mstOrPathEdgeIds: [...mstEdges],
            criticalEdgeIds: [],
            auxiliaryTitle: `MST 累计代价: ${totalCost}`,
            auxiliaryItems: [...logs],
          },
        });
      }
      if (mstEdges.length === vertices.length - 1) break;
    }
    return steps;
  }

  if (algo === 'dijkstra') {
    const dist: Record<string, number> = {};
    const path: Record<string, string> = {};
    const pathEdge: Record<string, string> = {};
    const finalized = new Set<string>();
    vertices.forEach((v) => {
      dist[v.id] = v.id === start ? 0 : Infinity;
      path[v.id] = v.id === start ? start : '-';
    });

    const makeRows = () =>
      vertices.map((v) => ({
        顶点: v.id,
        集合S: finalized.has(v.id) ? '已确定' : '候选',
        dist: dist[v.id] === Infinity ? '∞' : dist[v.id],
        前驱: path[v.id],
      }));

    steps.push({
      title: `Dijkstra 初始化：源点 ${start}`,
      description: `设置 dist[${start}] = 0，其余为 ∞。逐轮选取未确定顶点中 dist 最小者加入 S 集合并松弛其出边。`,
      codeLine: 2,
      state: {
        activeVertexId: start,
        visitedIds: [],
        activeEdgeIds: [],
        mstOrPathEdgeIds: [],
        criticalEdgeIds: [],
        auxiliaryTitle: `源点: ${start}`,
        auxiliaryItems: [],
        tableHeaders: ['顶点', '集合S', 'dist', '前驱'],
        tableRows: makeRows(),
      },
    });

    while (finalized.size < vertices.length) {
      let u: string | null = null;
      let minD = Infinity;
      for (const v of vertices) {
        if (!finalized.has(v.id) && dist[v.id] < minD) {
          minD = dist[v.id];
          u = v.id;
        }
      }
      if (!u) break;
      finalized.add(u);

      const relaxed: string[] = [];
      for (const nb of adjList[u] || []) {
        if (!finalized.has(nb.to) && dist[u] + nb.weight < dist[nb.to]) {
          dist[nb.to] = dist[u] + nb.weight;
          path[nb.to] = u;
          pathEdge[nb.to] = nb.edgeId;
          relaxed.push(`${nb.to}=${dist[nb.to]}`);
        }
      }

      steps.push({
        title: `确定最短路顶点 ${u} (dist=${minD})`,
        description:
          relaxed.length > 0
            ? `将 ${u} 纳入已确定集 S，并成功松弛更新邻接点：[${relaxed.join(', ')}]。`
            : `将 ${u} 纳入已确定集 S（未产生更短松弛路径）。`,
        codeLine: 6,
        state: {
          activeVertexId: u,
          visitedIds: Array.from(finalized),
          activeEdgeIds: pathEdge[u] ? [pathEdge[u]] : [],
          mstOrPathEdgeIds: Object.values(pathEdge),
          criticalEdgeIds: [],
          auxiliaryTitle: `已确定顶点集 S: {${Array.from(finalized).join(', ')}}`,
          auxiliaryItems: [],
          tableHeaders: ['顶点', '集合S', 'dist', '前驱'],
          tableRows: makeRows(),
        },
      });
    }
    return steps;
  }

  if (algo === 'floyd') {
    const n = vertices.length;
    const labels = vertices.map((v) => v.id);
    const D: number[][] = matrix.map((row) => row.map((v) => (v === '∞' ? Infinity : v)));
    const fmt = (mat: number[][]) => mat.map((r) => r.map((v) => (v === Infinity ? '∞' : v)));

    steps.push({
      title: 'Floyd-Warshall 初始化矩阵 A^(-1)',
      description: '初始距离矩阵直接读取邻接矩阵权值（无直达边记为 ∞，对角线为 0）。',
      codeLine: 1,
      state: {
        visitedIds: [],
        activeEdgeIds: [],
        mstOrPathEdgeIds: [],
        criticalEdgeIds: [],
        auxiliaryTitle: '全源最短路径矩阵演化',
        auxiliaryItems: [],
        floydMatrix: fmt(D),
        floydLabels: labels,
        floydChanged: [],
      },
    });

    for (let k = 0; k < n; k++) {
      const changed: Array<[number, number]> = [];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (D[i][k] !== Infinity && D[k][j] !== Infinity && D[i][k] + D[k][j] < D[i][j]) {
            D[i][j] = D[i][k] + D[k][j];
            changed.push([i, j]);
          }
        }
      }
      steps.push({
        title: `第 ${k + 1} 轮迭代：以 ${labels[k]} 为中间点 (A^(${k}))`,
        description:
          changed.length > 0
            ? `允许经过 ${labels[k]} 中转后，共有 ${changed.length} 个点对距离缩短（矩阵高亮单元格）。`
            : `允许经过 ${labels[k]} 中转，本轮无更短路径更新。`,
        codeLine: 5,
        state: {
          activeVertexId: labels[k],
          visitedIds: labels.slice(0, k + 1),
          activeEdgeIds: [],
          mstOrPathEdgeIds: [],
          criticalEdgeIds: [],
          auxiliaryTitle: `当前中转点 k = ${labels[k]}`,
          auxiliaryItems: changed.map(([i, j]) => `${labels[i]}→${labels[j]} 更新为 ${D[i][j]}`),
          floydMatrix: fmt(D),
          floydLabels: labels,
          floydChanged: changed,
        },
      });
    }
    return steps;
  }

  // Topo + AOE Critical Path
  const indeg: Record<string, number> = {};
  vertices.forEach((v) => (indeg[v.id] = 0));
  for (const e of edges) {
    if (indeg[e.target] !== undefined) indeg[e.target]++;
  }
  const zeroQ = vertices.filter((v) => indeg[v.id] === 0).map((v) => v.id);
  const topoOrder: string[] = [];
  const ve: Record<string, number> = {};
  vertices.forEach((v) => (ve[v.id] = 0));

  steps.push({
    title: '拓扑排序与 AOE 事件最早时间 ve 初始化',
    description: `初始入度为 0 的事件节点：[${zeroQ.join(', ') || '无'}]；所有事件 ve 置 0。`,
    codeLine: 1,
    state: {
      visitedIds: [],
      activeEdgeIds: [],
      mstOrPathEdgeIds: [],
      criticalEdgeIds: [],
      auxiliaryTitle: '零入度队列 & 拓扑序列',
      auxiliaryItems: [`零入度队列: [${zeroQ.join(', ')}]`],
    },
  });

  const curIndeg = { ...indeg };
  while (zeroQ.length > 0) {
    const u = zeroQ.shift()!;
    topoOrder.push(u);
    for (const e of edges.filter((x) => x.source === u)) {
      if (ve[u] + e.weight > ve[e.target]) {
        ve[e.target] = ve[u] + e.weight;
      }
      curIndeg[e.target]--;
      if (curIndeg[e.target] === 0) zeroQ.push(e.target);
    }
    steps.push({
      title: `拓扑出队 ${u} (ve[${u}] = ${ve[u]})`,
      description: `处理 ${u} 的出边以递推后继事件最早发生时间 ve，并更新入度。当前拓扑序：[${topoOrder.join(' → ')}]`,
      codeLine: 5,
      state: {
        activeVertexId: u,
        visitedIds: [...topoOrder],
        activeEdgeIds: edges.filter((x) => x.source === u).map((x) => x.id),
        mstOrPathEdgeIds: [],
        criticalEdgeIds: [],
        auxiliaryTitle: '拓扑序列 & 事件 ve[]',
        auxiliaryItems: [
          `拓扑序: [${topoOrder.join(' → ')}]`,
          ...topoOrder.map((id) => `ve[${id}] = ${ve[id]}`),
        ],
      },
    });
  }

  if (topoOrder.length < vertices.length) {
    steps.push({
      title: '检测到有向环！无法完成拓扑排序',
      description: `仅输出 ${topoOrder.length}/${vertices.length} 个顶点，存在回路，不是合法的 AOE-DAG 网！`,
      codeLine: 8,
      state: {
        visitedIds: topoOrder,
        activeEdgeIds: [],
        mstOrPathEdgeIds: [],
        criticalEdgeIds: [],
        auxiliaryTitle: '拓扑判环失败',
        auxiliaryItems: [`存在有向环！已处理: [${topoOrder.join(' → ')}]`],
      },
    });
    return steps;
  }

  const maxVe = Math.max(0, ...Object.values(ve));
  const vl: Record<string, number> = {};
  vertices.forEach((v) => (vl[v.id] = maxVe));
  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const u = topoOrder[i];
    for (const e of edges.filter((x) => x.source === u)) {
      if (vl[e.target] - e.weight < vl[u]) {
        vl[u] = vl[e.target] - e.weight;
      }
    }
  }

  const criticalEdgeIds: string[] = [];
  const aoeRows = edges.map((e) => {
    const early = ve[e.source];
    const late = vl[e.target] - e.weight;
    const slack = late - early;
    if (slack === 0) criticalEdgeIds.push(e.id);
    return {
      活动边: `${e.source}→${e.target}`,
      工期: e.weight,
      'e(最早)': early,
      'l(最迟)': late,
      '余量(l-e)': slack,
      关键活动: slack === 0 ? '★ 关键' : '-',
    };
  });

  steps.push({
    title: `逆拓扑求得 vl[] 与关键路径 (总工期 = ${maxVe})`,
    description: `所有时间余量 l - e = 0 的活动（红色高亮边）构成从源点到汇点的关键路径！`,
    codeLine: 11,
    state: {
      visitedIds: topoOrder,
      activeEdgeIds: [],
      mstOrPathEdgeIds: [],
      criticalEdgeIds,
      auxiliaryTitle: `AOE 总工期: ${maxVe}`,
      auxiliaryItems: [`拓扑序: [${topoOrder.join(' → ')}]`],
      tableHeaders: ['活动边', '工期', 'e(最早)', 'l(最迟)', '余量(l-e)', '关键活动'],
      tableRows: aoeRows,
    },
  });

  void idxMap;
  return steps;
}
