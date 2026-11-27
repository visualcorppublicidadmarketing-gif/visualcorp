import { sanitizeVectorSvg } from './svgSafety';

export const VECTOR_MODEL_FORMAT = 'visualcorp.vector-model' as const;
export const VECTOR_MODEL_SCHEMA_VERSION = 1 as const;
export const VECTOR_MODEL_EXTENSION = '.vcvector.json';

export type VectorFaceColors = { front: string; back: string; side: string };
export type VectorUnit = 'mm' | 'cm' | 'in' | 'pt' | 'pc' | 'px' | null;
export type VectorDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface VectorDiagnostic {
  id: string;
  severity: VectorDiagnosticSeverity;
  message: string;
  layerId?: string;
}

export interface VectorModelLayer {
  id: string;
  name: string;
  sourcePathIndex: number;
  visible: boolean;
  fillRule: 'evenodd' | 'nonzero';
  color: string;
  strokeColor: string | null;
  strokeWidthMm: number;
  opacity: number;
  widthMm: number;
  heightMm: number;
  xMm: number;
  yMm: number;
  rotationDeg: number;
  scaleX: number;
  scaleY: number;
  thicknessMm: number | null;
  faceColors: Partial<VectorFaceColors>;
  isClosed: boolean;
  canExtrude: boolean;
}

export type VectorControlType = 'number' | 'length' | 'color' | 'select' | 'boolean' | 'text';
export type VectorControlTarget =
  | 'document.widthMm' | 'document.heightMm' | 'document.thicknessMm'
  | 'layer.widthMm' | 'layer.heightMm' | 'layer.xMm' | 'layer.yMm'
  | 'layer.rotationDeg' | 'layer.scaleX' | 'layer.scaleY' | 'layer.thicknessMm'
  | 'layer.color' | 'layer.strokeColor' | 'layer.strokeWidthMm'
  | 'layer.faceColors.front' | 'layer.faceColors.back' | 'layer.faceColors.side' | 'custom.parameter';
export type VectorControlValue = string | number | boolean;

export interface VectorCustomControl {
  id: string;
  label: string;
  type: VectorControlType;
  target: VectorControlTarget;
  targetLayerId?: string;
  defaultValue: VectorControlValue;
  unit?: 'mm' | 'deg' | 'ratio' | '%' | 'text';
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface VectorModelDocument {
  format: typeof VECTOR_MODEL_FORMAT;
  schemaVersion: typeof VECTOR_MODEL_SCHEMA_VERSION;
  metadata: {
    id: string;
    title: string;
    sourceFileName: string;
    sourceFormat: 'svg';
    sourceBytes: number;
    createdAt: string;
  };
  coordinateSystem: {
    handedness: 'right';
    plane: 'XY';
    origin: 'lower-left';
    extrusionAxis: '+Z';
    lengthUnit: 'mm';
  };
  source: {
    svgText: string;
    viewBox: { x: number; y: number; width: number; height: number };
    widthMm: number;
    heightMm: number;
    mmPerSourceUnit: number;
    scaleConfirmed: boolean;
    sourceUnits: VectorUnit;
  };
  defaults: {
    thicknessMm: number;
    faceColors: Partial<VectorFaceColors>;
    bevelEnabled: boolean;
    bevelSizeMm: number;
    bevelThicknessMm: number;
  };
  layers: VectorModelLayer[];
  controls: VectorCustomControl[];
  controlValues: Record<string, VectorControlValue>;
  diagnostics: VectorDiagnostic[];
}

export interface VectorImportResult {
  document: VectorModelDocument;
  warnings: VectorDiagnostic[];
}

export const VECTOR_CONTROL_TARGETS: Array<{ value: VectorControlTarget; label: string; type: VectorControlType }> = [
  { value: 'custom.parameter', label: 'Parámetro personalizado (solo JSON)', type: 'text' },
  { value: 'document.widthMm', label: 'Modelo · ancho', type: 'length' },
  { value: 'document.heightMm', label: 'Modelo · alto', type: 'length' },
  { value: 'document.thicknessMm', label: 'Modelo · espesor predeterminado', type: 'length' },
  { value: 'layer.widthMm', label: 'Pieza · ancho', type: 'length' },
  { value: 'layer.heightMm', label: 'Pieza · alto', type: 'length' },
  { value: 'layer.xMm', label: 'Pieza · posición X', type: 'length' },
  { value: 'layer.yMm', label: 'Pieza · posición Y', type: 'length' },
  { value: 'layer.rotationDeg', label: 'Pieza · rotación', type: 'number' },
  { value: 'layer.scaleX', label: 'Pieza · escala X', type: 'number' },
  { value: 'layer.scaleY', label: 'Pieza · escala Y', type: 'number' },
  { value: 'layer.thicknessMm', label: 'Pieza · espesor', type: 'length' },
  { value: 'layer.color', label: 'Pieza · color', type: 'color' },
  { value: 'layer.strokeColor', label: 'Pieza · color de trazo', type: 'color' },
  { value: 'layer.strokeWidthMm', label: 'Pieza · ancho de trazo', type: 'length' },
  { value: 'layer.faceColors.front', label: 'Pieza · cara frontal', type: 'color' },
  { value: 'layer.faceColors.back', label: 'Pieza · cara posterior', type: 'color' },
  { value: 'layer.faceColors.side', label: 'Pieza · lateral', type: 'color' },
];

export function createDefaultVectorModel(): VectorModelDocument {
  const now = new Date().toISOString();
  return {
    format: VECTOR_MODEL_FORMAT,
    schemaVersion: VECTOR_MODEL_SCHEMA_VERSION,
    metadata: { id: makeId('vector'), title: 'Modelo vectorial sin nombre', sourceFileName: '', sourceFormat: 'svg', sourceBytes: 0, createdAt: now },
    coordinateSystem: { handedness: 'right', plane: 'XY', origin: 'lower-left', extrusionAxis: '+Z', lengthUnit: 'mm' },
    source: { svgText: '', viewBox: { x: 0, y: 0, width: 100, height: 100 }, widthMm: 100, heightMm: 100, mmPerSourceUnit: 1, scaleConfirmed: false, sourceUnits: null },
    defaults: { thicknessMm: 3, faceColors: {}, bevelEnabled: false, bevelSizeMm: 0.25, bevelThicknessMm: 0.25 },
    layers: [], controls: [], controlValues: {}, diagnostics: [],
  };
}

export function cloneVectorModel(document: VectorModelDocument): VectorModelDocument {
  return {
    ...document,
    metadata: { ...document.metadata },
    coordinateSystem: { ...document.coordinateSystem },
    source: { ...document.source, viewBox: { ...document.source.viewBox } },
    defaults: { ...document.defaults, faceColors: { ...document.defaults.faceColors } },
    layers: document.layers.map((layer) => ({ ...layer, faceColors: { ...layer.faceColors } })),
    controls: document.controls.map((control) => ({ ...control, options: control.options ? [...control.options] : undefined })),
    controlValues: { ...document.controlValues },
    diagnostics: document.diagnostics.map((diagnostic) => ({ ...diagnostic })),
  };
}

export function makeId(prefix = 'item') {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${uuid ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertOnlyKeys(record: Record<string, unknown>, keys: string[], context: string) {
  if (Object.keys(record).some((key) => !keys.includes(key))) throw new Error(`El objeto ${context} contiene una propiedad que no pertenece al esquema v1.`);
}

function isFiniteBetween(value: unknown, minimum: number, maximum: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function assertVectorDocument(value: unknown): asserts value is VectorModelDocument {
  if (!isRecord(value) || value.format !== VECTOR_MODEL_FORMAT || value.schemaVersion !== VECTOR_MODEL_SCHEMA_VERSION) {
    throw new Error('El archivo no es un modelo vectorial compatible (se requiere visualcorp.vector-model, versión 1).');
  }
  assertOnlyKeys(value, ['format', 'schemaVersion', 'metadata', 'coordinateSystem', 'source', 'defaults', 'layers', 'controls', 'controlValues', 'diagnostics'], 'principal');
  if (!isRecord(value.metadata) || !isRecord(value.coordinateSystem) || !isRecord(value.source) || !isRecord(value.defaults)) {
    throw new Error('El modelo está incompleto: faltan sus metadatos, coordenadas, fuente o configuración.');
  }
  const { metadata, coordinateSystem, source, defaults } = value;
  assertOnlyKeys(metadata, ['id', 'title', 'sourceFileName', 'sourceFormat', 'sourceBytes', 'createdAt'], 'metadata');
  assertOnlyKeys(coordinateSystem, ['handedness', 'plane', 'origin', 'extrusionAxis', 'lengthUnit'], 'coordinateSystem');
  assertOnlyKeys(source, ['svgText', 'viewBox', 'widthMm', 'heightMm', 'mmPerSourceUnit', 'scaleConfirmed', 'sourceUnits'], 'source');
  assertOnlyKeys(defaults, ['thicknessMm', 'faceColors', 'bevelEnabled', 'bevelSizeMm', 'bevelThicknessMm'], 'defaults');
  if (metadata.sourceFormat !== 'svg' || typeof metadata.id !== 'string' || !/^[\w.-]{1,160}$/.test(metadata.id) || typeof metadata.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(metadata.createdAt) || !Number.isFinite(Date.parse(metadata.createdAt)) || typeof metadata.title !== 'string' || metadata.title.length > 100 || typeof metadata.sourceFileName !== 'string' || metadata.sourceFileName.length > 240 || !isFiniteBetween(metadata.sourceBytes, 0, MAX_VECTOR_FILE_BYTES) || !Number.isInteger(metadata.sourceBytes)) {
    throw new Error('Los metadatos del archivo no son válidos.');
  }
  if (coordinateSystem.handedness !== 'right' || coordinateSystem.plane !== 'XY' || coordinateSystem.origin !== 'lower-left' || coordinateSystem.extrusionAxis !== '+Z' || coordinateSystem.lengthUnit !== 'mm') {
    throw new Error('El modelo declara un sistema de coordenadas no compatible.');
  }
  if (typeof source.svgText !== 'string' || new TextEncoder().encode(source.svgText).byteLength > MAX_VECTOR_FILE_BYTES) {
    throw new Error('El SVG guardado en el proyecto supera el límite permitido.');
  }
  if (!isRecord(source.viewBox) || !isFiniteBetween(source.viewBox.x, -1e7, 1e7) || !isFiniteBetween(source.viewBox.y, -1e7, 1e7) || !isFiniteBetween(source.viewBox.width, 0.001, 1e7) || !isFiniteBetween(source.viewBox.height, 0.001, 1e7)) {
    throw new Error('El área de trabajo del vector no es válida.');
  }
  assertOnlyKeys(source.viewBox, ['x', 'y', 'width', 'height'], 'viewBox');
  if (!isFiniteBetween(source.widthMm, 0.001, 1e7) || !isFiniteBetween(source.heightMm, 0.001, 1e7) || !isFiniteBetween(source.mmPerSourceUnit, 1e-8, 1e7)) {
    throw new Error('La escala o las medidas físicas del modelo no son válidas.');
  }
  if (typeof source.scaleConfirmed !== 'boolean' || !(source.sourceUnits === null || ['mm', 'cm', 'in', 'pt', 'pc', 'px'].includes(String(source.sourceUnits)))) throw new Error('Las unidades de origen del modelo no son válidas.');
  if (!isFiniteBetween(defaults.thicknessMm, 0.001, 1e5) || !isFiniteBetween(defaults.bevelSizeMm, 0, 1e5) || !isFiniteBetween(defaults.bevelThicknessMm, 0, 1e5) || typeof defaults.bevelEnabled !== 'boolean' || !isRecord(defaults.faceColors) || !['front', 'back', 'side'].every((face) => defaults.faceColors[face] === undefined || isHexColor(defaults.faceColors[face]))) {
    throw new Error('Los valores predeterminados de extrusión o color no son válidos.');
  }
  assertOnlyKeys(defaults.faceColors, ['front', 'back', 'side'], 'defaults.faceColors');
  if (!Array.isArray(value.layers) || value.layers.length > MAX_VECTOR_LAYERS) throw new Error('La cantidad de piezas no es válida.');
  const layerIds = new Set<string>();
  for (const item of value.layers) {
    if (!isRecord(item) || typeof item.id !== 'string' || !/^[\w.-]{1,160}$/.test(item.id) || layerIds.has(item.id) || typeof item.name !== 'string' || item.name.length > 160) throw new Error('El archivo contiene una pieza con identidad inválida o repetida.');
    assertOnlyKeys(item, ['id', 'name', 'sourcePathIndex', 'visible', 'fillRule', 'color', 'strokeColor', 'strokeWidthMm', 'opacity', 'widthMm', 'heightMm', 'xMm', 'yMm', 'rotationDeg', 'scaleX', 'scaleY', 'thicknessMm', 'faceColors', 'isClosed', 'canExtrude'], 'layer');
    layerIds.add(item.id);
    if (!Number.isInteger(item.sourcePathIndex) || !isFiniteBetween(item.sourcePathIndex, 0, MAX_VECTOR_LAYERS) || typeof item.visible !== 'boolean' || !['evenodd', 'nonzero'].includes(String(item.fillRule))) throw new Error(`La pieza «${item.name}» tiene datos de origen no válidos.`);
    for (const field of ['opacity', 'widthMm', 'heightMm', 'xMm', 'yMm', 'rotationDeg', 'scaleX', 'scaleY']) {
      if (typeof item[field] !== 'number' || !Number.isFinite(item[field])) throw new Error(`La pieza «${item.name}» tiene un valor no finito en ${field}.`);
    }
    if (Number(item.widthMm) < 0 || Number(item.widthMm) > 1e7 || Number(item.heightMm) < 0 || Number(item.heightMm) > 1e7 || Math.abs(Number(item.xMm)) > 1e7 || Math.abs(Number(item.yMm)) > 1e7 || Math.abs(Number(item.rotationDeg)) > 1e7 || Number(item.opacity) < 0 || Number(item.opacity) > 1 || Math.abs(Number(item.scaleX)) < 0.001 || Math.abs(Number(item.scaleX)) > 1e4 || Math.abs(Number(item.scaleY)) < 0.001 || Math.abs(Number(item.scaleY)) > 1e4) throw new Error(`La pieza «${item.name}» excede los límites del modelo.`);
    if (item.thicknessMm !== null && !isFiniteBetween(item.thicknessMm, 0.001, 1e5)) throw new Error(`El espesor de «${item.name}» no es válido.`);
    if (typeof item.color !== 'string' || !isHexColor(item.color) || !(item.strokeColor === null || isHexColor(item.strokeColor)) || !isFiniteBetween(item.strokeWidthMm, 0, 1e5) || !isRecord(item.faceColors)) throw new Error(`Los colores o el trazo de «${item.name}» no son válidos.`);
    assertOnlyKeys(item.faceColors, ['front', 'back', 'side'], 'layer.faceColors');
    for (const face of ['front', 'back', 'side']) if (item.faceColors[face] !== undefined && !isHexColor(item.faceColors[face])) throw new Error(`El color de cara de «${item.name}» no es válido.`);
    if (typeof item.isClosed !== 'boolean' || typeof item.canExtrude !== 'boolean') throw new Error(`El estado geométrico de «${item.name}» no es válido.`);
    if (item.canExtrude && (!item.isClosed || item.fillRule === 'evenodd')) throw new Error(`La pieza «${item.name}» declara una extrusión incompatible con su geometría.`);
  }
  if (!Array.isArray(value.controls) || value.controls.length > MAX_CUSTOM_CONTROLS || !isRecord(value.controlValues)) throw new Error('La lista de controles personalizados no es válida.');
  const controlIds = new Set<string>();
  for (const control of value.controls) {
    if (!isRecord(control) || typeof control.id !== 'string' || !/^[\w.-]{1,160}$/.test(control.id) || controlIds.has(control.id) || typeof control.label !== 'string' || control.label.length < 1 || control.label.length > 80) throw new Error('Hay un control con identificador o etiqueta inválidos.');
    assertOnlyKeys(control, ['id', 'label', 'type', 'target', 'targetLayerId', 'defaultValue', 'unit', 'min', 'max', 'step', 'options'], 'control');
    controlIds.add(control.id);
    if (!CONTROL_TYPES.includes(control.type as VectorControlType) || !CONTROL_TARGET_SET.has(String(control.target))) throw new Error(`El control «${control.label}» tiene un tipo o destino no permitido.`);
    const targetMetadata = VECTOR_CONTROL_TARGETS.find((target) => target.value === control.target);
    if (control.target !== 'custom.parameter' && targetMetadata?.type !== control.type) throw new Error(`El tipo de «${control.label}» no coincide con su propiedad de destino.`);
    if (control.unit !== undefined && !['mm', 'deg', 'ratio', '%', 'text'].includes(String(control.unit))) throw new Error(`La unidad de «${control.label}» no está permitida.`);
    if (String(control.target).startsWith('layer.') && (typeof control.targetLayerId !== 'string' || !control.targetLayerId || !layerIds.has(control.targetLayerId))) throw new Error(`El control «${control.label}» debe apuntar a una pieza existente.`);
    if (control.targetLayerId !== undefined && (typeof control.targetLayerId !== 'string' || !layerIds.has(control.targetLayerId))) throw new Error(`El control «${control.label}» apunta a una pieza que ya no existe.`);
    if (control.type === 'number' || control.type === 'length') {
      if (typeof control.defaultValue !== 'number' || !Number.isFinite(control.defaultValue)) throw new Error(`El valor inicial de «${control.label}» no es válido.`);
      for (const key of ['min', 'max', 'step']) if (control[key] !== undefined && (typeof control[key] !== 'number' || !Number.isFinite(control[key]))) throw new Error(`Los límites de «${control.label}» no son válidos.`);
      if (typeof control.step === 'number' && control.step <= 0) throw new Error(`El incremento de «${control.label}» debe ser mayor que cero.`);
      if (typeof control.min === 'number' && typeof control.max === 'number' && control.min > control.max) throw new Error(`El rango de «${control.label}» está invertido.`);
      if ((typeof control.min === 'number' && Number(control.defaultValue) < control.min) || (typeof control.max === 'number' && Number(control.defaultValue) > control.max)) throw new Error(`El valor inicial de «${control.label}» queda fuera del rango.`);
    } else if (control.type === 'boolean') {
      if (typeof control.defaultValue !== 'boolean') throw new Error(`El valor inicial de «${control.label}» debe ser booleano.`);
    } else if (typeof control.defaultValue !== 'string') throw new Error(`El valor inicial de «${control.label}» debe ser texto.`);
    if (control.type === 'color' && !isHexColor(control.defaultValue)) throw new Error(`El color inicial de «${control.label}» no es válido.`);
    if (typeof control.defaultValue === 'string' && control.defaultValue.length > 500) throw new Error(`El valor inicial de «${control.label}» es demasiado largo.`);
    if (control.type === 'select' && (!Array.isArray(control.options) || control.options.length < 1 || !control.options.includes(control.defaultValue))) throw new Error(`El control «${control.label}» requiere opciones y un valor inicial existente.`);
    if (control.options && (!Array.isArray(control.options) || control.options.length > 40 || control.options.some((option) => typeof option !== 'string' || option.length > 80))) throw new Error(`Las opciones de «${control.label}» no son válidas.`);
  }
  for (const [id, controlValue] of Object.entries(value.controlValues)) {
    const control = value.controls.find((item) => item.id === id);
    if (!control || !(typeof controlValue === 'string' || typeof controlValue === 'boolean' || (typeof controlValue === 'number' && Number.isFinite(controlValue)))) throw new Error('El modelo incluye valores de controles incompatibles.');
    const expectedType = control.type === 'number' || control.type === 'length' ? 'number' : control.type === 'boolean' ? 'boolean' : 'string';
    if (typeof controlValue !== expectedType) throw new Error(`El control «${control.label}» guarda un valor de tipo incorrecto.`);
    if (control.target === 'custom.parameter' && normalizeControlValue(control, controlValue as VectorControlValue) !== controlValue) throw new Error(`El valor actual de «${control.label}» no coincide con sus restricciones.`);
  }
  if (value.controls.some((control) => !Object.prototype.hasOwnProperty.call(value.controlValues, control.id))) throw new Error('Falta un valor actual para uno de los controles personalizados.');
  if (!Array.isArray(value.diagnostics) || value.diagnostics.length > 400 || value.diagnostics.some((item) => !isRecord(item) || typeof item.id !== 'string' || item.id.length > 160 || typeof item.message !== 'string' || item.message.length > 500 || !['info', 'warning', 'error'].includes(String(item.severity)) || (item.layerId !== undefined && (typeof item.layerId !== 'string' || !/^[\w.-]{1,160}$/.test(item.layerId) || !layerIds.has(item.layerId))))) throw new Error('El reporte de importación excede el límite permitido o incluye datos no válidos.');
  value.diagnostics.forEach((item) => assertOnlyKeys(item as Record<string, unknown>, ['id', 'severity', 'message', 'layerId'], 'diagnostic'));
}

const CONTROL_TYPES: VectorControlType[] = ['number', 'length', 'color', 'select', 'boolean', 'text'];
const CONTROL_TARGET_SET = new Set<string>(VECTOR_CONTROL_TARGETS.map((target) => target.value));
const MAX_VECTOR_FILE_BYTES = 8 * 1024 * 1024;
const MAX_VECTOR_LAYERS = 600;
const MAX_CUSTOM_CONTROLS = 80;
let cachedSvgGeometryText: string | null = null;
let cachedSvgGeometryCount = 0;
let cachedSanitizedSvgText = '';

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
}

export function validateVectorModelDocument(value: unknown): VectorModelDocument {
  assertVectorDocument(value);
  return value;
}

export function serializeVectorModel(document: VectorModelDocument): string {
  validateVectorModelDocument(document);
  const sanitized = getSanitizedSvgData(document.source.svgText);
  if (document.layers.some((layer) => layer.sourcePathIndex >= sanitized.pathCount)) throw new Error('Una pieza no apunta a una ruta geométrica del SVG guardado.');
  const exportDocument = sanitized.svgText === document.source.svgText ? document : { ...document, source: { ...document.source, svgText: sanitized.svgText } };
  const output = JSON.stringify(exportDocument, null, 2);
  if (new TextEncoder().encode(output).byteLength > MAX_VECTOR_FILE_BYTES * 4) throw new Error('El JSON supera el límite de 32 MiB. Simplifica el SVG para poder guardarlo.');
  return output;
}

function getSanitizedSvgData(svgText: string) {
  if (!svgText) return { svgText: '', pathCount: 0 };
  if (cachedSvgGeometryText !== svgText) {
    const sanitized = sanitizeVectorSvg(svgText);
    cachedSvgGeometryCount = sanitized.pathCount;
    cachedSanitizedSvgText = sanitized.svgText;
    cachedSvgGeometryText = svgText;
  }
  return { svgText: cachedSanitizedSvgText, pathCount: cachedSvgGeometryCount };
}

export function parseVectorModelFile(text: string): VectorModelDocument {
  if (new TextEncoder().encode(text).byteLength > MAX_VECTOR_FILE_BYTES * 4) throw new Error('El archivo JSON supera el límite permitido de 32 MiB.');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('No se pudo leer el archivo: el JSON está dañado o incompleto.'); }
  const document = validateVectorModelDocument(parsed);
  const safeSvg = getSanitizedSvgData(document.source.svgText);
  if (document.layers.some((layer) => layer.sourcePathIndex >= safeSvg.pathCount)) {
    throw new Error('El JSON contiene piezas que no apuntan a una ruta del SVG guardado.');
  }
  const normalizedDocument = cloneVectorModel(document);
  normalizedDocument.source.svgText = safeSvg.svgText;
  return syncTargetControlValues(normalizedDocument);
}

export function applyVectorControlValue(document: VectorModelDocument, controlId: string, value: VectorControlValue): VectorModelDocument {
  const control = document.controls.find((item) => item.id === controlId);
  if (!control) throw new Error('El control personalizado ya no existe.');
  const normalized = normalizeControlValue(control, value);
  const next = cloneVectorModel(document);
  next.controlValues[control.id] = normalized;
  const target = control.target;
  if (target === 'custom.parameter') return next;
  if (target.startsWith('document.')) {
    const key = target.slice('document.'.length) as 'widthMm' | 'heightMm' | 'thicknessMm';
    if (key === 'thicknessMm') next.defaults.thicknessMm = Number(normalized);
    else {
      const previous = next.source[key];
      const ratio = previous > 0 ? Number(normalized) / previous : 1;
      next.source.widthMm *= ratio;
      next.source.heightMm *= ratio;
      next.source[key] = Number(normalized);
      const sourceDimension = key === 'widthMm' ? next.source.viewBox.width : next.source.viewBox.height;
      const proposedScale = sourceDimension > 0 ? next.source[key] / sourceDimension : next.source.mmPerSourceUnit;
      if (!Number.isFinite(proposedScale) || proposedScale < 1e-8 || proposedScale > 1e7) throw new Error('La escala física resultante excede el límite compatible.');
      next.source.mmPerSourceUnit = proposedScale;
      next.source.scaleConfirmed = true;
      next.layers.forEach((layer) => {
        layer.xMm *= ratio; layer.yMm *= ratio; layer.widthMm *= ratio; layer.heightMm *= ratio; layer.strokeWidthMm *= ratio;
      });
      if (next.layers.some((layer) => Math.abs(layer.xMm) > 1e7 || Math.abs(layer.yMm) > 1e7 || layer.widthMm > 1e7 || layer.heightMm > 1e7 || layer.strokeWidthMm > 1e5)) throw new Error('La nueva medida deja una pieza fuera de los límites del modelo.');
    }
    return syncTargetControlValues(next);
  }
  const layer = next.layers.find((item) => item.id === control.targetLayerId) ?? (next.layers.length === 1 ? next.layers[0] : undefined);
  if (!layer) throw new Error('Selecciona una pieza para aplicar este control.');
  if (target === 'layer.widthMm' || target === 'layer.heightMm') {
    const field = target === 'layer.widthMm' ? 'widthMm' : 'heightMm';
    const current = layer[field];
    const ratio = current > 0 ? Number(normalized) / current : 1;
    layer[field] = Number(normalized);
    if (field === 'widthMm') layer.scaleX *= ratio;
    else layer.scaleY *= ratio;
  } else if (target === 'layer.color') {
    layer.color = String(normalized);
    layer.faceColors = { front: layer.color, back: layer.color, side: layer.color };
  } else if (target === 'layer.strokeColor') layer.strokeColor = String(normalized);
  else if (target === 'layer.strokeWidthMm') layer.strokeWidthMm = Number(normalized);
  else if (target.startsWith('layer.faceColors.')) layer.faceColors[target.split('.').at(-1) as keyof VectorFaceColors] = String(normalized);
  else if (target === 'layer.thicknessMm') layer.thicknessMm = Number(normalized);
  else if (target === 'layer.xMm') layer.xMm = Number(normalized);
  else if (target === 'layer.yMm') layer.yMm = Number(normalized);
  else if (target === 'layer.rotationDeg') layer.rotationDeg = Number(normalized);
  else if (target === 'layer.scaleX') layer.scaleX = Number(normalized);
  else if (target === 'layer.scaleY') layer.scaleY = Number(normalized);
  return syncTargetControlValues(next);
}

function syncTargetControlValues(document: VectorModelDocument): VectorModelDocument {
  for (const control of document.controls) {
    if (control.target === 'custom.parameter') continue;
    if (control.target === 'document.widthMm') document.controlValues[control.id] = document.source.widthMm;
    else if (control.target === 'document.heightMm') document.controlValues[control.id] = document.source.heightMm;
    else if (control.target === 'document.thicknessMm') document.controlValues[control.id] = document.defaults.thicknessMm;
    else {
      const layer = document.layers.find((item) => item.id === control.targetLayerId) ?? (document.layers.length === 1 ? document.layers[0] : undefined);
      if (!layer) continue;
      if (control.target === 'layer.widthMm') document.controlValues[control.id] = layer.widthMm;
      else if (control.target === 'layer.heightMm') document.controlValues[control.id] = layer.heightMm;
      else if (control.target === 'layer.xMm') document.controlValues[control.id] = layer.xMm;
      else if (control.target === 'layer.yMm') document.controlValues[control.id] = layer.yMm;
      else if (control.target === 'layer.rotationDeg') document.controlValues[control.id] = layer.rotationDeg;
      else if (control.target === 'layer.scaleX') document.controlValues[control.id] = layer.scaleX;
      else if (control.target === 'layer.scaleY') document.controlValues[control.id] = layer.scaleY;
      else if (control.target === 'layer.thicknessMm') document.controlValues[control.id] = layer.thicknessMm ?? document.defaults.thicknessMm;
      else if (control.target === 'layer.color') document.controlValues[control.id] = layer.color;
      else if (control.target === 'layer.strokeColor') document.controlValues[control.id] = layer.strokeColor ?? layer.color;
      else if (control.target === 'layer.strokeWidthMm') document.controlValues[control.id] = layer.strokeWidthMm;
      else if (control.target === 'layer.faceColors.front') document.controlValues[control.id] = layer.faceColors.front ?? document.defaults.faceColors.front ?? layer.color;
      else if (control.target === 'layer.faceColors.back') document.controlValues[control.id] = layer.faceColors.back ?? document.defaults.faceColors.back ?? layer.color;
      else if (control.target === 'layer.faceColors.side') document.controlValues[control.id] = layer.faceColors.side ?? document.defaults.faceColors.side ?? layer.color;
    }
  }
  return document;
}

function normalizeControlValue(control: VectorCustomControl, value: VectorControlValue): VectorControlValue {
  if (control.type === 'number' || control.type === 'length') {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) throw new Error(`El control «${control.label}» requiere un número válido.`);
    const positiveTarget = ['document.widthMm', 'document.heightMm', 'document.thicknessMm', 'layer.widthMm', 'layer.heightMm', 'layer.thicknessMm'].includes(control.target);
    const isScale = control.target === 'layer.scaleX' || control.target === 'layer.scaleY';
    const isStrokeWidth = control.target === 'layer.strokeWidthMm';
    if (isScale && Math.abs(number) < 0.001) throw new Error(`La escala de «${control.label}» no puede ser cero.`);
    const minimum = Math.max(positiveTarget ? 0.001 : isScale ? -1e4 : isStrokeWidth ? 0 : -1e7, control.min ?? (positiveTarget ? 0.001 : isScale ? -1e4 : isStrokeWidth ? 0 : -1e7));
    const maximum = Math.min(isScale ? 1e4 : isStrokeWidth || positiveTarget && control.target.includes('thickness') ? 1e5 : 1e7, control.max ?? 1e7);
    if (minimum > maximum) throw new Error(`El rango definido para «${control.label}» no cabe en los límites de la propiedad.`);
    return Math.max(minimum, Math.min(maximum, number));
  }
  if (control.type === 'boolean') return Boolean(value);
  if (control.type === 'color') {
    if (!isHexColor(value)) throw new Error(`El color de «${control.label}» debe usar formato HEX #RRGGBB.`);
    return value;
  }
  const text = String(value).slice(0, 500);
  if (control.type === 'select' && control.options?.length && !control.options.includes(text)) throw new Error(`La opción de «${control.label}» no existe.`);
  return text;
}

export function setVectorLayer(document: VectorModelDocument, layerId: string, patch: Partial<VectorModelLayer>): VectorModelDocument {
  const next = cloneVectorModel(document);
  const layer = next.layers.find((item) => item.id === layerId);
  if (!layer) return next;
  const oldWidth = layer.widthMm;
  const oldHeight = layer.heightMm;
  if (patch.sourcePathIndex !== undefined && patch.sourcePathIndex !== layer.sourcePathIndex) throw new Error('El índice de origen de la pieza es inmutable.');
  Object.assign(layer, patch);
  if (typeof patch.color === 'string') layer.faceColors = { front: patch.color, back: patch.color, side: patch.color };
  if (patch.faceColors) layer.faceColors = { ...layer.faceColors, ...patch.faceColors };
  if (typeof patch.widthMm === 'number' && oldWidth > 0) layer.scaleX *= patch.widthMm / oldWidth;
  if (typeof patch.heightMm === 'number' && oldHeight > 0) layer.scaleY *= patch.heightMm / oldHeight;
  if (typeof patch.widthMm === 'number' && (!Number.isFinite(layer.widthMm) || layer.widthMm <= 0 || layer.widthMm > 1e7)) throw new Error('El ancho de la pieza debe estar entre 0 y 10 000 000 mm.');
  if (typeof patch.heightMm === 'number' && (!Number.isFinite(layer.heightMm) || layer.heightMm <= 0 || layer.heightMm > 1e7)) throw new Error('El alto de la pieza debe estar entre 0 y 10 000 000 mm.');
  if (Math.abs(layer.scaleX) < 0.001 || Math.abs(layer.scaleX) > 1e4 || Math.abs(layer.scaleY) < 0.001 || Math.abs(layer.scaleY) > 1e4) throw new Error('La escala de la pieza debe estar entre 0.001 y 10 000, con signo opcional.');
  if (typeof patch.thicknessMm === 'number' && (!Number.isFinite(layer.thicknessMm) || layer.thicknessMm <= 0 || layer.thicknessMm > 1e5)) throw new Error('El espesor propio debe estar entre 0 y 100 000 mm.');
  if (typeof patch.xMm === 'number' && (!Number.isFinite(layer.xMm) || Math.abs(layer.xMm) > 1e7)) throw new Error('La posición X excede el límite del modelo.');
  if (typeof patch.yMm === 'number' && (!Number.isFinite(layer.yMm) || Math.abs(layer.yMm) > 1e7)) throw new Error('La posición Y excede el límite del modelo.');
  if (typeof patch.rotationDeg === 'number' && (!Number.isFinite(layer.rotationDeg) || Math.abs(layer.rotationDeg) > 1e7)) throw new Error('El giro excede el límite del modelo.');
  if (patch.strokeColor !== undefined && !(patch.strokeColor === null || isHexColor(patch.strokeColor))) throw new Error('El color de trazo debe ser HEX #RRGGBB.');
  if (typeof patch.strokeWidthMm === 'number' && !isFiniteBetween(layer.strokeWidthMm, 0, 1e5)) throw new Error('El ancho del trazo excede el límite del modelo.');
  return syncTargetControlValues(next);
}

export function setVectorModelDefaults(document: VectorModelDocument, patch: Partial<VectorModelDocument['defaults']>): VectorModelDocument {
  const next = cloneVectorModel(document);
  next.defaults = { ...next.defaults, ...patch, faceColors: { ...next.defaults.faceColors, ...patch.faceColors } };
  return syncTargetControlValues(next);
}

export function addVectorControl(document: VectorModelDocument, control: Omit<VectorCustomControl, 'id'>): VectorModelDocument {
  if (document.controls.length >= MAX_CUSTOM_CONTROLS) throw new Error('Se alcanzó el máximo de controles personalizados.');
  if (!CONTROL_TARGET_SET.has(control.target)) throw new Error('El destino del control no está permitido.');
  const next = cloneVectorModel(document);
  const item = { ...control, id: makeId('control') };
  next.controls.push(item);
  next.controlValues[item.id] = item.defaultValue;
  return syncTargetControlValues(next);
}

export function removeVectorControl(document: VectorModelDocument, controlId: string): VectorModelDocument {
  const next = cloneVectorModel(document);
  next.controls = next.controls.filter((control) => control.id !== controlId);
  delete next.controlValues[controlId];
  return next;
}

export function updateVectorDocumentSize(document: VectorModelDocument, key: 'widthMm' | 'heightMm', value: number): VectorModelDocument {
  if (!Number.isFinite(value) || value <= 0 || value > 1e7) throw new Error('La medida debe ser mayor que cero.');
  const next = cloneVectorModel(document);
  const ratio = value / next.source[key];
  next.source.widthMm *= ratio;
  next.source.heightMm *= ratio;
  next.source[key] = value;
  const sourceDimension = key === 'widthMm' ? next.source.viewBox.width : next.source.viewBox.height;
  const proposedScale = sourceDimension > 0 ? value / sourceDimension : next.source.mmPerSourceUnit;
  if (!Number.isFinite(proposedScale) || proposedScale < 1e-8 || proposedScale > 1e7) throw new Error('La escala física resultante excede el límite compatible.');
  next.source.mmPerSourceUnit = proposedScale;
  next.source.scaleConfirmed = true;
  next.layers.forEach((layer) => {
    layer.xMm *= ratio; layer.yMm *= ratio; layer.widthMm *= ratio; layer.heightMm *= ratio; layer.strokeWidthMm *= ratio;
  });
  if (next.layers.some((layer) => Math.abs(layer.xMm) > 1e7 || Math.abs(layer.yMm) > 1e7 || layer.widthMm > 1e7 || layer.heightMm > 1e7 || layer.strokeWidthMm > 1e5)) throw new Error('La nueva medida deja una pieza fuera de los límites del modelo.');
  return syncTargetControlValues(next);
}

export const MAX_VECTOR_FILE_BYTES_PUBLIC = MAX_VECTOR_FILE_BYTES;
export const MAX_VECTOR_LAYERS_PUBLIC = MAX_VECTOR_LAYERS;
