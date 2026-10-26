import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, BookOpen, CheckCircle2, ChevronRight, Clock3, Download, FileText, GraduationCap, Hammer, HardHat, Palette, Printer, Search, ShieldCheck, Sparkles, SwatchBook, Wrench, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import { AppFrame, PageHeading } from '../../app/layout';
import './manual-learning.css';

type LearningItem = { id: string; title: string; subtitle: string; group: string; kind: 'guide' | 'tool'; file: string; icon: React.ElementType; time?: string; keywords: string };

const guides: LearningItem[] = [
  { id: 'induccion', title: 'Inducción Visual Corp', subtitle: 'Primeros pasos, convivencia, espacios y responsabilidades compartidas.', group: 'Inicio', kind: 'guide', file: 'induccion.html', icon: GraduationCap, time: '6 min', keywords: 'bienvenida equipo convivencia instalaciones horarios' },
  { id: 'seguridad', title: 'Seguridad industrial', subtitle: 'EPP, químicos, riesgos eléctricos y protocolos de emergencia.', group: 'Seguridad', kind: 'guide', file: 'seguridad.html', icon: ShieldCheck, time: '8 min', keywords: 'emergencia taller epp incendio laser solvente' },
  { id: 'fundamentos', title: 'Fundamentos gráficos', subtitle: 'Color, composición, tipografía, formatos, resolución y preparación para impresión.', group: 'Diseño y producción', kind: 'guide', file: 'fundamentos.html', icon: Palette, time: '12 min', keywords: 'rgb cmyk dpi sangria archivos materiales impresion' },
  { id: 'asesores', title: 'Manual de asesores', subtitle: 'Atención, cotización, registro de ventas y seguimiento de trabajos.', group: 'Ventas y atención', kind: 'guide', file: 'asesores.html', icon: BookOpen, time: '10 min', keywords: 'asesor cliente precios ventas excel pedidos cotizar horarios' },
  { id: 'disenadores', title: 'Manual de diseñadores', subtitle: 'Archivos, nomenclatura, artes finales y preparación para máquinas.', group: 'Diseño y producción', kind: 'guide', file: 'disenadores.html', icon: Palette, time: '10 min', keywords: 'illustrator photoshop archivos vectorial cuchilla laser impresion' },
  { id: 'impresores', title: 'Manual de impresores', subtitle: 'Preparación de equipos, materiales, impresión, acabados y control de calidad.', group: 'Diseño y producción', kind: 'guide', file: 'impresores.html', icon: Printer, time: '10 min', keywords: 'plotter tinta vinil lona mantenimiento cabezal impresion' },
  { id: 'laser', title: 'Corte láser CO₂', subtitle: 'Galaxy 60W, RDWorks, capas de color, foco, parámetros y mantenimiento.', group: 'Diseño y producción', kind: 'guide', file: 'corte-laser.html', icon: Wrench, time: '12 min', keywords: 'laser galaxy rdworks acrilico mdf potencia velocidad seguridad' },
  { id: 'taller', title: 'Taller y acabados', subtitle: 'Preparación e instalación, herramientas, trato al cliente y acabados.', group: 'Diseño y producción', kind: 'guide', file: 'taller.html', icon: Hammer, time: '10 min', keywords: 'taller instalacion corpóreas rotulos herramientas calidad' },
  { id: 'marketing', title: 'Manual de marketing', subtitle: 'Contenido, fotografía, identidad visual, respuesta digital y métricas.', group: 'Marketing', kind: 'guide', file: 'marketing.html', icon: Sparkles, time: '8 min', keywords: 'redes sociales facebook instagram tiktok marketing fotos identidad' },
];
const tools: LearningItem[] = [
  { id: 'calculadora', title: 'Calculadora de áreas', subtitle: 'Calcula área total y estima costos base por material.', group: 'Calculadoras', kind: 'tool', file: 'app-calculadora.html', icon: Wrench, keywords: 'metros cuadrados lona vinil costo precio impresión' },
  { id: 'distancia', title: 'Distancia visual', subtitle: 'Explora la legibilidad de letras según tamaño y distancia.', group: 'Calculadoras', kind: 'tool', file: 'app-distancia.html', icon: Search, keywords: 'letras letrero lectura distancia visual' },
  { id: 'pantone', title: 'Catálogo Pantone', subtitle: 'Busca muestras y copia códigos HEX de referencia.', group: 'Color', kind: 'tool', file: 'app-pantone.html', icon: SwatchBook, keywords: 'pantone colores hex solid coated' },
  { id: 'colormatch', title: 'Color Match', subtitle: 'Practica reconocer valores HEX en rondas rápidas.', group: 'Color', kind: 'tool', file: 'app-colormatch.html', icon: Palette, keywords: 'color juego hex diseñador impresor' },
  { id: 'quiz', title: 'Trivia Visual Corp', subtitle: 'Comprueba conocimientos de impresión, materiales, láser y ventas.', group: 'Práctica', kind: 'tool', file: 'app-quiz.html', icon: GraduationCap, keywords: 'quiz trivia preguntas impresión ventas láser' },
  { id: 'checklist', title: 'Checklist preimpresión', subtitle: 'Sigue listas de preparación según el proceso y el rol.', group: 'Práctica', kind: 'tool', file: 'app-checklist.html', icon: CheckCircle2, keywords: 'preimpresión checklist lista tareas proceso' },
];
const allItems = [...guides, ...tools];
const groups = ['Todo', 'Inicio', 'Seguridad', 'Ventas y atención', 'Diseño y producción', 'Marketing', 'Calculadoras', 'Color', 'Práctica'];
const sourceRoot = '/manual-aprendizaje/fuente/';

export function ManualLearningPage({ area = 'operations' }: { area?: 'operations' | 'admin' }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('Todo');
  const [active, setActive] = useState<LearningItem | null>(null);
  const reduceMotion = useReducedMotion();
  const filtered = useMemo(() => allItems.filter((item) => {
    const matchesGroup = group === 'Todo' || item.group === group;
    const term = query.trim().toLocaleLowerCase('es');
    const matchesSearch = !term || `${item.title} ${item.subtitle} ${item.group} ${item.keywords}`.toLocaleLowerCase('es').includes(term);
    return matchesGroup && matchesSearch;
  }), [group, query]);
  const docs = filtered.filter((item) => item.kind === 'guide');
  const apps = filtered.filter((item) => item.kind === 'tool');
  const openItem = (item: LearningItem) => { setActive(item); window.scrollTo({ top: 0, behavior: reduceMotion ? 'instant' : 'smooth' }); };

  return <AppFrame area={area}>
    <div className="manual-learning">
      <PageHeading eyebrow="CENTRO DE APRENDIZAJE · USO INTERNO" title="Manual / aprendizaje" description="Guías por área y herramientas prácticas del equipo, reunidas en un solo espacio." action={<a className="button button-outline" href={`${sourceRoot}PDF/Vacacional Folleto.pdf`} target="_blank" rel="noreferrer"><Download size={16}/> Folleto PDF</a>}/>
      {active ? <motion.section className="ml-reader panel" key={active.id} initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .24 }}>
        <div className="ml-reader-top"><button className="button button-outline" onClick={() => setActive(null)}><ArrowLeft size={15}/> Biblioteca</button><div className="ml-reader-title"><span>{active.kind === 'guide' ? 'GUÍA DE APRENDIZAJE' : 'HERRAMIENTA INTERACTIVA'}</span><b>{active.title}</b></div><a className="ml-open-source" href={`${sourceRoot}${active.file}`} target="_blank" rel="noreferrer" aria-label={`Abrir ${active.title} en una pestaña nueva`}>Abrir aparte <ArrowUpRight size={15}/></a></div>
        <iframe className="ml-iframe" src={`${sourceRoot}${active.file}`} title={active.title} loading="lazy" allow="clipboard-write"/>
      </motion.section> : <>
        <section className="ml-hero">
          <div className="ml-hero-copy"><span className="ml-kicker mltw:inline-flex mltw:items-center mltw:gap-2 mltw:font-bold"><Sparkles size={14}/> APRENDE · PRACTICA · APLICA</span><h2>Todo lo que el equipo<br/><em>necesita para crecer.</em></h2><p>Encuentra una guía por tu área o abre una práctica para llevar lo aprendido a la jornada.</p><div className="ml-hero-links"><button className="ml-primary mltw:focus-visible:outline mltw:focus-visible:outline-2 mltw:focus-visible:outline-offset-2 mltw:focus-visible:outline-purple-700" onClick={() => document.getElementById('ml-library')?.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth' })}>Explorar biblioteca <ChevronRight size={17}/></button><span><BookOpen size={15}/> {guides.length} guías <i/> {tools.length} prácticas</span></div></div>
          <div className="ml-hero-art" aria-hidden="true"><div className="ml-orbit ml-orbit-one"/><div className="ml-orbit ml-orbit-two"/><div className="ml-core"><GraduationCap size={42}/></div><div className="ml-float ml-float-a"><ShieldCheck size={19}/></div><div className="ml-float ml-float-b"><Palette size={19}/></div><div className="ml-float ml-float-c"><Wrench size={19}/></div><span className="ml-spark ml-spark-a">✳</span><span className="ml-spark ml-spark-b">✦</span></div>
        </section>
        <section className="ml-stat-row" aria-label="Resumen de la biblioteca"><div><b>01</b><span>Una bienvenida común</span></div><div><b>02</b><span>Guías según cada área</span></div><div><b>03</b><span>Práctica con herramientas</span></div></section>
        <section className="ml-library" id="ml-library">
          <div className="ml-library-heading"><div><span className="ml-section-kicker">BIBLIOTECA INTERNA</span><h2>¿Qué quieres aprender?</h2><p>Busca por tema o filtra por área.</p></div><label className="ml-search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar seguridad, impresión, ventas…" aria-label="Buscar guías y herramientas"/>{query && <button aria-label="Limpiar búsqueda" onClick={() => setQuery('')}><X size={15}/></button>}</label></div>
          <div className="ml-filters" role="group" aria-label="Filtrar por área">{groups.map((name) => <button key={name} className={group === name ? 'is-selected' : ''} onClick={() => setGroup(name)} aria-pressed={group === name}>{name}</button>)}</div>
          {docs.length > 0 && <><div className="ml-list-heading"><h3>Guías del equipo</h3><span>{docs.length} recursos</span></div><div className="ml-grid">{docs.map((item, index) => <LearningCard key={item.id} item={item} index={index} reduceMotion={reduceMotion} onOpen={openItem}/>)}</div></>}
          {apps.length > 0 && <><div className="ml-list-heading ml-tools-heading"><h3>Practica y aplica</h3><span>{apps.length} herramientas</span></div><div className="ml-grid ml-tool-grid">{apps.map((item, index) => <LearningCard key={item.id} item={item} index={index} reduceMotion={reduceMotion} onOpen={openItem}/>)}</div></>}
          {!filtered.length && <div className="ml-empty"><Search size={20}/><b>No encontramos ese tema.</b><span>Prueba otra palabra o elige “Todo”.</span></div>}
        </section>
        <section className="ml-safety-note"><span><HardHat size={20}/></span><div><b>Guías de consulta y aprendizaje</b><p>Las instrucciones de seguridad del manual sirven como referencia. Ante una duda en el taller, detén el trabajo y consulta a la persona responsable antes de operar equipos.</p></div></section>
        <footer className="ml-source-note"><FileText size={14}/> Contenido migrado del manual interno local · Material sujeto a revisión del equipo.</footer>
      </>}
    </div>
  </AppFrame>;
}

function LearningCard({ item, index, reduceMotion, onOpen }: { item: LearningItem; index: number; reduceMotion: boolean; onOpen: (item: LearningItem) => void }) {
  const Icon = item.icon;
  return <motion.button className={`ml-card ${item.kind === 'tool' ? 'ml-card-tool' : ''}`} onClick={() => onOpen(item)} initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : Math.min(index * .035, .2), duration: reduceMotion ? 0 : .25 }} whileHover={reduceMotion ? undefined : { y: -3 }}>
    <span className="ml-card-icon"><Icon size={19}/></span><span className="ml-card-meta">{item.group}{item.time && <><i/><Clock3 size={12}/> {item.time}</>}</span><b className="ml-card-title">{item.title}</b><span className="ml-card-description">{item.subtitle}</span><span className="ml-card-action">{item.kind === 'tool' ? 'Abrir práctica' : 'Leer guía'} <ChevronRight size={15}/></span>
  </motion.button>;
}
