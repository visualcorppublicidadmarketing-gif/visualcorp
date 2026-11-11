import React, { useId } from 'react';
import { Sparkles } from 'lucide-react';
import type { LearningBlock } from './learning-types';

type DiagramBlock = Extract<LearningBlock, { type: 'diagram' }>;

/** Renders theme-adaptive operational diagrams parameterized entirely by API data. */
export function LearningDiagram({ block }: { block: DiagramBlock }) {
  const uid = useId().replace(/:/g, '');
  const t = (key: string) => block.labels[key] || '';

  return (
    <figure className="learn-diagram-card">
      {(block.eyebrow || block.title) && (
        <figcaption className="learn-diagram-head">
          {block.eyebrow && (
            <span className="learn-diagram-eyebrow">
              <Sparkles size={13} aria-hidden="true" />
              {block.eyebrow}
            </span>
          )}
          {block.title && <strong>{block.title}</strong>}
          {block.subtitle && <p>{block.subtitle}</p>}
        </figcaption>
      )}

      {block.kind === 'rgb-vs-cmyk' && (
        <div className="learn-gamut-wrap">
          <div className="learn-gamut-canvas" role="img" aria-label={block.title || t('caption')}>
            <svg viewBox="0 0 260 190" className="learn-svg">
              <defs>
                <radialGradient id={`gamut-${uid}`} cx="50%" cy="55%" r="52%">
                  <stop offset="0%" stopColor="rgba(56, 189, 248, 0.25)" />
                  <stop offset="60%" stopColor="rgba(192, 132, 252, 0.14)" />
                  <stop offset="100%" stopColor="transparent" />
                </radialGradient>
              </defs>
              <ellipse cx="130" cy="96" rx="108" ry="76" fill={`url(#gamut-${uid})`} stroke="var(--learn-line-strong)" strokeWidth="1.5" />
              <text x="130" y="34" textAnchor="middle" fill="var(--learn-muted)" fontSize="9.5" fontWeight="700">
                {t('eyeLabel')}
              </text>
              <polygon points="130,44 218,148 56,136" fill="rgba(56, 189, 248, 0.1)" stroke="var(--learn-cyan)" strokeWidth="2" strokeDasharray="5 4" />
              <text x="132" y="84" textAnchor="middle" fill="var(--learn-cyan)" fontSize="10" fontWeight="800">
                {t('rgbLabel')}
              </text>
              <polygon points="122,88 184,126 130,152 78,122" fill="rgba(34, 197, 94, 0.18)" stroke="var(--learn-mint)" strokeWidth="2" />
              <text x="131" y="122" textAnchor="middle" fill="var(--learn-mint)" fontSize="10" fontWeight="800">
                {t('cmykLabel')}
              </text>
            </svg>
          </div>
          {t('caption') && <p className="learn-diagram-note">{t('caption')}</p>}
        </div>
      )}

      {block.kind === 'bleed-safe-zone' && (
        <svg viewBox="0 0 420 265" className="learn-svg learn-svg-wide" role="img" aria-label={block.title || t('bleed')}>
          <rect x="20" y="24" width="380" height="205" rx="6" fill="rgba(239, 68, 68, 0.08)" stroke="var(--learn-red)" strokeWidth="1.6" strokeDasharray="6 4" />
          <text x="28" y="16" fill="var(--learn-red)" fontSize="9.5" fontWeight="800">
            {t('bleed')}
          </text>
          <rect x="40" y="44" width="340" height="165" rx="4" fill="none" stroke="var(--learn-amber)" strokeWidth="2" />
          <text x="48" y="37" fill="var(--learn-amber)" fontSize="9.5" fontWeight="800">
            {t('trim')}
          </text>
          <rect x="62" y="66" width="296" height="121" rx="3" fill="rgba(34, 197, 94, 0.07)" stroke="var(--learn-mint)" strokeWidth="1.5" strokeDasharray="4 3" />
          <text x="70" y="59" fill="var(--learn-mint)" fontSize="9.5" fontWeight="800">
            {t('safe')}
          </text>
          <rect x="82" y="84" width="256" height="32" rx="4" fill="var(--learn-svg-surface)" stroke="var(--learn-line)" />
          <text x="210" y="104" textAnchor="middle" fill="var(--learn-ink)" fontSize="11.5" fontWeight="800">
            {t('mockupTitle')}
          </text>
          <rect x="82" y="124" width="205" height="9" rx="3" fill="var(--learn-svg-chip)" />
          <rect x="82" y="139" width="244" height="9" rx="3" fill="var(--learn-svg-chip)" />
          <rect x="82" y="156" width="108" height="22" rx="5" fill="rgba(242, 183, 5, 0.16)" stroke="var(--learn-amber)" />
          <text x="136" y="170" textAnchor="middle" fill="var(--learn-amber)" fontSize="8.5" fontWeight="800">
            {t('mockupLogo')}
          </text>
          <line x1="20" y1="242" x2="38" y2="242" stroke="var(--learn-red)" strokeWidth="1.5" />
          <text x="46" y="245" fill="var(--learn-muted)" fontSize="8.5">
            {t('bleedHint')}
          </text>
          <line x1="215" y1="242" x2="233" y2="242" stroke="var(--learn-mint)" strokeWidth="1.5" />
          <text x="240" y="245" fill="var(--learn-muted)" fontSize="8.5">
            {t('safeHint')}
          </text>
        </svg>
      )}

      {block.kind === 'laser-ai-file' && (
        <svg viewBox="0 0 540 220" className="learn-svg learn-svg-wide" role="img" aria-label={block.title || t('fileLabel')}>
          <defs>
            <pattern id={`dots-${uid}`} width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="8" cy="8" r="1" fill="var(--learn-line-strong)" />
            </pattern>
          </defs>
          <rect width="540" height="220" rx="10" fill="var(--learn-svg-surface)" />
          <rect width="540" height="220" rx="10" fill={`url(#dots-${uid})`} opacity="0.5" />
          <rect x="28" y="26" width="212" height="156" rx="6" fill="var(--learn-panel)" stroke="var(--learn-line-strong)" strokeWidth="1.2" />
          <text x="134" y="18" textAnchor="middle" fill="var(--learn-muted)" fontSize="9.5" fontWeight="700">
            {t('fileLabel')}
          </text>
          <rect x="62" y="54" width="144" height="92" rx="6" fill="rgba(239, 68, 68, 0.22)" />
          <rect x="82" y="69" width="104" height="62" rx="4" fill="none" stroke="#3b82f6" strokeWidth="2.2" />
          <rect x="57" y="49" width="154" height="102" rx="8" fill="none" stroke="var(--learn-ink)" strokeWidth="2.8" />
          <line x1="134" y1="100" x2="134" y2="146" stroke="var(--learn-red)" strokeWidth="1.2" strokeDasharray="3 2" />
          <text x="134" y="160" textAnchor="middle" fill="var(--learn-red)" fontSize="9.5" fontWeight="800">
            {t('redBadge')}
          </text>
          <text x="134" y="172" textAnchor="middle" fill="var(--learn-red)" fontSize="8.5">
            {t('redEq')}
          </text>

          <line x1="246" y1="54" x2="294" y2="54" stroke="var(--learn-line-strong)" strokeWidth="1.2" />
          <circle cx="305" cy="49" r="5" fill="var(--learn-ink)" />
          <text x="316" y="52" fill="var(--learn-ink)" fontSize="11" fontWeight="800">
            {t('blackTitle')}
          </text>
          <text x="316" y="66" fill="var(--learn-muted)" fontSize="9.5">
            {t('blackDesc')}
          </text>

          <line x1="246" y1="92" x2="294" y2="92" stroke="var(--learn-line-strong)" strokeWidth="1.2" />
          <circle cx="305" cy="87" r="5" fill="#3b82f6" />
          <text x="316" y="90" fill="var(--learn-cyan)" fontSize="11" fontWeight="800">
            {t('blueTitle')}
          </text>
          <text x="316" y="104" fill="var(--learn-muted)" fontSize="9.5">
            {t('blueDesc')}
          </text>

          <line x1="246" y1="130" x2="294" y2="130" stroke="var(--learn-line-strong)" strokeWidth="1.2" />
          <circle cx="305" cy="125" r="5" fill="#ef4444" />
          <text x="316" y="128" fill="var(--learn-red)" fontSize="11" fontWeight="800">
            {t('redTitle')}
          </text>
          <text x="316" y="142" fill="var(--learn-muted)" fontSize="9.5">
            {t('redDesc')}
          </text>

          {(block.highlights || []).map((item, idx) => (
            <text key={item} x="302" y={170 + idx * 17} fill="var(--learn-mint)" fontSize="9.8" fontWeight="800">
              {item}
            </text>
          ))}
        </svg>
      )}

      {block.kind === 'laser-focus-7mm' && (
        <div className="learn-focus-grid">
          <div className="learn-focus-svg-box">
            <svg viewBox="0 0 200 250" className="learn-svg learn-svg-focus" role="img" aria-label={t('measureLabel')}>
              <defs>
                <marker id={`arr-a-${uid}`} markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                  <path d="M1,1 L6,3.5 L1,6 Z" fill="var(--learn-amber)" />
                </marker>
                <marker id={`arr-b-${uid}`} markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse">
                  <path d="M1,1 L6,3.5 L1,6 Z" fill="var(--learn-amber)" />
                </marker>
              </defs>
              <rect x="70" y="12" width="52" height="78" rx="6" fill="var(--learn-svg-chip)" stroke="var(--learn-line-strong)" strokeWidth="1.6" />
              <polygon points="70,90 122,90 102,148 90,148" fill="var(--learn-svg-surface)" stroke="var(--learn-line-strong)" strokeWidth="1.6" />
              <line x1="96" y1="90" x2="96" y2="210" stroke="var(--learn-red)" strokeWidth="2.2" strokeDasharray="4 3" />
              <circle cx="96" cy="210" r="5" fill="var(--learn-red)" />
              <line x1="126" y1="150" x2="126" y2="207" stroke="var(--learn-amber)" strokeWidth="2" markerStart={`url(#arr-b-${uid})`} markerEnd={`url(#arr-a-${uid})`} />
              <text x="135" y="183" fill="var(--learn-amber)" fontSize="14" fontWeight="900">
                {t('measureLabel')}
              </text>
              <rect x="26" y="210" width="144" height="18" rx="4" fill="var(--learn-svg-chip)" stroke="var(--learn-line-strong)" />
              <text x="98" y="242" textAnchor="middle" fill="var(--learn-muted)" fontSize="10.5" fontWeight="700">
                {t('surfaceLabel')}
              </text>
            </svg>
          </div>
          <div className="learn-focus-copy">
            {t('kicker') && <span className="learn-diagram-kicker">{t('kicker')}</span>}
            {t('headline') && <h4>{t('headline')}</h4>}
            {t('summary') && <p>{t('summary')}</p>}
            {block.highlights && block.highlights.length > 0 && (
              <ul className="learn-focus-list">
                {block.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {block.kind === 'export-flow' && (
        <svg viewBox="0 0 580 86" className="learn-svg learn-svg-wide" role="img" aria-label={block.title || 'Flujo'}>
          <defs>
            <marker id={`flow-arr-${uid}`} markerWidth="7" markerHeight="7" refX="4" refY="3.5" orient="auto">
              <polygon points="0 0, 7 3.5, 0 7" fill="var(--learn-amber)" />
            </marker>
          </defs>
          {(block.groups || []).slice(0, 5).map((step, index) => {
            const x = 6 + index * 116;
            const tones = ['var(--learn-violet)', 'var(--learn-cyan)', 'var(--learn-mint)', 'var(--learn-amber)', 'var(--learn-blue)'];
            const stroke = tones[index % tones.length];
            return (
              <g key={step.title}>
                <rect x={x} y="10" width="98" height="62" rx="9" fill="var(--learn-svg-surface)" stroke={stroke} strokeWidth="1.5" />
                <text x={x + 49} y="31" textAnchor="middle" fill={stroke} fontSize="9.5" fontWeight="800">
                  {step.title}
                </text>
                <text x={x + 49} y="47" textAnchor="middle" fill="var(--learn-ink)" fontSize="8.5" fontWeight="600">
                  {step.items[0] || ''}
                </text>
                <text x={x + 49} y="60" textAnchor="middle" fill="var(--learn-muted)" fontSize="7.8">
                  {step.items[1] || ''}
                </text>
                {index < (block.groups?.length || 0) - 1 && (
                  <line x1={x + 101} y1="41" x2={x + 114} y2="41" stroke="var(--learn-amber)" strokeWidth="1.8" markerEnd={`url(#flow-arr-${uid})`} />
                )}
              </g>
            );
          })}
        </svg>
      )}

      {(block.kind === 'workshop-kit' || block.kind === 'quality-cards') && block.groups && (
        <div className="learn-checklist-cards">
          {block.groups.map((group) => (
            <div className={`learn-check-group tone-${group.tone || 'mint'}`} key={group.title}>
              <strong>{group.title}</strong>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </figure>
  );
}
