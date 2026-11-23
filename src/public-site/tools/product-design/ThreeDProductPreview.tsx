import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RotateCcw, RotateCw } from 'lucide-react';
import type { ProductBase } from './types';

function addMesh(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, position?: [number, number, number]) {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.set(...position);
  group.add(mesh);
  return mesh;
}

function addBar(group: THREE.Group, start: THREE.Vector3, end: THREE.Vector3, radius = 0.022, material?: THREE.Material) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), 10),
    material || new THREE.MeshStandardMaterial({ color: '#aeb9c8', metalness: 0.78, roughness: 0.32 }),
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  group.add(mesh);
  return mesh;
}

function createGarmentShape(productId: string) {
  const shape = new THREE.Shape();
  if (productId === 'custom') {
    shape.moveTo(-0.66, 0.82);
    shape.lineTo(0.66, 0.82);
    shape.lineTo(0.66, -0.82);
    shape.lineTo(-0.66, -0.82);
  } else if (productId === 'sudadera') {
    shape.moveTo(-0.34, 0.78);
    shape.lineTo(-0.7, 0.84);
    shape.lineTo(-0.99, -0.05);
    shape.lineTo(-0.8, -0.22);
    shape.lineTo(-0.66, 0.02);
    shape.lineTo(-0.61, -0.83);
    shape.lineTo(0.61, -0.83);
    shape.lineTo(0.66, 0.02);
    shape.lineTo(0.8, -0.22);
    shape.lineTo(0.99, -0.05);
    shape.lineTo(0.7, 0.84);
    shape.lineTo(0.34, 0.78);
    shape.quadraticCurveTo(0.22, 0.96, 0, 0.96);
    shape.quadraticCurveTo(-0.22, 0.96, -0.34, 0.78);
  } else {
    shape.moveTo(-0.34, 0.78);
    shape.lineTo(-0.66, 0.82);
    shape.lineTo(-0.94, 0.5);
    shape.lineTo(-0.84, 0.19);
    shape.lineTo(-0.65, 0.32);
    shape.lineTo(-0.59, -0.83);
    shape.lineTo(0.59, -0.83);
    shape.lineTo(0.65, 0.32);
    shape.lineTo(0.84, 0.19);
    shape.lineTo(0.94, 0.5);
    shape.lineTo(0.66, 0.82);
    shape.lineTo(0.34, 0.78);
    shape.quadraticCurveTo(0.22, 0.96, 0, 0.96);
    shape.quadraticCurveTo(-0.22, 0.96, -0.34, 0.78);
  }
  shape.closePath();
  return shape;
}

function createProductModel(product: ProductBase, artMaterials: THREE.Material[]) {
  const group = new THREE.Group();
  const fabric = new THREE.MeshStandardMaterial({ color: '#15264a', roughness: 0.76, metalness: 0.02, side: THREE.DoubleSide });
  const hardware = new THREE.MeshStandardMaterial({ color: '#a9b5c6', roughness: 0.32, metalness: 0.76 });
  const white = new THREE.MeshStandardMaterial({ color: '#f6f4ef', roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: '#17233d', roughness: 0.62 });
  const ratio = Math.max(0.48, Math.min(1.55, product.ratio));
  const bodyWidth = product.model === 'apparel' ? 1.8 : 1.5;
  const bodyHeight = bodyWidth / ratio;
  const artWidth = bodyWidth * product.printArea.width / 100;
  const artHeight = bodyHeight * product.printArea.height / 100;
  const artX = (product.printArea.x + product.printArea.width / 2 - 50) / 100 * bodyWidth;
  const artY = (50 - product.printArea.y - product.printArea.height / 2) / 100 * bodyHeight;
  const artMaterial = () => {
    const material = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 0.82,
    });
    artMaterials.push(material);
    return material;
  };
  const addArtPlane = (width = artWidth, height = artHeight, z = 0.11, x = artX, y = artY) => {
    const mesh = addMesh(group, new THREE.PlaneGeometry(width, height), artMaterial(), [x, y, z]);
    mesh.renderOrder = 2;
    return mesh;
  };

  if (product.model === 'apparel') {
    const bodyGeometry = new THREE.ExtrudeGeometry(createGarmentShape(product.id), {
      depth: 0.13,
      bevelEnabled: true,
      bevelThickness: 0.035,
      bevelSize: 0.035,
      bevelSegments: 2,
      curveSegments: 8,
    });
    bodyGeometry.translate(0, 0, -0.07);
    addMesh(group, bodyGeometry, fabric);

    if (product.id === 'sudadera') {
      const hood = new THREE.Shape();
      hood.moveTo(-0.28, 0.7);
      hood.quadraticCurveTo(0, 1.2, 0.28, 0.7);
      hood.lineTo(0.21, 0.52);
      hood.quadraticCurveTo(0, 0.72, -0.21, 0.52);
      hood.closePath();
      const hoodGeometry = new THREE.ExtrudeGeometry(hood, { depth: 0.09, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
      hoodGeometry.translate(0, 0, -0.13);
      addMesh(group, hoodGeometry, dark);
      addMesh(group, new THREE.BoxGeometry(0.62, 0.25, 0.028), dark, [0, -0.56, 0.085]);
    } else if (product.id === 'polo') {
      const collar = new THREE.Shape();
      collar.moveTo(-0.24, 0.92);
      collar.lineTo(-0.08, 0.78);
      collar.lineTo(0, 0.58);
      collar.lineTo(0.08, 0.78);
      collar.lineTo(0.24, 0.92);
      collar.lineTo(0.12, 1.02);
      collar.lineTo(-0.12, 1.02);
      collar.closePath();
      addMesh(group, new THREE.ShapeGeometry(collar), dark, [0, 0, 0.095]);
    }

    addArtPlane(artWidth, artHeight, 0.1);
  } else if (product.model === 'rollup') {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.72, 0.055), fabric);
    panel.position.set(0, 0.04, 0);
    group.add(panel);
    addArtPlane(0.82, 1.62, 0.034, 0, 0.04);
    const base = addMesh(group, new THREE.CylinderGeometry(0.12, 0.14, 1.02, 20), hardware, [0, -0.9, 0.02]);
    base.rotation.z = Math.PI / 2;
    addBar(group, new THREE.Vector3(0, -0.82, -0.16), new THREE.Vector3(0, 0.84, -0.16), 0.018, hardware);
    addBar(group, new THREE.Vector3(-0.42, 0.88, 0), new THREE.Vector3(0.42, 0.88, 0), 0.025, hardware);
    addBar(group, new THREE.Vector3(-0.38, -1.04, 0), new THREE.Vector3(0.38, -1.04, 0), 0.024, hardware);
  } else if (product.model === 'banner-x') {
    addMesh(group, new THREE.BoxGeometry(1, 1.5, 0.045), fabric, [0, 0.02, 0]);
    addArtPlane(0.48, 1.2, 0.03, 0, 0.02);
    addBar(group, new THREE.Vector3(0, 0.95, -0.12), new THREE.Vector3(0, -0.96, -0.12), 0.016, hardware);
    addBar(group, new THREE.Vector3(-0.62, 0.88, -0.12), new THREE.Vector3(0.62, -0.92, -0.12), 0.016, hardware);
    addBar(group, new THREE.Vector3(0.62, 0.88, -0.12), new THREE.Vector3(-0.62, -0.92, -0.12), 0.016, hardware);
    [[-0.42, 0.68], [0.42, 0.68], [-0.42, -0.68], [0.42, -0.68]].forEach(([x, y]) => {
      addMesh(group, new THREE.TorusGeometry(0.035, 0.008, 8, 18), hardware, [x, y, 0.06]);
    });
  } else if (product.model === 'banner-a') {
    addMesh(group, new THREE.BoxGeometry(0.94, 1.05, 0.06), fabric, [0, 0.16, 0.02]);
    addArtPlane(0.9, 1.01, 0.06, 0, 0.16);
    addBar(group, new THREE.Vector3(-0.72, -0.72, -0.18), new THREE.Vector3(-0.58, 0.65, 0.02), 0.035, hardware);
    addBar(group, new THREE.Vector3(0.72, -0.72, -0.18), new THREE.Vector3(0.58, 0.65, 0.02), 0.035, hardware);
    addBar(group, new THREE.Vector3(-0.7, -0.72, -0.18), new THREE.Vector3(0.7, -0.72, -0.18), 0.035, hardware);
    addBar(group, new THREE.Vector3(-0.58, 0.65, 0.02), new THREE.Vector3(0.58, 0.65, 0.02), 0.025, hardware);
  } else if (product.model === 'mug') {
    const mug = addMesh(group, new THREE.CylinderGeometry(0.49, 0.43, 0.9, 48, 1, false), white, [0, 0, 0]);
    mug.scale.z = 0.78;
    addArtPlane(0.6, 0.38, 0.4, -0.07, 0.04);
    addMesh(group, new THREE.TorusGeometry(0.28, 0.055, 10, 28, Math.PI), hardware, [0.49, 0, 0]);
  } else if (product.model === 'cap') {
    addMesh(group, new THREE.SphereGeometry(0.66, 32, 20, Math.PI, Math.PI, 0, Math.PI / 2), fabric, [0, 0.08, 0]);
    const brim = addMesh(group, new THREE.CylinderGeometry(0.55, 0.64, 0.08, 40, 1, false), dark, [0, -0.18, 0.28]);
    brim.scale.z = 0.62;
    addArtPlane(0.54, 0.38, 0.52, 0, 0.03);
  } else if (product.model === 'tote') {
    addMesh(group, new THREE.BoxGeometry(1.05, 1.28, 0.11), new THREE.MeshStandardMaterial({ color: '#e6dfce', roughness: 0.94 }), [0, -0.05, 0]);
    addMesh(group, new THREE.TorusGeometry(0.28, 0.035, 12, 34, Math.PI), dark, [-0.29, 0.68, -0.01]);
    addMesh(group, new THREE.TorusGeometry(0.28, 0.035, 12, 34, Math.PI), dark, [0.29, 0.68, -0.01]);
    addArtPlane(0.525, 0.678, 0.07, 0, -0.03);
  } else {
    const panelWidth = 1.22;
    const panelHeight = panelWidth / ratio;
    addMesh(group, new THREE.BoxGeometry(panelWidth, panelHeight, 0.12), fabric, [0, 0, 0]);
    const printX = (product.printArea.x + product.printArea.width / 2 - 50) / 100 * panelWidth;
    const printY = (50 - product.printArea.y - product.printArea.height / 2) / 100 * panelHeight;
    addArtPlane(panelWidth * product.printArea.width / 100, panelHeight * product.printArea.height / 100, 0.08, printX, printY);
    addBar(group, new THREE.Vector3(-panelWidth / 2 - 0.1, -panelHeight / 2 - 0.05, -0.1), new THREE.Vector3(-panelWidth / 2 - 0.1, panelHeight / 2 + 0.05, -0.1), 0.027, hardware);
    addBar(group, new THREE.Vector3(panelWidth / 2 + 0.1, -panelHeight / 2 - 0.05, -0.1), new THREE.Vector3(panelWidth / 2 + 0.1, panelHeight / 2 + 0.05, -0.1), 0.027, hardware);
    addBar(group, new THREE.Vector3(-panelWidth / 2 - 0.1, panelHeight / 2 + 0.05, -0.1), new THREE.Vector3(panelWidth / 2 + 0.1, panelHeight / 2 + 0.05, -0.1), 0.027, hardware);
    addBar(group, new THREE.Vector3(-panelWidth / 2 - 0.1, -panelHeight / 2 - 0.05, -0.1), new THREE.Vector3(panelWidth / 2 + 0.1, -panelHeight / 2 - 0.05, -0.1), 0.027, hardware);
  }

  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return group;
}

export function ThreeDProductPreview({ product, artworkUrl }: { product: ProductBase; artworkUrl: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const materialsRef = useRef<THREE.Material[]>([]);
  const renderRef = useRef<(() => void) | null>(null);
  const pointerRef = useRef({ down: false, x: 0, y: 0 });
  const textureRef = useRef<THREE.Texture | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      setError('Este navegador no pudo iniciar WebGL. Puedes seguir editando y exportando en 2D.');
      return undefined;
    }

    setError('');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor('#f1eff6', 1);
    rendererRef.current = renderer;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f1eff6');
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    const worldHeight = product.model === 'rollup' || product.model === 'banner-x'
      ? 2.4
      : Math.max(1.9, Math.min(4.6, 1.55 / product.ratio));
    camera.position.set(0, 0.06, Math.max(3.8, worldHeight * 2.25));
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight('#ffffff', '#7c8292', 2.1));
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.2);
    keyLight.position.set(-2.5, 3.4, 4.5);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight('#d6e4ff', 0.9);
    fillLight.position.set(3, 0.2, 2.2);
    scene.add(fillLight);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.3, 48),
      new THREE.MeshBasicMaterial({ color: '#dfdce8', transparent: true, opacity: 0.72 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.18;
    scene.add(floor);

    const artMaterials: THREE.Material[] = [];
    const model = createProductModel(product, artMaterials);
    scene.add(model);
    materialsRef.current = artMaterials;
    modelRef.current = model;

    const render = () => renderer.render(scene, camera);
    renderRef.current = render;
    const resize = () => {
      const bounds = host.getBoundingClientRect();
      const width = Math.max(1, Math.floor(bounds.width));
      const height = Math.max(1, Math.floor(bounds.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const canvas = renderer.domElement;
    const onPointerDown = (event: PointerEvent) => {
      pointerRef.current = { down: true, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pointerRef.current.down || !modelRef.current) return;
      const deltaX = event.clientX - pointerRef.current.x;
      const deltaY = event.clientY - pointerRef.current.y;
      pointerRef.current.x = event.clientX;
      pointerRef.current.y = event.clientY;
      modelRef.current.rotation.y += deltaX * 0.009;
      modelRef.current.rotation.x = Math.max(-0.45, Math.min(0.45, modelRef.current.rotation.x + deltaY * 0.006));
      render();
    };
    const onPointerUp = () => { pointerRef.current.down = false; };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    return () => {
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      textureRef.current?.dispose();
      textureRef.current = null;
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      rendererRef.current = null;
      modelRef.current = null;
      materialsRef.current = [];
      renderRef.current = null;
    };
  }, [product.id, product.model, product.ratio]);

  useEffect(() => {
    if (!artworkUrl || !materialsRef.current.length) return undefined;
    let isActive = true;
    const loader = new THREE.TextureLoader();
    const texture = loader.load(artworkUrl, (loadedTexture) => {
      if (!isActive) {
        loadedTexture.dispose();
        return;
      }
      loadedTexture.colorSpace = THREE.SRGBColorSpace;
      loadedTexture.anisotropy = rendererRef.current?.capabilities.getMaxAnisotropy() ?? 1;
      textureRef.current?.dispose();
      textureRef.current = loadedTexture;
      materialsRef.current.forEach((material) => {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.map = loadedTexture;
          material.needsUpdate = true;
        }
      });
      renderRef.current?.();
    });
    return () => {
      isActive = false;
      if (textureRef.current !== texture) texture.dispose();
    };
  }, [artworkUrl, product.id]);

  const rotate = (angle: number) => {
    if (!modelRef.current) return;
    modelRef.current.rotation.y += angle;
    renderRef.current?.();
  };

  const reset = () => {
    if (!modelRef.current) return;
    modelRef.current.rotation.set(0, -0.18, 0);
    renderRef.current?.();
  };

  return (
    <div className="vc-product-3d-panel">
      <div className="vc-product-3d-meta">
        <span className="vc-tool-label">Vista 3D · referencia visual</span>
        <span>Arrastra el producto para girarlo</span>
      </div>
      <div ref={hostRef} className="vc-product-3d-host" role="img" aria-label={`Modelo 3D esquemático de ${product.name}. Arrastra para girarlo.`}>
        {error && <p className="vc-product-3d-error" role="status">{error}</p>}
      </div>
      <div className="vc-product-3d-controls" role="group" aria-label="Controles de rotación 3D">
        <button type="button" className="vc-product-icon-button" aria-label="Girar hacia la izquierda" onClick={() => rotate(-0.28)}><RotateCcw size={16} aria-hidden="true" /></button>
        <button type="button" className="vc-product-icon-button" aria-label="Restablecer vista 3D" onClick={reset}>Restablecer</button>
        <button type="button" className="vc-product-icon-button" aria-label="Girar hacia la derecha" onClick={() => rotate(0.28)}><RotateCw size={16} aria-hidden="true" /></button>
      </div>
    </div>
  );
}
