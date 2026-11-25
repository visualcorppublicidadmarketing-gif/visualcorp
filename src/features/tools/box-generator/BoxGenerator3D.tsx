import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildBoxPanels, buildPanelOutline, resolveBoxDimensions, type BoxPanel, type BoxProject } from './boxModel';

interface BoxGenerator3DProps {
  project: BoxProject;
  resetToken: number;
  explosion?: number;
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
  position: [number, number, number],
  rotation: [number, number, number],
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
  part.position.set(...position);
  part.userData.basePosition = part.position.clone();
  part.rotation.set(...rotation);
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

export function BoxGenerator3D({ project, resetToken, explosion = 0 }: BoxGenerator3DProps) {
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
    const { outside, baseWidth, baseDepth } = dimensions;
    const thickness = project.thicknessMm;
    const panels = buildBoxPanels(project);
    for (const panel of panels) {
      switch (panel.id) {
        case 'base':
          addPanel(boxGroup, panel, project, [-baseWidth / 2, 0, baseDepth / 2], [-Math.PI / 2, 0, 0]);
          break;
        case 'front':
          addPanel(boxGroup, panel, project, [-baseWidth / 2, 0, baseDepth / 2], [0, 0, 0]);
          break;
        case 'back':
          addPanel(boxGroup, panel, project, [baseWidth / 2, 0, -baseDepth / 2], [0, Math.PI, 0]);
          break;
        case 'left':
          addPanel(boxGroup, panel, project, [-baseWidth / 2, 0, -outside.depth / 2], [0, -Math.PI / 2, 0]);
          break;
        case 'right':
          addPanel(boxGroup, panel, project, [baseWidth / 2, 0, outside.depth / 2], [0, Math.PI / 2, 0]);
          break;
        case 'lid':
          addPanel(boxGroup, panel, project, [-baseWidth / 2, outside.height - thickness, baseDepth / 2], [-Math.PI / 2, 0, 0]);
          break;
      }
    }

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
    const spread = baseScale * 0.42 * Math.min(1, Math.max(0, explosion));
    const normals: Record<BoxPanel['id'], THREE.Vector3> = {
      base: new THREE.Vector3(0, -1, 0),
      front: new THREE.Vector3(0, 0, 1),
      back: new THREE.Vector3(0, 0, -1),
      left: new THREE.Vector3(-1, 0, 0),
      right: new THREE.Vector3(1, 0, 0),
      lid: new THREE.Vector3(0, 1, 0),
    };

    runtime.boxGroup.children.forEach((part) => {
      const panelId = part.userData.panelId as BoxPanel['id'];
      const basePosition = part.userData.basePosition as THREE.Vector3;
      if (basePosition && normals[panelId]) part.position.copy(basePosition).addScaledVector(normals[panelId], spread);
    });

    const scale = baseScale + spread * 2;
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
  }, [explosion, project, resetToken]);

  const resolved = resolveBoxDimensions(project);
  return (
    <div
      className="box-generator__viewer3d"
      ref={hostRef}
      role="img"
      aria-label={`Vista 3D de caja ${project.closure === 'open' ? 'abierta' : 'cerrada'}, medidas interiores ${resolved.inside.width.toFixed(0)} por ${resolved.inside.height.toFixed(0)} por ${resolved.inside.depth.toFixed(0)} milímetros.${explosion > 0.01 ? ' Piezas separadas para inspeccionar los encastres.' : ''} Arrastra para girar y usa la rueda o el gesto de pinza para acercar.`}
    >
      {renderError && <div className="box-generator__webgl-error" role="status">{renderError}</div>}
    </div>
  );
}
