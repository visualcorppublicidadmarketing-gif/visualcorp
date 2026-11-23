import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Circle,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  ImagePlus,
  Lock,
  Plus,
  RectangleHorizontal,
  Redo2,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Triangle,
  Type,
  Undo2,
  Unlock,
} from 'lucide-react';
import { createArtworkCanvas, createMockupCanvas, downloadCanvas } from './product-design/canvas-utils';
import { DEFAULT_PRODUCT_ID, getDefaultLogoLayer, PRODUCT_BASES } from './product-design/products';
import { DESIGN_FONT_OPTIONS, designProjectFilename, MAX_PROJECT_FILE_BYTES, restoreDesignProject, serializeDesignProject } from './product-design/project-file';
import type { DesignLayer, PrintArea, ProductBase } from './product-design/types';
import './creative-tools.css';
import './product-design/product-design.css';

const ProductDesignCanvas = lazy(() => import('./product-design/ProductDesignCanvas').then((module) => ({ default: module.ProductDesignCanvas })));
const ThreeDProductPreview = lazy(() => import('./product-design/ThreeDProductPreview').then((module) => ({ default: module.ThreeDProductPreview })));
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

type StudioHistory = { past: DesignLayer[][]; future: DesignLayer[][]; lastKey: string; lastAt: number };

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

function createLayer(kind: DesignLayer['kind'], area: PrintArea): DesignLayer {
  const x = area.x + area.width / 2;
  const y = area.y + area.height / 2;
  const size = Math.max(10, Math.min(26, area.width * 0.7));
  const shared = {
    id: createId('layer'), x, y, size, rotation: 0, opacity: 100, color: '#e5007e',
    fontFamily: 'DM Sans', visible: true, locked: false,
  };
  if (kind === 'text') return { ...shared, kind, name: 'Texto nuevo', text: 'Tu mensaje', color: '#ffffff' };
  if (kind === 'rectangle') return { ...shared, kind, name: 'Franja' };
  if (kind === 'circle') return { ...shared, kind, name: 'Círculo' };
  return { ...shared, kind: 'triangle', name: 'Triángulo' };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function fileTypeIsSupported(file: File) {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
}

export function ProductDesignStudio({ initialBaseId, quotePath = '/cotizador' }: { initialBaseId?: string; quotePath?: string }) {
  const layerInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const layersRef = useRef<DesignLayer[]>([]);
  const historyRef = useRef<StudioHistory>({ past: [], future: [], lastKey: '', lastAt: 0 });
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const canvasViewerRef = useRef<HTMLDivElement>(null);
  const [products, setProducts] = useState<ProductBase[]>(PRODUCT_BASES);
  const initialBase = PRODUCT_BASES.find((product) => product.id === initialBaseId) || PRODUCT_BASES.find((product) => product.id === DEFAULT_PRODUCT_ID) || PRODUCT_BASES[0];
  const [baseId, setBaseId] = useState(initialBase.id);
  const [layers, setLayers] = useState<DesignLayer[]>(() => [getDefaultLogoLayer(initialBase)]);
  const [selectedLayerId, setSelectedLayerId] = useState('brand-logo');
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [artworkUrl, setArtworkUrl] = useState('');
  const [exporting, setExporting] = useState<'mockup' | 'art' | ''>('');
  const [projectAction, setProjectAction] = useState<'save' | 'open' | ''>('');
  const [message, setMessage] = useState('');
  const activeBase = useMemo(() => products.find((product) => product.id === baseId) || products[0], [products, baseId]);
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) || null;
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;
  const canvasHeight = canvasWidth > 0 ? canvasWidth / activeBase.ratio : 0;

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => () => objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const availableWidth = entry.contentRect.width;
      const maxHeight = 620;
      const width = Math.max(0, Math.min(availableWidth, 660, maxHeight * activeBase.ratio));
      setCanvasWidth(Math.floor(width));
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [activeBase.ratio]);

  useEffect(() => {
    if (viewMode !== '3d') return undefined;
    let cancelled = false;
    setArtworkUrl('');
    createArtworkCanvas(activeBase, layers, 1024)
      .then((canvas) => canvas.toDataURL('image/png'))
      .then((url) => { if (!cancelled) setArtworkUrl(url); })
      .catch(() => { if (!cancelled) setMessage('No se pudo preparar la textura 3D. El diseño sigue disponible en 2D.'); });
    return () => { cancelled = true; };
  }, [activeBase, layers, viewMode]);

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
    commitLayers(current.map((layer) => layer.id === id ? { ...layer, ...changes } : layer), key || `property:${id}:${Object.keys(changes).sort().join('-')}`);
  };

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
    setMessage('Elemento añadido al diseño.');
  };

  const selectProduct = (product: ProductBase) => {
    setBaseId(product.id);
    const nextLayers = layersRef.current.map((layer) => layer.id === 'brand-logo'
      ? { ...layer, x: product.defaultX, y: product.defaultY, size: product.defaultSize, rotation: 0 }
      : layer);
    commitLayers(nextLayers, `product:${product.id}`);
    setSelectedLayerId('brand-logo');
    setMessage(`Vista de ${product.name}.`);
  };

  const duplicateSelectedLayer = () => {
    if (!selectedLayer) return;
    addLayer({ ...selectedLayer, id: createId('layer'), name: `${selectedLayer.name} · copia`, x: clamp(selectedLayer.x + 4, activeBase.printArea.x, activeBase.printArea.x + activeBase.printArea.width), y: clamp(selectedLayer.y + 4, activeBase.printArea.y, activeBase.printArea.y + activeBase.printArea.height), locked: false });
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
      id: createId('layer'), kind: 'image', name: file.name.slice(0, 70), src,
      x: activeBase.printArea.x + activeBase.printArea.width / 2,
      y: activeBase.printArea.y + activeBase.printArea.height / 2,
      size: Math.min(30, activeBase.printArea.width * 0.68), rotation: 0, opacity: 100,
      color: '#ffffff', fontFamily: 'DM Sans', visible: true, locked: false,
    });
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
        id: createId('custom'), name: file.name.replace(/\.[^.]+$/, '').slice(0, 34) || 'Producto propio',
        family: 'Producto propio', image: src, quoteProduct: '', ratio: dimensions.width / Math.max(1, dimensions.height), model: 'custom',
        printArea: { x: 20, y: 20, width: 60, height: 60 }, defaultX: 50, defaultY: 50, defaultSize: 24,
        hint: 'Ajusta la zona imprimible para tu foto', isCustom: true,
      };
      setProducts((current) => [...current, product]);
      setBaseId(product.id);
      setSelectedLayerId('brand-logo');
      setMessage('Base propia cargada. Ajusta el marco de impresión a tu producto.');
    } catch {
      URL.revokeObjectURL(src);
      objectUrlsRef.current = objectUrlsRef.current.filter((url) => url !== src);
      setMessage('No se pudo cargar la foto. Prueba con otra imagen.');
    }
  };

  const handleSaveProject = async () => {
    if (projectAction || exporting) return;
    setProjectAction('save');
    setMessage('Preparando el archivo de proyecto…');
    try {
      const contents = await serializeDesignProject(activeBase, layersRef.current);
      const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
      if (blob.size > MAX_PROJECT_FILE_BYTES) throw new Error('El archivo de proyecto supera el límite de 32 MB.');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = designProjectFilename(activeBase.name);
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage('Proyecto guardado en un archivo local. Puedes abrirlo después desde este editor.');
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
      setProducts((current) => product.isCustom
        ? [...current, product]
        : current.map((existing) => existing.id === product.id ? product : existing));
      setBaseId(product.id);
      layersRef.current = restored.layers;
      setLayers(restored.layers);
      historyRef.current = { past: [], future: [], lastKey: '', lastAt: 0 };
      setSelectedLayerId(restored.layers.at(-1)?.id || '');
      setViewMode('2d');
      setMessage(`Proyecto abierto: ${product.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo abrir el proyecto.');
    } finally {
      setProjectAction('');
    }
  };

  const updatePrintArea = (field: keyof PrintArea, value: number) => {
    setProducts((current) => current.map((product) => {
      if (product.id !== activeBase.id) return product;
      const next = { ...product.printArea };
      if (field === 'x') next.x = clamp(value, 0, 100 - next.width);
      if (field === 'y') next.y = clamp(value, 0, 100 - next.height);
      if (field === 'width') next.width = clamp(value, 10, 100 - next.x);
      if (field === 'height') next.height = clamp(value, 10, 100 - next.y);
      return { ...product, printArea: next };
    }));
  };

  const resetDesign = () => {
    const nextLayers = [getDefaultLogoLayer(activeBase)];
    commitLayers(nextLayers, `reset:${activeBase.id}`);
    setSelectedLayerId('brand-logo');
    setMessage('Diseño restablecido con el logo de muestra.');
  };

  const exportDesign = async (kind: 'mockup' | 'art') => {
    if (exporting) return;
    setExporting(kind);
    setMessage('');
    try {
      const canvas = kind === 'mockup'
        ? await createMockupCanvas(activeBase, layers, 2400)
        : await createArtworkCanvas(activeBase, layers, 4000);
      await downloadCanvas(canvas, `visualcorp-${kind === 'mockup' ? 'mockup' : 'arte-impresion'}-${activeBase.id}.png`);
      setMessage(kind === 'mockup' ? 'Mockup PNG descargado.' : 'Arte de impresión PNG descargado con fondo transparente.');
    } catch {
      setMessage('No se pudo exportar el PNG. Revisa las imágenes e inténtalo de nuevo.');
    } finally {
      setExporting('');
    }
  };

  const handleCanvasKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLElement && (target.closest('input, textarea, select, button, [contenteditable="true"]'))) return;
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

  return (
    <section id="probador-logo" className="vc-tool-card vc-product-studio" aria-labelledby="vc-product-studio-title">
      <div className="vc-tool-card-head">
        <div>
          <span className="vc-tool-kicker"><Sparkles size={14} aria-hidden="true" /> ESTUDIO DE DISEÑO DE PRODUCTOS</span>
          <h2 id="vc-product-studio-title">Diseña sobre productos y formatos reales</h2>
          <p>Trabaja con capas de imágenes, textos y formas. Ajusta la zona imprimible, rota y redimensiona cada objeto, y compara tu composición en 2D o en una vista 3D.</p>
        </div>
        <span className="vc-tool-privacy"><ShieldCheck size={14} aria-hidden="true" /> Las imágenes se procesan en este navegador</span>
      </div>

      <div className="vc-product-template-heading">
        <span className="vc-tool-label">Elige una base</span>
        <button type="button" className="vc-product-add-own" onClick={() => productInputRef.current?.click()}><ImagePlus size={15} aria-hidden="true" /> Usar foto propia</button>
        <input ref={productInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={handleProductUpload} />
      </div>
      <div className="vc-product-template-grid" role="group" aria-label="Elegir producto base">
        {products.map((product) => (
          <button key={product.id} type="button" className={`vc-product-template${product.id === activeBase.id ? ' is-active' : ''}`} aria-pressed={product.id === activeBase.id} onClick={() => selectProduct(product)}>
            <img src={product.image} alt="" loading="lazy" />
            <span><b>{product.name}</b><small>{product.family}</small></span>
          </button>
        ))}
      </div>

      <div className="vc-product-editor-toolbar">
        <div className="vc-product-tool-group" role="group" aria-label="Añadir elementos">
          <button type="button" className="vc-product-action" onClick={() => addLayer(createLayer('text', activeBase.printArea))}><Type size={15} aria-hidden="true" /> Texto</button>
          <button type="button" className="vc-product-action" onClick={() => addLayer(createLayer('rectangle', activeBase.printArea))}><RectangleHorizontal size={15} aria-hidden="true" /> Franja</button>
          <button type="button" className="vc-product-action" onClick={() => addLayer(createLayer('circle', activeBase.printArea))}><Circle size={15} aria-hidden="true" /> Círculo</button>
          <button type="button" className="vc-product-action" onClick={() => addLayer(createLayer('triangle', activeBase.printArea))}><Triangle size={15} aria-hidden="true" /> Triángulo</button>
          <input ref={layerInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={handleImageUpload} />
          <button type="button" className="vc-product-action" onClick={() => layerInputRef.current?.click()}><ImagePlus size={15} aria-hidden="true" /> Imagen</button>
        </div>
        <div className="vc-product-tool-group" role="group" aria-label="Archivo de proyecto">
          <input ref={projectInputRef} type="file" accept=".vcdesign.json,.json,application/json" className="sr-only" onChange={handleOpenProject} />
          <button type="button" className="vc-product-action" onClick={handleSaveProject} disabled={Boolean(projectAction || exporting)}><Save size={15} aria-hidden="true" /> {projectAction === 'save' ? 'Guardando…' : 'Guardar proyecto'}</button>
          <button type="button" className="vc-product-action" onClick={() => projectInputRef.current?.click()} disabled={Boolean(projectAction || exporting)}><FolderOpen size={15} aria-hidden="true" /> {projectAction === 'open' ? 'Abriendo…' : 'Abrir proyecto'}</button>
        </div>
        <div className="vc-product-tool-group" role="group" aria-label="Historial">
          <button type="button" className="vc-product-icon-button" aria-label="Deshacer" title="Deshacer · Ctrl/Cmd+Z" disabled={!canUndo} onClick={undo}><Undo2 size={16} aria-hidden="true" /></button>
          <button type="button" className="vc-product-icon-button" aria-label="Rehacer" title="Rehacer · Ctrl/Cmd+Shift+Z" disabled={!canRedo} onClick={redo}><Redo2 size={16} aria-hidden="true" /></button>
          <button type="button" className="vc-product-icon-button" aria-label="Duplicar elemento seleccionado" title="Duplicar · Ctrl/Cmd+D" disabled={!selectedLayer} onClick={duplicateSelectedLayer}><Copy size={15} aria-hidden="true" /></button>
        </div>
        <div className="vc-product-view-switch" role="group" aria-label="Tipo de vista">
          <button type="button" className={viewMode === '2d' ? 'is-active' : ''} aria-pressed={viewMode === '2d'} onClick={() => setViewMode('2d')}>Lienzo 2D</button>
          <button type="button" className={viewMode === '3d' ? 'is-active' : ''} aria-pressed={viewMode === '3d'} onClick={() => setViewMode('3d')}>Vista 3D</button>
        </div>
      </div>

      <div className="vc-product-editor-layout">
        <div className="vc-product-canvas-column">
          <div
            className="vc-product-canvas-viewer"
            ref={canvasViewerRef}
            tabIndex={0}
            onKeyDown={handleCanvasKeys}
            onPointerDownCapture={focusCanvasOnPointer}
            aria-label={`Vista de diseño para ${activeBase.name}. Atajos: flechas para mover, Suprimir para eliminar, Ctrl o Comando Z para deshacer.`}
          >
            <div ref={canvasHostRef} className="vc-product-canvas-surface">
              {viewMode === '2d' ? (
                <Suspense fallback={<div className="vc-product-canvas-loading" role="status">Cargando el lienzo…</div>}>
                  <ProductDesignCanvas
                    product={activeBase}
                    layers={layers}
                    selectedLayerId={selectedLayerId}
                    printArea={activeBase.printArea}
                    width={canvasWidth}
                    height={canvasHeight}
                    onSelectLayer={setSelectedLayerId}
                    onClearSelection={() => setSelectedLayerId('')}
                    onCommitLayer={(id, changes) => updateLayer(id, changes, `canvas:${id}`)}
                  />
                </Suspense>
              ) : (
                <Suspense fallback={<div className="vc-product-canvas-loading" role="status">Preparando vista 3D…</div>}>
                  {artworkUrl ? <ThreeDProductPreview product={activeBase} artworkUrl={artworkUrl} /> : <div className="vc-product-canvas-loading" role="status">Preparando textura 3D…</div>}
                </Suspense>
              )}
            </div>
          </div>
          <div className="vc-product-canvas-caption">
            <span>{viewMode === '2d' ? `${activeBase.hint} · arrastra o usa los controles` : 'La vista 3D es esquemática y conserva el arte de la zona imprimible.'}</span>
            <span>Composición referencial; medidas, materiales y técnicas deben confirmarse al cotizar.</span>
          </div>
        </div>

        <aside className="vc-product-inspector" aria-label="Herramientas y propiedades">
          <div className="vc-product-inspector-section">
            <div className="vc-product-section-heading"><span className="vc-tool-label">Capas</span><span>{layers.length}</span></div>
            {layers.length === 0 ? <p className="vc-product-empty">Añade una imagen, un texto o una forma para iniciar.</p> : (
              <div className="vc-product-layer-list" role="list" aria-label="Capas del diseño">
                {[...layers].reverse().map((layer, index, visibleLayers) => (
                  <div className={`vc-product-layer-row${layer.id === selectedLayerId ? ' is-active' : ''}`} key={layer.id} role="listitem">
                    <button type="button" className="vc-product-layer-select" aria-pressed={layer.id === selectedLayerId} onClick={() => setSelectedLayerId(layer.id)}>
                      <span className="vc-product-layer-number">{visibleLayers.length - index}</span><span className="vc-product-layer-name">{layer.name}</span>
                    </button>
                    <button type="button" className="vc-product-layer-icon" aria-label={layer.visible ? `Ocultar ${layer.name}` : `Mostrar ${layer.name}`} title={layer.visible ? 'Ocultar capa' : 'Mostrar capa'} onClick={() => updateLayer(layer.id, { visible: !layer.visible }, `visible:${layer.id}`)}>{layer.visible ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}</button>
                    <button type="button" className="vc-product-layer-icon" aria-label={layer.locked ? `Desbloquear ${layer.name}` : `Bloquear ${layer.name}`} title={layer.locked ? 'Desbloquear' : 'Bloquear'} onClick={() => updateLayer(layer.id, { locked: !layer.locked }, `locked:${layer.id}`)}>{layer.locked ? <Lock size={14} aria-hidden="true" /> : <Unlock size={14} aria-hidden="true" />}</button>
                    <button type="button" className="vc-product-layer-icon" aria-label={`Subir ${layer.name}`} title="Traer al frente" disabled={index === 0} onClick={() => reorderLayer(layer.id, 1)}><ChevronUp size={14} aria-hidden="true" /></button>
                    <button type="button" className="vc-product-layer-icon" aria-label={`Bajar ${layer.name}`} title="Enviar al fondo" disabled={index === visibleLayers.length - 1} onClick={() => reorderLayer(layer.id, -1)}><ChevronDown size={14} aria-hidden="true" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedLayer && (
            <div className="vc-product-inspector-section">
              <div className="vc-product-section-heading"><span className="vc-tool-label">Elemento seleccionado</span><button type="button" className="vc-product-layer-icon" aria-label={`Eliminar ${selectedLayer.name}`} onClick={removeSelectedLayer}><Trash2 size={14} aria-hidden="true" /></button></div>
              {selectedLayer.kind === 'text' && <>
                <label className="vc-product-field">Texto
                  <textarea value={selectedLayer.text || ''} maxLength={120} rows={3} onChange={(event) => updateLayer(selectedLayer.id, { text: event.target.value, name: event.target.value.trim().slice(0, 35) || 'Texto nuevo' }, `text:${selectedLayer.id}`)} />
                </label>
                <label className="vc-product-field">Tipografía
                  <select value={selectedLayer.fontFamily} onChange={(event) => updateLayer(selectedLayer.id, { fontFamily: event.target.value })}>
                    {DESIGN_FONT_OPTIONS.map((font) => <option value={font} key={font}>{font}</option>)}
                  </select>
                </label>
              </>}
              {selectedLayer.kind !== 'image' && <label className="vc-product-field vc-product-color-field">Color <input type="color" value={selectedLayer.color} onChange={(event) => updateLayer(selectedLayer.id, { color: event.target.value })} /></label>}
              <label className="vc-product-range-field"><span>Tamaño</span><b>{Math.round(selectedLayer.size)}%</b><input type="range" min="5" max="65" value={selectedLayer.size} onChange={(event) => updateLayer(selectedLayer.id, { size: Number(event.target.value) })} /></label>
              <label className="vc-product-range-field"><span>Rotación</span><b>{Math.round(selectedLayer.rotation)}°</b><input type="range" min="-180" max="180" value={selectedLayer.rotation} onChange={(event) => updateLayer(selectedLayer.id, { rotation: Number(event.target.value) })} /></label>
              <label className="vc-product-range-field"><span>Opacidad</span><b>{selectedLayer.opacity}%</b><input type="range" min="10" max="100" value={selectedLayer.opacity} onChange={(event) => updateLayer(selectedLayer.id, { opacity: Number(event.target.value) })} /></label>
              <div className="vc-product-position-fields">
                <label className="vc-product-field">Posición X<input type="number" min={activeBase.printArea.x} max={activeBase.printArea.x + activeBase.printArea.width} value={Math.round(selectedLayer.x)} onChange={(event) => updateLayer(selectedLayer.id, { x: clamp(Number(event.target.value), activeBase.printArea.x, activeBase.printArea.x + activeBase.printArea.width) })} /></label>
                <label className="vc-product-field">Posición Y<input type="number" min={activeBase.printArea.y} max={activeBase.printArea.y + activeBase.printArea.height} value={Math.round(selectedLayer.y)} onChange={(event) => updateLayer(selectedLayer.id, { y: clamp(Number(event.target.value), activeBase.printArea.y, activeBase.printArea.y + activeBase.printArea.height) })} /></label>
              </div>
            </div>
          )}

          <details className="vc-product-zone-details">
            <summary>Zona imprimible <span>{activeBase.isCustom ? 'Ajustable' : 'Referencial'}</span></summary>
            <p>El arte se recorta dentro de este marco cian. Ajusta la zona para que coincida con tu producto.</p>
            {(['x', 'y', 'width', 'height'] as const).map((field) => {
              const title = { x: 'Desplazamiento horizontal', y: 'Desplazamiento vertical', width: 'Ancho', height: 'Alto' }[field];
              const value = activeBase.printArea[field];
              return <label className="vc-product-range-field" key={field}><span>{title}</span><b>{Math.round(value)}%</b><input type="range" min={field === 'width' || field === 'height' ? 10 : 0} max={field === 'x' ? 100 - activeBase.printArea.width : field === 'y' ? 100 - activeBase.printArea.height : 100 - activeBase.printArea[field === 'width' ? 'x' : 'y']} value={value} onChange={(event) => updatePrintArea(field, Number(event.target.value))} /></label>;
            })}
          </details>

          <div className="vc-product-export-actions">
            <button type="button" className="vc-product-export-button" disabled={Boolean(exporting)} onClick={() => exportDesign('mockup')}><Download size={15} aria-hidden="true" /> {exporting === 'mockup' ? 'Preparando mockup…' : 'Descargar mockup PNG'}</button>
            <button type="button" className="vc-product-export-button is-secondary" disabled={Boolean(exporting)} onClick={() => exportDesign('art')}><Download size={15} aria-hidden="true" /> {exporting === 'art' ? 'Preparando arte…' : 'Descargar arte de impresión'}</button>
            <button type="button" className="vc-product-reset-button" onClick={resetDesign}><RotateCcw size={14} aria-hidden="true" /> Reiniciar diseño</button>
            {!activeBase.isCustom && <Link className="vc-product-quote-button" to={`${quotePath}?servicio=${encodeURIComponent(activeBase.family)}&producto=${encodeURIComponent(activeBase.quoteProduct)}`}>Cotizar {activeBase.name.toLowerCase()} <ArrowUpRight size={15} aria-hidden="true" /></Link>}
          </div>
        </aside>
      </div>

      <p className="vc-product-studio-shortcuts">Atajos en el lienzo: arrastra para mover · Ctrl/Cmd+Z deshacer · Ctrl/Cmd+D duplicar · flechas ajustar posición · Suprimir eliminar.</p>
      {message && <p className="vc-layout-editor-status" role="status" aria-live="polite">{message}</p>}
    </section>
  );
}
