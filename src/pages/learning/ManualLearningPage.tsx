import { useEffect, useState } from 'react';
import { Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, BookOpenCheck, Brain, Calculator, CheckCircle2, ChevronRight, Clock3, Compass, GraduationCap, Hammer, Megaphone, MessagesSquare, PanelsTopLeft, Palette, Printer, Ruler, Search, ShieldCheck, Sparkles, SwatchBook, Target, Wrench, type LucideIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Link, useLocation } from 'react-router-dom';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { fetchLearningResource } from './learning-api';
import type { LearningArea, LearningGuide, LearningLibrary, LearningPractice as Practice } from './learning-types';
import { LearningPractice } from './LearningTools';
import { normalizeSearch, progressPercent, resolveLearningRoute } from './learning-utils.js';
import './manual-learning.css';

const iconMap: Record<string, LucideIcon> = { Activity, Compass, ShieldCheck, MessagesSquare, PanelsTopLeft, Megaphone, Calculator, Ruler, SwatchBook, Palette, Brain, CheckCircle2 };
const readStorageKey = 'visualcorp-learning-read-v1';

export function ManualLearningPage({ area = 'operations' }: { area?: 'operations' | 'admin' }) {
  const location = useLocation();
  const { session } = useAuth();
  const reduceMotion = useReducedMotion();
  const basePath = area === 'admin' ? '/admin/manual-aprendizaje' : '/operaciones/manual-aprendizaje';
  const route = resolveLearningRoute(location.pathname, basePath);
  const [query, setQuery] = useState('');
  const [library, setLibrary] = useState<LearningLibrary | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let current = true;
    setLibrary(null);
    setLoadError('');
    fetchLearningResource<LearningLibrary>('library', session?.access_token)
      .then((data) => { if (current) setLibrary(data); })
      .catch((error) => { if (current) setLoadError(error instanceof Error ? error.message : 'No pudimos cargar el material de aprendizaje.'); });
    return () => { current = false; };
  }, [session?.access_token, reloadKey]);

  if (!library) return <AppFrame area={area}><div className="manual-learning learning-content-state"><PageHeading eyebrow="BIBLIOTECA INTERNA" title="Aprendizaje Visual Corp" description="Guías de equipo y prácticas interactivas, organizadas por el trabajo que hacemos."/>{loadError ? <div className="learning-empty" role="alert"><ShieldCheck size={20}/><b>No se pudo abrir el material interno.</b><span>{loadError}</span><button className="learning-primary-button" onClick={() => setReloadKey((key) => key + 1)}>Reintentar <ArrowRight size={15}/></button></div> : <div className="learning-empty" role="status"><BookOpen size={20}/><b>Verificando tu acceso y preparando las guías…</b><span>El contenido solo se carga después de validar tu sesión.</span></div>}</div></AppFrame>;

  const findGuide = (id: string) => library.guides.find((guide) => guide.id === id);
  if (route.type === 'area') return <AppFrame area={area}><AreaPage id={route.id} library={library} basePath={basePath} reduceMotion={Boolean(reduceMotion)}/></AppFrame>;
  if (route.type === 'guide') return <AppFrame area={area}><GuidePage id={route.id} library={library} basePath={basePath} reduceMotion={Boolean(reduceMotion)}/></AppFrame>;
  if (route.type === 'practice') return <AppFrame area={area}><PracticePage id={route.id} library={library} accessToken={session?.access_token} basePath={basePath}/></AppFrame>;
  if (route.type === 'not-found') return <AppFrame area={area}><NotFound basePath={basePath}/></AppFrame>;

  const searchTerm = normalizeSearch(query);
  const filteredAreas = library.areas.filter((item) => normalizeSearch(`${item.title} ${item.description}`).includes(searchTerm));
  const filteredGuides = library.guides.filter((item) => normalizeSearch(`${item.title} ${item.subtitle} ${item.areaId} ${item.sections.flatMap((section) => [section.title, section.intro, ...section.points]).join(' ')}`).includes(searchTerm));
  const filteredPractices = library.practices.filter((item) => normalizeSearch(`${item.title} ${item.description} ${item.category}`).includes(searchTerm));
  const readIds = readIdsFromStorage();
  return <AppFrame area={area}>
    <div className="manual-learning">
      <PageHeading eyebrow="APRENDER · PRACTICAR · COMPARTIR" title="Aprendizaje Visual Corp" description="Guías de equipo y prácticas interactivas, organizadas por el trabajo que hacemos."/>
      <motion.section className="learning-home-hero" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .35 }}>
        <div className="learning-hero-copy"><span className="learning-eyebrow"><Sparkles size={14}/> BIBLIOTECA DEL EQUIPO</span><h2>Aprender también<br/>es parte del <em>trabajo.</em></h2><p>Recorre una guía, resuelve una práctica y lleva una idea útil a tu siguiente tarea.</p><a className="learning-primary-button" href="#learning-areas">Explorar por área <ArrowDownRight size={16}/></a><div className="learning-hero-proof"><span><BookOpen size={15}/> {library.guides.length} guías</span><i/><span><Activity size={15}/> {library.practices.length} prácticas</span></div></div>
        <div className="learning-hero-art" aria-hidden="true"><div className="learning-orbit learning-orbit-one"/><div className="learning-orbit learning-orbit-two"/><motion.div className="learning-hero-mark" animate={reduceMotion ? undefined : { y: [0, -7, 0], rotate: [0, 2, 0] }} transition={{ duration: 5.8, repeat: Infinity, ease: 'easeInOut' }}><GraduationCap size={38}/><span>VC</span></motion.div><div className="learning-float learning-float-book"><BookOpenCheck size={17}/></div><div className="learning-float learning-float-palette"><Palette size={17}/></div><div className="learning-float learning-float-target"><Target size={17}/></div><span className="learning-hero-spark spark-one">✳</span><span className="learning-hero-spark spark-two">✦</span></div>
        <div className="learning-hero-index"><b>01—06</b><span>DE INTEGRACIÓN A PRODUCCIÓN</span><ArrowRight size={16}/></div>
      </motion.section>

      <section className="learning-section" id="learning-areas">
        <div className="learning-section-heading"><div><span className="learning-mini-label">RUTAS PARA EL EQUIPO</span><h2>Encuentra tu área</h2><p>Cada ruta reúne guías y herramientas para un momento distinto del trabajo.</p></div><label className="learning-search"><Search size={17}/><input aria-label="Buscar aprendizaje" placeholder="Buscar un tema o práctica…" value={query} onChange={(event) => setQuery(event.target.value)}/>{query && <button aria-label="Limpiar búsqueda" onClick={() => setQuery('')}>×</button>}</label></div>
        <div className="learning-area-grid">{filteredAreas.map((item, index) => <AreaCard key={item.id} area={item} basePath={basePath} index={index} reduceMotion={Boolean(reduceMotion)}/>)}</div>
        {searchTerm && filteredAreas.length === 0 && filteredGuides.length === 0 && filteredPractices.length === 0 && <div className="learning-empty"><Search size={20}/><b>No encontramos ese tema.</b><span>Prueba con otra palabra.</span></div>}
      </section>

      {searchTerm ? <section className="learning-section learning-search-results"><div className="learning-section-heading compact"><div><span className="learning-mini-label">RESULTADOS</span><h2>Coincidencias</h2><p>{filteredGuides.length + filteredPractices.length} recursos para “{query}”.</p></div></div><ResourceGrid guides={filteredGuides} tools={filteredPractices} library={library} basePath={basePath} reduceMotion={Boolean(reduceMotion)}/></section> : <>
        <section className="learning-section learning-recommended"><div className="learning-section-heading compact"><div><span className="learning-mini-label">UNA RUTA SUGERIDA</span><h2>De la idea a la entrega</h2><p>Un recorrido breve para comprender cómo se enlazan varias áreas.</p></div><Link className="learning-text-link" to={`${basePath}/areas/diseno-produccion`}>Ver diseño y producción <ArrowRight size={15}/></Link></div><div className="learning-flow-row">{['asesores', 'fundamentos', 'disenadores', 'impresores', 'taller'].map((id, index) => { const guide = findGuide(id)!; const Icon = guideIcon(id); return <Link className="learning-flow-step" key={id} to={`${basePath}/guias/${id}`}><span className="learning-flow-number">0{index + 1}</span><span className="learning-flow-icon"><Icon size={17}/></span><b>{guide.title}</b><small>{guide.areaId === 'ventas' ? 'Entender' : index === 4 ? 'Entregar' : 'Preparar'}</small>{index < 4 && <ArrowRight className="learning-flow-arrow" size={15}/>}</Link>; })}</div></section>
        <section className="learning-section learning-continue"><div className="learning-section-heading compact"><div><span className="learning-mini-label">SIGUE A TU RITMO</span><h2>Guías para abrir ahora</h2><p>Las lecturas marcadas se guardan en este navegador.</p></div><span className="learning-read-count"><CheckCircle2 size={16}/>{readIds.length} completadas aquí</span></div><ResourceGrid guides={library.guides.slice(0, 4)} tools={[]} library={library} basePath={basePath} reduceMotion={Boolean(reduceMotion)} readIds={readIds}/></section>
      </>}
      <div className="learning-safety-note"><span><ShieldCheck size={19}/></span><div><b>Contenido de apoyo, con fuentes claras</b><p>Los valores de máquinas y condiciones comerciales se confirman con la fuente vigente y la persona responsable antes de aplicarlos.</p></div><ChevronRight size={16}/></div>
      <footer className="learning-footer-note"><span>VISUAL CORP · BIBLIOTECA INTERNA</span><span>Una guía mejora cuando el equipo comparte lo que aprende.</span></footer>
    </div>
  </AppFrame>;
}

function AreaCard({ area, basePath, index, reduceMotion }: { area: LearningArea; basePath: string; index: number; reduceMotion: boolean }) {
  const Icon = iconMap[area.icon] || BookOpen;
  const count = area.id === 'practicas' ? 6 : area.guideIds.length;
  return <motion.div initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .26, delay: reduceMotion ? 0 : index * .035 }} whileHover={reduceMotion ? undefined : { y: -3 }}><Link className={`learning-area-card tone-${area.accent}`} to={`${basePath}/areas/${area.id}`}><span className="learning-area-icon"><Icon size={19}/></span><span className="learning-card-eyebrow">{area.eyebrow}</span><b>{area.title}</b><p>{area.description}</p><span className="learning-area-bottom"><span>{count} {count === 1 ? 'recurso' : 'recursos'}</span><span className="learning-area-arrow"><ArrowUpRight size={16}/></span></span><i className="learning-area-glow" aria-hidden="true"/></Link></motion.div>;
}

function AreaPage({ id, library, basePath, reduceMotion }: { id: string; library: LearningLibrary; basePath: string; reduceMotion: boolean }) {
  const area = library.areas.find((item) => item.id === id);
  if (!area) return <NotFound basePath={basePath}/>;
  const Icon = iconMap[area.icon] || BookOpen;
  const guides = area.guideIds.map((guideId) => library.guides.find((guide) => guide.id === guideId)).filter(Boolean) as LearningGuide[];
  const areaTools = area.id === 'practicas' ? library.practices : [];
  return <div className="manual-learning learning-detail-page">
    <Breadcrumb basePath={basePath} label={area.title}/>
    <motion.section className={`learning-route-hero tone-${area.accent}`} initial={reduceMotion ? false : { opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .26 }}><div><span className="learning-eyebrow"><Icon size={14}/>{area.eyebrow}</span><h2>{area.title}</h2><p>{area.description}</p><span className="learning-route-count">{guides.length + areaTools.length} recursos en esta ruta</span></div><span className="learning-route-illustration"><Icon size={43}/></span></motion.section>
    <section className="learning-section"><div className="learning-section-heading compact"><div><span className="learning-mini-label">CONTENIDO DE LA RUTA</span><h2>{area.id === 'practicas' ? 'Prueba una herramienta' : 'Elige por dónde empezar'}</h2><p>Abre una subpágina para leer o practicar dentro del panel.</p></div><Link className="learning-text-link" to={basePath}><ArrowLeft size={15}/> Todas las áreas</Link></div><ResourceGrid guides={guides} tools={areaTools} library={library} basePath={basePath} reduceMotion={reduceMotion}/></section>
    {area.id === 'diseno-produccion' && <div className="learning-process-note"><span><PanelsTopLeft size={18}/></span><div><b>Un flujo compartido</b><p>Diseño, impresión, láser y taller se conectan mediante archivos claros y traspasos confirmados. Cada operación conserva las indicaciones de la persona responsable.</p></div></div>}
  </div>;
}

function ResourceGrid({ guides, tools, library, basePath, reduceMotion, readIds = [] }: { guides: LearningGuide[]; tools: Practice[]; library: LearningLibrary; basePath: string; reduceMotion: boolean; readIds?: string[] }) {
  return <div className="learning-resource-grid">{guides.map((guide, index) => { const Icon = guideIcon(guide.id); const area = library.areas.find((item) => item.id === guide.areaId); return <motion.div key={guide.id} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .22, delay: reduceMotion ? 0 : index * .03 }} whileHover={reduceMotion ? undefined : { y: -2 }}><Link className="learning-resource-card" to={`${basePath}/guias/${guide.id}`}><span className={`learning-resource-icon resource-${index % 4}`}><Icon size={18}/></span><span className="learning-resource-meta">{area?.title}<i/><Clock3 size={12}/>{guide.duration}</span><b>{guide.title}</b><p>{guide.subtitle}</p><span className="learning-resource-action">{readIds.includes(guide.id) ? 'Repasar guía' : 'Abrir guía'} <ArrowRight size={14}/></span>{readIds.includes(guide.id) && <span className="learning-read-mark"><CheckCircle2 size={14}/>Leída aquí</span>}</Link></motion.div>; })}{tools.map((tool, index) => { const Icon = iconMap[tool.icon] || BookOpen; return <motion.div key={tool.id} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .22, delay: reduceMotion ? 0 : (guides.length + index) * .03 }} whileHover={reduceMotion ? undefined : { y: -2 }}><Link className="learning-resource-card learning-practice-card" to={`${basePath}/practicas/${tool.id}`}><span className={`learning-resource-icon resource-${(guides.length + index) % 4}`}><Icon size={18}/></span><span className="learning-resource-meta">{tool.category}<i/><Clock3 size={12}/>{tool.duration}</span><b>{tool.title}</b><p>{tool.description}</p><span className="learning-resource-action">Abrir práctica <ArrowRight size={14}/></span></Link></motion.div>; })}</div>;
}

function GuidePage({ id, library, basePath, reduceMotion }: { id: string; library: LearningLibrary; basePath: string; reduceMotion: boolean }) {
  const guide = library.guides.find((item) => item.id === id);
  if (!guide) return <NotFound basePath={basePath}/>;
  return <GuideReader key={guide.id} guide={guide} library={library} basePath={basePath} reduceMotion={reduceMotion}/>;
}

function GuideReader({ guide, library, basePath, reduceMotion }: { guide: LearningGuide; library: LearningLibrary; basePath: string; reduceMotion: boolean }) {
  const [read, setRead] = useState(() => readIdsFromStorage().includes(guide.id));
  const [readingProgress, setReadingProgress] = useState(0);
  useEffect(() => {
    const update = () => { const scrollable = document.documentElement.scrollHeight - window.innerHeight; setReadingProgress(scrollable > 0 ? Math.min(100, Math.round((window.scrollY / scrollable) * 100)) : 100); };
    update(); window.addEventListener('scroll', update, { passive: true }); window.addEventListener('resize', update); return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [guide.id]);
  const area = library.areas.find((item) => item.id === guide.areaId)!;
  const sectionTotal = guide.sections.length + guide.checklist.length;
  const markRead = () => { const current = readIdsFromStorage(); const next = read ? current.filter((id) => id !== guide.id) : [...new Set([...current, guide.id])]; window.localStorage.setItem(readStorageKey, JSON.stringify(next)); setRead(!read); };
  const guideIndex = library.guides.findIndex((item) => item.id === guide.id);
  const nextGuide = library.guides[(guideIndex + 1) % library.guides.length];
  return <div className="manual-learning learning-detail-page learning-reader">
    <div className="learning-reading-progress" aria-hidden="true"><span style={{ width: `${readingProgress}%` }}/></div>
    <Breadcrumb basePath={basePath} label={area.title}/>
    <motion.section className={`learning-reader-hero tone-${area.accent}`} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .26 }}><div><span className="learning-eyebrow">{area.title.toUpperCase()} · GUÍA</span><h2>{guide.title}</h2><p>{guide.subtitle}</p><div className="learning-reader-meta"><span><Clock3 size={14}/>{guide.duration}</span><span><BookOpen size={14}/>{sectionTotal} ideas y pasos</span></div></div><span className="learning-reader-orbit"><BookOpenCheck size={37}/><i/></span></motion.section>
    <div className="learning-reader-layout"><aside className="learning-reader-toc"><span className="learning-mini-label">EN ESTA GUÍA</span><nav aria-label="Secciones de la guía">{guide.sections.map((section, index) => <a href={`#${section.id}`} key={section.id}><small>0{index + 1}</small>{section.title}</a>)}<a href="#repaso"><small>✓</small>Lista de repaso</a></nav><div className="learning-reader-progress-caption"><span>Lectura</span><b>{readingProgress}%</b></div><button className={read ? 'is-done' : ''} onClick={markRead}>{read ? <CheckCircle2 size={15}/> : <CheckCircle2 size={15}/>} {read ? 'Marcada como leída' : 'Marcar como leída'}</button><small className="learning-local-storage-note">Solo en este navegador</small></aside>
      <motion.article className="learning-article" initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .3 }}><div className="learning-outcome"><span><Target size={16}/></span><div><b>Al terminar</b><p>{guide.outcome}</p></div></div>{guide.sections.map((section, index) => <section className="learning-article-section" id={section.id} key={section.id}><span className="learning-section-number">0{index + 1}</span><div><h3>{section.title}</h3><p className="learning-article-intro">{section.intro}</p><ul>{section.points.map((point) => <li key={point}>{point}</li>)}</ul>{section.note && <div className="learning-inline-note"><Sparkles size={15}/><span>{section.note}</span></div>}</div></section>)}<section className="learning-article-section learning-review-section" id="repaso"><span className="learning-section-number"><CheckCircle2 size={18}/></span><div><h3>Antes de continuar</h3><p className="learning-article-intro">Usa esta lista como repaso; el procedimiento vigente de cada área define la operación real.</p><ul className="learning-review-list">{guide.checklist.map((item) => <li key={item}><CheckCircle2 size={16}/>{item}</li>)}</ul></div></section><div className="learning-source-line"><BookOpen size={14}/><span>{guide.source}</span></div></motion.article>
    </div>
    <div className="learning-next-route"><div><span className="learning-mini-label">SIGUIENTE SUBPÁGINA</span><b>{nextGuide.title}</b><small>{library.areas.find((item) => item.id === nextGuide.areaId)?.title}</small></div><Link to={`${basePath}/guias/${nextGuide.id}`} aria-label={`Abrir ${nextGuide.title}`}><ArrowRight size={18}/></Link></div>
    <div className="learning-back-row"><Link to={`${basePath}/areas/${area.id}`}><ArrowLeft size={15}/> Volver a {area.title}</Link><Link to={basePath}>Todas las áreas <ArrowRight size={15}/></Link></div>
  </div>;
}

function PracticePage({ id, library, accessToken, basePath }: { id: string; library: LearningLibrary; accessToken?: string; basePath: string }) {
  const practice = library.practices.find((item) => item.id === id);
  if (!practice) return <NotFound basePath={basePath}/>;
  const Icon = iconMap[practice.icon] || BookOpen;
  return <div className="manual-learning learning-detail-page">
    <Breadcrumb basePath={basePath} label="Prácticas y herramientas"/>
    <section className="learning-practice-hero"><span className="learning-practice-hero-icon"><Icon size={25}/></span><div><span className="learning-eyebrow">PRÁCTICA · {practice.category.toUpperCase()}</span><h2>{practice.title}</h2><p>{practice.description}</p></div><span className="learning-practice-duration"><Clock3 size={14}/>{practice.duration}</span></section>
    <LearningPractice id={practice.id} accessToken={accessToken} checklists={library.checklists}/>
    <div className="learning-back-row"><Link to={`${basePath}/areas/practicas`}><ArrowLeft size={15}/> Todas las prácticas</Link><Link to={basePath}>Volver a aprendizaje <ArrowRight size={15}/></Link></div>
  </div>;
}

function NotFound({ basePath }: { basePath: string }) {
  return <div className="manual-learning learning-not-found"><span className="learning-tool-symbol violet"><Search size={20}/></span><span className="learning-mini-label">RUTA NO DISPONIBLE</span><h2>No encontramos esta subpágina.</h2><p>Elige un área para regresar a la biblioteca.</p><Link className="learning-primary-button" to={basePath}><ArrowLeft size={15}/> Volver a Aprendizaje</Link></div>;
}

function Breadcrumb({ basePath, label }: { basePath: string; label: string }) {
  return <nav className="learning-breadcrumb" aria-label="Ruta de navegación"><Link to={basePath}>Aprendizaje</Link><ChevronRight size={13}/><span>{label}</span></nav>;
}

function guideIcon(id: string): LucideIcon {
  const byId: Record<string, LucideIcon> = { induccion: Compass, seguridad: ShieldCheck, asesores: MessagesSquare, fundamentos: Palette, disenadores: PanelsTopLeft, impresores: Printer, laser: Wrench, taller: Hammer, marketing: Megaphone };
  return byId[id] || BookOpen;
}

function readIdsFromStorage(): string[] {
  try { const value = JSON.parse(window.localStorage.getItem(readStorageKey) || '[]'); return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []; } catch { return []; }
}
