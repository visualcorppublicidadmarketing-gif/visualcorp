import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { Camera, Crosshair, Download, Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import { drawSceneBackground, loadCanvasImage } from './canvas-utils';
import { createMugWrapGeometry, getMugWrapSettings } from './mug-wrap';
import type {
  CameraPreset3D,
  Custom3DModelState,
  DesignLayer,
  ProductAppearance,
  ProductBase,
  ProductFinish,
  SceneBackground,
} from './types';

export type ThreeDPreviewHandle = {
  capturePng: (transparentBackdrop?: boolean) => Promise<HTMLCanvasElement | null>;
  exportGlb: () => Promise<boolean>;
};

type ThreeDProductPreviewProps = {
  product: ProductBase;
  artworkUrl: string;
  frontalMockupUrl: string;
  selectedLayer: DesignLayer | null;
  showPrintGuides: boolean;
  appearance: ProductAppearance;
  background: SceneBackground;
  customModel: Custom3DModelState | null;
  compact?: boolean;
  onDetectedMeshes?: (meshNames: string[], suggestedTarget: string) => void;
  onPlaceDecal?: (point: [number, number, number], normal: [number, number, number]) => void;
  onTogglePlacementMode?: () => void;
  onExport3D?: (transparent: boolean) => void;
  onMoveLayer?: (layerId: string, x: number, y: number) => void;
  onExportModel?: () => void;
  exportingModel?: boolean;
};

type BuiltInModelBundle = {
  group: THREE.Group;
  bodyMaterials: THREE.MeshStandardMaterial[];
  accentMaterials: THREE.MeshStandardMaterial[];
  artMaterials: THREE.MeshStandardMaterial[];
  chestArtworkMesh?: THREE.Mesh;
  guideMesh?: THREE.Mesh;
  guideCanvas?: HTMLCanvasElement;
  guideTexture?: THREE.CanvasTexture;
};

const BUILT_IN_HOODIE_MODEL_URL = '/public-site/models/premium-eco-hoodie.gltf';

function getFinishParams(finish: ProductFinish) {
  if (finish === 'glossy') return { roughness: 0.16, metalness: 0.08, envMapIntensity: 1.15 };
  if (finish === 'metallic') return { roughness: 0.24, metalness: 0.8, envMapIntensity: 1.3 };
  if (finish === 'satin') return { roughness: 0.46, metalness: 0.12, envMapIntensity: 0.9 };
  return { roughness: 0.86, metalness: 0.03, envMapIntensity: 0.55 };
}

function addMesh(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position?: [number, number, number],
  rotation?: [number, number, number],
) {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  group.add(mesh);
  return mesh;
}

function addBar(
  group: THREE.Group,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  if (length < 0.0001) return null;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  group.add(mesh);
  return mesh;
}

function createCurvedPatchGeometry(width: number, height: number, bendX: number, bendY = 0) {
  const geo = new THREE.PlaneGeometry(width, height, 28, 20);
  const pos = geo.attributes.position;
  const halfW = Math.max(0.001, width / 2);
  const halfH = Math.max(0.001, height / 2);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const nx = x / halfW;
    const ny = y / halfH;
    const z = -bendX * nx * nx - bendY * ny * ny;
    pos.setZ(i, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function createFabricNormalMap(isRibbed = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const imageData = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4;
      const phase = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const noise = (phase - Math.floor(phase) - 0.5) * 0.12;
      const nx = isRibbed
        ? Math.sin(x * 0.52) * 0.42 + noise
        : Math.sin(x * 1.1) * Math.cos(y * 1.1) * 0.2 + noise;
      const ny = isRibbed
        ? Math.sin(y * 1.35) * 0.16 + noise * 0.4
        : Math.cos(x * 1.1) * Math.sin(y * 1.1) * 0.2 + noise;
      imageData.data[index] = Math.round(127 + nx * 72);
      imageData.data[index + 1] = Math.round(127 + ny * 72);
      imageData.data[index + 2] = 255;
      imageData.data[index + 3] = 255;
    }
  }

  context.putImageData(imageData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(isRibbed ? 14 : 24, isRibbed ? 6 : 24);
  return texture;
}

function drawGarmentGuideCanvas(
  canvas: HTMLCanvasElement,
  product: ProductBase,
  selectedLayer: DesignLayer | null,
  visible: boolean,
) {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!visible) return;

  const { width, height } = canvas;
  const area = product.printArea;
  const lineWidth = Math.max(2, width / 180);
  context.save();
  context.strokeStyle = '#38bdf8';
  context.lineWidth = lineWidth;
  context.setLineDash([width * 0.035, width * 0.025]);
  context.strokeRect(lineWidth * 2, lineWidth * 2, width - lineWidth * 4, height - lineWidth * 4);
  context.restore();
  if (!selectedLayer) return;

  const centerX = ((selectedLayer.x - area.x) / Math.max(1, area.width)) * width;
  const centerY = ((selectedLayer.y - area.y) / Math.max(1, area.height)) * height;
  const boxWidth = Math.max(width * 0.08, (selectedLayer.size / Math.max(1, area.width)) * width * (selectedLayer.scaleX ?? 1));
  const layerHeightToWidth = selectedLayer.kind === 'image'
    ? 1 / (selectedLayer.imageAspect || product.surfaceProfile?.aspectRatio || product.ratio)
    : selectedLayer.kind === 'text'
      ? 0.34
    : selectedLayer.kind === 'line'
      ? 0.08
      : selectedLayer.kind === 'triangle'
        ? 0.86
        : 0.72;
  const boxHeight = Math.max(height * 0.08, boxWidth * layerHeightToWidth * (selectedLayer.scaleY ?? 1));
  const rotation = (selectedLayer.rotation * Math.PI) / 180;
  context.save();
  context.translate(centerX, centerY);
  context.rotate(rotation);
  context.strokeStyle = '#ec4899';
  context.lineWidth = lineWidth * 1.4;
  context.setLineDash([width * 0.02, width * 0.014]);
  context.strokeRect(-boxWidth * 0.44, -boxHeight * 0.44, boxWidth * 0.88, boxHeight * 0.88);
  context.setLineDash([]);
  context.lineWidth = lineWidth * 1.6;
  context.strokeRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);
  context.beginPath();
  context.moveTo(0, -boxHeight / 2);
  context.lineTo(0, -boxHeight / 2 - height * 0.09);
  context.stroke();
  const radius = Math.max(5, width / 52);
  const handles: Array<[number, number]> = [
    [-boxWidth / 2, -boxHeight / 2], [0, -boxHeight / 2], [boxWidth / 2, -boxHeight / 2],
    [-boxWidth / 2, 0], [boxWidth / 2, 0],
    [-boxWidth / 2, boxHeight / 2], [0, boxHeight / 2], [boxWidth / 2, boxHeight / 2],
    [0, -boxHeight / 2 - height * 0.09],
  ];
  handles.forEach(([x, y]) => {
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = '#ffffff';
    context.fill();
    context.lineWidth = lineWidth * 1.2;
    context.strokeStyle = '#ec4899';
    context.stroke();
  });
  context.restore();
}

function drawSurfaceGuideCanvas(
  canvas: HTMLCanvasElement,
  product: ProductBase,
  selectedLayer: DesignLayer | null,
  visible: boolean,
) {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!visible) return;

  const { width, height } = canvas;
  const area = product.printArea;
  const lineWidth = Math.max(2, width / 180);
  context.save();
  context.strokeStyle = '#38bdf8';
  context.lineWidth = lineWidth;
  context.setLineDash([width * 0.035, width * 0.025]);
  context.strokeRect(lineWidth * 2, lineWidth * 2, width - lineWidth * 4, height - lineWidth * 4);
  context.restore();
  if (!selectedLayer) return;

  const centerX = ((selectedLayer.x - area.x) / Math.max(1, area.width)) * width;
  const centerY = ((selectedLayer.y - area.y) / Math.max(1, area.height)) * height;
  const layerHeightRatio = selectedLayer.kind === 'image'
    ? 1 / (selectedLayer.imageAspect || product.surfaceProfile?.aspectRatio || 1)
    : selectedLayer.kind === 'text'
      ? 0.34
      : selectedLayer.kind === 'line'
        ? 0.08
        : selectedLayer.kind === 'triangle'
          ? 0.86
          : selectedLayer.kind === 'badge'
            ? 0.56
            : 1;
  const boxWidth = Math.max(width * 0.08, (selectedLayer.size / Math.max(1, area.width)) * width * (selectedLayer.scaleX ?? 1));
  const boxHeight = Math.max(height * 0.08, boxWidth * layerHeightRatio * (selectedLayer.scaleY ?? 1));
  const rotation = (selectedLayer.rotation * Math.PI) / 180;
  context.save();
  context.translate(centerX, centerY);
  context.rotate(rotation);
  context.strokeStyle = '#ec4899';
  context.lineWidth = lineWidth * 1.4;
  context.setLineDash([width * 0.02, width * 0.014]);
  context.strokeRect(-boxWidth * 0.44, -boxHeight * 0.44, boxWidth * 0.88, boxHeight * 0.88);
  context.setLineDash([]);
  context.lineWidth = lineWidth * 1.6;
  context.strokeRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);
  context.beginPath();
  context.moveTo(0, -boxHeight / 2);
  context.lineTo(0, -boxHeight / 2 - height * 0.09);
  context.stroke();
  const radius = Math.max(5, width / 52);
  const handles: Array<[number, number]> = [
    [-boxWidth / 2, -boxHeight / 2], [0, -boxHeight / 2], [boxWidth / 2, -boxHeight / 2],
    [-boxWidth / 2, 0], [boxWidth / 2, 0],
    [-boxWidth / 2, boxHeight / 2], [0, boxHeight / 2], [boxWidth / 2, boxHeight / 2],
    [0, -boxHeight / 2 - height * 0.09],
  ];
  handles.forEach(([x, y]) => {
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = '#ffffff';
    context.fill();
    context.lineWidth = lineWidth * 1.2;
    context.strokeStyle = '#ec4899';
    context.stroke();
  });
  context.restore();
}

function createHoodieTorsoGeometry() {
  const geometry = new THREE.CylinderGeometry(0.45, 0.49, 1.16, 96, 72, false);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    let x = positions.getX(i);
    const y = positions.getY(i);
    let z = positions.getZ(i) * 0.72;
    const normalizedY = THREE.MathUtils.clamp((y + 0.58) / 1.16, 0, 1);
    const angle = Math.atan2(x, z);
    const chestBulge = Math.sin(normalizedY * Math.PI) * 0.045;
    const sideFold = Math.sin(angle * 5 + y * 10) * 0.012 * (0.4 + Math.sin(normalizedY * Math.PI));
    const waistGather = normalizedY < 0.16 ? Math.sin(angle * 18) * 0.01 : 0;
    const radialScale = 1 + chestBulge + sideFold + waistGather;
    x *= radialScale;
    z *= radialScale;
    positions.setXYZ(i, x, y, z);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function getFrontalMockupFrame(product: ProductBase): { width: number; height: number; z: number } {
  if (product.id === 'sudadera') return { width: 2.06, height: 2.06, z: 0.42 };
  switch (product.model) {
    case 'apparel': return { width: 2.34, height: 2.06, z: 0.19 };
    case 'mug': return { width: 1.75, height: 1.24, z: 0.49 };
    case 'bottle': return { width: 2.18, height: 1.86, z: 0.38 };
    case 'cap': return { width: 1.58, height: 1.04, z: 0.86 };
    case 'tote': return { width: 1.72, height: 2.12, z: 0.14 };
    case 'rollup': return { width: 1.97, height: 1.83, z: 0.045 };
    case 'banner-x': return { width: 1.93, height: 1.62, z: 0.05 };
    case 'banner-a': return { width: 1.42, height: 1.51, z: 0.34 };
    case 'sign': return { width: 2.58, height: 1.87, z: 0.1 };
    default: return { width: 1.8, height: 1.8, z: 0.16 };
  }
}

function createGarmentShape(productId: string) {
  const shape = new THREE.Shape();
  if (productId === 'sudadera') {
    shape.moveTo(-0.32, 0.78);
    shape.lineTo(-0.68, 0.84);
    shape.lineTo(-0.98, -0.06);
    shape.lineTo(-0.79, -0.22);
    shape.lineTo(-0.65, 0.03);
    shape.lineTo(-0.6, -0.84);
    shape.lineTo(0.6, -0.84);
    shape.lineTo(0.65, 0.03);
    shape.lineTo(0.79, -0.22);
    shape.lineTo(0.98, -0.06);
    shape.lineTo(0.68, 0.84);
    shape.lineTo(0.32, 0.78);
    shape.quadraticCurveTo(0.18, 0.68, 0, 0.68);
    shape.quadraticCurveTo(-0.18, 0.68, -0.32, 0.78);
  } else {
    shape.moveTo(-0.3, 0.8);
    shape.lineTo(-0.65, 0.83);
    shape.lineTo(-0.95, 0.48);
    shape.lineTo(-0.82, 0.18);
    shape.lineTo(-0.63, 0.31);
    shape.lineTo(-0.58, -0.84);
    shape.lineTo(0.58, -0.84);
    shape.lineTo(0.63, 0.31);
    shape.lineTo(0.82, 0.18);
    shape.lineTo(0.95, 0.48);
    shape.lineTo(0.65, 0.83);
    shape.lineTo(0.3, 0.8);
    shape.quadraticCurveTo(0.18, 0.66, 0, 0.66);
    shape.quadraticCurveTo(-0.18, 0.66, -0.3, 0.8);
  }
  shape.closePath();
  return shape;
}

function createSculptedGarmentGeometry(productId: string) {
  const geometry = new THREE.ExtrudeGeometry(createGarmentShape(productId), {
    depth: 0.15,
    bevelEnabled: true,
    bevelThickness: 0.048,
    bevelSize: 0.042,
    bevelSegments: 4,
    curveSegments: 14,
  });
  geometry.translate(0, 0, -0.075);

  // Subtle organic torso curvature so chest feels 3D instead of flat cardboard
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const torsoCurve = Math.max(0, 1 - (x * x) / 0.85) * 0.075;
    const chestBulge = Math.exp(-Math.pow((y - 0.18) / 0.55, 2)) * Math.max(0, 1 - (x * x) / 0.55) * 0.045;
    const sign = z >= 0 ? 1 : -0.45;
    pos.setZ(i, z + (torsoCurve + chestBulge) * sign);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createBuiltInProductModel(product: ProductBase, appearance: ProductAppearance): BuiltInModelBundle {
  const group = new THREE.Group();
  const finish = getFinishParams(appearance.finish);
  const bodyColor = appearance.mode === 'custom' ? appearance.color : product.defaultColor;
  const accentColor = appearance.mode === 'custom' ? appearance.accentColor : product.defaultAccentColor;

  const bodyMaterialOptions = {
    color: bodyColor,
    roughness: finish.roughness,
    metalness: finish.metalness,
    envMapIntensity: finish.envMapIntensity,
    side: THREE.DoubleSide,
  };
  const isHoodie = product.id === 'sudadera';
  const fleeceNormal = isHoodie ? createFabricNormalMap(false) : null;
  const ribbedNormal = isHoodie ? createFabricNormalMap(true) : null;
  const hoodieSurfaceOptions = isHoodie
    ? {
      roughness: 0.88,
      metalness: 0,
      normalMap: fleeceNormal || undefined,
      normalScale: new THREE.Vector2(0.34, 0.34),
      sheen: 0.65,
      sheenRoughness: 0.75,
      sheenColor: new THREE.Color('#ffffff'),
    }
    : {};
  const bodyMaterial = product.model === 'mug'
    ? new THREE.MeshPhysicalMaterial({ ...bodyMaterialOptions, clearcoat: 0.9, clearcoatRoughness: 0.045, ior: 1.54 })
    : isHoodie
      ? new THREE.MeshPhysicalMaterial({ ...bodyMaterialOptions, ...hoodieSurfaceOptions })
      : new THREE.MeshStandardMaterial(bodyMaterialOptions);
  const accentMaterialOptions = {
    color: accentColor,
    roughness: product.model === 'bottle' || product.model === 'rollup' || product.model === 'banner-x' || product.model === 'banner-a' ? 0.24 : Math.max(0.18, finish.roughness - 0.08),
    metalness: product.model === 'bottle' || product.model === 'rollup' || product.model === 'banner-x' || product.model === 'banner-a' ? 0.82 : finish.metalness,
    envMapIntensity: 1.15,
    side: THREE.DoubleSide,
  };
  const accentMaterial = product.model === 'mug'
    ? new THREE.MeshPhysicalMaterial({ ...accentMaterialOptions, clearcoat: 0.9, clearcoatRoughness: 0.045, ior: 1.54 })
    : isHoodie
      ? new THREE.MeshPhysicalMaterial({
        ...accentMaterialOptions,
        roughness: 0.92,
        metalness: 0,
        normalMap: ribbedNormal || undefined,
        normalScale: new THREE.Vector2(0.5, 0.5),
        sheen: 0.5,
        sheenRoughness: 0.8,
        sheenColor: new THREE.Color('#ffffff'),
      })
      : new THREE.MeshStandardMaterial(accentMaterialOptions);
  const hardwareMaterial = new THREE.MeshStandardMaterial({
    color: '#b7c2d0',
    roughness: 0.26,
    metalness: 0.84,
    envMapIntensity: 1.2,
  });

  const bodyMaterials: THREE.MeshStandardMaterial[] = [bodyMaterial];
  const accentMaterials: THREE.MeshStandardMaterial[] = [accentMaterial];
  const artMaterials: THREE.MeshStandardMaterial[] = [];

  const createArtMaterial = () => {
    const artMaterialOptions = {
      color: '#ffffff',
      transparent: true,
      alphaTest: 0.01,
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: Math.min(0.92, finish.roughness + 0.08),
      metalness: Math.max(0, finish.metalness * 0.25),
      polygonOffset: true,
      polygonOffsetFactor: -2,
    };
    const mat = product.model === 'mug'
      ? new THREE.MeshPhysicalMaterial({ ...artMaterialOptions, clearcoat: 0.72, clearcoatRoughness: 0.055, ior: 1.54 })
      : isHoodie
        ? new THREE.MeshPhysicalMaterial({
          ...artMaterialOptions,
          normalMap: fleeceNormal || undefined,
          normalScale: new THREE.Vector2(0.34, 0.34),
          roughness: 0.88,
          metalness: 0,
          sheen: 0.65,
          sheenRoughness: 0.75,
          sheenColor: new THREE.Color('#ffffff'),
        })
        : new THREE.MeshStandardMaterial(artMaterialOptions);
    artMaterials.push(mat);
    return mat;
  };

  const ratio = Math.max(0.48, Math.min(1.55, product.ratio));
  const bodyWidth = product.model === 'apparel' ? 1.8 : 1.5;
  const bodyHeight = bodyWidth / ratio;
  const artWidth = bodyWidth * (product.printArea.width / 100);
  const artHeight = bodyHeight * (product.printArea.height / 100);
  const artX = ((product.printArea.x + product.printArea.width / 2 - 50) / 100) * bodyWidth;
  const artY = ((50 - product.printArea.y - product.printArea.height / 2) / 100) * bodyHeight;
  const warpFactor = Math.max(0.15, Math.min(1, appearance.warpStrength / 100));
  let chestArtworkMesh: THREE.Mesh | undefined;
  let guideMesh: THREE.Mesh | undefined;
  let guideCanvas: HTMLCanvasElement | undefined;
  let guideTexture: THREE.CanvasTexture | undefined;

  if (product.model === 'apparel') {
    if (isHoodie) {
      addMesh(group, createHoodieTorsoGeometry(), bodyMaterial);

      // Soft hood shell and recessed lining frame the neckline.
      const hoodShape = new THREE.Shape();
      hoodShape.moveTo(-0.32, 0.52);
      hoodShape.bezierCurveTo(-0.4, 0.76, -0.31, 0.92, 0, 0.96);
      hoodShape.bezierCurveTo(0.31, 0.92, 0.4, 0.76, 0.32, 0.52);
      hoodShape.lineTo(0.21, 0.57);
      hoodShape.bezierCurveTo(0.2, 0.76, 0.13, 0.8, 0, 0.82);
      hoodShape.bezierCurveTo(-0.13, 0.8, -0.2, 0.76, -0.21, 0.57);
      hoodShape.closePath();
      const hoodGeometry = new THREE.ExtrudeGeometry(hoodShape, {
        depth: 0.13,
        bevelEnabled: true,
        bevelSize: 0.018,
        bevelThickness: 0.018,
        bevelSegments: 3,
        curveSegments: 20,
      });
      hoodGeometry.translate(0, 0, -0.18);
      addMesh(group, hoodGeometry, bodyMaterial);

      const innerHoodShape = new THREE.Shape();
      innerHoodShape.moveTo(-0.2, 0.61);
      innerHoodShape.quadraticCurveTo(-0.2, 0.78, 0, 0.83);
      innerHoodShape.quadraticCurveTo(0.2, 0.78, 0.2, 0.61);
      innerHoodShape.quadraticCurveTo(0, 0.73, -0.2, 0.61);
      const innerHood = addMesh(group, new THREE.ShapeGeometry(innerHoodShape, 20), accentMaterial, [0, 0, -0.045]);
      innerHood.scale.set(0.92, 0.86, 1);

      // Relaxed sleeves curve from the shoulder seam into ribbed cuffs.
      [-1, 1].forEach((side) => {
        const sleeveCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.34, 0.44, -0.01),
          new THREE.Vector3(side * 0.5, 0.25, 0.015),
          new THREE.Vector3(side * 0.62, 0.01, 0.05),
          new THREE.Vector3(side * 0.69, -0.28, 0.07),
          new THREE.Vector3(side * 0.68, -0.46, 0.08),
        ]);
        const sleeveGeometry = new THREE.TubeGeometry(sleeveCurve, 72, 0.145, 32, false);
        sleeveGeometry.scale(1, 1, 0.82);
        addMesh(group, sleeveGeometry, bodyMaterial);

        const cuffGeometry = new THREE.CylinderGeometry(0.118, 0.13, 0.16, 40, 8);
        cuffGeometry.scale(1, 1, 0.82);
        const cuff = addMesh(group, cuffGeometry, accentMaterial, [side * 0.68, -0.48, 0.08]);
        cuff.rotation.z = -side * 0.06;
      });

      const waistbandGeometry = new THREE.CylinderGeometry(0.48, 0.49, 0.17, 96, 12);
      waistbandGeometry.scale(1, 1, 0.72);
      addMesh(group, waistbandGeometry, accentMaterial, [0, -0.58, 0]);

      // The kangaroo pocket follows the torso instead of floating as a flat card.
      const pocketShape = new THREE.Shape();
      pocketShape.moveTo(-0.2, 0.13);
      pocketShape.lineTo(0.2, 0.13);
      pocketShape.quadraticCurveTo(0.25, 0.03, 0.3, -0.03);
      pocketShape.lineTo(0.27, -0.23);
      pocketShape.lineTo(-0.27, -0.23);
      pocketShape.lineTo(-0.3, -0.03);
      pocketShape.quadraticCurveTo(-0.25, 0.03, -0.2, 0.13);
      pocketShape.closePath();
      const pocketGeometry = new THREE.ExtrudeGeometry(pocketShape, {
        depth: 0.025,
        bevelEnabled: true,
        bevelSize: 0.008,
        bevelThickness: 0.006,
        bevelSegments: 3,
      });
      const pocketPositions = pocketGeometry.attributes.position;
      for (let i = 0; i < pocketPositions.count; i += 1) {
        const x = pocketPositions.getX(i);
        const z = Math.sqrt(Math.max(0.16, 1 - (x * x) / 0.48 ** 2)) * 0.35;
        pocketPositions.setZ(i, z + pocketPositions.getZ(i) + 0.009);
      }
      pocketGeometry.computeVertexNormals();
      addMesh(group, pocketGeometry, bodyMaterial, [0, -0.29, 0]);

      // The cords sit above the print so their soft shadows cross the fabric and artwork.
      [-1, 1].forEach((side) => {
        const cordCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.072, 0.67, 0.26),
          new THREE.Vector3(side * 0.078, 0.48, 0.34),
          new THREE.Vector3(side * 0.082, 0.26, 0.36),
          new THREE.Vector3(side * 0.085, 0.045, 0.35),
        ]);
        const cord = addMesh(group, new THREE.TubeGeometry(cordCurve, 56, 0.012, 12, false), accentMaterial);
        cord.castShadow = true;
        const aglet = addMesh(
          group,
          new THREE.CylinderGeometry(0.009, 0.009, 0.04, 14),
          accentMaterial,
          [side * 0.085, 0.025, 0.35],
        );
        aglet.castShadow = true;
      });

      const artGeometry = createCurvedPatchGeometry(artWidth * 0.96, artHeight * 0.96, 0.1, 0.014);
      chestArtworkMesh = addMesh(group, artGeometry, createArtMaterial(), [artX, artY + 0.02, 0.35]);
      chestArtworkMesh.name = 'HoodieChestArtwork';
      chestArtworkMesh.renderOrder = 2;

      const surfaceAspect = product.surfaceProfile?.aspectRatio || (product.printArea.width * product.ratio) / product.printArea.height;
      const guideWidth = 768;
      guideCanvas = document.createElement('canvas');
      guideCanvas.width = guideWidth;
      guideCanvas.height = Math.max(1, Math.round(guideWidth / surfaceAspect));
      guideTexture = new THREE.CanvasTexture(guideCanvas);
      guideTexture.colorSpace = THREE.SRGBColorSpace;
      guideTexture.anisotropy = 4;
      const guideMaterial = new THREE.MeshPhysicalMaterial({
        map: guideTexture,
        transparent: true,
        alphaTest: 0.01,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        normalMap: fleeceNormal || undefined,
        normalScale: new THREE.Vector2(0.34, 0.34),
        roughness: 0.84,
        metalness: 0,
        sheen: 0.55,
        sheenRoughness: 0.8,
        sheenColor: new THREE.Color('#ffffff'),
      });
      guideMesh = addMesh(
        group,
        artGeometry.clone(),
        guideMaterial,
        [artX, artY + 0.02, 0.352],
      );
      guideMesh.name = 'Guías de edición';
      guideMesh.renderOrder = 4;
      guideMesh.visible = false;
    } else {
      addMesh(group, createSculptedGarmentGeometry(product.id), bodyMaterial);
      const collarRing = addMesh(group, new THREE.TorusGeometry(0.24, 0.036, 12, 32, Math.PI), accentMaterial, [0, 0.78, 0.04], [Math.PI * 0.92, 0, 0]);
      collarRing.scale.set(1.18, 0.7, 0.9);
    }

    if (product.id === 'polo') {
      const collar = new THREE.Shape();
      collar.moveTo(-0.28, 0.85);
      collar.lineTo(-0.08, 0.68);
      collar.lineTo(0, 0.52);
      collar.lineTo(0.08, 0.68);
      collar.lineTo(0.28, 0.85);
      collar.lineTo(0.14, 0.98);
      collar.lineTo(-0.14, 0.98);
      collar.closePath();
      addMesh(group, new THREE.ExtrudeGeometry(collar, { depth: 0.03, bevelEnabled: false }), accentMaterial, [0, 0, 0.15]);
    }

    if (!isHoodie) {
      const chestArtGeo = createCurvedPatchGeometry(artWidth * 0.96, artHeight * 0.96, 0.055 * (0.4 + warpFactor), 0.015);
      chestArtworkMesh = addMesh(group, chestArtGeo, createArtMaterial(), [artX, artY + 0.02, 0.242]);
      chestArtworkMesh.renderOrder = 2;
    }
  } else if (product.model === 'mug') {
    // Tall ceramic profile with a rounded lip and a clean inner wall.
    const points = [
      new THREE.Vector2(0.001, -0.47),
      new THREE.Vector2(0.33, -0.47),
      new THREE.Vector2(0.37, -0.455),
      new THREE.Vector2(0.397, -0.41),
      new THREE.Vector2(0.409, -0.35),
      new THREE.Vector2(0.41, 0.37),
      new THREE.Vector2(0.402, 0.43),
      new THREE.Vector2(0.39, 0.466),
      new THREE.Vector2(0.38, 0.475),
      new THREE.Vector2(0.372, 0.471),
      new THREE.Vector2(0.366, 0.451),
      new THREE.Vector2(0.364, 0.42),
    ];
    points.push(
      new THREE.Vector2(0.364, -0.31),
      new THREE.Vector2(0.35, -0.39),
      new THREE.Vector2(0.29, -0.42),
      new THREE.Vector2(0.001, -0.42),
    );
    const outerMug = new THREE.LatheGeometry(points, 128);
    addMesh(group, outerMug, bodyMaterial);

    // The inner cavity and handle stay porcelain white by default.
    const innerPoints = [
      new THREE.Vector2(0.364, 0.42),
      new THREE.Vector2(0.36, -0.32),
      new THREE.Vector2(0.34, -0.39),
      new THREE.Vector2(0.001, -0.42),
    ];
    addMesh(group, new THREE.LatheGeometry(innerPoints, 96), accentMaterial);

    // Sculpted ergonomic C-handle
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.39, 0.31, 0),
      new THREE.Vector3(0.52, 0.29, 0),
      new THREE.Vector3(0.68, 0.18, 0),
      new THREE.Vector3(0.72, 0.01, 0),
      new THREE.Vector3(0.68, -0.19, 0),
      new THREE.Vector3(0.52, -0.28, 0),
      new THREE.Vector3(0.39, -0.30, 0),
    ]);
    addMesh(group, new THREE.TubeGeometry(handleCurve, 64, 0.048, 24, false), accentMaterial);

    // The unwrapped 20:9 UV board follows the outer wall and leaves a blank seam arc.
    const wrapSettings = getMugWrapSettings(product, appearance.warpStrength);
    const artGeometry = createMugWrapGeometry(wrapSettings, 0.00025);
    const artMesh = addMesh(group, artGeometry, createArtMaterial(), [0, wrapSettings.centerY, 0]);
    artMesh.name = 'MugArtworkWrap';
    artMesh.renderOrder = 2;

    const guideWidth = 768;
    const surfaceAspect = wrapSettings.aspectRatio;
    guideCanvas = document.createElement('canvas');
    guideCanvas.width = guideWidth;
    guideCanvas.height = Math.max(1, Math.round(guideWidth / surfaceAspect));
    guideTexture = new THREE.CanvasTexture(guideCanvas);
    guideTexture.colorSpace = THREE.SRGBColorSpace;
    guideTexture.anisotropy = 4;
    const guideMaterial = new THREE.MeshBasicMaterial({
      map: guideTexture,
      transparent: true,
      alphaTest: 0.01,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    const guideGeometry = createMugWrapGeometry(wrapSettings, 0.0005);
    guideMesh = addMesh(group, guideGeometry, guideMaterial, [0, wrapSettings.centerY, 0]);
    guideMesh.name = 'Guías de impresión';
    guideMesh.renderOrder = 4;
    guideMesh.visible = false;
  } else if (product.model === 'bottle') {
    // Sleek insulated Tomatodo LatheGeometry
    const bottlePoints = [
      new THREE.Vector2(0.001, -0.84),
      new THREE.Vector2(0.29, -0.84),
      new THREE.Vector2(0.33, -0.8),
      new THREE.Vector2(0.34, -0.72),
      new THREE.Vector2(0.34, 0.22),
      new THREE.Vector2(0.31, 0.42),
      new THREE.Vector2(0.22, 0.56),
      new THREE.Vector2(0.185, 0.64),
      new THREE.Vector2(0.185, 0.69),
    ];
    addMesh(group, new THREE.LatheGeometry(bottlePoints, 64), bodyMaterial);

    // Metallic screw cap
    const capPoints = [
      new THREE.Vector2(0.195, 0.68),
      new THREE.Vector2(0.205, 0.71),
      new THREE.Vector2(0.205, 0.87),
      new THREE.Vector2(0.185, 0.91),
      new THREE.Vector2(0.001, 0.92),
    ];
    addMesh(group, new THREE.LatheGeometry(capPoints, 48), accentMaterial);
    // Subtle collar ring under cap
    addMesh(group, new THREE.TorusGeometry(0.19, 0.012, 10, 36), hardwareMaterial, [0, 0.675, 0], [Math.PI / 2, 0, 0]);

    // Product-specific unwrapped artboard drives the bottle's cylindrical UV area.
    const bottleArtAspect = product.surfaceProfile?.aspectRatio || 1.92;
    const bottleRadius = 0.346;
    const maxTheta = THREE.MathUtils.degToRad(product.surfaceProfile?.wrapAngleDegrees || 235);
    const maxHeight = 0.94 * (product.surfaceProfile?.verticalCoverage || 0.79);
    const bottleWrapHeight = Math.min(bottleRadius * maxTheta / bottleArtAspect, maxHeight);
    const thetaSpan = (bottleWrapHeight * bottleArtAspect) / bottleRadius;
    const artCyl = new THREE.CylinderGeometry(bottleRadius, bottleRadius, bottleWrapHeight, 64, 1, true, -thetaSpan / 2, thetaSpan);
    const artMesh = addMesh(group, artCyl, createArtMaterial(), [0, -0.25, 0]);
    artMesh.renderOrder = 2;
  } else if (product.model === 'cap') {
    // Sculpted dome crown
    const crownGeo = new THREE.SphereGeometry(0.6, 48, 28, 0, Math.PI * 2, 0, Math.PI * 0.52);
    crownGeo.scale(1.0, 0.92, 1.12);
    addMesh(group, crownGeo, bodyMaterial, [0, -0.04, -0.05]);
    // Top button
    addMesh(group, new THREE.SphereGeometry(0.055, 18, 12), accentMaterial, [0, 0.51, -0.05]);
    // Bottom sweatband rim
    const band = addMesh(group, new THREE.CylinderGeometry(0.6, 0.61, 0.08, 48, 1, true), accentMaterial, [0, -0.07, -0.05]);
    band.scale.set(1.0, 1, 1.12);

    // Curved visor/brim
    const brimGeo = new THREE.PlaneGeometry(0.92, 0.62, 24, 14);
    brimGeo.rotateX(-Math.PI / 2);
    const bPos = brimGeo.attributes.position;
    for (let i = 0; i < bPos.count; i += 1) {
      const x = bPos.getX(i);
      const z = bPos.getZ(i);
      // Taper width toward front tip & curve downward at left/right edges
      const frontT = (z + 0.31) / 0.62;
      const curvedX = x * (1 - frontT * frontT * 0.24);
      const archY = -0.14 * (curvedX * curvedX) - 0.05 * frontT;
      bPos.setX(i, curvedX);
      bPos.setY(i, archY);
    }
    bPos.needsUpdate = true;
    brimGeo.computeVertexNormals();
    addMesh(group, brimGeo, accentMaterial, [0, -0.05, 0.52]);

    // Spherically curved front cap artwork
    const capArtWidth = 0.62;
    const capArtHeight = capArtWidth / (product.surfaceProfile?.aspectRatio || (42 / 36));
    const capArtGeo = createCurvedPatchGeometry(capArtWidth, capArtHeight, 0.14 * (0.45 + warpFactor * 0.55), 0.07);
    const capArt = addMesh(group, capArtGeo, createArtMaterial(), [0, 0.16, 0.58], [-0.26, 0, 0]);
    capArt.renderOrder = 2;
  } else if (product.model === 'tote') {
    const bagGeo = new RoundedBoxGeometry(1.08, 1.24, 0.22, 5, 0.055);
    addMesh(group, bagGeo, bodyMaterial, [0, -0.12, 0]);
    // Top stitched hem band
    addMesh(group, new RoundedBoxGeometry(1.1, 0.08, 0.23, 3, 0.02), accentMaterial, [0, 0.47, 0]);

    // Two curved tote straps
    const frontStrap = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.26, 0.48, 0.08),
      new THREE.Vector3(-0.24, 0.88, 0.09),
      new THREE.Vector3(0, 0.98, 0.09),
      new THREE.Vector3(0.24, 0.88, 0.09),
      new THREE.Vector3(0.26, 0.48, 0.08),
    ]);
    const backStrap = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.26, 0.48, -0.08),
      new THREE.Vector3(-0.24, 0.88, -0.09),
      new THREE.Vector3(0, 0.98, -0.09),
      new THREE.Vector3(0.24, 0.88, -0.09),
      new THREE.Vector3(0.26, 0.48, -0.08),
    ]);
    addMesh(group, new THREE.TubeGeometry(frontStrap, 32, 0.026, 12, false), accentMaterial);
    addMesh(group, new THREE.TubeGeometry(backStrap, 32, 0.026, 12, false), accentMaterial);

    const toteArtWidth = 0.68;
    const toteArtHeight = toteArtWidth / (product.surfaceProfile?.aspectRatio || (52 / 38));
    const toteArt = addMesh(group, createCurvedPatchGeometry(toteArtWidth, toteArtHeight, 0.018), createArtMaterial(), [0, -0.11, 0.116]);
    toteArt.renderOrder = 2;
  } else if (product.model === 'rollup') {
    addMesh(group, new RoundedBoxGeometry(0.88, 1.72, 0.032, 2, 0.008), bodyMaterial, [0, 0.08, 0]);
    const artHeight = 1.66;
    const artWidth = artHeight * (product.surfaceProfile?.aspectRatio || (34 / 82));
    const artMesh = addMesh(group, new THREE.PlaneGeometry(artWidth, artHeight), createArtMaterial(), [0, 0.08, 0.022]);
    artMesh.renderOrder = 2;
    // Aluminum cassette base & swivel feet
    const cassette = addMesh(group, new THREE.CylinderGeometry(0.095, 0.11, 0.98, 28), accentMaterial, [0, -0.84, 0.01]);
    cassette.rotation.z = Math.PI / 2;
    addMesh(group, new RoundedBoxGeometry(0.08, 0.03, 0.46, 2, 0.01), hardwareMaterial, [-0.32, -0.94, 0.02]);
    addMesh(group, new RoundedBoxGeometry(0.08, 0.03, 0.46, 2, 0.01), hardwareMaterial, [0.32, -0.94, 0.02]);
    // Rear telescopic pole + top rail
    addBar(group, new THREE.Vector3(0, -0.8, -0.11), new THREE.Vector3(0, 0.96, -0.11), 0.015, hardwareMaterial);
    addBar(group, new THREE.Vector3(-0.44, 0.96, 0), new THREE.Vector3(0.44, 0.96, 0), 0.02, accentMaterial);
  } else if (product.model === 'banner-x') {
    addMesh(group, new RoundedBoxGeometry(0.86, 1.56, 0.024, 2, 0.006), bodyMaterial, [0, 0.04, 0.01]);
    const artHeight = 1.48;
    const artWidth = artHeight * (product.surfaceProfile?.aspectRatio || (32 / 82));
    const artMesh = addMesh(group, new THREE.PlaneGeometry(artWidth, artHeight), createArtMaterial(), [0, 0.04, 0.028]);
    artMesh.renderOrder = 2;
    // X-frame fiberglass rods & hub
    addBar(group, new THREE.Vector3(-0.44, 0.78, -0.05), new THREE.Vector3(0.48, -0.78, -0.22), 0.014, hardwareMaterial);
    addBar(group, new THREE.Vector3(0.44, 0.78, -0.05), new THREE.Vector3(-0.48, -0.78, -0.22), 0.014, hardwareMaterial);
    addBar(group, new THREE.Vector3(0, -0.04, -0.12), new THREE.Vector3(0, -0.82, -0.44), 0.016, accentMaterial);
    [[-0.39, 0.72], [0.39, 0.72], [-0.39, -0.66], [0.39, -0.66]].forEach(([x, y]) => {
      addMesh(group, new THREE.TorusGeometry(0.024, 0.006, 8, 16), hardwareMaterial, [x, y, 0.028]);
    });
  } else if (product.model === 'banner-a') {
    // True double-sided hinged A-frame stand
    const tilt = 0.21;
    const frontBoard = addMesh(group, new RoundedBoxGeometry(0.96, 1.22, 0.045, 3, 0.015), bodyMaterial, [0, 0.06, 0.16], [-tilt, 0, 0]);
    const artHeight = 1.12;
    const artWidth = artHeight * (product.surfaceProfile?.aspectRatio || (54 / 77));
    const frontArt = addMesh(group, new THREE.PlaneGeometry(artWidth, artHeight), createArtMaterial(), [0, 0.06, 0.188], [-tilt, 0, 0]);
    frontArt.renderOrder = 2;
    addMesh(group, new RoundedBoxGeometry(0.96, 1.22, 0.045, 3, 0.015), bodyMaterial, [0, 0.06, -0.16], [tilt, 0, 0]);
    // Aluminum frame legs
    addBar(group, new THREE.Vector3(-0.5, -0.66, 0.31), new THREE.Vector3(-0.5, 0.72, 0.02), 0.026, accentMaterial);
    addBar(group, new THREE.Vector3(0.5, -0.66, 0.31), new THREE.Vector3(0.5, 0.72, 0.02), 0.026, accentMaterial);
    addBar(group, new THREE.Vector3(-0.5, -0.66, -0.31), new THREE.Vector3(-0.5, 0.72, -0.02), 0.026, accentMaterial);
    addBar(group, new THREE.Vector3(0.5, -0.66, -0.31), new THREE.Vector3(0.5, 0.72, -0.02), 0.026, accentMaterial);
    addBar(group, new THREE.Vector3(-0.52, 0.72, 0), new THREE.Vector3(0.52, 0.72, 0), 0.028, hardwareMaterial);
    void frontBoard;
  } else if (product.model === 'sign') {
    const panelWidth = 1.38;
    const panelHeight = Math.min(1.65, panelWidth / ratio);
    const artHeight = panelHeight * 0.94;
    const artWidth = artHeight * (product.surfaceProfile?.aspectRatio || (54 / 82));
    addMesh(group, new RoundedBoxGeometry(panelWidth + 0.09, panelHeight + 0.09, 0.14, 4, 0.03), accentMaterial, [0, 0, -0.01]);
    addMesh(group, new RoundedBoxGeometry(panelWidth, panelHeight, 0.15, 3, 0.02), bodyMaterial, [0, 0, 0]);
    const artMesh = addMesh(
      group,
      new THREE.PlaneGeometry(artWidth, artHeight),
      createArtMaterial(),
      [0, 0, 0.082],
    );
    artMesh.renderOrder = 2;
    // Wall standoffs
    [[-panelWidth * 0.4, panelHeight * 0.4], [panelWidth * 0.4, panelHeight * 0.4], [-panelWidth * 0.4, -panelHeight * 0.4], [panelWidth * 0.4, -panelHeight * 0.4]].forEach(([x, y]) => {
      addMesh(group, new THREE.CylinderGeometry(0.028, 0.028, 0.12, 16), hardwareMaterial, [x, y, -0.11], [Math.PI / 2, 0, 0]);
    });
  } else {
    // Custom 2D photo board
    const panelWidth = 1.35;
    const panelHeight = Math.max(0.85, Math.min(1.65, panelWidth / ratio));
    addMesh(group, new RoundedBoxGeometry(panelWidth, panelHeight, 0.08, 4, 0.025), bodyMaterial, [0, 0, 0]);
    const printX = ((product.printArea.x + product.printArea.width / 2 - 50) / 100) * panelWidth;
    const printY = ((50 - product.printArea.y - product.printArea.height / 2) / 100) * panelHeight;
    const artMesh = addMesh(
      group,
      new THREE.PlaneGeometry(panelWidth * (product.printArea.width / 100), panelHeight * (product.printArea.height / 100)),
      createArtMaterial(),
      [printX, printY, 0.048],
    );
    artMesh.renderOrder = 2;
  }

  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  if (guideMesh) {
    guideMesh.castShadow = false;
    guideMesh.receiveShadow = false;
  }

  return { group, bodyMaterials, accentMaterials, artMaterials, chestArtworkMesh, guideMesh, guideCanvas, guideTexture };
}

function getBoundsInLocalSpace(object: THREE.Object3D, space: THREE.Object3D) {
  const worldBounds = new THREE.Box3().setFromObject(object);
  const localBounds = new THREE.Box3();
  for (const x of [worldBounds.min.x, worldBounds.max.x]) {
    for (const y of [worldBounds.min.y, worldBounds.max.y]) {
      for (const z of [worldBounds.min.z, worldBounds.max.z]) {
        localBounds.expandByPoint(space.worldToLocal(new THREE.Vector3(x, y, z)));
      }
    }
  }
  return localBounds;
}

function findHoodieFrontPanel(root: THREE.Object3D) {
  let namedPanel: THREE.Mesh | null = null;
  const candidates: Array<{ mesh: THREE.Mesh; score: number }> = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.name.toLowerCase() === 'pattern_135774') namedPanel = object;
    object.geometry.computeBoundingBox();
    const localBox = object.geometry.boundingBox;
    if (!localBox) return;
    const worldBox = localBox.clone().applyMatrix4(object.matrixWorld);
    const size = worldBox.getSize(new THREE.Vector3());
    const center = worldBox.getCenter(new THREE.Vector3());
    if (center.z <= 0.015 || Math.abs(center.x) > 0.35 || size.x < 0.48 || size.y < 0.55) return;
    candidates.push({ mesh: object, score: size.x * size.y + center.z * 0.01 });
  });
  if (namedPanel) return namedPanel;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.mesh ?? null;
}

function createConformingGarmentPatch(
  target: THREE.Mesh,
  wrapper: THREE.Group,
  product: ProductBase,
) {
  const bounds = getBoundsInLocalSpace(target, wrapper);
  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;
  const area = product.printArea;
  const xMin = bounds.min.x + width * (area.x / 100);
  const xMax = bounds.min.x + width * ((area.x + area.width) / 100);
  const yMax = bounds.max.y - height * (area.y / 100);
  const yMin = bounds.max.y - height * ((area.y + area.height) / 100);
  const columns = 40;
  const rows = 30;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const raycaster = new THREE.Raycaster();
  const direction = new THREE.Vector3(0, 0, -1);
  const normalMatrix = new THREE.Matrix3();
  const offset = 0.0028;

  wrapper.updateMatrixWorld(true);
  target.updateMatrixWorld(true);
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const y = yMin + (yMax - yMin) * v;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const x = xMin + (xMax - xMin) * u;
      const localOrigin = new THREE.Vector3(x, y, bounds.max.z + 1);
      const worldOrigin = wrapper.localToWorld(localOrigin);
      raycaster.set(worldOrigin, direction);
      const hit = raycaster.intersectObject(target, false)[0];
      let vertex: THREE.Vector3;
      if (hit?.face) {
        normalMatrix.getNormalMatrix(target.matrixWorld);
        const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
        vertex = wrapper.worldToLocal(hit.point.clone().addScaledVector(worldNormal, offset));
      } else {
        vertex = new THREE.Vector3(x, y, bounds.max.z + offset);
      }
      positions.push(vertex.x, vertex.y, vertex.z);
      uvs.push(u, v);
    }
  }

  const stride = columns + 1;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * stride + column;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createImportedHoodieBundle(
  root: THREE.Group,
  product: ProductBase,
  appearance: ProductAppearance,
  selectedLayer: DesignLayer | null,
  showPrintGuides: boolean,
): BuiltInModelBundle {
  root.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3().setFromObject(root);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  const scale = 1.85 / Math.max(sourceSize.x, sourceSize.y, sourceSize.z, 0.001);
  const wrapper = new THREE.Group();
  wrapper.add(root);
  wrapper.scale.setScalar(scale);
  wrapper.position.copy(sourceCenter).multiplyScalar(-scale);
  wrapper.updateMatrixWorld(true);

  const fabricMaterials: THREE.MeshStandardMaterial[] = [];
  const accentMaterials: THREE.MeshStandardMaterial[] = [];
  const seenMaterials = new Set<THREE.Material>();
  wrapper.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (seenMaterials.has(material) || !(material instanceof THREE.MeshStandardMaterial)) return;
      seenMaterials.add(material);
      const name = material.name.toLowerCase();
      if (name.includes('fabric') || name.includes('textile') || name.includes('cotton')) {
        // This asset's fabric base-color map is a UV checker; keep its normal/roughness maps for the knit folds.
        material.map = null;
        material.color.set(appearance.mode === 'custom' ? appearance.color : product.defaultColor);
        material.roughness = 0.88;
        material.metalness = 0;
        fabricMaterials.push(material);
      } else if (name === 'material.002' || name.includes('cord') || name.includes('string')) {
        material.color.set(appearance.mode === 'custom' ? appearance.accentColor : product.defaultAccentColor);
        material.roughness = 0.92;
        material.metalness = 0;
        accentMaterials.push(material);
      }
      material.needsUpdate = true;
    });
  });

  const frontPanel = findHoodieFrontPanel(wrapper);
  let chestArtworkMesh: THREE.Mesh | undefined;
  let guideMesh: THREE.Mesh | undefined;
  let guideCanvas: HTMLCanvasElement | undefined;
  let guideTexture: THREE.CanvasTexture | undefined;
  const artMaterials: THREE.MeshStandardMaterial[] = [];

  if (frontPanel) {
    const patchGeometry = createConformingGarmentPatch(frontPanel, wrapper, product);
    const artMaterial = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      transparent: true,
      alphaTest: 0.01,
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 0.88,
      metalness: 0,
      sheen: 0.65,
      sheenRoughness: 0.75,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    artMaterials.push(artMaterial);
    chestArtworkMesh = new THREE.Mesh(patchGeometry, artMaterial);
    chestArtworkMesh.name = 'HoodieChestArtwork';
    chestArtworkMesh.renderOrder = 2;
    wrapper.add(chestArtworkMesh);

    const surfaceAspect = product.surfaceProfile?.aspectRatio || (product.printArea.width * product.ratio) / product.printArea.height;
    guideCanvas = document.createElement('canvas');
    guideCanvas.width = 768;
    guideCanvas.height = Math.max(1, Math.round(guideCanvas.width / surfaceAspect));
    drawGarmentGuideCanvas(guideCanvas, product, selectedLayer, showPrintGuides);
    guideTexture = new THREE.CanvasTexture(guideCanvas);
    guideTexture.colorSpace = THREE.SRGBColorSpace;
    guideTexture.anisotropy = 4;
    const guideMaterial = new THREE.MeshPhysicalMaterial({
      map: guideTexture,
      transparent: true,
      alphaTest: 0.01,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      roughness: 0.84,
      metalness: 0,
      sheen: 0.55,
      sheenRoughness: 0.8,
    });
    guideMesh = new THREE.Mesh(patchGeometry.clone(), guideMaterial);
    guideMesh.name = 'Guías de edición';
    guideMesh.renderOrder = 4;
    guideMesh.visible = showPrintGuides;
    guideMesh.castShadow = false;
    guideMesh.receiveShadow = false;
    wrapper.add(guideMesh);
  }

  return {
    group: wrapper,
    bodyMaterials: fabricMaterials,
    accentMaterials,
    artMaterials,
    chestArtworkMesh,
    guideMesh,
    guideCanvas,
    guideTexture,
  };
}

function disposeObject3D(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      geometries.add(obj.geometry);
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        materials.add(mat);
        Object.values(mat).forEach((value) => {
          if (value instanceof THREE.Texture) textures.add(value);
        });
      });
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

async function loadCustom3DObject(url: string, format: Custom3DModelState['format']): Promise<THREE.Group> {
  if (format === 'glb' || format === 'gltf') {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    return gltf.scene;
  }
  if (format === 'obj') {
    const loader = new OBJLoader();
    const obj = await loader.loadAsync(url);
    return obj;
  }
  const loader = new STLLoader();
  const geometry = await loader.loadAsync(url);
  geometry.computeVertexNormals();
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: '#e6e8ef', roughness: 0.45, metalness: 0.1 }),
  );
  mesh.name = 'Objeto STL';
  group.add(mesh);
  return group;
}

function normalizeCustomModel(root: THREE.Group) {
  // Bake root bounds so model centers cleanly at (0,0,0) and fits ~1.85 world units
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const scale = 1.85 / maxDim;

  const wrapper = new THREE.Group();
  root.position.sub(center);
  root.scale.multiplyScalar(scale);
  root.position.multiplyScalar(scale);
  wrapper.add(root);
  wrapper.updateMatrixWorld(true);

  const meshNames: string[] = [];
  let bestEditableName = '';
  let largestMeshName = '';
  let largestVolume = -1;
  let meshCounter = 1;

  wrapper.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (!obj.geometry.attributes.normal) {
      obj.geometry.computeVertexNormals();
    }
    if (!obj.name || !obj.name.trim()) {
      obj.name = `Parte_${meshCounter}`;
    }
    // Ensure unique names
    if (meshNames.includes(obj.name)) {
      obj.name = `${obj.name}_${meshCounter}`;
    }
    meshCounter += 1;
    meshNames.push(obj.name);

    obj.castShadow = true;
    obj.receiveShadow = true;

    // Ensure MeshStandardMaterial for consistent PBR lighting & recoloring
    if (!obj.material) {
      obj.material = new THREE.MeshStandardMaterial({ color: '#e6e8ef', roughness: 0.5, metalness: 0.08 });
    } else if (!Array.isArray(obj.material) && !(obj.material instanceof THREE.MeshStandardMaterial)) {
      const legacyColor = 'color' in obj.material && obj.material.color instanceof THREE.Color
        ? obj.material.color.clone()
        : new THREE.Color('#e6e8ef');
      obj.material = new THREE.MeshStandardMaterial({ color: legacyColor, roughness: 0.5, metalness: 0.08 });
    }

    // Store original material color & map in userData for clean toggling
    const firstMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (firstMat instanceof THREE.MeshStandardMaterial) {
      obj.userData.origColor = firstMat.color.getHex();
      obj.userData.origRoughness = firstMat.roughness;
      obj.userData.origMetalness = firstMat.metalness;
      obj.userData.origMap = firstMat.map || null;
      const matName = `${obj.name} ${firstMat.name || ''}`.toLowerCase();
      if (!bestEditableName && /(\.editable|print|artwork|label|logo|screen|front|design)/.test(matName)) {
        bestEditableName = obj.name;
      }
    }

    obj.geometry.computeBoundingBox();
    const bb = obj.geometry.boundingBox;
    if (bb) {
      const sz = new THREE.Vector3();
      bb.getSize(sz);
      const vol = Math.max(0.0001, sz.x) * Math.max(0.0001, sz.y) * Math.max(0.0001, sz.z);
      if (vol > largestVolume) {
        largestVolume = vol;
        largestMeshName = obj.name;
      }
    }
  });

  return {
    wrapper,
    meshNames,
    suggestedTarget: bestEditableName || largestMeshName || meshNames[0] || '',
  };
}

function getCameraCoords(preset: CameraPreset3D, distance: number): [number, number, number] {
  if (preset === 'three-quarter-left') return [-distance * 0.56, distance * 0.2, distance * 0.82];
  if (preset === 'three-quarter-right') return [distance * 0.56, distance * 0.2, distance * 0.82];
  if (preset === 'back') return [0, distance * 0.08, -distance];
  if (preset === 'top') return [0, distance * 0.88, distance * 0.48];
  return [0, distance * 0.06, distance];
}

export const ThreeDProductPreview = forwardRef<ThreeDPreviewHandle, ThreeDProductPreviewProps>(function ThreeDProductPreview(
  {
    product,
    artworkUrl,
    frontalMockupUrl,
    selectedLayer,
    showPrintGuides,
    appearance,
    background,
    customModel,
    compact = false,
    onDetectedMeshes,
    onPlaceDecal,
    onTogglePlacementMode,
    onExport3D,
    onMoveLayer,
    onExportModel,
    exportingModel = false,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRootRef = useRef<THREE.Group | null>(null);
  const builtInBundleRef = useRef<BuiltInModelBundle | null>(null);
  const customWrapperRef = useRef<THREE.Group | null>(null);
  const decalMeshRef = useRef<THREE.Mesh | null>(null);
  const bgTextureRef = useRef<THREE.Texture | null>(null);
  const artTextureRef = useRef<THREE.Texture | null>(null);
  const frontalTextureRef = useRef<THREE.Texture | null>(null);
  const frontalMockupMeshRef = useRef<THREE.Mesh | null>(null);
  const glbExportingRef = useRef(false);
  const floorRef = useRef<THREE.Mesh | null>(null);
  const targetCameraPosRef = useRef<THREE.Vector3 | null>(null);
  const baseDistanceRef = useRef(4.1);
  const autoRotateRef = useRef(false);
  const placementModeRef = useRef(false);
  const onPlaceDecalRef = useRef(onPlaceDecal);
  const onDetectedMeshesRef = useRef(onDetectedMeshes);
  const customModelRef = useRef(customModel);
  const selectedLayerRef = useRef(selectedLayer);
  const onMoveLayerRef = useRef(onMoveLayer);
  const productRef = useRef(product);
  const appearanceRef = useRef(appearance);
  const showPrintGuidesRef = useRef(showPrintGuides);
  const shadowKeyLightRef = useRef<THREE.DirectionalLight | null>(null);

  const [error, setError] = useState('');
  const [loadingCustom, setLoadingCustom] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [sceneAspect, setSceneAspect] = useState(1);

  onPlaceDecalRef.current = onPlaceDecal;
  onDetectedMeshesRef.current = onDetectedMeshes;
  customModelRef.current = customModel;
  selectedLayerRef.current = selectedLayer;
  onMoveLayerRef.current = onMoveLayer;
  productRef.current = product;
  appearanceRef.current = appearance;
  showPrintGuidesRef.current = showPrintGuides;
  placementModeRef.current = Boolean(customModel?.placementMode);
  autoRotateRef.current = autoRotate;

  useImperativeHandle(ref, () => ({
    async capturePng(transparentBackdrop = false) {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const floor = floorRef.current;
      if (!renderer || !scene || !camera) return null;

      const prevBg = scene.background;
      const prevFloorVis = floor ? floor.visible : false;
      const prevSize = new THREE.Vector2();
      renderer.getSize(prevSize);
      const prevPixelRatio = renderer.getPixelRatio();

      try {
        const exportW = 1600;
        const aspect = Math.max(0.5, prevSize.x / Math.max(1, prevSize.y));
        const exportH = Math.max(800, Math.round(exportW / aspect));

        renderer.setPixelRatio(1);
        renderer.setSize(exportW, exportH, false);
        camera.aspect = exportW / exportH;
        camera.updateProjectionMatrix();

        if (transparentBackdrop) {
          scene.background = null;
          if (floor) floor.visible = false;
          renderer.setClearColor(0x000000, 0);
        }

        renderer.render(scene, camera);

        const outCanvas = document.createElement('canvas');
        outCanvas.width = exportW;
        outCanvas.height = exportH;
        const outCtx = outCanvas.getContext('2d');
        if (!outCtx) return null;
        outCtx.drawImage(renderer.domElement, 0, 0);
        return outCanvas;
      } finally {
        scene.background = prevBg;
        if (floor) floor.visible = prevFloorVis;
        renderer.setPixelRatio(prevPixelRatio);
        renderer.setSize(prevSize.x, prevSize.y, false);
        camera.aspect = prevSize.x / Math.max(1, prevSize.y);
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
      }
    },
    async exportGlb() {
      const bundle = builtInBundleRef.current;
      if (!bundle) return false;
      const guideMesh = bundle.guideMesh;
      const previousGuideVisibility = guideMesh?.visible ?? false;
      const artMesh = bundle.chestArtworkMesh;
      const previousArtMeshVisibility = artMesh?.visible ?? true;
      const previousBodyColorWrite = bundle.bodyMaterials.map((material) => material.colorWrite);
      const previousAccentColorWrite = bundle.accentMaterials.map((material) => material.colorWrite);
      const previousArtMaterialVisibility = bundle.artMaterials.map((material) => material.visible);

      try {
        glbExportingRef.current = true;
        if (guideMesh) guideMesh.visible = false;
        if (artMesh) artMesh.visible = true;
        bundle.bodyMaterials.forEach((material) => { material.colorWrite = true; material.needsUpdate = true; });
        bundle.accentMaterials.forEach((material) => { material.colorWrite = true; material.needsUpdate = true; });
        bundle.artMaterials.forEach((material) => { material.visible = true; material.needsUpdate = true; });
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        const exporter = new GLTFExporter();
        const output = await new Promise<ArrayBuffer>((resolve, reject) => {
          exporter.parse(
            bundle.group,
            (result) => {
              if (result instanceof ArrayBuffer) resolve(result);
              else reject(new Error('El exportador no devolvió un archivo GLB binario.'));
            },
            reject,
            { binary: true },
          );
        });
        const blob = new Blob([output], { type: 'model/gltf-binary' });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = 'visualcorp-' + productRef.current.id + '.glb';
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        return true;
      } catch {
        return false;
      } finally {
        if (guideMesh) guideMesh.visible = previousGuideVisibility;
        if (artMesh) artMesh.visible = previousArtMeshVisibility;
        bundle.bodyMaterials.forEach((material, index) => {
          material.colorWrite = previousBodyColorWrite[index];
          material.needsUpdate = true;
        });
        bundle.accentMaterials.forEach((material, index) => {
          material.colorWrite = previousAccentColorWrite[index];
          material.needsUpdate = true;
        });
        bundle.artMaterials.forEach((material, index) => {
          material.visible = previousArtMaterialVisibility[index];
          material.needsUpdate = true;
        });
        glbExportingRef.current = false;
      }
    },
  }));

  // 1. Initialize Three.js Studio Scene, PBR RoomEnvironment, Lights & OrbitControls once
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setError('Este navegador no pudo iniciar WebGL. Puedes seguir editando y exportando en 2D.');
      return undefined;
    }

    setError('');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Studio softbox PBR environment
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
    camera.position.set(0, 0.22, 4.1);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 1.8;
    controls.maxDistance = 8.5;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = Math.PI - 0.25;
    controls.autoRotateSpeed = 1.8;
    controlsRef.current = controls;

    // 3-point studio lighting
    scene.add(new THREE.HemisphereLight('#ffffff', '#6d738a', 0.85));
    const keyLight = new THREE.DirectionalLight('#ffffff', 1.8);
    keyLight.position.set(-2.6, 4.2, 4.4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.006;
    keyLight.shadow.camera.left = -1.8;
    keyLight.shadow.camera.right = 1.8;
    keyLight.shadow.camera.top = 1.8;
    keyLight.shadow.camera.bottom = -1.8;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 12;
    keyLight.shadow.camera.updateProjectionMatrix();
    shadowKeyLightRef.current = keyLight;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#d8e6ff', 0.72);
    fillLight.position.set(3.4, 1.0, 2.6);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight('#ffd8ef', 0.55);
    rimLight.position.set(0.4, 2.8, -4.0);
    scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.55, 64),
      new THREE.ShadowMaterial({ opacity: product.id === 'sudadera' ? 0.12 : 0.2 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.06;
    floor.receiveShadow = true;
    scene.add(floor);
    floorRef.current = floor;

    const modelRoot = new THREE.Group();
    scene.add(modelRoot);
    modelRootRef.current = modelRoot;

    // Raycast click-to-place for custom 3D decals
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pointerDownPos = { x: 0, y: 0 };
    let draggingLayer = false;
    let dragPointerId = -1;
    let dragMesh: THREE.Mesh | null = null;
    let dragUsesProductUv = false;
    const updatePointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
    };
    const onPointerDown = (event: PointerEvent) => {
      pointerDownPos.x = event.clientX;
      pointerDownPos.y = event.clientY;
      const layer = selectedLayerRef.current;
      const artworkMesh = builtInBundleRef.current?.chestArtworkMesh;
      if (layer && !layer.locked && artworkMesh && !customModelRef.current?.placementMode) {
        updatePointer(event);
        const frontPhoto = frontalMockupMeshRef.current?.visible ? frontalMockupMeshRef.current : null;
        const targetMesh = frontPhoto || artworkMesh;
        const hits = raycaster.intersectObject(targetMesh, false);
        if (hits.length > 0 && hits[0].uv) {
          const area = productRef.current.printArea;
          const x = frontPhoto ? hits[0].uv.x * 100 : 50;
          const y = frontPhoto ? (1 - hits[0].uv.y) * 100 : 50;
          const isOnPrintArea = !frontPhoto || (
            x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height
          );
          if (isOnPrintArea) {
            draggingLayer = true;
            dragPointerId = event.pointerId;
            dragMesh = targetMesh;
            dragUsesProductUv = Boolean(frontPhoto);
            controls.enabled = false;
            renderer.domElement.setPointerCapture(event.pointerId);
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        }
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!draggingLayer || event.pointerId !== dragPointerId) return;
      const layer = selectedLayerRef.current;
      const hitMesh = dragMesh;
      const onMove = onMoveLayerRef.current;
      if (!layer || layer.locked || !hitMesh || !onMove) return;
      updatePointer(event);
      const hits = raycaster.intersectObject(hitMesh, false);
      if (hits.length === 0 || !hits[0].uv) return;
      const area = productRef.current.printArea;
      const pointX = hits[0].uv.x;
      const pointY = 1 - hits[0].uv.y;
      const localX = dragUsesProductUv ? (pointX * 100 - area.x) / area.width : pointX;
      const localY = dragUsesProductUv ? (pointY * 100 - area.y) / area.height : pointY;
      const paddingX = Math.min(layer.size / 2, area.width * 0.45);
      const paddingY = Math.min(layer.size * 0.35, area.height * 0.45);
      const x = area.x + localX * area.width;
      const y = area.y + localY * area.height;
      onMove(
        layer.id,
        THREE.MathUtils.clamp(x, area.x + paddingX, area.x + area.width - paddingX),
        THREE.MathUtils.clamp(y, area.y + paddingY, area.y + area.height - paddingY),
      );
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onPointerUp = (event: PointerEvent) => {
      if (draggingLayer && (dragPointerId === -1 || event.pointerId === dragPointerId)) {
        draggingLayer = false;
        dragPointerId = -1;
        dragMesh = null;
        dragUsesProductUv = false;
        controls.enabled = true;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (!placementModeRef.current || !customWrapperRef.current || !onPlaceDecalRef.current) return;
      const dist = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y);
      if (dist > 6) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const targetName = customModelRef.current?.targetMeshName;
      const meshes: THREE.Object3D[] = [];
      customWrapperRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh && (!targetName || obj.name === targetName)) {
          meshes.push(obj);
        }
      });
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0 && hits[0].face) {
        const hit = hits[0];
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
        const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
        onPlaceDecalRef.current(
          [hit.point.x, hit.point.y, hit.point.z],
          [worldNormal.x, worldNormal.y, worldNormal.z],
        );
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown, true);
    renderer.domElement.addEventListener('pointermove', onPointerMove, true);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      const width = Math.max(1, Math.floor(bounds.width));
      const height = Math.max(1, Math.floor(bounds.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const nextAspect = width / height;
      setSceneAspect((current) => Math.abs(current - nextAspect) < 0.01 ? current : nextAspect);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let rafId = 0;
    const tick = () => {
      rafId = window.requestAnimationFrame(tick);
      if (targetCameraPosRef.current) {
        camera.position.lerp(targetCameraPosRef.current, 0.14);
        if (camera.position.distanceTo(targetCameraPosRef.current) < 0.02) {
          camera.position.copy(targetCameraPosRef.current);
          targetCameraPosRef.current = null;
        }
      }
      controls.autoRotate = autoRotateRef.current;
      controls.update();
      if (productRef.current.id === 'sudadera' && !glbExportingRef.current) {
        const horizontalDistance = Math.hypot(camera.position.x, camera.position.z);
        const frontPhotoVisible = Boolean(
          frontalMockupMeshRef.current &&
          camera.position.z > 0 &&
          Math.abs(camera.position.x) < horizontalDistance * 0.2 &&
          Math.abs(camera.position.y) < camera.position.distanceTo(controls.target) * 0.2,
        );
        if (frontalMockupMeshRef.current) frontalMockupMeshRef.current.visible = frontPhotoVisible;
        const bundle = builtInBundleRef.current;
        bundle?.bodyMaterials.forEach((material) => {
          const nextColorWrite = !frontPhotoVisible;
          if (material.colorWrite !== nextColorWrite) {
            material.colorWrite = nextColorWrite;
            material.needsUpdate = true;
          }
        });
        bundle?.accentMaterials.forEach((material) => {
          const nextColorWrite = !frontPhotoVisible;
          if (material.colorWrite !== nextColorWrite) {
            material.colorWrite = nextColorWrite;
            material.needsUpdate = true;
          }
        });
        bundle?.artMaterials.forEach((material) => {
          const nextVisible = !frontPhotoVisible;
          if (material.visible !== nextVisible) {
            material.visible = nextVisible;
            material.needsUpdate = true;
          }
        });
        const artMesh = bundle?.chestArtworkMesh;
        if (artMesh && artMesh.visible !== !frontPhotoVisible) artMesh.visible = !frontPhotoVisible;
      }
      renderer.render(scene, camera);
    };
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown, true);
      renderer.domElement.removeEventListener('pointermove', onPointerMove, true);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      controls.dispose();
      envTarget.dispose();
      bgTextureRef.current?.dispose();
      bgTextureRef.current = null;
      artTextureRef.current?.dispose();
      artTextureRef.current = null;
      frontalTextureRef.current?.dispose();
      frontalTextureRef.current = null;
      frontalMockupMeshRef.current = null;
      if (decalMeshRef.current) {
        decalMeshRef.current.geometry.dispose();
        (decalMeshRef.current.material as THREE.Material).dispose();
        decalMeshRef.current = null;
      }
      disposeObject3D(modelRoot);
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      modelRootRef.current = null;
      builtInBundleRef.current = null;
      customWrapperRef.current = null;
      floorRef.current = null;
      shadowKeyLightRef.current = null;
    };
  }, []);

  // 2. Sync Studio Scene Background
  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer) return undefined;

    let cancelled = false;
    const applyBg = async () => {
      if (background.kind === 'transparent') {
        bgTextureRef.current?.dispose();
        bgTextureRef.current = null;
        scene.background = null;
        renderer.setClearColor(0x000000, 0);
        return;
      }

      if (background.kind === 'solid') {
        bgTextureRef.current?.dispose();
        bgTextureRef.current = null;
        scene.background = new THREE.Color(background.color);
        return;
      }

      const aspect = Math.min(3, Math.max(0.35, sceneAspect));
      const bgCanvas = document.createElement('canvas');
      bgCanvas.width = aspect >= 1 ? 1024 : Math.max(1, Math.round(1024 * aspect));
      bgCanvas.height = aspect >= 1 ? Math.max(1, Math.round(1024 / aspect)) : 1024;
      const ctx = bgCanvas.getContext('2d');
      if (!ctx) return;

      let bgImg: HTMLImageElement | null = null;
      if (background.kind === 'image' && background.imageSrc) {
        try {
          bgImg = await loadCanvasImage(background.imageSrc);
        } catch {
          bgImg = null;
        }
      }
      if (cancelled) return;

      drawSceneBackground(ctx, bgCanvas.width, bgCanvas.height, background, bgImg, false);
      const texture = new THREE.CanvasTexture(bgCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      bgTextureRef.current?.dispose();
      bgTextureRef.current = texture;
      scene.background = texture;
    };

    applyBg();
    return () => { cancelled = true; };
  }, [background, sceneAspect]);

  // 3. Build Built-In Product Model OR Load Custom 3D Model (.glb / .obj / .stl)
  useEffect(() => {
    const modelRoot = modelRootRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!modelRoot || !camera || !controls) return undefined;

    let cancelled = false;
    if (floorRef.current) floorRef.current.position.y = -1.06;

    // Clear previous model & decal
    if (decalMeshRef.current) {
      modelRoot.remove(decalMeshRef.current);
      decalMeshRef.current.geometry.dispose();
      (decalMeshRef.current.material as THREE.Material).dispose();
      decalMeshRef.current = null;
    }
    while (modelRoot.children.length > 0) {
      const child = modelRoot.children[0];
      modelRoot.remove(child);
      disposeObject3D(child);
    }
    builtInBundleRef.current = null;
    customWrapperRef.current = null;

    if (product.isCustom3D && customModel) {
      setLoadingCustom(true);
      setError('');
      loadCustom3DObject(customModel.url, customModel.format)
        .then((loaded) => {
          if (cancelled) {
            disposeObject3D(loaded);
            return;
          }
          const { wrapper, meshNames, suggestedTarget } = normalizeCustomModel(loaded);
          modelRoot.add(wrapper);
          customWrapperRef.current = wrapper;
          baseDistanceRef.current = 3.85;
          camera.position.set(0, 0.25, 3.85);
          controls.target.set(0, 0, 0);
          controls.update();
          onDetectedMeshesRef.current?.(meshNames, suggestedTarget);
          setLoadingCustom(false);
        })
        .catch(() => {
          if (!cancelled) {
            setLoadingCustom(false);
            setError('No se pudo cargar este archivo 3D. Verifica que sea un GLB, OBJ o STL válido.');
          }
        });
      return () => { cancelled = true; };
    }

    setLoadingCustom(false);
    setError('');

    if (product.id === 'sudadera' && !product.isCustom3D) {
      setLoadingCustom(true);
      const installHoodieBundle = (bundle: BuiltInModelBundle) => {
        modelRoot.add(bundle.group);
        builtInBundleRef.current = bundle;
        if (artTextureRef.current) {
          bundle.artMaterials.forEach((material) => {
            material.map = artTextureRef.current;
            material.needsUpdate = true;
          });
        }
        if (bundle.guideCanvas && bundle.guideTexture && bundle.guideMesh) {
          drawGarmentGuideCanvas(bundle.guideCanvas, productRef.current, selectedLayerRef.current, showPrintGuidesRef.current);
          bundle.guideTexture.needsUpdate = true;
          bundle.guideMesh.visible = showPrintGuidesRef.current;
        }
        const bounds = new THREE.Box3().setFromObject(bundle.group);
        const size = bounds.getSize(new THREE.Vector3());
        if (floorRef.current && !bounds.isEmpty()) floorRef.current.position.y = bounds.min.y - 0.008;
        const dist = Math.max(3.35, Math.max(size.x * 1.95, size.y * 2.35));
        baseDistanceRef.current = dist;
        camera.position.set(0, 0.03, dist);
        controls.target.set(0, 0, 0);
        controls.update();
      };

      new GLTFLoader().loadAsync(BUILT_IN_HOODIE_MODEL_URL)
        .then((gltf) => {
          if (cancelled) {
            disposeObject3D(gltf.scene);
            return;
          }
          const bundle = createImportedHoodieBundle(
            gltf.scene,
            productRef.current,
            appearanceRef.current,
            selectedLayerRef.current,
            showPrintGuidesRef.current,
          );
          installHoodieBundle(bundle);
          setLoadingCustom(false);
        })
        .catch(() => {
          if (cancelled) return;
          const fallback = createBuiltInProductModel(productRef.current, appearanceRef.current);
          installHoodieBundle(fallback);
          setLoadingCustom(false);
          setError('No se pudo cargar el modelo original del buzo; se muestra una vista de referencia.');
        });
      return () => { cancelled = true; };
    }

    const bundle = createBuiltInProductModel(product, appearance);
    modelRoot.add(bundle.group);
    builtInBundleRef.current = bundle;

    if (product.model === 'mug' && floorRef.current) {
      const modelBounds = new THREE.Box3().setFromObject(bundle.group);
      if (!modelBounds.isEmpty()) floorRef.current.position.y = modelBounds.min.y - 0.008;
    }

    const worldHeight = product.model === 'rollup' || product.model === 'banner-x'
      ? 2.25
      : product.model === 'bottle'
        ? 2.0
        : Math.max(1.85, Math.min(2.6, 1.55 / Math.max(0.55, product.ratio)));
    const dist = Math.max(3.4, worldHeight * 1.95);
    baseDistanceRef.current = dist;
    camera.position.set(0, dist * 0.025, dist);
    controls.target.set(0, 0, 0);
    controls.update();

    return undefined;
  }, [
    product.id,
    product.model,
    product.ratio,
    product.isCustom3D,
    product.printArea.x,
    product.printArea.y,
    product.printArea.width,
    product.printArea.height,
    appearance.warpStrength,
    customModel?.url,
    customModel?.format,
  ]);

  // Keep the cyan print-area frame and magenta layer gizmo attached to the hoodie surface.
  useEffect(() => {
    const bundle = builtInBundleRef.current;
    if (!bundle?.guideCanvas || !bundle.guideTexture || !bundle.guideMesh) return;
    if (product.id === 'sudadera') {
      drawGarmentGuideCanvas(bundle.guideCanvas, product, selectedLayer, showPrintGuides);
    } else {
      drawSurfaceGuideCanvas(bundle.guideCanvas, product, selectedLayer, showPrintGuides);
    }
    bundle.guideTexture.needsUpdate = true;
    bundle.guideMesh.visible = showPrintGuides;
  }, [product, selectedLayer, showPrintGuides, artworkUrl]);

  // A photorealistic frontal render sits over the matching 3D form for the straight-on studio view.
  useEffect(() => {
    const modelRoot = modelRootRef.current;
    if (!modelRoot || product.isCustom3D || product.id === 'sudadera' || !frontalMockupUrl || product.model === 'mug') return undefined;

    let active = true;
    let mockupMesh: THREE.Mesh | null = null;
    let mockupTexture: THREE.Texture | null = null;
    const loader = new THREE.TextureLoader();
    const texture = loader.load(frontalMockupUrl, (loadedTexture) => {
      if (!active) {
        loadedTexture.dispose();
        return;
      }

      loadedTexture.colorSpace = THREE.SRGBColorSpace;
      loadedTexture.anisotropy = rendererRef.current?.capabilities.getMaxAnisotropy() ?? 4;
      loadedTexture.needsUpdate = true;
      const frame = getFrontalMockupFrame(product);
      const material = new THREE.MeshBasicMaterial({
        map: loadedTexture,
        transparent: true,
        alphaTest: 0.015,
        depthWrite: false,
        side: THREE.FrontSide,
        toneMapped: false,
      });
      mockupMesh = new THREE.Mesh(new THREE.PlaneGeometry(frame.width, frame.height), material);
      mockupMesh.position.set(0, 0, frame.z);
      mockupMesh.renderOrder = 3;
      modelRoot.add(mockupMesh);
      mockupTexture = loadedTexture;
      frontalTextureRef.current = loadedTexture;
      frontalMockupMeshRef.current = mockupMesh;
    });

    return () => {
      active = false;
      if (mockupMesh) {
        modelRoot.remove(mockupMesh);
        mockupMesh.geometry.dispose();
        (mockupMesh.material as THREE.Material).dispose();
        mockupMesh = null;
      }
      mockupTexture?.dispose();
      if (frontalTextureRef.current === texture) frontalTextureRef.current = null;
      frontalMockupMeshRef.current = null;
    };
  }, [frontalMockupUrl, product.id, product.model, product.isCustom3D]);

  // 4. Live-update Product Color & Material Finish without rebuilding the geometry
  useEffect(() => {
    const finish = getFinishParams(appearance.finish);
    const bundle = builtInBundleRef.current;
    if (bundle) {
      const nextBodyColor = appearance.mode === 'custom' ? appearance.color : product.defaultColor;
      const nextAccentColor = appearance.mode === 'custom' ? appearance.accentColor : product.defaultAccentColor;
      bundle.bodyMaterials.forEach((mat) => {
        mat.color.set(nextBodyColor);
        mat.roughness = product.id === 'sudadera' ? 0.88 : finish.roughness;
        mat.metalness = product.id === 'sudadera' ? 0 : finish.metalness;
        mat.envMapIntensity = finish.envMapIntensity;
        mat.needsUpdate = true;
      });
      bundle.accentMaterials.forEach((mat) => {
        mat.color.set(nextAccentColor);
        if (product.id === 'sudadera') {
          mat.roughness = 0.92;
          mat.metalness = 0;
        }
        mat.needsUpdate = true;
      });
      bundle.artMaterials.forEach((mat) => {
        mat.roughness = product.id === 'sudadera' ? 0.88 : Math.min(0.92, finish.roughness + 0.08);
        if (product.id === 'sudadera') mat.metalness = 0;
        mat.needsUpdate = true;
      });
    }

    const customWrapper = customWrapperRef.current;
    if (customWrapper) {
      customWrapper.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mat) => {
          if (!(mat instanceof THREE.MeshStandardMaterial)) return;
          if (appearance.mode === 'custom') {
            mat.color.set(appearance.color);
            mat.roughness = finish.roughness;
            mat.metalness = finish.metalness;
            mat.envMapIntensity = finish.envMapIntensity;
          } else if (typeof obj.userData.origColor === 'number') {
            mat.color.setHex(obj.userData.origColor);
            mat.roughness = obj.userData.origRoughness ?? 0.5;
            mat.metalness = obj.userData.origMetalness ?? 0.1;
          }
          mat.needsUpdate = true;
        });
      });
    }
  }, [
    appearance.mode,
    appearance.color,
    appearance.accentColor,
    appearance.finish,
    product.defaultColor,
    product.defaultAccentColor,
    product.id,
    loadingCustom,
  ]);

  // 5. Apply Artwork Texture to Built-In Models OR Project Decal / UV Map onto Custom 3D Models
  useEffect(() => {
    if (!artworkUrl) return undefined;
    let active = true;
    const loader = new THREE.TextureLoader();

    const applyArtwork = (loadedTexture: THREE.Texture) => {
      if (!active) {
        loadedTexture.dispose();
        return;
      }
      loadedTexture.colorSpace = THREE.SRGBColorSpace;
      loadedTexture.anisotropy = rendererRef.current?.capabilities.getMaxAnisotropy() ?? 4;
      artTextureRef.current?.dispose();
      artTextureRef.current = loadedTexture;

      // Built-in product models
      const bundle = builtInBundleRef.current;
      if (bundle) {
        bundle.artMaterials.forEach((mat) => {
          mat.map = loadedTexture;
          mat.needsUpdate = true;
        });
        return;
      }

      // Custom uploaded 3D model
      const wrapper = customWrapperRef.current;
      const modelRoot = modelRootRef.current;
      if (!wrapper || !modelRoot || !customModel) return;

      // Clean old decal
      if (decalMeshRef.current) {
        modelRoot.remove(decalMeshRef.current);
        decalMeshRef.current.geometry.dispose();
        (decalMeshRef.current.material as THREE.Material).dispose();
        decalMeshRef.current = null;
      }

      // Restore UV maps on all meshes before applying mode
      let targetMesh: THREE.Mesh | null = null;
      wrapper.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const firstMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        if (firstMat instanceof THREE.MeshStandardMaterial) {
          firstMat.map = obj.userData.origMap || null;
          firstMat.needsUpdate = true;
        }
        if (obj.name === customModel.targetMeshName || !targetMesh) {
          if (obj.name === customModel.targetMeshName) targetMesh = obj;
          else if (!targetMesh) targetMesh = obj;
        }
      });

      if (!targetMesh) return;
      const meshTarget: THREE.Mesh = targetMesh;

      if (customModel.projectionMode === 'uv') {
        const uvTexture = loadedTexture.clone();
        uvTexture.colorSpace = THREE.SRGBColorSpace;
        uvTexture.flipY = customModel.format === 'obj' || customModel.format === 'stl';
        uvTexture.needsUpdate = true;
        const mat = Array.isArray(meshTarget.material) ? meshTarget.material[0] : meshTarget.material;
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.map = uvTexture;
          mat.needsUpdate = true;
        }
        return;
      }

      // DecalGeometry projection conforming to curved custom mesh!
      wrapper.updateMatrixWorld(true);
      let point: THREE.Vector3;
      let normal: THREE.Vector3;

      if (customModel.decalPoint && customModel.decalNormal) {
        point = new THREE.Vector3(...customModel.decalPoint);
        normal = new THREE.Vector3(...customModel.decalNormal).normalize();
      } else {
        const raycaster = new THREE.Raycaster();
        const origin = new THREE.Vector3(customModel.decalOffsetX * 0.8, customModel.decalOffsetY * 0.8, 3.2);
        raycaster.set(origin, new THREE.Vector3(0, 0, -1));
        const hits = raycaster.intersectObject(meshTarget, false);
        if (hits.length > 0 && hits[0].face) {
          point = hits[0].point.clone();
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(meshTarget.matrixWorld);
          normal = hits[0].face.normal.clone().applyMatrix3(normalMatrix).normalize();
        } else {
          const box = new THREE.Box3().setFromObject(meshTarget);
          const center = new THREE.Vector3();
          box.getCenter(center);
          point = new THREE.Vector3(center.x + customModel.decalOffsetX * 0.5, center.y + customModel.decalOffsetY * 0.5, box.max.z);
          normal = new THREE.Vector3(0, 0, 1);
        }
      }

      const dummy = new THREE.Object3D();
      dummy.position.copy(point);
      dummy.lookAt(point.clone().add(normal));
      dummy.rotateZ((customModel.decalRotation * Math.PI) / 180);

      const scaleFactor = Math.max(0.18, customModel.decalScale / 100) * 1.45;
      const texImg = loadedTexture.image as { width?: number; height?: number } | undefined;
      const artAspect = texImg?.width && texImg?.height
        ? texImg.width / Math.max(1, texImg.height)
        : 1;
      const decalSize = new THREE.Vector3(
        scaleFactor,
        scaleFactor / Math.max(0.35, Math.min(2.8, artAspect)),
        Math.max(0.25, customModel.decalDepth),
      );

      try {
        const decalGeo = new DecalGeometry(meshTarget, point, dummy.rotation, decalSize);
        const decalMat = new THREE.MeshStandardMaterial({
          map: loadedTexture,
          transparent: true,
          alphaTest: 0.01,
          depthTest: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          roughness: Math.min(0.92, getFinishParams(appearance.finish).roughness + 0.06),
        });
        const decalMesh = new THREE.Mesh(decalGeo, decalMat);
        decalMesh.renderOrder = 3;
        modelRoot.add(decalMesh);
        decalMeshRef.current = decalMesh;
      } catch {
        // Ignore projection failure if geometry has degenerate triangles
      }
    };

    const texture = loader.load(artworkUrl, applyArtwork);
    return () => {
      active = false;
      if (artTextureRef.current !== texture) texture.dispose();
    };
  }, [
    artworkUrl,
    product.id,
    loadingCustom,
    appearance.finish,
    customModel?.projectionMode,
    customModel?.targetMeshName,
    customModel?.decalScale,
    customModel?.decalRotation,
    customModel?.decalOffsetX,
    customModel?.decalOffsetY,
    customModel?.decalDepth,
    customModel?.decalPoint?.[0],
    customModel?.decalPoint?.[1],
    customModel?.decalPoint?.[2],
    customModel?.decalNormal?.[0],
    customModel?.decalNormal?.[1],
    customModel?.decalNormal?.[2],
  ]);

  const setCameraPreset = (preset: CameraPreset3D) => {
    const [x, y, z] = getCameraCoords(preset, baseDistanceRef.current);
    targetCameraPosRef.current = new THREE.Vector3(x, y, z);
    controlsRef.current?.target.set(0, 0, 0);
  };

  const nudgeOrbit = (deltaYaw: number) => {
    const camera = cameraRef.current;
    if (!camera) return;
    targetCameraPosRef.current = null;
    const pos = camera.position.clone();
    pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), deltaYaw);
    camera.position.copy(pos);
    controlsRef.current?.update();
  };

  const bgPreviewClass = background.kind === 'transparent' ? ' is-transparent-grid' : '';

  return (
    <div className={`vc-product-3d-panel${compact ? ' is-compact' : ''}`}>
      <div className="vc-product-3d-meta">
        <span className="vc-tool-label">
          {product.isCustom3D ? `Estudio 3D · ${product.name}` : `Estudio 3D · ${product.name}`}
        </span>
        <span>
          {customModel?.placementMode
            ? 'Haz clic sobre el modelo para fijar el diseño'
            : product.model === 'apparel' && selectedLayer && !selectedLayer.locked
              ? 'Arrastra sobre el pecho para mover la capa · fuera del estampado para girar'
            : 'Arrastra para girar · rueda o pellizco para zoom'}
        </span>
      </div>

      <div
        ref={hostRef}
        className={`vc-product-3d-host${bgPreviewClass}${customModel?.placementMode ? ' is-placing' : ''}`}
        role="img"
        aria-label={`Vista 3D interactiva de ${product.name}. Arrastra para rotar y usa la rueda para acercar.`}
      >
        {loadingCustom && <p className="vc-product-3d-error" role="status">Cargando modelo 3D…</p>}
        {error && <p className="vc-product-3d-error" role="status">{error}</p>}
      </div>

      <div className="vc-product-3d-toolbar">
        <div className="vc-product-3d-controls" role="group" aria-label="Ángulos rápidos de cámara">
          <button type="button" className="vc-product-3d-chip" onClick={() => setCameraPreset('front')}>Frontal</button>
          <button type="button" className="vc-product-3d-chip" onClick={() => setCameraPreset('three-quarter-left')}>3/4 Izq</button>
          <button type="button" className="vc-product-3d-chip" onClick={() => setCameraPreset('three-quarter-right')}>3/4 Der</button>
          <button type="button" className="vc-product-3d-chip" onClick={() => setCameraPreset('back')}>Trasera</button>
          <button type="button" className="vc-product-3d-chip" onClick={() => setCameraPreset('top')}>Superior</button>
        </div>

        <div className="vc-product-3d-controls" role="group" aria-label="Acciones de escena 3D">
          <button type="button" className="vc-product-3d-chip" aria-label="Girar izquierda" onClick={() => nudgeOrbit(-0.38)}><RotateCcw size={14} aria-hidden="true" /></button>
          <button type="button" className="vc-product-3d-chip" aria-label="Girar derecha" onClick={() => nudgeOrbit(0.38)}><RotateCw size={14} aria-hidden="true" /></button>
          <button
            type="button"
            className={`vc-product-3d-chip${autoRotate ? ' is-active' : ''}`}
            aria-pressed={autoRotate}
            onClick={() => setAutoRotate((v) => !v)}
          >
            {autoRotate ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
            {autoRotate ? 'Pausar giro' : 'Auto-girar'}
          </button>
          {product.isCustom3D && customModel?.projectionMode === 'decal' && onTogglePlacementMode && (
            <button
              type="button"
              className={`vc-product-3d-chip${customModel.placementMode ? ' is-active' : ''}`}
              aria-pressed={customModel.placementMode}
              onClick={onTogglePlacementMode}
            >
              <Crosshair size={13} aria-hidden="true" />
              {customModel.placementMode ? 'Colocando…' : 'Colocar con clic'}
            </button>
          )}
          {onExport3D && (
            <button type="button" className="vc-product-3d-chip is-accent" onClick={() => onExport3D(false)}>
              <Camera size={13} aria-hidden="true" /> Captura 3D PNG
            </button>
          )}
          {onExportModel && !product.isCustom3D && (
            <button
              type="button"
              className="vc-product-3d-chip is-accent"
              onClick={onExportModel}
              disabled={exportingModel}
            >
              <Download size={13} aria-hidden="true" />
              {exportingModel ? 'Exportando GLB…' : 'Exportar modelo GLB'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
