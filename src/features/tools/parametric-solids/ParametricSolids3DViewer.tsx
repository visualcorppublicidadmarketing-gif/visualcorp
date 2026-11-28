import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ADDITION, Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { ParametricPrimitive, ParametricSolidsDocument, PrimitiveKind, PrimitiveOperation } from './parametricSolidModel';

type FacePlacement = {
  type: PrimitiveKind;
  operation: PrimitiveOperation;
  point: [number, number, number];
  normal: [number, number, number];
};

interface ParametricSolids3DViewerProps {
  document: ParametricSolidsDocument;
  selectedPrimitiveId: string;
  pendingPlacement: { type: PrimitiveKind; operation: PrimitiveOperation } | null;
  onSelect: (primitiveId: string) => void;
  onPlace: (placement: FacePlacement) => void;
  onCancelPlacement: () => void;
}

function geometryFor(primitive: ParametricPrimitive) {
  if (primitive.type === 'box') {
    return new THREE.BoxGeometry(primitive.geometry.widthMm, primitive.geometry.heightMm, primitive.geometry.depthMm);
  }
  if (primitive.type === 'cylinder') {
    return new THREE.CylinderGeometry(primitive.geometry.topRadiusMm, primitive.geometry.bottomRadiusMm, primitive.geometry.heightMm, primitive.geometry.sides);
  }
  if (primitive.type === 'cone') {
    return new THREE.ConeGeometry(primitive.geometry.radiusMm, primitive.geometry.heightMm, primitive.geometry.sides);
  }
  if (primitive.type === 'sphere') {
    return new THREE.SphereGeometry(primitive.geometry.radiusMm, 32, 20);
  }
  if (primitive.type === 'prism') {
    return new THREE.CylinderGeometry(primitive.geometry.radiusMm, primitive.geometry.radiusMm, primitive.geometry.heightMm, primitive.geometry.sides);
  }
  return new THREE.CylinderGeometry(0, primitive.geometry.radiusMm, primitive.geometry.heightMm, primitive.geometry.sides);
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.LineSegments)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
  object.clear();
}

function setSelected(mesh: THREE.Mesh, selected: boolean) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material) => {
    if (!(material instanceof THREE.MeshStandardMaterial)) return;
    material.emissive.set(selected ? '#51245f' : '#000000');
    material.emissiveIntensity = selected ? 0.28 : 0;
  });
}

function makeBrush(primitive: ParametricPrimitive) {
  const geometry = geometryFor(primitive);
  geometry.clearGroups();
  const transform = new THREE.Object3D();
  transform.position.set(primitive.transform.xMm, primitive.transform.yMm, primitive.transform.zMm);
  transform.rotation.set(
    THREE.MathUtils.degToRad(primitive.transform.rotationXDeg),
    THREE.MathUtils.degToRad(primitive.transform.rotationYDeg),
    THREE.MathUtils.degToRad(primitive.transform.rotationZDeg),
  );
  transform.updateMatrix();
  geometry.applyMatrix4(transform.matrix);
  const brush = new Brush(geometry, new THREE.MeshStandardMaterial({ color: '#9b83d5', roughness: 0.56 }));
  brush.updateMatrixWorld(true);
  brush.prepareGeometry();
  return brush;
}

function disposeBrush(brush: Brush) {
  brush.disposeCacheData();
  brush.geometry.dispose();
  const materials = Array.isArray(brush.material) ? brush.material : [brush.material];
  materials.forEach((material) => material.dispose());
}

function buildBooleanPreview(primitives: ParametricPrimitive[]) {
  const solids = primitives.filter((item) => item.operation === 'solid');
  const holes = primitives.filter((item) => item.operation === 'hole');
  if (!solids.length) throw new Error('Añade al menos un sólido para aplicar los vaciados.');

  const brushes = [...solids, ...holes].map(makeBrush);
  const sourceBrushes = new Set(brushes);
  const transientBrushes = new Set<Brush>();
  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  let result = brushes[0];
  try {
    for (let index = 1; index < solids.length; index += 1) {
      const next = evaluator.evaluate(result, brushes[index], ADDITION);
      if (!sourceBrushes.has(result)) transientBrushes.add(result);
      result = next;
    }
    for (let index = 0; index < holes.length; index += 1) {
      const cutter = brushes[solids.length + index];
      const next = evaluator.evaluate(result, cutter, SUBTRACTION);
      if (!sourceBrushes.has(result)) transientBrushes.add(result);
      result = next;
    }
    if (!sourceBrushes.has(result)) transientBrushes.add(result);
    return result.geometry.clone();
  } finally {
    sourceBrushes.forEach(disposeBrush);
    transientBrushes.forEach(disposeBrush);
  }
}

export function ParametricSolids3DViewer({ document, selectedPrimitiveId, pendingPlacement, onSelect, onPlace, onCancelPlacement }: ParametricSolids3DViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const selectableMeshesRef = useRef<THREE.Mesh[]>([]);
  const surfaceMeshesRef = useRef<THREE.Mesh[]>([]);
  const selectionOverlayRef = useRef<THREE.LineSegments | null>(null);
  const compositeModeRef = useRef(false);
  const documentRef = useRef(document);
  const pendingRef = useRef(pendingPlacement);
  const callbacksRef = useRef({ onSelect, onPlace, onCancelPlacement });
  const renderRef = useRef<() => void>(() => {});
  const [error, setError] = useState('');
  pendingRef.current = pendingPlacement;
  callbacksRef.current = { onSelect, onPlace, onCancelPlacement };
  documentRef.current = document;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    } catch {
      setError('El navegador no pudo iniciar WebGL. El proyecto sigue editable desde las propiedades y la lista de piezas.');
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.className = 'parametric-solids__canvas';
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-label', 'Vista 3D. Haz clic en una pieza para seleccionarla; al elegir una forma, haz clic sobre una cara para colocarla.');
    host.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#141824');
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50000);
    camera.position.set(185, 145, 210);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.target.set(0, 42, 0);
    controls.minDistance = 8;
    controls.maxDistance = 30000;
    controls.update();

    scene.add(new THREE.HemisphereLight(0xe9edff, 0x252536, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffe6c5, 3.2);
    keyLight.position.set(150, 220, 135);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x9cb9ff, 1.2);
    fillLight.position.set(-160, 80, -80);
    scene.add(fillLight);
    const grid = new THREE.GridHelper(500, 50, '#6d7182', '#353a4a');
    grid.position.y = -0.2;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => { material.transparent = true; material.opacity = 0.34; });
    scene.add(grid);

    const model = new THREE.Group();
    scene.add(model);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerStart: { x: number; y: number; pointerId: number } | null = null;
    const render = () => renderer.render(scene, camera);
    const pointerNdc = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return true;
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) return;
      pointerStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    };
    const handlePointerUp = (event: PointerEvent) => {
      const start = pointerStart;
      pointerStart = null;
      if (!start || start.pointerId !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6 || !pointerNdc(event)) return;
      const pending = pendingRef.current;
      if (pending) {
        const hit = raycaster.intersectObjects(surfaceMeshesRef.current, false)[0];
        if (!hit) return;
        const normal = hit.face?.normal?.clone();
        if (!normal) return;
        normal.applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
        callbacksRef.current.onPlace({ type: pending.type, operation: pending.operation, point: [hit.point.x, hit.point.y, hit.point.z], normal: [normal.x, normal.y, normal.z] });
        return;
      }
      const hit = raycaster.intersectObjects(selectableMeshesRef.current, false)[0];
      const primitiveId = hit?.object.userData.parametricPrimitiveId;
      callbacksRef.current.onSelect(typeof primitiveId === 'string' ? primitiveId : '');
    };
    const handlePointerCancel = () => { pointerStart = null; };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && pendingRef.current) callbacksRef.current.onCancelPlacement();
    };
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('keydown', handleKeyDown);
    controls.addEventListener('change', render);
    renderRef.current = render;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.max(1, Math.floor(entry.contentRect.width));
      const height = Math.max(1, Math.floor(entry.contentRect.height));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      render();
    });
    observer.observe(host);
    modelRef.current = model;
    cameraRef.current = camera;
    controlsRef.current = controls;
    rendererRef.current = renderer;
    render();

    return () => {
      observer.disconnect();
      controls.removeEventListener('change', render);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('keydown', handleKeyDown);
      disposeObject(model);
      selectionOverlayRef.current = null;
      compositeModeRef.current = false;
      gridMaterials.forEach((material) => material.dispose());
      grid.geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      selectableMeshesRef.current = [];
      surfaceMeshesRef.current = [];
      modelRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    disposeObject(model);
    compositeModeRef.current = false;
    const visible = document.primitives.filter((item) => item.visible);
    const solids = visible.filter((item) => item.operation === 'solid');
    const holes = visible.filter((item) => item.operation === 'hole');
    const selectable: THREE.Mesh[] = [];
    const surfaces: THREE.Mesh[] = [];
    setError('');

    const addSourceMeshes = (includeHoles: boolean, hidden: boolean) => {
      const sources = visible.filter((item) => includeHoles || item.operation === 'solid');
      for (const primitive of sources) {
        const geometry = geometryFor(primitive);
        const material = new THREE.MeshStandardMaterial({
          color: primitive.color,
          roughness: 0.52,
          metalness: 0.02,
          transparent: hidden || primitive.operation === 'hole',
          opacity: hidden ? 0 : primitive.operation === 'hole' ? 0.18 : 1,
          depthWrite: !hidden && primitive.operation !== 'hole',
          wireframe: !hidden && primitive.operation === 'hole',
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(primitive.transform.xMm, primitive.transform.yMm, primitive.transform.zMm);
        mesh.rotation.set(
          THREE.MathUtils.degToRad(primitive.transform.rotationXDeg),
          THREE.MathUtils.degToRad(primitive.transform.rotationYDeg),
          THREE.MathUtils.degToRad(primitive.transform.rotationZDeg),
        );
        mesh.userData.parametricPrimitiveId = primitive.id;
        model.add(mesh);
        selectable.push(mesh);
        if (!hidden && primitive.operation === 'solid') surfaces.push(mesh);
      }
    };

    if (solids.length && holes.length) {
      compositeModeRef.current = true;
      try {
        const resultGeometry = buildBooleanPreview(visible);
        const resultMaterial = new THREE.MeshStandardMaterial({ color: '#8f7db9', roughness: 0.54, metalness: 0.02, side: THREE.DoubleSide });
        const result = new THREE.Mesh(resultGeometry, resultMaterial);
        result.userData.compositeSurface = true;
        model.add(result);
        surfaces.push(result);
        addSourceMeshes(true, true);
      } catch {
        setError('No se pudo calcular el vaciado. Se muestra la última composición disponible como piezas separadas; revisa que los sólidos y cortes se crucen de forma clara.');
        addSourceMeshes(true, false);
      }
    } else {
      addSourceMeshes(true, false);
    }

    selectableMeshesRef.current = selectable;
    surfaceMeshesRef.current = surfaces;
    const hasVisibleSolid = solids.length > 0;
    if (hasVisibleSolid && !holes.length && !visible.length) setError('');
    if (!hasVisibleSolid && holes.length) setError('El modelo contiene vaciados, pero aún no hay un sólido visible que puedan cortar.');
    if (!visible.length) setError('Añade una forma desde la barra superior para empezar a construir.');
    renderRef.current();
  }, [document.primitives]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    selectableMeshesRef.current.forEach((mesh) => {
      const primitiveId = mesh.userData.parametricPrimitiveId;
      if (typeof primitiveId === 'string' && mesh.visible) setSelected(mesh, primitiveId === selectedPrimitiveId);
    });
    const previous = selectionOverlayRef.current;
    if (previous) {
      model.remove(previous);
      previous.geometry.dispose();
      const materials = Array.isArray(previous.material) ? previous.material : [previous.material];
      materials.forEach((material) => material.dispose());
      selectionOverlayRef.current = null;
    }
    if (compositeModeRef.current) {
      const selected = documentRef.current.primitives.find((item) => item.id === selectedPrimitiveId && item.visible);
      if (selected) {
        const outline = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometryFor(selected), 22),
          new THREE.LineBasicMaterial({ color: selected.color, transparent: true, opacity: 0.88, depthTest: false }),
        );
        outline.position.set(selected.transform.xMm, selected.transform.yMm, selected.transform.zMm);
        outline.rotation.set(THREE.MathUtils.degToRad(selected.transform.rotationXDeg), THREE.MathUtils.degToRad(selected.transform.rotationYDeg), THREE.MathUtils.degToRad(selected.transform.rotationZDeg));
        outline.renderOrder = 4;
        model.add(outline);
        selectionOverlayRef.current = outline;
      }
    }
    renderRef.current();
  }, [document.primitives, selectedPrimitiveId]);

  const fitCamera = () => {
    const model = modelRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const renderer = rendererRef.current;
    if (!model || !camera || !controls || !renderer) return;
    const box = new THREE.Box3();
    for (const child of model.children) {
      if (!child.visible || !(child instanceof THREE.Mesh) || child.userData.parametricPrimitiveId) continue;
      box.expandByObject(child);
    }
    if (box.isEmpty()) {
      for (const child of model.children) if (child instanceof THREE.Mesh && child.visible) box.expandByObject(child);
    }
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const distance = Math.max(28, sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.12);
    controls.target.copy(sphere.center);
    const direction = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(sphere.center).addScaledVector(direction, distance);
    camera.near = Math.max(0.1, distance / 10000);
    camera.far = Math.max(1000, distance * 30);
    camera.updateProjectionMatrix();
    controls.update();
    renderRef.current();
  };

  return (
    <div className={`parametric-solids__viewer-wrap${pendingPlacement ? ' is-placement' : ''}`}>
      <div ref={hostRef} className="parametric-solids__viewer" />
      <button type="button" className="parametric-solids__fit" onClick={fitCamera}>Ajustar vista</button>
      {error && <div className="parametric-solids__viewer-alert" role="status">{error}</div>}
      <span className="parametric-solids__viewer-hint">{pendingPlacement ? `Haz clic en una cara para colocar ${pendingPlacement.operation === 'hole' ? 'el vaciado' : 'la pieza'} · Esc cancela` : 'Haz clic para seleccionar · arrastra para orbitar · rueda para acercar'}</span>
    </div>
  );
}
