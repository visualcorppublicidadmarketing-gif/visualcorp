import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  BookOpenCheck,
  Brain,
  Calculator,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Compass,
  GraduationCap,
  Hammer,
  Layers,
  Megaphone,
  MessagesSquare,
  PanelsTopLeft,
  Palette,
  Printer,
  RotateCcw,
  Ruler,
  Search,
  ShieldCheck,
  Sparkles,
  SwatchBook,
  Target,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Link, useLocation } from 'react-router-dom';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { NumberTicker, SpotlightLayer, clearSpotlight, updateSpotlight } from '../../components/ui/MagicComponents';
import { fetchLearningResource } from './learning-api';
import { LearningBlockRenderer } from './LearningBlockRenderer';
import type { LearningArea, LearningGuide, LearningLibrary, LearningPractice as Practice, LearningSection } from './learning-types';
import { LearningPractice } from './LearningTools';
import { normalizeSearch, progressPercent, resolveLearningRoute } from './learning-utils.js';
import './manual-learning.css';

const READ_KEY = 'visualcorp-manual-read-guides';
const areaIcons: Record<string, LucideIcon> = {
  inicio: Compass,
  seguridad: ShieldCheck,
  ventas: MessagesSquare,
  'diseno-produccion': PanelsTopLeft,
  marketing: Megaphone,
  practicas: Activity,
};
const practiceIcons: Record<string, LucideIcon> = {
  calculadora: Calculator,
  distancia: Ruler,
  pantone: SwatchBook,
  colormatch: Palette,
  quiz: Brain,
  checklist: CheckCircle2,
};
const practiceAccents: Record<string, string> = {
  calculadora: 'cyan',
  distancia: 'amber',
  pantone: 'violet',
  colormatch: 'pink',
  quiz: 'mint',
  checklist: 'cyan',
};

function loadReadIds(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(READ_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveReadIds(ids: string[]) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(ids));
  } catch {
    /* ignore storage error in private mode */
  }
}

function sectionSearchHaystack(section: LearningSection): string {
  const parts: string[] = [section.title, section.intro, ...(section.points || []), section.note || ''];
  for (const block of section.blocks || []) {
    if (block.type === 'media') parts.push(block.alt, block.caption || '');
    if (block.type === 'cards') {
      block.items.forEach((item) => parts.push(item.title, item.subtitle || '', item.description || '', ...(item.items || [])));
    }
    if (block.type === 'tokens') {
      parts.push(block.filename);
      block.parts.forEach((p) => parts.push(p.token, p.label, p.help));
    }
    if (block.type === 'color-layers') {
      block.layers.forEach((l) => parts.push(l.name, l.subtitle, l.description, l.tag));
    }
    if (block.type === 'table') {
      parts.push(...block.headers);
      block.rows.forEach((r) => {
        if (r.group) parts.push(r.group);
        r.cells.forEach((c) => parts.push(c.text));
      });
    }
    if (block.type === 'compare') {
      block.items.forEach((c) => {
        parts.push(c.title, c.subtitle || '', c.description || '');
        c.points?.forEach((p) => parts.push(p.text, p.highlight || ''));
      });
    }
    if (block.type === 'specs-grid') {
      block.items.forEach((m) => {
        parts.push(m.title, m.note || '');
        m.specs.forEach((s) => parts.push(s.label, s.value));
      });
    }
    if (block.type === 'callout') parts.push(block.title, block.text);
    if (block.type === 'tree') block.lines.forEach((l) => parts.push(l.text));
    if (block.type === 'steps') block.items.forEach((s) => parts.push(s.title, s.description, s.code || ''));
    if (block.type === 'diagram') parts.push(block.title || '', block.subtitle || '', ...Object.values(block.labels), ...(block.highlights || []));
  }
  return normalizeSearch(parts.join(' '));
}

function matchesSearchText(normalizedHaystack: string, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  if (normalizedHaystack.includes(normalizedQuery)) return true;
  const compactQuery = normalizedQuery.replace(/\s+/g, '');
  return compactQuery.length > 0 && normalizedHaystack.replace(/\s+/g, '').includes(compactQuery);
}

function Breadcrumb({ basePath, items }: { basePath: string; items: { label: string; to?: string }[] }) {
  return (
    <div className="learning-breadcrumb">
      <Link to={basePath}>Manual</Link>
      {items.map((item) => (
        <span key={item.label} className="learning-breadcrumb-item">
          <ChevronRight size={13} aria-hidden="true" />
          {item.to ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}
        </span>
      ))}
    </div>
  );
}

function PracticeCard({ basePath, practice }: { basePath: string; practice: Practice }) {
  const reduceMotion = useReducedMotion();
  const Icon = practiceIcons[practice.id] || Calculator;
  const accent = practiceAccents[practice.id] || 'cyan';
  return (
    <motion.div
      whileHover={reduceMotion ? undefined : { y: -3 }}
      transition={{ duration: reduceMotion ? 0 : 0.18 }}
    >
      <Link
        className={`learning-resource-card learning-practice-card vc-magic-card tone-${accent}`}
        to={`${basePath}/practicas/${practice.id}`}
        onPointerMove={updateSpotlight}
        onPointerLeave={clearSpotlight}
      >
        <SpotlightLayer />
        <span className="learning-resource-icon">
          <Icon size={18} />
        </span>
        <span className="learning-resource-meta">
          {(practice.category || 'PRÁCTICA').toUpperCase()} <i /> {practice.duration}
        </span>
        <b>{practice.title}</b>
        <p>{practice.description}</p>
        <span className="learning-resource-action">
          Abrir herramienta <ArrowUpRight size={14} />
        </span>
      </Link>
    </motion.div>
  );
}

function GuideCourseCard({
  basePath,
  guide,
  area,
  read,
}: {
  basePath: string;
  guide: LearningGuide;
  area?: LearningArea;
  read: boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      whileHover={reduceMotion ? undefined : { y: -3 }}
      transition={{ duration: reduceMotion ? 0 : 0.18 }}
    >
      <Link
        className={`learning-course-card vc-magic-card tone-${area?.accent || 'violet'}`}
        to={`${basePath}/guias/${guide.id}`}
        onPointerMove={updateSpotlight}
        onPointerLeave={clearSpotlight}
      >
        <SpotlightLayer />
        {guide.coverImage ? (
          <div className="learning-course-cover">
            <img src={guide.coverImage} alt={guide.title} loading="lazy" />
            <div className="learning-course-cover-badges">
              {area && <span className="learning-course-area-pill">{area.title}</span>}
              {read && (
                <span className="learning-read-pill">
                  <CheckCircle2 size={12} /> Leída
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="learning-course-head-noimg">
            <span className="learning-resource-icon">
              <BookOpen size={18} />
            </span>
            <div className="learning-course-cover-badges">
              {area && <span className="learning-course-area-pill">{area.title}</span>}
              {read && (
                <span className="learning-read-pill">
                  <CheckCircle2 size={12} /> Leída
                </span>
              )}
            </div>
          </div>
        )}
        <div className="learning-course-body">
          <div className="learning-resource-meta">
            <span>{guide.badge || 'GUÍA VISUAL'}</span>
            <i />
            <span>{guide.duration}</span>
            <i />
            <span>{guide.sections.length} módulos</span>
          </div>
          <b>{guide.title}</b>
          <p>{guide.subtitle}</p>
          <span className="learning-resource-action">
            Abrir manual completo <ArrowRight size={14} />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

function Home({
  basePath,
  library,
  readIds,
}: {
  basePath: string;
  library: LearningLibrary;
  readIds: string[];
}) {
  const [query, setQuery] = useState('');
  const [selectedAreaId, setSelectedAreaId] = useState<string>('all');
  const reduceMotion = useReducedMotion();
  const normalizedQuery = normalizeSearch(query);

  const sectionMatches = useMemo(() => {
    if (!normalizedQuery) return [];
    const results: { guide: LearningGuide; area?: LearningArea; section: LearningSection; idx: number }[] = [];
    for (const guide of library.guides) {
      const area = library.areas.find((a) => a.id === guide.areaId);
      const guideHits = matchesSearchText(normalizeSearch(`${guide.title} ${guide.subtitle} ${guide.outcome}`), normalizedQuery);
      guide.sections.forEach((section, idx) => {
        if (guideHits || matchesSearchText(sectionSearchHaystack(section), normalizedQuery)) {
          results.push({ guide, area, section, idx });
        }
      });
    }
    return results.slice(0, 12);
  }, [library, normalizedQuery]);

  const matchingPractices = useMemo(() => {
    if (!normalizedQuery) return [];
    return library.practices.filter((practice) =>
      matchesSearchText(normalizeSearch(`${practice.title} ${practice.description} ${practice.category}`), normalizedQuery)
    );
  }, [library.practices, normalizedQuery]);

  const filteredGuides = useMemo(() => {
    if (selectedAreaId === 'all') return library.guides;
    return library.guides.filter((g) => g.areaId === selectedAreaId);
  }, [library.guides, selectedAreaId]);

  const guideAreas = useMemo(() => library.areas.filter((a) => a.guideIds.length > 0), [library.areas]);
  const completedCount = library.guides.filter((guide) => readIds.includes(guide.id)).length;
  const totalCompletionPct = progressPercent(completedCount, library.guides.length);

  const flow = [
    { step: '01', title: 'Inducción y seguridad', detail: 'Cultura, EPP y reglas base', to: `${basePath}/areas/inicio`, icon: ShieldCheck },
    { step: '02', title: 'Asesoría y ventas', detail: 'Cotización, CRM y seguimiento', to: `${basePath}/areas/ventas`, icon: Compass },
    { step: '03', title: 'Diseño y archivos', detail: 'Nomenclatura, CMYK y vectores', to: `${basePath}/guias/disenadores`, icon: Palette },
    { step: '04', title: 'Impresión y láser 60W', detail: 'Galaxy 3.2m / 2.5m y foco 7 mm', to: `${basePath}/guias/impresores`, icon: Printer },
    { step: '05', title: 'Taller, montaje y marca', detail: 'Instalación, acabados y redes', to: `${basePath}/guias/taller`, icon: Hammer },
  ];

  return (
    <div className="manual-learning">
      <motion.section
        className="learning-home-hero"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.28 }}
      >
        <div className="learning-hero-copy">
          <span className="learning-eyebrow">
            <GraduationCap size={14} /> MANUAL INTERACTIVO · VISUAL CORP ACADEMIA
          </span>
          <h2>
            Domina cada área con guías <em>visuales y directas</em>.
          </h2>
          <p>
            Protocolos reales de Visual Corp con fotografías del taller, diagramas de color láser, calibración de 7 mm,
            nomenclatura de archivos y herramientas interactivas para cada puesto.
          </p>
          <div className="learning-hero-actions">
            <Link className="learning-primary-button" to={`${basePath}/guias/fundamentos`}>
              <BookOpenCheck size={16} /> Empezar por Fundamentos
            </Link>
            <Link className="learning-secondary-button" to={`${basePath}/practicas/quiz`}>
              <Brain size={16} /> Probar conocimientos
            </Link>
          </div>
          <div className="learning-hero-proof">
            <span>
              <Layers size={14} /> <NumberTicker value={library.guides.length} /> manuales por puesto
            </span>
            <i />
            <span>
              <Target size={14} /> <NumberTicker value={completedCount} /> de {library.guides.length} completados ({totalCompletionPct}%)
            </span>
            <i />
            <span>
              <Sparkles size={14} /> {library.practices.length} herramientas en vivo
            </span>
          </div>
        </div>

        <div className="learning-hero-art" aria-hidden="true">
          <div className="learning-orbit" />
          <div className="learning-orbit learning-orbit-two" />
          <div className="learning-hero-mark">
            <GraduationCap size={36} />
            <span>VISUAL CORP</span>
          </div>
          <span className="learning-float learning-float-book">
            <BookOpen size={17} />
          </span>
          <span className="learning-float learning-float-palette">
            <Palette size={17} />
          </span>
          <span className="learning-float learning-float-target">
            <Target size={17} />
          </span>
        </div>

        <div className="learning-hero-index">
          <span>
            RUTAS COMPLETAS: <b>DISEÑO</b> · <b>GALAXY</b> · <b>LÁSER 60W</b> · <b>TALLER</b> · <b>MARKETING</b>
          </span>
          <ArrowDownRight size={15} aria-hidden="true" />
        </div>
      </motion.section>

      <section className="learning-section" id="rutas">
        <div className="learning-section-heading">
          <div>
            <span className="learning-mini-label">RUTAS POR PUESTO Y DEPARTAMENTO</span>
            <h2>Elige tu área o busca un tema técnico</h2>
            <p>
              Busca por máquina, extensión de archivo, regla de nomenclatura, material, parámetro de corte o palabra clave.
            </p>
          </div>
          <label className="learning-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ej: 7mm, Hosonsoft, Pantone, CMYK…"
              aria-label="Buscar tema en el manual"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Limpiar búsqueda">
                ×
              </button>
            )}
          </label>
        </div>

        {normalizedQuery ? (
          <div className="learning-search-results">
            <div className="learning-search-summary">
              <span>
                {sectionMatches.length} secciones y {matchingPractices.length} herramientas coinciden con «{query}»
              </span>
            </div>
            {sectionMatches.length > 0 && (
              <div className="learning-search-hit-grid">
                {sectionMatches.map(({ guide, area, section, idx }) => (
                  <Link
                    key={`${guide.id}-${section.id}`}
                    className={`learning-search-hit tone-${area?.accent || 'violet'}`}
                    to={`${basePath}/guias/${guide.id}#${section.id}`}
                  >
                    <div className="learning-search-hit-meta">
                      <span>{guide.title}</span>
                      <ChevronRight size={13} aria-hidden="true" />
                      <b>
                        {String(idx + 1).padStart(2, '0')} · {section.title}
                      </b>
                    </div>
                    <p>{section.intro}</p>
                  </Link>
                ))}
              </div>
            )}
            {matchingPractices.length > 0 && (
              <div className="learning-resource-grid" style={{ marginTop: 14 }}>
                {matchingPractices.map((practice) => (
                  <PracticeCard key={practice.id} basePath={basePath} practice={practice} />
                ))}
              </div>
            )}
            {sectionMatches.length === 0 && matchingPractices.length === 0 && (
              <div className="learning-empty">
                <Compass size={18} />
                <span>
                  No encontramos coincidencias para <b>«{query}»</b>. Prueba con otra palabra clave o explora las áreas.
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="learning-area-grid">
            {library.areas.map((area) => {
              const Icon = areaIcons[area.id] || PanelsTopLeft;
              const areaGuides = library.guides.filter((guide) => area.guideIds.includes(guide.id));
              const readInArea = areaGuides.filter((guide) => readIds.includes(guide.id)).length;
              return (
                <motion.div
                  key={area.id}
                  whileHover={reduceMotion ? undefined : { y: -3 }}
                  transition={{ duration: reduceMotion ? 0 : 0.18 }}
                >
                  <Link
                    className={`learning-area-card vc-magic-card tone-${area.accent}`}
                    to={`${basePath}/areas/${area.id}`}
                    onPointerMove={updateSpotlight}
                    onPointerLeave={clearSpotlight}
                  >
                    <SpotlightLayer />
                    <div className="learning-area-top">
                      <span className="learning-area-icon">
                        <Icon size={20} />
                      </span>
                      <span className="learning-card-eyebrow">{area.eyebrow || area.id.toUpperCase()}</span>
                    </div>
                    <b>{area.title}</b>
                    <p>{area.description}</p>
                    <div className="learning-area-bottom">
                      <span>
                        {area.guideIds.length > 0
                          ? `${areaGuides.length} ${areaGuides.length === 1 ? 'manual' : 'manuales'} · ${readInArea}/${areaGuides.length} leídos`
                          : `${library.practices.length} herramientas interactivas`}
                      </span>
                      <span className="learning-area-arrow">
                        <ArrowUpRight size={15} />
                      </span>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {!normalizedQuery && (
        <section className="learning-section" id="cursos">
          <div className="learning-section-heading compact">
            <div>
              <span className="learning-mini-label">CATÁLOGO DE CURSOS Y MANUALES</span>
              <h2>Explora todos los manuales visuales</h2>
              <p>Filtra por departamento para abrir cualquier guía directamente en su vista interactiva.</p>
            </div>
            <div className="learning-filter-pills" role="tablist" aria-label="Filtrar manuales por departamento">
              <button
                type="button"
                role="tab"
                aria-selected={selectedAreaId === 'all'}
                className={selectedAreaId === 'all' ? 'is-active' : ''}
                onClick={() => setSelectedAreaId('all')}
              >
                Todos ({library.guides.length})
              </button>
              {guideAreas.map((area) => (
                <button
                  key={area.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedAreaId === area.id}
                  className={selectedAreaId === area.id ? 'is-active' : ''}
                  onClick={() => setSelectedAreaId(area.id)}
                >
                  {area.title}
                </button>
              ))}
            </div>
          </div>
          <div className="learning-course-grid">
            {filteredGuides.map((guide) => (
              <GuideCourseCard
                key={guide.id}
                basePath={basePath}
                guide={guide}
                area={library.areas.find((a) => a.id === guide.areaId)}
                read={readIds.includes(guide.id)}
              />
            ))}
          </div>
        </section>
      )}

      {!normalizedQuery && (
        <section className="learning-section" id="herramientas">
          <div className="learning-section-heading compact">
            <div>
              <span className="learning-mini-label">SIMULADORES Y LABORATORIO</span>
              <h2>Practica antes de producir</h2>
              <p>Herramientas interactivas de cálculo de área, distancia visual, Pantone, color y evaluación.</p>
            </div>
            <span className="learning-read-count">
              <CheckCircle2 size={15} /> {readIds.length} de {library.guides.length} guías completadas
            </span>
          </div>
          <div className="learning-resource-grid">
            {library.practices.map((practice) => (
              <PracticeCard key={practice.id} basePath={basePath} practice={practice} />
            ))}
          </div>
        </section>
      )}

      <section className="learning-section learning-flow-section" id="flujo">
        <div className="learning-section-heading compact">
          <div>
            <span className="learning-mini-label">SECUENCIA OPERATIVA COMPLETA</span>
            <h2>Cómo se conectan las áreas en Visual Corp</h2>
            <p>Desde la inducción y asesoría comercial hasta diseño, impresión, láser e instalación final.</p>
          </div>
        </div>
        <div className="learning-flow-row">
          {flow.map((item, index) => {
            const Icon = item.icon;
            return (
              <Link className="learning-flow-step" to={item.to} key={item.step}>
                <span className="learning-flow-number">{item.step}</span>
                <span className="learning-flow-icon">
                  <Icon size={18} />
                </span>
                <b>{item.title}</b>
                <small>{item.detail}</small>
                {index < flow.length - 1 && <ArrowRight className="learning-flow-arrow" size={14} aria-hidden="true" />}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function AreaPage({
  area,
  basePath,
  library,
  readIds,
}: {
  area: LearningArea;
  basePath: string;
  library: LearningLibrary;
  readIds: string[];
}) {
  const Icon = areaIcons[area.id] || PanelsTopLeft;
  const areaGuides = library.guides.filter((guide) => area.guideIds.includes(guide.id));
  const areaPractices = area.id === 'practicas' ? library.practices : [];
  const reduceMotion = useReducedMotion();

  return (
    <div className={`manual-learning learning-detail-page tone-${area.accent}`}>
      <Breadcrumb basePath={basePath} items={[{ label: area.title }]} />
      <motion.section
        className="learning-route-hero"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.24 }}
      >
        <div>
          <span className="learning-eyebrow">{area.eyebrow || area.title.toUpperCase()}</span>
          <h2>{area.title}</h2>
          <p>{area.description}</p>
          <span className="learning-route-count">
            {areaGuides.length > 0
              ? `${areaGuides.length} ${areaGuides.length === 1 ? 'manual detallado' : 'manuales detallados'}`
              : `${areaPractices.length} herramientas interactivas disponibles`}
          </span>
        </div>
        <span className="learning-route-illustration">
          <Icon size={38} />
        </span>
      </motion.section>

      {areaGuides.length > 0 && (
        <section className="learning-section">
          <div className="learning-section-heading compact">
            <div>
              <span className="learning-mini-label">MANUALES DEL ÁREA</span>
              <h2>Elige un curso para abrir su contenido visual</h2>
            </div>
          </div>
          <div className="learning-course-grid">
            {areaGuides.map((guide) => (
              <GuideCourseCard
                key={guide.id}
                basePath={basePath}
                guide={guide}
                area={area}
                read={readIds.includes(guide.id)}
              />
            ))}
          </div>
        </section>
      )}

      {areaPractices.length > 0 && (
        <section className="learning-section">
          <div className="learning-section-heading compact">
            <div>
              <span className="learning-mini-label">SIMULADORES Y CHECKLISTS</span>
              <h2>Elige una herramienta práctica</h2>
            </div>
          </div>
          <div className="learning-resource-grid">
            {areaPractices.map((practice) => (
              <PracticeCard key={practice.id} basePath={basePath} practice={practice} />
            ))}
          </div>
        </section>
      )}

      <div className="learning-back-row">
        <Link to={basePath}>
          <ArrowLeft size={15} /> Volver al índice del manual
        </Link>
      </div>
    </div>
  );
}

function GuideReader({
  guide,
  basePath,
  library,
  readIds,
  onToggleRead,
}: {
  guide: LearningGuide;
  basePath: string;
  library: LearningLibrary;
  readIds: string[];
  onToggleRead: (id: string) => void;
}) {
  const location = useLocation();
  const area = library.areas.find((item) => item.id === guide.areaId) || library.areas[0];
  const reduceMotion = useReducedMotion();
  const [sectionQuery, setSectionQuery] = useState('');
  const [activeSectionId, setActiveSectionId] = useState<string>(guide.sections[0]?.id || '');
  const [readingProgress, setReadingProgress] = useState(12);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const normalizedFilter = normalizeSearch(sectionQuery);
  const visibleSections = useMemo(() => {
    if (!normalizedFilter) return guide.sections;
    return guide.sections.filter((sec) => matchesSearchText(sectionSearchHaystack(sec), normalizedFilter));
  }, [guide.sections, normalizedFilter]);

  const guideIndex = library.guides.findIndex((g) => g.id === guide.id);
  const prevGuide = guideIndex > 0 ? library.guides[guideIndex - 1] : null;
  const nextGuide = guideIndex >= 0 && guideIndex < library.guides.length - 1 ? library.guides[guideIndex + 1] : null;
  const isRead = readIds.includes(guide.id);

  // Scroll to hash anchor when landing from search hits or URL hash
  useEffect(() => {
    if (!location.hash) {
      setActiveSectionId(guide.sections[0]?.id || '');
      return;
    }
    const targetId = location.hash.replace('#', '');
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      setActiveSectionId(targetId);
    }
  }, [guide.id, guide.sections, location.hash, reduceMotion]);

  // Active TOC section observer + overall reading progress percentage
  useEffect(() => {
    const updateProgress = () => {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
      const pct = Math.min(100, Math.max(8, Math.round((scrollTop / maxScroll) * 100)));
      setReadingProgress(pct);
    };

    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });

    if (typeof IntersectionObserver === 'undefined') {
      return () => window.removeEventListener('scroll', updateProgress);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveSectionId(visible[0].target.id);
        }
      },
      { rootMargin: '-18% 0px -65% 0px', threshold: 0.05 }
    );

    guide.sections.forEach((sec) => {
      const el = sectionRefs.current[sec.id] || document.getElementById(sec.id);
      if (el) observer.observe(el);
    });

    return () => {
      window.removeEventListener('scroll', updateProgress);
      observer.disconnect();
    };
  }, [guide.id, guide.sections, visibleSections.length]);

  const registerSectionRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      sectionRefs.current[id] = el;
    },
    []
  );

  const sectionTotal = guide.sections.length;

  return (
    <div className={`manual-learning learning-detail-page learning-reader tone-${area.accent}`}>
      <div className="learning-reading-progress" aria-hidden="true">
        <span style={{ width: `${readingProgress}%` }} />
      </div>

      <Breadcrumb
        basePath={basePath}
        items={[
          { label: area.title, to: `${basePath}/areas/${area.id}` },
          { label: guide.title },
        ]}
      />

      <motion.section
        className="learning-reader-hero"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.24 }}
      >
        <div className="learning-reader-hero-copy">
          <span className="learning-eyebrow">{area.title.toUpperCase()} · CURSO VISUAL</span>
          <h2>{guide.title}</h2>
          <p>{guide.subtitle}</p>
          <div className="learning-reader-meta">
            <span>
              <Clock3 size={15} /> {guide.duration}
            </span>
            <span>
              <BookOpen size={15} /> {sectionTotal} secciones visuales
            </span>
            {guide.badge && <span className="learning-reader-badge">{guide.badge}</span>}
          </div>
        </div>
        {guide.coverImage ? (
          <div className="learning-reader-hero-media">
            <img src={guide.coverImage} alt={guide.title} />
          </div>
        ) : (
          <span className="learning-reader-orbit">
            <BookOpenCheck size={36} />
            <i />
          </span>
        )}
      </motion.section>

      <div className="learning-reader-layout">
        <aside className="learning-reader-toc" aria-label="Índice del manual">
          <span className="learning-mini-label">CONTENIDO</span>

          <label className="learning-toc-search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={sectionQuery}
              onChange={(e) => setSectionQuery(e.target.value)}
              placeholder="Filtrar en este manual..."
              aria-label="Filtrar secciones de este manual"
            />
            {sectionQuery && (
              <button type="button" onClick={() => setSectionQuery('')} aria-label="Limpiar filtro">
                ×
              </button>
            )}
          </label>

          <nav aria-label="Secciones de la guía">
            {guide.sections.map((section, index) => {
              const isMatch = !normalizedFilter || visibleSections.some((s) => s.id === section.id);
              const isActive = activeSectionId === section.id;
              return (
                <a
                  href={`#${section.id}`}
                  key={section.id}
                  onClick={() => setActiveSectionId(section.id)}
                  className={`${isActive ? 'is-active' : ''} ${!isMatch ? 'is-dimmed' : ''}`}
                >
                  <span className="learning-toc-dot" aria-hidden="true" />
                  <small>{String(index + 1).padStart(2, '0')}</small>
                  <span>{section.title}</span>
                </a>
              );
            })}
            <a
              href="#repaso"
              onClick={() => setActiveSectionId('repaso')}
              className={activeSectionId === 'repaso' ? 'is-active' : ''}
            >
              <span className="learning-toc-dot" aria-hidden="true" />
              <small>✓</small>
              <span>Lista de repaso</span>
            </a>
          </nav>

          <div className="learning-reader-progress-caption">
            <span>Progreso de lectura</span>
            <b>{readingProgress}%</b>
          </div>

          <button className={isRead ? 'is-done' : ''} onClick={() => onToggleRead(guide.id)} type="button">
            <CheckCircle2 size={15} /> {isRead ? 'Marcada como leída' : 'Marcar como leída'}
          </button>
          <small className="learning-local-storage-note">Progreso guardado en este navegador</small>
        </aside>

        <motion.article
          className="learning-article"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.28 }}
        >
          <div className="learning-outcome">
            <span>
              <Target size={17} />
            </span>
            <div>
              <b>Objetivo al terminar este manual</b>
              <p>{guide.outcome}</p>
            </div>
          </div>

          {normalizedFilter && (
            <div className="learning-filter-banner">
              <span>
                Mostrando {visibleSections.length} de {guide.sections.length} secciones para «{sectionQuery}»
              </span>
              <button type="button" onClick={() => setSectionQuery('')}>
                Ver todas
              </button>
            </div>
          )}

          {visibleSections.length === 0 ? (
            <div className="learning-empty" style={{ margin: '24px 0' }}>
              <Search size={18} />
              <span>
                Ninguna sección coincide con <b>«{sectionQuery}»</b> en esta guía.
              </span>
            </div>
          ) : (
            visibleSections.map((section) => {
              const realIdx = guide.sections.findIndex((s) => s.id === section.id);
              const numLabel = String(realIdx + 1).padStart(2, '0');
              return (
                <section
                  className="learning-article-section"
                  id={section.id}
                  key={section.id}
                  ref={registerSectionRef(section.id)}
                >
                  <div className="learning-section-top">
                    <span className="learning-section-badge">
                      {section.eyebrow || `SECCIÓN ${numLabel}`}
                    </span>
                    <span className="learning-section-num-pill">#{numLabel}</span>
                  </div>
                  <h3>{section.title}</h3>
                  <p className="learning-article-intro">{section.intro}</p>

                  {section.blocks && section.blocks.length > 0 && (
                    <div className="learning-blocks-stack">
                      {section.blocks.map((block, bIdx) => (
                        <LearningBlockRenderer
                          key={`${section.id}-blk-${bIdx}-${block.type}`}
                          block={block}
                          basePath={basePath}
                        />
                      ))}
                    </div>
                  )}

                  {section.points && section.points.length > 0 && (
                    <ul className="learning-points-list">
                      {section.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  )}

                  {section.note && (
                    <div className="learning-inline-note">
                      <Sparkles size={15} />
                      <span>{section.note}</span>
                    </div>
                  )}
                </section>
              );
            })
          )}

          <section
            className="learning-article-section learning-review-section"
            id="repaso"
            ref={registerSectionRef('repaso')}
          >
            <div className="learning-section-top">
              <span className="learning-section-badge">CHECKLIST DE VERIFICACIÓN</span>
            </div>
            <h3>Antes de continuar</h3>
            <p className="learning-article-intro">
              Usa esta lista de repaso rápida. El procedimiento operativo vigente de cada área en la Suite define la operación real.
            </p>
            <ul className="learning-review-list">
              {guide.checklist.map((item) => (
                <li key={item}>
                  <CheckCircle2 size={16} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="learning-source-line">
            <BookOpen size={14} />
            <span>{guide.source}</span>
          </div>
        </motion.article>
      </div>

      <div className="learning-pager-grid">
        {prevGuide ? (
          <Link className="learning-next-route" to={`${basePath}/guias/${prevGuide.id}`}>
            <span className="learning-pager-icon">
              <ArrowLeft size={16} />
            </span>
            <div>
              <span className="learning-mini-label">MANUAL ANTERIOR</span>
              <b>{prevGuide.title}</b>
              <small>{prevGuide.duration}</small>
            </div>
          </Link>
        ) : (
          <div />
        )}

        {nextGuide ? (
          <Link className="learning-next-route is-next" to={`${basePath}/guias/${nextGuide.id}`}>
            <div>
              <span className="learning-mini-label">SIGUIENTE MANUAL</span>
              <b>{nextGuide.title}</b>
              <small>{nextGuide.duration}</small>
            </div>
            <span className="learning-pager-icon">
              <ArrowRight size={16} />
            </span>
          </Link>
        ) : (
          <Link className="learning-next-route is-next" to={`${basePath}/practicas/quiz`}>
            <div>
              <span className="learning-mini-label">EVALUACIÓN FINAL</span>
              <b>Ir al quiz y simuladores prácticos</b>
              <small>Pon a prueba tus conocimientos</small>
            </div>
            <span className="learning-pager-icon">
              <Brain size={16} />
            </span>
          </Link>
        )}
      </div>

      <div className="learning-back-row">
        <Link to={`${basePath}/areas/${area.id}`}>
          <ArrowLeft size={15} /> Volver al área {area.title}
        </Link>
        <button
          type="button"
          className="learning-top-button"
          onClick={() => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })}
        >
          <ArrowUp size={14} /> Subir al inicio
        </button>
        <Link to={basePath}>Índice general</Link>
      </div>
    </div>
  );
}

function PracticePage({
  practice,
  basePath,
  library,
  accessToken,
}: {
  practice: Practice;
  basePath: string;
  library: LearningLibrary;
  accessToken?: string;
}) {
  const Icon = practiceIcons[practice.id] || Calculator;
  const accent = practiceAccents[practice.id] || 'cyan';
  return (
    <div className={`manual-learning learning-detail-page tone-${accent}`}>
      <Breadcrumb basePath={basePath} items={[{ label: practice.title }]} />
      <section className="learning-practice-hero">
        <span className="learning-practice-hero-icon">
          <Icon size={23} />
        </span>
        <div>
          <span className="learning-eyebrow">{(practice.category || 'PRÁCTICA INTERACTIVA').toUpperCase()}</span>
          <h2>{practice.title}</h2>
          <p>{practice.description}</p>
        </div>
        <span className="learning-practice-duration">
          <Clock3 size={14} /> {practice.duration}
        </span>
      </section>
      <LearningPractice id={practice.id} accessToken={accessToken} checklists={library.checklists} />
      <div className="learning-back-row">
        <Link to={basePath}>
          <ArrowLeft size={15} /> Volver al manual
        </Link>
        <Link to={`${basePath}/practicas/quiz`}>Pase de pruebas</Link>
      </div>
    </div>
  );
}

function ContentFallback({
  basePath,
  loading,
  error,
  onRetry,
}: {
  basePath: string;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="manual-learning learning-content-state">
      <div className="learning-empty" role={error ? 'alert' : 'status'}>
        <ShieldCheck size={18} />
        <span>
          {loading
            ? 'Cargando los manuales internos desde tu sesión segura…'
            : error || 'No pudimos cargar el contenido protegido del manual.'}
        </span>
        {!loading && (
          <button type="button" className="learning-secondary-button" onClick={onRetry}>
            <RotateCcw size={14} /> Reintentar carga
          </button>
        )}
        <Link className="learning-text-link" to={basePath}>
          <ArrowLeft size={14} /> Ir al inicio del manual
        </Link>
      </div>
    </div>
  );
}

export function ManualLearningPage({ area = 'operations' }: { area?: 'operations' | 'admin' }) {
  const { pathname } = useLocation();
  const { session } = useAuth();
  const basePath = area === 'admin' ? '/admin/manual-aprendizaje' : '/operaciones/manual-aprendizaje';
  const route = resolveLearningRoute(pathname, basePath);
  const accessToken = session?.access_token as string | undefined;

  const [library, setLibrary] = useState<LearningLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [readIds, setReadIds] = useState<string[]>(loadReadIds);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await fetchLearningResource<LearningLibrary>('library', accessToken);
      setLibrary(next);
    } catch (err: any) {
      setError(err?.message || 'Inicia sesión con un perfil autorizado para leer el manual interno.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const toggleRead = useCallback((id: string) => {
    setReadIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      saveReadIds(next);
      return next;
    });
  }, []);

  let body: React.ReactNode;
  if (!library) {
    body = <ContentFallback basePath={basePath} loading={loading} error={error} onRetry={loadLibrary} />;
  } else if (route.type === 'home') {
    body = <Home basePath={basePath} library={library} readIds={readIds} />;
  } else if (route.type === 'area') {
    const foundArea = library.areas.find((item) => item.id === route.id);
    body = foundArea ? (
      <AreaPage area={foundArea} basePath={basePath} library={library} readIds={readIds} />
    ) : (
      <ContentFallback basePath={basePath} loading={false} error="No encontramos el área solicitada." onRetry={loadLibrary} />
    );
  } else if (route.type === 'guide') {
    const foundGuide = library.guides.find((item) => item.id === route.id);
    body = foundGuide ? (
      <GuideReader
        guide={foundGuide}
        basePath={basePath}
        library={library}
        readIds={readIds}
        onToggleRead={toggleRead}
      />
    ) : (
      <ContentFallback basePath={basePath} loading={false} error="No encontramos la guía solicitada." onRetry={loadLibrary} />
    );
  } else if (route.type === 'practice') {
    const foundPractice = library.practices.find((item) => item.id === route.id);
    body = foundPractice ? (
      <PracticePage practice={foundPractice} basePath={basePath} library={library} accessToken={accessToken} />
    ) : (
      <ContentFallback basePath={basePath} loading={false} error="No encontramos la herramienta solicitada." onRetry={loadLibrary} />
    );
  } else {
    body = <ContentFallback basePath={basePath} loading={false} error="Ruta del manual no reconocida." onRetry={loadLibrary} />;
  }

  return (
    <AppFrame area={area}>
      <PageHeading
        eyebrow="EQUIPO Y CAPACITACIÓN"
        title="Manual y aprendizaje"
        description="Guías visuales por rol, estándares de producción, seguridad en máquina y herramientas de práctica."
      />
      {body}
    </AppFrame>
  );
}
