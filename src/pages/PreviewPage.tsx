import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useStore } from '../state/context';
import { Viewport3D, type SeatClickInfo } from '../components/Viewport3D';
import { seatPosition, sectionGeometry } from '../model/geometry';
import { floorHeights } from '../model/sightline';
import { fieldOcclusionGrid } from '../model/occlusion';
import type { Posture, Scheme, StandSection } from '../model/types';

interface SeatRef {
  sectionId: string;
  row: number;
  col: number;
}

export function PreviewPage() {
  const { current } = useStore();
  const scheme = current!;
  const [seat, setSeat] = useState<SeatRef | null>(null);
  const [posture, setPosture] = useState<Posture>('seated');
  const [showSpectators, setShowSpectators] = useState(true);

  const firstSection = scheme.sections[0];
  const effectiveSeat: SeatRef | null = seat ?? (firstSection ? { sectionId: firstSection.id, row: Math.min(4, firstSection.rowCount - 1), col: 2 } : null);
  const section = scheme.sections.find((s) => s.id === effectiveSeat?.sectionId) ?? null;

  const onSeatClick = (info: SeatClickInfo) => setSeat({ sectionId: info.sectionId, row: info.row, col: info.col });

  return (
    <div className="layout">
      <div className="sidebar">
        <div className="card">
          <h3>座位选择</h3>
          {section ? (
            <>
              <div className="field">
                <label>看台分区</label>
                <select value={section.id} onChange={(e) => setSeat({ sectionId: e.target.value, row: 0, col: 0 })}>
                  {scheme.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="field-grid">
                <div className="field">
                  <label>排号(1 起)</label>
                  <input type="number" min={1} max={section.rowCount} value={(effectiveSeat?.row ?? 0) + 1}
                    onChange={(e) => setSeat({ sectionId: section.id, row: Math.max(0, Math.min(section.rowCount - 1, +e.target.value - 1)), col: effectiveSeat?.col ?? 0 })} />
                </div>
                <div className="field">
                  <label>座号(0 起)</label>
                  <input type="number" min={0} value={effectiveSeat?.col ?? 0}
                    onChange={(e) => setSeat({ sectionId: section.id, row: effectiveSeat?.row ?? 0, col: Math.max(0, +e.target.value) })} />
                </div>
              </div>
              <p className="muted">也可在右侧三维模型上直接点击任意座位。</p>
            </>
          ) : <div className="muted">请先在「看台建模」页创建看台。</div>}
        </div>

        <div className="card">
          <h3>视角设置</h3>
          <div className="field">
            <label>姿态</label>
            <div className="btn-row">
              <button className={`btn small ${posture === 'seated' ? 'primary' : ''}`} onClick={() => setPosture('seated')}>🪑 坐姿眼高 {scheme.settings.eyeHeight}m</button>
              <button className={`btn small ${posture === 'standing' ? 'primary' : ''}`} onClick={() => setPosture('standing')}>🧍 站姿眼高 {scheme.settings.standingEyeHeight}m</button>
            </div>
          </div>
          <label className="switch" style={{ marginTop: 6 }}>
            <input type="checkbox" checked={showSpectators} onChange={(e) => setShowSpectators(e.target.checked)} />
            显示前排观众简模(遮挡视线)
          </label>
        </div>

        {section && effectiveSeat && (
          <OcclusionCard scheme={scheme} section={section} seat={effectiveSeat} posture={posture} spectators={showSpectators} />
        )}
      </div>

      <div className="full" style={{ padding: 16, gap: 14 }}>
        <div className="card" style={{ flex: '1 1 62%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <h3>第一人称视角({section?.name} 第 {(effectiveSeat?.row ?? 0) + 1} 排 第 {(effectiveSeat?.col ?? 0) + 1} 座 · {posture === 'seated' ? '坐姿' : '站姿'})</h3>
          <div className="viewport" style={{ flex: 1 }}>
            {section && effectiveSeat && (
              <FirstPersonView
                key={`${section.id}-${effectiveSeat.row}-${effectiveSeat.col}-${posture}-${showSpectators}-${scheme.updatedAt}`}
                scheme={scheme}
                section={section}
                rowIndex={effectiveSeat.row}
                colIndex={effectiveSeat.col}
                posture={posture}
                showSpectators={showSpectators}
              />
            )}
          </div>
        </div>
        <div className="card" style={{ flex: '1 1 38%', display: 'flex', flexDirection: 'column', minHeight: 240 }}>
          <h3>全场三维(点击座位切换)</h3>
          <div className="viewport" style={{ flex: 1 }}>
            <Viewport3D key={scheme.id + scheme.updatedAt} scheme={scheme} onSeatClick={onSeatClick} />
          </div>
        </div>
      </div>
    </div>
  );
}

function OcclusionCard({ scheme, section, seat, posture, spectators }: {
  scheme: Scheme; section: StandSection; seat: SeatRef; posture: Posture; spectators: boolean;
}) {
  const info = useMemo(() => computeEye(scheme, section, seat.row, seat.col, posture), [scheme, section, seat, posture]);
  const result = useMemo(() => {
    // 前排观众作为临时障碍物(简模盒体)并入计算
    const extra = spectators ? spectatorBoxes(scheme, section, seat.row, seat.col) : [];
    return fieldOcclusionGrid(info.eye, [...scheme.obstructions, ...extra], scheme.venue, scheme.settings.occlusionGridX, scheme.settings.occlusionGridZ);
  }, [scheme, section, seat, posture, spectators, info]);

  return (
    <div className="card" style={{ boxShadow: 'none', margin: 0 }}>
      <h3>该座位视线质量</h3>
      <div className="field"><span className="muted">眼位坐标 / 标高</span>
        <div className="mono" style={{ fontSize: 13 }}>({info.eye.x.toFixed(2)}, {info.eye.z.toFixed(2)})　Y={info.eye.y.toFixed(2)}m</div>
      </div>
      <div className="field">
        <span className="muted">场地被遮挡比例(含障碍物{spectators ? '与前排观众' : ''})</span>
        <div style={{ fontSize: 22, fontWeight: 700, color: result.blockedRatio > 0.3 ? 'var(--bad)' : result.blockedRatio > 0.05 ? 'var(--warn)' : 'var(--ok)' }}>
          {(result.blockedRatio * 100).toFixed(1)}%
        </div>
      </div>
      <FieldMiniGrid cells={result.cells} nx={result.nx} nz={result.nz} />
    </div>
  );
}

/** 场地遮挡迷你网格(红=被挡) */
function FieldMiniGrid({ cells, nx, nz }: { cells: { blocked: number }[]; nx: number; nz: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const cw = cv.width / nx;
    const ch = cv.height / nz;
    cells.forEach((c, i) => {
      const ix = i % nx;
      const iz = Math.floor(i / nx);
      ctx.fillStyle = c.blocked ? '#d64545' : '#4f9e63';
      ctx.fillRect(ix * cw, iz * ch, cw - 0.5, ch - 0.5);
    });
  }, [cells, nx, nz]);
  return (
    <>
      <canvas ref={ref} width={240} height={150} className="heatmap-canvas" style={{ width: '100%' }} />
      <div className="legend-row"><span><i className="dot" style={{ background: '#4f9e63' }} />可见</span><span><i className="dot" style={{ background: '#d64545' }} />被遮挡</span></div>
    </>
  );
}

function computeEye(scheme: Scheme, section: StandSection, rowIndex: number, colIndex: number, posture: Posture) {
  const geo = sectionGeometry(section);
  const floors = floorHeights(section);
  const rowLen = geo.rows[rowIndex].length;
  const seatCount = Math.max(1, Math.floor(rowLen / section.seatWidth));
  const t = (Math.min(colIndex, seatCount - 1) + 0.5) / seatCount;
  const p = seatPosition(section, rowIndex, t);
  const eyeH = posture === 'seated' ? scheme.settings.eyeHeight : scheme.settings.standingEyeHeight;
  const yaw = Math.atan2(p.nx, p.nz);
  return { eye: { x: p.x, y: floors[rowIndex] + eyeH, z: p.z }, yaw, p };
}

/** 前排及更前排观众的简模盒体障碍物(前排观众始终按坐姿处理,与本人姿态无关) */
function spectatorBoxes(scheme: Scheme, section: StandSection, rowIndex: number, colIndex: number) {
  const geo = sectionGeometry(section);
  const floors = floorHeights(section);
  const boxes = [];
  const eyeH = scheme.settings.eyeHeight; // 前排观众保持坐姿
  // 前面所有排、本排左右各若干座都生成简模(控制数量:每排取 7 个邻近座)
  for (let r = 0; r < rowIndex; r++) {
    const rowLen = geo.rows[r].length;
    const seatCount = Math.max(1, Math.floor(rowLen / section.seatWidth));
    const lo = Math.max(0, colIndex - 3);
    const hi = Math.min(seatCount - 1, colIndex + 3);
    for (let c = lo; c <= hi; c++) {
      const t = (c + 0.5) / seatCount;
      const p = seatPosition(section, r, t);
      // 头肩简化为 0.45×0.55×0.35 的盒体,中心在眼高附近
      boxes.push({
        id: `spec_${r}_${c}`, name: '前排观众', type: 'railing' as const,
        x: p.x, z: p.z, y: floors[r] + eyeH - 0.05,
        width: 0.4, depth: 0.32, height: 0.55,
        radius: 0, y0: 0, y1: 0, sectionId: section.id, enabled: true,
      });
    }
  }
  return boxes;
}

/** 第一人称 three.js 视图 */
function FirstPersonView({ scheme, section, rowIndex, colIndex, posture, showSpectators }: {
  scheme: Scheme; section: StandSection; rowIndex: number; colIndex: number;
  posture: Posture; showSpectators: boolean;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [blocked, setBlocked] = useState(0);

  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcdd8e4);
    scene.fog = new THREE.Fog(0xcdd8e4, 120, 380);
    const camera = new THREE.PerspectiveCamera(68, mount.clientWidth / mount.clientHeight, 0.05, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8092a6, 1));
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.9);
    sun.position.set(60, 100, 30);
    scene.add(sun);

    // 场地与看台(复用场景构建器)
    const built = buildPreviewScene(scheme);
    scene.add(built.group);

    // 相机定位到所选座位眼点
    const { eye, yaw } = computeEye(scheme, section, rowIndex, colIndex, posture);
    camera.position.set(eye.x, eye.y, eye.z);
    const lookTarget = new THREE.Vector3(
      eye.x - Math.sin(yaw) * 40,
      eye.y - 1.5,
      eye.z - Math.cos(yaw) * 40,
    );
    camera.lookAt(lookTarget);

    // 前排观众简模(胶囊)
    const specGroup = new THREE.Group();
    if (showSpectators) {
      const geo2 = sectionGeometry(section);
      const floors = floorHeights(section);
      const capGeo = new THREE.CapsuleGeometry(0.2, 0.55, 4, 10);
      const capMat = new THREE.MeshStandardMaterial({ color: 0x39424e, roughness: 0.9 });
      const eyeH = scheme.settings.eyeHeight; // 前排观众始终坐姿
      for (let r = 0; r < rowIndex; r++) {
        const seatCount = Math.max(1, Math.floor(geo2.rows[r].length / section.seatWidth));
        const lo = Math.max(0, colIndex - 4);
        const hi = Math.min(seatCount - 1, colIndex + 4);
        for (let c = lo; c <= hi; c++) {
          const t = (c + 0.5) / seatCount;
          const p = seatPosition(section, r, t);
          const cap = new THREE.Mesh(capGeo, capMat);
          cap.position.set(p.x, floors[r] + eyeH - 0.1, p.z);
          specGroup.add(cap);
        }
      }
    }
    scene.add(specGroup);

    // 实时场地遮挡比例(中心采样网格)
    const extra = showSpectators ? spectatorBoxes(scheme, section, rowIndex, colIndex) : [];
    const grid = fieldOcclusionGrid(eye, [...scheme.obstructions, ...extra], scheme.venue, 18, 12);
    setBlocked(grid.blockedRatio);

    // 鼠标环视(围绕当前朝向)
    let yawCur = yaw;
    let pitch = -0.05;
    let dragging = false;
    let lx = 0;
    let ly = 0;
    const dom = renderer.domElement;
    const applyLook = () => {
      const dir = new THREE.Vector3(-Math.sin(yawCur) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yawCur) * Math.cos(pitch));
      camera.lookAt(camera.position.clone().add(dir));
    };
    applyLook();
    const down = (e: PointerEvent) => { dragging = true; lx = e.clientX; ly = e.clientY; dom.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      yawCur -= (e.clientX - lx) * 0.004;
      pitch = THREE.MathUtils.clamp(pitch + (e.clientY - ly) * 0.004, -0.9, 0.6);
      lx = e.clientX; ly = e.clientY;
      applyLook();
    };
    const up = (e: PointerEvent) => { dragging = false; try { dom.releasePointerCapture(e.pointerId); } catch { /* noop */ } };
    dom.addEventListener('pointerdown', down);
    dom.addEventListener('pointermove', move);
    dom.addEventListener('pointerup', up);

    let raf = 0;
    const loop = () => { raf = requestAnimationFrame(loop); renderer.render(scene, camera); };
    loop();
    const ro = new ResizeObserver(() => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dom.removeEventListener('pointerdown', down);
      dom.removeEventListener('pointermove', move);
      dom.removeEventListener('pointerup', up);
      built.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      <div className="view-hint">
        按住鼠标左键拖动环视场地<br />
        当前场地被遮挡比例:<b style={{ color: blocked > 0.3 ? '#ff8a8a' : '#8ce0a6' }}>{(blocked * 100).toFixed(1)}%</b>
      </div>
    </>
  );
}

// 延迟引用 sceneBuilder,避免循环
import { buildScene } from '../three/sceneBuilder';
function buildPreviewScene(scheme: Scheme) {
  return buildScene(scheme);
}
