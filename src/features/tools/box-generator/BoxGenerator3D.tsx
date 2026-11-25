import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { boxModelLabels, buildBoxPanels, buildPanelOutline, formatBoxLength, resolveBoxDimensions, type BoxPanel, type BoxProject } from './boxModel';

interface BoxGenerator3DProps {
  project: BoxProject;
  resetToken: number;
  explosion?: number;
  /** 0 starts with all panels separated; 1 completes the assembly sequence. */
  assemblyProgress?: number;
}

const assemblyOrder: BoxPanel['id'][] = ['base', 'back', 'left', 'right', 'front', 'lid'];

function clamp01(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function easeInOut(value: number) {
  return value * value * (3 - 2 * value);
}

interface SceneRuntime {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  boxGroup: THREE.Group;
  host: HTMLDivElement;
  resizeObserver: ResizeObserver;
  scheduleFrame: () => void;
  setSize: () => void;
}

function addPanel(
  group: THREE.Group,
  panel: BoxPanel,
  project: BoxProject,
) {
  // The cut path is the source for both the exported 2D panel and its 3D preview.
  const points = buildPanelOutline(panel, project);
  const shape = new THREE.Shape();
  points.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.y);
    else shape.lineTo(point.x, point.y);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: project.thicknessMm, steps: 1, bevelEnabled: false });
  const faceColor = new THREE.Color(project.previewColor);
  const mesh = new THREE.Mesh(geometry, [
    new THREE.MeshStandardMaterial({ color: faceColor, roughness: 0.76, metalness: 0.015, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: faceColor.clone().multiplyScalar(0.72), roughness: 0.82, metalness: 0.015 }),
  ]);
  const part = new THREE.Group();
  part.name = panel.id;
  part.userData.panelId = panel.id;
  part.position.set(...panel.assembly.positionMm);
  part.userData.basePosition = part.position.clone();
  part.userData.explosionDirection = new THREE.Vector3(...panel.assembly.explosionDirection);
  part.rotation.set(...panel.assembly.rotationRad);
  part.add(mesh);
  part.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: '#292117', transparent: true, opacity: 0.72 }),
  ));
  group.add(part);
}

function disposePanelObjects(group: THREE.Group) {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
}

export function BoxGenerator3D({ project, resetToken, explosion = 0, assemblyProgress }: BoxGenerator3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);
  const previousScaleRef = useRef<number | null>(null);
  const previousResetTokenRef = useRef(resetToken);
  const [renderError, setRenderError] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let frame = 0;
    let disposed = false;
    let resizeObserver: ResizeObserver;
    let renderer: THREE.WebGLRenderer;
    let controls: OrbitControls;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let boxGroup: THREE.Group;

    try {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(34, 1, 0.1, 8000);
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.className = 'box-generator__canvas';
      host.appendChild(renderer.domElement);

      scene.add(new THREE.HemisphereLight('#fff7e6', '#6c7487', 2.2));
      const keyLight = new THREE.DirectionalLight('#fff5d9', 3.0);
      keyLight.position.set(-220, 340, 270);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight('#a8c8ff', 1.15);
      fillLight.position.set(230, 120, -260);
      scene.add(fillLight);
      const grid = new THREE.GridHelper(1200, 40, '#536078', '#30394e');
      grid.position.y = -0.8;
      const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
      gridMaterials.forEach((material) => {
        material.transparent = true;
        material.opacity = 0.22;
      });
      scene.add(grid);
      boxGroup = new THREE.Group();
      scene.add(boxGroup);

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = !reducedMotion;
      controls.dampingFactor = 0.09;
      controls.enablePan = true;
      controls.minPolarAngle = 0.15;
      controls.maxPolarAngle = Math.PI * 0.48;

      const render = () => {
        if (!disposed) renderer.render(scene, camera);
      };
      const scheduleFrame = () => {
        if (!disposed && frame === 0) frame = window.requestAnimationFrame(animate);
      };
      const animate = () => {
        frame = 0;
        if (disposed) return;
        const moving = controls.update();
        render();
        if (moving) scheduleFrame();
      };
      controls.addEventListener('change', scheduleFrame);

      const setSize = () => {
        if (disposed) return;
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        render();
      };
      resizeObserver = new ResizeObserver(setSize);
      resizeObserver.observe(host);
      runtimeRef.current = { scene, camera, renderer, controls, boxGroup, host, resizeObserver, scheduleFrame, setSize };
      setRenderError('');
      setSize();
    } catch {
      setRenderError('No se pudo activar la vista 3D en este navegador. Puedes continuar con el plano de corte.');
    }

    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      runtimeRef.current?.resizeObserver.disconnect();
      runtimeRef.current?.controls.removeEventListener('change', runtimeRef.current.scheduleFrame);
      runtimeRef.current?.controls.dispose();
      if (runtimeRef.current) disposePanelObjects(runtimeRef.current.boxGroup);
      runtimeRef.current?.renderer.dispose();
      runtimeRef.current?.renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    const { scene, camera, controls, boxGroup } = runtime;
    disposePanelObjects(boxGroup);
    boxGroup.clear();
    const dimensions = resolveBoxDimensions(project);
    const { outside } = dimensions;
    const panels = buildBoxPanels(project);
    panels.forEach((panel) => addPanel(boxGroup, panel, project));

    const scale = Math.max(outside.width, outside.height, outside.depth, 30);
    const target = new THREE.Vector3(0, outside.height / 2, 0);
    const previousScale = previousScaleRef.current;
    const shouldResetView = previousScale === null || previousResetTokenRef.current !== resetToken;
    if (shouldResetView) {
      camera.position.set(scale * 1.38, scale * 1.1, scale * 1.72);
    } else {
      const offset = camera.position.clone().sub(controls.target).multiplyScalar(scale / previousScale);
      camera.position.copy(target.clone().add(offset));
    }
    camera.near = Math.max(0.1, scale / 1500);
    camera.far = Math.max(8000, scale * 18);
    camera.updateProjectionMatrix();
    controls.target.copy(target);
    controls.minDistance = scale * 0.62;
    controls.maxDistance = scale * 6;
    controls.update();
    previousScaleRef.current = scale;
    previousResetTokenRef.current = resetToken;
    runtime.setSize();
  }, [project, resetToken]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    const { outside } = resolveBoxDimensions(project);
    const baseScale = Math.max(outside.width, outside.height, outside.depth, 30);
    const fullSpread = baseScale * 0.42;
    const assembling = assemblyProgress !== undefined;
    const progress = assembling && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 1
      : clamp01(assemblyProgress ?? 1, 1);
    const panelCount = runtime.boxGroup.children.length;
    const stagger = panelCount > 1 ? 0.5 / (panelCount - 1) : 0;
    let largestOffset = 0;

    runtime.boxGroup.children.forEach((part) => {
      const panelId = part.userData.panelId as BoxPanel['id'];
      const basePosition = part.userData.basePosition as THREE.Vector3;
      const direction = part.userData.explosionDirection as THREE.Vector3 | undefined;
      if (!basePosition || !direction) return;
      const order = assemblyOrder.indexOf(panelId);
      const localProgress = clamp01((progress - Math.max(0, order) * stagger) / 0.5, 1);
      const offsetFactor = assembling ? 1 - easeInOut(localProgress) : clamp01(explosion, 0);
      const offset = fullSpread * offsetFactor;
      largestOffset = Math.max(largestOffset, offset);
      part.position.set(
        basePosition.x + direction.x * offset,
        basePosition.y + direction.y * offset,
        basePosition.z + direction.z * offset,
      );
    });

    const scale = baseScale + largestOffset * 2;
    const previousScale = previousScaleRef.current ?? baseScale;
    const target = new THREE.Vector3(0, outside.height / 2, 0);
    const offset = runtime.camera.position.clone().sub(runtime.controls.target).multiplyScalar(scale / previousScale);
    runtime.camera.position.copy(target.clone().add(offset));
    runtime.camera.near = Math.max(0.1, scale / 1500);
    runtime.camera.far = Math.max(8000, scale * 18);
    runtime.camera.updateProjectionMatrix();
    runtime.controls.target.copy(target);
    runtime.controls.minDistance = scale * 0.62;
    runtime.controls.maxDistance = scale * 6;
    runtime.controls.update();
    previousScaleRef.current = scale;
    runtime.setSize();
  }, [assemblyProgress, explosion, project, resetToken]);

  const resolved = resolveBoxDimensions(project);
  return (
    <div
      className="box-generator__viewer3d"
      ref={hostRef}
      role="img"
      aria-label={`Vista 3D de ${boxModelLabels[project.modelType]}, ${project.closure === 'open' ? 'abierta' : 'cerrada'}, medidas interiores ${formatBoxLength(resolved.inside.width, project.unit)} por ${formatBoxLength(resolved.inside.height, project.unit)} por ${formatBoxLength(resolved.inside.depth, project.unit)}.${assemblyProgress !== undefined && assemblyProgress < 1 ? ' Secuencia de armado en curso.' : assemblyProgress === undefined && explosion > 0.01 ? ' Piezas separadas para inspeccionar los encastres.' : ''} Arrastra para girar y usa la rueda o el gesto de pinza para acercar.`}
    >
      {renderError && <div className="box-generator__webgl-error" role="status">{renderError}</div>}
    </div>
  );
}
