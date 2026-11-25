/**
 * Pure project model for the parametric monogram editor.
 * Coordinates and all dimensions are millimetres. The origin is the lower-left
 * corner of the artboard; x/y identify the text baseline origin.
 *
 * Text elements remain independent layers. This model does not weld or union
 * overlapping letters; boolean geometry is a separate, not-yet-implemented step.
 */

/** Only DM Sans is enabled until additional font licensing is confirmed. */
export type MonogramFontId = 'dm-sans';
export type MonogramPresetId = 'initial' | 'name-initial';
export type MonogramDisplayUnit = 'mm' | 'cm';

export interface MonogramElement {
  /** Stable within this project; do not use the array index as an identity. */
  id: string;
  text: string;
  /** Baseline origin in mm from the artboard's left and bottom edges. */
  x: number;
  y: number;
  /** Font size in mm. */
  fontSize: number;
  fontId: MonogramFontId;
  /** Counter-clockwise degrees around the text baseline origin. */
  rotation: number;
  /** Extrusion depth in mm for this independent layer. */
  depth: number;
}

export interface MonogramProject {
  schemaVersion: 1;
  /** All physical values stay in mm; this field controls presentation only. */
  displayUnit: MonogramDisplayUnit;
  unit: 'mm';
  title: string;
  width: number;
  height: number;
  /** Default extrusion depth used when creating or importing a layer without depth. */
  thickness: number;
  elements: MonogramElement[];
}

export interface MonogramLayerOverrides {
  id?: string;
  text?: string;
  x?: number;
  y?: number;
  fontSize?: number;
  fontId?: MonogramFontId;
  rotation?: number;
  depth?: number;
}

export interface MonogramLayerBounds {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

export interface MonogramWarning {
  code: 'outside-artboard' | 'empty-text' | 'layers-not-unioned';
  message: string;
  elementId?: string;
  /** Approximate bounds are included only for outside-artboard warnings. */
  estimatedBounds?: MonogramLayerBounds;
}

export interface MonogramValidation {
  isValid: boolean;
  errors: string[];
  warnings: MonogramWarning[];
}

export interface MonogramPreset {
  id: MonogramPresetId;
  label: string;
  description: string;
  project: MonogramProject;
}

export const MONOGRAM_LIMITS = {
  minArtboard: 20,
  maxArtboard: 1000,
  minFontSize: 2,
  maxFontSize: 300,
  minDepth: 0.4,
  maxDepth: 50,
  minCoordinate: -2000,
  maxCoordinate: 2000,
  minRotation: -180,
  maxRotation: 180,
  maxTextLength: 80,
  maxTitleLength: 80,
  maxElements: 24,
} as const;

export const MONOGRAM_GEOMETRY_LIMITATION =
  'Cada texto se mantiene como una capa independiente. Las capas superpuestas no se unen ni se sueldan en una sola geometría.';

const DEFAULT_TITLE = 'Monograma';

/** Default project opens with one editable initial. */
export const DEFAULT_MONOGRAM_PROJECT: MonogramProject = {
  schemaVersion: 1,
  displayUnit: 'mm',
  unit: 'mm',
  title: DEFAULT_TITLE,
  width: 100,
  height: 80,
  thickness: 3,
  elements: [
    {
      id: 'initial-main',
      text: 'A',
      x: 31,
      y: 14,
      fontSize: 52,
      fontId: 'dm-sans',
      rotation: 0,
      depth: 3,
    },
  ],
};

/** Starter projects contain real editable values, not rendered model files. */
export const MONOGRAM_PRESETS: Record<MonogramPresetId, MonogramPreset> = {
  initial: {
    id: 'initial',
    label: 'Inicial',
    description: 'Una inicial en una placa compacta.',
    project: {
      schemaVersion: 1,
      displayUnit: 'mm',
      unit: 'mm',
      title: 'Inicial',
      width: 100,
      height: 80,
      thickness: 3,
      elements: [
        { id: 'initial-main', text: 'A', x: 31, y: 14, fontSize: 52, fontId: 'dm-sans', rotation: 0, depth: 3 },
      ],
    },
  },
  'name-initial': {
    id: 'name-initial',
    label: 'Nombre + inicial',
    description: 'Dos capas editables para combinar una inicial y un nombre.',
    project: {
      schemaVersion: 1,
      displayUnit: 'mm',
      unit: 'mm',
      title: 'Nombre con inicial',
      width: 130,
      height: 80,
      thickness: 3,
      elements: [
        { id: 'initial-main', text: 'A', x: 8, y: 15, fontSize: 54, fontId: 'dm-sans', rotation: 0, depth: 3 },
        { id: 'name-main', text: 'Nombre', x: 28, y: 25, fontSize: 25, fontId: 'dm-sans', rotation: 0, depth: 3 },
      ],
    },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function millimetersToMonogramUnit(valueMm: number, unit: MonogramDisplayUnit): number {
  return unit === 'cm' ? valueMm / 10 : valueMm;
}

export function monogramUnitToMillimeters(value: number, unit: MonogramDisplayUnit): number {
  return unit === 'cm' ? value * 10 : value;
}

export function formatMonogramLength(valueMm: number, unit: MonogramDisplayUnit): string {
  return new Intl.NumberFormat('es-EC', { maximumFractionDigits: unit === 'cm' ? 3 : 2 })
    .format(millimetersToMonogramUnit(valueMm, unit));
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return Array.from(value.normalize('NFC')).slice(0, maxLength).join('');
}

function cleanId(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const id = value.trim().replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 64);
  return id || fallback;
}

function normalizeRotation(value: unknown): number {
  const rotation = finiteNumber(value, 0);
  const wrapped = ((rotation + 180) % 360 + 360) % 360 - 180;
  return round(clamp(wrapped, MONOGRAM_LIMITS.minRotation, MONOGRAM_LIMITS.maxRotation));
}

function normalizeElement(
  candidate: unknown,
  index: number,
  defaultDepth: number,
  usedIds: Set<string>,
): MonogramElement {
  const source = isRecord(candidate) ? candidate : {};
  const baseId = cleanId(source.id, `texto-${index + 1}`);
  let id = baseId;
  let duplicate = 2;
  while (usedIds.has(id)) id = `${baseId}-${duplicate++}`;
  usedIds.add(id);

  const fontId: MonogramFontId = 'dm-sans';
  return {
    id,
    text: cleanText(source.text, MONOGRAM_LIMITS.maxTextLength),
    x: round(clamp(finiteNumber(source.x, 0), MONOGRAM_LIMITS.minCoordinate, MONOGRAM_LIMITS.maxCoordinate)),
    y: round(clamp(finiteNumber(source.y, 0), MONOGRAM_LIMITS.minCoordinate, MONOGRAM_LIMITS.maxCoordinate)),
    fontSize: round(clamp(finiteNumber(source.fontSize, 24), MONOGRAM_LIMITS.minFontSize, MONOGRAM_LIMITS.maxFontSize)),
    fontId,
    rotation: normalizeRotation(source.rotation),
    depth: round(clamp(finiteNumber(source.depth, defaultDepth), MONOGRAM_LIMITS.minDepth, MONOGRAM_LIMITS.maxDepth)),
  };
}

/**
 * Creates an independent default project, optionally hydrating a partial/imported
 * object. Invalid numeric values and enum values are replaced or clamped explicitly.
 */
export function createMonogramProject(candidate?: unknown): MonogramProject {
  if (candidate === undefined) return normalizeMonogramProject(DEFAULT_MONOGRAM_PROJECT);
  return normalizeMonogramProject(candidate);
}

/**
 * Defensively normalizes imported JSON to schema version 1. Unsupported fields are
 * ignored, dimensions are clamped, IDs are repaired, and at most 24 layers survive.
 */
export function normalizeMonogramProject(candidate: unknown): MonogramProject {
  const source = isRecord(candidate) ? candidate : {};
  const width = round(clamp(
    finiteNumber(source.width, DEFAULT_MONOGRAM_PROJECT.width),
    MONOGRAM_LIMITS.minArtboard,
    MONOGRAM_LIMITS.maxArtboard,
  ));
  const height = round(clamp(
    finiteNumber(source.height, DEFAULT_MONOGRAM_PROJECT.height),
    MONOGRAM_LIMITS.minArtboard,
    MONOGRAM_LIMITS.maxArtboard,
  ));
  const thickness = round(clamp(
    finiteNumber(source.thickness, DEFAULT_MONOGRAM_PROJECT.thickness),
    MONOGRAM_LIMITS.minDepth,
    MONOGRAM_LIMITS.maxDepth,
  ));
  const rawElements = Array.isArray(source.elements) ? source.elements.slice(0, MONOGRAM_LIMITS.maxElements) : [];
  const usedIds = new Set<string>();
  const elements = rawElements.map((element, index) => normalizeElement(element, index, thickness, usedIds));

  return {
    schemaVersion: 1,
    displayUnit: source.displayUnit === 'cm' ? 'cm' : 'mm',
    unit: 'mm',
    title: cleanText(source.title, MONOGRAM_LIMITS.maxTitleLength).trim() || DEFAULT_TITLE,
    width,
    height,
    thickness,
    elements,
  };
}

function createLayerId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return `layer-${globalThis.crypto.randomUUID()}`;
  } catch {
    // Continue to a local fallback when a restricted runtime blocks crypto access.
  }
  return `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface AddedMonogramLayer {
  project: MonogramProject;
  layer: MonogramElement;
}

/** Adds a stable-ID text layer and returns both the updated project and the layer. */
export function createMonogramLayer(
  candidate: MonogramProject,
  overrides: MonogramLayerOverrides = {},
): AddedMonogramLayer {
  const project = normalizeMonogramProject(candidate);
  if (project.elements.length >= MONOGRAM_LIMITS.maxElements) {
    throw new RangeError(`Un diseño admite hasta ${MONOGRAM_LIMITS.maxElements} capas de texto.`);
  }

  const usedIds = new Set(project.elements.map((element) => element.id));
  let id = cleanId(overrides.id, createLayerId());
  const baseId = id;
  let suffix = 2;
  while (usedIds.has(id)) id = `${baseId}-${suffix++}`;

  const index = project.elements.length;
  const layer = normalizeElement({
    id,
    text: overrides.text ?? '',
    x: overrides.x ?? round(project.width * 0.1),
    y: overrides.y ?? round(project.height * 0.22),
    fontSize: overrides.fontSize ?? round(Math.min(project.height * 0.38, 32)),
    fontId: overrides.fontId ?? 'dm-sans',
    rotation: overrides.rotation ?? 0,
    depth: overrides.depth ?? project.thickness,
  }, index, project.thickness, new Set(usedIds));

  return {
    project: { ...project, elements: [...project.elements, layer] },
    layer,
  };
}

/** Returns a fresh project so editing a preset never mutates the preset catalog. */
export function createMonogramPreset(id: MonogramPresetId): MonogramProject {
  return normalizeMonogramProject(MONOGRAM_PRESETS[id].project);
}

/** Approximate text bounds; exact glyph metrics require the selected font engine. */
export function estimateMonogramLayerBounds(element: MonogramElement): MonogramLayerBounds {
  const text = Array.from(element.text);
  const fontScale = 0.58;
  const width = text.reduce((sum, character) => {
    if (/\s/u.test(character)) return sum + element.fontSize * fontScale * 0.58;
    if (/[ilI1.,'!|]/u.test(character)) return sum + element.fontSize * fontScale * 0.56;
    if (/[MW@%&#]/u.test(character)) return sum + element.fontSize * fontScale * 1.42;
    return sum + element.fontSize * fontScale;
  }, 0);
  const localCorners = [
    [0, -element.fontSize * 0.22],
    [width, -element.fontSize * 0.22],
    [width, element.fontSize * 0.86],
    [0, element.fontSize * 0.86],
  ] as const;
  const radians = (element.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const rotated = localCorners.map(([x, y]) => ({
    x: element.x + x * cosine - y * sine,
    y: element.y + x * sine + y * cosine,
  }));
  return {
    left: round(Math.min(...rotated.map((point) => point.x))),
    right: round(Math.max(...rotated.map((point) => point.x))),
    bottom: round(Math.min(...rotated.map((point) => point.y))),
    top: round(Math.max(...rotated.map((point) => point.y))),
  };
}

/**
 * Validates a normalized project and reports likely out-of-artboard text.
 * Bounds are estimates and may differ from actual glyph outlines.
 */
export function validateMonogramProject(project: MonogramProject): MonogramValidation {
  const errors: string[] = [];
  const warnings: MonogramWarning[] = [{
    code: 'layers-not-unioned',
    message: MONOGRAM_GEOMETRY_LIMITATION,
  }];
  const drawable = project.elements.filter((element) => element.text.trim().length > 0);
  if (drawable.length === 0) errors.push('Añade texto antes de generar el monograma.');

  for (const element of project.elements) {
    if (!element.text.trim()) {
      warnings.push({ code: 'empty-text', elementId: element.id, message: `La capa «${element.id}» está vacía y no generará contorno.` });
      continue;
    }
    const bounds = estimateMonogramLayerBounds(element);
    const outside: string[] = [];
    if (bounds.left < 0) outside.push('borde izquierdo');
    if (bounds.right > project.width) outside.push('borde derecho');
    if (bounds.bottom < 0) outside.push('borde inferior');
    if (bounds.top > project.height) outside.push('borde superior');
    if (outside.length > 0) {
      warnings.push({
        code: 'outside-artboard',
        elementId: element.id,
        estimatedBounds: bounds,
        message: `«${element.text}» podría salir del artboard por ${outside.join(', ')}. La revisión usa métricas aproximadas de texto.`,
      });
    }
  }

  return { isValid: errors.length === 0, errors, warnings };
}
