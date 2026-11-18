import type * as React from 'react';
import type { JSX, ReactNode } from 'react';
import './glass-wave-effects.css';

/**
 * 1. HorizonLightWave
 * Concentric horizontal hourglass beam with 3 staggered blur layers:
 * - Outer: blur(90px) magenta/violet (#e5007e / #8a45d2)
 * - Mid: blur(35px) cyan/pink (#009ee2 / #f076bc)
 * - Core: blur(22px) luminous specular slit
 */
export function HorizonLightWave({ className = '' }: { className?: string }): JSX.Element {
  return (
    <div
      className={`vc-horizon-light-wave ${className}`.trim()}
      aria-hidden="true"
      role="presentation"
    >
      <div className="horizon-wave-inner">
        {/* Layer 1: Outer diffuse magenta/violet haze (blur 90px) */}
        <div className="horizon-wave-outer" />

        {/* Layer 2: Mid concentrated cyan/pink aura (blur 35px) */}
        <div className="horizon-wave-mid" />

        {/* Layer 3: High-luminosity specular core (blur 22px) */}
        <div className="horizon-wave-core" />

        {/* Hourglass optical streak across the horizon */}
        <div className="horizon-wave-hourglass" />

        {/* Subtle geometric hourglass guide SVG */}
        <svg
          className="horizon-wave-svg"
          viewBox="0 0 1440 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          <defs>
            <linearGradient id="horizonWaveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8a45d2" stopOpacity="0" />
              <stop offset="25%" stopColor="#8a45d2" stopOpacity="0.3" />
              <stop offset="48%" stopColor="#009ee2" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="52%" stopColor="#e5007e" stopOpacity="0.8" />
              <stop offset="75%" stopColor="#e5007e" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#009ee2" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 60 Q 360 48, 720 59 T 1440 60"
            stroke="url(#horizonWaveGradient)"
            strokeWidth="1.2"
            strokeOpacity="0.75"
          />
        </svg>
      </div>
    </div>
  );
}

/**
 * 2. PortalLightStage
 * Perspective stage backdrop featuring:
 * - Lower perspective floor grid (strokeWidth=0.5, elliptical radial mask)
 * - Vertical additive light pillars (plus-lighter / screen) with blurs 15px, 56px, 120px
 * - Trapezoidal ground reflection for interactive stages and cards
 */
export function PortalLightStage({ className = '' }: { className?: string }): JSX.Element {
  return (
    <div
      className={`vc-portal-light-stage ${className}`.trim()}
      aria-hidden="true"
      role="presentation"
    >
      {/* Floor trapezoidal ambient reflection */}
      <div className="portal-stage-floor-reflection" />

      {/* Perspective grid floor */}
      <svg
        className="portal-stage-grid"
        viewBox="0 0 1200 360"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="portalGridLineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#009ee2" stopOpacity="0.1" />
            <stop offset="60%" stopColor="#009ee2" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#e5007e" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="portalGridCrossGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#009ee2" stopOpacity="0" />
            <stop offset="30%" stopColor="#009ee2" stopOpacity="0.35" />
            <stop offset="50%" stopColor="#f076bc" stopOpacity="0.5" />
            <stop offset="70%" stopColor="#e5007e" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#e5007e" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Perspective rays radiating from central vanishing point (600, 10) */}
        <g className="portal-grid-rays" stroke="url(#portalGridLineGrad)" strokeWidth={0.5}>
          <line x1="600" y1="10" x2="-200" y2="360" className="portal-grid-line" />
          <line x1="600" y1="10" x2="0" y2="360" className="portal-grid-line" />
          <line x1="600" y1="10" x2="160" y2="360" className="portal-grid-line" />
          <line x1="600" y1="10" x2="300" y2="360" className="portal-grid-line" />
          <line x1="600" y1="10" x2="420" y2="360" className="portal-grid-line" />
          <line x1="600" y1="10" x2="520" y2="360" className="portal-grid-line" />
          <line x1="600" y1="10" x2="600" y2="360" className="portal-grid-line" />
          <line x1="600" y1="10" x2="680" y2="360" className="portal-grid-line" />
          <line x1="600" y1="10" x2="780" y2="360" className="portal-grid-line" />
          <line x1="600" y1="10" x2="900" y2="360" className="portal-grid-line" />
          <line x1="600" y1="10" x2="1040" y2="360" className="portal-grid-line" />
          <line x1="600" y1="10" x2="1200" y2="360" className="portal-grid-line" />
          <line x1="600" y1="10" x2="1400" y2="360" className="portal-grid-line" />
        </g>

        {/* Perspective horizontal crosslines with foreshortened spacing */}
        <g className="portal-grid-transversals" stroke="url(#portalGridCrossGrad)" strokeWidth={0.5}>
          <line x1="0" y1="50" x2="1200" y2="50" className="portal-grid-cross" />
          <line x1="0" y1="95" x2="1200" y2="95" className="portal-grid-cross" />
          <line x1="0" y1="145" x2="1200" y2="145" className="portal-grid-cross" />
          <line x1="0" y1="200" x2="1200" y2="200" className="portal-grid-cross" />
          <line x1="0" y1="260" x2="1200" y2="260" className="portal-grid-cross" />
          <line x1="0" y1="325" x2="1200" y2="325" className="portal-grid-cross" />
        </g>
      </svg>

      {/* Additive light columns (15px, 56px, 120px) */}
      <div className="portal-stage-columns">
        {/* Tier 3: Ambient 120px backdrop diffusion */}
        <div className="portal-column-120" />

        {/* Tier 2: Mid-width 56px pillars */}
        <div className="portal-column-56 col-left" />
        <div className="portal-column-56 col-center" />
        <div className="portal-column-56 col-right" />

        {/* Tier 1: Crisp 15px vertical light filaments */}
        <div className="portal-column-15 col-left" />
        <div className="portal-column-15 col-center" />
        <div className="portal-column-15 col-right" />
      </div>
    </div>
  );
}

/**
 * 3. PlanetaryHorizonArc
 * Sweeping curved planetary horizon with brand atmospheric rim glow (#009ee2 / #e5007e),
 * inspired by WebAngles celestial horizons. Optionally accommodates orbital children.
 */
export function PlanetaryHorizonArc({
  className = '',
  children,
}: {
  className?: string;
  children?: ReactNode;
}): JSX.Element {
  return (
    <div className={`vc-planetary-horizon-arc ${className}`.trim()}>
      <div className="planetary-arc-backdrop" aria-hidden="true">
        {/* Atmospheric corona haze */}
        <div className="planetary-arc-atmosphere" />

        {/* Primary planetary curve SVG */}
        <svg
          className="planetary-arc-svg"
          viewBox="0 0 1440 220"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="planetaryArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#009ee2" stopOpacity="0" />
              <stop offset="20%" stopColor="#009ee2" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="80%" stopColor="#e5007e" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#e5007e" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="planetaryAtmosphereGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#009ee2" stopOpacity="0.05" />
              <stop offset="50%" stopColor="#e5007e" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#8a45d2" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Under-arc atmospheric glow fill */}
          <path
            d="M -100 220 C 320 30, 1120 30, 1540 220 L 1540 220 L -100 220 Z"
            fill="url(#planetaryAtmosphereGrad)"
          />

          {/* Planetary horizon specular edge */}
          <path
            d="M -100 220 C 320 30, 1120 30, 1540 220"
            stroke="url(#planetaryArcGrad)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Optional orbital content slot */}
      {children ? <div className="planetary-orbit-content">{children}</div> : null}
    </div>
  );
}

/**
 * 4. SculptedWaveDivider
 * Multi-layer SVG organic wave divider (inspired by getwaves.io) and Payrot-style notched portal:
 * - 'hero-to-light': organic waves cascading into light/services section
 * - 'light-to-dark': organic waves transitioning back to rich dark studio
 * - 'notch-portal': architectural divider with central circular medallion cradle for children
 */
export function SculptedWaveDivider({
  variant,
  className = '',
  children,
}: {
  variant: 'hero-to-light' | 'light-to-dark' | 'notch-portal';
  className?: string;
  children?: ReactNode;
}): JSX.Element {
  if (variant === 'notch-portal') {
    return (
      <div
        className={`vc-sculpted-wave-divider is-notch-portal ${className}`.trim()}
        role="separator"
        aria-orientation="horizontal"
      >
        <div className="notch-portal-bar">
          <div className="notch-portal-line" aria-hidden="true" />
          <div className="notch-portal-socket">
            {children ? <div className="notch-medallion-slot">{children}</div> : null}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'hero-to-light') {
    return (
      <div
        className={`vc-sculpted-wave-divider is-hero-to-light ${className}`.trim()}
        role="presentation"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 1440 140"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          {/* Layer 1: Ambient brand violet wave */}
          <path
            className="wave-layer-ambient wave-fill-ambient"
            d="M0,32L48,37.3C96,43,192,53,288,64C384,75,480,85,576,80C672,75,768,53,864,48C960,43,1056,53,1152,64C1248,75,1344,85,1392,90.7L1440,96L1440,140L1392,140C1344,140,1248,140,1152,140C1056,140,960,140,864,140C768,140,672,140,576,140C480,140,384,140,288,140C192,140,96,140,48,140L0,140Z"
          />

          {/* Layer 2: Mid cyan crest wave */}
          <path
            className="wave-layer-mid wave-fill-mid"
            d="M0,64L40,69.3C80,75,160,85,240,80C320,75,400,53,480,53.3C560,53,640,75,720,85.3C800,96,880,96,960,85.3C1040,75,1120,53,1200,48C1280,43,1360,53,1400,58.7L1440,64L1440,140L1400,140C1360,140,1280,140,1200,140C1120,140,1040,140,960,140C880,140,800,140,720,140C640,140,560,140,480,140C400,140,320,140,240,140C160,140,80,140,40,140L0,140Z"
          />

          {/* Layer 3: Foreground sculpted surface wave */}
          <path
            className="wave-layer-front wave-fill-front"
            d="M0,96L48,90.7C96,85,192,75,288,80C384,85,480,107,576,112C672,117,768,107,864,96C960,85,1056,75,1152,80C1248,85,1344,107,1392,117.3L1440,128L1440,140L1392,140C1344,140,1248,140,1152,140C1056,140,960,140,864,140C768,140,672,140,576,140C480,140,384,140,288,140C192,140,96,140,48,140L0,140Z"
          />
        </svg>
      </div>
    );
  }

  // Variant: 'light-to-dark'
  return (
    <div
      className={`vc-sculpted-wave-divider is-light-to-dark ${className}`.trim()}
      role="presentation"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1440 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        {/* Layer 1: Ambient cyan wave */}
        <path
          className="wave-layer-ambient wave-fill-ambient"
          d="M0,48L48,58.7C96,69,192,91,288,96C384,101,480,91,576,74.7C672,59,768,37,864,32C960,27,1056,37,1152,53.3C1248,69,1344,91,1392,101.3L1440,112L1440,140L1392,140C1344,140,1248,140,1152,140C1056,140,960,140,864,140C768,140,672,140,576,140C480,140,384,140,288,140C192,140,96,140,48,140L0,140Z"
        />

        {/* Layer 2: Mid magenta wave */}
        <path
          className="wave-layer-mid wave-fill-mid"
          d="M0,80L40,74.7C80,69,160,59,240,64C320,69,400,91,480,96C560,101,640,91,720,74.7C800,59,880,37,960,37.3C1040,37,1120,59,1200,69.3C1280,80,1360,80,1400,80L1440,80L1440,140L1400,140C1360,140,1280,140,1200,140C1120,140,1040,140,960,140C880,140,800,140,720,140C640,140,560,140,480,140C400,140,320,140,240,140C160,140,80,140,40,140L0,140Z"
        />

        {/* Layer 3: Foreground sculpted surface wave */}
        <path
          className="wave-layer-front wave-fill-front"
          d="M0,112L48,106.7C96,101,192,91,288,85.3C384,80,480,80,576,85.3C672,91,768,101,864,106.7C960,112,1056,112,1152,106.7C1248,101,1344,91,1392,85.3L1440,80L1440,140L1392,140C1344,140,1248,140,1152,140C1056,140,960,140,864,140C768,140,672,140,576,140C480,140,384,140,288,140C192,140,96,140,48,140L0,140Z"
        />
      </svg>
    </div>
  );
}
