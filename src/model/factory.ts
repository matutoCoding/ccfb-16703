// 场地预设与方案/分区/障碍物工厂
import type {
  FocusPoint,
  Obstruction,
  PriceZone,
  Scheme,
  Settings,
  StandSection,
  VenueKind,
  VenueState,
} from './types';
import { uid } from '../lib/uid';

export const DEFAULT_SETTINGS: Settings = {
  eyeHeight: 1.15, // 成人坐姿眼高(座面到眼),座面高 0.45 时眼高约 1.6
  standingEyeHeight: 1.65,
  minC: 0.06, // 规范常用 Cmin=60mm
  constructionStep: 0.001,
  occlusionGridX: 24,
  occlusionGridZ: 16,
  maxVersions: 30,
};

export const DEFAULT_ZONES: PriceZone[] = [
  { id: 'zone_a', name: 'A 区(贵宾)', color: '#e8553e' },
  { id: 'zone_b', name: 'B 区(一等)', color: '#f2a93b' },
  { id: 'zone_c', name: 'C 区(二等)', color: '#4f9dd6' },
  { id: 'zone_d', name: 'D 区(三等)', color: '#7bc47f' },
];

function focusAt(name: string, x: number, z: number): FocusPoint {
  return { id: uid('f'), name, x, z, y: 0, auto: true };
}

/**
 * 自动焦点:
 *  - 足球/篮球:落在比赛场地四条边线外沿(每边中点)
 *  - 田径:焦点外移到跑道外沿
 */
export function autoFocuses(kind: VenueKind, length: number, width: number, track = 0): FocusPoint[] {
  const off = kind === 'athletics' ? track : 0;
  const lx = length / 2 + off;
  const wz = width / 2 + off;
  return [
    focusAt('北侧边线焦点', 0, -wz),
    focusAt('南侧边线焦点', 0, wz),
    focusAt('西侧端线焦点', -lx, 0),
    focusAt('东侧端线焦点', lx, 0),
  ];
}

export function createVenue(kind: VenueKind): VenueState {
  const presets: Record<VenueKind, { name: string; length: number; width: number; track: number }> = {
    football: { name: '足球场', length: 105, width: 68, track: 0 },
    athletics: { name: '田径场', length: 105, width: 68, track: 9.76 }, // 标准 8 道约 9.76m
    basketball: { name: '篮球馆', length: 28, width: 15, track: 0 },
  };
  const p = presets[kind];
  return {
    kind,
    name: p.name,
    fieldLength: p.length,
    fieldWidth: p.width,
    trackWidth: p.track,
    floorY: 0,
    focusHeight: 0,
    focuses: autoFocuses(kind, p.length, p.width, p.track),
  };
}

export function createSection(over: Partial<StandSection> = {}): StandSection {
  return {
    id: uid('sec'),
    name: '新看台分区',
    kind: 'straight',
    priceZoneId: null,
    zoneManual: false,
    x1: -30,
    z1: 0,
    x2: 30,
    z2: 0,
    facing: 1,
    firstRowDistance: 8,
    arcCx: 0,
    arcCz: 0,
    arcR0: 40,
    arcA0: Math.PI / 4,
    arcA1: (3 * Math.PI) / 4,
    rowCount: 20,
    rowSpacing: 0.8,
    firstRowHeight: 0.45,
    riseMode: 'constant',
    constantRiser: 0.32,
    risers: [],
    seatWidth: 0.5,
    focusId: null,
    ...over,
  };
}

export function createObstruction(over: Partial<Obstruction> = {}): Obstruction {
  return {
    id: uid('obs'),
    name: '新障碍物',
    type: 'canopy',
    x: 0,
    z: 25,
    y: 10,
    width: 60,
    depth: 4,
    height: 1.2,
    radius: 0,
    y0: 0,
    y1: 8,
    sectionId: null,
    enabled: true,
    ...over,
  };
}

export function createScheme(name: string, kind: VenueKind = 'football'): Scheme {
  const now = Date.now();
  return {
    id: uid('sch'),
    name,
    createdAt: now,
    updatedAt: now,
    venue: createVenue(kind),
    sections: [],
    obstructions: [],
    priceZones: DEFAULT_ZONES.map((z) => ({ ...z })),
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function cloneScheme(scheme: Scheme, name: string): Scheme {
  const now = Date.now();
  return {
    ...structuredClone(scheme),
    id: uid('sch'),
    name,
    createdAt: now,
    updatedAt: now,
  };
}
