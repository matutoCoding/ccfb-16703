// 票价分区:按逐排视线质量自动建议 + 分区座位统计
import type { PriceZone, Scheme, StandSection } from './types';
import { analyzeRows } from './sightline';
import { sectionSeatCount } from './geometry';

export interface SectionScore {
  sectionId: string;
  avgC: number;
  minC: number;
  passRate: number;
  /** 0~100 综合视线质量分 */
  score: number;
  suggestedZoneId: string;
}

/**
 * 综合评分:C 值水平(40%)、合格率(40%)、观赛距离(20%)。
 * 距离按首排到焦点距离归一,越近分越高。
 */
export function scoreSections(scheme: Scheme): SectionScore[] {
  const zones = scheme.priceZones;
  const distances = scheme.sections.map((s) => {
    const rows = analyzeRows(s, scheme.venue.focuses, scheme.settings);
    return rows[0]?.distance ?? 30;
  });
  const dMax = Math.max(...distances, 1);
  const dMin = Math.min(...distances);

  return scheme.sections.map((s, idx) => {
    const rows = analyzeRows(s, scheme.venue.focuses, scheme.settings);
    const checked = rows.filter((r) => r.cValue !== null);
    const avgC = checked.reduce((a, r) => a + (r.cValue as number), 0) / Math.max(1, checked.length);
    const minC = checked.length ? Math.min(...checked.map((r) => r.cValue as number)) : 0;
    const passRate = checked.filter((r) => r.pass).length / Math.max(1, checked.length);
    const cScore = Math.min(1, avgC / (scheme.settings.minC * 3));
    const dScore = dMax === dMin ? 0.8 : 1 - (distances[idx] - dMin) / (dMax - dMin);
    const score = Math.round((cScore * 0.4 + passRate * 0.4 + dScore * 0.2) * 100);

    // 按分数分档映射到票价区(由高到低)
    let band: number;
    if (score >= 80) band = 0;
    else if (score >= 65) band = 1;
    else if (score >= 50) band = 2;
    else band = 3;
    return {
      sectionId: s.id,
      avgC,
      minC,
      passRate,
      score,
      suggestedZoneId: zones[Math.min(band, zones.length - 1)]?.id ?? '',
    };
  });
}

/** 自动建议写入(不覆盖人工锁定的分区) */
export function applyZoneSuggestions(scheme: Scheme): Scheme {
  const scores = scoreSections(scheme);
  const map = new Map(scores.map((x) => [x.sectionId, x.suggestedZoneId]));
  scheme.sections.forEach((s) => {
    if (!s.zoneManual) s.priceZoneId = map.get(s.id) ?? null;
  });
  return scheme;
}

export interface ZoneStat {
  zone: PriceZone;
  sections: number;
  seats: number;
  ratio: number;
}

export function zoneStatistics(scheme: Scheme): ZoneStat[] {
  const total = scheme.sections.reduce((a, s) => a + sectionSeatCount(s), 0) || 1;
  return scheme.priceZones.map((zone) => {
    const members = scheme.sections.filter((s) => s.priceZoneId === zone.id);
    const seats = members.reduce((a, s) => a + sectionSeatCount(s), 0);
    return { zone, sections: members.length, seats, ratio: seats / total };
  });
}

export function unassignedSeats(scheme: Scheme): number {
  return scheme.sections
    .filter((s: StandSection) => !s.priceZoneId)
    .reduce((a, s) => a + sectionSeatCount(s), 0);
}
