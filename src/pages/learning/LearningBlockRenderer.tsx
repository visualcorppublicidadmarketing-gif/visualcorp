import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Briefcase,
  Calculator,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Cpu,
  Eye,
  FileCode2,
  FolderTree,
  Hammer,
  HardDrive,
  Heart,
  Image as ImageIcon,
  Info,
  Layers,
  Lightbulb,
  MessageSquare,
  Monitor,
  Network,
  Package,
  Palette,
  PenTool,
  Printer,
  Scissors,
  ShieldAlert,
  Sparkles,
  Store,
  Target,
  TrendingUp,
  Truck,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { LearningBlock, LearningTone } from './learning-types';
import { LearningDiagram } from './LearningDiagrams';

const ICON_MAP: Record<string, LucideIcon> = {
  alert: AlertTriangle,
  book: BookOpen,
  briefcase: Briefcase,
  calculator: Calculator,
  camera: Camera,
  check: CheckCircle2,
  checklist: ClipboardCheck,
  clock: Clock3,
  cpu: Cpu,
  eye: Eye,
  file: FileCode2,
  folder: FolderTree,
  hammer: Hammer,
  heart: Heart,
  image: ImageIcon,
  info: Info,
  layers: Layers,
  lightbulb: Lightbulb,
  message: MessageSquare,
  monitor: Monitor,
  nas: HardDrive,
  network: Network,
  package: Package,
  palette: Palette,
  pen: PenTool,
  printer: Printer,
  scissors: Scissors,
  shield: ShieldAlert,
  sparkles: Sparkles,
  store: Store,
  target: Target,
  trending: TrendingUp,
  truck: Truck,
  wrench: Wrench,
  zap: Zap,
};

function BlockGlyph({ value, size = 18 }: { value?: string; size?: number }) {
  if (!value) return <Sparkles size={size} aria-hidden="true" />;
  const Icon = ICON_MAP[value];
  if (Icon) return <Icon size={size} aria-hidden="true" />;
  return <span className="learn-glyph-emoji" aria-hidden="true">{value}</span>;
}

function toneClass(tone?: LearningTone) {
  return tone ? `tone-${tone}` : '';
}

/** Renders rich instructional blocks supplied securely by `/api/learning-content`. */
export function LearningBlockRenderer({
  block,
  basePath,
}: {
  block: LearningBlock;
  basePath: string;
}) {
  if (block.type === 'media') {
    return (
      <figure className="learn-media-card">
        <div className="learn-media-frame">
          <img src={block.src} alt={block.alt} loading="lazy" />
          {block.badge && <span className="learn-media-badge">{block.badge}</span>}
        </div>
        {block.caption && <figcaption>{block.caption}</figcaption>}
      </figure>
    );
  }

  if (block.type === 'cards') {
    const cols = block.columns || 3;
    const isSolid = block.variant === 'swatch-solid';
    return (
      <div className="learn-block-group">
        {block.title && <h4 className="learn-subhead">{block.title}</h4>}
        <div className={`learn-cards-grid cols-${cols} variant-${block.variant || 'default'}`}>
          {block.items.map((item) => (
            <article
              key={`${item.title}-${item.subtitle || ''}`}
              className={`learn-rich-card ${isSolid ? 'is-solid' : ''} ${item.darkText ? 'has-dark-text' : ''}`}
              style={
                isSolid && (item.hex || item.gradient)
                  ? { background: item.gradient || item.hex }
                  : undefined
              }
            >
              {(item.icon || item.badge) && (
                <div className="learn-rich-card-top">
                  {item.icon && (
                    <span className="learn-rich-card-icon">
                      <BlockGlyph value={item.icon} size={19} />
                    </span>
                  )}
                  {item.badge && (
                    <span className={`learn-pill ${toneClass(item.badgeTone)}`}>{item.badge}</span>
                  )}
                </div>
              )}
              <h5>{item.title}</h5>
              {item.subtitle && <span className="learn-rich-card-sub">{item.subtitle}</span>}
              {item.description && <p>{item.description}</p>}
              {item.items && item.items.length > 0 && (
                <ul className="learn-rich-card-list">
                  {item.items.map((sub) => (
                    <li key={sub}>{sub}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === 'tokens') {
    return (
      <section className="learn-tokens-box" aria-label={block.title || block.filename}>
        {block.title && <span className="learn-block-label">{block.title}</span>}
        <div className="learn-filename-bar">
          <code>{block.filename}</code>
        </div>
        <div className="learn-tokens-grid">
          {block.parts.map((part, index) => (
            <React.Fragment key={`${part.label}-${part.token}`}>
              <div className={`learn-token-col tone-${part.tone}`}>
                <span className="learn-token-pill">{part.token}</span>
                <span className="learn-token-stem" aria-hidden="true" />
                <strong>{part.label}</strong>
                <small>{part.help}</small>
              </div>
              {index < block.parts.length - 1 && (
                <span className="learn-token-dot" aria-hidden="true">
                  ·
                </span>
              )}
            </React.Fragment>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === 'color-layers') {
    return (
      <div className="learn-block-group">
        {block.title && <h4 className="learn-subhead">{block.title}</h4>}
        <div className="learn-color-layers">
          {block.layers.map((layer) => (
            <div key={layer.name} className={`learn-layer-row tone-${layer.tone}`}>
              <span
                className="learn-layer-swatch"
                style={{ backgroundColor: layer.swatch }}
                aria-hidden="true"
              />
              <div className="learn-layer-body">
                <strong>{layer.name}</strong>
                <code>{layer.subtitle}</code>
                <p>{layer.description}</p>
              </div>
              <span className="learn-layer-tag">{layer.tag}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === 'diagram') {
    return <LearningDiagram block={block} />;
  }

  if (block.type === 'table') {
    return (
      <div className="learn-block-group">
        {block.title && <h4 className="learn-subhead">{block.title}</h4>}
        <div className="learn-table-wrap">
          <table className="learn-table">
            <thead>
              <tr>
                {block.headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) =>
                row.group ? (
                  <tr key={`${row.group}-${rowIndex}`} className={`learn-table-group ${toneClass(row.groupTone)}`}>
                    <td colSpan={block.headers.length}>{row.group}</td>
                  </tr>
                ) : (
                  <tr key={rowIndex}>
                    {row.cells.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={cell.mono ? 'is-mono' : cell.highlight ? 'is-highlight' : ''}
                      >
                        {cell.badge ? (
                          <span className={`learn-pill ${toneClass(cell.badgeTone)}`}>{cell.text}</span>
                        ) : (
                          cell.text
                        )}
                      </td>
                    ))}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (block.type === 'compare') {
    return (
      <div className="learn-compare-grid">
        {block.items.map((item) => (
          <article key={item.title} className={`learn-compare-card tone-${item.tone || 'neutral'}`}>
            <header className="learn-compare-head">
              {item.icon && (
                <span className="learn-compare-icon">
                  <BlockGlyph value={item.icon} size={18} />
                </span>
              )}
              <div>
                <h5>{item.title}</h5>
                {item.subtitle && <small>{item.subtitle}</small>}
              </div>
            </header>
            {item.description && <p>{item.description}</p>}
            {item.points && item.points.length > 0 && (
              <ul>
                {item.points.map((pt) => (
                  <li key={pt.text}>
                    <span>{pt.text}</span>
                    {pt.highlight && <code className="learn-inline-badge">{pt.highlight}</code>}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    );
  }

  if (block.type === 'specs-grid') {
    return (
      <div className="learn-block-group">
        {block.title && <h4 className="learn-subhead">{block.title}</h4>}
        <div className="learn-specs-grid">
          {block.items.map((machine) => (
            <article key={machine.title} className="learn-spec-card">
              <div className="learn-spec-head">
                {machine.icon && (
                  <span className="learn-spec-emblem">
                    <BlockGlyph value={machine.icon} size={22} />
                  </span>
                )}
                <div>
                  <h5>{machine.title}</h5>
                  {machine.badge && (
                    <span className={`learn-pill ${toneClass(machine.badgeTone)}`}>{machine.badge}</span>
                  )}
                </div>
              </div>
              <dl className="learn-spec-list">
                {machine.specs.map((spec) => (
                  <div key={spec.label}>
                    <dt>{spec.label}</dt>
                    <dd>{spec.value}</dd>
                  </div>
                ))}
              </dl>
              {machine.note && <p className="learn-spec-note">{machine.note}</p>}
            </article>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === 'flow') {
    return (
      <div className="learn-block-group">
        {block.title && <h4 className="learn-subhead">{block.title}</h4>}
        <div className="learn-flow-strip">
          {block.steps.map((step, index) => (
            <React.Fragment key={step.title}>
              <div className="learn-flow-node">
                {step.icon && (
                  <span className="learn-flow-node-icon">
                    <BlockGlyph value={step.icon} size={18} />
                  </span>
                )}
                <strong>{step.title}</strong>
                {step.subtitle && <span>{step.subtitle}</span>}
                {step.code && <code>{step.code}</code>}
              </div>
              {index < block.steps.length - 1 && (
                <ArrowRight className="learn-flow-sep" size={16} aria-hidden="true" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === 'tree') {
    return (
      <div className="learn-tree-card">
        {block.title && <span className="learn-block-label">{block.title}</span>}
        <pre className="learn-tree-pre">
          {block.lines.map((line, index) => (
            <span key={index} className={`learn-tree-line is-${line.tone || 'file'}`}>
              {line.text}
              {'\n'}
            </span>
          ))}
        </pre>
      </div>
    );
  }

  if (block.type === 'steps') {
    return (
      <div className="learn-block-group">
        {block.title && <h4 className="learn-subhead">{block.title}</h4>}
        <ol className={`learn-steps ${block.layout === 'row' ? 'is-row' : ''}`}>
          {block.items.map((step, index) => (
            <li key={step.title} className="learn-step-card">
              <span className="learn-step-num">{step.number ?? index + 1}</span>
              <div className="learn-step-body">
                <strong>{step.title}</strong>
                <p>{step.description}</p>
                {step.code && <code>{step.code}</code>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (block.type === 'callout') {
    const defaultIcon =
      block.tone === 'danger'
        ? 'shield'
        : block.tone === 'warning'
        ? 'alert'
        : block.tone === 'success'
        ? 'check'
        : 'lightbulb';
    return (
      <div className={`learn-callout tone-${block.tone}`} role="note">
        <span className="learn-callout-icon">
          <BlockGlyph value={block.icon || defaultIcon} size={18} />
        </span>
        <div>
          <strong>{block.title}</strong>
          <p>{block.text}</p>
        </div>
      </div>
    );
  }

  if (block.type === 'schedule') {
    return (
      <div className="learn-block-group">
        {block.title && <h4 className="learn-subhead">{block.title}</h4>}
        <div className="learn-schedule-grid">
          {block.items.map((slot) => (
            <div key={slot.days} className="learn-schedule-card">
              {slot.icon && (
                <span className="learn-schedule-icon">
                  <BlockGlyph value={slot.icon} size={20} />
                </span>
              )}
              <strong>{slot.days}</strong>
              <b className="learn-schedule-hours">{slot.hours}</b>
              {(slot.note || slot.highlight) && (
                <p>
                  {slot.highlight && <em>{slot.highlight} </em>}
                  {slot.note}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === 'quote') {
    return (
      <blockquote className="learn-quote-card">
        <p>{block.text}</p>
        {block.author && <cite>{block.author}</cite>}
      </blockquote>
    );
  }

  if (block.type === 'swatches') {
    return (
      <div className="learn-block-group">
        {block.title && <h4 className="learn-subhead">{block.title}</h4>}
        <div className="learn-brand-swatches">
          {block.items.map((swatch) => (
            <div
              key={swatch.label}
              className={`learn-brand-swatch ${swatch.darkText ? 'is-dark-text' : ''}`}
              style={{ background: swatch.gradient || swatch.hex || 'var(--learn-panel-strong)' }}
            >
              <span>{swatch.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === 'tool-links') {
    return (
      <div className="learn-block-group">
        {block.title && <h4 className="learn-subhead">{block.title}</h4>}
        <div className="learn-tool-links">
          {block.items.map((item) => (
            <Link
              key={item.practiceId}
              to={`${basePath}/practicas/${item.practiceId}`}
              className={`learn-tool-jump ${toneClass(item.tone)}`}
            >
              <Calculator size={16} aria-hidden="true" />
              <div>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </div>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
