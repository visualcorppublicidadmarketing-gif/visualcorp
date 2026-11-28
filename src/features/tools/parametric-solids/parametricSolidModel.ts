export const PARAMETRIC_SOLIDS_FORMAT = 'visualcorp.parametric-solids' as const;
export const PARAMETRIC_SOLIDS_VERSION = 1 as const;
export const PARAMETRIC_SOLIDS_MAX_PRIMITIVES = 32;

export type PrimitiveKind = 'box' | 'cylinder' | 'cone' | 'sphere' | 'prism' | 'pyramid';
export type PrimitiveOperation = 'solid' | 'hole';

export interface PrimitiveTransform {
  xMm: number;
  yMm: number;
  zMm: number;
  rotationXDeg: number;
  rotationYDeg: number;
  rotationZDeg: number;
}

interface PrimitiveBase {
  id: string;
  name: string;
  operation: PrimitiveOperation;
  visible: boolean;
  color: string;
  transform: PrimitiveTransform;
}

export type ParametricPrimitive = PrimitiveBase & (
  | { type: 'box'; geometry: { widthMm: number; heightMm: number; depthMm: number } }
  | { type: 'cylinder'; geometry: { topRadiusMm: number; bottomRadiusMm: number; heightMm: number; sides: number } }
  | { type: 'cone'; geometry: { radiusMm: number; heightMm: number; sides: number } }
  | { type: 'sphere'; geometry: { radiusMm: number } }
  | { type: 'prism'; geometry: { radiusMm: number; heightMm: number; sides: number } }
  | { type: 'pyramid'; geometry: { radiusMm: number; heightMm: number; sides: number } }
);

export interface ParametricSolidsDocument {
  format: typeof PARAMETRIC_SOLIDS_FORMAT;
  version: typeof PARAMETRIC_SOLIDS_VERSION;
  id: string;
  title: string;
  units: 'mm';
  coordinateSystem: 'right-handed-y-up';
  primitives: ParametricPrimitive[];
}

const labels: Record<PrimitiveKind, string> = {
  box: 'Caja',
  cylinder: 'Cilindro',
  cone: 'Cono',
  sphere: 'Esfera',
  prism: 'Prisma',
  pyramid: 'Pirámide',
};

const colors = ['#9b83d5', '#55a9bd', '#e1a85f', '#75ad83', '#d9798d', '#798dcc'];

function makeId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`}`;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numeric(value: unknown, fallback: number, minimum: number, maximum: number, integer = false) {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const bounded = Math.min(maximum, Math.max(minimum, parsed));
  return integer ? Math.round(bounded) : bounded;
}

function safeText(value: unknown, fallback: string, maximum: number) {
  if (typeof value !== 'string') return fallback;
  const text = value.trim().slice(0, maximum);
  return text || fallback;
}

function transform(value: unknown): PrimitiveTransform {
  const source = record(value) ? value : {};
  return {
    xMm: numeric(source.xMm, 0, -10000, 10000),
    yMm: numeric(source.yMm, 0, -10000, 10000),
    zMm: numeric(source.zMm, 0, -10000, 10000),
    rotationXDeg: numeric(source.rotationXDeg, 0, -3600, 3600),
    rotationYDeg: numeric(source.rotationYDeg, 0, -3600, 3600),
    rotationZDeg: numeric(source.rotationZDeg, 0, -3600, 3600),
  };
}

function primitive(value: unknown, index: number): ParametricPrimitive {
  if (!record(value)) throw new Error(`La pieza ${index + 1} no es válida.`);
  const type = value.type as PrimitiveKind;
  const operation = value.operation as PrimitiveOperation;
  if (!['box', 'cylinder', 'cone', 'sphere', 'prism', 'pyramid'].includes(type)) throw new Error(`La pieza ${index + 1} usa una forma no compatible.`);
  if (operation !== 'solid' && operation !== 'hole') throw new Error(`La operación de la pieza ${index + 1} no es compatible.`);
  const geometry = record(value.geometry) ? value.geometry : {};
  const base: PrimitiveBase = {
    id: safeText(value.id, makeId('piece'), 100),
    name: safeText(value.name, `${labels[type]} ${index + 1}`, 80),
    operation,
    visible: typeof value.visible === 'boolean' ? value.visible : true,
    color: typeof value.color === 'string' && /^#[\da-f]{6}$/i.test(value.color) ? value.color : colors[index % colors.length],
    transform: transform(value.transform),
  };
  if (type === 'box') return { ...base, type, geometry: {
    widthMm: numeric(geometry.widthMm, 40, 0.1, 5000), heightMm: numeric(geometry.heightMm, 28, 0.1, 5000), depthMm: numeric(geometry.depthMm, 36, 0.1, 5000),
  } };
  if (type === 'cylinder') return { ...base, type, geometry: {
    topRadiusMm: numeric(geometry.topRadiusMm, 12, 0.1, 2500), bottomRadiusMm: numeric(geometry.bottomRadiusMm, 12, 0.1, 2500), heightMm: numeric(geometry.heightMm, 32, 0.1, 5000), sides: numeric(geometry.sides, 32, 8, 64, true),
  } };
  if (type === 'cone') return { ...base, type, geometry: {
    radiusMm: numeric(geometry.radiusMm, 14, 0.1, 2500), heightMm: numeric(geometry.heightMm, 32, 0.1, 5000), sides: numeric(geometry.sides, 32, 8, 64, true),
  } };
  if (type === 'sphere') return { ...base, type, geometry: { radiusMm: numeric(geometry.radiusMm, 14, 0.1, 2500) } };
  if (type === 'prism') return { ...base, type, geometry: {
    radiusMm: numeric(geometry.radiusMm, 14, 0.1, 2500), heightMm: numeric(geometry.heightMm, 32, 0.1, 5000), sides: numeric(geometry.sides, 3, 3, 12, true),
  } };
  return { ...base, type, geometry: {
    radiusMm: numeric(geometry.radiusMm, 18, 0.1, 2500), heightMm: numeric(geometry.heightMm, 32, 0.1, 5000), sides: numeric(geometry.sides, 4, 3, 12, true),
  } };
}

export function normalizeParametricSolidsDocument(value: unknown): ParametricSolidsDocument {
  if (!record(value) || value.format !== PARAMETRIC_SOLIDS_FORMAT || value.version !== PARAMETRIC_SOLIDS_VERSION) {
    throw new Error('El archivo no es un modelo paramétrico de sólidos compatible.');
  }
  if (!Array.isArray(value.primitives) || value.primitives.length > PARAMETRIC_SOLIDS_MAX_PRIMITIVES) {
    throw new Error(`El modelo debe tener hasta ${PARAMETRIC_SOLIDS_MAX_PRIMITIVES} piezas.`);
  }
  const primitives = value.primitives.map(primitive);
  const ids = new Set(primitives.map((item) => item.id));
  if (ids.size !== primitives.length) throw new Error('El modelo contiene IDs de pieza repetidos.');
  return {
    format: PARAMETRIC_SOLIDS_FORMAT,
    version: PARAMETRIC_SOLIDS_VERSION,
    id: safeText(value.id, makeId('model'), 100),
    title: safeText(value.title, 'Modelo paramétrico', 100),
    units: 'mm',
    coordinateSystem: 'right-handed-y-up',
    primitives,
  };
}

export function createEmptyParametricSolidsDocument(): ParametricSolidsDocument {
  return normalizeParametricSolidsDocument({
    format: PARAMETRIC_SOLIDS_FORMAT,
    version: PARAMETRIC_SOLIDS_VERSION,
    id: makeId('model'),
    title: 'Modelo paramétrico',
    units: 'mm',
    coordinateSystem: 'right-handed-y-up',
    primitives: [],
  });
}

export function createParametricSolidsSample(): ParametricSolidsDocument {
  const model = createEmptyParametricSolidsDocument();
  model.title = 'Figura compuesta';
  model.primitives = [
    primitive({ id: 'base', name: 'Base', type: 'box', operation: 'solid', visible: true, color: '#9b83d5', transform: { xMm: 0, yMm: 17, zMm: 0 }, geometry: { widthMm: 96, heightMm: 34, depthMm: 72 } }, 0),
    primitive({ id: 'respaldo', name: 'Respaldo', type: 'box', operation: 'solid', visible: true, color: '#55a9bd', transform: { xMm: -32, yMm: 62, zMm: 0 }, geometry: { widthMm: 30, heightMm: 56, depthMm: 72 } }, 1),
    primitive({ id: 'perforacion', name: 'Perforación', type: 'cylinder', operation: 'hole', visible: true, color: '#e36c73', transform: { xMm: 25, yMm: 17, zMm: 0 }, geometry: { topRadiusMm: 9, bottomRadiusMm: 9, heightMm: 46, sides: 32 } }, 2),
  ];
  return model;
}

export function createParametricPrimitive(type: PrimitiveKind, operation: PrimitiveOperation, index: number, colorIndex = index): ParametricPrimitive {
  const geometryByType: Record<PrimitiveKind, Record<string, number>> = {
    box: { widthMm: 40, heightMm: 28, depthMm: 36 },
    cylinder: { topRadiusMm: 12, bottomRadiusMm: 12, heightMm: 32, sides: 32 },
    cone: { radiusMm: 14, heightMm: 32, sides: 32 },
    sphere: { radiusMm: 14 },
    prism: { radiusMm: 14, heightMm: 32, sides: 3 },
    pyramid: { radiusMm: 18, heightMm: 32, sides: 4 },
  };
  return primitive({
    id: makeId('piece'), name: `${labels[type]} ${index + 1}`, type, operation, visible: true,
    color: colors[colorIndex % colors.length], transform: { xMm: 0, yMm: 0, zMm: 0 }, geometry: geometryByType[type],
  }, index);
}

export function primitiveHalfExtents(item: ParametricPrimitive) {
  if (item.type === 'sphere') return { x: item.geometry.radiusMm, y: item.geometry.radiusMm, z: item.geometry.radiusMm };
  const local = item.type === 'box'
    ? { x: item.geometry.widthMm / 2, y: item.geometry.heightMm / 2, z: item.geometry.depthMm / 2 }
    : {
      x: item.type === 'cylinder' ? Math.max(item.geometry.topRadiusMm, item.geometry.bottomRadiusMm) : item.geometry.radiusMm,
      y: item.geometry.heightMm / 2,
      z: item.type === 'cylinder' ? Math.max(item.geometry.topRadiusMm, item.geometry.bottomRadiusMm) : item.geometry.radiusMm,
    };
  const rx = THREE_DEG_TO_RAD * item.transform.rotationXDeg;
  const ry = THREE_DEG_TO_RAD * item.transform.rotationYDeg;
  const rz = THREE_DEG_TO_RAD * item.transform.rotationZDeg;
  const sx = Math.sin(rx), cx = Math.cos(rx);
  const sy = Math.sin(ry), cy = Math.cos(ry);
  const sz = Math.sin(rz), cz = Math.cos(rz);
  const rotationRows = [
    [cy * cz, -cy * sz, sy],
    [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy],
    [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy],
  ];
  return {
    x: Math.abs(rotationRows[0][0]) * local.x + Math.abs(rotationRows[0][1]) * local.y + Math.abs(rotationRows[0][2]) * local.z,
    y: Math.abs(rotationRows[1][0]) * local.x + Math.abs(rotationRows[1][1]) * local.y + Math.abs(rotationRows[1][2]) * local.z,
    z: Math.abs(rotationRows[2][0]) * local.x + Math.abs(rotationRows[2][1]) * local.y + Math.abs(rotationRows[2][2]) * local.z,
  };
}

const THREE_DEG_TO_RAD = Math.PI / 180;

export function primitiveLabel(type: PrimitiveKind) {
  return labels[type];
}
