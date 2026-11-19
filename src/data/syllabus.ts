import type { SubjectMeta, TopicMeta } from '../types/core';
import { DS_TOPICS } from './syllabus-ds';
import { CO_TOPICS } from './syllabus-co';
import { OS_TOPICS } from './syllabus-os';
import { CN_TOPICS } from './syllabus-cn';

export const SUBJECTS: SubjectMeta[] = [
  {
    id: 'ds',
    name: '数据结构',
    shortName: 'DS',
    enName: 'Data Structures',
    scoreWeight: 45,
    accentColor: '#409eff',
    badgeClass: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950/60 dark:border-blue-800',
    description: '线性表、栈队列、KMP、自定义树与森林、AVL/B-树、图论与内部排序算法动态演练',
  },
  {
    id: 'co',
    name: '计算机组成原理',
    shortName: 'CO',
    enName: 'Computer Organization',
    scoreWeight: 45,
    accentColor: '#e6a23c',
    badgeClass: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/60 dark:border-amber-800',
    description: 'IEEE 754、Booth乘除、Cache映射替换、TLB+页表、指令寻址、CPU数据通路与流水线',
  },
  {
    id: 'os',
    name: '操作系统',
    shortName: 'OS',
    enName: 'Operating Systems',
    scoreWeight: 35,
    accentColor: '#10b981',
    badgeClass: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/60 dark:border-emerald-800',
    description: '进程状态与CPU调度甘特图、PV操作信号量、银行家与RAG、内存分区/页面置换、混合索引与磁盘',
  },
  {
    id: 'cn',
    name: '计算机网络',
    shortName: 'CN',
    enName: 'Computer Networks',
    scoreWeight: 25,
    accentColor: '#8b5cf6',
    badgeClass: 'text-violet-600 bg-violet-50 border-violet-200 dark:text-violet-300 dark:bg-violet-950/60 dark:border-violet-800',
    description: '波形编码与CRC、滑动窗口ARQ、交换机自学习、CIDR/VLSM与分片、RIP/OSPF、TCP握手与拥塞控制',
  },
];

export const ALL_TOPICS: TopicMeta[] = [
  ...DS_TOPICS,
  ...CO_TOPICS,
  ...OS_TOPICS,
  ...CN_TOPICS,
];

export function getTopicById(id: string): TopicMeta {
  return ALL_TOPICS.find((t) => t.id === id) || ALL_TOPICS[0];
}
