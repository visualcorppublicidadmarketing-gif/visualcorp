import React from 'react';
import type { PublicServiceId } from './content';
import './title-3d.css';

export type Title3DKey =
  | 'rotulos'
  | 'corporeos'
  | 'gran-formato'
  | 'brandeo'
  | 'impresion'
  | 'disenando'
  | 'personalizados'
  | 'promocionales'
  | 'corte-y-grabado'
  | 'senaleticas'
  | 'vinilos'
  | 'luminosos'
  | 'letras-3d'
  | 'etiquetas'
  | 'instalacion'
  | 'campana-politica';

export type Title3DMeta = {
  label: string;
  shortWord: string;
  fileKey: string;
  serviceId?: PublicServiceId;
  aspectRatio: number;
};

export const title3DRegistry: Record<Title3DKey, Title3DMeta> = {
  rotulos: { label: 'Rótulos Comerciales y Fachadas', shortWord: 'RÓTULOS', fileKey: 'rotulos', serviceId: 'rotulos', aspectRatio: 2.4 },
  corporeos: { label: 'Letras y Formas Corpóreas 3D', shortWord: 'CORPÓREOS', fileKey: 'corporeos', serviceId: 'rotulos', aspectRatio: 2.4 },
  luminosos: { label: 'Letreros Luminosos y Neón Led', shortWord: 'LUMINOSOS', fileKey: 'luminosos', serviceId: 'rotulos', aspectRatio: 2.4 },
  'letras-3d': { label: 'Letras y Logotipos 3D en Relieve', shortWord: 'LETRAS 3D', fileKey: 'letras-3d', serviceId: 'rotulos', aspectRatio: 2.4 },
  'gran-formato': { label: 'Publicidad de Gran Formato y Lonas', shortWord: 'GRAN FORMATO', fileKey: 'gran-formato', serviceId: 'gran-formato', aspectRatio: 2.4 },
  brandeo: { label: 'Brandeo de Espacios y Flotas Comerciales', shortWord: 'BRANDEO', fileKey: 'brandeo', serviceId: 'gran-formato', aspectRatio: 2.4 },
  vinilos: { label: 'Vinilos Adhesivos Decorativos y Comerciales', shortWord: 'VINILOS', fileKey: 'vinilos', serviceId: 'gran-formato', aspectRatio: 2.35 },
  impresion: { label: 'Impresión y Papelería Corporativa', shortWord: 'IMPRESIÓN', fileKey: 'impresion', serviceId: 'impresion', aspectRatio: 2.4 },
  etiquetas: { label: 'Etiquetas y Stickers Personalizados', shortWord: 'ETIQUETAS', fileKey: 'etiquetas', serviceId: 'impresion', aspectRatio: 2.4 },
  disenando: { label: 'Diseño Gráfico y Creativo', shortWord: 'DISEÑO', fileKey: 'disenando', aspectRatio: 2.4 },
  personalizados: { label: 'Artículos y Textiles Personalizados', shortWord: 'PERSONALIZADOS', fileKey: 'personalizados', serviceId: 'textil', aspectRatio: 2.4 },
  promocionales: { label: 'Promocionales y Merchandising', shortWord: 'PROMOCIONALES', fileKey: 'promocionales', serviceId: 'textil', aspectRatio: 2.4 },
  'corte-y-grabado': { label: 'Corte y Grabado Láser / Router CNC', shortWord: 'CORTE Y GRABADO', fileKey: 'corte-y-grabado', serviceId: 'corte', aspectRatio: 2.4 },
  senaleticas: { label: 'Señaléticas y Placas Corporativas', shortWord: 'SEÑALÉTICAS', fileKey: 'senaleticas', serviceId: 'corte', aspectRatio: 2.4 },
  instalacion: { label: 'Instalación y Montaje Profesional', shortWord: 'INSTALACIÓN', fileKey: 'instalacion', aspectRatio: 2.38 },
  'campana-politica': { label: 'Publicidad para Campañas Políticas', shortWord: 'CAMPAÑA POLÍTICA', fileKey: 'campana-politica', aspectRatio: 2.4 },
};

export const serviceToTitle3DMap: Record<PublicServiceId, Title3DKey> = {
  rotulos: 'rotulos',
  'gran-formato': 'gran-formato',
  impresion: 'impresion',
  textil: 'personalizados',
  corte: 'corte-y-grabado',
  eventos: 'brandeo',
};

export type Title3DProps = {
  serviceId?: PublicServiceId;
  titleKey?: Title3DKey;
  variant?: 'hero' | 'banner' | 'card' | 'badge';
  priority?: boolean;
  className?: string;
  showAura?: boolean;
  interactive?: boolean;
  maxWidth?: number | string;
};

/**
 * Componente de Título 3D oficial con Visualito integrado.
 * Optimizado con imágenes WebP ligeras (1200px desktop y 640px móvil)
 * preservando transparencia real sobre temas claro y oscuro.
 */
export function Title3D({
  serviceId,
  titleKey,
  variant = 'hero',
  priority = false,
  className = '',
  showAura = true,
  interactive = true,
  maxWidth,
}: Title3DProps) {
  const resolvedKey: Title3DKey =
    titleKey || (serviceId ? serviceToTitle3DMap[serviceId] : 'rotulos') || 'rotulos';
  const meta = title3DRegistry[resolvedKey] || title3DRegistry.rotulos;

  const styleProps: React.CSSProperties = {
    '--title-3d-ratio': String(meta.aspectRatio),
    ...(maxWidth ? { maxWidth: typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth } : {}),
  } as React.CSSProperties;

  return (
    <figure
      className={`vc-title-3d vc-title-3d--${variant}${interactive ? ' is-interactive' : ''} ${className}`}
      style={styleProps}
      aria-label={`Título 3D: ${meta.shortWord} con Visualito`}
    >
      {showAura && <div className="vc-title-3d-aura" aria-hidden="true" />}
      <picture className="vc-title-3d-picture">
        <source
          media="(max-width: 640px)"
          srcSet={`/public-site/titulos-3d/${meta.fileKey}-sm.webp`}
          type="image/webp"
        />
        <img
          src={`/public-site/titulos-3d/${meta.fileKey}.webp`}
          alt={meta.label}
          width={1200}
          height={Math.round(1200 / meta.aspectRatio)}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          className="vc-title-3d-img"
        />
      </picture>
    </figure>
  );
}
