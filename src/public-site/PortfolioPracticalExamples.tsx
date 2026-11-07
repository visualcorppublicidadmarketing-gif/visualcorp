import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import './solutions-showcase.css';

type PracticalExample = {
  id: string;
  title: string;
  description: string;
  category: string;
  image: string;
  imageAlt: string;
  companionImage?: string;
  deliverables: string[];
};

const practicalExamples: PracticalExample[] = [
  {
    id: 'temporada-local',
    title: 'Viste tu local para una temporada',
    description: 'Imagina una misma campaña en la vitrina, las paredes y el punto de atención, con piezas que mantengan una línea visual común.',
    category: 'LOCAL Y CAMPAÑAS',
    image: '/inventory-reference-library/images/34-visual-corp.webp',
    imageAlt: 'Referencia conceptual de gráfica impresa para superficies',
    companionImage: '/inventory-reference-library/images/12-visual-corp.webp',
    deliverables: ['Gráfica de vitrina', 'Ambientación interior', 'Piezas de mostrador'],
  },
  {
    id: 'campana-punto-venta',
    title: 'Lleva una campaña al punto de venta',
    description: 'Conecta el diseño de campaña con impresos y recursos de mostrador para que la idea también se entienda dentro del local.',
    category: 'DISEÑO Y MATERIAL IMPRESO',
    image: '/inventory-reference-library/images/16-visual-corp.webp',
    imageAlt: 'Muestra ilustrativa de diseño para una pieza impresa',
    companionImage: '/inventory-reference-library/images/08-visual-corp.webp',
    deliverables: ['Diseño de campaña', 'Flyer o volante', 'Hablador de mesa'],
  },
  {
    id: 'cuadernos-equipo',
    title: 'Cuadernos para tu equipo o evento',
    description: 'Lleva la identidad a una pieza de uso diario y coordínala con carpetas, papelería o elementos de identificación.',
    category: 'PAPELERÍA CORPORATIVA',
    image: '/inventory-reference-library/images/21-visual-corp.webp',
    imageAlt: 'Muestra conceptual de cuaderno con identidad Visual Corp',
    companionImage: '/inventory-reference-library/images/09-visual-corp.webp',
    deliverables: ['Diseño de portada', 'Cuaderno personalizado', 'Identificación del equipo'],
  },
  {
    id: 'recuerdo-acrilico',
    title: 'Recuerdos en acrílico para una ocasión',
    description: 'Explora una idea de llavero, placa o reconocimiento. La forma, el material, el acabado y la cantidad se revisan para cada solicitud.',
    category: 'RECUERDOS Y PIEZAS CONMEMORATIVAS',
    image: '/inventory-reference-library/images/23-visual-corp.webp',
    imageAlt: 'Referencia conceptual de una pieza conmemorativa personalizada',
    deliverables: ['Diseño personalizado', 'Llavero o placa', 'Reconocimiento'],
  },
  {
    id: 'feria-exhibicion',
    title: 'Prepara un punto de atención para una feria',
    description: 'Piensa el espacio como un conjunto: fondo gráfico, módulo de exhibición y material que ayude a presentar la marca.',
    category: 'FERIAS Y EXHIBICIÓN',
    image: '/inventory-reference-library/images/03-visual-corp.webp',
    imageAlt: 'Referencia visual de un stand promocional con identidad Visual Corp',
    companionImage: '/inventory-reference-library/images/01-visual-corp.webp',
    deliverables: ['Stand o módulo', 'Banner o respaldo', 'Piezas informativas'],
  },
];

export function PortfolioPracticalExamples() {
  return (
    <section className="vc-sol-section portfolio-practical-section" aria-labelledby="portfolio-practical-title">
      <div className="portfolio-practical-heading">
        <div>
          <span className="site-eyebrow"><i/>IDEAS PARA LLEVAR A LA PRÁCTICA</span>
          <h2 id="portfolio-practical-title">Una idea puede tomar <span>muchas formas.</span></h2>
        </div>
        <p>Explora ejemplos de cómo se pueden combinar diseño, ambientación, impresión y piezas promocionales según lo que quieras resolver.</p>
      </div>

      <p className="portfolio-practical-note" role="note">
        <span>Referencias ilustrativas</span>
        Las imágenes muestran muestras conceptuales de Visual Corp. No representan trabajos de clientes ni proyectos ejecutados. Materiales, formatos, cantidades y disponibilidad se confirman para cada solicitud.
      </p>

      <div className="portfolio-practical-grid">
        {practicalExamples.map((example, index) => (
          <article className={`portfolio-practical-card${index === 0 ? ' is-featured' : ''}`} key={example.id}>
            <div className="portfolio-practical-media">
              <span className="portfolio-practical-index">IDEA {String(index + 1).padStart(2, '0')}</span>
              <img className="portfolio-practical-image" src={example.image} alt={example.imageAlt} loading="lazy" decoding="async"/>
              {example.companionImage && <img className="portfolio-practical-companion" src={example.companionImage} alt="" aria-hidden="true" loading="lazy" decoding="async"/>}
              <span className="portfolio-practical-image-label">MUESTRA CONCEPTUAL</span>
            </div>
            <div className="portfolio-practical-copy">
              <span className="portfolio-practical-category">{example.category}</span>
              <h3>{example.title}</h3>
              <p>{example.description}</p>
              <ul aria-label={`Piezas que pueden formar parte de: ${example.title}`}>
                {example.deliverables.map((deliverable) => <li key={deliverable}>{deliverable}</li>)}
              </ul>
              <Link to="/contacto" className="portfolio-practical-link">Conversemos sobre tu idea <ArrowUpRight size={15} aria-hidden="true"/></Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
