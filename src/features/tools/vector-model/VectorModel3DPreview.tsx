import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import type { VectorModelDocument } from './vectorModel';

interface VectorModel3DPreviewProps { document: VectorModelDocument }

function disposeChildren(group: THREE.Group) {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
  group.clear();
}

function createFaceGroups(geometry: THREE.ExtrudeGeometry) {
  geometry.computeVertexNormals();
  geometry.clearGroups();
  const normals = geometry.getAttribute('normal');
  const index = geometry.getIndex();
  const triangleCount = (index?.count ?? geometry.getAttribute('position').count) / 3;
  let activeMaterial = -1;
  let groupStart = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const vertex = index ? index.getX(triangle * 3) : triangle * 3;
    const normalZ = normals.getZ(vertex);
    const material = Math.abs(normalZ) < 0.7 ? 0 : normalZ > 0 ? 1 : 2;
    if (activeMaterial !== -1 && activeMaterial !== material) geometry.addGroup(groupStart, triangle * 3 - groupStart, activeMaterial);
    if (activeMaterial !== material) { activeMaterial = material; groupStart = triangle * 3; }
  }
  if (activeMaterial !== -1) geometry.addGroup(groupStart, triangleCount * 3 - groupStart, activeMaterial);
}

export function VectorModel3DPreview({ document }: VectorModel3DPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sourceSizeRef = useRef({ width: document.source.widthMm, height: document.source.heightMm });
  const renderRef = useRef<() => void>(() => {});
  const [error, setError] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setError('Este navegador no pudo iniciar WebGL. Puedes seguir revisando el vector 2D y guardar el JSON.');
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#171923');
    const diagonal = Math.max(Math.hypot(document.source.widthMm, document.source.heightMm), 40);
    const camera = new THREE.PerspectiveCamera(38, 1, Math.max(0.01, diagonal / 50000), diagonal * 80);
    camera.position.set(diagonal * 0.68, diagonal * 0.62, diagonal * 1.8);
    camera.lookAt(0, 0, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.className = 'vector-model__webgl-canvas';
    renderer.domElement.setAttribute('aria-label', 'Previsualización 3D del modelo vectorial');
    renderer.domElement.tabIndex = 0;
    host.replaceChildren(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xe2e9ff, 0x242532, 2.1));
    const key = new THREE.DirectionalLight(0xffe4c2, 3.2);
    key.position.set(-diagonal, diagonal * 1.25, diagonal * 1.8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x91bde7, 1.25);
    fill.position.set(diagonal, -diagonal * 0.7, diagonal);
    scene.add(fill);

    const model = new THREE.Group();
    scene.add(model);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.minDistance = Math.max(8, diagonal * 0.35);
    controls.maxDistance = diagonal * 8;
    controls.target.set(0, 0, 0);
    controls.update();
    const render = () => renderer.render(scene, camera);
    renderRef.current = render;
    modelRef.current = model;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    sourceSizeRef.current = { width: document.source.widthMm, height: document.source.heightMm };
    controls.addEventListener('change', render);
    const resizeObserver = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight, false);
      render();
    });
    resizeObserver.observe(host);
    camera.aspect = Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight), false);
    setError('');
    render();

    return () => {
      resizeObserver.disconnect();
      controls.removeEventListener('change', render);
      controls.dispose();
      disposeChildren(model);
      renderer.dispose();
      renderer.domElement.remove();
      modelRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      renderRef.current = () => {};
    };
  }, []);

  useEffect(() => {
    const model = modelRef.current;
    const scene = sceneRef.current;
    if (!model || !scene) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (camera && controls && (sourceSizeRef.current.width !== document.source.widthMm || sourceSizeRef.current.height !== document.source.heightMm)) {
      const diagonal = Math.max(Math.hypot(document.source.widthMm, document.source.heightMm), 40);
      camera.near = Math.max(0.01, diagonal / 50000);
      camera.far = diagonal * 80;
      camera.position.set(diagonal * 0.68, diagonal * 0.62, diagonal * 1.8);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      controls.minDistance = Math.max(8, diagonal * 0.35);
      controls.maxDistance = diagonal * 8;
      controls.target.set(0, 0, 0);
      controls.update();
      sourceSizeRef.current = { width: document.source.widthMm, height: document.source.heightMm };
    }
    disposeChildren(model);
    if (!document.source.svgText || document.layers.length === 0) {
      setError('Importa un SVG con contornos cerrados para construir la vista 3D.');
      renderRef.current();
      return;
    }
    try {
      const parsed = new SVGLoader().parse(document.source.svgText);
      let built = 0;
      let stackOffset = 0;
      for (const layer of document.layers) {
        const path = parsed.paths[layer.sourcePathIndex];
        if (!layer.visible || !layer.canExtrude || !path) continue;
        const shapes = path.toShapes();
        if (shapes.length === 0) continue;
        const thickness = layer.thicknessMm ?? document.defaults.thicknessMm;
        const bevelSizeMm = document.defaults.bevelEnabled ? Math.max(0, Math.min(document.defaults.bevelSizeMm, thickness * 0.45)) : 0;
        const bevelThicknessMm = document.defaults.bevelEnabled ? Math.max(0, Math.min(document.defaults.bevelThicknessMm, thickness * 0.45)) : 0;
        const geometry = new THREE.ExtrudeGeometry(shapes, {
          depth: thickness,
          bevelEnabled: document.defaults.bevelEnabled,
          bevelSize: bevelSizeMm / document.source.mmPerSourceUnit,
          bevelThickness: bevelThicknessMm,
          bevelSegments: document.defaults.bevelEnabled ? 2 : 0,
          curveSegments: 12,
          steps: 1,
        });
        const points = path.subPaths.flatMap((subPath) => subPath.getPoints(8));
        const minX = points.reduce((min, point) => Math.min(min, point.x), Infinity);
        const minY = points.reduce((min, point) => Math.min(min, point.y), Infinity);
        const maxY = points.reduce((max, point) => Math.max(max, point.y), -Infinity);
        const scale = document.source.mmPerSourceUnit;
        const baseWidth = Math.max(layer.widthMm / Math.max(Math.abs(layer.scaleX), 1e-8), 0.001);
        const baseHeight = Math.max(layer.heightMm / Math.max(Math.abs(layer.scaleY), 1e-8), 0.001);
        geometry.scale(scale, -scale, 1);
        geometry.translate(-minX * scale - baseWidth / 2, maxY * scale - baseHeight / 2, 0);
        createFaceGroups(geometry);

        const front = layer.faceColors.front ?? document.defaults.faceColors.front ?? layer.color;
        const back = layer.faceColors.back ?? document.defaults.faceColors.back ?? layer.color;
        const side = layer.faceColors.side ?? document.defaults.faceColors.side ?? layer.color;
        const material = [
          new THREE.MeshStandardMaterial({ color: side, roughness: 0.5, metalness: 0.03, side: THREE.DoubleSide }),
          new THREE.MeshStandardMaterial({ color: front, roughness: 0.43, metalness: 0.08, side: THREE.DoubleSide }),
          new THREE.MeshStandardMaterial({ color: back, roughness: 0.5, metalness: 0.03, side: THREE.DoubleSide }),
        ];
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(layer.xMm + layer.widthMm / 2 - document.source.widthMm / 2, layer.yMm + layer.heightMm / 2 - document.source.heightMm / 2, stackOffset);
        mesh.scale.set(layer.scaleX, layer.scaleY, 1);
        mesh.rotation.z = THREE.MathUtils.degToRad(layer.rotationDeg);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        model.add(mesh);
        stackOffset += thickness;
        built += 1;
      }
      setError(built ? '' : 'No hay contornos cerrados y rellenos para extruir. Las piezas abiertas siguen disponibles en 2D.');
    } catch {
      disposeChildren(model);
      setError('No se pudo construir la geometría 3D de este archivo. Revisa las advertencias y conserva el JSON para el flujo 2D.');
    }
    renderRef.current();
  }, [document]);

  return (
    <div className="vector-model__viewer-wrap">
      <div ref={hostRef} className="vector-model__viewer" />
      {error && <div className="vector-model__viewer-message" role="status">{error}</div>}
      <span className="vector-model__viewer-hint">Arrastra para girar · rueda o pellizco para acercar</span>
    </div>
  );
}
