// 视线核心算法(纯函数,不依赖 three.js,可在 Node 下直接测试)
//
// 规范公式(看台剖面视线升高值 C):
//   视点 F,前一排眼 E1(水平距离 d1,标高 Y1),本排眼 E2(距离 d2,标高 Y2)
//   视线 E2-F 在 d1 处的设计标高 = F + (Y2 - F) * d1 / d2
//   C = 该设计标高 - Y1
//   C >= 规范最小值即合格。
//
// 反推(变升起):给定 Cmin,由近及远逐排求本排眼高下限,再换算踏步升高。
import type { FocusPoint, RowAnalysis, Settings, StandSection } from './types';
import { sectionGeometry } from './geometry';

export interface EyePoint {
  x: number;
  z: number;
  y: number;
}

/** 两视点间水平距离 */
export function horizontalDistance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * 单行 C 值(手算公式的直译)。
 * @param prev 前排眼点  @param eye 本排眼点  @param focus 视点
 */
export function computeC(prev: EyePoint, eye: EyePoint, focus: FocusPoint): number {
  const d1 = horizontalDistance(prev, focus);
  const d2 = horizontalDistance(eye, focus);
  const f = focus.y;
  return (eye.y - f) * (d1 / d2) - (prev.y - f);
}

/** 由分区参数求每排踏步面标高 */
export function floorHeights(s: StandSection): number[] {
  const floors = new Array<number>(s.rowCount);
  floors[0] = s.firstRowHeight;
  if (s.riseMode === 'constant') {
    for (let i = 1; i < s.rowCount; i++) floors[i] = floors[i - 1] + s.constantRiser;
  } else {
    for (let i = 1; i < s.rowCount; i++) {
      const riser = s.risers[i - 1] ?? 0;
      floors[i] = floors[i - 1] + riser;
    }
  }
  return floors;
}

/** 按毫米步长向上取整(带浮点容差) */
export function ceilToStep(v: number, step: number): number {
  if (step <= 0) return v;
  const n = Math.ceil(v / step - 1e-9);
  return Math.round(n * step * 1e6) / 1e6; // 消除 0.1+0.2 类尾数
}

function resolveFocus(s: StandSection, focuses: FocusPoint[]): FocusPoint {
  const bound = focuses.find((f) => f.id === s.focusId);
  if (bound) return bound;
  // 自动取距首排中点最近的焦点
  const { rows } = sectionGeometry(s);
  const p = rows[0];
  let best = focuses[0];
  let bestD = Infinity;
  for (const f of focuses) {
    const d = Math.hypot(p.x - f.x, p.z - f.z);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

/**
 * 逐排视线分析(正向):给定点位与参数,算每排眼高、C 值、边线遮挡深度。
 */
export function analyzeRows(
  s: StandSection,
  focuses: FocusPoint[],
  settings: Settings,
): RowAnalysis[] {
  const { rows } = sectionGeometry(s);
  const focus = resolveFocus(s, focuses);
  const floors = floorHeights(s);
  const result: RowAnalysis[] = [];

  for (let i = 0; i < s.rowCount; i++) {
    const eye: EyePoint = { x: rows[i].x, z: rows[i].z, y: floors[i] + settings.eyeHeight };
    const distance = horizontalDistance(eye, focus);
    let cValue: number | null = null;
    let pass = true;
    let visibleGroundDistance: number | null = null;
    let edgeBlockedDepth: number | null = null;

    if (i >= 1) {
      const prev: EyePoint = {
        x: rows[i - 1].x,
        z: rows[i - 1].z,
        y: floors[i - 1] + settings.eyeHeight,
      };
      cValue = computeC(prev, eye, focus);
      pass = cValue + 1e-9 >= settings.minC;

      // 视线经前排眼睛延长至地面,求地面交点距视点的水平距离(带符号:
      // d>0 交点在看台侧(只遮挡边线与首排间地面);d<0 交点伸入场地,
      // 其绝对值即球场边线被前排遮挡的深度)。
      const dPrev = horizontalDistance(prev, focus);
      let dGround: number;
      const denom = eye.y - prev.y;
      if (Math.abs(denom) < 1e-12) {
        dGround = -999; // 视线水平、永不落地,视为全场遮挡
      } else {
        const t = (eye.y - focus.y) / denom; // 沿 eye->prev 的参数
        dGround = distance + t * (dPrev - distance);
      }
      visibleGroundDistance = dGround;
      edgeBlockedDepth = Math.max(0, -dGround);
    }

    result.push({
      row: i + 1,
      floorY: floors[i],
      riser: i === 0 ? 0 : floors[i] - floors[i - 1],
      eyeY: eye.y,
      distance,
      cValue,
      pass,
      visibleGroundDistance,
      edgeBlockedDepth,
    });
  }
  return result;
}

export interface ReverseResult {
  /** 反推得到的逐排升高(长度 rowCount-1),已是施工步长的整数倍 */
  risers: number[];
  /** 取整后的施工踏步标高 */
  floors: number[];
  analysis: RowAnalysis[];
  /**
   * 手算公式的未取整逐排升高(递推时同样代入前一排"实际采用"标高),
   * 施工值相对它的差即为取整误差,严格落在 [0, 一个施工步长) 内。
   */
  exactRisers: number[];
  /** 纯连续理论剖面(全程不取整的递推标高),供剖面图对照 */
  continuousFloors: number[];
}

/**
 * 变升起反推(规范手册逐排递推法):
 *   由 C = (Y_n-F) d_{n-1}/d_n - (Y_{n-1}-F) >= Cmin 解出
 *   Y_n >= F + (d_n/d_{n-1})(Cmin + Y_{n-1} - F)
 * 每一排都代入前一排的【实际采用(已取整)眼高】求本排眼高下限,
 * 踏步面标高按施工步长向上取整,并保证不小于前排标高加一个步长。
 * 因此:① 代回正向计算时每排 C 结构性满足 >= Cmin;
 *      ② 每级升高与手算未取整公式之差严格小于一个步长(1mm)。
 */
export function reverseDesign(
  s: StandSection,
  focuses: FocusPoint[],
  settings: Settings,
): ReverseResult {
  const { rows } = sectionGeometry(s);
  const focus = resolveFocus(s, focuses);
  const step = settings.constructionStep;
  const n = s.rowCount;
  const eyeH = settings.eyeHeight;
  const cMin = settings.minC;

  const floors = new Array<number>(n); // 采用(取整后)踏步标高
  const continuousFloors = new Array<number>(n); // 纯连续理论标高
  const rawRisers: number[] = []; // 手算公式未取整升高
  floors[0] = s.firstRowHeight;
  continuousFloors[0] = s.firstRowHeight;

  for (let i = 1; i < n; i++) {
    const dPrev = Math.hypot(rows[i - 1].x - focus.x, rows[i - 1].z - focus.z);
    const dI = Math.hypot(rows[i].x - focus.x, rows[i].z - focus.z);
    const q = dI / dPrev;

    // 纯连续理论剖面(前驱也用理论值)
    const contEye =
      focus.y + q * (cMin + (continuousFloors[i - 1] + eyeH) - focus.y);
    continuousFloors[i] = contEye - eyeH;

    // 手算递推:前驱采用实际取整标高
    const prevAdoptedEye = floors[i - 1] + eyeH;
    const minEyeY = focus.y + q * (cMin + prevAdoptedEye - focus.y);
    const rawFloor = minEyeY - eyeH;
    rawRisers.push(rawFloor - floors[i - 1]);

    const rounded = step > 0 ? ceilToStep(rawFloor, step) : rawFloor;
    floors[i] = Math.max(rounded, floors[i - 1] + (step > 0 ? step : rawFloor - floors[i - 1]));
  }

  const risers: number[] = [];
  for (let i = 1; i < n; i++) {
    risers.push(Math.round((floors[i] - floors[i - 1]) * 1e6) / 1e6);
  }

  // 用反推结果构造临时分区做正向复核(即"代回去")
  const trial: StandSection = { ...s, riseMode: 'variable', risers };
  const analysis = analyzeRows(trial, focuses, settings);

  return { risers, floors, analysis, exactRisers: rawRisers, continuousFloors };
}

/** 全方案合格率统计 */
export function summarize(analysis: RowAnalysis[], minC: number) {
  const checked = analysis.filter((r) => r.cValue !== null);
  const pass = checked.filter((r) => (r.cValue as number) + 1e-9 >= minC);
  const blocked = checked.filter((r) => (r.edgeBlockedDepth as number) > 1e-6);
  return {
    total: analysis.length,
    checked: checked.length,
    passed: pass.length,
    minCValue: checked.length ? Math.min(...checked.map((r) => r.cValue as number)) : null,
    maxBlockedDepth: checked.length ? Math.max(...checked.map((r) => r.edgeBlockedDepth as number)) : null,
    blockedRows: blocked.length,
  };
}
