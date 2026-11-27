import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import type { MonogramFinish } from './monogramModel';
import type { MonogramOutline } from './monogramVector';

interface Monogram3DViewerProps {
  width: number;
  height: number;
  outlines: MonogramOutline[];
  finish: MonogramFinish;
  bevel: boolean;
  autoRotate: boolean;
  explodedGap: number;
  resetKey: number;
}

function disposeModel(group: THREE.Group) {
  for (const object of group.children) {
    if (!(object instanceof THREE.Mesh)) continue;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  }
  group.clear();
}

function materialFor(finish: MonogramFinish, color: string) {
  const finishSettings: Record<MonogramFinish, { roughness: number; metalness: number }> = {
    matte: { roughness: 0.82, metalness: 0.02 },
    satin: { roughness: 0.4, metalness: 0.12 },
    metallic: { roughness: 0.24, metalness: 0.72 },
  };
  return new THREE.MeshStandardMaterial({
    color,
    ...finishSettings[finish],
    side: THREE.DoubleSide,
  });
}

export function Monogram3DViewer({ width, height, outlines, finish, bevel, autoRotate, explodedGap, resetKey }: Monogram3DViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const renderRef = useRef<() => void>(() => {});
  const animateRef = useRef<() => void>(() => {});
  const autoRotateRef = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setError('Este navegador no pudo iniciar WebGL. Puedes continuar editando y exportando el SVG 2D.');
      return;
    }

    const scene = new THREE.Scene();
    scene.background = null;
    const diagonal = Math.max(Math.hypot(width, height), 60);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20000);
    camera.position.set(diagonal * 0.55, diagonal * 0.48, diagonal * 2.3);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = 'monogram__webgl-canvas';
    renderer.domElement.setAttribute('aria-label', 'Vista 3D interactiva del diseño paramétrico');
    renderer.domElement.tabIndex = 0;
    host.replaceChildren(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xe8efff, 0x283040, 2.05));
    const keyLight = new THREE.DirectionalLight(0xffe2ad, 3.1);
    keyLight.position.set(-diagonal, diagonal * 1.3, diagonal * 1.8);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x84b6d2, 1.35);
    fillLight.position.set(diagonal, -diagonal * 0.45, diagonal);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.1);
    rimLight.position.set(diagonal * 0.2, diagonal, -diagonal);
    scene.add(rimLight);

    const model = new THREE.Group();
    scene.add(model);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.minDistance = Math.max(18, diagonal * 0.55);
    controls.maxDistance = diagonal * 6;
    controls.target.set(0, 0, 0);
    controls.update();
    controlsRef.current = controls;

    const render = () => renderer.render(scene, camera);
    renderRef.current = render;
    controls.addEventListener('change', render);
    const resizeObserver = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight, false);
      render();
    });
    resizeObserver.observe(host);

    let previousTime = 0;
    const animate = (time: number) => {
      const delta = Math.min(previousTime ? (time - previousTime) / 1000 : 0.016, 0.05);
      previousTime = time;
      let easing = false;
      for (const mesh of meshesRef.current) {
        const target = Number(mesh.userData.targetZ ?? mesh.position.z);
        const difference = target - mesh.position.z;
        if (Math.abs(difference) > 0.005) {
          mesh.position.z += difference * (1 - Math.exp(-12 * delta));
          easing = true;
        } else if (difference !== 0) {
          mesh.position.z = target;
        }
      }
      if (autoRotateRef.current) controls.update(delta);
      if (easing) render();
      if (!autoRotateRef.current && !easing) renderer.setAnimationLoop(null);
    };
    animateRef.current = () => renderer.setAnimationLoop(animate);

    modelRef.current = model;
    setError('');
    camera.aspect = Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight), false);
    render();

    return () => {
      resizeObserver.disconnect();
      controls.removeEventListener('change', render);
      controls.dispose();
      controlsRef.current = null;
      cameraRef.current = null;
      renderRef.current = () => {};
      disposeModel(model);
      meshesRef.current = [];
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.domElement.remove();
      modelRef.current = null;
      animateRef.current = () => {};
    };
  }, [height, width]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    disposeModel(model);
    meshesRef.current = [];
    let builtMeshes = 0;
    let stackOffset = 0;
    const loader = new SVGLoader();

    try {
      outlines.forEach((outline) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path d="${outline.d}"${outline.transform ? ` transform="${outline.transform}"` : ''} fill="#000" fill-rule="nonzero"/></svg>`;
        const parsed = loader.parse(svg);
        const shapes = parsed.paths.flatMap((path) => SVGLoader.createShapes(path));
        if (shapes.length === 0) return;
        const depth = Math.max(0.4, outline.depth);
        const bevelSize = bevel ? Math.min(0.7, depth * 0.12, outline.fontSize * 0.025) : 0;
        const geometry = new THREE.ExtrudeGeometry(shapes, {
          depth,
          bevelEnabled: bevel,
          bevelSegments: bevel ? 2 : 0,
          bevelThickness: bevelSize,
          bevelSize,
          curveSegments: 10,
        });
        // SVG coordinates have y down; the model uses y up.
        geometry.scale(1, -1, 1);
        geometry.translate(-width / 2, height / 2, 0);
        const mesh = new THREE.Mesh(geometry, materialFor(finish, outline.color));
        mesh.position.z = stackOffset;
        mesh.userData.baseZ = stackOffset;
        mesh.userData.explodeIndex = builtMeshes;
        mesh.userData.layerCount = Math.max(1, outlines.length);
        mesh.userData.targetZ = stackOffset;
        model.add(mesh);
        meshesRef.current.push(mesh);
        stackOffset += depth;
        builtMeshes += 1;
      });
      setError(builtMeshes === 0 ? 'Añade texto o un adorno para generar la vista 3D.' : '');
      animateRef.current();
    } catch {
      disposeModel(model);
      meshesRef.current = [];
      setError('No se pudo construir la vista 3D de estos contornos. El diseño 2D sigue disponible.');
    }
  }, [bevel, finish, height, outlines, width]);

  useEffect(() => {
    const updateMotionPreference = () => {
      autoRotateRef.current = autoRotate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (controlsRef.current) controlsRef.current.autoRotate = autoRotateRef.current;
      if (autoRotateRef.current) animateRef.current();
      else if (meshesRef.current.every((mesh) => Math.abs(Number(mesh.userData.targetZ ?? mesh.position.z) - mesh.position.z) <= 0.005)) {
        // The animation callback will stop itself on its next frame when rotation is disabled.
        animateRef.current();
      }
    };
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    updateMotionPreference();
    media.addEventListener('change', updateMotionPreference);
    return () => media.removeEventListener('change', updateMotionPreference);
  }, [autoRotate]);

  useEffect(() => {
    const count = meshesRef.current.length;
    for (const mesh of meshesRef.current) {
      const index = Number(mesh.userData.explodeIndex ?? 0);
      const centeredIndex = index - (count - 1) / 2;
      mesh.userData.targetZ = Number(mesh.userData.baseZ ?? 0) + centeredIndex * explodedGap;
    }
    animateRef.current();
  }, [explodedGap, outlines]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const diagonal = Math.max(Math.hypot(width, height), 60);
    camera.position.set(diagonal * 0.55, diagonal * 0.48, diagonal * 2.3);
    controls.target.set(0, 0, 0);
    controls.update();
    renderRef.current();
  }, [height, resetKey, width]);

  return (
    <div className="monogram__viewer-wrap">
      <div ref={hostRef} className="monogram__viewer" />
      {error && <div className="monogram__viewer-message" role="status">{error}</div>}
      {!error && <span className="monogram__viewer-hint">Arrastra para orbitar · rueda o pellizco para acercar</span>}
    </div>
  );
}
