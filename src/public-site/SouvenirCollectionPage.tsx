import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageMeta } from './seo';
import './souvenir-collection.css';

type SouvenirExample = {
  image: string;
  name: string;
  alt: string;
};

const examples: SouvenirExample[] = [
  { image: '12_taza_cafe_sol', name: 'Taza personalizada · Café Sol', alt: 'Taza blanca personalizada con identidad comercial de Café Sol.' },
  { image: '02_camiseta_tia', name: 'Camiseta estampada · Tía', alt: 'Camiseta blanca con diseño comercial frontal de Tía.' },
  { image: '03_polo_kywi', name: 'Camisa polo bordada · KYWI', alt: 'Camisa polo blanca con logo bordado de KYWI.' },
  { image: '05_gorra_malla_supermaxi', name: 'Gorra de malla · Supermaxi', alt: 'Gorra de malla con panel frontal blanco y marca Supermaxi.' },
  { image: '06_bolso_cambrella_deuna', name: 'Bolso cambrella · DeUna', alt: 'Bolso cambrella personalizado con la marca DeUna.' },
  { image: '10_pluma_bic', name: 'Pluma personalizada · BIC', alt: 'Pluma blanca personalizada con la marca BIC.' },
  { image: '11_llavero_acrilico_tia', name: 'Llavero acrílico · Tía', alt: 'Llavero acrílico personalizado con diseño de Tía.' },
  { image: '13_calendario_netlife', name: 'Calendario de escritorio · Netlife', alt: 'Calendario corporativo de escritorio de Netlife.' },
  { image: '14_flyer_kfc', name: 'Flyer promocional · KFC', alt: 'Diseño publicitario de comida para un flyer promocional.' },
  { image: '15_agenda_samsung', name: 'Agenda de tapa dura · Samsung', alt: 'Agenda sobria de tapa dura con diseño de Samsung.' },
];

export const SOUVENIR_EXAMPLE_COUNT = examples.length;

const imageUrl = (name: string, size: 'card' | 'full' = 'card') =>
  `/images/store/souvenirs/${name}${size === 'card' ? '-card' : ''}.webp`;

export function SouvenirCollectionPage() {
  const [activeExample, setActiveExample] = useState<SouvenirExample | null>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = previewDialog.current;
    if (activeExample && dialog && !dialog.open) dialog.showModal();
    else if (!activeExample && dialog?.open) dialog.close();
  }, [activeExample]);

  const closePreview = () => setActiveExample(null);

  return (
    <div className="storefront-page store-souvenirs-page">
      <PageMeta
        title="Souvenirs personalizados"
        description="Ideas visuales de souvenirs personalizados en Visual Corp: tazas, camisetas, gorras, bolsos y artículos promocionales."
        path="/tienda/souvenirs"
      />
      <header className="store-souvenirs-hero">
        <div className="store-souvenirs-hero-copy">
          <Link className="store-souvenirs-back" to="/tienda"><ArrowLeft size={15} /> Volver a categorías</Link>
          <span className="site-eyebrow light"><i /><Sparkles size={15} /> GALERÍA DE INSPIRACIÓN</span>
          <h1>Souvenirs<br /><em>personalizados.</em></h1>
          <p>Ideas para llevar una marca a objetos cotidianos. Explora cada propuesta y abre la imagen para verla en grande.</p>
          <div className="store-souvenirs-hero-meta"><span>{examples.length} ideas seleccionadas</span><i /><span>Diseños comerciales</span><i /><span>Personalización a tu medida</span></div>
        </div>
        <div className="store-souvenirs-hero-art" aria-label="Vistazo a la colección de souvenirs">
          {[examples[0], examples[2], examples[4]].map((example, index) => (
            <button className={`store-souvenirs-art-card store-souvenirs-art-card-${index + 1}`} type="button" key={example.image} onClick={() => setActiveExample(example)} aria-label={`Ampliar ${example.name}`}>
              <img src={imageUrl(example.image)} alt="" fetchPriority="high" />
            </button>
          ))}
          <span className="store-souvenirs-art-orbit" />
        </div>
      </header>

      <section className="store-souvenirs-gallery" aria-labelledby="store-souvenirs-title">
        <div className="store-souvenirs-heading">
          <div><span className="site-eyebrow"><i />UNA COLECCIÓN PARA EXPLORAR</span><h2 id="store-souvenirs-title">Ideas que <em>se llevan.</em></h2></div>
          <p>Selecciona una imagen para ampliarla. Cada pieza es una referencia visual para conversar sobre tu próximo proyecto.</p>
        </div>
        <ul className="store-souvenirs-grid">
          {examples.map((example, index) => (
            <li className="store-souvenir-card" key={example.image}>
              <button type="button" className="store-souvenir-image-button" onClick={() => setActiveExample(example)} aria-label={`Ver en grande: ${example.name}`}>
                <img src={imageUrl(example.image)} alt={example.alt} loading={index < 4 ? 'eager' : 'lazy'} decoding="async" />
                <span className="store-souvenir-zoom"><ArrowUpRight size={15} /> Ver diseño</span>
              </button>
              <div className="store-souvenir-card-copy"><span>IDEA {String(index + 1).padStart(2, '0')}</span><h3>{example.name}</h3></div>
            </li>
          ))}
        </ul>
        <p className="store-souvenirs-disclaimer">Los logotipos que aparecen en estas muestras son referencias visuales de personalización y no implican alianzas oficiales.</p>
        <div className="store-souvenirs-cta"><div><span className="site-eyebrow light"><i />¿YA TIENES UNA IDEA?</span><h2>Hagámosla <em>realidad.</em></h2><p>Cuéntanos qué producto tienes en mente y te ayudamos a definir el diseño.</p></div><Link className="site-primary-button" to="/cotizador">Cotiza tu idea <ArrowRight size={17} /></Link></div>
      </section>

      <dialog className="store-souvenir-preview" ref={previewDialog} onClose={closePreview} onClick={(event) => { if (event.target === previewDialog.current) closePreview(); }} aria-labelledby="store-souvenir-preview-title">
        <div className="store-souvenir-preview-frame">
          <button className="store-souvenir-preview-close" type="button" onClick={closePreview} aria-label="Cerrar vista ampliada"><X size={19} /></button>
          {activeExample && <><img src={imageUrl(activeExample.image, 'full')} alt={activeExample.alt} /><div className="store-souvenir-preview-title" id="store-souvenir-preview-title">{activeExample.name}</div></>}
        </div>
      </dialog>
    </div>
  );
}
