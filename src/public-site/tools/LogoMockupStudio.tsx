import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Download,
  ImagePlus,
  Move,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Type,
} from 'lucide-react';

type MockupBase = {
  id: string;
  name: string;
  family: string;
  image: string;
  quoteProduct: string;
  defaultX: number; // % from left
  defaultY: number; // % from top
  defaultScale: number; // % of stage width
  hint: string;
};

const MOCKUP_BASES: MockupBase[] = [
  {
    id: 'camiseta',
    name: 'Camiseta',
    family: 'Textil y promocionales',
    image: '/images/catalog-products/camiseta_base.webp',
    quoteProduct: 'Camiseta personalizada',
    defaultX: 50,
    defaultY: 42,
    defaultScale: 24,
    hint: 'Zona pecho · sublimación o DTF',
  },
  {
    id: 'taza',
    name: 'Taza',
    family: 'Textil y promocionales',
    image: '/images/catalog-products/taza_base.webp',
    quoteProduct: 'Taza personalizada',
    defaultX: 43,
    defaultY: 44,
    defaultScale: 24,
    hint: 'Zona frontal · sublimación',
  },
  {
    id: 'gorra',
    name: 'Gorra',
    family: 'Textil y promocionales',
    image: '/images/catalog-products/gorra_base.webp',
    quoteProduct: 'Gorra personalizada',
    defaultX: 50,
    defaultY: 40,
    defaultScale: 22,
    hint: 'Frente central · DTF o bordado',
  },
  {
    id: 'bolsa',
    name: 'Bolso Tote',
    family: 'Textil y promocionales',
    image: '/images/catalog-products/bolsa_base.webp',
    quoteProduct: 'Bolso corporativo personalizado',
    defaultX: 55,
    defaultY: 56,
    defaultScale: 25,
    hint: 'Cara frontal · estampado o sublimación',
  },
  {
    id: 'rotulo',
    name: 'Rótulo',
    family: 'Rótulos y fachadas',
    image: '/images/catalog-products/rotulo_base.webp',
    quoteProduct: 'Rótulo comercial',
    defaultX: 54,
    defaultY: 46,
    defaultScale: 30,
    hint: 'Panel central · impresión o corte',
  },
  {
    id: 'rollup',
    name: 'Roll-Up',
    family: 'Exhibición y eventos',
    image: '/images/catalog-products/roll_up_base.webp',
    quoteProduct: 'Roll-Up publicitario',
    defaultX: 50,
    defaultY: 36,
    defaultScale: 28,
    hint: 'Zona superior visible · gran formato',
  },
];

const DEMO_LOGO = '/brand/visualcorp-symbol.png';

export function LogoMockupStudio() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [baseId, setBaseId] = useState(MOCKUP_BASES[0].id);
  const [logoSrc, setLogoSrc] = useState(DEMO_LOGO);
  const [isCustomLogo, setIsCustomLogo] = useState(false);
  const [posX, setPosX] = useState(MOCKUP_BASES[0].defaultX);
  const [posY, setPosY] = useState(MOCKUP_BASES[0].defaultY);
  const [scalePct, setScalePct] = useState(MOCKUP_BASES[0].defaultScale);
  const [rotation, setRotation] = useState(0);
  const [opacity, setOpacity] = useState(96);
  const [captionText, setCaptionText] = useState('');
  const [captionColor, setCaptionColor] = useState('#ffffff');
  const [dragging, setDragging] = useState(false);
  const [exporting, setExporting] = useState(false);

  const activeBase = MOCKUP_BASES.find((b) => b.id === baseId) || MOCKUP_BASES[0];

  useEffect(() => {
    return () => {
      if (isCustomLogo && logoSrc.startsWith('blob:')) URL.revokeObjectURL(logoSrc);
    };
  }, [isCustomLogo, logoSrc]);

  const selectBase = (base: MockupBase) => {
    setBaseId(base.id);
    setPosX(base.defaultX);
    setPosY(base.defaultY);
    setScalePct(base.defaultScale);
    setRotation(0);
  };

  const resetPlacement = () => {
    setPosX(activeBase.defaultX);
    setPosY(activeBase.defaultY);
    setScalePct(activeBase.defaultScale);
    setRotation(0);
    setOpacity(96);
  };

  const handleUploadLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (isCustomLogo && logoSrc.startsWith('blob:')) URL.revokeObjectURL(logoSrc);
    const url = URL.createObjectURL(file);
    setLogoSrc(url);
    setIsCustomLogo(true);
    event.target.value = '';
  };

  const updatePointerPos = (clientX: number, clientY: number) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(86, Math.max(14, ((clientX - rect.left) / Math.max(1, rect.width)) * 100));
    const y = Math.min(86, Math.max(14, ((clientY - rect.top) / Math.max(1, rect.height)) * 100));
    setPosX(Math.round(x));
    setPosY(Math.round(y));
  };

  const handleStagePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updatePointerPos(event.clientX, event.clientY);
  };

  const handleStagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updatePointerPos(event.clientX, event.clientY);
  };

  const handleStagePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const exportMockupPng = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const loadImg = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });

      const [baseImg, logoImg] = await Promise.all([loadImg(activeBase.image), loadImg(logoSrc)]);
      const size = 1200;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Studio subtle backdrop
      const grad = ctx.createRadialGradient(size * 0.5, size * 0.42, 60, size * 0.5, size * 0.5, size * 0.72);
      grad.addColorStop(0, '#f5f2f9');
      grad.addColorStop(1, '#e4dfee');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      // Fit base product image with contain
      const pad = 72;
      const avail = size - pad * 2;
      const baseScale = Math.min(avail / baseImg.naturalWidth, avail / baseImg.naturalHeight);
      const drawW = baseImg.naturalWidth * baseScale;
      const drawH = baseImg.naturalHeight * baseScale;
      ctx.drawImage(baseImg, (size - drawW) / 2, (size - drawH) / 2, drawW, drawH);

      // Draw positioned logo
      const cx = (posX / 100) * size;
      const cy = (posY / 100) * size;
      const maxLogoW = (scalePct / 100) * size;
      const logoAspect = logoImg.naturalWidth / Math.max(1, logoImg.naturalHeight);
      const logoW = logoAspect >= 1 ? maxLogoW : maxLogoW * logoAspect;
      const logoH = logoAspect >= 1 ? maxLogoW / logoAspect : maxLogoW;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.globalAlpha = opacity / 100;
      ctx.drawImage(logoImg, -logoW / 2, -logoH / 2, logoW, logoH);

      if (captionText.trim()) {
        ctx.font = `700 ${Math.max(22, Math.round(maxLogoW * 0.16))}px "DM Sans", Arial, sans-serif`;
        ctx.fillStyle = captionColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(captionText.trim(), 0, logoH / 2 + 16, maxLogoW * 1.45);
      }
      ctx.restore();

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `visualcorp-mockup-${activeBase.id}.png`;
      link.click();
    } finally {
      setExporting(false);
    }
  };

  return (
    <section id="probador-logo" className="vc-tool-card" aria-labelledby="vc-mockup-title">
      <div className="vc-tool-card-head">
        <div>
          <span className="vc-tool-kicker">
            <Sparkles size={14} aria-hidden="true" />
            PROBADOR VISUAL DE TU LOGO EN PRODUCTOS
          </span>
          <h2 id="vc-mockup-title">Mira cómo luce tu marca antes de producir</h2>
          <p>
            Sube tu logo en PNG o SVG, arrástralo sobre el producto, ajusta su tamaño y descarga tu vista previa para cotizar.
          </p>
        </div>
        <span className="vc-tool-privacy">
          <ShieldCheck size={14} aria-hidden="true" />
          Tu logo no sale de tu navegador
        </span>
      </div>

      {/* Product Selector Pills */}
      <div className="vc-mockup-bases" role="group" aria-label="Elegir producto base">
        {MOCKUP_BASES.map((base) => (
          <button
            key={base.id}
            type="button"
            className={`vc-mockup-base-btn${base.id === activeBase.id ? ' is-active' : ''}`}
            aria-pressed={base.id === activeBase.id}
            onClick={() => selectBase(base)}
          >
            <img src={base.image} alt="" loading="lazy" />
            <span>
              <b>{base.name}</b>
              <small>{base.family}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="vc-tool-grid">
        {/* Interactive Canvas Preview */}
        <div className="vc-tool-preview-col">
          <div
            ref={stageRef}
            className={`vc-mockup-stage${dragging ? ' is-dragging' : ''}`}
            onPointerDown={handleStagePointerDown}
            onPointerMove={handleStagePointerMove}
            onPointerUp={handleStagePointerUp}
            onPointerCancel={handleStagePointerUp}
            role="application"
            aria-label={`Lienzo interactivo para posicionar tu logo sobre ${activeBase.name}. Haz clic o arrastra para mover el logo.`}
          >
            <img className="vc-mockup-product-img" src={activeBase.image} alt={activeBase.name} draggable={false} />
            <div
              className="vc-mockup-logo-overlay"
              style={{
                left: `${posX}%`,
                top: `${posY}%`,
                width: `${scalePct}%`,
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                opacity: opacity / 100,
              }}
            >
              <img src={logoSrc} alt={isCustomLogo ? 'Tu logo cargado' : 'Logo de demostración Visual Corp'} draggable={false} />
              {captionText.trim() && (
                <span className="vc-mockup-caption" style={{ color: captionColor }}>
                  {captionText.trim()}
                </span>
              )}
            </div>
            <span className="vc-mockup-drag-hint" aria-hidden="true">
              <Move size={13} /> Arrastra para mover tu logo · {activeBase.hint}
            </span>
          </div>
          <p className="vc-mockup-disclaimer">
            Vista previa referencial para explorar ubicación y proporción. Colores finales, área exacta de estampado y técnica se confirman al cotizar.
          </p>
        </div>

        {/* Controls & Export Column */}
        <div className="vc-tool-controls">
          <div className="vc-tool-section">
            <span className="vc-tool-label">1. Tu logo (recomendado PNG transparente o SVG)</span>
            <div className="vc-tool-logo-row">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                onChange={handleUploadLogo}
              />
              <button type="button" className="site-primary-button" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus size={16} aria-hidden="true" /> {isCustomLogo ? 'Subir otro logo' : 'Subir mi logo'}
              </button>
              {isCustomLogo && (
                <button
                  type="button"
                  className="vc-tool-ghost-btn"
                  onClick={() => {
                    setLogoSrc(DEMO_LOGO);
                    setIsCustomLogo(false);
                  }}
                >
                  Usar logo demo
                </button>
              )}
              <button type="button" className="vc-tool-outline-btn" onClick={resetPlacement}>
                <RotateCcw size={14} aria-hidden="true" /> Centrar
              </button>
            </div>
          </div>

          <div className="vc-tool-sliders">
            <label>
              <span>Tamaño del logo</span>
              <b>{scalePct}%</b>
              <input type="range" min={10} max={55} value={scalePct} onChange={(event) => setScalePct(Number(event.target.value))} />
            </label>
            <label>
              <span>Rotación</span>
              <b>{rotation}°</b>
              <input type="range" min={-35} max={35} value={rotation} onChange={(event) => setRotation(Number(event.target.value))} />
            </label>
            <label>
              <span>Opacidad / integración</span>
              <b>{opacity}%</b>
              <input type="range" min={55} max={100} value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
            </label>
          </div>

          <div className="vc-tool-section">
            <span className="vc-tool-label">
              <Type size={13} aria-hidden="true" /> Texto breve opcional debajo del logo
            </span>
            <div className="vc-tool-caption-row">
              <input
                type="text"
                value={captionText}
                onChange={(event) => setCaptionText(event.target.value)}
                placeholder="Ej. TU MARCA · MILAGRO"
                maxLength={28}
              />
              <input
                type="color"
                aria-label="Color del texto"
                value={captionColor}
                onChange={(event) => setCaptionColor(event.target.value)}
              />
            </div>
          </div>

          <div className="vc-tool-downloads">
            <button type="button" className="site-secondary-button" onClick={exportMockupPng} disabled={exporting}>
              <Download size={16} aria-hidden="true" /> {exporting ? 'Generando PNG…' : 'Descargar vista previa PNG'}
            </button>
            <Link
              className="site-primary-button"
              to={`/cotizador?servicio=${encodeURIComponent(activeBase.family)}&producto=${encodeURIComponent(activeBase.quoteProduct)}`}
            >
              Cotizar {activeBase.name.toLowerCase()} <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
