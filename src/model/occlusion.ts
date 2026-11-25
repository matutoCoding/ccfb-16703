// 障碍物视线遮挡:挑檐(盒体)、立柱(圆柱)、栏杆(薄盒)与场地可视比例热力
import type { Obstruction, VenueState } from './types';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** 线段 a->b 与轴对齐盒体是否相交( slab 法,含边界) */
export function segmentBoxOccluded(a: V3, b: V3, min: V3, max: V3): boolean {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  let tmin = 0;
  let tmax = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    if (Math.abs(d[axis]) < 1e-12) {
      if (a[axis] < min[axis] - 1e-9 || a[axis] > max[axis] + 1e-9) return false;
    } else {
      let t1 = (min[axis] - a[axis]) / d[axis];
      let t2 = (max[axis] - a[axis]) / d[axis];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax + 1e-9) return false;
    }
  }
  return tmax >= 0 && tmin <= 1;
}

/** 线段与竖直圆柱(轴沿 y,半径 r,y∈[y0,y1])是否相交 */
export function segmentCylinderOccluded(a: V3, b: V3, cx: number, cz: number, r: number, y0: number, y1: number): boolean {
  const px = a.x - cx;
  const pz = a.z - cz;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const A = dx * dx + dz * dz;
  if (A < 1e-14) {
    if (px * px + pz * pz > r * r) return false;
  } else {
    const B = 2 * (px * dx + pz * dz);
    const C = px * px + pz * pz - r * r;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return false;
    const s = Math.sqrt(disc);
    const t1 = (-B - s) / (2 * A);
    const t2 = (-B + s) / (2 * A);
    // 在 t∈[0,1] 且交点高度落在柱段内
    const lo = Math.max(0, t1);
    const hi = Math.min(1, t2);
    if (hi < lo - 1e-9) return false;
    const yAtLo = a.y + (b.y - a.y) * lo;
    const yAtHi = a.y + (b.y - a.y) * hi;
    const yMin = Math.min(yAtLo, yAtHi);
    const yMax = Math.max(yAtLo, yAtHi);
    return yMax >= y0 - 1e-9 && yMin <= y1 + 1e-9;
  }
  // 视线在水平面上落在柱内(垂直投影退化):高度区间相交即遮挡
  return Math.max(a.y, b.y) >= y0 - 1e-9 && Math.min(a.y, b.y) <= y1 + 1e-9;
}

export function obstructionBlocks(o: Obstruction, eye: V3, target: V3): boolean {
  if (!o.enabled) return false;
  if (o.type === 'column' && o.radius > 0) {
    return segmentCylinderOccluded(eye, target, o.x, o.z, o.radius, o.y0, o.y1);
  }
  const min = { x: o.x - o.width / 2, y: o.y - o.height / 2, z: o.z - o.depth / 2 };
  const max = { x: o.x + o.width / 2, y: o.y + o.height / 2, z: o.z + o.depth / 2 };
  return segmentBoxOccluded(eye, target, min, max);
}

/** 任一生效障碍物挡住该视线 */
export function lineBlocked(obstructions: Obstruction[], eye: V3, target: V3): boolean {
  return obstructions.some((o) => obstructionBlocks(o, eye, target));
}

export interface OcclusionCell {
  x: number;
  z: number;
  /** 0~1,被遮挡比例(网格点视角下对该场地格的判定) */
  blocked: number;
}

/**
 * 场地遮挡比例网格:对场地矩形均匀采样,每点判定是否被障碍物遮挡。
 * 返回网格(行优先,z 从 -w/2 到 +w/2),cell.blocked 为 0/1,
 * 调用方可按座位视角生成"每座位被挡场地比例"。
 */
export function fieldOcclusionGrid(
  eye: V3,
  obstructions: Obstruction[],
  venue: VenueState,
  nx: number,
  nz: number,
): { cells: OcclusionCell[]; nx: number; nz: number; blockedRatio: number } {
  const L = venue.fieldLength;
  const W = venue.fieldWidth;
  const cells: OcclusionCell[] = [];
  let blockedCount = 0;
  for (let iz = 0; iz < nz; iz++) {
    const z = -W / 2 + (W * (iz + 0.5)) / nz;
    for (let ix = 0; ix < nx; ix++) {
      const x = -L / 2 + (L * (ix + 0.5)) / nx;
      const target: V3 = { x, y: venue.floorY + venue.focusHeight, z };
      const blocked = lineBlocked(obstructions, eye, target) ? 1 : 0;
      blockedCount += blocked;
      cells.push({ x, z, blocked });
    }
  }
  return { cells, nx, nz, blockedRatio: blockedCount / cells.length };
}

/**
 * 单个座位被挡场地比例(0~1):在场地上采样网格统计。
 */
export function seatBlockedRatio(
  eye: V3,
  obstructions: Obstruction[],
  venue: VenueState,
  gx: number,
  gz: number,
): number {
  return fieldOcclusionGrid(eye, obstructions, venue, gx, gz).blockedRatio;
}
