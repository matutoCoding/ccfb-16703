import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { buildScene } from '../three/sceneBuilder';
import type { Scheme } from '../model/types';

interface Props {
  scheme: Scheme;
  /** 场景构建完成后的相机/交互自定义 */
  onReady?: (api: ViewportApi) => void;
  onSeatClick?: (info: SeatClickInfo) => void;
  height?: number | string;
}

export interface SeatClickInfo {
  sectionId: string;
  row: number; // 0-based
  col: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface ViewportApi {
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  raycaster: THREE.Raycaster;
  resetView: () => void;
}

export function Viewport3D({ scheme, onReady, onSeatClick, height = '100%' }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ViewportApi | null>(null);
  const clickRef = useRef(onSeatClick);
  clickRef.current = onSeatClick;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfe6ee);
    const camera = new THREE.PerspectiveCamera(52, mount.clientWidth / mount.clientHeight, 0.1, 2000);
    camera.position.set(90, 85, 110);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8fa3b8, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(70, 120, 40);
    scene.add(sun);
    const grid = new THREE.GridHelper(400, 40, 0xb6c0cc, 0xd4dbe3);
    (grid.material as THREE.Material).opacity = 0.5;
    (grid.material as THREE.Material).transparent = true;
    grid.position.y = -0.02;
    scene.add(grid);

    const handles = buildScene(scheme);
    scene.add(handles.group);

    // 简易轨道控制(自实现,避免引额外依赖)
    const target = new THREE.Vector3(0, 4, 0);
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(target));
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const dom = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      spherical.theta -= dx * 0.005;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi - dy * 0.005, 0.12, Math.PI / 2 - 0.02);
      applyCam();
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      try { dom.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      spherical.radius = THREE.MathUtils.clamp(spherical.radius * (1 + e.deltaY * 0.001), 12, 500);
      applyCam();
    };
    const applyCam = () => {
      camera.position.setFromSpherical(spherical).add(target);
      camera.lookAt(target);
    };
    applyCam();
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    // 座位拾取
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onClick = (e: MouseEvent) => {
      if (!clickRef.current) return;
      const rect = dom.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(handles.pickables, false);
      if (hits.length && hits[0].instanceId !== undefined) {
        const mesh = hits[0].object as THREE.InstancedMesh;
        const m = new THREE.Matrix4();
        mesh.getMatrixAt(hits[0].instanceId, m);
        const p = new THREE.Vector3().setFromMatrixPosition(m);
        clickRef.current({
          sectionId: mesh.userData.seatSection,
          row: mesh.userData.seatRow,
          col: hits[0].instanceId,
          x: p.x,
          y: p.y,
          z: p.z,
          yaw: mesh.userData.rowYaw,
        });
      }
    };
    dom.addEventListener('click', onClick);

    const resetView = () => {
      spherical.set(140, Math.PI / 3.2, Math.PI / 4);
      applyCam();
    };
    const api: ViewportApi = { camera, renderer, scene, raycaster, resetView };
    apiRef.current = api;
    onReady?.(api);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      renderer.render(scene, camera);
    };
    loop();

    const onResize = () => {
      if (!mount.clientWidth) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('click', onClick);
      handles.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // 主动释放 GPU 上下文,避免浏览器上下文数超限
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    // scheme 变化由父级 key 重挂载处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={mountRef} style={{ width: '100%', height }} />;
}
