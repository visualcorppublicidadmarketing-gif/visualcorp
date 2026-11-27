import { useEffect, useRef, useState, lazy, Suspense, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useInView, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Compass,
  Eye,
  Layers,
  Lightbulb,
  MapPin,
  MessageCircle,
  PanelsTopLeft,
  Printer,
  ScanLine,
  Scissors,
  Send,
  Shirt,
  Sparkles,
  Store,
} from 'lucide-react';
import { useWorkspace } from '../app/workspace';
import { Card } from '../components/ui/card';
import {
  SpotlightLayer,
  clearSpotlight,
  updateSpotlight,
} from '../components/ui/MagicComponents';
import {
  GlassButton,
  GlassCard,
  GlassFormField,
  GlassPill,
} from '../components/ui/GlassPanel';
import { Dialog, DialogCallout } from '../components/ui/DialogSystem';
import {
  PlanetaryHorizonArc,
  SculptedWaveDivider,
} from '../components/ui/GlassWaveEffects';
import {
  projectOrientatorGoals,
  publicAddress,
  serviceDeliverableTags,
  serviceDetailContent,
  serviceProjectPrompts,
  serviceShowcaseContent,
  type PublicServiceId,
} from './content';
import { ServiceKeycap, getServiceKeycapColor } from './ServiceKeycap';
import './home-page.css';
import { HomeFilm } from './HomeFilm';
import { AmbientVideoLayer } from './AmbientVideoLayer';
import { PageMeta } from './seo';
import { brandingEnvironments } from './solutionsCatalog';

const Highlights = lazy(() => import('./ShowcasePages').then((module) => ({ default: module.HomeContentHighlights })));

const serviceIcons: Record<string, typeof Printer> = {
  impresion: Printer,
  'gran-formato': PanelsTopLeft,
  rotulos: Store,
  textil: Shirt,
  corte: Scissors,
  eventos: ScanLine,
};

const serviceCardDescriptions: Record<string, string> = {
  impresion: 'Impresión para tu marca.',
  'gran-formato': 'Gráfica para destacar a lo grande.',
  rotulos: 'Haz visible tu negocio.',
  textil: 'Prendas que llevan tu marca.',
  corte: 'Corte preciso para tus ideas.',
  eventos: 'Exhibiciones que presentan tu marca.',
};

const orbitalServices: Array<{ id: PublicServiceId; name: string }> = [
  { id: 'impresion', name: 'Impresión' },
  { id: 'corte', name: 'Corte Láser' },
  { id: 'rotulos', name: 'Rótulos' },
  { id: 'gran-formato', name: 'Gran Formato' },
  { id: 'textil', name: 'Textil' },
  { id: 'eventos', name: 'Eventos' },
];

const conceptVisualByService: Record<PublicServiceId, string> = {
  impresion: 'apple-print',
  corte: 'lego-laser',
  rotulos: 'starbucks-signage',
  'gran-formato': 'coca-cola-wide-format',
  textil: 'nike-textile',
  eventos: 'netflix-events',
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
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: reduceMotion ? 0 : 0.65, delay: reduceMotion ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
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
  const serviceTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const backgroundVideoRef = useRef<HTMLVideoElement>(null);
  const reduceMotion = useReducedMotion();
  const activeService = orbitalServices[activeIndex] || orbitalServices[0];
  const showcase = serviceShowcaseContent[activeService.id];
  const ServiceIcon = serviceIcons[activeService.id] || Sparkles;
  const matchedService = services.find((item) => item.id === activeService.id);
  const quoteHref = matchedService
    ? `/cotizador?servicio=${encodeURIComponent(matchedService.name)}`
    : '/cotizador';
  const tags = serviceDeliverableTags[activeService.id] || [];

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;

    const video = backgroundVideoRef.current;
    if (!video) return;
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let isVisible = false;

    const syncPlayback = () => {
      if (isVisible && !motionPreference.matches) void video.play().catch(() => undefined);
      else video.pause();
    };

    if (typeof IntersectionObserver === 'undefined') {
      isVisible = true;
      syncPlayback();
      motionPreference.addEventListener('change', syncPlayback);
      return () => {
        motionPreference.removeEventListener('change', syncPlayback);
        video.pause();
      };
    }

    const observer = new IntersectionObserver((entries) => {
      isVisible = entries.some((entry) => entry.isIntersecting);
      syncPlayback();
    }, { threshold: 0.01 });

    observer.observe(video);
    motionPreference.addEventListener('change', syncPlayback);
    return () => {
      observer.disconnect();
      motionPreference.removeEventListener('change', syncPlayback);
      video.pause();
    };
  }, [reduceMotion]);

  const handleServiceKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = orbitalServices.length - 1;
    let nextIndex: number;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (index + 1) % orbitalServices.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (index - 1 + orbitalServices.length) % orbitalServices.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = lastIndex;
        break;
      default:
        return;
    }

    event.preventDefault();
    setActiveIndex(nextIndex);
    serviceTabRefs.current[nextIndex]?.focus();
  };

  return (
    <section className="home-pillars home-section" aria-labelledby="home-pillars-title">
      <div className="home-pillars-video-layer" aria-hidden="true">
        <video
          ref={backgroundVideoRef}
          className="home-pillars-video"
          muted
          playsInline
          loop
          preload="none"
          poster="/public-site/home-film/apertura.webp"
          tabIndex={-1}
        >
          <source src="/public-site/home-film/visualcorp-432p.mp4" type="video/mp4" />
        </video>
        <span className="home-pillars-video-scrim" />
      </div>

      <Reveal className="home-section-heading">
        <div>
          <span className="home-kicker">02 / DISEÑO GRÁFICO, PUBLICIDAD Y MARKETING</span>
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
          <button type="button" className="home-text-link home-text-button" onClick={() => onOpenOrientator(activeService.id)}>
            Orientar mi proyecto paso a paso <Compass size={17} />
          </button>
        </div>
      </Reveal>

      <div className="home-orbital-fan">
        <div className="home-orbital-fan-track" aria-hidden="true">
          <div className="home-orbital-fan-arc" />
        </div>
        <div className="home-orbital-fan-items" role="tablist" aria-label="Especialidades de producción">
          {orbitalServices.map((service, index) => {
            const isSelected = activeIndex === index;
            const Icon = serviceIcons[service.id] || Sparkles;
            return (
              <button
                key={service.id}
                type="button"
                role="tab"
                id={`home-service-tab-${service.id}`}
                aria-selected={isSelected}
                aria-controls="home-service-panel"
                tabIndex={isSelected ? 0 : -1}
                ref={(element) => {
                  serviceTabRefs.current[index] = element;
                }}
                onKeyDown={(event) => handleServiceKeyDown(event, index)}
                className={`home-orbital-node vc-glass-clear${isSelected ? ' is-active' : ''}`}
                onClick={() => setActiveIndex(index)}
              >
                <span className="home-orbital-node-icon" aria-hidden="true">
                  <Icon size={16} />
                </span>
                <span>{service.name}</span>
                <span className="home-orbital-node-badge">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="home-pillars-brand-disclaimer">
        Las marcas y logotipos son referencias visuales conceptuales; no representan clientes, proyectos realizados ni colaboraciones de Visual Corp.
      </p>

      <div className="home-pillars-layout">
        <Card
          className="home-pillar-visual home-glass-card vc-magic-card vc-glass-blur"
          aria-label={`Maqueta visual conceptual para ${activeService.name}`}
          onPointerMove={updateSpotlight}
          onPointerLeave={clearSpotlight}
        >
          <SpotlightLayer />
          <motion.div
            key={`visual-${activeService.id}`}
            className="home-pillar-visual-inner"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.42 }}
          >
            <span className="home-pillar-concept-label">Maqueta conceptual · {showcase.conceptBrand}</span>
            <picture>
              <source
                srcSet={`/public-site/service-visuals/concept-brands/${conceptVisualByService[activeService.id]}.webp`}
                type="image/webp"
              />
              <img
                src={`/public-site/service-visuals/concept-brands/${conceptVisualByService[activeService.id]}.png`}
                alt={showcase.imageAlt}
                width="1254"
                height="1254"
                loading="lazy"
                decoding="async"
              />
            </picture>
            {!reduceMotion && (
              <div className="home-pillar-pixel-reveal" aria-hidden="true">
                {Array.from({ length: 24 }, (_, index) => (
                  <span key={index} style={{ animationDelay: `${((index * 7) % 24) * 18}ms` }} />
                ))}
              </div>
            )}
            <div className="home-pillar-visual-footer">
              <span className="home-pillar-visual-icon"><ServiceIcon size={19} aria-hidden="true" /></span>
              <span>
                <small>REFERENCIA DE {activeService.name.toLocaleUpperCase('es-EC')}</small>
                <strong>Una aplicación visual para imaginar el resultado.</strong>
              </span>
              <ArrowUpRight size={18} aria-hidden="true" />
            </div>
          </motion.div>
        </Card>

        <Card
          className="home-pillar-showcase home-glass-card vc-magic-card vc-glass-blur"
          role="tabpanel"
          id="home-service-panel"
          aria-labelledby={`home-service-tab-${activeService.id}`}
          tabIndex={0}
          onPointerMove={updateSpotlight}
          onPointerLeave={clearSpotlight}
        >
          <SpotlightLayer />
          <motion.div
            key={activeService.id}
            className="home-pillar-showcase-inner"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.3 }}
          >
            <div className="home-pillar-showcase-top">
              <span className="home-pillar-badge">
                <ServiceIcon size={16} aria-hidden="true" />
                {showcase.badge}
              </span>
              <span className="home-pillar-index" aria-hidden="true">
                {String(activeIndex + 1).padStart(2, '0')}
              </span>
            </div>

            <h3>{showcase.title}</h3>
            <p className="home-pillar-summary">{showcase.summary}</p>

            <div className="home-pillar-capabilities" aria-label={`Alcance de ${activeService.name}`}>
              {showcase.capabilities.map((item) => (
                <div key={item} className="home-pillar-capability">
                  <Check size={16} aria-hidden="true" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            {tags.length > 0 && (
              <div className="home-pillar-tags-block">
                <small>PIEZAS QUE PODEMOS CONVERSAR</small>
                <div className="home-pillar-tags">
                  {tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="home-pillar-actions">
              <Link className="home-button home-button-primary" to={quoteHref}>
                Cotizar {activeService.name} <ArrowUpRight size={17} />
              </Link>
              <Link className="home-button home-button-secondary" to={`/servicios/${activeService.id}`}>
                Ver especialidad <ArrowRight size={16} />
              </Link>
            </div>
          </motion.div>
        </Card>
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
        <Card className="home-process-panel home-glass-card vc-glass-blur" id="home-process-detail" aria-live="polite" aria-atomic="true">
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
        </Card>
      </div>
    </section>
  );
}

export function PublicHomePage() {
  const { data } = useWorkspace();
  const navigate = useNavigate();
  const services = data.services.filter((service: { enabled: boolean }) => service.enabled);
  const contentRef = useRef<HTMLDivElement>(null);
  const showContent = useInView(contentRef, { once: true, margin: '300px' });

  const [orientatorOpen, setOrientatorOpen] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string>(projectOrientatorGoals[0].id);
  const goalRadioRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [previewServiceId, setPreviewServiceId] = useState<PublicServiceId | null>(null);
  const [quickIdea, setQuickIdea] = useState('');
  const [quickService, setQuickService] = useState<string>('');

  const handleQuickLaunchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (quickService) params.set('servicio', quickService);
    const trimmed = quickIdea.trim();
    if (trimmed) params.set('producto', trimmed);
    const query = params.toString();
    navigate(query ? `/cotizador?${query}` : '/cotizador');
  };

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

  const handleGoalKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (index + 1) % projectOrientatorGoals.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (index - 1 + projectOrientatorGoals.length) % projectOrientatorGoals.length;
        break;
      default:
        return;
    }

    event.preventDefault();
    setSelectedGoalId(projectOrientatorGoals[nextIndex].id);
    goalRadioRefs.current[nextIndex]?.focus();
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
      <PageMeta
        title="Inicio"
        description="Visual Corp en Milagro, Ecuador: diseño gráfico, impresión, rótulos, gran formato, corte láser, textil y soluciones visuales para tu marca."
        path="/"
      />
      <HomeFilm
        eyebrow={data.settings.heroEyebrow?.trim() || 'Agencia de publicidad y marketing'}
        title={data.settings.heroTitle?.trim() || 'Hacemos visible lo que imaginas.'}
        description={data.settings.heroText?.trim() || 'Diseño, producción y marketing para marcas que quieren ocupar su espacio.'}
      />

      <section className="home-project-entry" aria-labelledby="home-project-title">
        <div className="home-project-entry-inner">
          <Reveal>
            <div className="home-project-heading">
              <div>
                <h2 id="home-project-title">¿Qué quieres crear?</h2>
                <p>Elige qué necesita tu marca y descubre qué preparar para cotizar.</p>
              </div>
              <button type="button" className="home-text-link home-text-button" onClick={() => setOrientatorOpen(true)}>
                Abrir el orientador <Compass size={17} aria-hidden="true" />
              </button>
            </div>
            <div className="home-project-grid">
              {projectOrientatorGoals.slice(0, 4).map((goal) => {
                const Icon = serviceIcons[goal.serviceId];
                return (
                  <GlassCard
                    as="button"
                    key={goal.id}
                    type="button"
                    variant="card"
                    radius="md"
                    padding="md"
                    glow="brand"
                    interactive
                    spotlight
                    className="home-project-card"
                    onClick={() => openOrientatorForGoal(goal.id)}
                  >
                    <Icon size={22} strokeWidth={1.7} aria-hidden="true" />
                    <ArrowUpRight size={17} aria-hidden="true" />
                    <strong>{goal.label}</strong>
                    <small>{goal.subtitle}</small>
                  </GlassCard>
                );
              })}
            </div>
          </Reveal>
        </div>
      </section>

      <SculptedWaveDivider variant="hero-to-light" />

      <section className="home-services home-section" id="servicios" aria-labelledby="home-services-title" tabIndex={-1}>
        <Reveal className="home-section-heading">
          <div>
            <span className="home-kicker">01 / LO QUE PODEMOS CREAR</span>
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

        <div className="home-services-grid">
          {services.map((service: { id: string; name: string; description: string }, index: number) => {
            const serviceId = service.id as PublicServiceId;
            const keycapColor = getServiceKeycapColor(serviceId);
            return (
              <Reveal key={service.id} delay={(index % 3) * 0.06}>
                <Card className="home-service-card-wrap home-glass-card vc-glass-frosted">
                  <Link
                    to={`/servicios/${encodeURIComponent(service.id)}`}
                    className={`home-service home-service-${service.id} vc-magic-card vc-glass-frosted`}
                    onPointerMove={updateSpotlight}
                    onPointerLeave={clearSpotlight}
                  >
                    <SpotlightLayer />
                    <div className="home-service-top">
                      <span className="home-service-number">{String(index + 1).padStart(2, '0')}</span>
                      <span className="home-service-arrow" aria-hidden="true">
                        <ArrowUpRight size={21} />
                      </span>
                    </div>
                    <div className="home-service-art is-originkit-keyboard" style={{ color: keycapColor }} aria-hidden="true">
                      <ServiceKeycap serviceId={serviceId} className="home-service-keycap-stage" interactive />
                    </div>
                    <div className="home-service-copy">
                      <h3>{service.name}</h3>
                      <p>{serviceCardDescriptions[service.id] || service.description}</p>
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
                </Card>
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

      {/* Divisor de onda esculpido (getwaves.io style): Services -> Dark Creative Studio */}
      <SculptedWaveDivider variant="light-to-dark" />

      <CreativeStudioSection services={services} onOpenOrientator={openOrientatorForService} />

      <section className="home-solutions-teaser home-section" aria-labelledby="home-solutions-teaser-title">
        <Reveal className="home-section-heading">
          <div>
            <span className="home-kicker">SOLUCIONES POR ESPACIO</span>
            <h2 id="home-solutions-teaser-title">
              Ideas listas para
              <br />
              <span>cada punto de contacto.</span>
            </h2>
          </div>
          <div>
            <p>
              Reunimos el catálogo visual completo de 38 referencias y tiras panorámicas en Soluciones para que compares por espacio sin alargar este recorrido.
            </p>
            <Link className="home-text-link" to="/soluciones">
              Explorar Soluciones por espacio <ArrowUpRight size={17} />
            </Link>
          </div>
        </Reveal>

        <div className="home-solutions-bento">
          {brandingEnvironments.map((env, index) => (
            <GlassCard
              as={Link}
              key={env.id}
              to={`/soluciones#catalogo-visual`}
              variant="card"
              radius="lg"
              padding="md"
              glow={index % 2 === 0 ? 'brand' : 'cyan'}
              interactive
              spotlight
              className="home-solutions-bento-card"
            >
              <div className="home-solutions-bento-media">
                <img src={env.primaryImage} alt={`${env.title} — referencia conceptual`} loading="lazy" decoding="async" />
                <span className="home-solutions-bento-index">0{index + 1}</span>
              </div>
              <div className="home-solutions-bento-copy">
                <h3>{env.title}</h3>
                <p>{env.subtitle}</p>
                <span className="home-solutions-bento-link">
                  Ver en Soluciones <ArrowUpRight size={15} aria-hidden="true" />
                </span>
              </div>
            </GlassCard>
          ))}
        </div>
      </section>

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
        {/* Arco planetario luminoso de horizonte atmosférico (WebAngles style) */}
        <PlanetaryHorizonArc className="home-contact-arc" />

        {/* Divisor con muesca esculpida central y medallón de marca (Payrot style) */}
        <div className="home-contact-notch-wrap">
          <SculptedWaveDivider variant="notch-portal">
            <div className="home-contact-notch-emblem" aria-hidden="true">
              <Sparkles size={22} />
            </div>
          </SculptedWaveDivider>
        </div>

        <Reveal className="home-contact-stage">
          <GlassCard
            variant="card"
            radius="xl"
            padding="xl"
            glow="brand"
            sheen
            spotlight
            className="home-contact-portal has-ambient-video"
          >
            <AmbientVideoLayer clip="silk" variant="home-portal" playbackRate={0.7} />
            <div className="home-contact-head">
              <GlassPill dot dotColor="cyan">
                04 · HAGAMOS QUE SUCEDA
              </GlassPill>

              <h2 id="home-contact-title">
                Lo próximo que se vea
                <br />
                puede ser <span className="home-contact-aurora">tu marca.</span>
              </h2>

              <p className="home-contact-lead">
                Una idea, una pregunta o un proyecto por empezar.
                <br />
                Estamos en <strong>{publicAddress}</strong> para escucharte.
              </p>

              <div className="home-contact-actions">
                <GlassButton tone="primary" size="lg" to="/cotizador">
                  <span>Empezar mi proyecto</span>
                  <ArrowUpRight size={19} aria-hidden="true" />
                </GlassButton>
                <GlassButton tone="glass" size="lg" to="/contacto">
                  <span>Hablar con el equipo</span>
                  <MessageCircle size={18} aria-hidden="true" />
                </GlassButton>
                <GlassButton tone="glass" size="lg" onClick={() => setOrientatorOpen(true)}>
                  <span>Orientar mi idea</span>
                  <Compass size={18} aria-hidden="true" />
                </GlassButton>
              </div>
            </div>

            <div className="home-contact-bento">
              <GlassCard
                as="form"
                variant="veil"
                radius="lg"
                padding="md"
                glow="cyan"
                className="home-contact-quickform"
                onSubmit={handleQuickLaunchSubmit}
              >
                <div className="home-contact-quickform-top">
                  <GlassPill icon={<Sparkles size={12} />}>
                    INICIO RÁPIDO DE PROYECTO
                  </GlassPill>
                  <span className="home-contact-quickform-tag">Paso 01 / Brief</span>
                </div>

                <div className="home-contact-chip-row" role="group" aria-label="Especialidad sugerida">
                  {services.slice(0, 6).map((svc: { id: string; name: string }) => {
                    const isSelected = quickService === svc.name;
                    return (
                      <GlassButton
                        key={svc.id}
                        type="button"
                        tone={isSelected ? 'accent' : 'glass'}
                        size="sm"
                        aria-pressed={isSelected}
                        onClick={() => setQuickService((prev) => (prev === svc.name ? '' : svc.name))}
                      >
                        {svc.name}
                      </GlassButton>
                    );
                  })}
                </div>

                <div className="home-contact-form-row">
                  <GlassFormField
                    label="¿Qué tienes en mente crear o cotizar?"
                    placeholder="Ej. Rótulo luminoso para fachada, 200 tarjetas o camisetas para mi equipo..."
                    value={quickIdea}
                    onChange={(event) => setQuickIdea(event.target.value)}
                    icon={<Lightbulb size={16} />}
                  />
                  <GlassButton type="submit" tone="accent" size="md" className="home-contact-submit">
                    <span>Continuar al cotizador</span>
                    <Send size={15} aria-hidden="true" />
                  </GlassButton>
                </div>
              </GlassCard>

              <div className="home-contact-cards">
                <GlassCard
                  as={Link}
                  to="/contacto#contacto-ubicacion"
                  variant="veil"
                  radius="lg"
                  padding="md"
                  glow="magenta"
                  interactive
                  className="home-contact-mini-card"
                >
                  <span className="home-contact-mini-icon">
                    <MapPin size={19} aria-hidden="true" />
                  </span>
                  <div className="home-contact-mini-copy">
                    <small>ESTUDIO & ATENCIÓN DIRECTA</small>
                    <strong>{publicAddress}</strong>
                    <span>Ver mapa e indicaciones en Milagro</span>
                  </div>
                  <ArrowUpRight size={18} className="home-contact-mini-arrow" aria-hidden="true" />
                </GlassCard>

                <GlassCard
                  as={Link}
                  to="/como-trabajamos"
                  variant="veil"
                  radius="lg"
                  padding="md"
                  glow="cyan"
                  interactive
                  className="home-contact-mini-card"
                >
                  <span className="home-contact-mini-icon is-cyan">
                    <Layers size={19} aria-hidden="true" />
                  </span>
                  <div className="home-contact-mini-copy">
                    <small>DISEÑO, IMPRESIÓN Y MONTAJE</small>
                    <strong>Un solo equipo de principio a fin</strong>
                    <span>Revisa cómo coordinamos tu proyecto</span>
                  </div>
                  <ArrowUpRight size={18} className="home-contact-mini-arrow" aria-hidden="true" />
                </GlassCard>
              </div>
            </div>

            <span className="home-contact-signature">
              VISUAL CORP · CREATIVIDAD QUE TOMA FORMA · MILAGRO, ECUADOR
            </span>
          </GlassCard>
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
            {projectOrientatorGoals.map((goal, index) => {
              const isSelected = goal.id === activeGoal.id;
              return (
                <button
                  key={goal.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  data-autofocus={isSelected ? '' : undefined}
                  tabIndex={isSelected ? 0 : -1}
                  ref={(element) => {
                    goalRadioRefs.current[index] = element;
                  }}
                  onKeyDown={(event) => handleGoalKeyDown(event, index)}
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
