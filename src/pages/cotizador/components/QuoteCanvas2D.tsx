import React, { useState } from 'react';
import { Eye, User, Sparkles, Maximize2 } from 'lucide-react';

/**
 * Visualizador 2D Proporcional de Lonas, Banners y Gran Formato con Ojales y Escala Humana
 */
export function QuoteCanvas2D({
  widthCm = 100,
  heightCm = 100,
  finishing = 'none',
  eyeletCount = 0,
  grommets = [],
  productName = 'Lona Publicitaria',
  materialType = 'lona'
}) {
  const [showHumanScale, setShowHumanScale] = useState(false);

  // Normalize aspect ratio to fit inside viewport
  const maxViewW = 280;
  const maxViewH = 160;
  const rawRatio = widthCm / Math.max(1, heightCm);

  let bannerW, bannerH;
  if (rawRatio >= 1) {
    bannerW = Math.min(maxViewW, Math.max(90, maxViewW));
    bannerH = Math.min(maxViewH, Math.max(45, bannerW / rawRatio));
  } else {
    bannerH = Math.min(maxViewH, Math.max(80, maxViewH));
    bannerW = Math.min(maxViewW, Math.max(45, bannerH * rawRatio));
  }

  // Human silhouette height relative to banner (1.70m = 170cm)
  const humanHeightPx = (170 / Math.max(1, heightCm)) * bannerH;
  const clampedHumanH = Math.min(220, Math.max(40, humanHeightPx));

  const isMesh = /mesh/i.test(productName);
  const isBacklight = /luminoso|backlight/i.test(productName);

  return (
    <div className="quote-proportional-canvas-wrap">
      <div className="canvas-header">
        <span>
          <Eye size={14} /> Vista Previa 2D Proporcional
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className={`canvas-scale-btn ${showHumanScale ? 'active' : ''}`}
            onClick={() => setShowHumanScale(!showHumanScale)}
            title="Mostrar escala humana de referencia (1.70m)"
          >
            <User size={13} /> Escala Humana (1.70m)
          </button>
          <small>{widthCm} × {heightCm} cm</small>
        </div>
      </div>

      <div className="canvas-viewport" style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '16px', width: '100%' }}>
          {/* Human Silhouette Comparison */}
          {showHumanScale && (
            <div
              className="canvas-human-silhouette"
              style={{
                height: `${clampedHumanH}px`,
                width: `${clampedHumanH * 0.28}px`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                transition: 'all 0.3s ease',
                opacity: 0.85
              }}
            >
              <svg viewBox="0 0 100 300" style={{ width: '100%', height: '100%', fill: 'var(--muted)' }}>
                {/* Head */}
                <circle cx="50" cy="30" r="22" />
                {/* Body & Legs */}
                <path d="M25,65 Q50,55 75,65 L82,140 L70,140 L72,295 L54,295 L52,185 L48,185 L46,295 L28,295 L30,140 L18,140 Z" />
              </svg>
              <span style={{ fontSize: '9px', color: 'var(--muted)', fontWeight: 700, whiteSpace: 'nowrap', marginTop: '2px' }}>
                1.70 m
              </span>
            </div>
          )}

          {/* Banner Container with Dimension Callouts */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Top Width Dimension Badge */}
            <div className="canvas-dimension-top">
              <span>{widthCm >= 100 ? `${(widthCm / 100).toFixed(2)} m` : `${widthCm} cm`}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
              {/* Left Height Dimension Badge */}
              <div className="canvas-dimension-left">
                <span>{heightCm >= 100 ? `${(heightCm / 100).toFixed(2)} m` : `${heightCm} cm`}</span>
              </div>

              {/* The Responsive Banner */}
              <div
                className={`proportional-banner ${isMesh ? 'mesh-texture' : ''} ${isBacklight ? 'backlight-glow' : ''}`}
                style={{
                  width: `${bannerW}px`,
                  height: `${bannerH}px`,
                  position: 'relative'
                }}
              >
                {/* Pocket fold visual indicator */}
                {finishing === 'bolsillo' && (
                  <>
                    <div className="banner-pocket-fold top" />
                    <div className="banner-pocket-fold bottom" />
                  </>
                )}

                {/* Hem fold visual indicator */}
                {finishing !== 'none' && finishing !== 'corte_al_ras' && (
                  <div className="banner-hem-border" />
                )}

                {/* Grommets / Ojales */}
                {grommets.map((grommet) => (
                  <div
                    key={grommet.key}
                    className={`canvas-grommet ${finishing === 'large' ? 'large' : ''} ${grommet.className || ''}`}
                    style={grommet.style}
                    title="Ojal metálico"
                  />
                ))}

                <span className="banner-inner-label">
                  <strong>{productName.substring(0, 24)}</strong>
                  <small>{((widthCm * heightCm) / 10000).toFixed(2)} m²</small>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="canvas-footer-info">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted)' }}>
          <Sparkles size={12} style={{ color: 'var(--orange)' }} />
          <span>
            {finishing === 'small' || finishing === 'large'
              ? `${eyeletCount} ojales perimetrales calculados geométricamente.`
              : finishing === 'bolsillo'
                ? 'Confección de bolsillo superior e inferior para tubo.'
                : finishing === 'corte_al_ras'
                  ? 'Refilado exacto al borde sin ojales.'
                  : 'Margen estándar perimetral para tensado.'}
          </span>
        </div>
      </div>
    </div>
  );
}
