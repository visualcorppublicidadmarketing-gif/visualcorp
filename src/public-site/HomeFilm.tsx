import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowDown, ArrowUpRight, MapPin, Sparkles } from 'lucide-react';
import { GlassCard } from '../components/ui/GlassPanel';
import './home-film.css';

type FilmFormat = 'landscape' | 'portrait';

type FilmAsset = {
  src: string;
  poster: string;
  still: string;
  width: number;
  height: number;
  /** Progress thresholds [act1Start, act2Start, act3Start] tuned to each video's edit */
  thresholds: [number, number, number];
};

const FILM_DIR = '/public-site/home-film';

const FILM_ASSETS: Record<FilmFormat, FilmAsset> = {
  landscape: {
    src: `${FILM_DIR}/visualcorp-900p.mp4`,
    poster: `${FILM_DIR}/apertura.webp`,
    still: `${FILM_DIR}/visualito.webp`,
    width: 1600,
    height: 900,
    thresholds: [0.18, 0.47, 0.78],
  },
  portrait: {
    src: `${FILM_DIR}/visualcorp-portrait-720p.mp4`,
    poster: `${FILM_DIR}/apertura-portrait.webp`,
    still: `${FILM_DIR}/visualito-portrait.webp`,
    width: 720,
    height: 1280,
    thresholds: [0.17, 0.48, 0.81],
  },
};

const PORTRAIT_MEDIA_QUERY = '(max-width: 820px) and (orientation: portrait), (max-aspect-ratio: 9/10)';
const EASE_CINEMA: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_EXIT: [number, number, number, number] = [0.4, 0, 1, 1];

function getSceneMetrics(progress: number, thresholds: [number, number, number]) {
  const [t1, t2, t3] = thresholds;
  if (progress >= t3) {
    return { index: 3, local: Math.min(1, Math.max(0, (progress - t3) / Math.max(0.01, 1 - t3))) };
  }
  if (progress >= t2) {
    return { index: 2, local: Math.min(1, Math.max(0, (progress - t2) / Math.max(0.01, t3 - t2))) };
  }
  if (progress >= t1) {
    return { index: 1, local: Math.min(1, Math.max(0, (progress - t1) / Math.max(0.01, t2 - t1))) };
  }
  return { index: 0, local: Math.min(1, Math.max(0, progress / Math.max(0.01, t1))) };
}

function KineticLine({
  children,
  delay = 0,
  reduce = false,
}: {
  children: ReactNode;
  delay?: number;
  reduce?: boolean;
}) {
  return (
    <span className="home-film-line">
      <motion.span
        className="home-film-line-inner"
        initial={reduce ? false : { y: '108%', opacity: 0, rotateX: 12 }}
        animate={{ y: '0%', opacity: 1, rotateX: 0 }}
        exit={reduce ? undefined : { y: '-48%', opacity: 0, transition: { duration: 0.2, ease: EASE_EXIT } }}
        transition={{ duration: reduce ? 0 : 0.62, delay: reduce ? 0 : delay, ease: EASE_CINEMA }}
      >
        {children}
      </motion.span>
    </span>
  );
}

export function HomeFilm({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  const trackRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const progressRef = useRef(0);
  const smoothProgressRef = useRef(0);

  const prefersReducedMotion = useReducedMotion();

  const [format, setFormat] = useState<FilmFormat>(() => {
    if (typeof window === 'undefined') return 'landscape';
    return window.matchMedia(PORTRAIT_MEDIA_QUERY).matches ? 'portrait' : 'landscape';
  });
  const [motionAllowed, setMotionAllowed] = useState(true);
  const [readySource, setReadySource] = useState('');
  const [failedSources, setFailedSources] = useState<Record<string, boolean>>({});
  const [activeScene, setActiveScene] = useState(0);

  const film = FILM_ASSETS[format];
  const hasFailed = Boolean(failedSources[film.src]);
  const shouldLoadVideo = motionAllowed && !prefersReducedMotion && !hasFailed;
  const isCinematic = shouldLoadVideo && readySource === film.src;

  // Detect responsive aspect/width threshold to switch seamlessly between horizontal & vertical video
  useEffect(() => {
    const portraitQuery = window.matchMedia(PORTRAIT_MEDIA_QUERY);
    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection;

    const syncEnvironment = () => {
      setFormat(portraitQuery.matches ? 'portrait' : 'landscape');
      setMotionAllowed(!reducedQuery.matches && !connection?.saveData);
    };

    syncEnvironment();
    portraitQuery.addEventListener('change', syncEnvironment);
    reducedQuery.addEventListener('change', syncEnvironment);
    connection?.addEventListener?.('change', syncEnvironment);

    return () => {
      portraitQuery.removeEventListener('change', syncEnvironment);
      reducedQuery.removeEventListener('change', syncEnvironment);
      connection?.removeEventListener?.('change', syncEnvironment);
    };
  }, []);

  const markVideoReady = useCallback((source: string) => {
    setReadySource((current) => (current === source ? current : source));
    const player = videoRef.current;
    if (player && Number.isFinite(player.duration) && player.duration > 0) {
      const target = progressRef.current * Math.max(0, player.duration - 1 / 24);
      if (Math.abs(player.currentTime - target) > 0.05) {
        player.currentTime = target;
      }
    }
  }, []);

  // Guard against cached videos reaching readyState >= 2 before React attaches event listeners
  useEffect(() => {
    if (!shouldLoadVideo) return;
    const player = videoRef.current;
    if (!player) return;
    if (player.readyState >= 2 || (player.readyState >= 1 && Number.isFinite(player.duration) && player.duration > 0)) {
      markVideoReady(film.src);
    }
  }, [film.src, shouldLoadVideo, markVideoReady]);

  const applyProgressVisuals = useCallback(
    (progress: number) => {
      const sticky = stageRef.current;
      const { index, local } = getSceneMetrics(progress, film.thresholds);
      if (sticky) {
        sticky.style.setProperty('--film-progress', progress.toFixed(4));
        sticky.style.setProperty('--scene-local', local.toFixed(4));
      }
      setActiveScene((current) => (current === index ? current : index));
    },
    [film.thresholds],
  );

  // Smooth damped scroll-scrubbing loop with coalesced frame-accurate seeking
  useEffect(() => {
    const section = trackRef.current;
    const sticky = stageRef.current;
    const player = videoRef.current;
    if (!isCinematic || !section || !sticky || !player) return;

    let rafId = 0;
    let targetProgress = progressRef.current;
    let desiredTime = 0;
    let lastDrawnProgress = -1;

    const computeScrollProgress = () => {
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

    const tick = () => {
      rafId = 0;
      if (document.hidden) return;

      const delta = targetProgress - smoothProgressRef.current;
      if (Math.abs(delta) < 0.0005) {
        smoothProgressRef.current = targetProgress;
      } else {
        smoothProgressRef.current += delta * 0.16;
      }

      const current = smoothProgressRef.current;
      progressRef.current = current;

      if (Math.abs(current - lastDrawnProgress) >= 0.00035) {
        lastDrawnProgress = current;
        applyProgressVisuals(current);
        if (Number.isFinite(player.duration) && player.duration > 0) {
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
      targetProgress = computeScrollProgress();
      schedule();
    };

    // Synchronize immediately on mount or orientation switch
    targetProgress = computeScrollProgress();
    smoothProgressRef.current = targetProgress;
    progressRef.current = targetProgress;
    if (Number.isFinite(player.duration) && player.duration > 0) {
      desiredTime = targetProgress * Math.max(0, player.duration - 1 / 24);
      seekPlayer();
    }
    applyProgressVisuals(targetProgress);

    const resizeObserver = new ResizeObserver(handleScroll);
    resizeObserver.observe(section);
    resizeObserver.observe(sticky);

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    document.addEventListener('visibilitychange', schedule);
    player.addEventListener('seeked', seekPlayer);

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      document.removeEventListener('visibilitychange', schedule);
      player.removeEventListener('seeked', seekPlayer);
    };
  }, [isCinematic, film.src, applyProgressVisuals]);

  // Subtle fine-pointer ambient depth on desktop mice only
  useEffect(() => {
    const sticky = stageRef.current;
    if (!sticky || !motionAllowed || prefersReducedMotion) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let pointerRaf = 0;
    let nextX = 0;
    let nextY = 0;

    const flush = () => {
      pointerRaf = 0;
      sticky.style.setProperty('--film-px', nextX.toFixed(3));
      sticky.style.setProperty('--film-py', nextY.toFixed(3));
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const rect = sticky.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      nextX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
      nextY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
      if (!pointerRaf) pointerRaf = window.requestAnimationFrame(flush);
    };

    const onLeave = () => {
      nextX = 0;
      nextY = 0;
      if (!pointerRaf) pointerRaf = window.requestAnimationFrame(flush);
    };

    sticky.addEventListener('pointermove', onMove, { passive: true });
    sticky.addEventListener('pointerleave', onLeave);
    return () => {
      window.cancelAnimationFrame(pointerRaf);
      sticky.removeEventListener('pointermove', onMove);
      sticky.removeEventListener('pointerleave', onLeave);
      sticky.style.removeProperty('--film-px');
      sticky.style.removeProperty('--film-py');
    };
  }, [motionAllowed, prefersReducedMotion]);

  const words = title.trim().split(/\s+/);
  const accentWord = words.pop() || 'imaginas.';
  const leadingWords = words.join(' ');
  const isDefaultTitle = title.trim() === 'Hacemos visible lo que imaginas.';

  const reduce = Boolean(prefersReducedMotion || !motionAllowed);
  const isPortrait = format === 'portrait';
  const visibleScene = isCinematic ? activeScene : 0;

  return (
    <section
      className={`home-film${isCinematic ? ' is-cinematic' : ' is-static'}`}
      data-format={format}
      data-scene={visibleScene}
      ref={trackRef}
      aria-labelledby="home-title"
    >
      <div
        className="home-film-stage"
        ref={stageRef}
        style={{ '--film-progress': '0', '--scene-local': '0' } as CSSProperties}
      >
        {/* Full-bleed edge-to-edge background video (16:9 desktop / 9:16 mobile) */}
        <div className="home-film-media" aria-hidden="true">
          <img
            className="home-film-poster"
            src={shouldLoadVideo ? film.poster : film.still}
            alt=""
            width={film.width}
            height={film.height}
            fetchPriority="high"
            decoding="async"
          />
          {shouldLoadVideo && (
            <video
              key={film.src}
              ref={videoRef}
              className={`home-film-video${isCinematic ? ' is-ready' : ''}`}
              src={film.src}
              poster={film.poster}
              preload="auto"
              playsInline
              muted
              disablePictureInPicture
              onLoadedMetadata={() => markVideoReady(film.src)}
              onLoadedData={() => markVideoReady(film.src)}
              onCanPlay={() => markVideoReady(film.src)}
              onError={() => {
                setFailedSources((prev) => ({ ...prev, [film.src]: true }));
              }}
            />
          )}
        </div>

        {/* Calibrated cinema vignettes & grain */}
        <div className="home-film-scrim" aria-hidden="true" />
        <div className="home-film-grain" aria-hidden="true" />

        {/* Choreographed kinetic typography layer synced to the video */}
        <div className="home-film-overlay">
          <AnimatePresence mode="wait">
            {visibleScene === 0 && (
              <motion.div
                key="scene-0"
                className="home-film-scene home-film-scene-opening"
                initial={reduce ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -18, transition: { duration: 0.22, ease: EASE_EXIT } }}
                transition={{ duration: reduce ? 0 : 0.48, ease: EASE_CINEMA }}
              >
                <motion.div
                  className="home-film-pill"
                  initial={reduce ? false : { opacity: 0, y: 12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: reduce ? 0 : 0.45, delay: reduce ? 0 : 0.04, ease: EASE_CINEMA }}
                >
                  <span className="home-film-pill-dot" aria-hidden="true" />
                  <span>{eyebrow}</span>
                </motion.div>

                <h1 id="home-title" className="home-film-headline">
                  {isDefaultTitle ? (
                    <>
                      <KineticLine delay={0.08} reduce={reduce}>
                        Hacemos visible
                      </KineticLine>
                      <KineticLine delay={0.18} reduce={reduce}>
                        lo que <em className="home-film-aurora">imaginas.</em>
                      </KineticLine>
                    </>
                  ) : (
                    <KineticLine delay={0.08} reduce={reduce}>
                      {leadingWords}{' '}
                      <em className="home-film-aurora">{accentWord}</em>
                    </KineticLine>
                  )}
                </h1>

                <motion.p
                  className="home-film-lead"
                  initial={reduce ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.26, ease: EASE_CINEMA }}
                >
                  {description}
                </motion.p>

                <motion.div
                  className="home-film-actions"
                  initial={reduce ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduce ? 0 : 0.48, delay: reduce ? 0 : 0.34, ease: EASE_CINEMA }}
                >
                  <Link to="/cotizador" className="home-film-btn home-film-btn-primary">
                    <span>Solicitar cotización</span>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                  <a href="#servicios" className="home-film-btn home-film-btn-glass">
                    <span>Explorar servicios</span>
                    <ArrowDown size={17} aria-hidden="true" />
                  </a>
                </motion.div>

                {isCinematic && (
                  <motion.div
                    className="home-film-scroll-cue"
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduce ? 0 : 0.55, delay: reduce ? 0 : 0.46, ease: EASE_CINEMA }}
                    aria-hidden="true"
                  >
                    <span className="home-film-scroll-mouse">
                      <span />
                    </span>
                    <span>Desliza para descubrir</span>
                  </motion.div>
                )}
              </motion.div>
            )}

            {visibleScene === 1 && (
              <motion.div
                key={`scene-1-${format}`}
                className="home-film-scene home-film-scene-beat home-film-scene-left"
                initial={
                  reduce
                    ? false
                    : isPortrait
                      ? { opacity: 0, y: 34, scale: 0.96 }
                      : { opacity: 0, x: -28, y: 10 }
                }
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                exit={
                  reduce
                    ? undefined
                    : isPortrait
                      ? { opacity: 0, y: 20, scale: 0.97, transition: { duration: 0.2, ease: EASE_EXIT } }
                      : { opacity: 0, x: -18, transition: { duration: 0.2, ease: EASE_EXIT } }
                }
                transition={
                  reduce
                    ? { duration: 0 }
                    : isPortrait
                      ? { type: 'spring', stiffness: 250, damping: 26, mass: 0.85 }
                      : { duration: 0.46, ease: EASE_CINEMA }
                }
              >
                <GlassCard variant="card" radius="lg" padding="none" glow="brand" sheen forceDark className="home-film-beat-card">
                  <div className="home-film-beat-head">
                    <motion.span
                      className="home-film-beat-tag"
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: reduce ? 0 : 0.36, delay: reduce ? 0 : 0.04, ease: EASE_CINEMA }}
                    >
                      <Sparkles size={13} aria-hidden="true" />
                      01 · Identidad y diseño
                    </motion.span>
                    <span className="home-film-beat-step" aria-hidden="true">01 / 03</span>
                  </div>

                  <motion.span
                    className="home-film-beat-bar"
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: reduce ? 0 : 0.55, delay: reduce ? 0 : 0.12, ease: EASE_CINEMA }}
                    aria-hidden="true"
                  />

                  <p className="home-film-beat-title" role="heading" aria-level={2}>
                    <KineticLine delay={0.08} reduce={reduce}>
                      Marcas con
                    </KineticLine>
                    <KineticLine delay={0.16} reduce={reduce}>
                      <em className="home-film-aurora">carácter</em> propio
                    </KineticLine>
                  </p>

                  <motion.p
                    className="home-film-beat-copy"
                    initial={reduce ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduce ? 0 : 0.44, delay: reduce ? 0 : 0.22, ease: EASE_CINEMA }}
                  >
                    Convertimos tu idea en identidad visual, campañas y piezas diseñadas para que tu negocio destaque al instante.
                  </motion.p>
                </GlassCard>
              </motion.div>
            )}

            {visibleScene === 2 && (
              <motion.div
                key={`scene-2-${format}`}
                className="home-film-scene home-film-scene-beat home-film-scene-right"
                initial={
                  reduce
                    ? false
                    : isPortrait
                      ? { opacity: 0, y: 34, scale: 0.96 }
                      : { opacity: 0, x: 28, y: 10 }
                }
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                exit={
                  reduce
                    ? undefined
                    : isPortrait
                      ? { opacity: 0, y: 20, scale: 0.97, transition: { duration: 0.2, ease: EASE_EXIT } }
                      : { opacity: 0, x: 18, transition: { duration: 0.2, ease: EASE_EXIT } }
                }
                transition={
                  reduce
                    ? { duration: 0 }
                    : isPortrait
                      ? { type: 'spring', stiffness: 250, damping: 26, mass: 0.85 }
                      : { duration: 0.46, ease: EASE_CINEMA }
                }
              >
                <GlassCard variant="card" radius="lg" padding="none" glow="brand" sheen forceDark className="home-film-beat-card">
                  <div className="home-film-beat-head">
                    <motion.span
                      className="home-film-beat-tag"
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: reduce ? 0 : 0.36, delay: reduce ? 0 : 0.04, ease: EASE_CINEMA }}
                    >
                      <Sparkles size={13} aria-hidden="true" />
                      02 · Producción integral
                    </motion.span>
                    <span className="home-film-beat-step" aria-hidden="true">02 / 03</span>
                  </div>

                  <motion.span
                    className="home-film-beat-bar"
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: reduce ? 0 : 0.55, delay: reduce ? 0 : 0.12, ease: EASE_CINEMA }}
                    aria-hidden="true"
                  />

                  <p className="home-film-beat-title" role="heading" aria-level={2}>
                    <KineticLine delay={0.08} reduce={reduce}>
                      Del concepto al
                    </KineticLine>
                    <KineticLine delay={0.16} reduce={reduce}>
                      <em className="home-film-aurora">espacio real</em>
                    </KineticLine>
                  </p>

                  <motion.p
                    className="home-film-beat-copy"
                    initial={reduce ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduce ? 0 : 0.44, delay: reduce ? 0 : 0.22, ease: EASE_CINEMA }}
                  >
                    Impresión, gran formato, rótulos, corte láser, textil y eventos coordinados de principio a fin por un solo equipo.
                  </motion.p>
                </GlassCard>
              </motion.div>
            )}

            {visibleScene === 3 && (
              <motion.div
                key={`scene-3-${format}`}
                className="home-film-scene home-film-scene-finale"
                initial={reduce ? false : { opacity: 0, y: 32, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? undefined : { opacity: 0, y: 18, transition: { duration: 0.2, ease: EASE_EXIT } }}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 240, damping: 26, mass: 0.85 }
                }
              >
                <div className="home-film-finale-card">
                  <motion.p
                    className="home-film-finale-kicker"
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduce ? 0 : 0.36, delay: reduce ? 0 : 0.04, ease: EASE_CINEMA }}
                  >
                    <MapPin size={13} aria-hidden="true" />
                    Milagro, Ecuador · Agencia creativa
                  </motion.p>

                  <p className="home-film-finale-title" role="heading" aria-level={2}>
                    <KineticLine delay={0.08} reduce={reduce}>
                      Haz que tu marca ocupe su espacio
                    </KineticLine>
                  </p>

                  <motion.div
                    className="home-film-actions"
                    initial={reduce ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduce ? 0 : 0.42, delay: reduce ? 0 : 0.18, ease: EASE_CINEMA }}
                  >
                    <Link to="/cotizador" className="home-film-btn home-film-btn-primary">
                      <span>Empezar mi proyecto</span>
                      <ArrowUpRight size={18} aria-hidden="true" />
                    </Link>
                    <a href="#servicios" className="home-film-btn home-film-btn-glass">
                      <span>Explorar servicios</span>
                      <ArrowDown size={17} aria-hidden="true" />
                    </a>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Accessible hero heading when scrolled into later scenes */}
        {visibleScene !== 0 && (
          <h1 id="home-title" className="sr-only">
            {title}
          </h1>
        )}

        {/* Zero-footprint edge progress hairline (no playback controls, no lost space) */}
        {isCinematic && (
          <div className="home-film-edge-progress" aria-hidden="true">
            <span />
          </div>
        )}
      </div>
    </section>
  );
}
