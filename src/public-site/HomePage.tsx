import { lazy, Suspense, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView, useReducedMotion, useSpring } from 'motion/react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Compass,
  Eye,
  Layers,
  Lightbulb,
  MapPin,
  MessageCircle,
  Palette,
  PanelsTopLeft,
  Printer,
  ScanLine,
  Scissors,
  Shirt,
  Sparkles,
  Store,
} from 'lucide-react';
import { useWorkspace } from '../app/workspace';
import {
  AnimatedShinyText,
  BorderBeam,
  DotPattern,
  Marquee,
  PulsingBeacon,
  SpotlightLayer,
  WordRotate,
  clearSpotlight,
  updateSpotlight,
} from '../components/ui/MagicComponents';
import { Dialog, DialogCallout } from '../components/ui/DialogSystem';
import {
  creativePillars,
  projectOrientatorGoals,
  publicAddress,
  serviceDeliverableTags,
  serviceDetailContent,
  serviceProjectPrompts,
  type PublicServiceId,
} from './content';
import './home-page.css';
import { EnvironmentBrandingMatrix, PanoramicCategoryStrips } from './SolutionsComponents';

const Highlights = lazy(() => import('./ShowcasePages').then((module) => ({ default: module.HomeContentHighlights })));

const serviceIcons: Record<string, typeof Printer> = {
  impresion: Printer,
  'gran-formato': PanelsTopLeft,
  rotulos: Store,
  textil: Shirt,
  corte: Scissors,
  eventos: ScanLine,
};

const pillarIcons = {
  'diseno-marca': Palette,
  'publicidad-espacios': Store,
  'marketing-activaciones': Layers,
};

const process = [
  {
    title: 'Una idea, una conversación.',
    short: 'Nos cuentas',
    text: 'Cuéntanos qué quieres comunicar, para quién y dónde se verá. Una referencia, una foto del espacio o un boceto son un buen comienzo.',
    detail: 'Tu objetivo · Tu espacio · Tus referencias',
    Icon: MessageCircle,
  },
  {
    title: 'Le damos forma contigo.',
    short: 'Lo definimos',
    text: 'Revisamos las medidas, las cantidades, el diseño y las posibilidades de producción. Te orientamos para definir los detalles antes de avanzar.',
    detail: 'Diseño gráfico · Formato · Materiales · Cantidades',
    Icon: Lightbulb,
  },
  {
    title: 'Un siguiente paso claro.',
    short: 'Lo coordinamos',
    text: 'Confirmamos contigo el alcance, los valores y los tiempos de tu solicitud. Así puedes decidir con claridad cómo continuar con tu proyecto.',
    detail: 'Alcance · Cotización · Producción',
    Icon: Check,
  },
];

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: reduceMotion ? 0 : 0.65, delay: reduceMotion ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function VisualitoStage({ onOpenOrientator }: { onOpenOrientator: () => void }) {
  const reduceMotion = useReducedMotion();
  const rotateX = useSpring(0, { stiffness: 110, damping: 25 });
  const rotateY = useSpring(0, { stiffness: 110, damping: 25 });
  const reset = () => {
    rotateX.set(0);
    rotateY.set(0);
  };
  useEffect(() => {
    if (reduceMotion) {
      rotateX.jump(0);
      rotateY.jump(0);
    }
  }, [reduceMotion, rotateX, rotateY]);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    rotateX.set((0.5 - (event.clientY - bounds.top) / bounds.height) * 5);
    rotateY.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 7);
  };

  return (
    <div className="home-stage" onPointerMove={move} onPointerLeave={reset} onPointerCancel={reset}>
      <DotPattern width={26} height={26} className="home-stage-dots" glow />
      <div className="home-stage-glow" aria-hidden="true" />
      <motion.div className="home-stage-scene" style={{ rotateX, rotateY }}>
        <div className="home-stage-ring" aria-hidden="true" />
        <span className="home-stage-word" aria-hidden="true">
          CREA.
        </span>
        <div className="home-stage-floor" aria-hidden="true" />
        <motion.img
          className="home-visualito"
          src="/public-site/visualito-hero.webp"
          alt="Visualito, la mascota de Visual Corp"
          width={720}
          height={1080}
          fetchPriority="high"
          initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.95, ease: [0.22, 1, 0.36, 1] }}
        />
        <button type="button" className="home-stage-note home-stage-note-interactive" onClick={onOpenOrientator}>
          <Sparkles size={17} aria-hidden="true" />
          <span>
            <strong>¿No sabes por dónde empezar?</strong>
            <small>Usa el orientador rápido →</small>
          </span>
        </button>
        <span className="home-stage-label">
          <span className="home-color-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          DISEÑO · PUBLICIDAD · PRODUCCIÓN
        </span>
      </motion.div>
      <div className="home-stage-caption">
        <span>VISUALITO / ESTUDIO CREATIVO & TALLER</span>
        <span>
          MILAGRO, ECUADOR <ArrowUpRight size={13} />
        </span>
      </div>
    </div>
  );
}

function CreativeStudioSection({
  services,
  onOpenOrientator,
}: {
  services: Array<{ id: string; name: string; description: string }>;
  onOpenOrientator: (serviceId?: PublicServiceId) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const activePillar = creativePillars[activeIndex] || creativePillars[0];
  const PillarIcon = pillarIcons[activePillar.id] || Palette;
  const matchedService = services.find((item) => item.id === activePillar.recommendedServiceId);
  const quoteHref = matchedService
    ? `/cotizador?servicio=${encodeURIComponent(matchedService.name)}`
    : '/cotizador';
  const tags = serviceDeliverableTags[activePillar.recommendedServiceId] || [];

  return (
    <section className="home-pillars home-section" aria-labelledby="home-pillars-title">
      <Reveal className="home-section-heading">
        <div>
          <span className="home-kicker">01 / DISEÑO GRÁFICO, PUBLICIDAD Y MARKETING</span>
          <h2 id="home-pillars-title">
            Un solo equipo.
            <br />
            <span>De la idea al proyecto.</span>
          </h2>
        </div>
        <div>
          <p>
            Coordinamos dirección gráfica, comunicación comercial y producción según el alcance de cada proyecto.
          </p>
          <button type="button" className="home-text-link home-text-button" onClick={() => onOpenOrientator(activePillar.recommendedServiceId)}>
            Orientar mi proyecto paso a paso <Compass size={17} />
          </button>
        </div>
      </Reveal>

      <div className="home-pillars-layout">
        <div className="home-pillars-tabs" role="tablist" aria-label="Pilares de trabajo de Visual Corp">
          {creativePillars.map((pillar, index) => {
            const Icon = pillarIcons[pillar.id] || Sparkles;
            const isSelected = index === activeIndex;
            return (
              <button
                key={pillar.id}
                type="button"
                role="tab"
                id={`home-pillar-tab-${pillar.id}`}
                aria-selected={isSelected}
                aria-controls={`home-pillar-panel-${pillar.id}`}
                className={`home-pillar-tab${isSelected ? ' is-active' : ''}`}
                onClick={() => setActiveIndex(index)}
              >
                <span className="home-pillar-tab-mark">{pillar.mark}</span>
                <span className="home-pillar-tab-icon">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="home-pillar-tab-copy">
                  <small>{pillar.badge}</small>
                  <strong>{pillar.title}</strong>
                </span>
                <ArrowUpRight className="home-pillar-tab-arrow" size={18} aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <div
          className="home-pillar-showcase vc-magic-card"
          role="tabpanel"
          id={`home-pillar-panel-${activePillar.id}`}
          aria-labelledby={`home-pillar-tab-${activePillar.id}`}
          onPointerMove={updateSpotlight}
          onPointerLeave={clearSpotlight}
        >
          <SpotlightLayer />
          <BorderBeam />
          <motion.div
            key={activePillar.id}
            className="home-pillar-showcase-inner"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.3 }}
          >
            <div className="home-pillar-showcase-top">
              <span className="home-pillar-badge">
                <PillarIcon size={16} aria-hidden="true" />
                {activePillar.badge}
              </span>
              <span className="home-pillar-index" aria-hidden="true">
                {activePillar.mark}
              </span>
            </div>

            <h3>{activePillar.title}</h3>
            <p className="home-pillar-summary">{activePillar.summary}</p>

            <div className="home-pillar-capabilities" aria-label="Alcance de este pilar">
              {activePillar.capabilities.map((item) => (
                <div key={item} className="home-pillar-capability">
                  <Check size={16} aria-hidden="true" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            {tags.length > 0 && (
              <div className="home-pillar-tags-block">
                <small>SOLUCIONES FRECUENTES EN ESTA LÍNEA</small>
                <div className="home-pillar-tags">
                  {tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="home-pillar-actions">
              <Link className="home-button home-button-primary vc-shimmer-button" to={quoteHref}>
                {activePillar.ctaLabel} <ArrowUpRight size={17} />
              </Link>
              <Link className="home-button home-button-secondary" to={`/servicios/${activePillar.recommendedServiceId}`}>
                Ver especialidad <ArrowRight size={16} />
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function ProcessSection({ onOpenOrientator }: { onOpenOrientator: () => void }) {
  const [active, setActive] = useState(0);
  const reduceMotion = useReducedMotion();
  const { title, text, detail, Icon } = process[active];
  return (
    <section className="home-process home-section" aria-labelledby="home-process-title">
      <Reveal className="home-section-heading">
        <div>
          <span className="home-kicker">03 / CÓMO TRABAJAMOS</span>
          <h2 id="home-process-title">
            Una buena idea.
            <br />
            <span>Un camino claro.</span>
          </h2>
        </div>
        <p>No necesitas llegar con todo resuelto. Empezamos por escucharte y revisar contigo la mejor alternativa.</p>
      </Reveal>
      <div className="home-process-grid">
        <div className="home-process-options" role="group" aria-label="Explora nuestro proceso">
          {process.map((step, index) => (
            <button
              key={step.short}
              type="button"
              className={active === index ? 'is-active' : ''}
              aria-pressed={active === index}
              aria-controls="home-process-detail"
              onClick={() => setActive(index)}
            >
              <span>0{index + 1}</span>
              <b>{step.short}</b>
              <ArrowUpRight size={21} aria-hidden="true" />
            </button>
          ))}
          <div className="home-process-links">
            <Link className="home-text-link" to="/como-trabajamos">
              Conoce nuestro proceso <ArrowRight size={17} />
            </Link>
            <button type="button" className="home-text-link home-text-button" onClick={onOpenOrientator}>
              ¿Qué datos preparar? <Sparkles size={16} />
            </button>
          </div>
        </div>
        <div className="home-process-panel" id="home-process-detail" aria-live="polite" aria-atomic="true">
          <motion.div
            key={active}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.3 }}
          >
            <div className="home-process-panel-top">
              <span className="home-process-icon">
                <Icon size={32} strokeWidth={1.4} aria-hidden="true" />
              </span>
              <span className="home-process-number" aria-hidden="true">
                0{active + 1}
              </span>
            </div>
            <h3>{title}</h3>
            <p>{text}</p>
            <div className="home-process-detail">{detail}</div>
            <div className="home-process-location-strip">
              <MapPin size={15} aria-hidden="true" />
              <span>Atención directa en {publicAddress}</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export function PublicHomePage() {
  const { data } = useWorkspace();
  const services = data.services.filter((service: { enabled: boolean }) => service.enabled);
  const contentRef = useRef<HTMLDivElement>(null);
  const showContent = useInView(contentRef, { once: true, margin: '300px' });
  const title = String(data.settings.heroTitle || 'Hacemos visible lo que imaginas.').trim();
  const words = title.split(/\s+/);
  const lastWord = words.pop();

  const [orientatorOpen, setOrientatorOpen] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string>(projectOrientatorGoals[0].id);
  const [previewServiceId, setPreviewServiceId] = useState<PublicServiceId | null>(null);

  useEffect(() => {
    document.title = 'Inicio · Visual Corp';
  }, []);

  const openOrientatorForService = (serviceId?: PublicServiceId) => {
    if (serviceId) {
      const matchingGoal = projectOrientatorGoals.find((goal) => goal.serviceId === serviceId);
      if (matchingGoal) setSelectedGoalId(matchingGoal.id);
    }
    setOrientatorOpen(true);
  };

  const openOrientatorForGoal = (goalId: string) => {
    setSelectedGoalId(goalId);
    setOrientatorOpen(true);
  };

  const activeGoal = projectOrientatorGoals.find((goal) => goal.id === selectedGoalId) || projectOrientatorGoals[0];
  const recommendedService =
    services.find((item: { id: string }) => item.id === activeGoal.serviceId) ||
    services[0] || { id: activeGoal.serviceId, name: 'Impresión y papelería', description: '' };
  const secondaryService = services.find((item: { id: string }) => item.id === activeGoal.secondaryServiceId);
  const activeGoalDetails = serviceDetailContent[activeGoal.serviceId];
  const activeGoalTags = serviceDeliverableTags[activeGoal.serviceId] || [];

  const previewService = previewServiceId
    ? services.find((item: { id: string }) => item.id === previewServiceId)
    : null;
  const previewDetails = previewServiceId ? serviceDetailContent[previewServiceId] : null;
  const previewTags = previewServiceId ? serviceDeliverableTags[previewServiceId] || [] : [];

  return (
    <div className="vc-home">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-inner">
          <div className="home-hero-copy">
            <Reveal>
              <span className="home-kicker">
                <PulsingBeacon size={8} color="#27d5ec" />
                <AnimatedShinyText shimmerWidth={120}>{data.settings.heroEyebrow}</AnimatedShinyText>
              </span>
            </Reveal>
            <Reveal delay={0.05}>
              <div className="home-discipline-rotator" aria-label="Especialidades principales de Visual Corp">
                <span className="home-rotator-label">Especialistas en:</span>
                <WordRotate
                  words={[
                    'Rótulos & Fachadas Comerciales',
                    'Diseño Gráfico & Identidad',
                    'Publicidad & Gran Formato',
                    'Brandeo de Vehículos',
                    'Stands & Eventos Corporativos',
                    'Textil & Promocionales',
                  ]}
                  duration={2800}
                  className="home-rotator-words"
                />
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 id="home-title">
                {words.join(' ')} <span>{lastWord}</span>
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="home-hero-description">{data.settings.heroText}</p>
              <div className="home-actions">
                <Link className="home-button home-button-primary vc-shimmer-button" to="/cotizador">
                  Cuéntanos tu idea <ArrowUpRight size={19} />
                </Link>
                <button
                  type="button"
                  className="home-button home-button-orientator"
                  onClick={() => setOrientatorOpen(true)}
                >
                  <Compass size={17} aria-hidden="true" />
                  Orientar mi proyecto
                </button>
                <a className="home-button home-button-secondary" href="#servicios">
                  Explorar servicios <ArrowDown size={18} />
                </a>
              </div>
            </Reveal>
            <Reveal delay={0.22}>
              <div className="home-goal-strip" aria-label="Accesos rápidos según tu objetivo">
                <span className="home-goal-strip-label">
                  <Sparkles size={13} aria-hidden="true" /> ¿Qué necesita tu marca hoy?
                </span>
                <div className="home-goal-chips">
                  {projectOrientatorGoals.slice(0, 4).map((goal) => (
                    <button
                      key={goal.id}
                      type="button"
                      className="home-goal-chip"
                      onClick={() => openOrientatorForGoal(goal.id)}
                    >
                      {goal.label}
                      <ArrowUpRight size={13} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.26}>
              <div className="home-hero-proof">
                <span>
                  <Check size={15} />
                  Atención directa en Milagro
                </span>
                <span>
                  <Check size={15} />
                  Diseño y coordinación según proyecto
                </span>
                <span>
                  <Check size={15} />
                  Cotización guiada por proyecto
                </span>
              </div>
            </Reveal>
          </div>
          <VisualitoStage onOpenOrientator={() => setOrientatorOpen(true)} />
        </div>
        <div className="home-hero-footer">
          <span>
            <MapPin size={14} /> MILAGRO, ECUADOR · {publicAddress.toUpperCase()}
          </span>
          <a href="#servicios">
            UNA IDEA. MUCHAS POSIBILIDADES. <ArrowDown size={15} />
          </a>
          <span className="home-footer-index" aria-hidden="true">
            01 — 04
          </span>
        </div>
      </section>

      {services.length > 0 && (
        <Marquee
          items={[
            ...services.map((service: { name: string }) => service.name),
            'Diseño gráfico comercial',
            'Identidad para negocios',
            'Montaje o instalación según el alcance del proyecto',
          ]}
          label="Familias de trabajo disponibles"
          className="home-service-marquee"
          duration={38}
        />
      )}

      <CreativeStudioSection services={services} onOpenOrientator={openOrientatorForService} />

      <section className="home-services home-section" id="servicios" aria-labelledby="home-services-title">
        <Reveal className="home-section-heading">
          <div>
            <span className="home-kicker">02 / LO QUE PODEMOS CREAR</span>
            <h2 id="home-services-title">
              Tu marca.
              <br />
              <span>En todas sus formas.</span>
            </h2>
          </div>
          <div>
            <p>
              Del papel a los espacios comerciales. Explora cada familia de trabajo o abre una vista rápida para saber qué preparar antes de cotizar.
            </p>
            <div className="home-heading-actions">
              <Link className="home-text-link" to="/servicios">
                Todos los servicios <ArrowUpRight size={17} />
              </Link>
              <button type="button" className="home-text-link home-text-button" onClick={() => setOrientatorOpen(true)}>
                Ayúdame a elegir <Compass size={16} />
              </button>
            </div>
          </div>
        </Reveal>

        <div className={`home-services-grid${services.length === 6 ? ' is-bento' : ''}`}>
          {services.map((service: { id: string; name: string; description: string }, index: number) => {
            const Icon = serviceIcons[service.id] || Sparkles;
            const isFeatured = services.length === 6 && (index === 0 || index === 5);
            const tags = serviceDeliverableTags[service.id as PublicServiceId] || [];
            return (
              <Reveal key={service.id} className={isFeatured ? 'home-service-featured' : ''} delay={(index % 3) * 0.06}>
                <div className="home-service-card-wrap">
                  <Link
                    to={`/servicios/${encodeURIComponent(service.id)}`}
                    className={`home-service home-service-${service.id} vc-magic-card`}
                    onPointerMove={updateSpotlight}
                    onPointerLeave={clearSpotlight}
                  >
                    <SpotlightLayer />
                    {isFeatured && <BorderBeam />}
                    <div className="home-service-top">
                      <span className="home-service-number">{String(index + 1).padStart(2, '0')}</span>
                      <span className="home-service-arrow" aria-hidden="true">
                        <ArrowUpRight size={21} />
                      </span>
                    </div>
                    <div className="home-service-art" aria-hidden="true">
                      <i />
                      <Icon size={66} strokeWidth={1.1} />
                      <span />
                    </div>
                    <div className="home-service-copy">
                      <h3>{service.name}</h3>
                      <p>{service.description}</p>
                      {tags.length > 0 && (
                        <ul className="home-service-tags" aria-label={`Piezas habituales en ${service.name}`}>
                          {tags.map((tag) => (
                            <li key={tag}>{tag}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <span className="home-service-link">
                      Explorar especialidad <ArrowRight size={16} />
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="home-service-quickview"
                    aria-label={`Vista rápida de ${service.name}`}
                    onClick={() => setPreviewServiceId(service.id as PublicServiceId)}
                  >
                    <Eye size={14} aria-hidden="true" />
                    <span>Vista rápida</span>
                  </button>
                </div>
              </Reveal>
            );
          })}
        </div>

        {services.length === 0 && (
          <p className="home-service-empty">
            Estamos actualizando nuestros servicios. <Link to="/contacto">Cuéntanos qué necesitas.</Link>
          </p>
        )}

        <div className="home-services-note">
          <span>
            <Sparkles size={17} /> ¿Tienes un proyecto que combina varias especialidades (diseño + fachada + impresos)?
          </span>
          <div className="home-services-note-actions">
            <button type="button" className="home-text-link home-text-button" onClick={() => setOrientatorOpen(true)}>
              Usar orientador de proyecto <Compass size={16} />
            </button>
            <Link to="/contacto">
              La conversamos contigo <ArrowUpRight size={17} />
            </Link>
          </div>
        </div>
      </section>

      <EnvironmentBrandingMatrix compact />

      <PanoramicCategoryStrips />

      <ProcessSection onOpenOrientator={() => setOrientatorOpen(true)} />

      <Reveal className="home-discover">
        <div>
          <span className="home-kicker">SIGUE EXPLORANDO</span>
          <h2>
            Encuentra tu
            <br />
            próxima idea.
          </h2>
        </div>
        <Link to="/tienda">
          <span className="home-discover-icon">
            <Store size={25} />
          </span>
          <div>
            <h3>Explora la tienda</h3>
            <p>Descubre productos personalizables y arma tu lista para cotizar.</p>
          </div>
          <ArrowUpRight size={24} />
        </Link>
        <Link to="/portafolio">
          <span className="home-discover-icon">
            <PanelsTopLeft size={25} />
          </span>
          <div>
            <h3>Conoce nuestro trabajo</h3>
            <p>Visita el portafolio de proyectos e ideas visuales de Visual Corp.</p>
          </div>
          <ArrowUpRight size={24} />
        </Link>
      </Reveal>

      <div ref={contentRef} className="home-published-content">
        {showContent && (
          <Suspense fallback={null}>
            <Highlights />
          </Suspense>
        )}
      </div>

      <section className="home-contact home-section" aria-labelledby="home-contact-title">
        <Reveal>
          <span className="home-kicker">04 / HAGAMOS QUE SUCEDA</span>
          <h2 id="home-contact-title">
            Lo próximo que se vea
            <br />
            puede ser <span>tu marca.</span>
          </h2>
          <p>
            Una idea, una pregunta o un proyecto por empezar.
            <br />
            Estamos en {publicAddress} para escucharte.
          </p>
          <div className="home-actions">
            <Link className="home-button home-button-primary vc-shimmer-button" to="/cotizador">
              Empezar mi proyecto <ArrowUpRight size={20} />
            </Link>
            <Link className="home-button home-button-secondary" to="/contacto">
              Hablar con el equipo <MessageCircle size={18} />
            </Link>
          </div>
          <span className="home-contact-signature">VISUAL CORP · CREATIVIDAD QUE TOMA FORMA · MILAGRO, ECUADOR</span>
        </Reveal>
      </section>

      {/* Modal 1: Orientador Rápido de Proyecto */}
      <Dialog
        open={orientatorOpen}
        onOpenChange={setOrientatorOpen}
        size="lg"
        tone="brand"
        magicBorder
        eyebrow="ORIENTADOR DE PROYECTO · VISUAL CORP"
        badge="Guía interactiva"
        icon={<Compass size={22} />}
        title="¿Qué quieres lograr con tu marca hoy?"
        description="Elige el objetivo que mejor describa tu necesidad. Te mostraremos la familia de trabajo recomendada y los 3 datos que ayudan a cotizar más rápido."
        footer={
          <>
            <Link
              className="vc-dialog-btn vc-dialog-btn-ghost"
              to={`/servicios/${activeGoal.serviceId}`}
              onClick={() => setOrientatorOpen(false)}
            >
              Ver detalles de la especialidad
            </Link>
            <Link
              className="vc-dialog-btn vc-dialog-btn-primary"
              to={`/cotizador?servicio=${encodeURIComponent(recommendedService.name)}`}
              onClick={() => setOrientatorOpen(false)}
            >
              Preparar cotización de {recommendedService.name} <ArrowUpRight size={16} />
            </Link>
          </>
        }
      >
        <div className="home-orientator-body">
          <div className="home-orientator-goals" role="radiogroup" aria-label="Selecciona el objetivo de tu proyecto">
            {projectOrientatorGoals.map((goal) => {
              const isSelected = goal.id === activeGoal.id;
              return (
                <button
                  key={goal.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`home-orientator-goal${isSelected ? ' is-selected' : ''}`}
                  onClick={() => setSelectedGoalId(goal.id)}
                >
                  <strong>{goal.label}</strong>
                  <small>{goal.subtitle}</small>
                </button>
              );
            })}
          </div>

          <div className="home-orientator-result">
            <div className="home-orientator-result-header">
              <div>
                <span className="home-orientator-kicker">ESPECIALIDAD RECOMENDADA</span>
                <h4>{recommendedService.name}</h4>
              </div>
              {secondaryService && (
                <span className="home-orientator-secondary">
                  Complementa con: <b>{secondaryService.name}</b>
                </span>
              )}
            </div>
            <p className="home-orientator-why">{activeGoal.why}</p>

            {activeGoalTags.length > 0 && (
              <div className="home-orientator-tags">
                {activeGoalTags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}

            {activeGoalDetails && (
              <div className="home-orientator-checklist">
                <strong>Qué puedes compartirnos para empezar:</strong>
                <ul>
                  {activeGoalDetails.checklist.map((item) => (
                    <li key={item}>
                      <Check size={15} aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <DialogCallout tone="info">
              <b>Revisión personalizada por proyecto:</b> No necesitas tener el diseño listo. Materiales, medidas, disponibilidad, valores y tiempos se confirman contigo al revisar tu solicitud.
            </DialogCallout>
          </div>
        </div>
      </Dialog>

      {/* Modal 2: Vista Rápida de Especialidad desde el Bento Grid */}
      <Dialog
        open={Boolean(previewService && previewDetails)}
        onOpenChange={(next) => !next && setPreviewServiceId(null)}
        size="md"
        tone="brand"
        magicBorder
        eyebrow="VISTA RÁPIDA · ESPECIALIDAD"
        badge="Visual Corp"
        icon={
          previewService
            ? (() => {
                const PreviewIcon = serviceIcons[previewService.id] || Sparkles;
                return <PreviewIcon size={22} />;
              })()
            : undefined
        }
        title={previewService?.name || 'Especialidad'}
        description={previewDetails?.headline}
        footer={
          previewService ? (
            <>
              <Link
                className="vc-dialog-btn vc-dialog-btn-ghost"
                to={`/servicios/${previewService.id}`}
                onClick={() => setPreviewServiceId(null)}
              >
                Abrir página completa <ArrowRight size={15} />
              </Link>
              <Link
                className="vc-dialog-btn vc-dialog-btn-primary"
                to={`/cotizador?servicio=${encodeURIComponent(previewService.name)}`}
                onClick={() => setPreviewServiceId(null)}
              >
                Cotizar {previewService.name} <ArrowUpRight size={16} />
              </Link>
            </>
          ) : undefined
        }
      >
        {previewService && previewDetails && (
          <div className="home-preview-body">
            <p className="home-preview-intro">{previewDetails.introduction}</p>

            {previewTags.length > 0 && (
              <div className="home-orientator-tags">
                {previewTags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}

            <div className="home-preview-columns">
              <div className="home-orientator-checklist">
                <strong>¿Cuándo elegir esta familia?</strong>
                <ul>
                  {previewDetails.situations.map((situation) => (
                    <li key={situation}>
                      <Sparkles size={15} aria-hidden="true" />
                      <span>{situation}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="home-orientator-checklist">
                <strong>Datos útiles para cotizar:</strong>
                <ul>
                  {previewDetails.checklist.map((item) => (
                    <li key={item}>
                      <Check size={15} aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <DialogCallout tone="brand">
              <b>¿Cómo empezamos?</b> {serviceProjectPrompts[previewService.id as PublicServiceId] || previewDetails.preparation}
            </DialogCallout>
          </div>
        )}
      </Dialog>
    </div>
  );
}
