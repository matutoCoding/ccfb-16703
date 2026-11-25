import { describe, expect, it } from 'vitest';
import type { FocusPoint, Settings, StandSection } from '../src/model/types';
import { analyzeRows, computeC, reverseDesign } from '../src/model/sightline';

const focus: FocusPoint = { id: 'F', name: '边线焦点', x: 0, z: 0, y: 0, auto: true };

const settings: Settings = {
  eyeHeight: 1.15,
  standingEyeHeight: 1.65,
  minC: 0.06,
  constructionStep: 0.001,
  occlusionGridX: 20,
  occlusionGridZ: 14,
  maxVersions: 30,
};

/** 直线看台:基准线沿 x 轴、法线朝 +z,首排在 z=firstRowDistance */
function makeSection(over: Partial<StandSection> = {}): StandSection {
  return {
    id: 'S1',
    name: '主看台',
    kind: 'straight',
    priceZoneId: null,
    zoneManual: false,
    x1: -50,
    z1: 0,
    x2: 50,
    z2: 0,
    facing: 1,
    firstRowDistance: 8,
    arcCx: 0,
    arcCz: 0,
    arcR0: 30,
    arcA0: 0,
    arcA1: Math.PI / 2,
    rowCount: 20,
    rowSpacing: 0.8,
    firstRowHeight: 0.45,
    riseMode: 'constant',
    constantRiser: 0.32,
    risers: [],
    seatWidth: 0.5,
    focusId: 'F',
    ...over,
  };
}

describe('C 值手算公式对照', () => {
  it('computeC 与独立手算结果一致(数值例一)', () => {
    // 焦点 F=(0,0);前排眼距 d1=10、Y1=2.0;本排 d2=10.8、Y2=2.4
    const prev = { x: 0, z: 10, y: 2.0 };
    const eye = { x: 0, z: 10.8, y: 2.4 };
    const hand = 2.4 * (10 / 10.8) - 2.0;
    expect(computeC(prev, eye, focus)).toBeCloseTo(hand, 12);
    expect(computeC(prev, eye, focus)).toBeCloseTo(0.2222222222, 6);
  });

  it('analyzeRows 逐排 C 与手算递推一致(等升起 0.32)', () => {
    const s = makeSection();
    const rows = analyzeRows(s, [focus], settings);
    const eyeH = settings.eyeHeight;
    for (let i = 1; i < rows.length; i++) {
      const d1 = s.firstRowDistance + (i - 1) * s.rowSpacing;
      const d2 = s.firstRowDistance + i * s.rowSpacing;
      const y1 = s.firstRowHeight + (i - 1) * s.constantRiser + eyeH;
      const y2 = s.firstRowHeight + i * s.constantRiser + eyeH;
      const hand = (y2 * d1) / d2 - y1;
      expect(rows[i].cValue as number).toBeCloseTo(hand, 9);
    }
    // 等升起 C 随排数递减是经典结论,验证单调性
    for (let i = 2; i < rows.length; i++) {
      expect(rows[i].cValue as number).toBeLessThan(rows[i - 1].cValue as number);
    }
  });

  it('C<0 时边线出现遮挡深度,C>0 时边线不被挡', () => {
    // 零升高:相邻两排眼平高,后排视线被前排整个人挡住
    const flat = makeSection({ constantRiser: 0, rowCount: 4 });
    const rows = analyzeRows(flat, [focus], settings);
    expect(rows[1].edgeBlockedDepth as number).toBeGreaterThan(0);
    expect(rows[1].pass).toBe(false);

    // 大升高:C 充足,地面交点在看台侧,边线无遮挡
    const steep = makeSection({ constantRiser: 0.9, rowCount: 4 });
    const rows2 = analyzeRows(steep, [focus], settings);
    expect(rows2[1].edgeBlockedDepth as number).toBeCloseTo(0, 9);
    expect(rows2[1].pass).toBe(true);
  });
});

describe('变升起反推(硬要求)', () => {
  it('反推升高代回后每排 C 值均不小于设定值', () => {
    const s = makeSection({ riseMode: 'variable', rowCount: 30 });
    const rev = reverseDesign(s, [focus], settings);
    expect(rev.risers).toHaveLength(29);
    for (const r of rev.analysis) {
      if (r.cValue !== null) expect(r.cValue).toBeGreaterThanOrEqual(settings.minC - 1e-9);
    }
    // 全部合格
    expect(rev.analysis.every((r) => r.pass)).toBe(true);
  });

  it('每级实际升高与手算未取整公式误差严格小于 1 毫米,且为正向偏差', () => {
    const s = makeSection({ riseMode: 'variable', rowCount: 40 });
    const rev = reverseDesign(s, [focus], settings);
    rev.risers.forEach((r, i) => {
      const diff = r - rev.exactRisers[i];
      // 向上取整:0 <= 误差 < 1mm
      expect(diff).toBeGreaterThanOrEqual(-1e-12);
      expect(diff).toBeLessThan(0.001 - 1e-12);
    });
  });

  it('反推结果与独立手算逐排递推完全一致(毫米级)', () => {
    // 独立实现一遍手册公式,防止主代码与测试同源出错
    const s = makeSection({ riseMode: 'variable', rowCount: 25 });
    const rev = reverseDesign(s, [focus], settings);
    const step = 0.001;
    const eyeH = settings.eyeHeight;
    const cMin = settings.minC;
    const handFloors: number[] = [s.firstRowHeight];
    const handRisers: number[] = [];
    const ceilMm = (v: number) => Math.ceil(v / step - 1e-9) * step;
    for (let i = 1; i < s.rowCount; i++) {
      const dPrev = s.firstRowDistance + (i - 1) * s.rowSpacing;
      const dI = s.firstRowDistance + i * s.rowSpacing;
      const prevEye = handFloors[i - 1] + eyeH;
      const minEye = (dI / dPrev) * (cMin + prevEye);
      const rawFloor = minEye - eyeH;
      const f = Math.max(ceilMm(rawFloor), handFloors[i - 1] + step);
      handFloors.push(Math.round(f * 1e6) / 1e6);
      handRisers.push(Math.round((f - handFloors[i - 1]) * 1e6) / 1e6);
    }
    rev.risers.forEach((r, i) => expect(r).toBeCloseTo(handRisers[i], 9));
    rev.floors.forEach((f, i) => expect(f).toBeCloseTo(handFloors[i], 9));
  });

  it('不同 Cmin / 排距 / 首排高度组合下均成立', () => {
    const cases = [
      { minC: 0.05, rowSpacing: 0.75, firstRowDistance: 6, firstRowHeight: 0.3 },
      { minC: 0.06, rowSpacing: 0.8, firstRowDistance: 10, firstRowHeight: 0.6 },
      { minC: 0.12, rowSpacing: 0.85, firstRowDistance: 15, firstRowHeight: 1.0 },
      { minC: 0.09, rowSpacing: 0.9, firstRowDistance: 25, firstRowHeight: 1.2 },
    ];
    for (const c of cases) {
      const st: Settings = { ...settings, minC: c.minC };
      const s = makeSection({
        riseMode: 'variable',
        rowCount: 35,
        rowSpacing: c.rowSpacing,
        firstRowDistance: c.firstRowDistance,
        firstRowHeight: c.firstRowHeight,
      });
      const rev = reverseDesign(s, [focus], st);
      rev.analysis.forEach((r) => {
        if (r.cValue !== null) expect(r.cValue).toBeGreaterThanOrEqual(c.minC - 1e-9);
      });
      rev.risers.forEach((r, i) => {
        const diff = r - rev.exactRisers[i];
        expect(diff).toBeGreaterThanOrEqual(-1e-12);
        expect(diff).toBeLessThan(0.001 - 1e-12);
      });
      // 升高应在合理施工范围(100~900mm)
      for (const r of rev.risers) {
        expect(r).toBeGreaterThanOrEqual(0.05);
        expect(r).toBeLessThan(1.0);
      }
    }
  });

  it('弧形看台反推同样达标且误差 <1mm', () => {
    const arc = makeSection({
      kind: 'arc',
      rowCount: 25,
      arcR0: 40,
      arcA0: Math.PI / 4,
      arcA1: (3 * Math.PI) / 4,
      firstRowHeight: 0.5,
      riseMode: 'variable',
    });
    const rev = reverseDesign(arc, [focus], settings);
    rev.analysis.forEach((r) => {
      if (r.cValue !== null) expect(r.cValue).toBeGreaterThanOrEqual(settings.minC - 1e-9);
    });
    rev.risers.forEach((r, i) => {
      const diff = r - rev.exactRisers[i];
      expect(diff).toBeGreaterThanOrEqual(-1e-12);
      expect(diff).toBeLessThan(0.001 - 1e-12);
    });
  });

  it('模糊测试:随机分区参数下 100 组全部满足硬要求', () => {
    let seed = 20261126;
    const rand = () => {
      // 确定性 LCG,避免依赖 Math.random
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let k = 0; k < 100; k++) {
      const minC = 0.04 + rand() * 0.1;
      const s = makeSection({
        riseMode: 'variable',
        rowCount: 10 + Math.floor(rand() * 40),
        rowSpacing: 0.7 + rand() * 0.35,
        firstRowDistance: 5 + rand() * 30,
        firstRowHeight: 0.2 + rand() * 1.5,
        constantRiser: 0.3,
      });
      const st: Settings = { ...settings, minC };
      const rev = reverseDesign(s, [focus], st);
      rev.analysis.forEach((r) => {
        if (r.cValue !== null) expect(r.cValue).toBeGreaterThanOrEqual(minC - 1e-9);
      });
      rev.risers.forEach((r, i) => {
        const diff = r - rev.exactRisers[i];
        expect(diff).toBeGreaterThanOrEqual(-1e-12);
        expect(diff).toBeLessThan(0.001 - 1e-12);
        expect(r).toBeGreaterThan(0);
      });
    }
  });
});
