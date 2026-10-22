import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, ChevronDown, Globe2, Menu, MessageCircle, Printer, Sparkles, X } from 'lucide-react';
import { useWorkspace } from '../app/workspace';
import { supabase, supabaseConfigured } from '../lib/supabaseClient';
import { publicServiceFamilies } from './content';
import './public-site.css';

const wordmark = '/brand/visualcorp-wordmark.png';
const familyInfo = (id) => publicServiceFamilies.find((family) => family.id === id);

function SiteTitle({ children }) {
  useEffect(() => { document.title = `${children} · Visual Corp`; }, [children]);
  return null;
}

function BrandLink() {
  return <Link className="site-brand" to="/" aria-label="Visual Corp, inicio"><img src={wordmark} alt="Visual Corp — Agencia Creativa" /></Link>;
}

function SiteHeader() {
  const { data } = useWorkspace();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => setMobileOpen(false), [location.pathname]);
  const services = data.services.filter((service) => service.enabled);
  const menuGroups = [
    { label: 'Servicios', to: '/servicios', children: [{ label: 'Ver todos los servicios', to: '/servicios' }, ...services.map((service) => ({ label: service.name, to: `/servicios/${service.id}` }))] },
    { label: 'La empresa', to: '/nosotros', children: [{ label: 'Quiénes somos', to: '/nosotros' }, { label: 'Cómo trabajamos', to: '/como-trabajamos' }] },
  ];
  return <header className="site-header">
    <div className="site-header-inner"><BrandLink />
      <nav className="site-nav" aria-label="Navegación principal">
        <NavLink to="/" end className={({ isActive }) => `site-nav-link${isActive ? ' is-active' : ''}`}>Inicio</NavLink>
        {menuGroups.map((group) => <details className="site-nav-group" key={group.label}>
          <summary aria-label={`${group.label}, abrir subpáginas`}>{group.label}<ChevronDown size={14} /></summary>
          <div className="site-nav-dropdown"><span className="dropdown-kicker">{group.label}</span>{group.children.map((item) => <Link key={item.to} to={item.to} className={location.pathname === item.to ? 'is-active' : ''}>{item.label}<ArrowUpRight size={13} /></Link>)}</div>
        </details>)}
        <NavLink to="/contacto" className={({ isActive }) => `site-nav-link${isActive ? ' is-active' : ''}`}>Contacto</NavLink>
      </nav>
      <div className="site-header-actions"><Link className="site-quote-button" to="/cotizador">Solicitar cotización <ArrowUpRight size={15}/></Link><button className="site-menu-toggle" onClick={() => setMobileOpen((open) => !open)} aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={mobileOpen}>{mobileOpen ? <X/> : <Menu/>}</button></div>
    </div>
    {mobileOpen && <nav className="site-mobile-nav" aria-label="Navegación móvil">
      <NavLink to="/" end>Inicio</NavLink>
      {menuGroups.map((group) => <details key={group.label} className="mobile-nav-group"><summary>{group.label}<ChevronDown size={17}/></summary><div>{group.children.map((item) => <Link key={item.to} to={item.to}>{item.label}<ArrowUpRight size={13}/></Link>)}</div></details>)}
      <NavLink to="/contacto">Contacto</NavLink>
      <Link className="mobile-quote-cta" to="/cotizador">Solicitar cotización <ArrowUpRight size={16}/></Link>
    </nav>}
  </header>;
}

function SiteFooter() {
  const { data } = useWorkspace();
  const services = data.services.filter((service) => service.enabled);
  return <footer className="site-footer"><div className="site-footer-main"><div className="footer-brand-column"><BrandLink/><p>Ideas, producción y comunicación para que tu marca ocupe su espacio.</p><span className="footer-location"><Globe2 size={15}/>{data.settings.location}</span></div><div className="footer-link-column"><b>Explorar</b><Link to="/">Inicio</Link><Link to="/nosotros">La empresa</Link><Link to="/como-trabajamos">Cómo trabajamos</Link><Link to="/contacto">Contacto</Link></div><div className="footer-link-column"><b>Servicios</b>{services.slice(0, 5).map((service) => <Link key={service.id} to={`/servicios/${service.id}`}>{service.name}</Link>)}<Link to="/servicios">Ver todos</Link></div><div className="footer-contact-column"><b>Hablemos de tu idea</b><p>Cuéntanos qué necesitas y revisaremos contigo el siguiente paso.</p><Link className="footer-contact-link" to="/cotizador">Iniciar una cotización <ArrowUpRight size={15}/></Link><a href={`https://instagram.com/${data.settings.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">Instagram · {data.settings.instagram}<ArrowUpRight size={13}/></a><a href={`https://wa.me/593${data.settings.contactPhone.replace(/^0/, '')}`} target="_blank" rel="noreferrer">WhatsApp · {data.settings.contactPhone}<ArrowUpRight size={13}/></a></div></div><div className="site-footer-bottom"><BrandLink/><span>© {new Date().getFullYear()} Visual Corp · {data.settings.location}</span><Link to="/contacto">Contacto</Link></div></footer>;
}

export function PublicSiteLayout() {
  return <div className="public-site"><SiteHeader/><main className="site-main"><Outlet/></main><SiteFooter/></div>;
}

function Eyebrow({ children, light = false }) { return <span className={`site-eyebrow${light ? ' light' : ''}`}><i/>{children}</span>; }

function SectionTitle({ eyebrow, title, description, light = false }) {
  return <div className={`site-section-title${light ? ' light' : ''}`}><div><Eyebrow light={light}>{eyebrow}</Eyebrow><h2>{title}</h2></div>{description && <p>{description}</p>}</div>;
}

function ServiceCard({ service, index = 0 }) {
  const info = familyInfo(service.id);
  return <Link className="site-service-card" to={`/servicios/${service.id}`}><span className="site-service-index">{info?.mark || String(index + 1).padStart(2, '0')}</span><span className="site-service-icon"><Printer size={20}/></span><h3>{service.name}</h3><p>{service.description}</p><span className="site-card-link">Explorar servicio <ArrowUpRight size={15}/></span></Link>;
}

function ContactLinks() {
  const { data } = useWorkspace();
  return <div className="site-contact-links"><a href={`https://wa.me/593${data.settings.contactPhone.replace(/^0/, '')}`} target="_blank" rel="noreferrer"><MessageCircle size={16}/>WhatsApp · {data.settings.contactPhone}<ArrowUpRight size={13}/></a><a href={`https://instagram.com/${data.settings.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">Instagram · {data.settings.instagram}<ArrowUpRight size={13}/></a></div>;
}

function LeadForm({ variant = 'contact', initialService = '' }) {
  const { data, add } = useWorkspace();
  const [form, setForm] = useState({ name: '', phone: '', company: '', service: initialService, details: '' });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setForm((current) => ({ ...current, service: initialService || current.service })), [initialService]);
  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      if (supabaseConfigured) {
        const { error: requestError } = await supabase.from('public_requests').insert({
          request_type: variant === 'quote' ? 'quote' : 'contact',
          name: form.name.trim(), phone: form.phone.trim(), company: form.company.trim(),
          service: form.service, message: form.details.trim(),
          quote_data: variant === 'quote' ? { details: form.details.trim(), service: form.service } : {},
        });
        if (requestError) throw requestError;
      } else if (import.meta.env.PROD) {
        throw new Error('El formulario todavía no está conectado. Escríbenos por WhatsApp.');
      } else {
        add('leads', { ...form, source: variant === 'quote' ? 'Cotizador público' : 'Sitio web', stage: 'Nuevo', notes: '', campaignId: '' });
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
  return <form className="site-lead-form" onSubmit={submit}>
    <div className="site-form-title"><b>{variant === 'quote' ? 'Detalles del proyecto' : 'Solicitud de contacto'}</b><small>Los campos con * son necesarios.</small></div>
    {sent && <div className="site-success" role="status"><Check size={16}/> Solicitud registrada. Gracias por escribirnos.</div>}
    {error && <div className="site-form-error" role="alert">{error}</div>}
    <div className="site-form-row"><label>Nombre *<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Tu nombre"/></label><label>Teléfono o WhatsApp *<input required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="09…"/></label></div>
    <label>Negocio <span>(opcional)</span><input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} placeholder="Nombre de tu negocio"/></label>
    <label>¿Qué necesitas?<select value={form.service} onChange={(event) => setForm({ ...form, service: event.target.value })}><option value="">Selecciona una familia de trabajo</option>{services.map((service) => <option value={service.name} key={service.id}>{service.name}</option>)}</select></label>
    <label>{variant === 'quote' ? 'Describe tu proyecto *' : 'Cuéntanos un poco más'}<textarea required={variant === 'quote'} rows={variant === 'quote' ? 5 : 3} value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} placeholder={variant === 'quote' ? 'Medidas aproximadas, cantidad, objetivo o referencia' : 'Objetivo, referencia o plazo que tienes en mente'}/></label>
    <button className="site-primary-button form-submit" type="submit" disabled={sending}>{sending ? 'Enviando…' : variant === 'quote' ? 'Enviar solicitud' : 'Enviar a Visual Corp'}<ArrowUpRight size={17}/></button>
    <small className="site-form-note">Usaremos estos datos para responder tu solicitud. No incluyas información sensible.</small>
  </form>;
}

export function PublicHomePage() {
  const { data } = useWorkspace();
  const services = data.services.filter((service) => service.enabled);
  return <><SiteTitle>Inicio</SiteTitle>
    <section className="site-hero"><div className="site-hero-glow glow-pink"/><div className="site-hero-glow glow-blue"/><div className="site-hero-content"><Eyebrow light>{data.settings.heroEyebrow}</Eyebrow><h1>{data.settings.heroTitle}</h1><p>{data.settings.heroText}</p><div className="site-hero-actions"><Link className="site-primary-button" to="/cotizador">Cuéntanos tu idea <ArrowUpRight size={17}/></Link><Link className="site-secondary-button" to="/servicios">Explorar servicios <ArrowRight size={16}/></Link></div><div className="site-hero-proof"><span><Check size={14}/>Atención directa</span><span><Check size={14}/>Ideas y producción</span><span><Check size={14}/>{data.settings.location}</span></div></div><div className="site-hero-art" aria-label="Visual Corp, agencia creativa"><div className="site-art-ring ring-one"/><div className="site-art-ring ring-two"/><div className="site-art-board"><img src="/brand/visualcorp-symbol.png" alt="Símbolo de Visual Corp"/><span>DISEÑO<br/><b>PRODUCCIÓN</b></span><i/><i/><i/></div><div className="site-art-label label-top">IDEAS QUE SE HACEN VISIBLES</div><div className="site-art-label label-bottom"><span/>MILAGRO · ECUADOR</div></div><a className="site-scroll-cue" href="#servicios">Descubre Visual Corp <ArrowDownRight size={15}/></a></section>
    <section className="site-services-section" id="servicios"><SectionTitle eyebrow="SERVICIOS CONECTADOS" title={<>Una idea puede tomar<br/>muchas formas.</>} description="Elige una familia de trabajo para conocerla mejor. Si no sabes por dónde empezar, cuéntanos tu idea y te orientamos."/><div className="site-services-grid">{services.map((service, index) => <ServiceCard service={service} index={index} key={service.id}/>)}</div><Link className="site-text-link" to="/servicios">Ver todas las familias de servicio <ArrowRight size={16}/></Link></section>
    <section className="site-bridge"><div className="bridge-copy"><Eyebrow>DEL CONCEPTO A LA REALIDAD</Eyebrow><h2>Diseño, producción<br/>y una idea en común.</h2><p>Visual Corp es una agencia de publicidad y marketing en Milagro. Conversamos sobre lo que necesitas y te ayudamos a definir un siguiente paso.</p><Link className="site-primary-button" to="/como-trabajamos">Conoce cómo trabajamos <ArrowUpRight size={16}/></Link></div><div className="bridge-steps"><article><b>01</b><div><h3>Cuéntanos</h3><p>Comparte tu idea y el objetivo que buscas.</p></div><ArrowUpRight size={15}/></article><article><b>02</b><div><h3>Lo revisamos</h3><p>Aterrizamos juntos los detalles del proyecto.</p></div><ArrowUpRight size={15}/></article><article><b>03</b><div><h3>Avanzamos</h3><p>Definimos el camino adecuado para tu solicitud.</p></div><ArrowUpRight size={15}/></article></div></section>
    <Callout data={data}/>
  </>;
}

export function ServicesIndexPage() {
  const { data } = useWorkspace();
  const services = data.services.filter((service) => service.enabled);
  return <><SiteTitle>Servicios</SiteTitle><PageHero eyebrow="LO QUE HACEMOS" title={<>Ideas que encuentran<br/>su forma.</>} description="Explora las familias de trabajo de Visual Corp. Cada proyecto empieza con una conversación sobre lo que necesitas."/><section className="site-page-section"><div className="site-services-grid">{services.map((service, index) => <ServiceCard key={service.id} service={service} index={index}/>)}</div></section><Callout data={data}/></>;
}

export function ServiceDetailPage() {
  const { slug } = useParams();
  const { data } = useWorkspace();
  const service = data.services.find((item) => item.id === slug);
  const details = familyInfo(slug);
  if (!service) return <PageNotFound title="Este servicio no está disponible"/>;
  return <><SiteTitle>{service.name}</SiteTitle><PageHero eyebrow={`SERVICIOS · ${details?.mark || ''}`} title={service.name} description={service.description} compact/><section className="site-detail-section"><div className="site-detail-copy"><Eyebrow>UNA RUTA PARA TU PROYECTO</Eyebrow><h2>Empecemos por<br/>lo que necesitas.</h2><p>Cuéntanos el objetivo, la idea o la referencia que tienes. Revisaremos los detalles contigo y confirmaremos el alcance antes de hablar de valores o tiempos.</p><Link className="site-primary-button" to={`/cotizador?servicio=${encodeURIComponent(service.name)}`}>Solicitar una cotización <ArrowUpRight size={16}/></Link></div><div className="site-detail-card"><span className="site-detail-number">{details?.mark || 'VC'}</span><Sparkles size={23}/><h3>{service.name}</h3><p>{service.description}</p><div className="detail-card-divider"/><span>Proyecto a revisar con el equipo</span></div></section><Callout data={data} title="¿No sabes si esta es la familia adecuada?"/></>;
}

export function AboutPage() {
  const { data } = useWorkspace();
  return <><SiteTitle>La empresa</SiteTitle><PageHero eyebrow="VISUAL CORP" title={<>Ideas para marcas<br/>que quieren destacar.</>} description={`Somos una agencia de publicidad y marketing en ${data.settings.location}. Acompañamos ideas desde el diseño hasta soluciones visuales para marcas y espacios.`}/><section className="site-about-section"><div className="about-mark"><img src="/brand/visualcorp-symbol.png" alt="Símbolo Visual Corp"/><span>VISUAL CORP<br/><small>AGENCIA CREATIVA</small></span></div><div><Eyebrow>QUIÉNES SOMOS</Eyebrow><h2>Hacemos visible<br/>lo que imaginas.</h2><p>En Visual Corp creemos que cada negocio tiene una historia que merece verse. Reunimos creatividad, publicidad y producción visual para ayudar a convertir ideas en proyectos concretos.</p><p>Estamos en Milagro, Ecuador. Cuéntanos qué estás pensando y encontraremos un primer paso contigo.</p><Link to="/contacto" className="site-text-link">Conversemos <ArrowRight size={16}/></Link></div></section><Callout data={data}/></>;
}

export function ProcessPage() {
  const { data } = useWorkspace();
  const steps = [{ n: '01', title: 'Nos cuentas la idea', text: 'Comparte el objetivo, el espacio o la necesidad que quieres resolver.' }, { n: '02', title: 'Revisamos los detalles', text: 'Conversamos sobre referencias, medidas, cantidades y el alcance del proyecto.' }, { n: '03', title: 'Definimos el siguiente paso', text: 'Te orientamos sobre cómo avanzar. Valores, disponibilidad y tiempos se confirman según cada solicitud.' }];
  return <><SiteTitle>Cómo trabajamos</SiteTitle><PageHero eyebrow="UN CAMINO CLARO" title={<>De la primera idea<br/>al siguiente paso.</>} description="Una conversación sencilla nos ayuda a entender lo que buscas y revisar cómo podemos ayudarte."/><section className="site-process-section"><div className="process-intro"><Eyebrow>ASÍ EMPEZAMOS</Eyebrow><h2>Primero entendemos<br/>el proyecto.</h2><p>No necesitas tener todas las respuestas listas. Cuéntanos lo que tienes en mente y completamos la información contigo.</p><Link className="site-primary-button" to="/contacto">Iniciar una conversación <ArrowUpRight size={16}/></Link></div><div className="process-list">{steps.map((step) => <article key={step.n}><b>{step.n}</b><div><h3>{step.title}</h3><p>{step.text}</p></div></article>)}</div></section><section className="site-process-location"><Globe2 size={18}/><span><b>{data.settings.location}</b><small>Agencia de publicidad y marketing</small></span><Link to="/contacto">Contactar <ArrowUpRight size={14}/></Link></section></>;
}

export function ContactPage() {
  const { data } = useWorkspace();
  return <><SiteTitle>Contacto</SiteTitle><PageHero eyebrow="HABLEMOS" title={<>Tu próxima idea<br/>empieza aquí.</>} description="Cuéntanos qué quieres lograr. Revisaremos tu solicitud y podremos completar los detalles contigo."/><section className="site-contact-page"><div className="site-contact-intro"><Eyebrow>CONTACTO DIRECTO</Eyebrow><h2>Estamos en<br/><em>{data.settings.location}.</em></h2><p>Elige cómo prefieres iniciar la conversación o déjanos tus datos en el formulario.</p><ContactLinks/><div className="site-contact-hours"><span className="contact-pin"><Globe2 size={18}/></span><span><b>{data.settings.name}</b><small>Agencia de publicidad y marketing</small></span></div></div><LeadForm/></section></>;
}

export function PublicQuotePage() {
  const [searchParams] = useSearchParams();
  const service = searchParams.get('servicio') || '';
  return <><SiteTitle>Solicitar cotización</SiteTitle><PageHero eyebrow="COTIZA TU PROYECTO" title={<>Cuéntanos lo que<br/>quieres hacer.</>} description="Describe tu idea y el equipo podrá revisar los detalles contigo. Tarifas, disponibilidad y condiciones se confirman según el proyecto."/><section className="site-quote-page"><LeadForm variant="quote" initialService={service}/><aside className="site-quote-aside"><span className="site-aside-icon"><Check size={20}/></span><Eyebrow>UNA BUENA COTIZACIÓN</Eyebrow><h2>Empieza con<br/>los detalles.</h2><p>Si ya los tienes, incluye medidas aproximadas, cantidades y una referencia. El equipo te ayudará a completar lo que haga falta.</p><ul><li><Check size={15}/>No mostramos tarifas sin validar</li><li><Check size={15}/>Revisamos cada solicitud</li><li><Check size={15}/>Tu mensaje llega al CRM local</li></ul></aside></section></>;
}

function PageHero({ eyebrow, title, description, compact = false }) {
  return <section className={`site-page-hero${compact ? ' compact' : ''}`}><div className="site-hero-glow glow-pink"/><div className="site-page-hero-inner"><Eyebrow light>{eyebrow}</Eyebrow><h1>{title}</h1><p>{description}</p><div className="site-page-hero-actions"><Link className="site-primary-button" to="/cotizador">Solicitar cotización <ArrowUpRight size={16}/></Link><Link className="site-secondary-button" to="/servicios">Ver servicios <ArrowRight size={16}/></Link></div></div></section>;
}

function Callout({ data, title = '¿Tienes una idea en mente?' }) {
  return <section className="site-callout"><div><Eyebrow light>HABLEMOS DE TU PROYECTO</Eyebrow><h2>{title}</h2><p>Comparte lo que buscas. Revisaremos contigo el siguiente paso.</p></div><Link className="site-primary-button" to="/contacto">Contactar a Visual Corp <ArrowUpRight size={16}/></Link></section>;
}

function PageNotFound({ title }) { return <section className="site-not-found"><Eyebrow>VISUAL CORP</Eyebrow><h1>{title}</h1><p>Revisa la lista de servicios o vuelve al inicio.</p><Link to="/servicios" className="site-primary-button">Ver servicios <ArrowRight size={16}/></Link></section>; }
