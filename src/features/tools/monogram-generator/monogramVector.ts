import * as opentype from 'opentype.js';
import type { MonogramElement, MonogramFontId, MonogramProject } from './monogramModel';

export interface MonogramOutline {
  id: string;
  text: string;
  d: string;
  transform?: string;
  x: number;
  y: number;
  fontSize: number;
  depth: number;
  bounds: { x: number; y: number; width: number; height: number };
  missingCharacters: string[];
}

const FONT_URLS = {
  'dm-sans': '/public-site/fonts/DMSans-Regular.ttf',
} as const;

const loadedFonts = new Map<string, Promise<opentype.Font>>();

export function loadMonogramFont(fontId: MonogramFontId): Promise<opentype.Font> {
  const cached = loadedFonts.get(fontId);
  if (cached) return cached;

  const pending = fetch(FONT_URLS[fontId])
    .then((response) => {
      if (!response.ok) throw new Error(`No se pudo cargar la fuente (${response.status}).`);
      return response.arrayBuffer();
    })
    .then((buffer) => opentype.parse(buffer));

  loadedFonts.set(fontId, pending);
  pending.catch(() => loadedFonts.delete(fontId));
  return pending;
}

function round(value: number) {
  return Number(value.toFixed(3));
}

export function createMonogramOutline(
  font: opentype.Font,
  projectHeight: number,
  layer: MonogramElement,
): MonogramOutline | null {
  const text = layer.text.trim();
  if (!text) return null;

  // Project positions use a bottom-left origin; SVG uses a top-left origin.
  const baselineY = projectHeight - layer.y;
  const path = font.getPath(text, layer.x, baselineY, layer.fontSize, {
    kerning: true,
    features: { liga: true },
  });
  const box = path.getBoundingBox();
  const d = path.toPathData(3);
  if (!d) return null;

  const rotation = Math.abs(layer.rotation) > 0.001
    ? `rotate(${round(-layer.rotation)} ${round(layer.x)} ${round(baselineY)})`
    : undefined;
  const missingCharacters = Array.from(new Set(Array.from(text).filter((character) => {
    const glyph = font.charToGlyph(character);
    return !glyph || glyph.index === 0;
  })));

  return {
    id: layer.id,
    text,
    d,
    transform: rotation,
    x: layer.x,
    y: baselineY,
    fontSize: layer.fontSize,
    depth: layer.depth,
    bounds: {
      x: round(box.x1),
      y: round(box.y1),
      width: round(Math.max(0, box.x2 - box.x1)),
      height: round(Math.max(0, box.y2 - box.y1)),
    },
    missingCharacters,
  };
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] ?? character);
}

export function createMonogramSvg(
  project: MonogramProject,
  outlines: MonogramOutline[],
  title = 'Monograma paramétrico',
) {
  const paths = outlines.map((outline) => {
    const transform = outline.transform ? ` transform="${outline.transform}"` : '';
    return `<path data-layer-id="${escapeXml(outline.id)}" d="${outline.d}"${transform} fill="#111827" fill-rule="nonzero"/>`;
  }).join('\n  ');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${project.width}mm" height="${project.height}mm" viewBox="0 0 ${project.width} ${project.height}" role="img" aria-labelledby="title desc">\n  <title id="title">${escapeXml(title)}</title>\n  <desc id="desc">Contornos tipográficos independientes. El archivo no aplica unión booleana, compensación de corte ni puentes.</desc>\n  ${paths}\n</svg>`;
}

export function estimateOutlineBounds(outline: MonogramOutline) {
  const degrees = outline.transform ? Number(outline.transform.match(/rotate\(([-\d.]+)/)?.[1] ?? 0) : 0;
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    [outline.bounds.x, outline.bounds.y],
    [outline.bounds.x + outline.bounds.width, outline.bounds.y],
    [outline.bounds.x + outline.bounds.width, outline.bounds.y + outline.bounds.height],
    [outline.bounds.x, outline.bounds.y + outline.bounds.height],
  ].map(([x, y]) => ({
    x: outline.x + (x - outline.x) * cosine - (y - outline.y) * sine,
    y: outline.y + (x - outline.x) * sine + (y - outline.y) * cosine,
  }));
  const left = Math.min(...corners.map((point) => point.x));
  const right = Math.max(...corners.map((point) => point.x));
  const top = Math.min(...corners.map((point) => point.y));
  const bottom = Math.max(...corners.map((point) => point.y));
  return {
    x: round(left),
    y: round(top),
    width: round(right - left),
    height: round(bottom - top),
  };
}
