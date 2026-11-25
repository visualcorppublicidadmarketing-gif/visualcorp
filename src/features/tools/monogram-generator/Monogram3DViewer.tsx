import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import type { MonogramOutline } from './monogramVector';

interface Monogram3DViewerProps {
  width: number;
  height: number;
  outlines: MonogramOutline[];
}

const MATERIALS = [0xe8bd74, 0x82a8bd, 0xd79a7b, 0xb2c296];

function disposeModel(group: THREE.Group) {
  for (const object of group.children) {
    if (!(object instanceof THREE.Mesh)) continue;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  }
  group.clear();
}

export function Monogram3DViewer({ width, height, outlines }: Monogram3DViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const renderRef = useRef<() => void>(() => {});
  const [error, setError] = useState('');

  // Mount WebGL and camera controls once per artboard size. Text edits update only the geometry.
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
    scene.background = new THREE.Color('#111722');
    const diagonal = Math.max(Math.hypot(width, height), 60);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20000);
    camera.position.set(diagonal * 0.55, diagonal * 0.48, diagonal * 2.3);
    camera.lookAt(0, 0, 0);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.className = 'monogram__webgl-canvas';
    renderer.domElement.setAttribute('aria-label', 'Vista 3D giratoria del diseño paramétrico');
    renderer.domElement.tabIndex = 0;
    host.replaceChildren(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xe6efff, 0x283040, 2.0));
    const keyLight = new THREE.DirectionalLight(0xffe2ad, 3.2);
    keyLight.position.set(-diagonal, diagonal * 1.3, diagonal * 1.8);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x84b6d2, 1.3);
    fillLight.position.set(diagonal, -diagonal * 0.45, diagonal);
    scene.add(fillLight);

    const model = new THREE.Group();
    scene.add(model);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.minDistance = Math.max(18, diagonal * 0.55);
    controls.maxDistance = diagonal * 6;
    controls.target.set(0, 0, 0);
    controls.update();

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
      disposeModel(model);
      renderer.dispose();
      renderer.domElement.remove();
      modelRef.current = null;
      renderRef.current = () => {};
    };
  }, [height, width]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    disposeModel(model);
    let builtMeshes = 0;
    let stackOffset = 0;
    const loader = new SVGLoader();

    try {
      outlines.forEach((outline, layerIndex) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path d="${outline.d}"${outline.transform ? ` transform="${outline.transform}"` : ''} fill="#000" fill-rule="nonzero"/></svg>`;
        const parsed = loader.parse(svg);
        const shapes = parsed.paths.flatMap((path) => SVGLoader.createShapes(path));
        if (shapes.length === 0) return;
        const geometry = new THREE.ExtrudeGeometry(shapes, {
          depth: Math.max(0.4, outline.depth),
          bevelEnabled: false,
          curveSegments: 8,
        });
        // SVG coordinates have y down; the model uses y up.
        geometry.scale(1, -1, 1);
        geometry.translate(-width / 2, height / 2, stackOffset);
        stackOffset += Math.max(0.4, outline.depth);
        const material = new THREE.MeshStandardMaterial({
          color: MATERIALS[layerIndex % MATERIALS.length],
          roughness: 0.42,
          metalness: 0.08,
          side: THREE.DoubleSide,
        });
        model.add(new THREE.Mesh(geometry, material));
        builtMeshes += 1;
      });
      setError(builtMeshes === 0 ? 'Escribe texto para generar la vista 3D.' : '');
      renderRef.current();
    } catch {
      disposeModel(model);
      setError('No se pudo construir la vista 3D de estos contornos. El diseño 2D sigue disponible.');
      renderRef.current();
    }
  }, [height, outlines, width]);

  return (
    <div className="monogram__viewer-wrap">
      <div ref={hostRef} className="monogram__viewer" />
      {error && <div className="monogram__viewer-message" role="status">{error}</div>}
      {!error && <span className="monogram__viewer-hint">Arrastra para girar · rueda o pellizco para acercar</span>}
    </div>
  );
}
