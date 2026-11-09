import { useState, type ReactNode, type Ref } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, FilePenLine, MapPin, MessageCircle } from 'lucide-react';
import { companyProcessSteps, studioSpecialties } from './company-hero-content';
import './company-heroes.css';

type HeroShellProps = {
  variant: 'studio' | 'process' | 'contact';
  page: string;
  lines: string[];
  description: string;
  actions: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  sectionRef?: Ref<HTMLElement>;
};

function HeroShell({ variant, page, lines, description, actions, children, footer, sectionRef }: HeroShellProps) {
  const titleId = `company-${variant}-title`;
  return (
    <section ref={sectionRef} className={`company-hero company-hero--${variant}`} aria-labelledby={titleId}>
      <div className="company-hero-inner">
        <div className="company-hero-topline">
          <nav aria-label="Ruta de la página"><Link to="/">Inicio</Link><span aria-hidden="true">/</span><span aria-current="page">{page}</span></nav>
          <span className="company-studio-label">Visual Corp <i aria-hidden="true"/> Agencia creativa</span>
        </div>
        <div className="company-hero-grid">
          <div className="company-hero-copy">
            <h1 id={titleId} className="company-hero-title">{lines.map((line) => <span className="company-title-line" key={line}><span>{line}</span>{' '}</span>)}</h1>
            <p className="company-hero-description">{description}</p>
            <div className="company-hero-actions">{actions}</div>
          </div>
          <div className="company-hero-stage">{children}</div>
        </div>
        <div className="company-hero-footline">{footer}</div>
      </div>
    </section>
  );
}

function PrintMarks() {
  return <div className="company-print-marks" aria-hidden="true"><i/><i/><i/><i/><span><b/><b/><b/><b/></span></div>;
}

export function AboutHero({ location }: { location: string }) {
  const [active, setActive] = useState(0);
  const specialty = studioSpecialties[active];
  return (
    <HeroShell variant="studio" page="La empresa" lines={['Ideas que', 'se convierten', 'en presencia.']}
      description="Somos Visual Corp. Reunimos diseño, publicidad y producción visual para dar forma a lo que tu marca quiere comunicar."
      actions={<><Link className="company-action company-action--primary" to="/contacto">Conversemos <ArrowUpRight size={18} aria-hidden="true"/></Link><Link className="company-action company-action--secondary" to="/soluciones">Explorar soluciones <ArrowRight size={17} aria-hidden="true"/></Link></>}
      footer={<><span className="company-place"><MapPin size={14} aria-hidden="true"/>{location}</span><a className="company-scroll-link" href="#el-estudio">Conoce el estudio <ArrowDownRight size={16} aria-hidden="true"/></a></>}>
      <div className="company-studio-art">
        <PrintMarks/>
        <div className="company-paper-back company-paper-back--cyan" aria-hidden="true"/>
        <div className="company-paper-back company-paper-back--yellow" aria-hidden="true"/>
        <div className="company-poster" data-specialty={active} aria-hidden="true">
          <div className="company-poster-top"><span>Visual Corp<br/>Estudio creativo</span><img src="/brand/visualcorp-symbol.png" alt="" width="74" height="74"/></div>
          <div className="company-poster-title" key={specialty.name}>{specialty.lines.map((line) => <span key={line}>{line}</span>)}</div>
          <div className="company-poster-bottom"><span>{specialty.name}</span><ArrowUpRight size={25}/></div>
        </div>
      </div>
      <div className="company-specialty-picker" role="group" aria-label="Explorar especialidades del estudio">
        {studioSpecialties.map((item, index) => <button type="button" key={item.name} aria-pressed={index === active} aria-controls="company-specialty-description" onClick={() => setActive(index)}>{item.name}<span aria-hidden="true"/></button>)}
      </div>
      <div className="company-specialty-description" id="company-specialty-description" aria-live="polite" aria-atomic="true"><b>{specialty.detail}</b><span>{specialty.description}</span></div>
    </HeroShell>
  );
}

export function ProcessHero() {
  const [active, setActive] = useState(0);
  const reduceMotion = useReducedMotion();
  const step = companyProcessSteps[active];
  return (
    <HeroShell variant="process" page="Cómo trabajamos" lines={['Tu idea.', 'Un camino', 'más claro.']}
      description="No necesitas llegar con todo resuelto. Empezamos por escucharte, revisamos los detalles y encontramos contigo el siguiente paso."
      actions={<><Link className="company-action company-action--primary" to="/contacto">Cuéntanos tu idea <ArrowUpRight size={18} aria-hidden="true"/></Link><a className="company-action company-action--secondary" href="#como-empezamos">Conoce el proceso <ArrowDownRight size={17} aria-hidden="true"/></a></>}
      footer={<><span>Una conversación es un buen comienzo.</span><a className="company-scroll-link" href="#como-empezamos">Así empezamos <ArrowDownRight size={16} aria-hidden="true"/></a></>}>
      <div className="company-process-board">
        <div className="company-board-heading"><span>De la idea al siguiente paso</span><span className="company-board-dots" aria-hidden="true"><i/><i/><i/></span></div>
        <div className="company-process-preview" id="company-process-preview" aria-live="polite" aria-atomic="true">
          <motion.div key={step.n} initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.24 }}>
            <div className="company-process-number" aria-hidden="true">{step.n}<span>/ 03</span></div>
            <span className="company-step-kicker">Paso {step.n}</span><h2>{step.title}</h2><p>{step.text}</p>
            <a href={`#proceso-${step.n}`} className="company-step-detail">Ver este paso <ArrowDownRight size={16} aria-hidden="true"/></a>
          </motion.div>
        </div>
        <div className="company-process-selector" role="group" aria-label="Explorar los tres pasos para empezar">
          {companyProcessSteps.map((item, index) => <button type="button" key={item.n} aria-pressed={index === active} aria-controls="company-process-preview" onClick={() => setActive(index)}><span>{item.n}</span><b>{item.label}</b><ArrowUpRight size={15} aria-hidden="true"/></button>)}
        </div>
      </div>
    </HeroShell>
  );
}

export function ContactHero({ sectionRef, whatsapp, address }: { sectionRef: Ref<HTMLElement>; whatsapp: string; address: string }) {
  return (
    <HeroShell variant="contact" page="Contacto" sectionRef={sectionRef} lines={['Hagamos', 'visible tu', 'próxima idea.']}
      description="Una idea, una referencia o una pregunta. Cuéntanos qué tienes en mente y encontremos un primer paso para tu proyecto."
      actions={<><a className="company-action company-action--primary" href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true"/> Hablar por WhatsApp <ArrowUpRight size={17} aria-hidden="true"/></a><a className="company-action company-action--secondary" href="#contacto-formulario">Escribir mi solicitud <ArrowDownRight size={17} aria-hidden="true"/></a></>}
      footer={<><a className="company-place" href="#contacto-ubicacion"><MapPin size={14} aria-hidden="true"/>{address}</a><a className="company-scroll-link" href="#contacto-opciones">Todas las opciones <ArrowDownRight size={16} aria-hidden="true"/></a></>}>
      <div className="company-contact-art">
        <PrintMarks/>
        <div className="company-conversation-sheet" aria-hidden="true"><div className="company-letter-head"><img src="/brand/visualcorp-symbol.png" width="48" height="48" alt=""/><span>El inicio de<br/>algo visible.</span></div><span className="company-hello">Hola,<br/>Visual Corp<span className="company-hello-dot">.</span></span><div className="company-letter-rule"/><span className="company-letter-note">Tu idea es nuestro<br/>punto de partida.</span><span className="company-letter-sticker">Hablemos<ArrowUpRight size={19}/></span></div>
        <nav className="company-contact-routes" aria-label="Cómo quieres empezar">
          <a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={19} aria-hidden="true"/><span><b>Una conversación</b><small>Abrir WhatsApp</small></span><ArrowUpRight size={17} aria-hidden="true"/></a>
          <a href="#contacto-formulario"><FilePenLine size={19} aria-hidden="true"/><span><b>Los detalles de tu idea</b><small>Ir al formulario</small></span><ArrowDownRight size={17} aria-hidden="true"/></a>
          <a href="#contacto-ubicacion"><MapPin size={19} aria-hidden="true"/><span><b>Una visita al estudio</b><small>Ver ubicación en Milagro</small></span><ArrowDownRight size={17} aria-hidden="true"/></a>
        </nav>
      </div>
    </HeroShell>
  );
}
