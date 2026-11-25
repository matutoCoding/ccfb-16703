import { describe, expect, it } from 'vitest';
import type { Obstruction, VenueState } from '../src/model/types';
import {
  fieldOcclusionGrid,
  segmentBoxOccluded,
  segmentCylinderOccluded,
} from '../src/model/occlusion';

const venue: VenueState = {
  kind: 'football',
  name: '测试场地',
  fieldLength: 105,
  fieldWidth: 68,
  trackWidth: 0,
  floorY: 0,
  focusHeight: 0,
  focuses: [],
};

describe('盒体与圆柱视线遮挡', () => {
  it('视线穿过挑檐盒体时判遮挡,绕过则不遮挡', () => {
    const eye = { x: 0, y: 8, z: 30 };
    const target = { x: 0, y: 0, z: 0 };
    // 盒体横在视线中间
    const box = { x: 0, y: 4, z: 15, width: 40, depth: 2, height: 1 };
    const min = { x: box.x - box.width / 2, y: box.y - box.height / 2, z: box.z - box.depth / 2 };
    const max = { x: box.x + box.width / 2, y: box.y + box.height / 2, z: box.z + box.depth / 2 };
    expect(segmentBoxOccluded(eye, target, min, max)).toBe(true);
    // 盒体抬高到视线之上
    const high = { ...box, y: 7.9 };
    expect(
      segmentBoxOccluded(eye, target, { ...min, y: high.y - 0.5 }, { ...max, y: high.y + 0.5 }),
    ).toBe(false);
  });

  it('圆柱只挡住穿过其投影的视线', () => {
    const eye = { x: 0, y: 6, z: 20 };
    const hit = { x: 0, y: 0, z: 0 };
    const miss = { x: 10, y: 0, z: 0 };
    expect(segmentCylinderOccluded(eye, hit, 0, 10, 0.5, 0, 12)).toBe(true);
    expect(segmentCylinderOccluded(eye, miss, 0, 10, 0.5, 0, 12)).toBe(false);
    // 柱段高度不覆盖视线高度时不遮挡
    expect(segmentCylinderOccluded(eye, hit, 0, 10, 0.5, 0, 1)).toBe(false);
  });

  it('场地遮挡比例网格给出 0~1 比例且可复现', () => {
    const eye = { x: 0, y: 10, z: 35 };
    const canopy: Obstruction = {
      id: 'c1',
      name: '挑檐',
      type: 'canopy',
      x: 0,
      z: 28,
      y: 6,
      width: 120,
      depth: 8,
      height: 2,
      radius: 0,
      y0: 0,
      y1: 0,
      sectionId: null,
      enabled: true,
    };
    const g1 = fieldOcclusionGrid(eye, [canopy], venue, 24, 16);
    expect(g1.cells).toHaveLength(24 * 16);
    expect(g1.blockedRatio).toBeGreaterThan(0);
    expect(g1.blockedRatio).toBeLessThanOrEqual(1);
    const g2 = fieldOcclusionGrid(eye, [{ ...canopy, enabled: false }], venue, 24, 16);
    expect(g2.blockedRatio).toBe(0);
  });
});
