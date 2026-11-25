import { describe, expect, it } from 'vitest';
import { createBasketball10k, createFootball40k, totalSeats } from '../src/model/presets';
import { reverseDesign } from '../src/model/sightline';

describe('内置测试方案', () => {
  it('足球场约四万座、篮球馆约一万座,均含弧形转角', () => {
    const fb = createFootball40k();
    const bb = createBasketball10k();
    expect(totalSeats(fb)).toBeGreaterThan(38000);
    expect(totalSeats(fb)).toBeLessThan(42000);
    expect(totalSeats(bb)).toBeGreaterThan(9000);
    expect(totalSeats(bb)).toBeLessThan(11000);
    expect(fb.sections.filter((s) => s.kind === 'arc')).toHaveLength(4);
    expect(bb.sections.filter((s) => s.kind === 'arc')).toHaveLength(4);
  });

  it('两方案全部 8 个分区反推后均满足 Cmin 且升高误差 <1mm', () => {
    for (const scheme of [createFootball40k(), createBasketball10k()]) {
      for (const s of scheme.sections) {
        const rev = reverseDesign(s, scheme.venue.focuses, scheme.settings);
        rev.analysis.forEach((r) => {
          if (r.cValue !== null) expect(r.cValue).toBeGreaterThanOrEqual(scheme.settings.minC - 1e-9);
        });
        rev.risers.forEach((r, i) => {
          const diff = r - rev.exactRisers[i];
          expect(diff).toBeGreaterThanOrEqual(-1e-12);
          expect(diff).toBeLessThan(scheme.settings.constructionStep - 1e-12);
        });
      }
    }
  });
});
