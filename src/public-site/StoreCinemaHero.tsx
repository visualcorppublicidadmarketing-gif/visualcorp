import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import NumberFlow from '@number-flow/react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  ClipboardList,
  Layers,
  Search,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { BorderBeam, SpotlightLayer, clearSpotlight, updateSpotlight } from '../components/ui/MagicComponents';
import './store-cinema.css';

export type StoreHeroPreviewProduct = {
  id: string;
  slug: string;
  name: string;
  category?: string | null;
  image: string | null;
};

const ORB_VIDEO = {
  src: '/public-site/ambient-videos/store-liquid-orb-720p.mp4',
  poster: '/public-site/ambient-videos/store-liquid-orb-poster.webp',
};

const DESKTOP_CINEMA_QUERY = '(min-width: 900px) and (min-height: 600px)';
const ACT_TWO_THRESHOLD = 0.46;
const EASE_CINEMA: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_EXIT: [number, number, number, number] = [0.4, 0, 1, 1];

function KineticReveal({
  children,
  delay = 0,
  reduce = false,
}: {
  children: ReactNode;
  delay?: number;
  reduce?: boolean;
}) {
  return (
    <span className="store-cinema-line">
      <motion.span
        className="store-cinema-line-inner"
        initial={reduce ? false : { y: '105%', opacity: 0 }}
        animate={{ y: '0%', opacity: 1 }}
        exit={reduce ? undefined : { y: '-45%', opacity: 0, transition: { duration: 0.2, ease: EASE_EXIT } }}
        transition={{ duration: reduce ? 0 : 0.62, delay: reduce ? 0 : delay, ease: EASE_CINEMA }}
      >
        {children}
      </motion.span>
    </span>
  );
}

export function StoreCinemaHero({
  productsCount,
  categories,
  featuredPreview,
  loading,
  search,
  searchInputRef,
  onSearchChange,
  onOpenProduct,
  onSelectCategory,
  onOpenSouvenirs,
  onScrollToCatalog,
}: {
  productsCount: number;
  categories: Array<[string, number]>;
  featuredPreview: StoreHeroPreviewProduct[];
  loading: boolean;
  search: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onSearchChange: (value: string) => void;
  onOpenProduct: (product: StoreHeroPreviewProduct) => void;
  onSelectCategory: (name: string) => void;
  onOpenSouvenirs: () => void;
  onScrollToCatalog: () => void;
}) {
  const trackRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const progressRef = useRef(0);
  const smoothProgressRef = useRef(0);
  const isScrubbingRef = useRef(false);

  const prefersReducedMotion = useReducedMotion();
  const [isDesktopCinema, setIsDesktopCinema] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia(DESKTOP_CINEMA_QUERY).matches;
  });
  const [motionAllowed, setMotionAllowed] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [activeAct, setActiveAct] = useState<0 | 1>(0);

  const shouldLoadVideo = motionAllowed && !prefersReducedMotion && !videoFailed;
  const isScrubTrack = shouldLoadVideo && isDesktopCinema && videoReady;

  useEffect(() => {
    const desktopQuery = window.matchMedia(DESKTOP_CINEMA_QUERY);
    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection;

    const syncEnvironment = () => {
      setIsDesktopCinema(desktopQuery.matches);
      setMotionAllowed(!reducedQuery.matches && !connection?.saveData);
    };

    syncEnvironment();
    desktopQuery.addEventListener('change', syncEnvironment);
    reducedQuery.addEventListener('change', syncEnvironment);
    connection?.addEventListener?.('change', syncEnvironment);

    return () => {
      desktopQuery.removeEventListener('change', syncEnvironment);
      reducedQuery.removeEventListener('change', syncEnvironment);
      connection?.removeEventListener?.('change', syncEnvironment);
    };
  }, []);

  const markVideoReady = useCallback(() => {
    setVideoReady(true);
  }, []);

  // Catch cached video ready state on mount
  useEffect(() => {
    if (!shouldLoadVideo) return;
    const player = videoRef.current;
    if (!player) return;
    if (player.readyState >= 2 || (player.readyState >= 1 && Number.isFinite(player.duration) && player.duration > 0)) {
      setVideoReady(true);
    }
  }, [shouldLoadVideo]);

  // Ambient slow-motion playback when on mobile / non-scrub mode OR at scroll top
  useEffect(() => {
    const player = videoRef.current;
    if (!player || !shouldLoadVideo || isScrubTrack) return;

    player.playbackRate = 0.6;
    let isVisible = true;

    const syncPlay = () => {
      if (isVisible && !document.hidden) {
        player.playbackRate = 0.6;
        void player.play().catch(() => undefined);
      } else {
        player.pause();
      }
    };

    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              isVisible = entries.some((entry) => entry.isIntersecting);
              syncPlay();
            },
            { threshold: 0.05 },
          )
        : null;

    observer?.observe(player);
    syncPlay();
    document.addEventListener('visibilitychange', syncPlay);

    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', syncPlay);
      player.pause();
    };
  }, [shouldLoadVideo, isScrubTrack]);

  // Desktop dual-mode choreography: slow ambient life at scroll 0, silky damped scroll-scrubbing on scroll
  useEffect(() => {
    const section = trackRef.current;
    const sticky = stageRef.current;
    const player = videoRef.current;
    if (!isScrubTrack || !section || !sticky || !player) {
      setActiveAct(0);
      return;
    }

    let rafId = 0;
    let targetProgress = 0;
    let desiredTime = 0;
    let lastDrawn = -1;

    const computeProgress = () => {
      const distance = section.offsetHeight - sticky.offsetHeight;
      if (distance <= 0) return 0;
      const scrolled = -section.getBoundingClientRect().top;
      return Math.min(1, Math.max(0, scrolled / distance));
    };

    const seekPlayer = () => {
      if (document.hidden || player.seeking) return;
      if (!Number.isFinite(player.duration) || player.duration <= 0) return;
      const maxFrame = Math.max(0, player.duration - 1 / 24);
      const clamped = Math.min(maxFrame, Math.max(0, desiredTime));
      if (Math.abs(player.currentTime - clamped) < 1 / 36) return;
      player.currentTime = clamped;
    };

    const enterAmbientIdle = () => {
      if (!isScrubbingRef.current && !player.paused) return;
      isScrubbingRef.current = false;
      player.playbackRate = 0.55;
      if (!document.hidden) void player.play().catch(() => undefined);
    };

    const applyVisuals = (progress: number) => {
      sticky.style.setProperty('--store-progress', progress.toFixed(4));
      const nextAct: 0 | 1 = progress >= ACT_TWO_THRESHOLD ? 1 : 0;
      setActiveAct((current) => (current === nextAct ? current : nextAct));
    };

    const tick = () => {
      rafId = 0;
      if (document.hidden) return;

      const delta = targetProgress - smoothProgressRef.current;
      if (Math.abs(delta) < 0.0005) {
        smoothProgressRef.current = targetProgress;
      } else {
        smoothProgressRef.current += delta * 0.14;
      }

      const current = smoothProgressRef.current;
      progressRef.current = current;

      if (Math.abs(current - lastDrawn) >= 0.00035) {
        lastDrawn = current;
        applyVisuals(current);

        if (current < 0.012 && targetProgress < 0.012) {
          enterAmbientIdle();
        } else if (Number.isFinite(player.duration) && player.duration > 0) {
          if (!isScrubbingRef.current) {
            isScrubbingRef.current = true;
            player.pause();
          }
          // Map scroll [0..1] cleanly across 100% of the 20s morphing liquid-glass sculpture
          desiredTime = current * Math.max(0, player.duration - 1 / 24);
          seekPlayer();
        }
      }

      if (Math.abs(targetProgress - smoothProgressRef.current) >= 0.0005) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const schedule = () => {
      if (!rafId && !document.hidden) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const handleScroll = () => {
      targetProgress = computeProgress();
      schedule();
    };

    const handleSeeked = () => {
      if (isScrubbingRef.current && Math.abs(player.currentTime - desiredTime) >= 1 / 30) {
        seekPlayer();
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        player.pause();
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
      } else {
        handleScroll();
      }
    };

    targetProgress = computeProgress();
    smoothProgressRef.current = targetProgress;
    progressRef.current = targetProgress;
    applyVisuals(targetProgress);

    if (targetProgress < 0.012) {
      enterAmbientIdle();
    } else if (Number.isFinite(player.duration) && player.duration > 0) {
      isScrubbingRef.current = true;
      player.pause();
      desiredTime = targetProgress * Math.max(0, player.duration - 1 / 24);
      seekPlayer();
    }

    const resizeObserver = new ResizeObserver(handleScroll);
    resizeObserver.observe(section);
    player.addEventListener('seeked', handleSeeked);
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      player.removeEventListener('seeked', handleSeeked);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      document.removeEventListener('visibilitychange', handleVisibility);
      player.pause();
    };
  }, [isScrubTrack]);

  // Subtle clamped pointer parallax on fine-pointer desktops
  const handleStagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || !motionAllowed || event.pointerType !== 'mouse') return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
    const ny = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
    stage.style.setProperty('--orb-mx', Math.max(-1, Math.min(1, nx)).toFixed(3));
    stage.style.setProperty('--orb-my', Math.max(-1, Math.min(1, ny)).toFixed(3));
  };

  const handleStagePointerLeave = () => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.style.setProperty('--orb-mx', '0');
    stage.style.setProperty('--orb-my', '0');
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onScrollToCatalog();
  };

  const reduce = Boolean(prefersReducedMotion || !motionAllowed);
  const topFamilies = categories.slice(0, 5);
  const visibleAct: 0 | 1 = isScrubTrack ? activeAct : 0;

  return (
    <section
      ref={trackRef}
      className={`store-cinema-hero${isScrubTrack ? ' is-cinematic' : ' is-static'}`}
      aria-labelledby="store-title"
    >
      <div
        ref={stageRef}
        className="store-cinema-stage"
        style={{ '--store-progress': 0, '--orb-mx': 0, '--orb-my': 0 } as CSSProperties}
        onPointerMove={handleStagePointerMove}
        onPointerLeave={handleStagePointerLeave}
      >
        {/* Full-bleed obsidian liquid-glass sculpture video layer */}
        <div className="store-cinema-media" aria-hidden="true">
          <img
            className="store-cinema-poster"
            src={ORB_VIDEO.poster}
            alt=""
            width={1280}
            height={720}
            decoding="async"
          />
          {shouldLoadVideo && (
            <video
              ref={videoRef}
              className={`store-cinema-video${videoReady ? ' is-ready' : ''}`}
              src={ORB_VIDEO.src}
              poster={ORB_VIDEO.poster}
              muted
              playsInline
              loop
              preload="auto"
              tabIndex={-1}
              onLoadedData={markVideoReady}
              onCanPlay={markVideoReady}
              onError={() => setVideoFailed(true)}
            />
          )}
          <div className="store-cinema-aura" />
          <div className="store-cinema-scrim" />
          <div className="store-cinema-grain" />
        </div>

        {/* Main Choreographed Stage Content */}
        <div className="store-cinema-content">
          <AnimatePresence mode="wait" initial={false}>
            {visibleAct === 0 ? (
              <motion.div
                key="store-act-1"
                className="store-cinema-act store-cinema-act-opening"
                initial={reduce ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -22, scale: 0.985, transition: { duration: 0.28, ease: EASE_EXIT } }}
                transition={{ duration: reduce ? 0 : 0.55, ease: EASE_CINEMA }}
              >
                <div className="store-cinema-copy">
                  <span className="store-cinema-badge">
                    <span className="store-cinema-badge-dot" aria-hidden="true" />
                    <ShoppingBag size={13} aria-hidden="true" />
                    TIENDA VISUAL CORP · CATÁLOGO OFICIAL
                  </span>

                  <h1 id="store-title" className="store-cinema-title">
                    <KineticReveal delay={0.02} reduce={reduce}>
                      Tu próxima idea
                    </KineticReveal>
                    <KineticReveal delay={0.1} reduce={reduce}>
                      <em>empieza aquí.</em>
                    </KineticReveal>
                  </h1>

                  <p className="store-cinema-lead">
                    Encuentra productos personalizables para tu marca, evento o negocio. Reúne tus opciones y prepara una cotización en un solo paso.
                  </p>

                  <form className="store-cinema-search-form" onSubmit={handleSearchSubmit} role="search">
                    <label className="storefront-search store-cinema-search">
                      <Search size={18} aria-hidden="true" />
                      <input
                        ref={searchInputRef}
                        aria-label="Buscar productos en la tienda"
                        type="search"
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Busca camisetas, tazas, tarjetas, letreros…"
                        autoComplete="off"
                      />
                      <kbd>Ctrl K</kbd>
                      {search ? (
                        <button type="button" aria-label="Borrar búsqueda" onClick={() => onSearchChange('')}>
                          <X size={15} aria-hidden="true" />
                        </button>
                      ) : (
                        <button type="submit" className="store-cinema-search-go" aria-label="Ir a los resultados del catálogo">
                          <ArrowRight size={15} aria-hidden="true" />
                        </button>
                      )}
                    </label>
                  </form>

                  <div className="store-cinema-actions">
                    <a
                      className="store-cinema-btn store-cinema-btn-primary"
                      href="#catalogo-productos"
                      onClick={(event) => {
                        event.preventDefault();
                        onScrollToCatalog();
                      }}
                    >
                      <span>Explorar catálogo</span>
                      <ArrowDown size={17} aria-hidden="true" />
                    </a>
                    <Link className="store-cinema-btn store-cinema-btn-glass" to="/contacto">
                      <span>Quiero orientación</span>
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                  </div>

                  <div className="store-cinema-stats" aria-label="Resumen de la tienda">
                    <span>
                      <strong>
                        {loading ? '…' : productsCount > 0 ? <NumberFlow value={productsCount} /> : 'Catálogo'}
                      </strong>
                      <small>{productsCount > 0 ? 'productos publicados' : 'en actualización'}</small>
                    </span>
                    <i aria-hidden="true" />
                    <span>
                      <strong>
                        {loading ? '…' : categories.length > 0 ? <NumberFlow value={categories.length} /> : 'A medida'}
                      </strong>
                      <small>{categories.length > 0 ? 'familias activas' : 'cantidades al cotizar'}</small>
                    </span>
                    <i aria-hidden="true" />
                    <span>
                      <strong>Milagro</strong>
                      <small>atención directa</small>
                    </span>
                  </div>
                </div>

                {/* 3D Floating Optical-Glass Featured Product Showcase */}
                <div className="store-cinema-showcase" aria-label="Una muestra destacada del catálogo">
                  <div className="store-cinema-showcase-ring store-cinema-showcase-ring-1" aria-hidden="true" />
                  <div className="store-cinema-showcase-ring store-cinema-showcase-ring-2" aria-hidden="true" />

                  {featuredPreview.length > 0 ? (
                    <div className="store-cinema-cards-orbit">
                      {featuredPreview.map((product, index) => (
                        <button
                          key={product.id}
                          type="button"
                          className={`store-cinema-card store-cinema-card-${index + 1} vc-magic-card`}
                          onClick={() => onOpenProduct(product)}
                          onPointerMove={updateSpotlight}
                          onPointerLeave={clearSpotlight}
                          aria-label={`Ver detalles de ${product.name}`}
                        >
                          <SpotlightLayer />
                          {index === 0 && <BorderBeam size={86} duration={9} colorFrom="#38d6ff" colorTo="#e5007e" />}
                          <span className="store-cinema-card-thumb">
                            {product.image ? (
                              <img src={product.image} alt="" loading="eager" />
                            ) : (
                              <ShoppingBag size={24} aria-hidden="true" />
                            )}
                          </span>
                          <span className="store-cinema-card-foot">
                            <span className="store-cinema-card-name">{product.name}</span>
                            <span className="store-cinema-card-mark">0{index + 1}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="store-cinema-placeholder">
                      <Sparkles size={28} aria-hidden="true" />
                      <span>Ideas en movimiento</span>
                    </div>
                  )}

                  <span className="store-cinema-vertical-tag" aria-hidden="true">
                    CATÁLOGO · {loading || productsCount === 0 ? 'VISUAL CORP' : `${productsCount} OPCIONES`}
                  </span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="store-act-2"
                className="store-cinema-act store-cinema-act-command"
                initial={reduce ? false : { opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? undefined : { opacity: 0, y: -18, scale: 0.98, transition: { duration: 0.24, ease: EASE_EXIT } }}
                transition={{ duration: reduce ? 0 : 0.52, ease: EASE_CINEMA }}
              >
                <div
                  className="store-cinema-command-deck vc-magic-card"
                  onPointerMove={updateSpotlight}
                  onPointerLeave={clearSpotlight}
                >
                  <SpotlightLayer />
                  <BorderBeam size={110} duration={10} colorFrom="#38d6ff" colorTo="#ff4db8" />

                  <span className="store-cinema-badge">
                    <Sparkles size={13} aria-hidden="true" />
                    EXPERIENCIA DE COMPRA VISUAL CORP
                  </span>

                  <p className="store-cinema-act2-title" role="heading" aria-level={2}>
                    <KineticReveal delay={0.04} reduce={reduce}>
                      Explora, compara y
                    </KineticReveal>
                    <KineticReveal delay={0.11} reduce={reduce}>
                      <em>cotiza en una sola lista.</em>
                    </KineticReveal>
                  </p>

                  <div className="store-cinema-pillars" aria-label="Cómo funciona la tienda">
                    <span>
                      <Layers size={15} aria-hidden="true" />
                      Filtra por familia y uso
                    </span>
                    <span>
                      <ArrowLeftRight size={15} aria-hidden="true" />
                      Compara hasta 3 opciones
                    </span>
                    <span>
                      <ClipboardList size={15} aria-hidden="true" />
                      Envía tu lista al cotizador
                    </span>
                  </div>

                  {topFamilies.length > 0 && (
                    <div className="store-cinema-quick-families" role="group" aria-label="Acceso rápido por familia">
                      <button
                        type="button"
                        className="store-cinema-family-pill is-featured"
                        onClick={onOpenSouvenirs}
                      >
                        <Sparkles size={13} aria-hidden="true" />
                        Souvenirs personalizados
                        <ArrowUpRight size={13} aria-hidden="true" />
                      </button>
                      {topFamilies.map(([name, count]) => (
                        <button
                          key={name}
                          type="button"
                          className="store-cinema-family-pill"
                          onClick={() => {
                            onSelectCategory(name);
                            onScrollToCatalog();
                          }}
                        >
                          <span>{name}</span>
                          <small>{count}</small>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="store-cinema-act2-actions">
                    <button
                      type="button"
                      className="store-cinema-btn store-cinema-btn-primary"
                      onClick={onScrollToCatalog}
                    >
                      <span>Entrar al catálogo completo</span>
                      <ArrowDown size={17} aria-hidden="true" />
                    </button>
                    <Link className="store-cinema-btn store-cinema-btn-glass" to="/tienda/promociones">
                      <span>Ver promociones</span>
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Keep accessible H1 present even while Act II is focused */}
        {visibleAct !== 0 && (
          <h1 id="store-title" className="sr-only">
            Tienda Visual Corp — Tu próxima idea empieza aquí.
          </h1>
        )}

        {/* Bottom Scroll Cue + Edge Hairline Progress */}
        {isScrubTrack && (
          <>
            <a
              className={`store-cinema-scroll-cue${visibleAct === 1 ? ' is-faded' : ''}`}
              href="#catalogo"
              onClick={(event) => {
                event.preventDefault();
                onScrollToCatalog();
              }}
            >
              <span>Desliza para explorar</span>
              <i aria-hidden="true">↓</i>
            </a>
            <div className="store-cinema-edge-progress" aria-hidden="true">
              <span />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
