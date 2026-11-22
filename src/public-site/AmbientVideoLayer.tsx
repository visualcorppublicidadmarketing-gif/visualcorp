import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import './ambient-video.css';

export type AmbientVideoClip = 'aurora' | 'silk' | 'orb';
export type AmbientVideoVariant = 'page-hero' | 'promo-hero' | 'store-cta' | 'home-portal' | 'promo-teaser';

const VIDEO_DIR = '/public-site/ambient-videos';

const AMBIENT_ASSETS: Record<AmbientVideoClip, { src: string; poster: string }> = {
  orb: {
    src: `${VIDEO_DIR}/store-liquid-orb-720p.mp4`,
    poster: `${VIDEO_DIR}/store-liquid-orb-poster.webp`,
  },
  aurora: {
    src: `${VIDEO_DIR}/silk-wave-aurora-720p.mp4`,
    poster: `${VIDEO_DIR}/silk-wave-aurora-poster.webp`,
  },
  silk: {
    src: `${VIDEO_DIR}/brand-gradient-silk-720p.mp4`,
    poster: `${VIDEO_DIR}/brand-gradient-silk-poster.webp`,
  },
};

export function AmbientVideoLayer({
  clip,
  variant,
  parallax = false,
  playbackRate = 0.82,
  className = '',
}: {
  clip: AmbientVideoClip;
  variant: AmbientVideoVariant;
  parallax?: boolean;
  playbackRate?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const [motionAllowed, setMotionAllowed] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  const asset = AMBIENT_ASSETS[clip];
  const shouldPlayVideo = motionAllowed && !prefersReducedMotion && !videoFailed;

  useEffect(() => {
    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection;

    const sync = () => {
      setMotionAllowed(!reducedQuery.matches && !connection?.saveData);
    };

    sync();
    reducedQuery.addEventListener('change', sync);
    connection?.addEventListener?.('change', sync);
    return () => {
      reducedQuery.removeEventListener('change', sync);
      connection?.removeEventListener?.('change', sync);
    };
  }, []);

  useEffect(() => {
    if (!shouldPlayVideo) return;
    const video = videoRef.current;
    if (!video) return;

    video.playbackRate = playbackRate;
    let isVisible = false;

    const syncPlayback = () => {
      if (isVisible && !document.hidden) {
        video.playbackRate = playbackRate;
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    };

    const handleVisibility = () => syncPlayback();
    document.addEventListener('visibilitychange', handleVisibility);

    if (typeof IntersectionObserver === 'undefined') {
      isVisible = true;
      syncPlayback();
      return () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        video.pause();
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        isVisible = entries.some((entry) => entry.isIntersecting);
        syncPlayback();
      },
      { threshold: 0.01, rootMargin: '120px 0px' },
    );

    observer.observe(video);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
      video.pause();
    };
  }, [shouldPlayVideo, playbackRate]);

  useEffect(() => {
    if (!parallax || !shouldPlayVideo) return;
    const node = containerRef.current;
    if (!node) return;

    let rafId = 0;

    const update = () => {
      rafId = 0;
      const rect = node.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 1;
      const centerRatio = (rect.top + rect.height * 0.5 - viewportHeight * 0.5) / viewportHeight;
      const clamped = Math.max(-1, Math.min(1, centerRatio));
      node.style.setProperty('--ambient-shift', `${(clamped * -22).toFixed(1)}px`);
      node.style.setProperty('--ambient-scale', (1.08 + Math.abs(clamped) * 0.04).toFixed(4));
    };

    const onScroll = () => {
      if (!rafId) rafId = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [parallax, shouldPlayVideo]);

  return (
    <div
      ref={containerRef}
      className={`vc-ambient-layer vc-ambient-layer--${variant}${videoReady ? ' is-ready' : ''}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      <img
        className="vc-ambient-poster"
        src={asset.poster}
        alt=""
        loading="lazy"
        decoding="async"
      />
      {shouldPlayVideo && (
        <video
          ref={videoRef}
          className="vc-ambient-video"
          src={asset.src}
          poster={asset.poster}
          muted
          playsInline
          loop
          preload="metadata"
          tabIndex={-1}
          onCanPlay={() => setVideoReady(true)}
          onError={() => setVideoFailed(true)}
        />
      )}
      <span className="vc-ambient-scrim" />
      <span className="vc-ambient-grain" />
    </div>
  );
}
