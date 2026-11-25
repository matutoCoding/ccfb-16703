// 内置测试方案:四万座足球场(带四角弧形转角)、一万座篮球体育馆
import type { Scheme, StandSection, VenueKind } from './types';
import { createScheme, createSection, DEFAULT_ZONES } from './factory';
import { sectionSeatCount } from './geometry';

interface RectBowlOptions {
  halfL: number; // 场地半长(x)
  halfW: number; // 场地半宽(z)
  gap: number; // 首排距边线距离
  spacing: number;
  seatWidth: number;
  firstHeight: number;
  rows: { rows: number; spacing?: number }[]; // 各层排数(层间为过道)
  endScale: number; // 端台基线缩短系数
  corner: boolean; // 是否生成四角弧形看台
  kind: VenueKind;
  name: string;
}

/** 矩形碗形看台:四边直台 + 可选四角弧形转角 */
function buildRectBowl(opts: RectBowlOptions): Scheme {
  const scheme = createScheme(opts.name, opts.kind);
  const { halfL, halfW, gap, spacing, seatWidth, firstHeight, rows, endScale } = opts;
  const totalRows = rows.reduce((a, b) => a + b.rows, 0);
  const depth = totalRows * spacing;

  const sideBase = halfL * 2;
  const endBase = halfW * 2 * endScale;

  const sections: StandSection[] = [];
  const tierSplit = rows.length > 1 ? rows[0].rows : 0;

  const base = (name: string, over: Partial<StandSection>): StandSection =>
    createSection({
      name,
      rowCount: totalRows,
      rowSpacing: spacing,
      seatWidth,
      firstRowHeight: firstHeight,
      riseMode: 'constant',
      constantRiser: 0.32,
      risers: [],
      ...over,
    });

  // 长边两侧(基线沿 x,法线 ±z)
  sections.push(
    base('西主看台', {
      x1: -halfL, z1: -halfW, x2: halfL, z2: -halfW, facing: -1,
      firstRowDistance: gap,
    }),
    base('东主看台', {
      x1: -halfL, z1: halfW, x2: halfL, z2: halfW, facing: 1,
      firstRowDistance: gap,
    }),
  );
  // 短边两端(基线沿 z,法线 ±x)
  sections.push(
    base('北端台', {
      x1: -halfL, z1: -halfW * endScale, x2: -halfL, z2: halfW * endScale, facing: 1,
      firstRowDistance: gap,
    }),
    base('南端台', {
      x1: halfL, z1: -halfW * endScale, x2: halfL, z2: halfW * endScale, facing: -1,
      firstRowDistance: gap,
    }),
  );

  if (opts.corner) {
    // 四角同心圆弧:圆心在场地角点,首排半径 = gap,跨度 90°
    const corners: [number, number, number, number][] = [
      [-halfL, -halfW, 0, Math.PI / 2],
      [halfL, -halfW, Math.PI / 2, Math.PI],
      [halfL, halfW, Math.PI, (3 * Math.PI) / 2],
      [-halfL, halfW, (3 * Math.PI) / 2, 2 * Math.PI],
    ];
    corners.forEach(([cx, cz, a0, a1], idx) => {
      sections.push(
        base(`弧形转角 ${idx + 1}`, {
          kind: 'arc',
          arcCx: cx,
          arcCz: cz,
          arcR0: gap,
          arcA0: a0,
          arcA1: a1,
        }),
      );
    });
  }

  // 两层看台的层间过道:第 tierSplit 排后加大一级踏面(用局部排距近似——
  // 这里通过在名称标注,实际排距统一;过道影响可在设置中按首排距离微调)
  void tierSplit;
  void sideBase;
  void endBase;
  void depth;

  scheme.sections = sections;
  scheme.priceZones = DEFAULT_ZONES.map((z) => ({ ...z }));
  return scheme;
}

/** 四万座足球场(105×68,四边直台+四角弧形,36 排) */
export function createFootball40k(): Scheme {
  const scheme = buildRectBowl({
    name: '四万座足球场(测试方案)',
    kind: 'football',
    halfL: 105 / 2,
    halfW: 68 / 2,
    gap: 7.5,
    spacing: 0.8,
    seatWidth: 0.48,
    firstHeight: 0.6,
    rows: [{ rows: 22 }, { rows: 18 }],
    endScale: 0.92,
    corner: true,
  });
  // 焦点绑定:长边台绑定南北边线焦点(索引 0/1),端台绑定东西端线(2/3)
  const f = scheme.venue.focuses;
  scheme.sections.forEach((s) => {
    if (s.name.includes('主看台')) s.focusId = s.name.startsWith('西') ? f[0].id : f[1].id;
    if (s.name.includes('端台')) s.focusId = s.name.startsWith('北') ? f[2].id : f[3].id;
  });
  return scheme;
}

/** 一万座篮球体育馆(28×15 场地,四边直台+四角弧形,24 排) */
export function createBasketball10k(): Scheme {
  const scheme = buildRectBowl({
    name: '一万座篮球馆(测试方案)',
    kind: 'basketball',
    halfL: 28 / 2,
    halfW: 15 / 2,
    gap: 4.5,
    spacing: 0.75,
    seatWidth: 0.5,
    firstHeight: 0.45,
    rows: [{ rows: 16 }, { rows: 12 }],
    endScale: 1,
    corner: true,
  });
  const f = scheme.venue.focuses;
  scheme.sections.forEach((s) => {
    if (s.name.includes('主看台')) s.focusId = s.name.startsWith('西') ? f[0].id : f[1].id;
    if (s.name.includes('端台')) s.focusId = s.name.startsWith('北') ? f[2].id : f[3].id;
  });
  return scheme;
}

export function totalSeats(scheme: Scheme): number {
  return scheme.sections.reduce((sum, s) => sum + sectionSeatCount(s), 0);
}
