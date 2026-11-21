import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import './souvenir-collection.css';

type SouvenirExample = {
  image: string;
  name: string;
  alt: string;
};

const examples: SouvenirExample[] = [
  { image: '01_taza_tia', name: 'Taza personalizada', alt: 'Ejemplo de diseño para una taza personalizada.' },
  { image: '02_camiseta_tia', name: 'Camiseta estampada', alt: 'Ejemplo de diseño comercial aplicado a una camiseta.' },
  { image: '03_polo_kywi', name: 'Camisa polo bordada', alt: 'Ejemplo de logo bordado en una camisa polo blanca.' },
  { image: '04_gorra_malla_tia', name: 'Gorra de malla', alt: 'Ejemplo de diseño frontal para una gorra de malla.' },
  { image: '05_gorra_malla_supermaxi', name: 'Gorra de malla', alt: 'Segundo ejemplo de diseño frontal para una gorra de malla.' },
  { image: '06_bolso_cambrella_deuna', name: 'Bolso cambrella', alt: 'Ejemplo de personalización para un bolso cambrella.' },
  { image: '07_bolso_cambrella_tia', name: 'Bolso cambrella', alt: 'Segundo ejemplo de personalización para un bolso cambrella.' },
  { image: '08_pluma_intel', name: 'Pluma personalizada', alt: 'Ejemplo sobrio de marca aplicado a una pluma.' },
  { image: '09_pluma_samsung', name: 'Pluma personalizada', alt: 'Segundo ejemplo de marca aplicado a una pluma.' },
  { image: '10_pluma_bic', name: 'Pluma personalizada', alt: 'Tercer ejemplo de marca aplicado a una pluma.' },
  { image: '11_llavero_acrilico_tia', name: 'Llavero acrílico', alt: 'Ejemplo de llavero acrílico personalizado.' },
  { image: '12_taza_cafe_sol', name: 'Taza personalizada', alt: 'Segundo ejemplo de diseño comercial para una taza.' },
  { image: '13_calendario_netlife', name: 'Calendario de escritorio', alt: 'Ejemplo de calendario corporativo de escritorio.' },
  { image: '14_flyer_kfc', name: 'Flyer promocional', alt: 'Ejemplo de diseño gráfico para un flyer promocional.' },
  { image: '15_agenda_samsung', name: 'Agenda de tapa dura', alt: 'Ejemplo sobrio de diseño corporativo para una agenda.' },
];

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
      <header className="store-souvenirs-hero">
        <div className="store-souvenirs-hero-copy">
          <Link className="store-souvenirs-back" to="/tienda"><ArrowLeft size={15} /> Volver a categorías</Link>
          <span className="site-eyebrow light"><i /><Sparkles size={15} /> GALERÍA DE INSPIRACIÓN</span>
          <h1>Souvenirs<br /><em>personalizados.</em></h1>
          <p>Ideas para llevar una marca a objetos cotidianos. Explora cada propuesta y abre la imagen para verla en grande.</p>
          <div className="store-souvenirs-hero-meta"><span>15 ejemplos</span><i /><span>Diseños comerciales</span><i /><span>Personalización a tu medida</span></div>
        </div>
        <div className="store-souvenirs-hero-art" aria-label="Vistazo a la colección de souvenirs">
          {[examples[0], examples[2], examples[5]].map((example, index) => (
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
