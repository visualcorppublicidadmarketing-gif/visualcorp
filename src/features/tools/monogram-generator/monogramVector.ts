import * as opentype from 'opentype.js';
import { MONOGRAM_SHAPES } from './monogramModel';
import type { MonogramElement, MonogramFontId, MonogramProject, MonogramShapeId } from './monogramModel';

export interface MonogramOutline {
  id: string;
  kind: 'text' | 'ornament';
  shapeId: MonogramShapeId | null;
  text: string;
  d: string;
  transform?: string;
  x: number;
  y: number;
  fontSize: number;
  depth: number;
  color: string;
  bounds: { x: number; y: number; width: number; height: number };
  missingCharacters: string[];
  usedSimpleShaping: boolean;
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

function createGlyphRunPath(
  font: opentype.Font,
  text: string,
  x: number,
  y: number,
  fontSize: number,
) {
  const scale = fontSize / font.unitsPerEm;
  let cursorX = x;
  let previousGlyph: opentype.Glyph | null = null;
  let path: opentype.Path | null = null;

  // Avoid GSUB shaping here: opentype.js 2.0.0 cannot process some contextual
  // substitution lookups found in otherwise valid fonts such as our DM Sans.
  for (const character of Array.from(text.normalize('NFC'))) {
    const glyph = font.charToGlyph(character);
    if (!glyph) throw new Error(`No se pudo cargar el glifo «${character}».`);
    if (previousGlyph) cursorX += font.getKerningValue(previousGlyph, glyph) * scale;
    const glyphPath = glyph.getPath(cursorX, y, fontSize, undefined, font);
    if (path) path.extend(glyphPath);
    else path = glyphPath;
    cursorX += (glyph.advanceWidth ?? 0) * scale;
    previousGlyph = glyph;
  }

  if (!path) throw new Error('El texto no contiene glifos compatibles.');
  return path;
}

export function createMonogramOutline(
  font: opentype.Font | null,
  projectHeight: number,
  layer: MonogramElement,
): MonogramOutline | null {
  if (layer.kind === 'ornament') return createMonogramOrnamentOutline(projectHeight, layer);
  const text = layer.text.trim();
  if (!text || !font) return null;

  // Project positions use a bottom-left origin; SVG uses a top-left origin.
  const baselineY = projectHeight - layer.y;
  let usedSimpleShaping = false;
  let path: opentype.Path;
  try {
    path = font.getPath(text, layer.x, baselineY, layer.fontSize, {
      kerning: true,
      features: { liga: true },
    });
  } catch {
    path = createGlyphRunPath(font, text, layer.x, baselineY, layer.fontSize);
    usedSimpleShaping = true;
  }
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
    kind: 'text',
    shapeId: null,
    text,
    d,
    transform: rotation,
    x: layer.x,
    y: baselineY,
    fontSize: layer.fontSize,
    depth: layer.depth,
    color: layer.color,
    usedSimpleShaping,
    bounds: {
      x: round(box.x1),
      y: round(box.y1),
      width: round(Math.max(0, box.x2 - box.x1)),
      height: round(Math.max(0, box.y2 - box.y1)),
    },
    missingCharacters,
  };
}

function createMonogramOrnamentOutline(projectHeight: number, layer: MonogramElement): MonogramOutline | null {
  const shapeId = layer.shapeId ?? 'star';
  const label = MONOGRAM_SHAPES.find((shape) => shape.id === shapeId)?.label ?? 'Adorno';
  const radius = layer.fontSize / 2;
  const baselineY = projectHeight - layer.y;
  let d: string;
  if (shapeId === 'circle') {
    d = `M ${round(layer.x - radius)} ${round(baselineY)} a ${round(radius)} ${round(radius)} 0 1 0 ${round(radius * 2)} 0 a ${round(radius)} ${round(radius)} 0 1 0 ${round(-radius * 2)} 0 Z`;
  } else if (shapeId === 'diamond') {
    d = `M ${round(layer.x)} ${round(baselineY - radius)} L ${round(layer.x + radius)} ${round(baselineY)} ${round(layer.x)} ${round(baselineY + radius)} ${round(layer.x - radius)} ${round(baselineY)} Z`;
  } else if (shapeId === 'heart') {
    d = `M ${round(layer.x)} ${round(baselineY + radius * 0.88)} C ${round(layer.x - radius * 0.18)} ${round(baselineY + radius * 0.68)}, ${round(layer.x - radius)} ${round(baselineY + radius * 0.2)}, ${round(layer.x - radius)} ${round(baselineY - radius * 0.08)} C ${round(layer.x - radius)} ${round(baselineY - radius * 0.72)}, ${round(layer.x - radius * 0.2)} ${round(baselineY - radius * 0.92)}, ${round(layer.x)} ${round(baselineY - radius * 0.34)} C ${round(layer.x + radius * 0.2)} ${round(baselineY - radius * 0.92)}, ${round(layer.x + radius)} ${round(baselineY - radius * 0.72)}, ${round(layer.x + radius)} ${round(baselineY - radius * 0.08)} C ${round(layer.x + radius)} ${round(baselineY + radius * 0.2)}, ${round(layer.x + radius * 0.18)} ${round(baselineY + radius * 0.68)}, ${round(layer.x)} ${round(baselineY + radius * 0.88)} Z`;
  } else {
    const points = Array.from({ length: 10 }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI) / 5;
      const pointRadius = index % 2 === 0 ? radius : radius * 0.46;
      return `${round(layer.x + Math.cos(angle) * pointRadius)} ${round(baselineY + Math.sin(angle) * pointRadius)}`;
    });
    d = `M ${points.join(' L ')} Z`;
  }
  const rotation = Math.abs(layer.rotation) > 0.001
    ? `rotate(${round(-layer.rotation)} ${round(layer.x)} ${round(baselineY)})`
    : undefined;
  return {
    id: layer.id,
    kind: 'ornament',
    shapeId,
    text: label,
    d,
    transform: rotation,
    x: layer.x,
    y: baselineY,
    fontSize: layer.fontSize,
    depth: layer.depth,
    color: layer.color,
    bounds: { x: layer.x - radius, y: baselineY - radius, width: radius * 2, height: radius * 2 },
    missingCharacters: [],
    usedSimpleShaping: false,
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

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${project.width}mm" height="${project.height}mm" viewBox="0 0 ${project.width} ${project.height}" role="img" aria-labelledby="title desc">\n  <title id="title">${escapeXml(title)}</title>\n  <desc id="desc">Capas de texto y adornos como contornos independientes. El archivo no aplica unión booleana, compensación de corte ni puentes.</desc>\n  ${paths}\n</svg>`;
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
