export type SubjectId = 'ds' | 'co' | 'os' | 'cn';

export interface SubjectMeta {
  id: SubjectId;
  name: string;
  shortName: string;
  enName: string;
  scoreWeight: number; // 408 exam points out of 150
  accentColor: string;
  badgeClass: string;
  description: string;
}

export interface QuizQuestion {
  id: string;
  yearTag?: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface FormulaCard {
  label: string;
  formula: string;
  note?: string;
}

export interface TopicMeta {
  id: string;
  subject: SubjectId;
  chapter: string;
  title: string;
  subtitle: string;
  difficulty: '基础' | '高频' | '压轴大题';
  customizableFeatures: string[];
  summary: string;
  keyPoints: string[];
  formulas?: FormulaCard[];
  pitfalls: string[];
  quiz: QuizQuestion[];
}

export interface SimStep<T = unknown> {
  title: string;
  description: string;
  codeLine?: number; // 1-based line number in pseudocode
  state: T;
  metrics?: Record<string, string | number>;
}
