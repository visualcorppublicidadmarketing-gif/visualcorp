import { lazy, Suspense, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView, useReducedMotion, useSpring } from 'motion/react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Lightbulb, MapPin, MessageCircle, PanelsTopLeft, Printer, ScanLine, Scissors, Shirt, Sparkles, Store } from 'lucide-react';
import { useWorkspace } from '../app/workspace';
import { Marquee, SpotlightLayer, clearSpotlight, updateSpotlight } from '../components/ui/MagicComponents';
import './home-page.css';

const Highlights = lazy(() => import('./ShowcasePages').then((module) => ({ default: module.HomeContentHighlights })));
const serviceIcons = { impresion: Printer, 'gran-formato': PanelsTopLeft, rotulos: Store, textil: Shirt, corte: Scissors, eventos: ScanLine };
const process = [
  { title: 'Una idea, una conversación.', short: 'Nos cuentas', text: 'Cuéntanos qué quieres comunicar, para quién y dónde se verá. Una referencia o un boceto son un buen comienzo.', detail: 'Tu objetivo · Tu idea · Tus referencias', Icon: MessageCircle },
  { title: 'Le damos forma contigo.', short: 'Lo definimos', text: 'Revisamos las medidas, las cantidades y las posibilidades del proyecto. Te orientamos para definir los detalles antes de avanzar.', detail: 'Formato · Materiales · Cantidades', Icon: Lightbulb },
  { title: 'Un siguiente paso claro.', short: 'Lo coordinamos', text: 'Confirmamos contigo el alcance, los valores y los tiempos de tu solicitud. Así puedes decidir cómo continuar con tu proyecto.', detail: 'Alcance · Cotización · Coordinación', Icon: Check },
];

const homeCatalogCategories = [
  { name: 'Imprenta', eyebrow: 'PAPEL Y PRESENTACIÓN', text: 'Folletos, tarjetas y piezas impresas para compartir tu mensaje.', imageClass: 'home-category-art-print' },
  { name: 'Gran formato', eyebrow: 'ESPACIOS Y FORMATOS AMPLIOS', text: 'Explora opciones visuales para comunicar en espacios y puntos de atención.', imageClass: 'home-category-art-format' },
  { name: 'Promocionales', eyebrow: 'OBJETOS DE MARCA', text: 'Artículos que pueden acompañar tu marca, campaña o evento.', imageClass: 'home-category-art-promo' },
  { name: 'Textil', eyebrow: 'PRENDAS Y ACCESORIOS', text: 'Opciones textiles para equipos, actividades y presencia de marca.', imageClass: 'home-category-art-textile' },
];

function HomeCatalogExplore() {
  return <section className="home-catalog home-section" aria-labelledby="home-catalog-title">
    <Reveal className="home-section-heading home-catalog-heading"><div><span className="home-kicker">IDEAS DEL CATÁLOGO</span><h2 id="home-catalog-title">Empieza por<br/><span>lo que necesitas.</span></h2></div><div className="home-catalog-guide"><img src="/public-site/visualito-catalog-guide.webp" alt="" aria-hidden="true" width={1024} height={1536} loading="lazy" decoding="async"/><div><span>VISUALITO TE ACOMPAÑA</span><p>Explora estas familias y continúa en la tienda para revisar las opciones publicadas.</p></div></div></Reveal>
    <div className="home-catalog-grid">{homeCatalogCategories.map((item, index) => <Reveal key={item.name} delay={index * 0.05}><Link className="home-catalog-card" to={`/tienda?familia=${encodeURIComponent(item.name)}#catalogo-productos`}>
      <span className={`home-catalog-art ${item.imageClass}`} aria-hidden="true"/><span className="home-catalog-card-copy"><span>{item.eyebrow}</span><b>{item.name}</b><small>{item.text}</small></span><span className="home-catalog-arrow"><ArrowUpRight size={19}/></span>
    </Link></Reveal>)}</div>
    <p className="home-catalog-note">Imágenes ilustrativas de categorías. La tienda muestra las fichas publicadas y los detalles se revisan al cotizar.</p>
  </section>;
}

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion();
  return <motion.div className={className} initial={reduceMotion ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.12 }} transition={{ duration: reduceMotion ? 0 : 0.65, delay: reduceMotion ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}

function VisualitoStage() {
  const reduceMotion = useReducedMotion();
  const rotateX = useSpring(0, { stiffness: 110, damping: 25 });
  const rotateY = useSpring(0, { stiffness: 110, damping: 25 });
  const reset = () => { rotateX.set(0); rotateY.set(0); };
  useEffect(() => { if (reduceMotion) { rotateX.jump(0); rotateY.jump(0); } }, [reduceMotion, rotateX, rotateY]);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    rotateX.set((0.5 - (event.clientY - bounds.top) / bounds.height) * 5);
    rotateY.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 7);
  };
  return <div className="home-stage" onPointerMove={move} onPointerLeave={reset} onPointerCancel={reset}>
    <div className="home-stage-glow" aria-hidden="true"/>
    <motion.div className="home-stage-scene" style={{ rotateX, rotateY }}>
      <div className="home-stage-ring" aria-hidden="true"/>
      <span className="home-stage-word" aria-hidden="true">CREA.</span>
      <div className="home-stage-floor" aria-hidden="true"/>
      <motion.img className="home-visualito" src="/public-site/visualito-hero.webp" alt="Visualito, la mascota de Visual Corp" width={720} height={1080} fetchPriority="high" initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: reduceMotion ? 0 : 0.95, ease: [0.22, 1, 0.36, 1] }}/>
      <span className="home-stage-note"><Sparkles size={17} aria-hidden="true"/>Tu idea empieza aquí.</span>
      <span className="home-stage-label"><span className="home-color-dots" aria-hidden="true"><i/><i/><i/></span>CREATIVIDAD CON PROPÓSITO</span>
    </motion.div>
    <div className="home-stage-caption"><span>VISUALITO / VISUAL CORP</span><span>DISEÑO + PRODUCCIÓN <ArrowUpRight size={13}/></span></div>
  </div>;
}

function ProcessSection() {
  const [active, setActive] = useState(0);
  const reduceMotion = useReducedMotion();
  const { title, text, detail, Icon } = process[active];
  return <section className="home-process home-section" aria-labelledby="home-process-title">
    <Reveal className="home-section-heading"><div><span className="home-kicker">02 / CÓMO TRABAJAMOS</span><h2 id="home-process-title">Una buena idea.<br/><span>Un camino claro.</span></h2></div><p>No necesitas llegar con todo resuelto. Empezamos por escucharte.</p></Reveal>
    <div className="home-process-grid">
      <div className="home-process-options" aria-label="Explora nuestro proceso">{process.map((step, index) => <button key={step.short} type="button" className={active === index ? 'is-active' : ''} aria-pressed={active === index} aria-controls="home-process-detail" onClick={() => setActive(index)}><span>0{index + 1}</span><b>{step.short}</b><ArrowUpRight size={21} aria-hidden="true"/></button>)}<Link className="home-text-link" to="/como-trabajamos">Conoce nuestro proceso <ArrowRight size={17}/></Link></div>
      <div className="home-process-panel" id="home-process-detail" aria-live="polite" aria-atomic="true"><motion.div key={active} initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.3 }}><div className="home-process-panel-top"><span className="home-process-icon"><Icon size={32} strokeWidth={1.4} aria-hidden="true"/></span><span className="home-process-number" aria-hidden="true">0{active + 1}</span></div><h3>{title}</h3><p>{text}</p><div className="home-process-detail">{detail}</div></motion.div></div>
    </div>
  </section>;
}

export function PublicHomePage() {
  const { data } = useWorkspace();
  const services = data.services.filter((service: { enabled: boolean }) => service.enabled);
  const contentRef = useRef<HTMLDivElement>(null);
  const showContent = useInView(contentRef, { once: true, margin: '300px' });
  const title = String(data.settings.heroTitle || 'Hacemos visible lo que imaginas.').trim();
  const words = title.split(/\s+/);
  const lastWord = words.pop();
  useEffect(() => { document.title = 'Inicio · Visual Corp'; }, []);
  return <div className="vc-home">
    <section className="home-hero" aria-labelledby="home-title">
      <div className="home-hero-inner">
        <div className="home-hero-copy">
          <Reveal><span className="home-kicker"><span className="home-status-dot"/>{data.settings.heroEyebrow}</span></Reveal>
          <Reveal delay={0.08}><h1 id="home-title">{words.join(' ')} <span>{lastWord}</span></h1></Reveal>
          <Reveal delay={0.16}><p className="home-hero-description">{data.settings.heroText}</p><div className="home-actions"><Link className="home-button home-button-primary vc-shimmer-button" to="/cotizador">Cuéntanos tu idea <ArrowUpRight size={19}/></Link><a className="home-button home-button-secondary" href="#servicios">Explorar servicios <ArrowDown size={18}/></a></div></Reveal>
          <Reveal delay={0.24}><div className="home-hero-proof"><span><Check size={15}/>Atención directa</span><span><Check size={15}/>Diseño y producción</span></div></Reveal>
        </div>
        <VisualitoStage/>
      </div>
      <div className="home-hero-footer"><span><MapPin size={14}/> MILAGRO, ECUADOR</span><a href="#servicios">UNA IDEA. MUCHAS POSIBILIDADES. <ArrowDown size={15}/></a><span className="home-footer-index" aria-hidden="true">01 — 03</span></div>
    </section>

    {services.length > 0 && <Marquee items={services.map((service: { name: string }) => service.name)} label="Familias de trabajo disponibles" className="home-service-marquee" duration={38}/>}

    <section className="home-services home-section" id="servicios" aria-labelledby="home-services-title">
      <Reveal className="home-section-heading"><div><span className="home-kicker">01 / LO QUE PODEMOS CREAR</span><h2 id="home-services-title">Tu marca.<br/><span>En todas sus formas.</span></h2></div><div><p>Del papel a los espacios. Encuentra la familia de trabajo que conecta con tu idea.</p><Link className="home-text-link" to="/servicios">Todos los servicios <ArrowUpRight size={17}/></Link></div></Reveal>
      <div className={`home-services-grid${services.length === 6 ? ' is-bento' : ''}`}>{services.map((service: { id: string; name: string; description: string }, index: number) => {
        const Icon = serviceIcons[service.id] || Sparkles;
        return <Reveal key={service.id} className={services.length === 6 && (index === 0 || index === 5) ? 'home-service-featured' : ''} delay={(index % 3) * 0.06}><Link to={`/servicios/${encodeURIComponent(service.id)}`} className={`home-service home-service-${service.id} vc-magic-card`} onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight}><SpotlightLayer/><div className="home-service-top"><span className="home-service-number">{String(index + 1).padStart(2, '0')}</span><span className="home-service-arrow"><ArrowUpRight size={21}/></span></div><div className="home-service-art" aria-hidden="true"><i/><Icon size={66} strokeWidth={1.1}/><span/></div><div className="home-service-copy"><h3>{service.name}</h3><p>{service.description}</p></div><span className="home-service-link">Explorar posibilidades <ArrowRight size={16}/></span></Link></Reveal>;
      })}</div>
      {services.length === 0 && <p className="home-service-empty">Estamos actualizando nuestros servicios. <Link to="/contacto">Cuéntanos qué necesitas.</Link></p>}
      <div className="home-services-note"><span><Sparkles size={17}/> ¿Tienes una idea diferente?</span><Link to="/contacto">La conversamos contigo <ArrowUpRight size={17}/></Link></div>
    </section>

    <HomeCatalogExplore/>

    <ProcessSection/>

    <Reveal className="home-discover"><div><span className="home-kicker">SIGUE EXPLORANDO</span><h2>Encuentra tu<br/>próxima idea.</h2></div><Link to="/tienda"><span className="home-discover-icon"><Store size={25}/></span><div><h3>Explora la tienda</h3><p>Descubre productos y arma tu lista para cotizar.</p></div><ArrowUpRight size={24}/></Link><Link to="/portafolio"><span className="home-discover-icon"><PanelsTopLeft size={25}/></span><div><h3>Conoce nuestro trabajo</h3><p>Visita el portafolio de Visual Corp.</p></div><ArrowUpRight size={24}/></Link></Reveal>

    <div ref={contentRef} className="home-published-content">{showContent && <Suspense fallback={null}><Highlights/></Suspense>}</div>

    <section className="home-contact home-section" aria-labelledby="home-contact-title"><Reveal><span className="home-kicker">03 / HAGAMOS QUE SUCEDA</span><h2 id="home-contact-title">Lo próximo que se vea<br/>puede ser <span>tu marca.</span></h2><p>Una idea, una pregunta o un proyecto por empezar.<br/>Estamos aquí para escucharte.</p><div className="home-actions"><Link className="home-button home-button-primary vc-shimmer-button" to="/cotizador">Empezar mi proyecto <ArrowUpRight size={20}/></Link><Link className="home-button home-button-secondary" to="/contacto">Hablar con el equipo <MessageCircle size={18}/></Link></div><span className="home-contact-signature">VISUAL CORP · CREATIVIDAD QUE TOMA FORMA</span></Reveal></section>
  </div>;
}
