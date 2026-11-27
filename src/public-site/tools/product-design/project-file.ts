import { DEFAULT_SCENE_BACKGROUND, getDefaultAppearance, PRODUCT_BASES } from './products';
import type {
  DesignLayer,
  LayerBlendMode,
  LayerClipShape,
  LayerKind,
  PrintArea,
  ProductAppearance,
  ProductBase,
  ProductFinish,
  SceneBackground,
  SceneBackgroundKind,
  SurfaceWarpMode,
} from './types';

export const DESIGN_FONT_OPTIONS = [
  'DM Sans',
  'Impact',
  'Georgia',
  'Arial',
  'Trebuchet MS',
  'Courier New',
] as const;

export const MAX_PROJECT_FILE_BYTES = 32 * 1024 * 1024;

const MAX_PROJECT_ASSET_BYTES = 12 * 1024 * 1024;
const MAX_PROJECT_TOTAL_ASSET_BYTES = 22 * 1024 * 1024;
const MAX_PROJECT_ASSETS = 24;
const MAX_PROJECT_LAYERS = 80;
const MAX_PROJECT_IMAGE_PIXELS = 24_000_000;
const MAX_PROJECT_TOTAL_IMAGE_PIXELS = 48_000_000;
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const VALID_LAYER_KINDS: LayerKind[] = ['image', 'text', 'rectangle', 'circle', 'triangle', 'star', 'badge', 'line'];
const VALID_FINISHES: ProductFinish[] = ['matte', 'satin', 'glossy', 'metallic'];
const VALID_WARPS: SurfaceWarpMode[] = ['flat', 'cylinder', 'dome', 'perspective'];
const VALID_BG_KINDS: SceneBackgroundKind[] = ['studio-dark', 'studio-light', 'gradient', 'solid', 'transparent', 'image'];
const VALID_BLENDS: LayerBlendMode[] = ['normal', 'multiply', 'screen'];
const VALID_CLIPS: LayerClipShape[] = ['none', 'rounded', 'circle', 'pill'];

const PROJECT_FORMAT = 'visualcorp-product-design';
const PROJECT_VERSION = 2;

type ProjectAsset = { id: string; dataUrl: string };

type ProjectLayer = Omit<DesignLayer, 'src'> & { assetId?: string };

type ProjectBackground = Omit<SceneBackground, 'imageSrc'> & { imageAssetId?: string };

type ProjectFile = {
  format: typeof PROJECT_FORMAT;
  version: 1 | 2;
  product: {
    id: string;
    printArea: PrintArea;
    customName?: string;
    customImageAssetId?: string;
  };
  appearance?: ProductAppearance;
  background?: ProjectBackground;
  assets: ProjectAsset[];
  layers: ProjectLayer[];
};

export type RestoredDesignProject = {
  product: ProductBase;
  layers: DesignLayer[];
  appearance: ProductAppearance;
  background: SceneBackground;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(message);
}

function assertFiniteNumber(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    return fail(`El proyecto tiene un valor no válido en ${label}.`);
  }
  return value;
}

function assertHexColor(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
    return fail(`El proyecto contiene un color no válido en ${label}.`);
  }
  return value;
}

function normalizePrintArea(value: unknown): PrintArea {
  if (!isRecord(value)) return fail('El proyecto no contiene una zona imprimible válida.');
  const area = {
    x: assertFiniteNumber(value.x, 'la zona imprimible', 0, 100),
    y: assertFiniteNumber(value.y, 'la zona imprimible', 0, 100),
    width: assertFiniteNumber(value.width, 'la zona imprimible', 10, 100),
    height: assertFiniteNumber(value.height, 'la zona imprimible', 10, 100),
  };
  if (area.x + area.width > 100 || area.y + area.height > 100) {
    return fail('La zona imprimible sale de los límites del producto.');
  }
  return area;
}

const LEGACY_DEFAULT_MUG_PRINT_AREA: PrintArea = { x: 14, y: 21, width: 48, height: 56 };

function isLegacyDefaultMugPrintArea(area: PrintArea) {
  return area.x === LEGACY_DEFAULT_MUG_PRINT_AREA.x
    && area.y === LEGACY_DEFAULT_MUG_PRINT_AREA.y
    && area.width === LEGACY_DEFAULT_MUG_PRINT_AREA.width
    && area.height === LEGACY_DEFAULT_MUG_PRINT_AREA.height;
}

function dataUrlByteLength(value: unknown) {
  if (typeof value !== 'string') return fail('El proyecto contiene una imagen no válida.');
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return fail('Solo se admiten imágenes PNG, JPG o WebP dentro del proyecto.');
  const payload = match[2];
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  const byteLength = Math.floor((payload.length * 3) / 4) - padding;
  if (byteLength < 1 || byteLength > MAX_PROJECT_ASSET_BYTES) {
    return fail('Cada imagen del proyecto debe pesar como máximo 12 MB.');
  }
  try {
    if (btoa(atob(payload)) !== payload) return fail('El proyecto contiene una imagen codificada de forma incorrecta.');
  } catch {
    return fail('El proyecto contiene una imagen codificada de forma incorrecta.');
  }
  return byteLength;
}

function readImageDimensions(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('El proyecto contiene una imagen que no se puede abrir.'));
    image.src = src;
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('No se pudo preparar una imagen del proyecto.')));
    reader.onerror = () => reject(new Error('No se pudo leer una imagen del proyecto.'));
    reader.readAsDataURL(blob);
  });
}

async function readImageSource(src: string) {
  if (src.startsWith('data:')) {
    dataUrlByteLength(src);
    const response = await fetch(src);
    if (!response.ok) return fail('No se pudo leer una imagen del proyecto.');
    return response.blob();
  }
  if (src.startsWith('blob:') || (src.startsWith('/') && !src.startsWith('//') && !/[?#\\]/.test(src))) {
    const response = await fetch(src, { credentials: 'same-origin' });
    if (!response.ok) return fail('No se pudo leer una imagen del proyecto.');
    return response.blob();
  }
  return fail('El proyecto incluye una ruta de imagen no admitida.');
}

export async function serializeDesignProject(
  product: ProductBase,
  layers: DesignLayer[],
  appearance?: ProductAppearance,
  background?: SceneBackground,
) {
  if (layers.length > MAX_PROJECT_LAYERS) return fail(`Un proyecto puede incluir hasta ${MAX_PROJECT_LAYERS} capas.`);

  const assets: ProjectAsset[] = [];
  const assetIds = new Map<string, string>();
  let totalAssetBytes = 0;

  const addAsset = async (src: string) => {
    const knownId = assetIds.get(src);
    if (knownId) return knownId;
    if (assets.length >= MAX_PROJECT_ASSETS) return fail(`Un proyecto puede incluir hasta ${MAX_PROJECT_ASSETS} imágenes distintas.`);
    const blob = await readImageSource(src);
    if (!SUPPORTED_IMAGE_TYPES.has(blob.type)) return fail('El proyecto contiene una imagen que no es PNG, JPG o WebP.');
    if (blob.size > MAX_PROJECT_ASSET_BYTES || totalAssetBytes + blob.size > MAX_PROJECT_TOTAL_ASSET_BYTES) {
      return fail('Las imágenes del proyecto superan el límite conjunto de 22 MB.');
    }
    const dataUrl = await blobToDataUrl(blob);
    dataUrlByteLength(dataUrl);
    totalAssetBytes += blob.size;
    const id = `asset-${assets.length + 1}`;
    assets.push({ id, dataUrl });
    assetIds.set(src, id);
    return id;
  };

  const customImageAssetId = product.isCustom && !product.isCustom3D && product.image ? await addAsset(product.image) : undefined;
  let savedBackground: ProjectBackground | undefined;
  if (background) {
    const { imageSrc, ...bgProps } = background;
    const bgAssetId = background.kind === 'image' && imageSrc ? await addAsset(imageSrc) : undefined;
    savedBackground = { ...bgProps, ...(bgAssetId ? { imageAssetId: bgAssetId } : {}) };
  }

  const savedLayers: ProjectLayer[] = [];
  for (const layer of layers) {
    const { src, ...properties } = layer;
    const assetId = layer.kind === 'image'
      ? src ? await addAsset(src) : fail(`La capa “${layer.name}” no tiene una imagen válida.`)
      : undefined;
    savedLayers.push({ ...properties, ...(assetId ? { assetId } : {}) });
  }

  const project: ProjectFile = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    product: {
      id: product.isCustom3D ? PRODUCT_BASES[0].id : product.isCustom ? 'custom' : product.id,
      printArea: product.printArea,
      ...(product.isCustom && !product.isCustom3D ? { customName: product.name, customImageAssetId } : {}),
    },
    ...(appearance ? { appearance } : {}),
    ...(savedBackground ? { background: savedBackground } : {}),
    assets,
    layers: savedLayers,
  };
  const contents = JSON.stringify(project, null, 2);
  if (new Blob([contents]).size > MAX_PROJECT_FILE_BYTES) return fail('El archivo de proyecto supera el límite de 32 MB.');
  return contents;
}

export async function restoreDesignProject(contents: string): Promise<RestoredDesignProject> {
  if (new Blob([contents]).size > MAX_PROJECT_FILE_BYTES) return fail('El archivo de proyecto supera el límite de 32 MB.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return fail('No se pudo leer el proyecto. Comprueba que el archivo JSON esté completo.');
  }
  if (!isRecord(parsed) || parsed.format !== PROJECT_FORMAT || (parsed.version !== 1 && parsed.version !== 2)) {
    return fail('El archivo no es un proyecto compatible del Estudio de Diseño.');
  }
  if (!isRecord(parsed.product) || !Array.isArray(parsed.assets) || !Array.isArray(parsed.layers)) {
    return fail('El proyecto está incompleto o tiene una estructura no válida.');
  }
  if (parsed.assets.length > MAX_PROJECT_ASSETS || parsed.layers.length > MAX_PROJECT_LAYERS) {
    return fail(`El proyecto supera el límite de ${MAX_PROJECT_ASSETS} imágenes o ${MAX_PROJECT_LAYERS} capas.`);
  }

  const assets = new Map<string, string>();
  const assetDimensions = new Map<string, { width: number; height: number }>();
  let totalAssetBytes = 0;
  for (const value of parsed.assets) {
    if (!isRecord(value) || typeof value.id !== 'string' || !/^asset-[1-9]\d*$/.test(value.id) || assets.has(value.id)) {
      return fail('El proyecto contiene referencias de imagen no válidas.');
    }
    const bytes = dataUrlByteLength(value.dataUrl);
    totalAssetBytes += bytes;
    if (totalAssetBytes > MAX_PROJECT_TOTAL_ASSET_BYTES) return fail('Las imágenes del proyecto superan el límite conjunto de 22 MB.');
    assets.set(value.id, value.dataUrl as string);
  }

  let totalImagePixels = 0;
  for (const [id, dataUrl] of assets) {
    let dimensions: { width: number; height: number };
    try {
      dimensions = await readImageDimensions(dataUrl);
    } catch {
      return fail('El proyecto contiene una imagen que no se puede abrir.');
    }
    const pixels = dimensions.width * dimensions.height;
    if (!dimensions.width || !dimensions.height || dimensions.width > 12_000 || dimensions.height > 12_000 || pixels > MAX_PROJECT_IMAGE_PIXELS) {
      return fail('Una imagen del proyecto supera el tamaño de imagen admitido.');
    }
    totalImagePixels += pixels;
    if (totalImagePixels > MAX_PROJECT_TOTAL_IMAGE_PIXELS) return fail('Las imágenes del proyecto son demasiado grandes para abrirlas juntas.');
    assetDimensions.set(id, dimensions);
  }

  const productInput = parsed.product;
  const printArea = normalizePrintArea(productInput.printArea);
  let product: ProductBase;
  if (productInput.id === 'custom') {
    if (typeof productInput.customName !== 'string' || !productInput.customName.trim() || productInput.customName.length > 34 || typeof productInput.customImageAssetId !== 'string') {
      return fail('La base de producto propia no es válida.');
    }
    const image = assets.get(productInput.customImageAssetId);
    if (!image) return fail('El proyecto no incluye la foto de su producto.');
    const dimensions = assetDimensions.get(productInput.customImageAssetId);
    if (!dimensions) return fail('No se pudieron validar las dimensiones de la foto del producto.');
    const template = PRODUCT_BASES[0];
    product = {
      ...template,
      id: 'custom-project',
      name: productInput.customName.trim(),
      family: 'Producto propio',
      image,
      quoteProduct: '',
      ratio: dimensions.width / dimensions.height,
      model: 'custom',
      printArea,
      defaultX: 50,
      defaultY: 50,
      defaultSize: 24,
      defaultWarp: 'flat',
      defaultWarpStrength: 0,
      hint: 'Ajusta la zona imprimible para tu foto',
      isCustom: true,
    };
  } else {
    const base = PRODUCT_BASES.find((candidate) => candidate.id === productInput.id);
    if (!base) return fail('El proyecto hace referencia a una base de producto desconocida.');
    // Upgrade only the old built-in mug area; preserve any print area the user adjusted.
    const restoredPrintArea = productInput.id === 'taza' && isLegacyDefaultMugPrintArea(printArea)
      ? base.printArea
      : printArea;
    product = { ...base, printArea: restoredPrintArea };
  }

  let appearance = getDefaultAppearance(product);
  if (isRecord(parsed.appearance)) {
    const a = parsed.appearance;
    appearance = {
      mode: a.mode === 'custom' ? 'custom' : 'original',
      color: typeof a.color === 'string' ? assertHexColor(a.color, 'el color del producto') : appearance.color,
      accentColor: typeof a.accentColor === 'string' ? assertHexColor(a.accentColor, 'el color secundario') : appearance.accentColor,
      finish: typeof a.finish === 'string' && VALID_FINISHES.includes(a.finish as ProductFinish) ? (a.finish as ProductFinish) : appearance.finish,
      warpMode: typeof a.warpMode === 'string' && VALID_WARPS.includes(a.warpMode as SurfaceWarpMode) ? (a.warpMode as SurfaceWarpMode) : appearance.warpMode,
      warpStrength: typeof a.warpStrength === 'number' ? assertFiniteNumber(a.warpStrength, 'la curvatura', 0, 100) : appearance.warpStrength,
    };
  }

  let background: SceneBackground = { ...DEFAULT_SCENE_BACKGROUND };
  if (isRecord(parsed.background)) {
    const b = parsed.background;
    const bgKind = typeof b.kind === 'string' && VALID_BG_KINDS.includes(b.kind as SceneBackgroundKind)
      ? (b.kind as SceneBackgroundKind)
      : 'studio-light';
    const imageSrc = bgKind === 'image' && typeof b.imageAssetId === 'string' ? assets.get(b.imageAssetId) : undefined;
    background = {
      kind: bgKind === 'image' && !imageSrc ? 'studio-light' : bgKind,
      color: typeof b.color === 'string' ? assertHexColor(b.color, 'el color de fondo') : background.color,
      color2: typeof b.color2 === 'string' ? assertHexColor(b.color2, 'el segundo color de fondo') : background.color2,
      angle: typeof b.angle === 'number' ? assertFiniteNumber(b.angle, 'el ángulo de fondo', 0, 360) : 135,
      ...(imageSrc ? { imageSrc } : {}),
      ...(typeof b.imageName === 'string' ? { imageName: b.imageName.slice(0, 70) } : {}),
    };
  }

  const layerIds = new Set<string>();
  const layers: DesignLayer[] = [];
  for (const value of parsed.layers) {
    if (!isRecord(value) || typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 100 || layerIds.has(value.id)) {
      return fail('El proyecto contiene capas con identificadores no válidos.');
    }
    if (typeof value.kind !== 'string' || !VALID_LAYER_KINDS.includes(value.kind as LayerKind)) {
      return fail('El proyecto contiene un tipo de capa no admitido.');
    }
    if (typeof value.name !== 'string' || value.name.length > 70) return fail('El proyecto contiene una capa con nombre no válido.');
    const color = assertHexColor(value.color, 'una capa');
    const fontFamily = typeof value.fontFamily === 'string' && DESIGN_FONT_OPTIONS.includes(value.fontFamily as typeof DESIGN_FONT_OPTIONS[number])
      ? value.fontFamily
      : 'DM Sans';
    if (typeof value.visible !== 'boolean' || typeof value.locked !== 'boolean') {
      return fail('El proyecto contiene opciones de capa no válidas.');
    }

    let src: string | undefined;
    if (value.kind === 'image') {
      if (typeof value.assetId !== 'string' || !assets.has(value.assetId)) return fail('Una capa de imagen no está incluida en el archivo.');
      src = assets.get(value.assetId);
    } else if (value.assetId !== undefined) {
      return fail('Una capa de diseño incluye una referencia de imagen inesperada.');
    }

    const text = value.text;
    if (value.kind === 'text' && (typeof text !== 'string' || text.length > 180)) return fail('El proyecto contiene un texto no válido.');
    layerIds.add(value.id);
    layers.push({
      id: value.id,
      kind: value.kind as LayerKind,
      name: value.name,
      ...(src ? { src } : {}),
      ...(typeof text === 'string' ? { text } : {}),
      x: assertFiniteNumber(value.x, 'la posición de una capa', 0, 100),
      y: assertFiniteNumber(value.y, 'la posición de una capa', 0, 100),
      size: assertFiniteNumber(value.size, 'el tamaño de una capa', 0, 100),
      scaleX: typeof value.scaleX === 'number' ? assertFiniteNumber(value.scaleX, 'la proporción horizontal', 0.2, 3) : 1,
      scaleY: typeof value.scaleY === 'number' ? assertFiniteNumber(value.scaleY, 'la proporción vertical', 0.2, 3) : 1,
      ...(typeof value.imageAspect === 'number' ? { imageAspect: assertFiniteNumber(value.imageAspect, 'la proporción de imagen', 0.1, 10) } : {}),
      rotation: assertFiniteNumber(value.rotation, 'la rotación de una capa', -360, 360),
      opacity: assertFiniteNumber(value.opacity, 'la opacidad de una capa', 0, 100),
      color,
      strokeColor: typeof value.strokeColor === 'string' ? assertHexColor(value.strokeColor, 'el borde de una capa') : '#000000',
      strokeWidth: typeof value.strokeWidth === 'number' ? assertFiniteNumber(value.strokeWidth, 'el grosor de borde', 0, 20) : 0,
      cornerRadius: typeof value.cornerRadius === 'number' ? assertFiniteNumber(value.cornerRadius, 'el redondeo', 0, 80) : 10,
      fontFamily,
      fontWeight: value.fontWeight === 'normal' ? 'normal' : 'bold',
      letterSpacing: typeof value.letterSpacing === 'number' ? assertFiniteNumber(value.letterSpacing, 'el espaciado', -4, 24) : 0,
      textShadow: Boolean(value.textShadow),
      textCurve: typeof value.textCurve === 'number' ? assertFiniteNumber(value.textCurve, 'la curvatura de texto', -100, 100) : 0,
      blendMode: typeof value.blendMode === 'string' && VALID_BLENDS.includes(value.blendMode as LayerBlendMode) ? (value.blendMode as LayerBlendMode) : 'normal',
      clipShape: typeof value.clipShape === 'string' && VALID_CLIPS.includes(value.clipShape as LayerClipShape) ? (value.clipShape as LayerClipShape) : 'none',
      flipX: Boolean(value.flipX),
      flipY: Boolean(value.flipY),
      visible: value.visible,
      locked: value.locked,
    });
  }

  return { product, layers, appearance, background };
}

export function designProjectFilename(productName: string) {
  const slug = productName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'diseno';
  return `visualcorp-${slug}.vcdesign.json`;
}
