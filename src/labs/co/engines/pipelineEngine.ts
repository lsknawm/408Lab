import type { SimStep } from '../../../types/core';

export interface ParsedInstr {
  idx: number;
  raw: string;
  op: 'ADD' | 'SUB' | 'AND' | 'OR' | 'LW' | 'SW' | 'BEQ' | 'NOP';
  rd?: string; // destination register written in WB
  rs1?: string;
  rs2?: string;
}

export function parseAssembly(text: string): ParsedInstr[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/#.*/, '').replace(/\/\/.*/, '').trim())
    .filter(Boolean)
    .slice(0, 8);

  return lines.map((raw, idx) => {
    const clean = raw.toUpperCase().replace(/,/g, ' ');
    const tokens = clean.split(/\s+/).filter(Boolean);
    const opRaw = tokens[0] || 'NOP';

    if (['ADD', 'SUB', 'AND', 'OR'].includes(opRaw)) {
      return {
        idx,
        raw,
        op: opRaw as ParsedInstr['op'],
        rd: tokens[1],
        rs1: tokens[2],
        rs2: tokens[3],
      };
    }
    if (opRaw === 'LW') {
      // LW R1, 0(R2)
      const memTok = tokens[2] || '';
      const m = memTok.match(/\((R\d+|X\d+|T\d+|S\d+)\)/);
      return {
        idx,
        raw,
        op: 'LW',
        rd: tokens[1],
        rs1: m ? m[1] : undefined,
      };
    }
    if (opRaw === 'SW') {
      // SW R1, 0(R2) -> reads R1 and R2, writes nothing
      const memTok = tokens[2] || '';
      const m = memTok.match(/\((R\d+|X\d+|T\d+|S\d+)\)/);
      return {
        idx,
        raw,
        op: 'SW',
        rs1: tokens[1],
        rs2: m ? m[1] : undefined,
      };
    }
    if (opRaw === 'BEQ') {
      return {
        idx,
        raw,
        op: 'BEQ',
        rs1: tokens[1],
        rs2: tokens[2],
      };
    }
    return { idx, raw, op: 'NOP' };
  });
}

export type StageTag = 'IF' | 'ID' | 'EX' | 'MEM' | 'WB' | 'STALL' | '';

export interface PipelineSchedule {
  instrs: ParsedInstr[];
  totalCycles: number;
  stallCount: number;
  // grid[instrIdx][cycle0Based] = StageTag
  grid: StageTag[][];
  hazardNotes: Array<{ cycle: number; msg: string; kind: 'stall' | 'forward' }>;
  cpi: number;
  speedup: number;
}

export function buildPipelineSchedule(asmText: string, forwarding: boolean): PipelineSchedule {
  const instrs = parseAssembly(asmText);
  const n = instrs.length;
  if (n === 0) {
    return { instrs: [], totalCycles: 0, stallCount: 0, grid: [], hazardNotes: [], cpi: 1, speedup: 1 };
  }

  // Track cycle (1-based) each stage runs for each instruction
  const stages: Array<{ ifC: number; idC: number; exC: number; memC: number; wbC: number }> = [];
  const hazardNotes: PipelineSchedule['hazardNotes'] = [];
  let stallCount = 0;

  for (let i = 0; i < n; i++) {
    const cur = instrs[i];
    const prevIf = i === 0 ? 0 : stages[i - 1].ifC;
    const prevId = i === 0 ? 0 : stages[i - 1].idC;
    const ifC = prevIf + 1;
    let idC = Math.max(ifC + 1, prevId + 1);

    // Check RAW hazards with previous instructions (j = i-1, i-2)
    const srcs = [cur.rs1, cur.rs2].filter((r): r is string => !!r && r !== 'R0' && r !== 'X0');
    let requiredExStart = idC + 1;

    for (let j = Math.max(0, i - 2); j < i; j++) {
      const older = instrs[j];
      if (!older.rd || !srcs.includes(older.rd)) continue;

      if (forwarding) {
        if (older.op === 'LW') {
          // Load value available after older.memC; cur needs it at start of cur.exC
          const earliestEx = stages[j].memC + 1;
          if (earliestEx > requiredExStart) {
            requiredExStart = earliestEx;
            hazardNotes.push({
              cycle: earliestEx - 1,
              msg: `Load-Use 冒险：${cur.raw} 依赖 ${older.raw} 的 ${older.rd}，虽有旁路仍须插入气泡 (MEM→EX 转发)`,
              kind: 'stall',
            });
          } else {
            hazardNotes.push({
              cycle: requiredExStart,
              msg: `MEM→EX 旁路转发：${older.rd} 从 MEM/WB 转发给 ${cur.raw}`,
              kind: 'forward',
            });
          }
        } else {
          // ALU result available after older.exC
          const earliestEx = stages[j].exC + 1;
          if (earliestEx > requiredExStart) requiredExStart = earliestEx;
          hazardNotes.push({
            cycle: stages[j].exC + 1,
            msg: `旁路转发 (${j === i - 1 ? 'EX→EX' : 'MEM→EX'})：${older.rd} 直接转发给 ${cur.raw}，零停顿！`,
            kind: 'forward',
          });
        }
      } else {
        // Without forwarding: WB writes in first half, ID reads in second half -> cur.idC >= older.wbC
        const earliestId = stages[j].wbC;
        if (earliestId > idC) {
          requiredExStart = Math.max(requiredExStart, earliestId + 1);
          hazardNotes.push({
            cycle: idC,
            msg: `无旁路 RAW 阻塞：${cur.raw} 需等待 ${older.raw} 在第 ${stages[j].wbC} 拍写回 ${older.rd}`,
            kind: 'stall',
          });
        }
      }
    }

    const addedStalls = Math.max(0, requiredExStart - (idC + 1));
    stallCount += addedStalls;
    // During stall, instruction sits in ID/EX boundary (we show STALL bubbles before EX)
    const exC = requiredExStart;
    const memC = exC + 1;
    const wbC = memC + 1;
    stages.push({ ifC, idC, exC, memC, wbC });

    // Also update subsequent instructions' IF/ID in-order pipeline fetch stalls
    // Notice: when i stalls for k cycles before EX, i+1 cannot advance ID until i leaves ID!
    // In our loop, prevId is stages[i-1].idC; if i stalled, ID was occupied during idC..exC-1!
    // Wait: let's make stages[i].idC represent the final ID cycle before entering EX, or mark stall in ID!
    if (addedStalls > 0) {
      // Shift stages[i].idC to exC - 1? Keep initial idC as first ID, and fill STALL in between!
      // And make sure next instruction doesn't enter ID while i is holding ID!
      stages[i].idC = exC - 1;
    }
  }

  const totalCycles = Math.max(...stages.map((s) => s.wbC));
  const grid: StageTag[][] = Array.from({ length: n }, () => Array.from({ length: totalCycles }, () => ''));

  for (let i = 0; i < n; i++) {
    const s = stages[i];
    const firstId = Math.max(s.ifC + 1, i === 0 ? 2 : stages[i - 1].idC + 1);
    grid[i][s.ifC - 1] = 'IF';
    grid[i][firstId - 1] = 'ID';
    for (let c = firstId + 1; c < s.exC; c++) {
      grid[i][c - 1] = 'STALL';
    }
    grid[i][s.exC - 1] = 'EX';
    grid[i][s.memC - 1] = 'MEM';
    grid[i][s.wbC - 1] = 'WB';
  }

  const cpi = Number((totalCycles / (n + 4) * (n + 4) > 0 ? totalCycles / n : 1).toFixed(2));
  const singleCycleEquivalent = n * 5;
  const speedup = Number((singleCycleEquivalent / totalCycles).toFixed(2));

  return { instrs, totalCycles, stallCount, grid, hazardNotes, cpi, speedup };
}

export interface DatapathStepState {
  instrName: string;
  phase: string;
  activeNodes: string[];
  activeEdges: string[];
  signals: string[];
  regValues: { PC: string; IR: string; MAR: string; MDR: string; ALU_Z: string };
}

export function simulateDatapath(instrKind: 'ADD' | 'LW' | 'BEQ'): SimStep<DatapathStepState>[] {
  if (instrKind === 'LW') {
    return [
      {
        title: 'T1 取指阶段 (IF): 送地址至 MAR 并读主存',
        description: 'PC 内容经内部总线送入 MAR，同时发出读信号 MemRead，PC 自增 +4。',
        codeLine: 1,
        state: {
          instrName: 'LW R1, 4(R2)',
          phase: 'IF 取指',
          activeNodes: ['PC', 'MAR', 'MEM', 'MDR', 'IR'],
          activeEdges: ['e_pc_mar', 'e_mar_mem', 'e_mem_mdr', 'e_mdr_ir'],
          signals: ['PCout', 'MARin', 'MemRead', 'MDRin', 'IRin', 'PC+4'],
          regValues: { PC: '0x1004', IR: 'LW R1, 4(R2)', MAR: '0x1000', MDR: '0x8C410004', ALU_Z: '-' },
        },
      },
      {
        title: 'T2 译码与读寄存器 (ID)',
        description: 'CU 对 IR 操作码译码识别为 LW，同时从通用寄存器堆读出基址寄存器 R2 的值送暂存器。',
        codeLine: 3,
        state: {
          instrName: 'LW R1, 4(R2)',
          phase: 'ID 译码',
          activeNodes: ['IR', 'CU', 'GPR'],
          activeEdges: ['e_ir_cu', 'e_ir_gpr'],
          signals: ['IR->CU', 'RegRead(R2)'],
          regValues: { PC: '0x1004', IR: 'LW R1, 4(R2)', MAR: '0x1000', MDR: '0x8C410004', ALU_Z: 'R2=0x2000' },
        },
      },
      {
        title: 'T3 执行阶段 (EX): ALU 计算有效地址 EA',
        description: 'ALU 将 (R2)=0x2000 与符号扩展后的偏移量 4 相加，得到有效地址 0x2004 存入 Z。',
        codeLine: 5,
        state: {
          instrName: 'LW R1, 4(R2)',
          phase: 'EX 算址',
          activeNodes: ['GPR', 'ALU', 'Z'],
          activeEdges: ['e_gpr_alu', 'e_alu_z'],
          signals: ['ALUSrc=Imm', 'ALUOp=ADD', 'Zin'],
          regValues: { PC: '0x1004', IR: 'LW R1, 4(R2)', MAR: '0x1000', MDR: '0x8C410004', ALU_Z: '0x2004' },
        },
      },
      {
        title: 'T4 访存阶段 (MEM): 读取目标存储单元',
        description: '将有效地址 0x2004 从 Z 送入 MAR，发出 MemRead 读出数据至 MDR。',
        codeLine: 7,
        state: {
          instrName: 'LW R1, 4(R2)',
          phase: 'MEM 访存',
          activeNodes: ['Z', 'MAR', 'MEM', 'MDR'],
          activeEdges: ['e_z_mar', 'e_mar_mem', 'e_mem_mdr'],
          signals: ['Zout', 'MARin', 'MemRead', 'MDRin'],
          regValues: { PC: '0x1004', IR: 'LW R1, 4(R2)', MAR: '0x2004', MDR: '0x00000042', ALU_Z: '0x2004' },
        },
      },
      {
        title: 'T5 写回阶段 (WB): 写入目的寄存器 R1',
        description: '将 MDR 中读到的数据 0x00000042 经总线写入通用寄存器 R1，指令执行完毕！',
        codeLine: 9,
        state: {
          instrName: 'LW R1, 4(R2)',
          phase: 'WB 写回',
          activeNodes: ['MDR', 'GPR'],
          activeEdges: ['e_mdr_gpr'],
          signals: ['MDRout', 'MemtoReg=1', 'RegWrite(R1)'],
          regValues: { PC: '0x1004', IR: 'LW R1, 4(R2)', MAR: '0x2004', MDR: '0x00000042', ALU_Z: 'R1←66' },
        },
      },
    ];
  }
  if (instrKind === 'ADD') {
    return [
      {
        title: 'T1 取指 (IF): 读指令入 IR，PC+4',
        description: 'PC 送 MAR，读出 ADD R1, R2, R3 指令至 MDR 再送 IR。',
        codeLine: 1,
        state: {
          instrName: 'ADD R1, R2, R3',
          phase: 'IF 取指',
          activeNodes: ['PC', 'MAR', 'MEM', 'MDR', 'IR'],
          activeEdges: ['e_pc_mar', 'e_mar_mem', 'e_mem_mdr', 'e_mdr_ir'],
          signals: ['PCout', 'MARin', 'MemRead', 'IRin', 'PC+4'],
          regValues: { PC: '0x1004', IR: 'ADD R1,R2,R3', MAR: '0x1000', MDR: '0x00430820', ALU_Z: '-' },
        },
      },
      {
        title: 'T2 译码与读源操作数 (ID)',
        description: '译码确定 R 型算术指令，从 GPR 读出 R2 和 R3 送往 ALU 输入端。',
        codeLine: 3,
        state: {
          instrName: 'ADD R1, R2, R3',
          phase: 'ID 译码',
          activeNodes: ['IR', 'CU', 'GPR'],
          activeEdges: ['e_ir_cu', 'e_ir_gpr'],
          signals: ['IR->CU', 'Read(R2, R3)'],
          regValues: { PC: '0x1004', IR: 'ADD R1,R2,R3', MAR: '0x1000', MDR: '0x00430820', ALU_Z: '15, 27' },
        },
      },
      {
        title: 'T3 执行 (EX): ALU 加法运算',
        description: 'ALU 执行 (R2)+(R3) = 15 + 27 = 42，结果锁存至 Z 寄存器（并更新状态标志位）。',
        codeLine: 5,
        state: {
          instrName: 'ADD R1, R2, R3',
          phase: 'EX 运算',
          activeNodes: ['GPR', 'ALU', 'Z'],
          activeEdges: ['e_gpr_alu', 'e_alu_z'],
          signals: ['ALUOp=ADD', 'Zin'],
          regValues: { PC: '0x1004', IR: 'ADD R1,R2,R3', MAR: '0x1000', MDR: '0x00430820', ALU_Z: '42' },
        },
      },
      {
        title: 'T4/T5 写回 (WB): 跳过 MEM 写回 R1',
        description: '算术指令不访问数据主存，直接将 Z=42 写回目的寄存器 R1！',
        codeLine: 9,
        state: {
          instrName: 'ADD R1, R2, R3',
          phase: 'WB 写回',
          activeNodes: ['Z', 'GPR'],
          activeEdges: ['e_z_gpr'],
          signals: ['Zout', 'MemtoReg=0', 'RegWrite(R1)'],
          regValues: { PC: '0x1004', IR: 'ADD R1,R2,R3', MAR: '0x1000', MDR: '0x00430820', ALU_Z: 'R1←42' },
        },
      },
    ];
  }
  return [
    {
      title: 'T1 取指 (IF): 取 BEQ 指令并 PC+4',
      description: '读取 BEQ R1, R2, offset 指令，PC 自动加 4 变为 0x1004。',
      codeLine: 1,
      state: {
        instrName: 'BEQ R1, R2, +8',
        phase: 'IF 取指',
        activeNodes: ['PC', 'MAR', 'MEM', 'MDR', 'IR'],
        activeEdges: ['e_pc_mar', 'e_mar_mem', 'e_mem_mdr', 'e_mdr_ir'],
        signals: ['PCout', 'MARin', 'MemRead', 'IRin', 'PC+4'],
        regValues: { PC: '0x1004', IR: 'BEQ R1,R2,+8', MAR: '0x1000', MDR: '0x11220002', ALU_Z: '-' },
      },
    },
    {
      title: 'T2 译码与读比较数 (ID)',
      description: '读取 R1 与 R2 值用于比较是否相等。',
      codeLine: 3,
      state: {
        instrName: 'BEQ R1, R2, +8',
        phase: 'ID 译码',
        activeNodes: ['IR', 'CU', 'GPR'],
        activeEdges: ['e_ir_cu', 'e_ir_gpr'],
        signals: ['IR->CU', 'Read(R1, R2)'],
        regValues: { PC: '0x1004', IR: 'BEQ R1,R2,+8', MAR: '0x1000', MDR: '0x11220002', ALU_Z: 'R1==R2' },
      },
    },
    {
      title: 'T3 执行 (EX): ALU 判零与跳转目标计算',
      description: 'ALU 计算 (R1)-(R2)==0 置 Zero=1；分支加法器算得目标地址 (PC+4)+8 = 0x100C 写入 PC！',
      codeLine: 6,
      state: {
        instrName: 'BEQ R1, R2, +8',
        phase: 'EX 分支判定',
        activeNodes: ['GPR', 'ALU', 'PC'],
        activeEdges: ['e_gpr_alu', 'e_alu_pc'],
        signals: ['ALUOp=SUB', 'Zero=1', 'BranchTaken', 'PCWrite'],
        regValues: { PC: '0x100C', IR: 'BEQ R1,R2,+8', MAR: '0x1000', MDR: '0x11220002', ALU_Z: 'Zero=1' },
      },
    },
  ];
}
