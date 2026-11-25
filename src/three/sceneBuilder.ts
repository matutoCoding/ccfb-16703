// three.js 场景构建:场地、看台碗、焦点、障碍物、座位拾取
import * as THREE from 'three';
import type { Obstruction, Scheme, StandSection } from '../model/types';
import { floorHeights } from '../model/sightline';
import { seatPosition, sectionGeometry } from '../model/geometry';

export interface SceneHandles {
  group: THREE.Group;
  seatMeshes: THREE.Object3D[];
  /** object3d.userData.seatKey = `${sectionId}:${row}:${col}` */
  pickables: THREE.Object3D[];
  dispose: () => void;
}

const matField = new THREE.MeshStandardMaterial({ color: 0x3f8f52, roughness: 0.9 });
const matTrack = new THREE.MeshStandardMaterial({ color: 0xc2693a, roughness: 0.95 });
const matStep = new THREE.MeshStandardMaterial({ color: 0x9aa4b0, roughness: 0.85 });
const matRiser = new THREE.MeshStandardMaterial({ color: 0x79838f, roughness: 0.9 });
const matFocus = new THREE.MeshBasicMaterial({ color: 0xff4d3d });
const matCanopy = new THREE.MeshStandardMaterial({ color: 0x6d7d92, roughness: 0.6, transparent: true, opacity: 0.85 });
const matColumn = new THREE.MeshStandardMaterial({ color: 0x4a5563, roughness: 0.7 });
const matRailing = new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 0.6, roughness: 0.35 });

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function buildField(scheme: Scheme, g: THREE.Group) {
  const { fieldLength: L, fieldWidth: W, floorY, kind, trackWidth: t } = scheme.venue;
  if (kind === 'athletics' && t > 0) {
    g.add(box(L + 2 * t + 8, 0.05, W + 2 * t + 8, matTrack, 0, floorY - 0.03, 0));
  }
  const field = box(L, 0.08, W, matField, 0, floorY, 0);
  field.receiveShadow = true;
  g.add(field);

  // 场地标线(简化:中线、边线、禁区/中线圆)
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  const rect = (l: number, w: number) => {
    const pts = [
      new THREE.Vector3(-l / 2, floorY + 0.05, -w / 2),
      new THREE.Vector3(l / 2, floorY + 0.05, -w / 2),
      new THREE.Vector3(l / 2, floorY + 0.05, w / 2),
      new THREE.Vector3(-l / 2, floorY + 0.05, w / 2),
      new THREE.Vector3(-l / 2, floorY + 0.05, -w / 2),
    ];
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
  };
  g.add(rect(L, W));
  g.add(rect(L * 0.16, W * 0.4));
  const opposite = rect(L * 0.16, W * 0.4);
  opposite.position.x = L / 2 - (L * 0.16) / 2;
  g.add(opposite);
  const near = rect(L * 0.16, W * 0.4);
  near.position.x = -L / 2 + (L * 0.16) / 2;
  g.add(near);
  const center = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(
      new THREE.EllipseCurve(0, 0, W * 0.14, W * 0.14, 0, Math.PI * 2).getPoints(48).map(
        (p) => new THREE.Vector3(p.x, floorY + 0.05, p.y),
      ),
    ),
    lineMat,
  );
  g.add(center);

  // 焦点
  for (const f of scheme.venue.focuses) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 16), matFocus);
    cone.position.set(f.x, floorY + 0.6, f.z);
    g.add(cone);
  }
}

function yawFor(nx: number, nz: number) {
  // 排沿切线方向,法线 (nx,nz) 朝场地;盒体默认朝 z,绕 y 旋转
  return Math.atan2(nx, nz);
}

function buildSection(scheme: Scheme, s: StandSection, g: THREE.Group, handles: SceneHandles) {
  const geo = sectionGeometry(s);
  const floors = floorHeights(s);
  const zone = scheme.priceZones.find((z) => z.id === s.priceZoneId);
  const seatColor = new THREE.Color(zone?.color ?? '#3d7dd6');

  for (let i = 0; i < s.rowCount; i++) {
    const row = geo.rows[i];
    const yaw = yawFor(row.nx, row.nz);
    const seatCount = Math.max(1, Math.floor(row.length / s.seatWidth));
    const rowLen = seatCount * s.seatWidth;

    // 踏面(水平板)与踢面(竖直板)
    const tread = box(rowLen, 0.12, s.rowSpacing, matStep, row.x, floors[i] - 0.06, row.z);
    tread.rotation.y = yaw;
    g.add(tread);
    if (i > 0) {
      const riserH = floors[i] - floors[i - 1];
      const midR = row.r - s.rowSpacing / 2;
      const riser = box(
        rowLen,
        riserH,
        0.08,
        matRiser,
        row.x - row.nx * (s.rowSpacing / 2),
        (floors[i] + floors[i - 1]) / 2,
        row.z - row.nz * (s.rowSpacing / 2),
      );
      riser.rotation.y = yaw;
      g.add(riser);
      void midR;
    }

    // 座位(每排合并为一个 InstancedMesh,拾取时映射行列)
    const chairMat = new THREE.MeshStandardMaterial({ color: seatColor, roughness: 0.8 });
    const chair = new THREE.InstancedMesh(new THREE.BoxGeometry(s.seatWidth * 0.9, 0.34, 0.42), chairMat, seatCount);
    const dummy = new THREE.Object3D();
    for (let c = 0; c < seatCount; c++) {
      const t = (c + 0.5) / seatCount;
      const p = seatPosition(s, i, t);
      dummy.position.set(p.x, floors[i] + 0.23, p.z);
      dummy.rotation.set(0, yawFor(p.nx, p.nz), 0);
      dummy.updateMatrix();
      chair.setMatrixAt(c, dummy.matrix);
    }
    chair.instanceMatrix.needsUpdate = true;
    chair.userData.seatSection = s.id;
    chair.userData.seatRow = i;
    chair.userData.seatCount = seatCount;
    chair.userData.rowYaw = yaw;
    g.add(chair);
    handles.seatMeshes.push(chair);
    handles.pickables.push(chair);
  }
}

function buildObstruction(o: Obstruction, g: THREE.Group) {
  if (!o.enabled) return;
  if (o.type === 'column') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(o.radius, o.radius, o.y1 - o.y0, 20), matColumn);
    m.position.set(o.x, (o.y0 + o.y1) / 2, o.z);
    g.add(m);
  } else {
    const mat = o.type === 'railing' ? matRailing : matCanopy;
    g.add(box(o.width, o.height, o.depth, mat, o.x, o.y, o.z));
  }
}

export function buildScene(scheme: Scheme): SceneHandles {
  const group = new THREE.Group();
  const handles: SceneHandles = { group, seatMeshes: [], pickables: [], dispose: () => {} };
  buildField(scheme, group);
  scheme.sections.forEach((s) => buildSection(scheme, s, group, handles));
  scheme.obstructions.forEach((o) => buildObstruction(o, group));

  const disposables: { dispose: () => void }[] = [];
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) disposables.push(mesh.geometry);
  });
  handles.dispose = () => disposables.forEach((d) => d.dispose());
  return handles;
}

/** 由 InstancedMesh 与 instanceId 还原座位世界坐标与朝向 */
export function seatWorldFromInstance(
  mesh: THREE.InstancedMesh,
  instanceId: number,
  eyeHeight: number,
): { x: number; y: number; z: number; yaw: number } {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(instanceId, m);
  const p = new THREE.Vector3();
  p.setFromMatrixPosition(m);
  return { x: p.x, y: p.y + 0.17 + eyeHeight, z: p.z, yaw: mesh.userData.rowYaw as number };
}
