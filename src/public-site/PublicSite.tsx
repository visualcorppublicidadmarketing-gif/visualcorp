import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronRight, Globe2, MapPin, Menu, MessageCircle, Phone, Printer, ScanLine, Scissors, Shirt, Sparkles, Store, PanelsTopLeft, X } from 'lucide-react';
import { useWorkspace } from '../app/workspace';
import { supabase, supabaseConfigured } from '../lib/supabaseClient';
import { multiProductQuoteService, publicAddress, publicServiceFamilies, serviceProjectPrompts } from './content.ts';
import { QuoteConfigurator, type QuoteDraft } from './quote/QuoteConfigurator';
import { AnimatedList, ScrollProgress, SpotlightLayer, clearSpotlight, updateSpotlight } from '../components/ui/MagicComponents';
import './public-site-v2.css';
import './glass-system.css';
import './public-navigation.css';
import './public-footer.css';
import './contact-page.css';

const HomeContentHighlights = React.lazy(() => import('./ShowcasePages').then((module) => ({ default: module.HomeContentHighlights })));

const wordmark = '/brand/visualcorp-wordmark.png';
const familyInfo = (id) => publicServiceFamilies.find((family) => family.id === id);
const serviceIcons = { impresion: Printer, 'gran-formato': PanelsTopLeft, rotulos: Store, textil: Shirt, corte: Scissors, eventos: ScanLine };

function SiteTitle({ children }) {
  useEffect(() => { document.title = `${children} · Visual Corp`; }, [children]);
  return null;
}

function BrandLink({ onClick = undefined }) {
  return <Link className="site-brand" to="/" onClick={onClick} aria-label="Visual Corp, inicio"><img src={wordmark} alt="Visual Corp — Agencia Creativa" /></Link>;
}

function SiteHeader() {
  const { data } = useWorkspace();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<'services' | 'company' | null>(null);
  const headerRef = useRef(null);
  const servicesRef = useRef(null);
  const companyRef = useRef(null);
  const mobileButtonRef = useRef(null);
  const mobilePanelRef = useRef(null);
  const closeNavigation = () => { setOpenMenu(null); setMobileOpen(false); };
  useEffect(() => {
    closeNavigation();
  }, [location.pathname]);
  useEffect(() => {
    const layoutChange = window.matchMedia('(max-width: 1120px)');
    const handleLayoutChange = () => closeNavigation();
    layoutChange.addEventListener('change', handleLayoutChange);
    return () => layoutChange.removeEventListener('change', handleLayoutChange);
  }, []);
  useEffect(() => {
    const handlePointer = (event) => {
      if (!headerRef.current?.contains(event.target)) closeNavigation();
    };
    const handleEscape = (event) => {
      if (event.key === 'Tab' && mobileOpen) {
        const focusable = [mobileButtonRef.current, ...mobilePanelRef.current.querySelectorAll('a[href]')];
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
        return;
      }
      if (event.key !== 'Escape') return;
      if (mobileOpen) { setMobileOpen(false); mobileButtonRef.current?.focus(); }
      else if (openMenu) {
        const trigger = openMenu === 'services' ? servicesRef : companyRef;
        setOpenMenu(null);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [mobileOpen, openMenu]);
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileOpen]);
  const services = data.services.filter((service) => service.enabled);
  const serviceIsActive = location.pathname.startsWith('/servicios');
  const companyIsActive = ['/nosotros', '/como-trabajamos'].includes(location.pathname);
  return <header className="site-header" ref={headerRef}>
    <div className="site-header-inner"><BrandLink onClick={closeNavigation} />
      <nav className="site-nav" aria-label="Navegación principal">
        <NavLink to="/" end onClick={closeNavigation} className={({ isActive }) => `site-nav-link${isActive ? ' is-active' : ''}`}>Inicio</NavLink>
        <button ref={servicesRef} type="button" className={`site-nav-trigger${serviceIsActive || openMenu === 'services' ? ' is-active' : ''}`} aria-expanded={openMenu === 'services'} aria-controls="site-services-panel" onClick={() => setOpenMenu((current) => current === 'services' ? null : 'services')}>Servicios<ChevronDown size={15} aria-hidden="true" /></button>
        <button ref={companyRef} type="button" className={`site-nav-trigger${companyIsActive || openMenu === 'company' ? ' is-active' : ''}`} aria-expanded={openMenu === 'company'} aria-controls="site-company-panel" onClick={() => setOpenMenu((current) => current === 'company' ? null : 'company')}>La empresa<ChevronDown size={15} aria-hidden="true" /></button>
        <NavLink to="/portafolio" onClick={closeNavigation} className={({ isActive }) => `site-nav-link${isActive ? ' is-active' : ''}`}>Portafolio</NavLink>
        <NavLink to="/publicaciones" onClick={closeNavigation} className={({ isActive }) => `site-nav-link${isActive ? ' is-active' : ''}`}>Publicaciones</NavLink>
        <NavLink to="/blog" onClick={closeNavigation} className={({ isActive }) => `site-nav-link${isActive ? ' is-active' : ''}`}>Blog</NavLink>
        <NavLink to="/tienda" onClick={closeNavigation} className={({ isActive }) => `site-nav-link${isActive ? ' is-active' : ''}`}>Tienda</NavLink>
        <NavLink to="/contacto" onClick={closeNavigation} className={({ isActive }) => `site-nav-link${isActive ? ' is-active' : ''}`}>Contacto</NavLink>
      </nav>
      <div className="site-header-actions"><Link className="site-quote-button vc-shimmer-button" to="/cotizador" onClick={closeNavigation}><span className="quote-label-wide">Solicitar cotización</span><span className="quote-label-short">Cotizar</span><ArrowUpRight size={16} aria-hidden="true" /></Link><button ref={mobileButtonRef} type="button" className="site-menu-toggle" onClick={() => { setOpenMenu(null); setMobileOpen((open) => !open); }} aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={mobileOpen} aria-controls="site-mobile-navigation">{mobileOpen ? <X size={21}/> : <Menu size={21}/>}</button></div>
      {openMenu === 'services' && <div className="site-mega-panel" id="site-services-panel">
        <div className="site-mega-intro"><span className="site-mega-kicker">LO QUE HACEMOS <i/></span><h2>De la idea<br/>a lo tangible<span>.</span></h2><p>Explora lo que podemos crear para tu marca, tu espacio o tu próximo proyecto.</p><Link to="/servicios" onClick={closeNavigation}>Explorar todos los servicios <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
        <div className="site-mega-content"><span className="site-mega-label">ELIGE UNA ESPECIALIDAD</span><div className="site-mega-services">{services.map((service) => { const Icon = serviceIcons[service.id] || Sparkles; return <Link key={service.id} to={`/servicios/${service.id}`} onClick={closeNavigation} className={location.pathname === `/servicios/${service.id}` ? 'is-active' : ''}><span className="site-mega-icon"><Icon size={19} aria-hidden="true" /></span><span><strong>{service.name}</strong><small>{service.description}</small></span><ArrowUpRight className="site-mega-arrow" size={17} aria-hidden="true" /></Link>; })}</div></div>
      </div>}
      {openMenu === 'company' && <div className="site-mega-panel site-company-panel" id="site-company-panel"><div className="site-mega-intro"><span className="site-mega-kicker">VISUAL CORP <i/></span><h2>Conoce<br/>nuestro mundo<span>.</span></h2><p>Una mirada a quiénes somos y cómo damos forma a cada proyecto.</p></div><div className="site-company-links"><Link to="/nosotros" onClick={closeNavigation}><span className="site-company-number">01</span><strong>Quiénes somos</strong><small>La marca, el equipo y lo que nos mueve.</small><ArrowUpRight size={20} aria-hidden="true" /></Link><Link to="/como-trabajamos" onClick={closeNavigation}><span className="site-company-number">02</span><strong>Cómo trabajamos</strong><small>Del primer contacto a la producción.</small><ArrowUpRight size={20} aria-hidden="true" /></Link></div></div>}
    </div>
    {mobileOpen && <><button type="button" className="site-mobile-backdrop" tabIndex={-1} onClick={closeNavigation} aria-label="Cerrar navegación"/><nav ref={mobilePanelRef} className="site-mobile-panel" id="site-mobile-navigation" aria-label="Navegación móvil"><span className="site-mobile-kicker">EXPLORA VISUAL CORP</span><div className="site-mobile-primary"><NavLink to="/" end onClick={closeNavigation}>Inicio<ArrowUpRight size={18} aria-hidden="true" /></NavLink><NavLink to="/servicios" onClick={closeNavigation}>Servicios<ArrowUpRight size={18} aria-hidden="true" /></NavLink><NavLink to="/nosotros" onClick={closeNavigation}>La empresa<ArrowUpRight size={18} aria-hidden="true" /></NavLink><NavLink to="/portafolio" onClick={closeNavigation}>Portafolio<ArrowUpRight size={18} aria-hidden="true" /></NavLink><NavLink to="/publicaciones" onClick={closeNavigation}>Publicaciones<ArrowUpRight size={18} aria-hidden="true" /></NavLink><NavLink to="/blog" onClick={closeNavigation}>Blog<ArrowUpRight size={18} aria-hidden="true" /></NavLink><NavLink to="/tienda" onClick={closeNavigation}>Tienda<ArrowUpRight size={18} aria-hidden="true" /></NavLink><NavLink to="/contacto" onClick={closeNavigation}>Contacto<ArrowUpRight size={18} aria-hidden="true" /></NavLink></div><div className="site-mobile-services"><span>ESPECIALIDADES</span><div>{services.map((service) => { const Icon = serviceIcons[service.id] || Sparkles; return <Link key={service.id} to={`/servicios/${service.id}`} onClick={closeNavigation}><Icon size={17} aria-hidden="true" />{service.name}<ArrowUpRight size={15} aria-hidden="true" /></Link>; })}</div></div><Link className="site-mobile-process" to="/como-trabajamos" onClick={closeNavigation}>Cómo trabajamos <ArrowUpRight size={16} aria-hidden="true" /></Link><Link className="site-mobile-quote" to="/cotizador" onClick={closeNavigation}>Cuéntanos tu idea <ArrowUpRight size={19} aria-hidden="true" /></Link></nav></>}
  </header>;
}

function SiteFooter() {
  const { data } = useWorkspace();
  const services = data.services.filter((service) => service.enabled);
  return <footer className="site-footer" aria-label="Pie de página">
    <div className="footer-shell">
      <div className="footer-topline">
        <span><i aria-hidden="true"/> VISUAL CORP <b>·</b> {data.settings.location.toUpperCase()}</span>
        <span className="footer-topline-promise">IDEAS QUE TOMAN FORMA <Sparkles size={13} aria-hidden="true"/></span>
      </div>
      <div className="site-footer-main">
        <div className="footer-brand-column">
          <BrandLink/>
          <p>Ideas, producción y comunicación para que tu marca ocupe su espacio.</p>
          <span className="footer-location"><Globe2 size={15} aria-hidden="true"/>{data.settings.location}</span>
        </div>
        <nav className="footer-link-column" aria-label="Explorar">
          <b>Explorar</b>
          <Link to="/">Inicio</Link><Link to="/nosotros">La empresa</Link><Link to="/como-trabajamos">Cómo trabajamos</Link>
          <Link to="/portafolio">Portafolio</Link><Link to="/publicaciones">Publicaciones</Link><Link to="/blog">Blog</Link>
          <Link to="/tienda">Tienda</Link><Link to="/contacto">Contacto</Link>
        </nav>
        <nav className="footer-link-column" aria-label="Servicios">
          <b>Servicios</b>
          {services.slice(0, 5).map((service) => <Link key={service.id} to={`/servicios/${service.id}`}>{service.name}</Link>)}
          <Link className="footer-all-services" to="/servicios">Ver todos <ArrowUpRight size={13} aria-hidden="true"/></Link>
        </nav>
        <div className="footer-contact-column">
          <b>Canales directos</b>
          <p>Cuéntanos qué necesitas y revisaremos contigo el siguiente paso.</p>
          <div className="footer-social-links">
            <a href={`https://instagram.com/${data.settings.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer"><Globe2 size={16} aria-hidden="true"/><span>Instagram<small>{data.settings.instagram}</small></span><ArrowUpRight size={14} aria-hidden="true"/></a>
            <a href={`https://wa.me/593${data.settings.contactPhone.replace(/^0/, '')}`} target="_blank" rel="noreferrer"><MessageCircle size={16} aria-hidden="true"/><span>WhatsApp<small>{data.settings.contactPhone}</small></span><ArrowUpRight size={14} aria-hidden="true"/></a>
          </div>
        </div>
      </div>
      <div className="footer-cta-strip">
        <div className="footer-cta-copy"><span>HAGAMOS ESPACIO PARA TU PRÓXIMA IDEA</span><strong>¿Tienes una idea en mente?</strong></div>
        <Link className="footer-cta-link" to="/cotizador"><span>Hablemos de tu proyecto</span><ArrowUpRight size={18} aria-hidden="true"/></Link>
      </div>
      <div className="site-footer-bottom">
        <span>© {new Date().getFullYear()} Visual Corp · {data.settings.location}</span>
        <Link to="/contacto">Contacto</Link>
      </div>
    </div>
  </footer>;
}

export function PublicSiteLayout() {
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  return <div className="public-site"><ScrollProgress/><SiteHeader/><main className="site-main"><motion.div key={location.pathname} className="vc-route-frame" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.28 }}><Outlet/></motion.div></main><SiteFooter/></div>;
}

function Eyebrow({ children, light = false }) { return <span className={`site-eyebrow${light ? ' light' : ''}`}><i/>{children}</span>; }

function SectionTitle({ eyebrow, title, description, light = false }) {
  return <div className={`site-section-title${light ? ' light' : ''}`}><div><Eyebrow light={light}>{eyebrow}</Eyebrow><h2>{title}</h2></div>{description && <p>{description}</p>}</div>;
}

function ServiceCard({ service, index = 0 }) {
  const info = familyInfo(service.id);
  const Icon = serviceIcons[service.id] || Sparkles;
  return <Link className="site-service-card vc-magic-card" to={`/servicios/${service.id}`} onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight}><SpotlightLayer/><span className="site-service-index">{info?.mark || String(index + 1).padStart(2, '0')}</span><span className="site-service-icon"><Icon size={20} aria-hidden="true"/></span><h3>{service.name}</h3><p>{service.description}</p><span className="site-card-link">Explorar servicio <ArrowUpRight size={15}/></span></Link>;
}

function LeadForm({ variant = 'contact', initialService = '', quoteData = null, selectedService = undefined, onServiceChange = undefined }) {
  const { data, add } = useWorkspace();
  const [form, setForm] = useState({ name: '', phone: '', company: '', service: initialService, details: '' });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setForm((current) => ({ ...current, service: initialService || current.service })), [initialService]);
  useEffect(() => { if (selectedService !== undefined) setForm((current) => ({ ...current, service: selectedService })); }, [selectedService]);
  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || sending) return;
    if (variant === 'quote' && quoteData && (!quoteData.service || !quoteData.project.trim())) {
      setError('Selecciona una familia de servicio y describe tu proyecto para continuar.');
      return;
    }
    const requestService = variant === 'quote' && quoteData?.service ? quoteData.service : selectedService ?? form.service;
    setSending(true);
    setError('');
    try {
      if (supabaseConfigured) {
        const { error: requestError } = await supabase.from('public_requests').insert({
          request_type: variant === 'quote' ? 'quote' : 'contact',
          name: form.name.trim(), phone: form.phone.trim(), company: form.company.trim(),
          service: requestService, message: form.details.trim(),
          quote_data: variant === 'quote' ? { details: form.details.trim(), service: requestService, request: quoteData } : {},
        });
        if (requestError) throw requestError;
      } else if (import.meta.env.PROD) {
        throw new Error('El formulario todavía no está conectado. Escríbenos por WhatsApp.');
      } else {
        add('leads', { ...form, service: requestService, quoteData: variant === 'quote' ? quoteData : null, source: variant === 'quote' ? 'Cotizador público' : 'Sitio web', stage: 'Nuevo', notes: '', campaignId: '' });
      }
      setForm({ name: '', phone: '', company: '', service: initialService, details: '' });
      setSent(true);
    } catch (cause) {
      setError(cause?.message || 'No se pudo enviar la solicitud. Intenta nuevamente o escríbenos por WhatsApp.');
    } finally {
      setSending(false);
    }
  };
  const services = data.services.filter((service) => service.enabled);
  return <form className={`site-lead-form${variant === 'contact' ? ' contact-form' : ''}`} onSubmit={submit}>
    <div className="site-form-title">{variant === 'contact' ? <div><span className="contact-form-kicker">CUÉNTANOS TU IDEA</span><b>Empecemos por lo esencial.</b></div> : <b>Detalles del proyecto</b>}<small>Los campos con * son necesarios.</small></div>
    {sent && <div className="site-success" role="status"><Check size={16}/> Solicitud registrada. Gracias por escribirnos.</div>}
    {error && <div className="site-form-error" role="alert">{error} <a href={`https://wa.me/593${data.settings.contactPhone.replace(/^0/, '')}`} target="_blank" rel="noreferrer">Abrir WhatsApp <ArrowUpRight size={13}/></a></div>}
    <div className="site-form-row"><label>Nombre *<input required autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Tu nombre"/></label><label>Teléfono o WhatsApp *<input required type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="09…"/></label></div>
    <label>Negocio <span>(opcional)</span><input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} placeholder="Nombre de tu negocio"/></label>
    <label className={variant === 'quote' ? 'quote-form-service' : undefined}>¿Qué necesitas?<select value={selectedService ?? form.service} onChange={(event) => { setForm({ ...form, service: event.target.value }); onServiceChange?.(event.target.value); }}><option value="">Selecciona una familia de trabajo</option>{(selectedService ?? form.service) === multiProductQuoteService && <option value={multiProductQuoteService}>{multiProductQuoteService}</option>}{services.map((service) => <option value={service.name} key={service.id}>{service.name}</option>)}</select></label>
    <label>{variant === 'quote' ? (quoteData ? 'Detalles adicionales (opcional)' : 'Describe tu proyecto *') : 'Cuéntanos un poco más'}<textarea required={variant === 'quote' && !quoteData} rows={variant === 'quote' ? 4 : 3} value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} placeholder={variant === 'quote' ? 'Agrega cualquier contexto que ayude a entender tu proyecto' : 'Objetivo, referencia o plazo que tienes en mente'}/></label>
    <button className="site-primary-button form-submit" type="submit" disabled={sending}>{sending ? 'Enviando…' : variant === 'quote' ? 'Enviar solicitud' : 'Enviar a Visual Corp'}<ArrowUpRight size={17}/></button>
    <small className="site-form-note">Usaremos estos datos para responder tu solicitud. No incluyas información sensible.</small>
  </form>;
}

export function PublicHomePage() {
  const { data } = useWorkspace();
  const services = data.services.filter((service) => service.enabled);
  return <><SiteTitle>Inicio</SiteTitle>
    <section className="site-hero">
      <div className="site-hero-glow glow-pink"/><div className="site-hero-glow glow-blue"/>
      <div className="site-hero-content"><Eyebrow light>{data.settings.heroEyebrow}</Eyebrow><h1>{data.settings.heroTitle}</h1><p>{data.settings.heroText}</p><div className="site-hero-actions"><Link className="site-primary-button" to="/cotizador">Cuéntanos tu idea <ArrowUpRight size={17}/></Link><Link className="site-secondary-button" to="/servicios">Explorar servicios <ArrowRight size={16}/></Link></div><div className="site-hero-proof"><span><Check size={14}/>Atención directa</span><span><Check size={14}/>Ideas y producción</span><span><Check size={14}/>{data.settings.location}</span></div></div>
      <div className="site-hero-art"><div className="site-mascot-halo" aria-hidden="true"/><div className="site-mascot-floor" aria-hidden="true"/><img className="site-mascot-image" src="/public-site/visualito-hero.webp" alt="Visualito, mascota de Visual Corp" width={720} height={1080} fetchPriority="high"/><div className="site-art-label label-top">IDEAS EN MOVIMIENTO</div></div>
      <a className="site-scroll-cue" href="#servicios">Descubre Visual Corp <ArrowDownRight size={15}/></a>
    </section>
    <section className="site-services-section" id="servicios"><SectionTitle eyebrow="SERVICIOS CONECTADOS" title={<>Una idea puede tomar<br/>muchas formas.</>} description="Elige una familia de trabajo para conocerla mejor. Si no sabes por dónde empezar, cuéntanos tu idea y te orientamos."/><AnimatedList className="site-services-grid" stagger={0.075}>{services.map((service, index) => <ServiceCard service={service} index={index} key={service.id}/>)}</AnimatedList><Link className="site-text-link" to="/servicios">Ver todas las familias de servicio <ArrowRight size={16}/></Link></section>
    <section className="site-bridge"><div className="bridge-copy"><Eyebrow>DEL CONCEPTO A LA REALIDAD</Eyebrow><h2>Diseño, producción<br/>y una idea en común.</h2><p>Visual Corp es una agencia de publicidad y marketing en Milagro. Conversamos sobre lo que necesitas y te ayudamos a definir un siguiente paso.</p><Link className="site-primary-button" to="/como-trabajamos">Conoce cómo trabajamos <ArrowUpRight size={16}/></Link></div><AnimatedList className="bridge-steps"><article key="01"><b>01</b><div><h3>Cuéntanos</h3><p>Comparte tu idea y el objetivo que buscas.</p></div><ArrowUpRight size={15}/></article><article key="02"><b>02</b><div><h3>Lo revisamos</h3><p>Aterrizamos juntos los detalles del proyecto.</p></div><ArrowUpRight size={15}/></article><article key="03"><b>03</b><div><h3>Avanzamos</h3><p>Definimos el camino adecuado para tu solicitud.</p></div><ArrowUpRight size={15}/></article></AnimatedList></section>
     <React.Suspense fallback={null}><HomeContentHighlights/></React.Suspense>
     <Callout data={data}/>
  </>;
}

export function ServicesIndexPage() {
  const { data } = useWorkspace();
  const services = data.services.filter((service) => service.enabled);
  return <><SiteTitle>Servicios</SiteTitle><PageHero eyebrow="LO QUE HACEMOS" title={<>Ideas que encuentran<br/>su forma.</>} description="Explora las familias de trabajo de Visual Corp. Cada proyecto empieza con una conversación sobre lo que necesitas." primary={{ label: 'Cuéntanos tu proyecto', to: '/cotizador' }} secondary={{ label: 'Cómo trabajamos', to: '/como-trabajamos' }}/><section className="site-page-section"><AnimatedList className="site-services-grid" stagger={0.075}>{services.map((service, index) => <ServiceCard key={service.id} service={service} index={index}/>)}</AnimatedList><p className="site-service-note">Cada solicitud se revisa según su alcance. Materiales, disponibilidad, valores y tiempos se confirman para cada proyecto.</p></section><Callout data={data}/></>;
}

export function ServiceDetailPage() {
  const { slug } = useParams();
  const { data } = useWorkspace();
  const service = data.services.find((item) => item.id === slug);
  const details = familyInfo(slug);
  if (!service?.enabled) return <PageNotFound title="Este servicio no está disponible"/>;
  const Icon = serviceIcons[service.id] || Sparkles;
  return <><SiteTitle>{service.name}</SiteTitle><PageHero eyebrow={`SERVICIOS · ${details?.mark || ''}`} title={service.name} description={service.description} compact primary={{ label: 'Solicitar cotización', to: `/cotizador?servicio=${encodeURIComponent(service.name)}` }} secondary={{ label: 'Todos los servicios', to: '/servicios' }}/><section className="site-detail-section"><div className="site-detail-copy"><Eyebrow>PARA EMPEZAR</Eyebrow><h2>Háblanos de<br/>tu proyecto.</h2><p>{serviceProjectPrompts[service.id] || 'Cuéntanos el objetivo y comparte una referencia si la tienes.'} Revisaremos contigo el alcance antes de confirmar valores o tiempos.</p><Link className="site-primary-button" to={`/cotizador?servicio=${encodeURIComponent(service.name)}`}>Describir mi proyecto <ArrowUpRight size={16}/></Link></div><div className="site-detail-card"><span className="site-detail-number">{details?.mark || 'VC'}</span><Icon size={25} aria-hidden="true"/><h3>{service.name}</h3><p>{service.description}</p><div className="detail-card-divider"/><span>Alcance sujeto a revisión con el equipo</span></div></section><Callout data={data} title="¿No sabes si esta es la familia adecuada?"/></>;
}

export function AboutPage() {
  const { data } = useWorkspace();
  return <><SiteTitle>La empresa</SiteTitle><PageHero eyebrow="VISUAL CORP" title={<>Ideas para marcas<br/>que quieren destacar.</>} description={`Somos una agencia de publicidad y marketing en ${data.settings.location}. Acompañamos ideas desde el diseño hasta soluciones visuales para marcas y espacios.`} primary={{ label: 'Conversemos', to: '/contacto' }} secondary={{ label: 'Cómo trabajamos', to: '/como-trabajamos' }}/><section className="site-about-section"><div className="about-mark"><img src="/brand/visualcorp-symbol.png" alt="Símbolo Visual Corp"/><span>VISUAL CORP<br/><small>AGENCIA CREATIVA</small></span></div><div><Eyebrow>QUIÉNES SOMOS</Eyebrow><h2>Hacemos visible<br/>lo que imaginas.</h2><p>En Visual Corp creemos que cada negocio tiene una historia que merece verse. Reunimos creatividad, publicidad y producción visual para ayudar a convertir ideas en proyectos concretos.</p><p>Estamos en Milagro, Ecuador. Cuéntanos qué estás pensando y encontraremos un primer paso contigo.</p><Link to="/como-trabajamos" className="site-text-link">Conoce nuestro proceso <ArrowRight size={16}/></Link></div></section><Callout data={data}/></>;
}

export function ProcessPage() {
  const { data } = useWorkspace();
  const steps = [{ n: '01', title: 'Nos cuentas la idea', text: 'Comparte el objetivo, el espacio o la necesidad que quieres resolver.' }, { n: '02', title: 'Revisamos los detalles', text: 'Conversamos sobre referencias, medidas, cantidades y el alcance del proyecto.' }, { n: '03', title: 'Definimos el siguiente paso', text: 'Te orientamos sobre cómo avanzar. Valores, disponibilidad y tiempos se confirman según cada solicitud.' }];
  return <><SiteTitle>Cómo trabajamos</SiteTitle><PageHero eyebrow="UN CAMINO CLARO" title={<>De la primera idea<br/>al siguiente paso.</>} description="Una conversación sencilla nos ayuda a entender lo que buscas y revisar cómo podemos ayudarte." primary={{ label: 'Iniciar una conversación', to: '/contacto' }} secondary={{ label: 'Explorar servicios', to: '/servicios' }}/><section className="site-process-section"><div className="process-intro"><Eyebrow>ASÍ EMPEZAMOS</Eyebrow><h2>Primero entendemos<br/>el proyecto.</h2><p>No necesitas tener todas las respuestas listas. Cuéntanos lo que tienes en mente y completamos la información contigo.</p><Link className="site-primary-button" to="/contacto">Iniciar una conversación <ArrowUpRight size={16}/></Link></div><AnimatedList className="process-list" stagger={0.1}>{steps.map((step) => <article key={step.n}><b>{step.n}</b><div><h3>{step.title}</h3><p>{step.text}</p></div></article>)}</AnimatedList></section><section className="site-process-location"><Globe2 size={18}/><span><b>{data.settings.location}</b><small>Agencia de publicidad y marketing</small></span><Link to="/contacto">Contactar <ArrowUpRight size={14}/></Link></section></>;
}

export function ContactPage() {
  const { data } = useWorkspace();
  const [searchParams] = useSearchParams();
  const contactHeroRef = useRef<HTMLElement | null>(null);
  const contactFormRef = useRef<HTMLDivElement | null>(null);
  const contactFaqRef = useRef<HTMLElement | null>(null);
  const [showContactDock, setShowContactDock] = useState(false);
  const contactServices = data.services.filter((service) => service.enabled);
  const requestedService = searchParams.get('servicio') || '';
  const initialContactService = contactServices.find((service) => service.id === requestedService || service.name.toLocaleLowerCase('es') === requestedService.toLocaleLowerCase('es'))?.name || '';
  const [selectedService, setSelectedService] = useState(initialContactService);
  useEffect(() => setSelectedService(initialContactService), [initialContactService]);
  useEffect(() => {
    const hero = contactHeroRef.current;
    const form = contactFormRef.current;
    const faq = contactFaqRef.current;
    if (!hero || !form || !faq || !('IntersectionObserver' in window)) return undefined;
    const visible = new Map<Element, boolean>([[hero, true], [form, false], [faq, false]]);
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const minimumVisibleRatio = entry.target === form ? 0.22 : entry.target === faq ? 0.1 : 0;
        const isPastHero = entry.target === hero && entry.boundingClientRect.bottom <= 12;
        visible.set(entry.target, entry.target === hero ? !isPastHero : entry.intersectionRatio >= minimumVisibleRatio && entry.isIntersecting);
      });
      setShowContactDock(!visible.get(hero) && !visible.get(form) && !visible.get(faq));
    }, { threshold: [0, 0.1, 0.22] });
    [hero, form, faq].forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  const whatsappText = selectedService
    ? `Hola, Visual Corp. Quisiera conversar sobre un proyecto de ${selectedService.toLocaleLowerCase('es')}.`
    : 'Hola, Visual Corp. Quisiera conversar sobre un proyecto.';
  const whatsapp = `https://wa.me/593${data.settings.contactPhone.replace(/^0/, '')}?text=${encodeURIComponent(whatsappText)}`;
  const phoneLink = `tel:${data.settings.contactPhone.replace(/[^\d+]/g, '')}`;
  return <><SiteTitle>Contacto</SiteTitle>
    <section className="contact-hero" ref={contactHeroRef} aria-labelledby="contact-page-title">
      <div className="contact-hero-glow contact-hero-glow-pink"/><div className="contact-hero-glow contact-hero-glow-blue"/>
      <div className="contact-hero-inner">
        <div className="contact-hero-copy"><Eyebrow light>VISUAL CORP · MILAGRO, ECUADOR</Eyebrow><h1 id="contact-page-title">Tu próxima idea<br/>merece <em>verse.</em></h1><p>Cuéntanos qué quieres comunicar o crear. Te ayudamos a encontrar un primer paso para tu proyecto.</p>
          <div className="contact-hero-actions"><a className="contact-whatsapp-cta" href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={17}/> Hablar por WhatsApp <ArrowUpRight size={15}/></a><a className="contact-form-cta" href="#contacto-formulario">Escribir mi solicitud <ArrowDownRight size={16}/></a></div>
          <div className="contact-hero-proof"><span><i/> Atención directa</span><span><i/> Diseño y producción</span><span><MapPin size={14}/> Milagro, Ecuador</span></div>
        </div>
        <div className="contact-hero-art" aria-hidden="true"><div className="contact-art-orbit orbit-one"/><div className="contact-art-orbit orbit-two"/><div className="contact-art-core"><img src="/brand/visualcorp-symbol.png" alt=""/><span>VISUAL CORP</span><small>IDEAS EN MOVIMIENTO</small></div><div className="contact-art-tag tag-top"><Sparkles size={14}/> UNA IDEA</div><div className="contact-art-tag tag-bottom"><span/> UN SIGUIENTE PASO</div><div className="contact-art-index">01 <i/> 03</div></div>
      </div>
      <a className="contact-scroll-cue" href="#contacto-opciones">BAJA PARA CONVERSAR <ArrowDownRight size={14}/></a>
    </section>
    <section className="contact-workspace" id="contacto-opciones" aria-label="Opciones para contactar a Visual Corp">
        <div className="contact-info-column"><div className="contact-section-heading"><Eyebrow>CONTACTO DIRECTO</Eyebrow><h2>Elige cómo<br/>empezar.</h2><p>Escríbenos directamente o déjanos los detalles y los revisaremos contigo.</p></div>
        <div className="contact-channel-cards"><a className="contact-channel-card contact-channel-whatsapp" href={whatsapp} target="_blank" rel="noreferrer"><span className="contact-channel-icon"><MessageCircle size={19}/></span><span><small>CONVERSACIÓN DIRECTA</small><b>WhatsApp</b><em>{data.settings.contactPhone}</em></span><ArrowUpRight size={17}/></a><a className="contact-channel-card" href={phoneLink}><span className="contact-channel-icon phone-icon"><Phone size={18}/></span><span><small>LLAMADA</small><b>Llámanos</b><em>{data.settings.contactPhone}</em></span><ArrowUpRight size={17}/></a><a className="contact-channel-card" href={`https://instagram.com/${data.settings.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer"><span className="contact-channel-icon instagram-icon"><Globe2 size={18}/></span><span><small>REDES SOCIALES</small><b>Instagram</b><em>{data.settings.instagram}</em></span><ArrowUpRight size={17}/></a></div>
        <div className="contact-service-picker"><div><small>¿YA SABES QUÉ BUSCAS?</small><span>Elige una opción para preparar tu mensaje.</span></div><div className="contact-service-chips" aria-label="Selecciona una familia de trabajo">{contactServices.map((service) => <button key={service.id} type="button" className={selectedService === service.name ? 'is-selected' : ''} aria-pressed={selectedService === service.name} onClick={() => setSelectedService((current) => current === service.name ? '' : service.name)}>{service.name}</button>)}</div><p className="contact-service-feedback" aria-live="polite">{selectedService ? `Listo: ${selectedService}. También prepararemos tu mensaje de WhatsApp.` : 'Puedes elegir una familia o pedir orientación.'}</p><a className="contact-service-link" href="#contacto-formulario">{selectedService ? `Formulario: ${selectedService}` : 'Prefiero que me orienten'} <ChevronRight size={14}/></a></div>
        <div className="contact-location-card"><div className="contact-location-mark"><MapPin size={19}/></div><div><small>VISÍTANOS EN</small><b>Milagro, Ecuador</b><span>{publicAddress}</span><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(publicAddress)}`} target="_blank" rel="noreferrer">Abrir ubicación en Maps <ArrowUpRight size={13}/></a></div></div>
      </div>
      <div className="contact-form-column" ref={contactFormRef} id="contacto-formulario"><div className="contact-form-intro"><span className="contact-form-step">01 <i/> 01</span><span>FORMULARIO DE CONTACTO</span></div><LeadForm initialService={initialContactService} selectedService={selectedService} onServiceChange={setSelectedService}/></div>
    </section>
    <section className="contact-next-steps" aria-labelledby="contact-next-title"><div className="contact-next-heading"><Eyebrow>UN BUEN COMIENZO</Eyebrow><h2 id="contact-next-title">Así ponemos<br/>tu idea en marcha.</h2><p>Una conversación sencilla nos ayuda a entender lo que necesitas y revisar contigo el siguiente paso.</p></div><AnimatedList className="contact-step-list" stagger={0.12}><article><span>01</span><div><b>Cuéntanos tu idea</b><p>Indica qué quieres comunicar, crear o resolver.</p></div><MessageCircle size={18}/></article><article><span>02</span><div><b>Comparte lo que ya sabes</b><p>Medidas, cantidades, referencias o una foto pueden orientar la conversación.</p></div><Sparkles size={18}/></article><article><span>03</span><div><b>Revisamos cómo avanzar</b><p>El alcance, los valores y los tiempos se confirman según cada proyecto.</p></div><ArrowRight size={18}/></article></AnimatedList></section>
    <section className="contact-faq" ref={contactFaqRef} aria-labelledby="contact-faq-title"><div className="contact-faq-heading"><Eyebrow>ANTES DE ESCRIBIR</Eyebrow><h2 id="contact-faq-title">Preguntas frecuentes</h2></div><div className="contact-faq-list"><details><summary>¿Necesito tener el diseño listo?<ChevronDown size={17}/></summary><p>No. Puedes empezar con una idea, una necesidad o una referencia. Si ya tienes un diseño, medidas o cantidades, compártelas para orientar mejor la conversación.</p></details><details><summary>¿Cómo se definen los valores y tiempos?<ChevronDown size={17}/></summary><p>Se revisan según el tipo de trabajo y sus detalles. El equipo confirma el alcance, los valores y los tiempos antes de cotizar.</p></details><details><summary>¿Puedo visitar Visual Corp?<ChevronDown size={17}/></summary><p>Estamos en {publicAddress}. Abre la ubicación en Maps desde esta página para planificar tu visita.</p></details></div></section>
    {showContactDock && <nav className="contact-mobile-dock" aria-label="Acciones rápidas de contacto"><a className="contact-mobile-dock-whatsapp" href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={17} aria-hidden="true"/><span>WhatsApp</span><ArrowUpRight size={15} aria-hidden="true"/></a><a className="contact-mobile-dock-form" href="#contacto-formulario"><span>Ir al formulario</span><ArrowDownRight size={15} aria-hidden="true"/></a></nav>}
  </>;
}

export function PublicQuotePage() {
  const [searchParams] = useSearchParams();
  const service = searchParams.get('servicio') || '';
  const requestedProducts = searchParams.getAll('producto').map((product) => product.trim()).filter(Boolean);
  const requestedQuantityRanges = searchParams.getAll('cantidad');
  const { data } = useWorkspace();
  const [quoteData, setQuoteData] = useState<QuoteDraft | null>(null);
  const services = useMemo(() => data.services.filter((item) => item.enabled), [data.services]);
  return <><SiteTitle>Solicitar cotización</SiteTitle><PageHero eyebrow="COTIZA TU PROYECTO" title={<>Cuéntanos lo que<br/>quieres hacer.</>} description="Prepara los detalles de tu proyecto y envía una solicitud al equipo. Los valores y condiciones se confirman antes de cotizar." primary={{ label: 'Armar mi solicitud', to: '#cotizador-visualcorp' }} secondary={{ label: 'Ver servicios', to: '/servicios' }}/><section className="site-quote-workspace" id="cotizador-visualcorp"><QuoteConfigurator services={services} initialService={service} initialProducts={requestedProducts} initialQuantityRanges={requestedQuantityRanges} onChange={setQuoteData}/><div className="site-quote-request" id="formulario-cotizacion"><LeadForm variant="quote" initialService={quoteData?.service || service} quoteData={quoteData}/></div></section></>;
}
function PageHero({ eyebrow, title, description, compact = false, primary, secondary }) {
  const action = (item, className, Icon) => item.to.startsWith('#')
    ? <a className={className} href={item.to}>{item.label} <Icon size={16}/></a>
    : <Link className={className} to={item.to}>{item.label} <Icon size={16}/></Link>;
  return <section className={`site-page-hero${compact ? ' compact' : ''}`}><div className="site-hero-glow glow-pink"/><div className="site-page-hero-inner"><Eyebrow light>{eyebrow}</Eyebrow><h1>{title}</h1><p>{description}</p><div className="site-page-hero-actions">{primary && action(primary, 'site-primary-button', ArrowUpRight)}{secondary && action(secondary, 'site-secondary-button', ArrowRight)}</div></div></section>;
}

function Callout({ data, title = '¿Tienes una idea en mente?' }) {
  return <section className="site-callout"><div><Eyebrow light>HABLEMOS DE TU PROYECTO</Eyebrow><h2>{title}</h2><p>Comparte lo que buscas. Revisaremos contigo el siguiente paso.</p></div><Link className="site-primary-button" to="/contacto">Contactar a Visual Corp <ArrowUpRight size={16}/></Link></section>;
}

function PageNotFound({ title }) { return <section className="site-not-found"><Eyebrow>VISUAL CORP</Eyebrow><h1>{title}</h1><p>Revisa la lista de servicios o vuelve al inicio.</p><Link to="/servicios" className="site-primary-button">Ver servicios <ArrowRight size={16}/></Link></section>; }
