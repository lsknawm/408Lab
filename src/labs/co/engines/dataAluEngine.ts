import type { SimStep } from '../../../types/core';

export function toFixedPointCodes(val: number, bits: number) {
  const maxPos = (1 << (bits - 1)) - 1;
  const minNeg = -(1 << (bits - 1));
  const clamped = Math.max(minNeg, Math.min(maxPos, Math.trunc(val)));

  const pad = (n: number, w: number) => ((n >>> 0) & ((1 << w) - 1)).toString(2).padStart(w, '0');

  let signMag = '';
  let ones = '';
  if (clamped === minNeg) {
    signMag = '溢出(无原码)';
    ones = '溢出(无反码)';
  } else if (clamped >= 0) {
    signMag = '0' + pad(clamped, bits - 1);
    ones = signMag;
  } else {
    signMag = '1' + pad(-clamped, bits - 1);
    ones =
      '1' +
      pad(-clamped, bits - 1)
        .split('')
        .map((c) => (c === '0' ? '1' : '0'))
        .join('');
  }

  const twos = pad(clamped, bits);
  const offset = clamped + (1 << (bits - 1));
  const biased = pad(offset, bits);
  const doubleTwos = pad(clamped, bits + 1); // 2 sign bits + (bits-1) mag bits

  return { val: clamped, signMag, ones, twos, biased, doubleTwos };
}

export function computeDoubleSignAdd(x: number, y: number, op: '+' | '-', bits: number) {
  const realY = op === '-' ? -y : y;
  const mod = 1 << (bits + 1);
  const mask = mod - 1;
  const dx = x & mask;
  const dy = realY & mask;
  const sum = (dx + dy) & mask;

  const fmt = (n: number) => n.toString(2).padStart(bits + 1, '0');
  const sumBin = fmt(sum);
  const sf1 = sumBin[0];
  const sf2 = sumBin[1];

  let status = '无溢出';
  let overflowType: 'none' | 'pos' | 'neg' = 'none';
  if (sf1 === '0' && sf2 === '1') {
    status = '正溢出 (01)！';
    overflowType = 'pos';
  } else if (sf1 === '1' && sf2 === '0') {
    status = '负溢出 (10)！';
    overflowType = 'neg';
  }

  return {
    xBin: fmt(dx),
    yBin: fmt(dy),
    sumBin,
    sf1,
    sf2,
    status,
    overflowType,
    mathResult: x + realY,
  };
}

export interface Ieee754Breakdown {
  hex: string;
  bin32: string;
  sign: string;
  expBits: string;
  expVal: number;
  fracBits: string;
  kind: string;
  formulaText: string;
  exactValue: number;
}

export function decodeIeee754FromFloat(num: number): Ieee754Breakdown {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setFloat32(0, num, false);
  const u32 = view.getUint32(0, false);
  return decodeIeee754FromUint32(u32);
}

export function decodeIeee754FromHex(hexStr: string): Ieee754Breakdown | null {
  const cleaned = hexStr.trim().replace(/^0x/i, '').replace(/H$/i, '');
  if (!/^[0-9a-fA-F]{1,8}$/.test(cleaned)) return null;
  const u32 = parseInt(cleaned.padStart(8, '0'), 16) >>> 0;
  return decodeIeee754FromUint32(u32);
}

export function decodeIeee754FromUint32(u32: number): Ieee754Breakdown {
  const bin32 = (u32 >>> 0).toString(2).padStart(32, '0');
  const hex = (u32 >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const sign = bin32[0];
  const expBits = bin32.slice(1, 9);
  const fracBits = bin32.slice(9);
  const expVal = parseInt(expBits, 2);
  const fracInt = parseInt(fracBits, 2);

  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, u32 >>> 0, false);
  const exactValue = view.getFloat32(0, false);

  let kind = '规格化数 (Normalized)';
  let formulaText = '';

  if (expVal === 255) {
    if (fracInt === 0) {
      kind = sign === '0' ? '正无穷 (+∞)' : '负无穷 (-∞)';
      formulaText = kind;
    } else {
      kind = '非数 (NaN)';
      formulaText = 'E = 255, M != 0 → NaN';
    }
  } else if (expVal === 0) {
    if (fracInt === 0) {
      kind = sign === '0' ? '+0.0' : '-0.0';
      formulaText = `(-1)^${sign} × 0`;
    } else {
      kind = '非规格化数 (Denormalized)';
      formulaText = `(-1)^${sign} × (0.${fracBits.slice(0, 8)}...)_2 × 2^(-126)`;
    }
  } else {
    const e = expVal - 127;
    formulaText = `(-1)^${sign} × (1.${fracBits.replace(/0+$/, '') || '0'})_2 × 2^(${expVal} - 127 = ${e})`;
  }

  return { hex, bin32, sign, expBits, expVal, fracBits, kind, formulaText, exactValue };
}

export interface BoothStepState {
  bits: number;
  xDec: number;
  yDec: number;
  xDoubleBin: string;
  negXDoubleBin: string;
  acc: string;
  mq: string;
  yExtra: string;
  round: number;
  action: string;
  history: Array<{ round: number; acc: string; mq: string; yExtra: string; action: string }>;
  finalBin?: string;
  finalDec?: number;
}

export function simulateBoothMultiply(xDec: number, yDec: number, bits = 5): SimStep<BoothStepState>[] {
  // bits includes 1 sign bit, e.g. 5 bits supports [-16, 15]
  const minVal = -(1 << (bits - 1));
  const maxVal = (1 << (bits - 1)) - 1;
  const x = Math.max(minVal, Math.min(maxVal, Math.trunc(xDec)));
  const y = Math.max(minVal, Math.min(maxVal, Math.trunc(yDec)));

  const fmt = (n: number, w: number) => ((n >>> 0) & ((1 << w) - 1)).toString(2).padStart(w, '0');
  const xDoubleBin = fmt(x, bits + 1);
  const negXDoubleBin = fmt(-x, bits + 1);

  let accVal = 0; // stored as signed JS integer masked to (bits + 1)
  const doubleMask = (1 << (bits + 1)) - 1;
  const singleMask = (1 << bits) - 1;

  const toSigned = (val: number, w: number) => {
    const signBit = 1 << (w - 1);
    const m = val & ((1 << w) - 1);
    return (m & signBit) !== 0 ? m - (1 << w) : m;
  };

  let mqVal = y & singleMask;
  let yExtra = 0;

  const steps: SimStep<BoothStepState>[] = [];
  const history: BoothStepState['history'] = [];

  const pushHistory = (round: number, action: string, title: string, desc: string, codeLine: number) => {
    const accStr = fmt(accVal, bits + 1);
    const mqStr = fmt(mqVal, bits);
    const row = { round, acc: accStr, mq: mqStr, yExtra: String(yExtra), action };
    history.push(row);
    steps.push({
      title,
      description: desc,
      codeLine,
      state: {
        bits,
        xDec: x,
        yDec: y,
        xDoubleBin,
        negXDoubleBin,
        acc: accStr,
        mq: mqStr,
        yExtra: String(yExtra),
        round,
        action,
        history: [...history],
      },
    });
  };

  pushHistory(
    0,
    '初始化 ACC=0, MQ=[Y]补, 附加位=0',
    'Booth 算法初始化',
    `[X]补(双符号位) = ${xDoubleBin} (${x})，[-X]补 = ${negXDoubleBin}，[Y]补 = ${fmt(mqVal, bits)} (${y})，附加位 y_{n+1} = 0。`,
    1
  );

  for (let r = 1; r <= bits; r++) {
    const yn = mqVal & 1;
    const diff = yExtra - yn; // 0-0=0, 1-1=0, 0-1=-1 (-X), 1-0=+1 (+X)
    let act = '';
    if (diff === 1) {
      accVal = toSigned((accVal + x) & doubleMask, bits + 1);
      act = `y_{n+1}y_n = 10 → ACC + [X]补`;
    } else if (diff === -1) {
      accVal = toSigned((accVal - x) & doubleMask, bits + 1);
      act = `y_{n+1}y_n = 01 → ACC + [-X]补`;
    } else {
      act = `y_{n+1}y_n = ${yExtra}${yn} → +0 (无加减)`;
    }

    pushHistory(
      r,
      act,
      `第 ${r} 拍加法判断 (${act})`,
      `判断最低位与附加位 (${yExtra} - ${yn} = ${diff})，更新 ACC = ${fmt(accVal, bits + 1)}。`,
      4
    );

    if (r < bits) {
      // Arithmetic right shift of [ACC (bits+1) | MQ (bits) | yExtra]
      const newExtra = mqVal & 1;
      const accLsb = accVal & 1;
      accVal = accVal >> 1; // arithmetic right shift in JS preserves sign!
      mqVal = ((accLsb << (bits - 1)) | (mqVal >>> 1)) & singleMask;
      yExtra = newExtra;

      pushHistory(
        r,
        '整体算术右移 1 位',
        `第 ${r} 拍算术右移 1 位`,
        `[ACC, MQ, y_{n+1}] 整体算术右移（高位补符号位），右移后 ACC=${fmt(accVal, bits + 1)}, MQ=${fmt(mqVal, bits)}, y_{n+1}=${yExtra}。`,
        6
      );
    } else {
      // Final step in Booth: last step (sign bit) ONLY adds, NO shift!
      const finalBin = fmt(accVal, bits + 1).slice(1) + fmt(mqVal, bits); // drop duplicate sign bit -> 2*bits? Wait: product has 2*bits-1 or 2*bits!
      // Wait: in n-bit (1 sign + n-1 mag) Booth: n iterations? Let's verify:
      // Example: 5 bits (1 sign + 4 mag). After 4 shifts, 4 bits shifted into MQ, 1 sign bit step adds without shift -> [ACC(drop 1 sign bit?)] + [MQ(4 mag bits?)]!
      // Let's verify exact math: (-3) * (-2) = +6 in 5 bits (max=15):
      // Let's trace 5-bit (-3 = 11101 -> double 111101, -X = 000011; -2 = 11110):
      // r=1: yn=0, yExtra=0 -> +0 -> shift -> ACC=000000, MQ=01111, e=0
      // r=2: yn=1, e=0 -> -X -> ACC=000011 -> shift -> ACC=000001, MQ=10111, e=1
      // r=3: yn=1, e=1 -> +0 -> shift -> ACC=000000, MQ=11011, e=1
      // r=4: yn=1, e=1 -> +0 -> shift -> ACC=000000, MQ=11101, e=1
      // r=5: yn=1, e=1 -> +0 (no shift!) -> ACC=000000, MQ=11101!
      // Wait! Look at ACC + MQ[4..1] (dropping MQ[0] which is sign bit of Y shifted 4 times? No! MQ has 5 bits, we shifted 4 times, so 4 bits of ACC entered MQ's upper 4 bits, and the 1 remaining bit in MQ[0] is the old sign bit of Y!).
      // Look! ACC = 000000 (6 bits), MQ upper 4 bits = 1110! Together [000000][1110] = 0000001110? Wait: 6 = 000000110 (9 bits)!
      // Why was MQ upper 4 bits 1110 = 14?! Oh!! Look at r=2: +3 -> ACC=000011, shift 3 times -> 3 shifts after r=2: r=2 shift puts 1 into MQ_top, r=3 puts 0, r=4 puts 0! So bits shifted out of ACC are: 1 (r=2), 1 (r=3), 0 (r=4)?
      // Let's trace carefully:
      // Initial: ACC=0, MQ=11110 (-2), e=0
      // r=1: yn=0, e=0 -> +0, ACC=0. Shift: ACC=0, MQ=01111, e=0.
      // r=2: yn=1, e=0 -> ACC += 3 -> ACC=3 (000011). Shift: accLsb=1 -> ACC=1 (000001), MQ=10111, e=1!
      // r=3: yn=1, e=1 -> +0 -> ACC=1. Shift: accLsb=1 -> ACC=0 (000000), MQ=11011, e=1!
      // r=4: yn=1, e=1 -> +0 -> ACC=0. Shift: accLsb=0 -> ACC=0 (000000), MQ=01101, e=1!
      // r=5: yn=1, e=1 -> +0 (no shift). Look at ACC=000000, MQ=01101 -> upper 4 bits of MQ = 0110 = 6!!
      // AHA!! 00000 + 0110 (9 bits, 1 sign + 8 mag) = 000000110 = +6!! EXACT!!
      const magBits = fmt(accVal, bits + 1).slice(1) + fmt(mqVal, bits).slice(0, bits - 1);
      const decRes = x * y;
      const lastStep = steps[steps.length - 1];
      steps.push({
        title: `第 ${r} 拍（符号位）只加不移，运算完成！`,
        description: `第 ${bits} 拍不移位！取 ACC 有效位与 MQ 前 ${bits - 1} 位拼接得 ${2 * bits - 1} 位补码乘积：${magBits}（真值 = ${decRes}）。`,
        codeLine: 8,
        state: {
          ...lastStep.state,
          round: r,
          action: '符号位只加不移 → 输出结果',
          history: [...history, { round: r, acc: fmt(accVal, bits + 1), mq: fmt(mqVal, bits), yExtra: String(yExtra), action: '最终不移位' }],
          finalBin: magBits,
          finalDec: decRes,
        },
      });
    }
  }

  return steps;
}
