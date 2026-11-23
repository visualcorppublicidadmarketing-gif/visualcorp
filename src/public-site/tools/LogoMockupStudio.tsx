import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Circle,
  ChevronDown,
  ChevronUp,
  Download,
  ImagePlus,
  Move,
  Plus,
  RectangleHorizontal,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
} from 'lucide-react';
import './creative-tools.css';

type MockupBase = {
  id: string;
  name: string;
  family: string;
  image: string;
  quoteProduct: string;
  defaultX: number;
  defaultY: number;
  defaultScale: number;
  hint: string;
};

type DesignLayer = {
  id: string;
  kind: 'image' | 'text' | 'rectangle' | 'circle';
  name: string;
  src?: string;
  text?: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  opacity: number;
  color: string;
};

const MOCKUP_BASES: MockupBase[] = [
  { id: 'camiseta', name: 'Camiseta', family: 'Textil y promocionales', image: '/images/catalog-products/camiseta_base.webp', quoteProduct: 'Camiseta personalizada', defaultX: 50, defaultY: 42, defaultScale: 24, hint: 'Zona pecho · sublimación o DTF' },
  { id: 'taza', name: 'Taza', family: 'Textil y promocionales', image: '/images/catalog-products/taza_base.webp', quoteProduct: 'Taza personalizada', defaultX: 43, defaultY: 44, defaultScale: 24, hint: 'Zona frontal · sublimación' },
  { id: 'gorra', name: 'Gorra', family: 'Textil y promocionales', image: '/images/catalog-products/gorra_base.webp', quoteProduct: 'Gorra personalizada', defaultX: 50, defaultY: 40, defaultScale: 22, hint: 'Frente central · DTF o bordado' },
  { id: 'bolsa', name: 'Bolso Tote', family: 'Textil y promocionales', image: '/images/catalog-products/bolsa_base.webp', quoteProduct: 'Bolso corporativo personalizado', defaultX: 55, defaultY: 56, defaultScale: 25, hint: 'Cara frontal · estampado o sublimación' },
  { id: 'rotulo', name: 'Rótulo', family: 'Rótulos y fachadas', image: '/images/catalog-products/rotulo_base.webp', quoteProduct: 'Rótulo comercial', defaultX: 54, defaultY: 46, defaultScale: 30, hint: 'Panel central · impresión o corte' },
  { id: 'rollup', name: 'Roll-Up', family: 'Exhibición y eventos', image: '/images/catalog-products/roll_up_base.webp', quoteProduct: 'Roll-Up publicitario', defaultX: 50, defaultY: 36, defaultScale: 28, hint: 'Zona superior visible · gran formato' },
];

const DEMO_LOGO = '/brand/visualcorp-symbol.png';
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

function createLayerId() {
  return `layer-${crypto.randomUUID()}`;
}

function initialLogoLayer(base: MockupBase): DesignLayer {
  return {
    id: 'brand-logo',
    kind: 'image',
    name: 'Logo de muestra',
    src: DEMO_LOGO,
    x: base.defaultX,
    y: base.defaultY,
    size: base.defaultScale,
    rotation: 0,
    opacity: 96,
    color: '#ffffff',
  };
}

export function LogoMockupStudio({ initialBaseId, quotePath = '/cotizador' }: { initialBaseId?: string; quotePath?: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const initialBase = MOCKUP_BASES.find((base) => base.id === initialBaseId) || MOCKUP_BASES[0];
  const [baseId, setBaseId] = useState(initialBase.id);
  const [layers, setLayers] = useState<DesignLayer[]>([initialLogoLayer(initialBase)]);
  const [selectedLayerId, setSelectedLayerId] = useState('brand-logo');
  const [draggingLayerId, setDraggingLayerId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const activeBase = MOCKUP_BASES.find((base) => base.id === baseId) || MOCKUP_BASES[0];
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) || null;

  useEffect(() => () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const updateLayer = (id: string, changes: Partial<DesignLayer>) => {
    setLayers((current) => current.map((layer) => layer.id === id ? { ...layer, ...changes } : layer));
  };

  const moveLayer = (id: string, direction: -1 | 1) => {
    setLayers((current) => {
      const index = current.findIndex((layer) => layer.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
      return reordered;
    });
  };

  const addLayer = (layer: Omit<DesignLayer, 'id'>) => {
    const nextLayer = { ...layer, id: createLayerId() };
    setLayers((current) => [...current, nextLayer]);
    setSelectedLayerId(nextLayer.id);
    setMessage('Elemento añadido al diseño.');
  };

  const addText = () => addLayer({
    kind: 'text', name: 'Texto nuevo', text: 'Tu mensaje', x: 50, y: 72, size: 24,
    rotation: 0, opacity: 100, color: '#ffffff',
  });

  const addShape = (kind: 'rectangle' | 'circle') => addLayer({
    kind, name: kind === 'circle' ? 'Círculo' : 'Franja', x: 50, y: 78, size: 18,
    rotation: 0, opacity: 82, color: '#e5007e',
  });

  const selectBase = (base: MockupBase) => {
    setBaseId(base.id);
    updateLayer('brand-logo', { x: base.defaultX, y: base.defaultY, size: base.defaultScale, rotation: 0 });
  };

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage('Elige una imagen PNG, JPG, WebP o SVG.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setMessage('La imagen debe pesar menos de 12 MB.');
      return;
    }

    const src = URL.createObjectURL(file);
    objectUrlsRef.current.push(src);
    addLayer({
      kind: 'image', name: file.name, src, x: 50, y: 50, size: 24,
      rotation: 0, opacity: 100, color: '#ffffff',
    });
  };

  const updatePointerPos = (event: PointerEvent<HTMLDivElement>, layerId: string) => {
    const stage = stageRef.current;
    const layer = layers.find((item) => item.id === layerId);
    if (!stage || !layer) return;
    const rect = stage.getBoundingClientRect();
    const edge = Math.min(27, layer.size / 2);
    const x = Math.min(100 - edge, Math.max(edge, ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100));
    const y = Math.min(100 - edge, Math.max(edge, ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100));
    updateLayer(layerId, { x: Math.round(x), y: Math.round(y) });
  };

  const handleStagePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-design-layer-id]') : null;
    if (!target) return;
    const layerId = target.dataset.designLayerId || '';
    if (!layerId) return;
    setSelectedLayerId(layerId);
    setDraggingLayerId(layerId);
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePointerPos(event, layerId);
  };

  const handleStagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (draggingLayerId) updatePointerPos(event, draggingLayerId);
  };

  const handleStagePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    setDraggingLayerId('');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const exportDesign = async () => {
    if (exporting) return;
    setExporting(true);
    setMessage('');
    try {
      const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      });

      const imageSources = layers.filter((layer) => layer.kind === 'image' && layer.src).map((layer) => layer.src!);
      const [baseImage, ...designImages] = await Promise.all([activeBase.image, ...imageSources].map(loadImage));
      const imageBySource = new Map(imageSources.map((source, index) => [source, designImages[index]]));
      const size = 1200;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No se pudo preparar la imagen.');

      const background = context.createRadialGradient(size * 0.5, size * 0.42, 60, size * 0.5, size * 0.5, size * 0.72);
      background.addColorStop(0, '#f5f2f9');
      background.addColorStop(1, '#e4dfee');
      context.fillStyle = background;
      context.fillRect(0, 0, size, size);

      const pad = 72;
      const baseScale = Math.min((size - pad * 2) / baseImage.naturalWidth, (size - pad * 2) / baseImage.naturalHeight);
      const baseWidth = baseImage.naturalWidth * baseScale;
      const baseHeight = baseImage.naturalHeight * baseScale;
      context.drawImage(baseImage, (size - baseWidth) / 2, (size - baseHeight) / 2, baseWidth, baseHeight);

      layers.forEach((layer) => {
        const centerX = (layer.x / 100) * size;
        const centerY = (layer.y / 100) * size;
        const width = (layer.size / 100) * size;
        context.save();
        context.translate(centerX, centerY);
        context.rotate((layer.rotation * Math.PI) / 180);
        context.globalAlpha = layer.opacity / 100;

        if (layer.kind === 'image' && layer.src) {
          const image = imageBySource.get(layer.src);
          if (image) {
            const aspect = image.naturalWidth / Math.max(1, image.naturalHeight);
            const imageWidth = aspect >= 1 ? width : width * aspect;
            const imageHeight = aspect >= 1 ? width / aspect : width;
            context.drawImage(image, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
          }
        } else if (layer.kind === 'text') {
          context.fillStyle = layer.color;
          context.font = `700 ${Math.max(18, Math.round(width * 0.28))}px "DM Sans", Arial, sans-serif`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          const maxTextWidth = width * 0.84;
          const words = (layer.text || '').trim().split(/\s+/).filter(Boolean);
          const lines: string[] = [];
          let line = '';
          words.forEach((word) => {
            const nextLine = line ? `${line} ${word}` : word;
            if (line && context.measureText(nextLine).width > maxTextWidth) {
              lines.push(line);
              line = word;
            } else {
              line = nextLine;
            }
          });
          if (line) lines.push(line);
          const lineHeight = Math.max(22, Math.round(width * 0.34));
          lines.forEach((textLine, index) => {
            context.fillText(textLine, 0, (index - (lines.length - 1) / 2) * lineHeight, maxTextWidth);
          });
        } else {
          context.fillStyle = layer.color;
          if (layer.kind === 'circle') {
            context.beginPath();
            context.arc(0, 0, width / 2, 0, Math.PI * 2);
            context.fill();
          } else {
            context.fillRect(-width / 2, -width / 4, width, width / 2);
          }
        }
        context.restore();
      });

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `visualcorp-diseno-${activeBase.id}.png`;
      link.click();
      setMessage('Diseño descargado como PNG.');
    } catch {
      setMessage('No se pudo exportar el diseño. Revisa las imágenes y vuelve a intentarlo.');
    } finally {
      setExporting(false);
    }
  };

  const removeSelectedLayer = () => {
    if (!selectedLayer) return;
    setLayers((current) => current.filter((layer) => layer.id !== selectedLayer.id));
    setSelectedLayerId('');
    setMessage('Elemento eliminado.');
  };

  const resetDesign = () => {
    setLayers([initialLogoLayer(activeBase)]);
    setSelectedLayerId('brand-logo');
    setMessage('Diseño restablecido.');
  };

  return (
    <section id="probador-logo" className="vc-tool-card" aria-labelledby="vc-mockup-title">
      <div className="vc-tool-card-head">
        <div>
          <span className="vc-tool-kicker"><Sparkles size={14} aria-hidden="true" /> EDITOR VISUAL DE PRODUCTOS</span>
          <h2 id="vc-mockup-title">Compón tu idea antes de producir</h2>
          <p>Combina tu logo u otras imágenes con textos y formas sobre productos. Ajusta el tamaño, posición, color y orden de cada elemento.</p>
        </div>
        <span className="vc-tool-privacy"><ShieldCheck size={14} aria-hidden="true" /> Tus imágenes se procesan en este navegador</span>
      </div>

      <div className="vc-mockup-bases" role="group" aria-label="Elegir producto base">
        {MOCKUP_BASES.map((base) => (
          <button key={base.id} type="button" className={`vc-mockup-base-btn${base.id === activeBase.id ? ' is-active' : ''}`} aria-pressed={base.id === activeBase.id} onClick={() => selectBase(base)}>
            <img src={base.image} alt="" loading="lazy" />
            <span><b>{base.name}</b><small>{base.family}</small></span>
          </button>
        ))}
      </div>

      <div className="vc-tool-grid vc-layout-editor-grid">
        <div className="vc-tool-preview-col">
          <div
            ref={stageRef}
            className={`vc-mockup-stage${draggingLayerId ? ' is-dragging' : ''}`}
            onPointerDown={handleStagePointerDown}
            onPointerMove={handleStagePointerMove}
            onPointerUp={handleStagePointerUp}
            onPointerCancel={handleStagePointerUp}
            aria-label={`Lienzo de diseño sobre ${activeBase.name}. Selecciona y arrastra los elementos para moverlos.`}
          >
            <img className="vc-mockup-product-img" src={activeBase.image} alt={activeBase.name} draggable={false} />
            {layers.map((layer) => {
              const style = {
                left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.size}%`,
                opacity: layer.opacity / 100, transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
                color: layer.color,
                backgroundColor: layer.kind === 'rectangle' || layer.kind === 'circle' ? layer.color : undefined,
                fontSize: layer.kind === 'text' ? `${layer.size * 0.28}cqw` : undefined,
              };
              return (
                <div
                  key={layer.id}
                  data-design-layer-id={layer.id}
                  className={`vc-design-layer vc-design-layer-${layer.kind}${layer.id === selectedLayerId ? ' is-selected' : ''}`}
                  style={style}
                  role="button"
                  tabIndex={0}
                  aria-pressed={layer.id === selectedLayerId}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedLayerId(layer.id);
                    }
                    const movement = event.shiftKey ? 5 : 1;
                    const edge = Math.min(27, layer.size / 2);
                    const positions = {
                      ArrowLeft: { x: Math.max(edge, layer.x - movement) },
                      ArrowRight: { x: Math.min(100 - edge, layer.x + movement) },
                      ArrowUp: { y: Math.max(edge, layer.y - movement) },
                      ArrowDown: { y: Math.min(100 - edge, layer.y + movement) },
                    };
                    const position = positions[event.key as keyof typeof positions];
                    if (position) {
                      event.preventDefault();
                      setSelectedLayerId(layer.id);
                      updateLayer(layer.id, position);
                    }
                  }}
                  onClick={() => setSelectedLayerId(layer.id)}
                  aria-label={`${layer.name}. Selecciona y arrastra para mover.`}
                >
                  {layer.kind === 'image' && <img src={layer.src} alt={layer.name} draggable={false} />}
                  {layer.kind === 'text' && <span>{layer.text}</span>}
                </div>
              );
            })}
            <span className="vc-mockup-drag-hint" aria-hidden="true"><Move size={13} /> Selecciona y arrastra · {activeBase.hint}</span>
          </div>
          <p className="vc-mockup-disclaimer">Composición referencial. Materiales, colores, tamaños y técnicas finales se revisan al cotizar.</p>
        </div>

        <div className="vc-tool-controls vc-layout-editor-controls">
          <div className="vc-tool-section">
            <span className="vc-tool-label">Añadir al diseño</span>
            <div className="vc-layout-editor-add-actions">
              <button type="button" className="vc-layout-editor-button" onClick={addText}><Type size={15} aria-hidden="true" /> Texto</button>
              <button type="button" className="vc-layout-editor-button" onClick={() => addShape('rectangle')}><RectangleHorizontal size={15} aria-hidden="true" /> Franja</button>
              <button type="button" className="vc-layout-editor-button" onClick={() => addShape('circle')}><Circle size={15} aria-hidden="true" /> Círculo</button>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={handleUpload} />
              <button type="button" className="vc-layout-editor-button" onClick={() => fileInputRef.current?.click()}><ImagePlus size={15} aria-hidden="true" /> Imagen</button>
            </div>
          </div>

          <div className="vc-tool-section">
            <span className="vc-tool-label">Elementos del diseño</span>
            {layers.length === 0 ? <p className="vc-layout-editor-empty">Añade texto, una forma o una imagen para empezar.</p> : (
              <div className="vc-layout-layer-list" role="list" aria-label="Capas del diseño">
              {[...layers].reverse().map((layer, index, visibleLayers) => (
                  <div className={`vc-layout-layer-row${layer.id === selectedLayerId ? ' is-active' : ''}`} key={layer.id} role="listitem">
                  <button type="button" className="vc-layout-layer-select" aria-pressed={layer.id === selectedLayerId} onClick={() => setSelectedLayerId(layer.id)}>
                    <span>{index + 1}</span>{layer.name}
                    </button>
                  <button type="button" className="vc-layout-layer-order" aria-label={`Traer ${layer.name} al frente`} title="Traer al frente" disabled={index === 0} onClick={() => moveLayer(layer.id, 1)}><ChevronUp size={14} aria-hidden="true" /></button>
                  <button type="button" className="vc-layout-layer-order" aria-label={`Enviar ${layer.name} al fondo`} title="Enviar al fondo" disabled={index === visibleLayers.length - 1} onClick={() => moveLayer(layer.id, -1)}><ChevronDown size={14} aria-hidden="true" /></button>
                    <button type="button" className="vc-layout-layer-delete" aria-label={`Eliminar ${layer.name}`} onClick={() => { setLayers((current) => current.filter((item) => item.id !== layer.id)); if (selectedLayerId === layer.id) setSelectedLayerId(''); setMessage('Elemento eliminado.'); }}><Trash2 size={14} aria-hidden="true" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedLayer && (
            <div className="vc-tool-section vc-layout-layer-properties" aria-label={`Propiedades de ${selectedLayer.name}`}>
              <span className="vc-tool-label">Editar elemento seleccionado</span>
              {selectedLayer.kind === 'text' && (
                <label className="vc-layout-text-field">Texto
                  <input value={selectedLayer.text || ''} maxLength={80} onChange={(event) => updateLayer(selectedLayer.id, { text: event.target.value, name: event.target.value.trim() || 'Texto nuevo' })} />
                </label>
              )}
              {selectedLayer.kind !== 'image' && <label className="vc-layout-color-field">Color
                <input type="color" aria-label="Color del elemento" value={selectedLayer.color} onChange={(event) => updateLayer(selectedLayer.id, { color: event.target.value })} />
              </label>}
              <div className="vc-tool-sliders">
                <label><span>Tamaño</span><b>{selectedLayer.size}%</b><input type="range" min="5" max="55" value={selectedLayer.size} onChange={(event) => updateLayer(selectedLayer.id, { size: Number(event.target.value) })} /></label>
                <label><span>Rotación</span><b>{selectedLayer.rotation}°</b><input type="range" min="-180" max="180" value={selectedLayer.rotation} onChange={(event) => updateLayer(selectedLayer.id, { rotation: Number(event.target.value) })} /></label>
                <label><span>Opacidad</span><b>{selectedLayer.opacity}%</b><input type="range" min="10" max="100" value={selectedLayer.opacity} onChange={(event) => updateLayer(selectedLayer.id, { opacity: Number(event.target.value) })} /></label>
              </div>
              <button type="button" className="vc-tool-outline-btn" onClick={removeSelectedLayer}><Trash2 size={14} aria-hidden="true" /> Eliminar elemento</button>
            </div>
          )}

          <div className="vc-tool-downloads">
            <button type="button" className="vc-tool-outline-btn" onClick={resetDesign}><RotateCcw size={14} aria-hidden="true" /> Reiniciar diseño</button>
            <button type="button" className="vc-layout-editor-button" onClick={exportDesign} disabled={exporting}><Download size={16} aria-hidden="true" /> {exporting ? 'Generando PNG…' : 'Descargar diseño PNG'}</button>
            <Link className="vc-layout-editor-button is-primary" to={`${quotePath}?servicio=${encodeURIComponent(activeBase.family)}&producto=${encodeURIComponent(activeBase.quoteProduct)}`}>Cotizar {activeBase.name.toLowerCase()} <ArrowUpRight size={16} aria-hidden="true" /></Link>
          </div>
          {message && <p className="vc-layout-editor-status" role="status" aria-live="polite">{message}</p>}
        </div>
      </div>
    </section>
  );
}
