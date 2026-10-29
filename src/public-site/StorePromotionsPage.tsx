import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, BadgePercent, Gift, Sparkles } from 'lucide-react';
import './store-promotions.css';

const sections = [
  {
    id: 'promociones',
    title: 'Promociones',
    eyebrow: 'OFERTAS Y CAMPAÑAS',
    status: 'Sin publicaciones',
    description: 'Cuando publiquemos una promoción, aquí encontrarás su vigencia, alcance y condiciones para consultarla con claridad.',
    icon: BadgePercent,
  },
  {
    id: 'sorteos',
    title: 'Sorteos',
    eyebrow: 'DINÁMICAS OFICIALES',
    status: 'Sin publicaciones',
    description: 'Si hay un sorteo activo, aquí podrás revisar el periodo, la forma de participar y sus términos publicados.',
    icon: Gift,
  },
];

export function StorePromotionsPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Promociones y sorteos | Visual Corp';
    return () => { document.title = previousTitle; };
  }, []);

  return <div className="store-promo-page">
    <header className="store-promo-hero">
      <div className="store-promo-hero-copy">
        <Link className="store-promo-back" to="/tienda"><ArrowLeft size={15}/> Volver a la tienda</Link>
        <span className="site-eyebrow light"><i/><Sparkles size={14}/> NOVEDADES VISUAL CORP</span>
        <h1>Promociones<br/><em>y sorteos.</em></h1>
        <p>Revisa las campañas que publiquemos en la tienda. Cada anuncio incluirá sus fechas y condiciones para que sepas exactamente cómo funciona.</p>
        <div className="store-promo-hero-actions">
          <a className="site-primary-button" href="#promociones">Explorar novedades <ArrowRight size={16}/></a>
          <Link className="store-promo-secondary" to="/tienda#catalogo">Ver catálogo <ArrowUpRight size={15}/></Link>
        </div>
      </div>
      <div className="store-promo-art" aria-hidden="true">
        <span className="store-promo-orbit store-promo-orbit-one"/><span className="store-promo-orbit store-promo-orbit-two"/>
        <div className="store-promo-art-card"><span className="store-promo-art-kicker">TIENDA VISUAL CORP</span><span className="store-promo-art-icon"><Gift size={28}/></span><strong>Ideas que<br/><em>se celebran.</em></strong><small>Promociones · Sorteos · Novedades</small></div>
        <span className="store-promo-art-spark store-promo-art-spark-one">✳</span><span className="store-promo-art-spark store-promo-art-spark-two">✦</span>
      </div>
    </header>

    <nav className="store-promo-jump-links" aria-label="Secciones de promociones y sorteos">
      {sections.map(({ id, title, icon: Icon }) => <a href={`#${id}`} key={id}><Icon size={16}/>{title}<ArrowRight size={14}/></a>)}
    </nav>

    <section className="store-promo-content" aria-label="Promociones y sorteos publicados">
      <div className="store-promo-section-heading"><span className="site-eyebrow"><i/>ACTUALIZACIONES OFICIALES</span><h2>Lo nuevo de la tienda,<br/><em>en un solo lugar.</em></h2><p>Consulta siempre el anuncio y sus condiciones antes de participar o solicitar una promoción.</p></div>
      <div className="store-promo-campaign-grid">
        {sections.map(({ id, title, eyebrow, status, description, icon: Icon }) => <section className="store-promo-campaign" id={id} key={id} aria-labelledby={`${id}-title`}>
          <div className="store-promo-campaign-top"><span className="store-promo-campaign-icon" aria-hidden="true"><Icon size={20}/></span><span className="store-promo-status"><i aria-hidden="true"/>{status}</span></div>
          <span className="store-promo-campaign-eyebrow">{eyebrow}</span>
          <h3 id={`${id}-title`}>{title}</h3>
          <p>{description}</p>
          <div className="store-promo-empty-note"><span aria-hidden="true">—</span><span>Aún no hay novedades publicadas en esta sección.</span></div>
        </section>)}
      </div>
      <aside className="store-promo-footnote"><Sparkles size={17}/><p>Las fechas, requisitos y condiciones se indicarán en cada publicación oficial cuando haya una campaña disponible.</p><Link to="/contacto">¿Tienes una consulta? <ArrowUpRight size={14}/></Link></aside>
    </section>
  </div>;
}
