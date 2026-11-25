// 看台平面几何:直线段与圆弧段统一为"每排中心线"模型
import type { StandSection } from './types';

export interface RowPoint {
  /** 排中心线中点(平面) */
  x: number;
  z: number;
  /** 排法线方向(朝场地单位向量) */
  nx: number;
  nz: number;
  /** 该排距基准线/圆心的水平距离参数 */
  r: number;
  /** 排中心线长度 */
  length: number;
}

export interface SectionGeometry {
  rows: RowPoint[];
}

/** 线段法线(facing 侧的单位法向量) */
function lineNormal(x1: number, z1: number, x2: number, z2: number, facing: 1 | -1) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz) || 1;
  // 左侧法线 (-dz, dx)/len;facing=-1 取反
  return { nx: (-dz / len) * facing, nz: (dx / len) * facing, len };
}

export function sectionGeometry(s: StandSection): SectionGeometry {
  const rows: RowPoint[] = [];
  if (s.kind === 'straight') {
    const { nx, nz, len } = lineNormal(s.x1, s.z1, s.x2, s.z2, s.facing);
    const mx = (s.x1 + s.x2) / 2;
    const mz = (s.z1 + s.z2) / 2;
    for (let i = 0; i < s.rowCount; i++) {
      const r = s.firstRowDistance + i * s.rowSpacing;
      rows.push({
        x: mx + nx * r,
        z: mz + nz * r,
        nx,
        nz,
        r,
        length: len,
      });
    }
  } else {
    // 弧形:每排是同心圆弧,法线沿径向朝圆心
    const span = s.arcA1 - s.arcA0;
    const rMidAngle = (s.arcA0 + s.arcA1) / 2;
    for (let i = 0; i < s.rowCount; i++) {
      const r = s.arcR0 + i * s.rowSpacing;
      const x = s.arcCx + Math.cos(rMidAngle) * r;
      const z = s.arcCz + Math.sin(rMidAngle) * r;
      // 朝圆心方向
      const nx = -Math.cos(rMidAngle);
      const nz = -Math.sin(rMidAngle);
      rows.push({ x, z, nx, nz, r, length: Math.abs(span) * r });
    }
  }
  return { rows };
}

/**
 * 弧形看台第 i 排、参数 t∈[0,1] 处的座位平面位置(用于转角处逐座位建模)。
 * 直线段同样支持,t 为沿线比例。
 */
export function seatPosition(s: StandSection, rowIndex: number, t: number) {
  if (s.kind === 'straight') {
    const { nx, nz } = lineNormal(s.x1, s.z1, s.x2, s.z2, s.facing);
    const r = s.firstRowDistance + rowIndex * s.rowSpacing;
    const bx = s.x1 + (s.x2 - s.x1) * t;
    const bz = s.z1 + (s.z2 - s.z1) * t;
    return { x: bx + nx * r, z: bz + nz * r, nx, nz };
  }
  const r = s.arcR0 + rowIndex * s.rowSpacing;
  const a = s.arcA0 + (s.arcA1 - s.arcA0) * t;
  return {
    x: s.arcCx + Math.cos(a) * r,
    z: s.arcCz + Math.sin(a) * r,
    nx: -Math.cos(a),
    nz: -Math.sin(a),
  };
}

/** 分区座位数(按排中心线长度/座椅宽度 × 排数) */
export function sectionSeatCount(s: StandSection): number {
  const { rows } = sectionGeometry(s);
  let total = 0;
  for (const row of rows) total += Math.max(1, Math.floor(row.length / s.seatWidth));
  return total;
}
