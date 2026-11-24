import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Link } from 'react-router-dom';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  ArrowUpRight,
  Box,
  Camera,
  ChevronDown,
  ChevronUp,
  Circle,
  Columns2,
  Copy,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  Grid2x2,
  ImagePlus,
  Layers,
  Lock,
  Maximize2,
  Minus,
  Palette,
  RectangleHorizontal,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Triangle,
  Type,
  Undo2,
  Unlock,
  Upload,
  Wand2,
} from 'lucide-react';
import { createArtworkCanvas, createMockupCanvas, downloadCanvas } from './product-design/canvas-utils';
import {
  createStarterPresetLayers,
  DEFAULT_PRODUCT_ID,
  DEFAULT_SCENE_BACKGROUND,
  getDefaultAppearance,
  getDefaultLogoLayer,
  PRODUCT_BASES,
  PRODUCT_COLOR_SWATCHES,
  SCENE_BACKGROUND_PRESETS,
} from './product-design/products';
import {
  DESIGN_FONT_OPTIONS,
  designProjectFilename,
  MAX_PROJECT_FILE_BYTES,
  restoreDesignProject,
  serializeDesignProject,
} from './product-design/project-file';
import type { ThreeDPreviewHandle } from './product-design/ThreeDProductPreview';
import type {
  Custom3DModelFormat,
  Custom3DModelState,
  DesignLayer,
  LayerBlendMode,
  LayerClipShape,
  LayerKind,
  PrintArea,
  ProductAppearance,
  ProductBase,
  ProductFinish,
  SceneBackground,
  SurfaceWarpMode,
} from './product-design/types';
import './creative-tools.css';
import './product-design/product-design.css';

const ProductDesignCanvas = lazy(() =>
  import('./product-design/ProductDesignCanvas').then((module) => ({ default: module.ProductDesignCanvas })),
);
const ThreeDProductPreview = lazy(() =>
  import('./product-design/ThreeDProductPreview').then((module) => ({ default: module.ThreeDProductPreview })),
);

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_3D_UPLOAD_BYTES = 25 * 1024 * 1024;

type StudioHistory = { past: DesignLayer[][]; future: DesignLayer[][]; lastKey: string; lastAt: number };
type InspectorTab = 'layers' | 'product' | 'background' | 'export';
type ViewMode = '2d' | 'split' | '3d';

function createId(prefix: string) {
  return `${prefix}-${window.crypto.randomUUID()}`;
}

function loadImageDimensions(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('No se pudo leer esta imagen.'));
    image.src = src;
  });
}

function createLayer(kind: LayerKind, area: PrintArea): DesignLayer {
  const x = area.x + area.width / 2;
  const y = area.y + area.height / 2;
  const size = Math.max(12, Math.min(28, area.width * 0.68));
  const shared: Omit<DesignLayer, 'kind' | 'name'> = {
    id: createId('layer'),
    x,
    y,
    size,
    scaleY: 1,
    rotation: 0,
    opacity: 100,
    color: '#e5007e',
    strokeColor: '#000000',
    strokeWidth: 0,
    cornerRadius: 10,
    fontFamily: 'DM Sans',
    fontWeight: 'bold',
    letterSpacing: 0,
    textShadow: false,
    textCurve: 0,
    blendMode: 'normal',
    clipShape: 'none',
    flipX: false,
    flipY: false,
    visible: true,
    locked: false,
  };
  if (kind === 'text') return { ...shared, kind, name: 'Texto nuevo', text: 'TU MARCA', color: '#ffffff' };
  if (kind === 'rectangle') return { ...shared, kind, name: 'Franja' };
  if (kind === 'circle') return { ...shared, kind, name: 'Círculo' };
  if (kind === 'triangle') return { ...shared, kind, name: 'Triángulo' };
  if (kind === 'star') return { ...shared, kind, name: 'Estrella', color: '#ffd06b' };
  if (kind === 'badge') return { ...shared, kind, name: 'Cápsula', scaleY: 0.48 };
  return { ...shared, kind: 'line', name: 'Línea', color: '#4de1ff' };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function fileTypeIsSupported(file: File) {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
}

function detect3DFormat(fileName: string): Custom3DModelFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.glb')) return 'glb';
  if (lower.endsWith('.gltf')) return 'gltf';
  if (lower.endsWith('.obj')) return 'obj';
  if (lower.endsWith('.stl')) return 'stl';
  return null;
}

const FINISH_OPTIONS: Array<{ value: ProductFinish; label: string }> = [
  { value: 'matte', label: 'Mate / Tela' },
  { value: 'satin', label: 'Satinado' },
  { value: 'glossy', label: 'Brillante / Cerámica' },
  { value: 'metallic', label: 'Metálico' },
];

const WARP_OPTIONS: Array<{ value: SurfaceWarpMode; label: string }> = [
  { value: 'flat', label: 'Plano' },
  { value: 'cylinder', label: 'Cilíndrico' },
  { value: 'dome', label: 'Domo / Gorra' },
  { value: 'perspective', label: 'Perspectiva' },
];

const BLEND_OPTIONS: Array<{ value: LayerBlendMode; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiplicar (tela)' },
  { value: 'screen', label: 'Brillo / Trama' },
];

const CLIP_OPTIONS: Array<{ value: LayerClipShape; label: string }> = [
  { value: 'none', label: 'Original' },
  { value: 'rounded', label: 'Redondeado' },
  { value: 'circle', label: 'Circular' },
  { value: 'pill', label: 'Cápsula' },
];

export function ProductDesignStudio({ initialBaseId, quotePath = '/cotizador' }: { initialBaseId?: string; quotePath?: string }) {
  const layerInputRef = useRef<HTMLInputElement>(null);
  const replaceImageInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const model3DInputRef = useRef<HTMLInputElement>(null);
  const bgImageInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const threeDPreviewRef = useRef<ThreeDPreviewHandle>(null);

  const objectUrlsRef = useRef<string[]>([]);
  const layersRef = useRef<DesignLayer[]>([]);
  const historyRef = useRef<StudioHistory>({ past: [], future: [], lastKey: '', lastAt: 0 });
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const canvasViewerRef = useRef<HTMLDivElement>(null);

  const [products, setProducts] = useState<ProductBase[]>(PRODUCT_BASES);
  const initialBase = PRODUCT_BASES.find((product) => product.id === initialBaseId)
    || PRODUCT_BASES.find((product) => product.id === DEFAULT_PRODUCT_ID)
    || PRODUCT_BASES[0];

  const [baseId, setBaseId] = useState(initialBase.id);
  const [familyFilter, setFamilyFilter] = useState<string>('Todos');
  const [layers, setLayers] = useState<DesignLayer[]>(() => [getDefaultLogoLayer(initialBase)]);
  const [selectedLayerId, setSelectedLayerId] = useState('brand-logo');
  const [appearance, setAppearance] = useState<ProductAppearance>(() => getDefaultAppearance(initialBase));
  const [background, setBackground] = useState<SceneBackground>(DEFAULT_SCENE_BACKGROUND);
  const [customModelsByBaseId, setCustomModelsByBaseId] = useState<Record<string, Custom3DModelState>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('layers');
  const [showPrintGuides, setShowPrintGuides] = useState(true);
  const [previewWarped2D, setPreviewWarped2D] = useState(false);
  const [warpedPreviewUrl, setWarpedPreviewUrl] = useState('');
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [artworkUrl, setArtworkUrl] = useState('');
  const [exporting, setExporting] = useState<'mockup' | 'mockup-3d' | 'mockup-3d-alpha' | 'art' | ''>('');
  const [projectAction, setProjectAction] = useState<'save' | 'open' | ''>('');
  const [message, setMessage] = useState('');

  const activeBase = useMemo(() => products.find((product) => product.id === baseId) || products[0], [products, baseId]);
  const activeCustomModel = activeBase.isCustom3D ? customModelsByBaseId[activeBase.id] || null : null;
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) || null;
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;
  const canvasHeight = canvasWidth > 0 ? canvasWidth / activeBase.ratio : 0;

  const families = useMemo(() => {
    const unique = [...new Set(products.map((p) => p.family))];
    return ['Todos', ...unique];
  }, [products]);

  const filteredProducts = useMemo(
    () => (familyFilter === 'Todos' ? products : products.filter((p) => p.family === familyFilter)),
    [products, familyFilter],
  );

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => () => objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const availableWidth = entry.contentRect.width;
      const maxHeight = viewMode === 'split' ? 500 : 600;
      const maxWidth = viewMode === 'split' ? 520 : 640;
      const width = Math.max(0, Math.min(availableWidth, maxWidth, maxHeight * activeBase.ratio));
      setCanvasWidth(Math.floor(width));
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [activeBase.ratio, viewMode]);

  // Live debounced artwork texture for 3D & Split views
  useEffect(() => {
    if (viewMode === '2d') return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      createArtworkCanvas(activeBase, layers, 1024)
        .then((canvas) => canvas.toDataURL('image/png'))
        .then((url) => {
          if (!cancelled) setArtworkUrl(url);
        })
        .catch(() => {
          if (!cancelled) setMessage('No se pudo actualizar la textura 3D. El diseño sigue disponible en 2D.');
        });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeBase, layers, viewMode]);

  // Live warped 2D preview when user toggles "Previa curva 2D"
  useEffect(() => {
    if (!previewWarped2D || viewMode === '3d' || activeBase.isCustom3D) {
      setWarpedPreviewUrl('');
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      createMockupCanvas(activeBase, layers, 1100, appearance, background)
        .then((canvas) => canvas.toDataURL('image/png'))
        .then((url) => {
          if (!cancelled) setWarpedPreviewUrl(url);
        })
        .catch(() => {
          if (!cancelled) setWarpedPreviewUrl('');
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [previewWarped2D, viewMode, activeBase, layers, appearance, background]);

  const commitLayers = useCallback((nextLayers: DesignLayer[], historyKey = 'change') => {
    const current = layersRef.current;
    const now = Date.now();
    const history = historyRef.current;
    const shouldMerge = historyKey === history.lastKey && now - history.lastAt < 700;
    if (!shouldMerge) history.past = [...history.past.slice(-49), current];
    history.future = [];
    history.lastKey = historyKey;
    history.lastAt = now;
    layersRef.current = nextLayers;
    setLayers(nextLayers);
  }, []);

  const updateLayer = (id: string, changes: Partial<DesignLayer>, key?: string) => {
    const current = layersRef.current;
    commitLayers(
      current.map((layer) => (layer.id === id ? { ...layer, ...changes } : layer)),
      key || `property:${id}:${Object.keys(changes).sort().join('-')}`,
    );
  };

  const updateActiveCustomModel = useCallback(
    (changes: Partial<Custom3DModelState>) => {
      setCustomModelsByBaseId((prev) => {
        const current = prev[baseId];
        if (!current) return prev;
        return { ...prev, [baseId]: { ...current, ...changes } };
      });
    },
    [baseId],
  );

  const undo = () => {
    const history = historyRef.current;
    const previous = history.past.pop();
    if (!previous) return;
    history.future = [...history.future, layersRef.current];
    history.lastKey = '';
    layersRef.current = previous;
    setLayers(previous);
    setMessage('Se deshizo el último cambio.');
  };

  const redo = () => {
    const history = historyRef.current;
    const next = history.future.pop();
    if (!next) return;
    history.past = [...history.past, layersRef.current];
    history.lastKey = '';
    layersRef.current = next;
    setLayers(next);
    setMessage('Se rehízo el cambio.');
  };

  const addLayer = (layer: DesignLayer) => {
    commitLayers([...layersRef.current, layer], `add:${layer.id}`);
    setSelectedLayerId(layer.id);
    setInspectorTab('layers');
    setPreviewWarped2D(false);
    setMessage(`Añadido: ${layer.name}.`);
  };

  const selectProduct = (product: ProductBase) => {
    setBaseId(product.id);
    setAppearance(getDefaultAppearance(product));
    setPreviewWarped2D(false);
    const nextLayers = layersRef.current.map((layer) =>
      layer.id === 'brand-logo'
        ? { ...layer, x: product.defaultX, y: product.defaultY, size: product.defaultSize, rotation: 0 }
        : layer,
    );
    commitLayers(nextLayers, `product:${product.id}`);
    setSelectedLayerId(nextLayers.some((l) => l.id === selectedLayerId) ? selectedLayerId : nextLayers.at(-1)?.id || '');
    if (product.isCustom3D && viewMode === '2d') {
      setViewMode(window.innerWidth >= 1120 ? 'split' : '3d');
    }
    setMessage(`Base activa: ${product.name}.`);
  };

  const applyStarterPreset = (presetId: 'logo-only' | 'badge-pro' | 'minimal-brand' | 'promo-banner') => {
    const existingLogo = layersRef.current.find((l) => l.kind === 'image' && l.src)?.src;
    const presetLayers = createStarterPresetLayers(presetId, activeBase, existingLogo);
    commitLayers(presetLayers, `preset:${presetId}`);
    setSelectedLayerId(presetLayers.at(-1)?.id || '');
    setPreviewWarped2D(false);
    setMessage('Plantilla rápida aplicada. Puedes editar cada capa.');
  };

  const duplicateSelectedLayer = () => {
    if (!selectedLayer) return;
    addLayer({
      ...selectedLayer,
      id: createId('layer'),
      name: `${selectedLayer.name} · copia`.slice(0, 70),
      x: clamp(selectedLayer.x + 4, activeBase.printArea.x, activeBase.printArea.x + activeBase.printArea.width),
      y: clamp(selectedLayer.y + 4, activeBase.printArea.y, activeBase.printArea.y + activeBase.printArea.height),
      locked: false,
    });
  };

  const removeSelectedLayer = () => {
    if (!selectedLayer) return;
    commitLayers(layersRef.current.filter((layer) => layer.id !== selectedLayer.id), `remove:${selectedLayer.id}`);
    setSelectedLayerId('');
    setMessage('Elemento eliminado.');
  };

  const reorderLayer = (id: string, direction: -1 | 1) => {
    const current = layersRef.current;
    const index = current.findIndex((layer) => layer.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return;
    const reordered = [...current];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    commitLayers(reordered, `order:${id}`);
  };

  const centerSelectedLayer = (axis: 'x' | 'y' | 'fit') => {
    if (!selectedLayer) return;
    const area = activeBase.printArea;
    if (axis === 'x') {
      updateLayer(selectedLayer.id, { x: area.x + area.width / 2 }, `align-x:${selectedLayer.id}`);
    } else if (axis === 'y') {
      updateLayer(selectedLayer.id, { y: area.y + area.height / 2 }, `align-y:${selectedLayer.id}`);
    } else {
      updateLayer(
        selectedLayer.id,
        {
          x: area.x + area.width / 2,
          y: area.y + area.height / 2,
          size: clamp(area.width * 0.86, 8, 85),
          rotation: 0,
        },
        `fit:${selectedLayer.id}`,
      );
    }
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!fileTypeIsSupported(file)) {
      setMessage('Elige una imagen PNG, JPG o WebP.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setMessage('La imagen debe pesar menos de 12 MB.');
      return;
    }
    const src = URL.createObjectURL(file);
    objectUrlsRef.current.push(src);
    addLayer({
      id: createId('layer'),
      kind: 'image',
      name: file.name.slice(0, 70),
      src,
      x: activeBase.printArea.x + activeBase.printArea.width / 2,
      y: activeBase.printArea.y + activeBase.printArea.height / 2,
      size: Math.min(32, activeBase.printArea.width * 0.68),
      scaleY: 1,
      rotation: 0,
      opacity: 100,
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 0,
      cornerRadius: 10,
      fontFamily: 'DM Sans',
      fontWeight: 'bold',
      letterSpacing: 0,
      textShadow: false,
      textCurve: 0,
      blendMode: 'normal',
      clipShape: 'none',
      flipX: false,
      flipY: false,
      visible: true,
      locked: false,
    });
  };

  const handleReplaceLayerImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedLayer || selectedLayer.kind !== 'image') return;
    if (!fileTypeIsSupported(file)) {
      setMessage('Elige una imagen PNG, JPG o WebP.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setMessage('La imagen debe pesar menos de 12 MB.');
      return;
    }
    const src = URL.createObjectURL(file);
    objectUrlsRef.current.push(src);
    updateLayer(selectedLayer.id, { src, name: file.name.slice(0, 70) }, `replace-img:${selectedLayer.id}`);
    setMessage('Logo / diseño reemplazado conservando posición y escala.');
  };

  const handleProductUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!fileTypeIsSupported(file)) {
      setMessage('Elige una foto de producto PNG, JPG o WebP.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setMessage('La foto debe pesar menos de 12 MB.');
      return;
    }
    const src = URL.createObjectURL(file);
    objectUrlsRef.current.push(src);
    try {
      const dimensions = await loadImageDimensions(src);
      const product: ProductBase = {
        id: createId('custom'),
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 34) || 'Producto propio',
        family: 'Producto propio',
        image: src,
        quoteProduct: '',
        ratio: dimensions.width / Math.max(1, dimensions.height),
        model: 'custom',
        printArea: { x: 20, y: 20, width: 60, height: 60 },
        defaultX: 50,
        defaultY: 50,
        defaultSize: 24,
        defaultColor: '#e6e8ef',
        defaultAccentColor: '#1f2330',
        defaultFinish: 'satin',
        defaultWarp: 'flat',
        defaultWarpStrength: 0,
        hint: 'Ajusta la zona imprimible para tu foto',
        isCustom: true,
      };
      setProducts((current) => [...current, product]);
      setFamilyFilter('Todos');
      setBaseId(product.id);
      setAppearance(getDefaultAppearance(product));
      setInspectorTab('product');
      setMessage('Foto de producto propia cargada. Puedes ajustar color, fondo y zona imprimible.');
    } catch {
      URL.revokeObjectURL(src);
      objectUrlsRef.current = objectUrlsRef.current.filter((url) => url !== src);
      setMessage('No se pudo cargar la foto. Prueba con otra imagen.');
    }
  };

  const handle3DModelUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const format = detect3DFormat(file.name);
    if (!format) {
      setMessage('Formato 3D no compatible. Usa archivos .glb, .gltf, .obj o .stl.');
      return;
    }
    if (file.size > MAX_3D_UPLOAD_BYTES) {
      setMessage('El modelo 3D debe pesar menos de 25 MB.');
      return;
    }

    const url = URL.createObjectURL(file);
    objectUrlsRef.current.push(url);
    const id = createId('custom3d');
    const cleanName = file.name.replace(/\.[^.]+$/, '').slice(0, 32) || 'Objeto 3D';

    const newProduct: ProductBase = {
      id,
      name: cleanName,
      family: 'Modelos 3D propios',
      image: '/brand/visualcorp-symbol.png',
      quoteProduct: '',
      ratio: 1,
      model: 'custom-3d',
      printArea: { x: 10, y: 10, width: 80, height: 80 },
      defaultX: 50,
      defaultY: 50,
      defaultSize: 40,
      defaultColor: '#f5f5f7',
      defaultAccentColor: '#191b22',
      defaultFinish: 'satin',
      defaultWarp: 'flat',
      defaultWarpStrength: 0,
      hint: 'Lienzo 2D proyectado en tiempo real sobre tu objeto 3D',
      isCustom: true,
      isCustom3D: true,
    };

    const newCustomModel: Custom3DModelState = {
      url,
      fileName: file.name,
      format,
      projectionMode: 'decal',
      targetMeshName: '',
      detectedMeshes: [],
      decalScale: 72,
      decalRotation: 0,
      decalOffsetX: 0,
      decalOffsetY: 0,
      decalDepth: 0.9,
      decalPoint: null,
      decalNormal: null,
      placementMode: false,
    };

    setCustomModelsByBaseId((prev) => ({ ...prev, [id]: newCustomModel }));
    setProducts((current) => [...current, newProduct]);
    setFamilyFilter('Todos');
    setBaseId(id);
    setAppearance({
      mode: 'original',
      color: '#f5f5f7',
      accentColor: '#191b22',
      finish: 'satin',
      warpMode: 'flat',
      warpStrength: 0,
    });
    setViewMode(window.innerWidth >= 1120 ? 'split' : '3d');
    setInspectorTab('product');
    setMessage(`Objeto 3D “${cleanName}” cargado localmente. El diseño 2D se proyecta sobre la forma.`);
  };

  const handleBackgroundImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!fileTypeIsSupported(file)) {
      setMessage('Elige una imagen de fondo PNG, JPG o WebP.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setMessage('La imagen de fondo debe pesar menos de 12 MB.');
      return;
    }
    const src = URL.createObjectURL(file);
    objectUrlsRef.current.push(src);
    setBackground((prev) => ({ ...prev, kind: 'image', imageSrc: src, imageName: file.name.slice(0, 60) }));
    setMessage('Fondo fotográfico aplicado a la escena 2D y 3D.');
  };

  const handleSaveProject = async () => {
    if (projectAction || exporting) return;
    setProjectAction('save');
    setMessage('Preparando el archivo de proyecto…');
    try {
      const contents = await serializeDesignProject(activeBase, layersRef.current, appearance, background);
      const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
      if (blob.size > MAX_PROJECT_FILE_BYTES) throw new Error('El archivo de proyecto supera el límite de 32 MB.');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = designProjectFilename(activeBase.name);
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage(
        activeBase.isCustom3D
          ? 'Proyecto guardado (capas, color y fondo). Al reabrirlo, vuelve a seleccionar tu archivo 3D local si deseas proyectarlo.'
          : 'Proyecto guardado en un archivo local .vcdesign.json.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el proyecto.');
    } finally {
      setProjectAction('');
    }
  };

  const handleOpenProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_PROJECT_FILE_BYTES) {
      setMessage('El archivo de proyecto supera el límite de 32 MB.');
      return;
    }
    if (projectAction || exporting) return;

    setProjectAction('open');
    setMessage('Abriendo el proyecto…');
    try {
      const restored = await restoreDesignProject(await file.text());
      if (!window.confirm(`Abrir “${restored.product.name}” reemplazará la composición actual. ¿Quieres continuar?`)) {
        setMessage('Se conservó el diseño actual.');
        return;
      }
      const product = restored.product.isCustom ? { ...restored.product, id: createId('custom') } : restored.product;
      setProducts((current) =>
        product.isCustom
          ? [...current, product]
          : current.map((existing) => (existing.id === product.id ? product : existing)),
      );
      setBaseId(product.id);
      setAppearance(restored.appearance);
      setBackground(restored.background);
      layersRef.current = restored.layers;
      setLayers(restored.layers);
      historyRef.current = { past: [], future: [], lastKey: '', lastAt: 0 };
      setSelectedLayerId(restored.layers.at(-1)?.id || '');
      setPreviewWarped2D(false);
      setMessage(`Proyecto abierto: ${product.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo abrir el proyecto.');
    } finally {
      setProjectAction('');
    }
  };

  const updatePrintArea = (field: keyof PrintArea, value: number) => {
    setProducts((current) =>
      current.map((product) => {
        if (product.id !== activeBase.id) return product;
        const next = { ...product.printArea };
        if (field === 'x') next.x = clamp(value, 0, 100 - next.width);
        if (field === 'y') next.y = clamp(value, 0, 100 - next.height);
        if (field === 'width') next.width = clamp(value, 10, 100 - next.x);
        if (field === 'height') next.height = clamp(value, 10, 100 - next.y);
        return { ...product, printArea: next };
      }),
    );
  };

  const resetDesign = () => {
    const nextLayers = [getDefaultLogoLayer(activeBase)];
    commitLayers(nextLayers, `reset:${activeBase.id}`);
    setAppearance(getDefaultAppearance(activeBase));
    setSelectedLayerId('brand-logo');
    setPreviewWarped2D(false);
    setMessage('Diseño y apariencia restablecidos.');
  };

  const exportDesign = async (kind: 'mockup' | 'mockup-3d' | 'mockup-3d-alpha' | 'art') => {
    if (exporting) return;
    setExporting(kind);
    setMessage('');
    try {
      if (kind === 'mockup-3d' || kind === 'mockup-3d-alpha') {
        if (viewMode === '2d') {
          setViewMode('3d');
          setMessage('Activando el Estudio 3D para capturar. Vuelve a pulsar en un instante cuando cargue.');
          return;
        }
        const snap = await threeDPreviewRef.current?.capturePng(kind === 'mockup-3d-alpha');
        if (!snap) throw new Error('Vista 3D no lista.');
        await downloadCanvas(
          snap,
          `visualcorp-mockup-3d-${activeBase.id}${kind === 'mockup-3d-alpha' ? '-transparente' : ''}.png`,
        );
        setMessage(
          kind === 'mockup-3d-alpha'
            ? 'Mockup 3D PNG sin fondo descargado.'
            : 'Mockup 3D PNG en alta resolución descargado.',
        );
        return;
      }

      const canvas =
        kind === 'mockup'
          ? await createMockupCanvas(activeBase, layers, 2400, appearance, background)
          : await createArtworkCanvas(activeBase, layers, 4000);
      await downloadCanvas(canvas, `visualcorp-${kind === 'mockup' ? 'mockup-2d' : 'arte-impresion'}-${activeBase.id}.png`);
      setMessage(
        kind === 'mockup'
          ? 'Mockup 2D PNG descargado con color, fondo y adaptación de forma.'
          : 'Arte de impresión PNG descargado con fondo transparente.',
      );
    } catch {
      setMessage('No se pudo exportar el PNG. Revisa las imágenes o la vista 3D e inténtalo de nuevo.');
    } finally {
      setExporting('');
    }
  };

  const handleCanvasKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input, textarea, select, button, [contenteditable="true"]')) return;
    const command = event.metaKey || event.ctrlKey;
    if (command && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (command && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    if (command && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      duplicateSelectedLayer();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeSelectedLayer();
      return;
    }
    if (!selectedLayer) return;
    const delta = event.shiftKey ? 2 : 0.5;
    const movements: Record<string, Partial<DesignLayer>> = {
      ArrowLeft: { x: clamp(selectedLayer.x - delta, activeBase.printArea.x, activeBase.printArea.x + activeBase.printArea.width) },
      ArrowRight: { x: clamp(selectedLayer.x + delta, activeBase.printArea.x, activeBase.printArea.x + activeBase.printArea.width) },
      ArrowUp: { y: clamp(selectedLayer.y - delta, activeBase.printArea.y, activeBase.printArea.y + activeBase.printArea.height) },
      ArrowDown: { y: clamp(selectedLayer.y + delta, activeBase.printArea.y, activeBase.printArea.y + activeBase.printArea.height) },
    };
    const movement = movements[event.key];
    if (movement) {
      event.preventDefault();
      updateLayer(selectedLayer.id, movement, `keyboard:${selectedLayer.id}`);
    }
  };

  const focusCanvasOnPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest('.vc-product-canvas-surface')) {
      canvasViewerRef.current?.focus({ preventScroll: true });
    }
  };

  const handleDetectedMeshes = useCallback(
    (meshNames: string[], suggestedTarget: string) => {
      updateActiveCustomModel({
        detectedMeshes: meshNames,
        targetMeshName: suggestedTarget,
      });
    },
    [updateActiveCustomModel],
  );

  const handlePlaceDecal = useCallback(
    (point: [number, number, number], normal: [number, number, number]) => {
      updateActiveCustomModel({
        decalPoint: point,
        decalNormal: normal,
        placementMode: false,
      });
      setMessage('Diseño fijado en el punto seleccionado del modelo 3D.');
    },
    [updateActiveCustomModel],
  );

  const show2DPane = viewMode === '2d' || viewMode === 'split';
  const show3DPane = viewMode === '3d' || viewMode === 'split';

  return (
    <section id="probador-logo" className="vc-tool-card vc-product-studio" aria-labelledby="vc-product-studio-title">
      <div className="vc-tool-card-head">
        <div>
          <span className="vc-tool-kicker">
            <Sparkles size={14} aria-hidden="true" /> ESTUDIO MOCKUP 2D &amp; 3D PROFESIONAL
          </span>
          <h2 id="vc-product-studio-title">Diseña y visualiza mockups 2D y 3D gratis</h2>
          <p>
            Cambia colores del producto, fondos de estudio, logos, tipografías curvas, formas y capas con adaptación a la superficie.
            Incluso puedes subir tus propios objetos 3D (<code>.glb</code>, <code>.obj</code>, <code>.stl</code>) y proyectar tu arte en vivo.
          </p>
        </div>
        <span className="vc-tool-privacy">
          <ShieldCheck size={14} aria-hidden="true" /> 100 % local en tu navegador · gratis
        </span>
      </div>

      {/* Base Selector & Uploaders */}
      <div className="vc-product-base-bar">
        <div className="vc-product-template-heading">
          <div className="vc-product-family-pills" role="group" aria-label="Filtrar categoría de producto">
            {families.map((fam) => (
              <button
                key={fam}
                type="button"
                className={`vc-product-family-pill${familyFilter === fam ? ' is-active' : ''}`}
                aria-pressed={familyFilter === fam}
                onClick={() => setFamilyFilter(fam)}
              >
                {fam}
              </button>
            ))}
          </div>

          <div className="vc-product-upload-pair">
            <button type="button" className="vc-product-add-own" onClick={() => productInputRef.current?.click()}>
              <ImagePlus size={14} aria-hidden="true" /> Foto 2D propia
            </button>
            <input ref={productInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={handleProductUpload} />

            <button type="button" className="vc-product-add-own is-3d" onClick={() => model3DInputRef.current?.click()}>
              <Box size={14} aria-hidden="true" /> Subir objeto 3D
            </button>
            <input ref={model3DInputRef} type="file" accept=".glb,.gltf,.obj,.stl" className="sr-only" onChange={handle3DModelUpload} />
          </div>
        </div>

        <div className="vc-product-template-grid" role="group" aria-label="Elegir producto base">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              type="button"
              className={`vc-product-template${product.id === activeBase.id ? ' is-active' : ''}`}
              aria-pressed={product.id === activeBase.id}
              onClick={() => selectProduct(product)}
            >
              {product.isCustom3D ? (
                <span className="vc-product-template-3d-badge" aria-hidden="true">
                  <Box size={22} />
                </span>
              ) : (
                <img src={product.image} alt="" loading="lazy" />
              )}
              <span>
                <b>{product.name}</b>
                <small>{product.isCustom3D ? 'Objeto 3D propio' : product.family}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Studio Action Toolbar */}
      <div className="vc-product-editor-toolbar">
        <div className="vc-product-tool-group" role="group" aria-label="Añadir elementos al diseño">
          <input ref={layerInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={handleImageUpload} />
          <input ref={replaceImageInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={handleReplaceLayerImage} />
          <button type="button" className="vc-product-action is-highlight" onClick={() => layerInputRef.current?.click()}>
            <ImagePlus size={15} aria-hidden="true" /> Logo / Imagen
          </button>
          <button type="button" className="vc-product-action" onClick={() => addLayer(createLayer('text', activeBase.printArea))}>
            <Type size={15} aria-hidden="true" /> Texto
          </button>
          <button type="button" className="vc-product-action" onClick={() => addLayer(createLayer('rectangle', activeBase.printArea))} title="Añadir rectángulo o franja">
            <RectangleHorizontal size={15} aria-hidden="true" /> Franja
          </button>
          <button type="button" className="vc-product-action" onClick={() => addLayer(createLayer('circle', activeBase.printArea))} title="Añadir círculo">
            <Circle size={15} aria-hidden="true" /> Círculo
          </button>
          <button type="button" className="vc-product-action" onClick={() => addLayer(createLayer('badge', activeBase.printArea))} title="Añadir cápsula / insignia">
            <Tag size={15} aria-hidden="true" /> Cápsula
          </button>
          <button type="button" className="vc-product-action" onClick={() => addLayer(createLayer('star', activeBase.printArea))} title="Añadir estrella">
            <Star size={15} aria-hidden="true" /> Estrella
          </button>
          <button type="button" className="vc-product-action" onClick={() => addLayer(createLayer('triangle', activeBase.printArea))} title="Añadir triángulo">
            <Triangle size={15} aria-hidden="true" /> Triángulo
          </button>
          <button type="button" className="vc-product-action" onClick={() => addLayer(createLayer('line', activeBase.printArea))} title="Añadir línea divisoria">
            <Minus size={15} aria-hidden="true" /> Línea
          </button>
        </div>

        <div className="vc-product-tool-group vc-product-tool-compact" role="group" aria-label="Historial y archivo">
          <button type="button" className="vc-product-icon-button" aria-label="Deshacer" title="Deshacer · Ctrl/Cmd+Z" disabled={!canUndo} onClick={undo}>
            <Undo2 size={15} aria-hidden="true" />
          </button>
          <button type="button" className="vc-product-icon-button" aria-label="Rehacer" title="Rehacer · Ctrl/Cmd+Shift+Z" disabled={!canRedo} onClick={redo}>
            <Redo2 size={15} aria-hidden="true" />
          </button>
          <button type="button" className="vc-product-icon-button" aria-label="Duplicar capa" title="Duplicar · Ctrl/Cmd+D" disabled={!selectedLayer} onClick={duplicateSelectedLayer}>
            <Copy size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`vc-product-icon-button${showPrintGuides ? ' is-active' : ''}`}
            aria-label={showPrintGuides ? 'Ocultar guías de zona imprimible' : 'Mostrar guías de zona imprimible'}
            title="Mostrar u ocultar marco de zona imprimible"
            aria-pressed={showPrintGuides}
            onClick={() => setShowPrintGuides((v) => !v)}
          >
            <Grid2x2 size={15} aria-hidden="true" />
          </button>
          <input ref={projectInputRef} type="file" accept=".vcdesign.json,.json,application/json" className="sr-only" onChange={handleOpenProject} />
          <button type="button" className="vc-product-icon-button" aria-label="Guardar proyecto" title="Guardar proyecto .vcdesign.json" disabled={Boolean(projectAction || exporting)} onClick={handleSaveProject}>
            <Save size={15} aria-hidden="true" />
          </button>
          <button type="button" className="vc-product-icon-button" aria-label="Abrir proyecto" title="Abrir proyecto .vcdesign.json" disabled={Boolean(projectAction || exporting)} onClick={() => projectInputRef.current?.click()}>
            <FolderOpen size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="vc-product-view-switch" role="group" aria-label="Modo de visualización">
          <button type="button" className={viewMode === '2d' ? 'is-active' : ''} aria-pressed={viewMode === '2d'} onClick={() => setViewMode('2d')}>
            Lienzo 2D
          </button>
          <button
            type="button"
            className={viewMode === 'split' ? 'is-active' : ''}
            aria-pressed={viewMode === 'split'}
            onClick={() => setViewMode('split')}
          >
            <Columns2 size={14} aria-hidden="true" /> 2D + 3D
          </button>
          <button type="button" className={viewMode === '3d' ? 'is-active' : ''} aria-pressed={viewMode === '3d'} onClick={() => setViewMode('3d')}>
            <Box size={14} aria-hidden="true" /> Estudio 3D
          </button>
        </div>
      </div>

      {/* Quick Starter Compositions */}
      <div className="vc-product-presets-strip" role="group" aria-label="Composiciones rápidas">
        <span className="vc-product-presets-label"><Wand2 size={13} aria-hidden="true" /> Diseños rápidos:</span>
        <button type="button" className="vc-product-preset-chip" onClick={() => applyStarterPreset('logo-only')}>Logo centrado</button>
        <button type="button" className="vc-product-preset-chip" onClick={() => applyStarterPreset('minimal-brand')}>Marca minimalista</button>
        <button type="button" className="vc-product-preset-chip" onClick={() => applyStarterPreset('badge-pro')}>Sello curvo</button>
        <button type="button" className="vc-product-preset-chip" onClick={() => applyStarterPreset('promo-banner')}>Cápsula promo</button>
        {show2DPane && !activeBase.isCustom3D && appearance.warpMode !== 'flat' && (
          <button
            type="button"
            className={`vc-product-preset-chip is-warp-toggle${previewWarped2D ? ' is-active' : ''}`}
            aria-pressed={previewWarped2D}
            onClick={() => setPreviewWarped2D((v) => !v)}
          >
            {previewWarped2D ? 'Volver a editar capas' : `Previa adaptada (${WARP_OPTIONS.find((w) => w.value === appearance.warpMode)?.label})`}
          </button>
        )}
      </div>

      {/* Main Editor Workspace: Stage(s) + 4-Tab Pro Inspector */}
      <div className={`vc-product-editor-layout${viewMode === 'split' ? ' is-split' : ''}`}>
        <div className="vc-product-canvas-column">
          <div className={`vc-product-stage-grid${viewMode === 'split' ? ' is-split' : ''}`}>
            {show2DPane && (
              <div
                className="vc-product-canvas-viewer"
                ref={canvasViewerRef}
                tabIndex={0}
                onKeyDown={handleCanvasKeys}
                onPointerDownCapture={focusCanvasOnPointer}
                aria-label={`Lienzo 2D de ${activeBase.name}. Atajos: flechas para mover, Suprimir para eliminar, Ctrl o Comando Z para deshacer.`}
              >
                <div ref={canvasHostRef} className="vc-product-canvas-surface">
                  {previewWarped2D && warpedPreviewUrl ? (
                    <div className="vc-product-warped-preview">
                      <img src={warpedPreviewUrl} alt={`Vista previa adaptada de ${activeBase.name}`} />
                      <button type="button" className="vc-product-warped-exit" onClick={() => setPreviewWarped2D(false)}>
                        Volver a editar en lienzo
                      </button>
                    </div>
                  ) : (
                    <Suspense fallback={<div className="vc-product-canvas-loading" role="status">Cargando el lienzo 2D…</div>}>
                      <ProductDesignCanvas
                        product={activeBase}
                        layers={layers}
                        selectedLayerId={selectedLayerId}
                        printArea={activeBase.printArea}
                        appearance={appearance}
                        background={background}
                        showPrintGuides={showPrintGuides}
                        width={canvasWidth}
                        height={canvasHeight}
                        onSelectLayer={setSelectedLayerId}
                        onClearSelection={() => setSelectedLayerId('')}
                        onCommitLayer={(id, changes) => updateLayer(id, changes, `canvas:${id}`)}
                      />
                    </Suspense>
                  )}
                </div>
              </div>
            )}

            {show3DPane && (
              <div className="vc-product-3d-viewer-shell">
                <Suspense fallback={<div className="vc-product-canvas-loading" role="status">Iniciando motor 3D…</div>}>
                  <ThreeDProductPreview
                    ref={threeDPreviewRef}
                    product={activeBase}
                    artworkUrl={artworkUrl}
                    appearance={appearance}
                    background={background}
                    customModel={activeCustomModel}
                    compact={viewMode === 'split'}
                    onDetectedMeshes={handleDetectedMeshes}
                    onPlaceDecal={handlePlaceDecal}
                    onTogglePlacementMode={() =>
                      updateActiveCustomModel({ placementMode: !activeCustomModel?.placementMode })
                    }
                    onExport3D={(transparent) => exportDesign(transparent ? 'mockup-3d-alpha' : 'mockup-3d')}
                  />
                </Suspense>
              </div>
            )}
          </div>

          <div className="vc-product-canvas-caption">
            <span>
              {activeBase.isCustom3D
                ? 'Edita tus capas en 2D y proyecta en vivo sobre tu modelo 3D (Decal curvo o UV directo).'
                : viewMode === '3d'
                  ? 'Estudio 3D interactivo con iluminación PBR y envoltura adaptada a la geometría.'
                  : `${activeBase.hint} · arrastra, redimensiona o activa 2D + 3D para ver cambios en vivo.`}
            </span>
            <span>Composición referencial; medidas, materiales y técnicas se confirman al cotizar.</span>
          </div>
        </div>

        {/* 4-Tab Professional Inspector */}
        <aside className="vc-product-inspector" aria-label="Inspector profesional de diseño">
          <div className="vc-product-inspector-tabs" role="tablist" aria-label="Secciones del inspector">
            <button
              type="button"
              role="tab"
              aria-selected={inspectorTab === 'layers'}
              className={inspectorTab === 'layers' ? 'is-active' : ''}
              onClick={() => setInspectorTab('layers')}
            >
              <Layers size={14} aria-hidden="true" /> Capas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inspectorTab === 'product'}
              className={inspectorTab === 'product' ? 'is-active' : ''}
              onClick={() => setInspectorTab('product')}
            >
              <SlidersHorizontal size={14} aria-hidden="true" /> Producto
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inspectorTab === 'background'}
              className={inspectorTab === 'background' ? 'is-active' : ''}
              onClick={() => setInspectorTab('background')}
            >
              <Palette size={14} aria-hidden="true" /> Fondo
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inspectorTab === 'export'}
              className={inspectorTab === 'export' ? 'is-active' : ''}
              onClick={() => setInspectorTab('export')}
            >
              <Download size={14} aria-hidden="true" /> Exportar
            </button>
          </div>

          {/* TAB 1: CAPAS & PROPIEDADES DEL ELEMENTO */}
          {inspectorTab === 'layers' && (
            <div className="vc-product-tab-panel" role="tabpanel">
              <div className="vc-product-inspector-section">
                <div className="vc-product-section-heading">
                  <span className="vc-tool-label">Capas del diseño</span>
                  <span>{layers.length}</span>
                </div>
                {layers.length === 0 ? (
                  <p className="vc-product-empty">Añade un logo, texto o forma desde la barra superior para iniciar.</p>
                ) : (
                  <div className="vc-product-layer-list" role="list" aria-label="Lista de capas">
                    {[...layers].reverse().map((layer, index, visibleLayers) => (
                      <div
                        className={`vc-product-layer-row${layer.id === selectedLayerId ? ' is-active' : ''}`}
                        key={layer.id}
                        role="listitem"
                      >
                        <button
                          type="button"
                          className="vc-product-layer-select"
                          aria-pressed={layer.id === selectedLayerId}
                          onClick={() => setSelectedLayerId(layer.id)}
                        >
                          <span className="vc-product-layer-number">{visibleLayers.length - index}</span>
                          <span className="vc-product-layer-name">{layer.name}</span>
                        </button>
                        <button
                          type="button"
                          className="vc-product-layer-icon"
                          aria-label={layer.visible ? `Ocultar ${layer.name}` : `Mostrar ${layer.name}`}
                          onClick={() => updateLayer(layer.id, { visible: !layer.visible }, `visible:${layer.id}`)}
                        >
                          {layer.visible ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
                        </button>
                        <button
                          type="button"
                          className="vc-product-layer-icon"
                          aria-label={layer.locked ? `Desbloquear ${layer.name}` : `Bloquear ${layer.name}`}
                          onClick={() => updateLayer(layer.id, { locked: !layer.locked }, `locked:${layer.id}`)}
                        >
                          {layer.locked ? <Lock size={13} aria-hidden="true" /> : <Unlock size={13} aria-hidden="true" />}
                        </button>
                        <button
                          type="button"
                          className="vc-product-layer-icon"
                          aria-label={`Subir ${layer.name}`}
                          disabled={index === 0}
                          onClick={() => reorderLayer(layer.id, 1)}
                        >
                          <ChevronUp size={13} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="vc-product-layer-icon"
                          aria-label={`Bajar ${layer.name}`}
                          disabled={index === visibleLayers.length - 1}
                          onClick={() => reorderLayer(layer.id, -1)}
                        >
                          <ChevronDown size={13} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedLayer && (
                <div className="vc-product-inspector-section">
                  <div className="vc-product-section-heading">
                    <span className="vc-tool-label">Propiedades · {selectedLayer.name}</span>
                    <button
                      type="button"
                      className="vc-product-layer-icon is-danger"
                      aria-label={`Eliminar ${selectedLayer.name}`}
                      onClick={removeSelectedLayer}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>

                  {/* Quick Align, Fit & Flip Bar */}
                  <div className="vc-product-mini-actions" role="group" aria-label="Alinear y voltear capa">
                    <button type="button" className="vc-product-mini-btn" title="Centrar horizontalmente" onClick={() => centerSelectedLayer('x')}>
                      <AlignCenterHorizontal size={14} aria-hidden="true" />
                    </button>
                    <button type="button" className="vc-product-mini-btn" title="Centrar verticalmente" onClick={() => centerSelectedLayer('y')}>
                      <AlignCenterVertical size={14} aria-hidden="true" />
                    </button>
                    <button type="button" className="vc-product-mini-btn" title="Encajar al área imprimible" onClick={() => centerSelectedLayer('fit')}>
                      <Maximize2 size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`vc-product-mini-btn${selectedLayer.flipX ? ' is-active' : ''}`}
                      title="Voltear horizontal"
                      onClick={() => updateLayer(selectedLayer.id, { flipX: !selectedLayer.flipX })}
                    >
                      <FlipHorizontal2 size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`vc-product-mini-btn${selectedLayer.flipY ? ' is-active' : ''}`}
                      title="Voltear vertical"
                      onClick={() => updateLayer(selectedLayer.id, { flipY: !selectedLayer.flipY })}
                    >
                      <FlipVertical2 size={14} aria-hidden="true" />
                    </button>
                    <button type="button" className="vc-product-mini-btn" title="Duplicar capa" onClick={duplicateSelectedLayer}>
                      <Copy size={14} aria-hidden="true" />
                    </button>
                  </div>

                  {selectedLayer.kind === 'image' && (
                    <>
                      <button
                        type="button"
                        className="vc-product-action is-full"
                        onClick={() => replaceImageInputRef.current?.click()}
                      >
                        <RefreshCw size={14} aria-hidden="true" /> Cambiar logo / imagen
                      </button>
                      <label className="vc-product-field">
                        Recorte de forma
                        <div className="vc-product-chip-row">
                          {CLIP_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              className={`vc-product-option-chip${(selectedLayer.clipShape || 'none') === opt.value ? ' is-active' : ''}`}
                              onClick={() => updateLayer(selectedLayer.id, { clipShape: opt.value })}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </label>
                    </>
                  )}

                  {selectedLayer.kind === 'text' && (
                    <>
                      <label className="vc-product-field">
                        Texto
                        <textarea
                          value={selectedLayer.text || ''}
                          maxLength={180}
                          rows={2}
                          onChange={(event) =>
                            updateLayer(
                              selectedLayer.id,
                              { text: event.target.value, name: event.target.value.trim().slice(0, 35) || 'Texto nuevo' },
                              `text:${selectedLayer.id}`,
                            )
                          }
                        />
                      </label>
                      <div className="vc-product-position-fields">
                        <label className="vc-product-field">
                          Tipografía
                          <select
                            value={selectedLayer.fontFamily}
                            onChange={(event) => updateLayer(selectedLayer.id, { fontFamily: event.target.value })}
                          >
                            {DESIGN_FONT_OPTIONS.map((font) => (
                              <option value={font} key={font}>{font}</option>
                            ))}
                          </select>
                        </label>
                        <label className="vc-product-field">
                          Peso
                          <select
                            value={selectedLayer.fontWeight || 'bold'}
                            onChange={(event) => updateLayer(selectedLayer.id, { fontWeight: event.target.value as 'normal' | 'bold' })}
                          >
                            <option value="bold">Negrita</option>
                            <option value="normal">Regular</option>
                          </select>
                        </label>
                      </div>
                      <label className="vc-product-range-field">
                        <span>Curvatura de texto</span>
                        <b>{Math.round(selectedLayer.textCurve ?? 0)}°</b>
                        <input
                          type="range"
                          min="-90"
                          max="90"
                          value={selectedLayer.textCurve ?? 0}
                          onChange={(event) => updateLayer(selectedLayer.id, { textCurve: Number(event.target.value) })}
                        />
                      </label>
                      <label className="vc-product-range-field">
                        <span>Espaciado letras</span>
                        <b>{selectedLayer.letterSpacing ?? 0} px</b>
                        <input
                          type="range"
                          min="-2"
                          max="16"
                          step="0.5"
                          value={selectedLayer.letterSpacing ?? 0}
                          onChange={(event) => updateLayer(selectedLayer.id, { letterSpacing: Number(event.target.value) })}
                        />
                      </label>
                      <label className="vc-product-toggle-row">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedLayer.textShadow)}
                          onChange={(event) => updateLayer(selectedLayer.id, { textShadow: event.target.checked })}
                        />
                        <span>Sombra suave para destacar sobre el producto</span>
                      </label>
                    </>
                  )}

                  {selectedLayer.kind !== 'image' && (
                    <div className="vc-product-color-pair">
                      <label className="vc-product-field vc-product-color-field">
                        Relleno
                        <input
                          type="color"
                          value={selectedLayer.color}
                          onChange={(event) => updateLayer(selectedLayer.id, { color: event.target.value })}
                        />
                      </label>
                      {selectedLayer.kind !== 'line' && (
                        <label className="vc-product-field vc-product-color-field">
                          Borde
                          <input
                            type="color"
                            value={selectedLayer.strokeColor || '#000000'}
                            onChange={(event) => updateLayer(selectedLayer.id, { strokeColor: event.target.value })}
                          />
                        </label>
                      )}
                    </div>
                  )}

                  {selectedLayer.kind !== 'image' && selectedLayer.kind !== 'line' && (
                    <label className="vc-product-range-field">
                      <span>Grosor de borde</span>
                      <b>{selectedLayer.strokeWidth ?? 0} px</b>
                      <input
                        type="range"
                        min="0"
                        max="12"
                        value={selectedLayer.strokeWidth ?? 0}
                        onChange={(event) => updateLayer(selectedLayer.id, { strokeWidth: Number(event.target.value) })}
                      />
                    </label>
                  )}

                  {selectedLayer.kind === 'rectangle' && (
                    <label className="vc-product-range-field">
                      <span>Redondeo esquinas</span>
                      <b>{selectedLayer.cornerRadius ?? 10} px</b>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        value={selectedLayer.cornerRadius ?? 10}
                        onChange={(event) => updateLayer(selectedLayer.id, { cornerRadius: Number(event.target.value) })}
                      />
                    </label>
                  )}

                  <label className="vc-product-range-field">
                    <span>Escala / Tamaño</span>
                    <b>{Math.round(selectedLayer.size)}%</b>
                    <input
                      type="range"
                      min="4"
                      max="85"
                      value={selectedLayer.size}
                      onChange={(event) => updateLayer(selectedLayer.id, { size: Number(event.target.value) })}
                    />
                  </label>

                  {selectedLayer.kind !== 'text' && (
                    <label className="vc-product-range-field">
                      <span>Proporción vertical</span>
                      <b>{Math.round((selectedLayer.scaleY ?? 1) * 100)}%</b>
                      <input
                        type="range"
                        min="0.3"
                        max="2"
                        step="0.05"
                        value={selectedLayer.scaleY ?? 1}
                        onChange={(event) => updateLayer(selectedLayer.id, { scaleY: Number(event.target.value) })}
                      />
                    </label>
                  )}

                  <label className="vc-product-range-field">
                    <span>Rotación</span>
                    <b>{Math.round(selectedLayer.rotation)}°</b>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      value={selectedLayer.rotation}
                      onChange={(event) => updateLayer(selectedLayer.id, { rotation: Number(event.target.value) })}
                    />
                  </label>

                  <label className="vc-product-range-field">
                    <span>Opacidad</span>
                    <b>{selectedLayer.opacity}%</b>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={selectedLayer.opacity}
                      onChange={(event) => updateLayer(selectedLayer.id, { opacity: Number(event.target.value) })}
                    />
                  </label>

                  <label className="vc-product-field">
                    Integración en superficie
                    <select
                      value={selectedLayer.blendMode || 'normal'}
                      onChange={(event) => updateLayer(selectedLayer.id, { blendMode: event.target.value as LayerBlendMode })}
                    >
                      {BLEND_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>

                  <div className="vc-product-position-fields">
                    <label className="vc-product-field">
                      Posición X
                      <input
                        type="number"
                        min={activeBase.printArea.x}
                        max={activeBase.printArea.x + activeBase.printArea.width}
                        value={Math.round(selectedLayer.x)}
                        onChange={(event) =>
                          updateLayer(selectedLayer.id, {
                            x: clamp(Number(event.target.value), activeBase.printArea.x, activeBase.printArea.x + activeBase.printArea.width),
                          })
                        }
                      />
                    </label>
                    <label className="vc-product-field">
                      Posición Y
                      <input
                        type="number"
                        min={activeBase.printArea.y}
                        max={activeBase.printArea.y + activeBase.printArea.height}
                        value={Math.round(selectedLayer.y)}
                        onChange={(event) =>
                          updateLayer(selectedLayer.id, {
                            y: clamp(Number(event.target.value), activeBase.printArea.y, activeBase.printArea.y + activeBase.printArea.height),
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PRODUCTO, COLOR, ADAPTACIÓN DE FORMA Y OBJETOS 3D */}
          {inspectorTab === 'product' && (
            <div className="vc-product-tab-panel" role="tabpanel">
              <div className="vc-product-inspector-section">
                <div className="vc-product-section-heading">
                  <span className="vc-tool-label">Color del producto</span>
                  <button
                    type="button"
                    className={`vc-product-option-chip${appearance.mode === 'original' ? ' is-active' : ''}`}
                    onClick={() => setAppearance((prev) => ({ ...prev, mode: 'original', color: activeBase.defaultColor }))}
                  >
                    Original
                  </button>
                </div>

                <div className="vc-product-swatch-grid" role="group" aria-label="Paleta de color del producto">
                  {PRODUCT_COLOR_SWATCHES.map((swatch) => (
                    <button
                      key={swatch.hex}
                      type="button"
                      className={`vc-product-swatch-btn${appearance.mode === 'custom' && appearance.color.toLowerCase() === swatch.hex.toLowerCase() ? ' is-active' : ''}`}
                      title={swatch.name}
                      aria-label={`Color ${swatch.name}`}
                      style={{ backgroundColor: swatch.hex }}
                      onClick={() => setAppearance((prev) => ({ ...prev, mode: 'custom', color: swatch.hex }))}
                    />
                  ))}
                </div>

                <div className="vc-product-color-pair">
                  <label className="vc-product-field vc-product-color-field">
                    Color base
                    <input
                      type="color"
                      value={appearance.color}
                      onChange={(event) => setAppearance((prev) => ({ ...prev, mode: 'custom', color: event.target.value }))}
                    />
                  </label>
                  <label className="vc-product-field vc-product-color-field">
                    Detalle / asa
                    <input
                      type="color"
                      value={appearance.accentColor}
                      onChange={(event) => setAppearance((prev) => ({ ...prev, mode: 'custom', accentColor: event.target.value }))}
                    />
                  </label>
                </div>

                <label className="vc-product-field">
                  Acabado de material (3D)
                  <div className="vc-product-chip-row">
                    {FINISH_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`vc-product-option-chip${appearance.finish === opt.value ? ' is-active' : ''}`}
                        onClick={() => setAppearance((prev) => ({ ...prev, finish: opt.value }))}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </label>
              </div>

              {!activeBase.isCustom3D && (
                <div className="vc-product-inspector-section">
                  <div className="vc-product-section-heading">
                    <span className="vc-tool-label">Adaptación a la forma</span>
                    <span>2D y 3D</span>
                  </div>
                  <div className="vc-product-chip-row">
                    {WARP_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`vc-product-option-chip${appearance.warpMode === opt.value ? ' is-active' : ''}`}
                        onClick={() =>
                          setAppearance((prev) => ({
                            ...prev,
                            warpMode: opt.value,
                            warpStrength: opt.value === 'flat' ? 0 : Math.max(30, prev.warpStrength),
                          }))
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <label className="vc-product-range-field">
                    <span>Curvatura / envoltura</span>
                    <b>{Math.round(appearance.warpStrength)}%</b>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={appearance.warpStrength}
                      onChange={(event) => setAppearance((prev) => ({ ...prev, warpStrength: Number(event.target.value) }))}
                    />
                  </label>
                </div>
              )}

              {/* Custom 3D Object Controls & Uploader */}
              <div className="vc-product-inspector-section">
                <div className="vc-product-section-heading">
                  <span className="vc-tool-label">Objetos 3D propios</span>
                  <span>GLB · OBJ · STL</span>
                </div>
                <button type="button" className="vc-product-action is-full" onClick={() => model3DInputRef.current?.click()}>
                  <Upload size={14} aria-hidden="true" /> {activeBase.isCustom3D ? 'Subir otro objeto 3D' : 'Subir tu propio objeto 3D'}
                </button>

                {activeCustomModel && (
                  <div className="vc-product-custom3d-controls">
                    <p className="vc-product-empty">
                      Archivo activo: <strong>{activeCustomModel.fileName}</strong>
                    </p>

                    {activeCustomModel.detectedMeshes.length > 0 && (
                      <label className="vc-product-field">
                        Superficie / malla objetivo
                        <select
                          value={activeCustomModel.targetMeshName}
                          onChange={(event) =>
                            updateActiveCustomModel({
                              targetMeshName: event.target.value,
                              decalPoint: null,
                              decalNormal: null,
                            })
                          }
                        >
                          {activeCustomModel.detectedMeshes.map((meshName) => (
                            <option key={meshName} value={meshName}>{meshName}</option>
                          ))}
                        </select>
                      </label>
                    )}

                    <label className="vc-product-field">
                      Modo de adaptación 3D
                      <div className="vc-product-chip-row">
                        <button
                          type="button"
                          className={`vc-product-option-chip${activeCustomModel.projectionMode === 'decal' ? ' is-active' : ''}`}
                          onClick={() => updateActiveCustomModel({ projectionMode: 'decal' })}
                        >
                          Decal curvo (forma)
                        </button>
                        <button
                          type="button"
                          className={`vc-product-option-chip${activeCustomModel.projectionMode === 'uv' ? ' is-active' : ''}`}
                          onClick={() => updateActiveCustomModel({ projectionMode: 'uv', placementMode: false })}
                        >
                          Textura UV directa
                        </button>
                      </div>
                    </label>

                    {activeCustomModel.projectionMode === 'decal' && (
                      <>
                        <div className="vc-product-chip-row">
                          <button
                            type="button"
                            className={`vc-product-action${activeCustomModel.placementMode ? ' is-highlight' : ''}`}
                            onClick={() => {
                              if (viewMode === '2d') setViewMode('3d');
                              updateActiveCustomModel({ placementMode: !activeCustomModel.placementMode });
                            }}
                          >
                            <Crosshair size={14} aria-hidden="true" />
                            {activeCustomModel.placementMode ? 'Haz clic en el 3D…' : 'Colocar con clic en 3D'}
                          </button>
                          {activeCustomModel.decalPoint && (
                            <button
                              type="button"
                              className="vc-product-option-chip"
                              onClick={() => updateActiveCustomModel({ decalPoint: null, decalNormal: null })}
                            >
                              Centrar
                            </button>
                          )}
                        </div>

                        <label className="vc-product-range-field">
                          <span>Escala en 3D</span>
                          <b>{Math.round(activeCustomModel.decalScale)}%</b>
                          <input
                            type="range"
                            min="18"
                            max="140"
                            value={activeCustomModel.decalScale}
                            onChange={(event) => updateActiveCustomModel({ decalScale: Number(event.target.value) })}
                          />
                        </label>
                        <label className="vc-product-range-field">
                          <span>Rotación 3D</span>
                          <b>{Math.round(activeCustomModel.decalRotation)}°</b>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            value={activeCustomModel.decalRotation}
                            onChange={(event) => updateActiveCustomModel({ decalRotation: Number(event.target.value) })}
                          />
                        </label>
                        <label className="vc-product-range-field">
                          <span>Desplazamiento X</span>
                          <b>{activeCustomModel.decalOffsetX.toFixed(2)}</b>
                          <input
                            type="range"
                            min="-1"
                            max="1"
                            step="0.05"
                            value={activeCustomModel.decalOffsetX}
                            onChange={(event) =>
                              updateActiveCustomModel({ decalOffsetX: Number(event.target.value), decalPoint: null, decalNormal: null })
                            }
                          />
                        </label>
                        <label className="vc-product-range-field">
                          <span>Desplazamiento Y</span>
                          <b>{activeCustomModel.decalOffsetY.toFixed(2)}</b>
                          <input
                            type="range"
                            min="-1"
                            max="1"
                            step="0.05"
                            value={activeCustomModel.decalOffsetY}
                            onChange={(event) =>
                              updateActiveCustomModel({ decalOffsetY: Number(event.target.value), decalPoint: null, decalNormal: null })
                            }
                          />
                        </label>
                        <label className="vc-product-range-field">
                          <span>Profundidad de proyección</span>
                          <b>{activeCustomModel.decalDepth.toFixed(2)}</b>
                          <input
                            type="range"
                            min="0.25"
                            max="2"
                            step="0.05"
                            value={activeCustomModel.decalDepth}
                            onChange={(event) => updateActiveCustomModel({ decalDepth: Number(event.target.value) })}
                          />
                        </label>
                      </>
                    )}
                  </div>
                )}
              </div>

              <details className="vc-product-zone-details">
                <summary>
                  Zona imprimible <span>{activeBase.isCustom ? 'Ajustable' : 'Referencial'}</span>
                </summary>
                <p>El arte se recorta dentro del marco cian. Ajusta sus márgenes para que coincidan con tu producto.</p>
                {(['x', 'y', 'width', 'height'] as const).map((field) => {
                  const title = { x: 'Desplazamiento X', y: 'Desplazamiento Y', width: 'Ancho', height: 'Alto' }[field];
                  const value = activeBase.printArea[field];
                  return (
                    <label className="vc-product-range-field" key={field}>
                      <span>{title}</span>
                      <b>{Math.round(value)}%</b>
                      <input
                        type="range"
                        min={field === 'width' || field === 'height' ? 10 : 0}
                        max={
                          field === 'x'
                            ? 100 - activeBase.printArea.width
                            : field === 'y'
                              ? 100 - activeBase.printArea.height
                              : 100 - activeBase.printArea[field === 'width' ? 'x' : 'y']
                        }
                        value={value}
                        onChange={(event) => updatePrintArea(field, Number(event.target.value))}
                      />
                    </label>
                  );
                })}
              </details>
            </div>
          )}

          {/* TAB 3: FONDO DE ESCENA */}
          {inspectorTab === 'background' && (
            <div className="vc-product-tab-panel" role="tabpanel">
              <div className="vc-product-inspector-section">
                <div className="vc-product-section-heading">
                  <span className="vc-tool-label">Fondos de estudio</span>
                  <span>2D y 3D</span>
                </div>

                <div className="vc-product-bg-grid" role="group" aria-label="Elegir fondo de escena">
                  {SCENE_BACKGROUND_PRESETS.map((preset) => {
                    const isActive =
                      background.kind === preset.value.kind &&
                      (preset.value.kind === 'transparent' ||
                        (background.color.toLowerCase() === preset.value.color.toLowerCase() &&
                          background.color2.toLowerCase() === preset.value.color2.toLowerCase()));
                    const previewStyle =
                      preset.value.kind === 'transparent'
                        ? undefined
                        : preset.value.kind === 'solid'
                          ? { background: preset.value.color }
                          : { background: `linear-gradient(${preset.value.angle}deg, ${preset.value.color}, ${preset.value.color2})` };
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={`vc-product-bg-preset${isActive ? ' is-active' : ''}`}
                        onClick={() => setBackground({ ...preset.value })}
                      >
                        <span className={`vc-product-bg-thumb${preset.value.kind === 'transparent' ? ' is-alpha' : ''}`} style={previewStyle} />
                        <span>{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="vc-product-inspector-section">
                <span className="vc-tool-label">Personalizar fondo</span>
                <div className="vc-product-color-pair">
                  <label className="vc-product-field vc-product-color-field">
                    Color 1
                    <input
                      type="color"
                      value={background.color}
                      onChange={(event) =>
                        setBackground((prev) => ({
                          ...prev,
                          kind: prev.kind === 'solid' ? 'solid' : 'gradient',
                          color: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="vc-product-field vc-product-color-field">
                    Color 2
                    <input
                      type="color"
                      value={background.color2}
                      onChange={(event) =>
                        setBackground((prev) => ({
                          ...prev,
                          kind: 'gradient',
                          color2: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                {background.kind === 'gradient' && (
                  <label className="vc-product-range-field">
                    <span>Ángulo del degradado</span>
                    <b>{Math.round(background.angle)}°</b>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={background.angle}
                      onChange={(event) => setBackground((prev) => ({ ...prev, angle: Number(event.target.value) }))}
                    />
                  </label>
                )}

                <input ref={bgImageInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={handleBackgroundImageUpload} />
                <button type="button" className="vc-product-action is-full" onClick={() => bgImageInputRef.current?.click()}>
                  <ImagePlus size={14} aria-hidden="true" /> Subir fondo fotográfico
                </button>
                {background.kind === 'image' && background.imageName && (
                  <div className="vc-product-section-heading">
                    <span className="vc-product-empty">{background.imageName}</span>
                    <button
                      type="button"
                      className="vc-product-option-chip"
                      onClick={() => setBackground({ ...DEFAULT_SCENE_BACKGROUND })}
                    >
                      Quitar
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: EXPORTAR & PROYECTO */}
          {inspectorTab === 'export' && (
            <div className="vc-product-tab-panel" role="tabpanel">
              <div className="vc-product-export-actions">
                <span className="vc-tool-label">Descargar entregables</span>

                {!activeBase.isCustom3D && (
                  <button
                    type="button"
                    className="vc-product-export-button"
                    disabled={Boolean(exporting)}
                    onClick={() => exportDesign('mockup')}
                  >
                    <Download size={15} aria-hidden="true" />
                    {exporting === 'mockup' ? 'Renderizando 2D…' : 'Descargar Mockup 2D PNG (2400 px)'}
                  </button>
                )}

                <button
                  type="button"
                  className="vc-product-export-button"
                  disabled={Boolean(exporting)}
                  onClick={() => exportDesign('mockup-3d')}
                >
                  <Camera size={15} aria-hidden="true" />
                  {exporting === 'mockup-3d' ? 'Capturando 3D…' : 'Descargar Mockup 3D PNG'}
                </button>

                <button
                  type="button"
                  className="vc-product-export-button is-secondary"
                  disabled={Boolean(exporting)}
                  onClick={() => exportDesign('mockup-3d-alpha')}
                >
                  <Camera size={15} aria-hidden="true" />
                  {exporting === 'mockup-3d-alpha' ? 'Capturando 3D…' : 'Mockup 3D sin fondo (PNG alfa)'}
                </button>

                <button
                  type="button"
                  className="vc-product-export-button is-secondary"
                  disabled={Boolean(exporting)}
                  onClick={() => exportDesign('art')}
                >
                  <Download size={15} aria-hidden="true" />
                  {exporting === 'art' ? 'Preparando arte…' : 'Descargar Arte de impresión PNG'}
                </button>

                <div className="vc-product-export-divider" />

                <span className="vc-tool-label">Proyecto editable (.vcdesign.json)</span>
                <div className="vc-product-position-fields">
                  <button
                    type="button"
                    className="vc-product-action"
                    disabled={Boolean(projectAction || exporting)}
                    onClick={handleSaveProject}
                  >
                    <Save size={14} aria-hidden="true" /> {projectAction === 'save' ? 'Guardando…' : 'Guardar'}
                  </button>
                  <button
                    type="button"
                    className="vc-product-action"
                    disabled={Boolean(projectAction || exporting)}
                    onClick={() => projectInputRef.current?.click()}
                  >
                    <FolderOpen size={14} aria-hidden="true" /> {projectAction === 'open' ? 'Abriendo…' : 'Abrir'}
                  </button>
                </div>

                <button type="button" className="vc-product-reset-button" onClick={resetDesign}>
                  <RotateCcw size={14} aria-hidden="true" /> Reiniciar composición
                </button>

                {!activeBase.isCustom && (
                  <Link
                    className="vc-product-quote-button"
                    to={`${quotePath}?servicio=${encodeURIComponent(activeBase.family)}&producto=${encodeURIComponent(activeBase.quoteProduct)}`}
                  >
                    Cotizar {activeBase.name.toLowerCase()} <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Quick persistent Export/Quote shortcut footer on non-export tabs */}
          {inspectorTab !== 'export' && (
            <div className="vc-product-inspector-footer">
              <button
                type="button"
                className="vc-product-export-button"
                disabled={Boolean(exporting)}
                onClick={() => exportDesign(viewMode === '3d' || activeBase.isCustom3D ? 'mockup-3d' : 'mockup')}
              >
                <Download size={14} aria-hidden="true" />
                {exporting
                  ? 'Exportando…'
                  : viewMode === '3d' || activeBase.isCustom3D
                    ? 'Descargar 3D PNG'
                    : 'Descargar Mockup PNG'}
              </button>
              {!activeBase.isCustom && (
                <Link
                  className="vc-product-quote-button"
                  to={`${quotePath}?servicio=${encodeURIComponent(activeBase.family)}&producto=${encodeURIComponent(activeBase.quoteProduct)}`}
                >
                  Cotizar {activeBase.name.toLowerCase()} <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              )}
            </div>
          )}
        </aside>
      </div>

      <p className="vc-product-studio-shortcuts">
        Atajos: arrastra para mover con imán al centro · Ctrl/Cmd+Z deshacer · Ctrl/Cmd+D duplicar · flechas ajuste fino · Suprimir eliminar.
      </p>
      {message && (
        <p className="vc-layout-editor-status" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </section>
  );
}
