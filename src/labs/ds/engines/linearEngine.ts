import type { SimStep } from '../../../types/core';

export interface StackSeqState {
  pushSeq: string[];
  targetSeq: string[];
  pushIdx: number;
  targetIdx: number;
  stack: string[];
  output: string[];
  status: 'running' | 'valid' | 'invalid';
}

export function simulateStackSequence(pushStr: string, targetStr: string): SimStep<StackSeqState>[] {
  const pushSeq = pushStr.split(/[\s,，]+/).filter(Boolean);
  const targetSeq = targetStr.split(/[\s,，]+/).filter(Boolean);
  const steps: SimStep<StackSeqState>[] = [];

  if (pushSeq.length === 0 || targetSeq.length === 0) {
    return [{
      title: '请输入序列',
      description: '请提供入栈序列与目标出栈序列。',
      state: { pushSeq, targetSeq, pushIdx: 0, targetIdx: 0, stack: [], output: [], status: 'invalid' },
    }];
  }

  const stack: string[] = [];
  const output: string[] = [];
  let pushIdx = 0;
  let targetIdx = 0;

  steps.push({
    title: '初始化空栈',
    description: `准备按顺序压入 [${pushSeq.join(', ')}]，验证能否产出目标出栈序列 [${targetSeq.join(', ')}]。`,
    codeLine: 1,
    state: { pushSeq, targetSeq, pushIdx, targetIdx, stack: [], output: [], status: 'running' },
  });

  if (pushSeq.length !== targetSeq.length) {
    steps.push({
      title: '长度不匹配',
      description: `入栈长度 (${pushSeq.length}) 与目标出栈长度 (${targetSeq.length}) 不等，必定无法构成完整出栈序列。`,
      codeLine: 9,
      state: { pushSeq, targetSeq, pushIdx, targetIdx, stack: [], output: [], status: 'invalid' },
    });
    return steps;
  }

  while (targetIdx < targetSeq.length) {
    const need = targetSeq[targetIdx];
    if (stack.length > 0 && stack[stack.length - 1] === need) {
      stack.pop();
      output.push(need);
      targetIdx++;
      steps.push({
        title: `栈顶匹配，弹出 ${need}`,
        description: `当前栈顶元素恰好等于目标第 ${targetIdx} 个输出 '${need}'，执行 Pop(${need})。`,
        codeLine: 4,
        state: {
          pushSeq,
          targetSeq,
          pushIdx,
          targetIdx,
          stack: [...stack],
          output: [...output],
          status: targetIdx === targetSeq.length ? 'valid' : 'running',
        },
      });
    } else if (pushIdx < pushSeq.length) {
      const item = pushSeq[pushIdx++];
      stack.push(item);
      steps.push({
        title: `压入元素 ${item}`,
        description: `栈顶不是目标 '${need}'，从输入序列读取 '${item}' 执行 Push(${item})。`,
        codeLine: 6,
        state: {
          pushSeq,
          targetSeq,
          pushIdx,
          targetIdx,
          stack: [...stack],
          output: [...output],
          status: 'running',
        },
      });
    } else {
      steps.push({
        title: `判定非法序列`,
        description: `输入序列已全部压栈，当前栈顶为 '${stack[stack.length - 1]}' 而非目标 '${need}'，无法跳过栈顶取出 '${need}'！`,
        codeLine: 8,
        state: {
          pushSeq,
          targetSeq,
          pushIdx,
          targetIdx,
          stack: [...stack],
          output: [...output],
          status: 'invalid',
        },
      });
      return steps;
    }
  }

  steps.push({
    title: '验证通过：合法出栈序列',
    description: `所有元素均按目标序列 [${output.join(', ')}] 成功弹出，栈已清空。`,
    codeLine: 10,
    state: { pushSeq, targetSeq, pushIdx, targetIdx, stack: [...stack], output: [...output], status: 'valid' },
  });
  return steps;
}

export interface InfixState {
  tokens: string[];
  cursor: number;
  opStack: string[];
  postfix: string[];
  evalStack: number[];
  phase: 'convert' | 'eval' | 'done';
}

function tokenizeExpr(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const s = expr.replace(/\s+/g, '');
  while (i < s.length) {
    if (/[0-9.]/.test(s[i])) {
      let num = '';
      while (i < s.length && /[0-9.]/.test(s[i])) {
        num += s[i++];
      }
      tokens.push(num);
    } else if (/[a-zA-Z]/.test(s[i])) {
      tokens.push(s[i++]);
    } else {
      tokens.push(s[i++]);
    }
  }
  return tokens;
}

const OP_PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

export function simulateInfixToPostfix(expr: string): SimStep<InfixState>[] {
  const tokens = tokenizeExpr(expr);
  const steps: SimStep<InfixState>[] = [];
  const opStack: string[] = [];
  const postfix: string[] = [];

  steps.push({
    title: '初始化中缀转后缀',
    description: `解析词法单元共 ${tokens.length} 个：${tokens.join(' ')}`,
    codeLine: 1,
    state: { tokens, cursor: -1, opStack: [], postfix: [], evalStack: [], phase: 'convert' },
  });

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (/^[0-9a-zA-Z.]+$/.test(tk)) {
      postfix.push(tk);
      steps.push({
        title: `操作数 ${tk} 直接输出`,
        description: `遇到操作数 '${tk}'，直接追加到后缀表达式末尾。`,
        codeLine: 3,
        state: { tokens, cursor: i, opStack: [...opStack], postfix: [...postfix], evalStack: [], phase: 'convert' },
      });
    } else if (tk === '(') {
      opStack.push(tk);
      steps.push({
        title: '左括号 ( 入栈',
        description: `遇到 '(' 直接压入运算符栈等待匹配的 ')'。`,
        codeLine: 4,
        state: { tokens, cursor: i, opStack: [...opStack], postfix: [...postfix], evalStack: [], phase: 'convert' },
      });
    } else if (tk === ')') {
      while (opStack.length > 0 && opStack[opStack.length - 1] !== '(') {
        const popped = opStack.pop()!;
        postfix.push(popped);
      }
      if (opStack[opStack.length - 1] === '(') opStack.pop();
      steps.push({
        title: '右括号 ) 弹栈至左括号',
        description: `遇到 ')'，依次弹出运算符直到 '('（并丢弃这对括号）。`,
        codeLine: 5,
        state: { tokens, cursor: i, opStack: [...opStack], postfix: [...postfix], evalStack: [], phase: 'convert' },
      });
    } else if (tk in OP_PREC) {
      while (
        opStack.length > 0 &&
        opStack[opStack.length - 1] !== '(' &&
        OP_PREC[opStack[opStack.length - 1]] >= OP_PREC[tk]
      ) {
        postfix.push(opStack.pop()!);
      }
      opStack.push(tk);
      steps.push({
        title: `处理运算符 '${tk}'`,
        description: `弹出栈顶优先级 >= '${tk}' 的运算符输出，再将 '${tk}' 入栈。`,
        codeLine: 7,
        state: { tokens, cursor: i, opStack: [...opStack], postfix: [...postfix], evalStack: [], phase: 'convert' },
      });
    }
  }

  while (opStack.length > 0) {
    const rem = opStack.pop()!;
    if (rem !== '(') postfix.push(rem);
  }
  steps.push({
    title: '转换完成：清空运算符栈',
    description: `最终后缀表达式为：${postfix.join(' ')}`,
    codeLine: 9,
    state: { tokens, cursor: tokens.length, opStack: [], postfix: [...postfix], evalStack: [], phase: 'convert' },
  });

  // Evaluate if numeric
  const isAllNumeric = postfix.every((t) => /^[0-9.]+$/.test(t) || t in OP_PREC);
  if (isAllNumeric && postfix.length > 0) {
    const evalStack: number[] = [];
    for (let i = 0; i < postfix.length; i++) {
      const tk = postfix[i];
      if (!(tk in OP_PREC)) {
        evalStack.push(Number(tk));
        steps.push({
          title: `后缀求值：操作数 ${tk} 入栈`,
          description: `扫描后缀项 '${tk}' 压入操作数栈。`,
          codeLine: 11,
          state: { tokens, cursor: i, opStack: [], postfix: [...postfix], evalStack: [...evalStack], phase: 'eval' },
        });
      } else if (evalStack.length >= 2) {
        const right = evalStack.pop()!;
        const left = evalStack.pop()!;
        let val = 0;
        if (tk === '+') val = left + right;
        else if (tk === '-') val = left - right;
        else if (tk === '*') val = left * right;
        else if (tk === '/') val = right !== 0 ? Number((left / right).toFixed(3)) : NaN;
        evalStack.push(val);
        steps.push({
          title: `计算 ${left} ${tk} ${right} = ${val}`,
          description: `注意次序！先弹出右操作数 ${right}，再弹出左操作数 ${left}，结果 ${val} 压回栈。`,
          codeLine: 13,
          state: { tokens, cursor: i, opStack: [], postfix: [...postfix], evalStack: [...evalStack], phase: 'eval' },
        });
      }
    }
    if (evalStack.length === 1) {
      steps.push({
        title: `求值完成：结果 = ${evalStack[0]}`,
        description: `表达式最终计算结果为 ${evalStack[0]}。`,
        codeLine: 14,
        state: { tokens, cursor: postfix.length, opStack: [], postfix: [...postfix], evalStack: [...evalStack], phase: 'done' },
      });
    }
  }
  return steps;
}

export interface KmpStepState {
  text: string;
  pattern: string;
  oneBased: boolean;
  useNextVal: boolean;
  next: number[];
  nextval: number[];
  i: number; // 0-based index into text
  j: number; // 0-based index into pattern (visual alignment: pattern[0] aligns at text[i - j])
  matchedAt: number[];
  mismatch?: boolean;
  phase: 'build' | 'match' | 'done';
  buildIdx?: number;
}

export function computeKmpArrays(pattern: string, oneBased: boolean): { next: number[]; nextval: number[] } {
  const m = pattern.length;
  if (m === 0) return { next: [], nextval: [] };

  // Compute standard 0-based next array first: next0[0] = -1
  const next0: number[] = new Array(m).fill(0);
  next0[0] = -1;
  let i = 0;
  let j = -1;
  while (i < m - 1) {
    if (j === -1 || pattern[i] === pattern[j]) {
      i++;
      j++;
      next0[i] = j;
    } else {
      j = next0[j];
    }
  }

  const nextval0: number[] = [...next0];
  for (let k = 1; k < m; k++) {
    if (pattern[k] === pattern[next0[k]]) {
      nextval0[k] = nextval0[next0[k]];
    } else {
      nextval0[k] = next0[k];
    }
  }

  if (oneBased) {
    return {
      next: next0.map((v) => v + 1),
      nextval: nextval0.map((v) => v + 1),
    };
  }
  return { next: next0, nextval: nextval0 };
}

export function simulateKmp(
  text: string,
  pattern: string,
  oneBased: boolean,
  useNextVal: boolean
): SimStep<KmpStepState>[] {
  const steps: SimStep<KmpStepState>[] = [];
  if (!text || !pattern) return steps;

  const { next, nextval } = computeKmpArrays(pattern, oneBased);
  const jumpTable = useNextVal ? nextval : next;
  const offset = oneBased ? 1 : 0;

  steps.push({
    title: `计算模式串 "${pattern}" 的 ${useNextVal ? 'nextval' : 'next'} 数组`,
    description: `按 ${oneBased ? '1-based (408严蔚敏版, next[1]=0)' : '0-based (C数组版, next[0]=-1)'} 规则，得到跳转表 [${jumpTable.join(', ')}]。`,
    codeLine: 1,
    state: {
      text,
      pattern,
      oneBased,
      useNextVal,
      next,
      nextval,
      i: 0,
      j: 0,
      matchedAt: [],
      phase: 'build',
    },
  });

  let i = 0;
  let j = 0; // 0-based position in pattern
  const matchedAt: number[] = [];
  let guard = 0;

  while (i < text.length && guard++ < 400) {
    if (j === -1 || text[i] === pattern[j]) {
      if (j === -1) {
        i++;
        j = 0;
        steps.push({
          title: `模式串整体右移 1 位`,
          description: `j 跳转至 ${oneBased ? 0 : -1}（首字符也失配），主串指针 i 前进至 ${i + offset}，j 重置对齐模式串首位。`,
          codeLine: 5,
          state: { text, pattern, oneBased, useNextVal, next, nextval, i, j, matchedAt: [...matchedAt], phase: 'match' },
        });
      } else {
        const curI = i;
        const curJ = j;
        i++;
        j++;
        steps.push({
          title: `字符匹配成功：'${text[curI]}' == '${pattern[curJ]}'`,
          description: `S[${curI + offset}] 与 P[${curJ + offset}] 匹配成功，i 和 j 同时后移。`,
          codeLine: 5,
          state: {
            text,
            pattern,
            oneBased,
            useNextVal,
            next,
            nextval,
            i: curI,
            j: curJ,
            matchedAt: [...matchedAt],
            phase: 'match',
          },
        });
        if (j === pattern.length) {
          const pos = i - pattern.length;
          matchedAt.push(pos);
          steps.push({
            title: `成功匹配完整模式串！起始位置 = ${pos + offset}`,
            description: `在主串位置 ${pos + offset} 处找到完整匹配 "${pattern}"。`,
            codeLine: 9,
            state: {
              text,
              pattern,
              oneBased,
              useNextVal,
              next,
              nextval,
              i: i - 1,
              j: pattern.length - 1,
              matchedAt: [...matchedAt],
              phase: 'done',
            },
          });
          break;
        }
      }
    } else {
      const nextValRaw = jumpTable[j] - offset; // convert back to 0-based
      const prevJ = j;
      j = nextValRaw;
      steps.push({
        title: `失配跳转：S[${i + offset}]='${text[i]}' != P[${prevJ + offset}]='${pattern[prevJ]}'`,
        description: `主串指针 i=${i + offset} 不回溯！模式串指针 j 由 ${prevJ + offset} 回跳至 ${useNextVal ? 'nextval' : 'next'}[${prevJ + offset}] = ${jumpTable[prevJ]}。`,
        codeLine: 7,
        state: {
          text,
          pattern,
          oneBased,
          useNextVal,
          next,
          nextval,
          i,
          j,
          matchedAt: [...matchedAt],
          mismatch: true,
          phase: 'match',
        },
      });
    }
  }

  if (matchedAt.length === 0) {
    steps.push({
      title: '匹配结束：未找到模式串',
      description: `主串扫描完毕，模式串 "${pattern}" 未在主串中出现。`,
      codeLine: 10,
      state: { text, pattern, oneBased, useNextVal, next, nextval, i, j, matchedAt: [], phase: 'done' },
    });
  }
  return steps;
}
