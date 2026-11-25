// 全局数据模型:方案、场地、看台、障碍物、票价分区、设置
// 坐标约定:three.js 风格,y 轴竖直向上;场地平面为 x-z 平面;单位米。

export type VenueKind = 'football' | 'athletics' | 'basketball';
export type RiseMode = 'constant' | 'variable';
export type SectionKind = 'straight' | 'arc';
export type ObstructionType = 'canopy' | 'column' | 'railing';
export type Posture = 'seated' | 'standing';

export interface FocusPoint {
  id: string;
  name: string;
  /** 平面坐标 */
  x: number;
  z: number;
  /** 焦点距场地地面的高度(通常为 0) */
  y: number;
  /** true=按规范自动生成;false=用户手动修改 */
  auto: boolean;
}

export interface VenueState {
  kind: VenueKind;
  name: string;
  /** 比赛场地长度(x 方向) */
  fieldLength: number;
  /** 比赛场地宽度(z 方向) */
  fieldWidth: number;
  /** 田径跑道宽度(仅 athletics) */
  trackWidth: number;
  /** 场地地面标高(一般 0) */
  floorY: number;
  /** 自动焦点的高度 */
  focusHeight: number;
  focuses: FocusPoint[];
}

export interface StandSection {
  id: string;
  name: string;
  kind: SectionKind;
  priceZoneId: string | null;
  /** 手动票价分区标记(自动建议之外的人工锁定) */
  zoneManual: boolean;

  // —— 直线看台:由一段基准线 (x1,z1)->(x2,z2) 定义,排朝 facing 法线方向展开 ——
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  /** 1 = 法线朝线段左侧; -1 = 右侧 */
  facing: 1 | -1;
  /** 首排中心线到基准线的水平距离(基准线一般取场地边线/跑道外沿) */
  firstRowDistance: number;

  // —— 弧形看台:圆心、首排半径、起止角(弧度,atan2 约定) ——
  arcCx: number;
  arcCz: number;
  arcR0: number;
  arcA0: number;
  arcA1: number;

  // —— 排级参数 ——
  rowCount: number;
  /** 排距(踏面深度) */
  rowSpacing: number;
  /** 首排地面(踏步面)相对场地地面的标高 */
  firstRowHeight: number;
  riseMode: RiseMode;
  /** 等升起模式下每排升高 */
  constantRiser: number;
  /** 变升起模式:第 i 个值 = 第 i+1 排相对第 i 排的升高,长度 rowCount-1 */
  risers: number[];

  /** 座椅宽度(沿排方向) */
  seatWidth: number;
  /** 绑定的视点 id;null = 自动取最近焦点 */
  focusId: string | null;
}

export interface Obstruction {
  id: string;
  name: string;
  type: ObstructionType;
  /** 盒体(挑檐/栏杆)中心与尺寸 */
  x: number;
  z: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  /** 圆柱(立柱)参数;非柱时 radius=0 */
  radius: number;
  y0: number;
  y1: number;
  /** 栏杆所属分区(可选,用于随分区前缘联动) */
  sectionId: string | null;
  enabled: boolean;
}

export interface PriceZone {
  id: string;
  name: string;
  color: string;
}

export interface Settings {
  /** 坐姿眼高(米) */
  eyeHeight: number;
  /** 站姿眼高 */
  standingEyeHeight: number;
  /** 规范最小 C 值(米) */
  minC: number;
  /** 施工取整步长(米),0.001 = 1 毫米 */
  constructionStep: number;
  /** 遮挡热力图采样网格 */
  occlusionGridX: number;
  occlusionGridZ: number;
  /** 历史版本上限 */
  maxVersions: number;
}

export interface Scheme {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  venue: VenueState;
  sections: StandSection[];
  obstructions: Obstruction[];
  priceZones: PriceZone[];
  settings: Settings;
}

export interface SchemeVersion {
  id: string;
  schemeId: string;
  createdAt: number;
  label: string;
  /** 当时的方案完整快照 */
  data: Scheme;
}

export interface RowAnalysis {
  row: number; // 1-based
  floorY: number;
  riser: number; // 本排相对前排升高(首排为 0)
  eyeY: number;
  distance: number; // 眼到焦点的水平距离
  cValue: number | null; // 首排为 null
  pass: boolean;
  /** 越过前排眼睛后,视线在地面上的最近可见点距焦点的水平距离 */
  visibleGroundDistance: number | null;
  /** 正值 = 场地边线被前排遮挡的深度(米) */
  edgeBlockedDepth: number | null;
}
