/**
 * Visual Corp — Interactive Before/After Branding Comparison Showcase
 * Slider interaction adapted from ibelick/motion-primitives (MIT License, commit 120f64f)
 * with keyboard ARIA slider support inspired by nerdyman/react-compare-slider (MIT License).
 */
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { ArrowLeftRight, ArrowUpRight, Sparkles } from 'lucide-react';
import './interactive-showcase.css';

type ComparisonPair = {
  id: string;
  title: string;
  family: string;
  beforeImage: string;
  afterImage: string;
  beforeLabel: string;
  afterLabel: string;
  caption: string;
  quoteService: string;
};

const COMPARISON_PAIRS: ComparisonPair[] = [
  {
    id: 'rotulo',
    title: 'Rótulo comercial',
    family: 'Rótulos y fachadas',
    beforeImage: '/images/catalog-products/rotulo_base.webp',
    afterImage: '/images/catalog-products/11_Rotulo_Adidas.webp',
    beforeLabel: 'Estructura base',
    afterLabel: 'Con identidad gráfica',
    caption: 'De una estructura limpia a una pieza visible para atraer miradas en tu fachada o punto de venta.',
    quoteService: 'Rótulos y fachadas',
  },
  {
    id: 'rollup',
    title: 'Roll-Up para eventos',
    family: 'Exhibición y eventos',
    beforeImage: '/images/catalog-products/roll_up_base.webp',
    afterImage: '/images/catalog-products/01_Roll_Up_Tia.webp',
    beforeLabel: 'Display base',
    afterLabel: 'Arte aplicado',
    caption: 'Presentación portátil y lista en segundos para ferias, lanzamientos y puntos de atención.',
    quoteService: 'Exhibición y eventos',
  },
  {
    id: 'camiseta',
    title: 'Camiseta sublimada',
    family: 'Textil y promocionales',
    beforeImage: '/images/catalog-products/camiseta_base.webp',
    afterImage: '/images/catalog-products/10_Camiseta_Sublimada_Milagro.webp',
    beforeLabel: 'Prenda base',
    afterLabel: 'Diseño sublimado',
    caption: 'Uniformes, prendas promocionales o ediciones especiales con identidad propia.',
    quoteService: 'Textil y promocionales',
  },
  {
    id: 'taza',
    title: 'Taza personalizada',
    family: 'Textil y promocionales',
    beforeImage: '/images/catalog-products/taza_base.webp',
    afterImage: '/images/catalog-products/04_Taza_Cafe_Sol.webp',
    beforeLabel: 'Taza base',
    afterLabel: 'Arte corporativo',
    caption: 'Regalos empresariales y souvenirs diseñados a medida para tu marca o evento.',
    quoteService: 'Textil y promocionales',
  },
];

export function BrandBeforeAfterShowcase() {
  const [activePairId, setActivePairId] = useState(COMPARISON_PAIRS[0].id);
  const [positionPct, setPositionPct] = useState(52);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const rawPosition = useMotionValue(52);
  const smoothPosition = useSpring(rawPosition, reduceMotion ? { duration: 0, bounce: 0 } : { stiffness: 360, damping: 34 });
  const afterClipPath = useTransform(smoothPosition, (value) => `inset(0 ${100 - value}% 0 0)`);
  const handleLeft = useTransform(smoothPosition, (value) => `${value}%`);

  const activePair = COMPARISON_PAIRS.find((pair) => pair.id === activePairId) || COMPARISON_PAIRS[0];

  const updateFromClientX = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.min(98, Math.max(2, ((clientX - rect.left) / Math.max(1, rect.width)) * 100));
    rawPosition.set(pct);
    setPositionPct(Math.round(pct));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromClientX(event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    updateFromClientX(event.clientX);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 15 : 5;
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = Math.max(2, positionPct - step);
    else if (event.key === 'ArrowRight') next = Math.min(98, positionPct + step);
    else if (event.key === 'Home') next = 5;
    else if (event.key === 'End') next = 95;
    if (next === null) return;
    event.preventDefault();
    rawPosition.set(next);
    setPositionPct(next);
  };

  const selectPair = (id: string) => {
    setActivePairId(id);
    rawPosition.set(52);
    setPositionPct(52);
  };

  return (
    <section className="vc-sol-section vc-compare-section" aria-labelledby="vc-compare-title">
      <div className="vc-compare-header">
        <div>
          <span className="site-eyebrow">
            <i /> ANTES Y DESPUÉS · SIMULACIÓN INTERACTIVA
          </span>
          <h2 id="vc-compare-title">
            Desliza y mira cómo una pieza base <span>cobra identidad.</span>
          </h2>
          <p>
            Compara el soporte sin diseño frente a una propuesta gráfica aplicada. Arrastra el control o usa las flechas del teclado.
          </p>
        </div>
        <div className="vc-compare-actions">
          <Link className="site-primary-button" to="/herramientas#probador-logo">
            <Sparkles size={15} aria-hidden="true" /> Probar con mi propio logo <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>

      <p className="vc-compare-disclaimer" role="note">
        Muestras conceptuales ilustrativas para visualizar acabados y aplicación de marca; no representan clientes ni proyectos realizados por Visual Corp.
      </p>

      <div className="vc-compare-tabs" role="tablist" aria-label="Elegir pieza para comparar antes y después">
        {COMPARISON_PAIRS.map((pair) => {
          const isSelected = pair.id === activePair.id;
          return (
            <button
              key={pair.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`vc-compare-tab${isSelected ? ' is-active' : ''}`}
              onClick={() => selectPair(pair.id)}
            >
              <span>{pair.title}</span>
              <small>{pair.family}</small>
            </button>
          );
        })}
      </div>

      <div className="vc-compare-layout">
        <div
          ref={containerRef}
          className={`vc-compare-stage${isDragging ? ' is-dragging' : ''}`}
          role="slider"
          tabIndex={0}
          aria-label={`Comparador antes y después de ${activePair.title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={positionPct}
          aria-valuetext={`${positionPct}% aplicación gráfica visible`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
        >
          {/* Base / Before image */}
          <img
            className="vc-compare-img vc-compare-img-before"
            src={activePair.beforeImage}
            alt={`${activePair.title} — ${activePair.beforeLabel}`}
            draggable={false}
          />
          {/* Branded / After image clipped by slider */}
          <motion.img
            className="vc-compare-img vc-compare-img-after"
            src={activePair.afterImage}
            alt={`${activePair.title} — ${activePair.afterLabel}`}
            style={{ clipPath: afterClipPath }}
            draggable={false}
          />

          <span className="vc-compare-pill is-left">{activePair.afterLabel}</span>
          <span className="vc-compare-pill is-right">{activePair.beforeLabel}</span>

          <motion.div className="vc-compare-divider" style={{ left: handleLeft }} aria-hidden="true">
            <span className="vc-compare-knob">
              <ArrowLeftRight size={16} />
            </span>
          </motion.div>
        </div>

        <aside className="vc-compare-info">
          <span className="vc-compare-family-badge">{activePair.family}</span>
          <h3>{activePair.title}</h3>
          <p>{activePair.caption}</p>
          <div className="vc-compare-info-links">
            <Link
              className="site-primary-button"
              to={`/cotizador?servicio=${encodeURIComponent(activePair.quoteService)}&producto=${encodeURIComponent(activePair.title)}`}
            >
              Cotizar {activePair.title.toLowerCase()} <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
            <Link className="site-secondary-button" to="/herramientas#probador-logo">
              Subir mi logo y probarlo
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
