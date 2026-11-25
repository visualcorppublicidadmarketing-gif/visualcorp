export type ProductModelKind =
  | 'apparel'
  | 'mug'
  | 'bottle'
  | 'cap'
  | 'tote'
  | 'sign'
  | 'rollup'
  | 'banner-x'
  | 'banner-a'
  | 'custom'
  | 'custom-3d';

export type SurfaceWarpMode = 'flat' | 'cylinder' | 'dome' | 'perspective';

export type ProductFinish = 'matte' | 'satin' | 'glossy' | 'metallic';

export type LayerBlendMode = 'normal' | 'multiply' | 'screen';

export type LayerClipShape = 'none' | 'rounded' | 'circle' | 'pill';

export type LayerKind =
  | 'image'
  | 'text'
  | 'rectangle'
  | 'circle'
  | 'triangle'
  | 'star'
  | 'badge'
  | 'line';

export type PrintArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ProductBase = {
  id: string;
  name: string;
  family: string;
  image: string;
  quoteProduct: string;
  ratio: number;
  model: ProductModelKind;
  printArea: PrintArea;
  defaultX: number;
  defaultY: number;
  defaultSize: number;
  defaultColor: string;
  defaultAccentColor: string;
  defaultFinish: ProductFinish;
  defaultWarp: SurfaceWarpMode;
  defaultWarpStrength: number;
  hint: string;
  isCustom?: boolean;
  isCustom3D?: boolean;
};

export type ProductAppearance = {
  mode: 'original' | 'custom';
  color: string;
  accentColor: string;
  finish: ProductFinish;
  warpMode: SurfaceWarpMode;
  warpStrength: number;
};

export type SceneBackgroundKind =
  | 'studio-dark'
  | 'studio-light'
  | 'gradient'
  | 'solid'
  | 'transparent'
  | 'image';

export type SceneBackground = {
  kind: SceneBackgroundKind;
  color: string;
  color2: string;
  angle: number;
  imageSrc?: string;
  imageName?: string;
};

export type Custom3DProjectionMode = 'decal' | 'uv';

export type Custom3DModelFormat = 'glb' | 'gltf' | 'obj' | 'stl';

export type Custom3DModelState = {
  url: string;
  fileName: string;
  format: Custom3DModelFormat;
  projectionMode: Custom3DProjectionMode;
  targetMeshName: string;
  detectedMeshes: string[];
  decalScale: number;
  decalRotation: number;
  decalOffsetX: number;
  decalOffsetY: number;
  decalDepth: number;
  decalPoint: [number, number, number] | null;
  decalNormal: [number, number, number] | null;
  placementMode: boolean;
};

export type DesignLayer = {
  id: string;
  kind: LayerKind;
  name: string;
  src?: string;
  text?: string;
  x: number;
  y: number;
  size: number;
  scaleY?: number;
  rotation: number;
  opacity: number;
  color: string;
  strokeColor?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  fontFamily: string;
  fontWeight?: 'normal' | 'bold';
  letterSpacing?: number;
  textShadow?: boolean;
  textCurve?: number;
  blendMode?: LayerBlendMode;
  clipShape?: LayerClipShape;
  flipX?: boolean;
  flipY?: boolean;
  visible: boolean;
  locked: boolean;
};

export type CameraPreset3D = 'front' | 'three-quarter-left' | 'three-quarter-right' | 'back' | 'top';
