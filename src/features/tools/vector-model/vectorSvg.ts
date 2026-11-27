import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { createDefaultVectorModel, makeId, type VectorDiagnostic, type VectorImportResult, type VectorModelLayer, type VectorUnit } from './vectorModel';
import { sanitizeVectorSvg } from './svgSafety';

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_PATHS = 600;
const UNIT_TO_MM: Record<Exclude<VectorUnit, null>, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 1 };
const NON_GEOMETRY_TAGS = new Set(['svg', 'g', 'defs', 'title', 'desc', 'metadata', 'linearGradient', 'radialGradient', 'stop', 'style', 'clipPath', 'mask', 'pattern', 'filter', 'symbol', 'marker']);

type ParsedLength = { value: number; unit: Exclude<VectorUnit, null> };
interface ParsedSvgPath {
  color?: THREE.Color;
  userData?: { node?: Element; style?: Record<string, unknown> };
  subPaths: Array<{ getPoints(divisions?: number): THREE.Vector2[] }>;
  toShapes(): THREE.Shape[];
}

export async function importSvgVector(file: File): Promise<VectorImportResult> {
  if (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml') {
    throw new Error('La primera versión importa SVG. Exporta AI o EPS a SVG e inténtalo de nuevo.');
  }
  if (file.size > MAX_INPUT_BYTES) throw new Error('El SVG supera el máximo de 8 MB. Exporta una versión optimizada e inténtalo de nuevo.');
  const text = await file.text();
  return parseSvgVector(text, file.name);
}

export function parseSvgVector(text: string, fileName = 'vector.svg'): VectorImportResult {
  const sourceBytes = new TextEncoder().encode(text).byteLength;
  if (sourceBytes > MAX_INPUT_BYTES) throw new Error('El SVG supera el máximo de 8 MB. Exporta una versión optimizada e inténtalo de nuevo.');
  if (!text.trim()) throw new Error('El archivo SVG está vacío.');

  const parseWarnings: VectorDiagnostic[] = [];
  let safeSvg;
  try { safeSvg = sanitizeVectorSvg(text); }
  catch (cause) { throw new Error(cause instanceof Error ? cause.message : 'No se pudo sanear el SVG para importarlo.'); }
  if (safeSvg.removedActiveElements > 0) parseWarnings.push(diagnostic('warning', `Se eliminaron ${safeSvg.removedActiveElements} elemento(s) activo(s) o incrustado(s) antes de procesar el archivo.`));
  if (safeSvg.removedExternalReferences > 0) parseWarnings.push(diagnostic('warning', `Se eliminaron ${safeSvg.removedExternalReferences} manejador(es) o referencia(s) externa(s) por seguridad.`));
  if (safeSvg.removedStylesheets > 0) parseWarnings.push(diagnostic('warning', `Se eliminaron ${safeSvg.removedStylesheets} hoja(s) de estilo incrustada(s). Si afectan el aspecto del diseño, exporta los estilos como atributos en línea.`));
  if (safeSvg.removedReferencedGeometry > 0) parseWarnings.push(diagnostic('warning', `Se omitieron ${safeSvg.removedReferencedGeometry} imagen(es) o instancia(s) <use>; conviértelas en geometría directa antes de exportar.`));
  const sanitizedSvg = safeSvg.svgText;
  const sanitizedXml = new DOMParser().parseFromString(sanitizedSvg, 'image/svg+xml');
  const root = sanitizedXml.documentElement;
  const unsupportedCounts = new Map<string, number>();
  for (const element of Array.from(root.querySelectorAll('*'))) {
    const tag = element.localName;
    if (!NON_GEOMETRY_TAGS.has(tag) && !['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'use'].includes(tag)) {
      unsupportedCounts.set(tag, (unsupportedCounts.get(tag) ?? 0) + 1);
    }
  }
  for (const [tag, count] of unsupportedCounts) parseWarnings.push(diagnostic('warning', `El elemento SVG <${tag}> (${count}) no forma parte del subconjunto de geometría admitido y podría no aparecer en el modelo.`));
  const liveTextCount = root.querySelectorAll('text, tspan').length;
  if (liveTextCount) parseWarnings.push(diagnostic('warning', `Se encontraron ${liveTextCount} nodo(s) de texto. Convierte los textos a contornos en Illustrator antes de exportar el SVG para conservar su forma.`));
  const effectsCount = root.querySelectorAll('filter, mask, clipPath, pattern, linearGradient, radialGradient').length;
  if (effectsCount) parseWarnings.push(diagnostic('warning', `Se encontraron ${effectsCount} gradiente(s), máscara(s), filtro(s), recorte(s) o patrón(es). Esos efectos no se reproducen como geometría sólida.`));

  const viewBox = readViewBox(root);
  const widthLength = parseLength(root.getAttribute('width'));
  const heightLength = parseLength(root.getAttribute('height'));
  const physicalWidthMm = widthLength && widthLength.unit !== 'px' ? widthLength.value * UNIT_TO_MM[widthLength.unit] : null;
  const physicalHeightMm = heightLength && heightLength.unit !== 'px' ? heightLength.value * UNIT_TO_MM[heightLength.unit] : null;
  const mmPerSourceUnit = physicalWidthMm && viewBox.width > 0
    ? physicalWidthMm / viewBox.width
    : physicalHeightMm && viewBox.height > 0
      ? physicalHeightMm / viewBox.height
      : 1;
  const scaleConfirmed = Number.isFinite(mmPerSourceUnit) && mmPerSourceUnit > 0 && (physicalWidthMm !== null || physicalHeightMm !== null);
  const widthMm = physicalWidthMm ?? viewBox.width * mmPerSourceUnit;
  const heightMm = physicalHeightMm ?? viewBox.height * mmPerSourceUnit;
  if (!scaleConfirmed) parseWarnings.push(diagnostic('warning', 'El SVG no declara medidas físicas. La escala se inició como 1 unidad de origen = 1 mm; confirma el ancho o alto antes de usarlo como medida real.'));
  if (physicalWidthMm && physicalHeightMm) {
    const expectedHeight = viewBox.height * mmPerSourceUnit;
    if (Math.abs(expectedHeight - physicalHeightMm) > Math.max(0.1, physicalHeightMm * 0.02)) parseWarnings.push(diagnostic('warning', 'El ancho y alto físicos no coinciden con la proporción del viewBox. Se conservaron ambas cotas y se usará el ancho para escalar las rutas.'));
  }

  let parsed;
  try { parsed = new SVGLoader().parse(sanitizedSvg); } catch { throw new Error('El SVG se abrió, pero una o más formas no pudieron convertirse. Simplifica o vuelve a exportar el archivo.'); }
  if (parsed.paths.length > MAX_PATHS) throw new Error(`El SVG tiene ${parsed.paths.length} rutas; el límite actual es ${MAX_PATHS}. Agrupa o simplifica el diseño.`);
  if (parsed.paths.length === 0) throw new Error('El SVG no contiene rutas geométricas compatibles. Convierte formas y textos a contornos e inténtalo de nuevo.');

  const document = createDefaultVectorModel();
  document.metadata.title = cleanName(fileName);
  document.metadata.sourceFileName = fileName.slice(0, 240);
  document.metadata.sourceBytes = sourceBytes;
  document.source = {
    svgText: sanitizedSvg,
    viewBox,
    widthMm: clamp(widthMm, 0.001, 1e7),
    heightMm: clamp(heightMm, 0.001, 1e7),
    mmPerSourceUnit: clamp(mmPerSourceUnit, 1e-8, 1e7),
    scaleConfirmed,
    sourceUnits: widthLength?.unit ?? heightLength?.unit ?? null,
  };

  const layers = parsed.paths.map((path, index) => createLayer(path as unknown as ParsedSvgPath, index, mmPerSourceUnit, viewBox, parseWarnings));
  if (layers.some((layer) => !Number.isFinite(layer.widthMm) || !Number.isFinite(layer.heightMm) || !Number.isFinite(layer.xMm) || !Number.isFinite(layer.yMm) || layer.widthMm > 1e7 || layer.heightMm > 1e7 || Math.abs(layer.xMm) > 1e7 || Math.abs(layer.yMm) > 1e7)) {
    throw new Error('Una o más piezas superan los límites físicos del modelo. Normaliza la escala del SVG e inténtalo de nuevo.');
  }
  document.layers = layers;
  const hasOpenPaths = layers.some((layer) => !layer.canExtrude);
  const documentDiagnostics = parseWarnings.slice(0, 397);
  if (parseWarnings.length > 397) documentDiagnostics.push(diagnostic('info', `Se agruparon ${parseWarnings.length - 397} avisos adicionales para mantener compacto el JSON.`));
  if (hasOpenPaths) documentDiagnostics.push(diagnostic('warning', 'Las rutas abiertas se conservaron para la vista 2D. Convierte sus trazos a contornos para poder extruirlos como sólidos.'));
  if (layers.every((layer) => !layer.canExtrude)) documentDiagnostics.push(diagnostic('warning', 'No se detectaron contornos cerrados rellenos. La previsualización 3D quedará vacía hasta convertir el arte a contornos cerrados.'));
  document.diagnostics = documentDiagnostics.slice(0, 400);
  return { document, warnings: document.diagnostics };
}

function createLayer(path: ParsedSvgPath, index: number, mmPerSourceUnit: number, viewBox: { x: number; y: number; width: number; height: number }, warnings: VectorDiagnostic[]): VectorModelLayer {
  const node = path.userData?.node;
  const style = path.userData?.style ?? {};
  const shapes = path.toShapes();
  const points = path.subPaths.flatMap((subPath) => subPath.getPoints(8));
  const bounds = getBounds(points);
  const fill = typeof style.fill === 'string' ? style.fill : '';
  const color = colorToHex(fill, path.color?.getHexString?.() ?? '8a72c6');
  const stroke = typeof style.stroke === 'string' ? style.stroke.trim() : '';
  const strokeColor = stroke && stroke.toLowerCase() !== 'none' ? colorToHex(stroke, path.color?.getHexString?.() ?? color) : null;
  const rawStrokeWidth = style.strokeWidth ?? node?.getAttribute('stroke-width');
  const parsedStrokeWidth = typeof rawStrokeWidth === 'number' ? rawStrokeWidth : Number.parseFloat(String(rawStrokeWidth ?? '1'));
  const strokeWidthMm = clamp((Number.isFinite(parsedStrokeWidth) && parsedStrokeWidth >= 0 ? parsedStrokeWidth : 1) * mmPerSourceUnit, 0, 1e5);
  const isClosed = path.subPaths.length > 0 && path.subPaths.every((subPath) => {
    const samples = subPath.getPoints(3);
    if (samples.length < 3) return false;
    const first = samples[0];
    const last = samples[samples.length - 1];
    return first.distanceTo(last) < 0.05;
  });
  const hasFill = fill.toLowerCase() !== 'none';
  const fillRule = style.fillRule === 'evenodd' ? 'evenodd' : 'nonzero';
  const canExtrude = shapes.length > 0 && isClosed && hasFill && fillRule === 'nonzero';
  if (!isClosed || !hasFill) warnings.push(diagnostic('info', `«${layerName(node, index)}» se conserva en 2D; sus trazos no son un perfil cerrado relleno para extrusión.`));
  else if (fillRule === 'evenodd') warnings.push(diagnostic('warning', `«${layerName(node, index)}» usa fill-rule evenodd. La geometría se conserva en 2D porque el conversor no garantiza la topología de huecos para extrusión.`));
  if (strokeColor) warnings.push(diagnostic('info', `El trazo de «${layerName(node, index)}» se conserva como estilo 2D. Para extruirlo, convierte el trazo a contorno en el editor vectorial.`));
  const ownId = node?.getAttribute('id')?.trim();
  const ancestorNames: string[] = [];
  for (let parent = node?.parentElement; parent && parent.localName !== 'svg'; parent = parent.parentElement) {
    if (parent.localName === 'g') {
      const label = parent.getAttribute('aria-label') || parent.getAttribute('data-name') || parent.getAttribute('id');
      if (label) ancestorNames.unshift(label.slice(0, 60));
    }
  }
  const id = ownId ? `${ownId.replace(/[^\w.-]+/g, '-').slice(0, 100)}-${index}` : `path-${index + 1}`;
  return {
    id,
    name: layerName(node, index, ancestorNames),
    sourcePathIndex: index,
    visible: true,
    fillRule,
    color,
    strokeColor,
    strokeWidthMm,
    opacity: numberValue(style.fillOpacity ?? style.opacity, 1),
    widthMm: bounds.width * mmPerSourceUnit,
    heightMm: bounds.height * mmPerSourceUnit,
    xMm: (bounds.minX - viewBox.x) * mmPerSourceUnit,
    yMm: (viewBox.y + viewBox.height - bounds.minY - bounds.height) * mmPerSourceUnit,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
    thicknessMm: null,
    faceColors: {},
    isClosed,
    canExtrude,
  };
}

function layerName(node: Element | undefined, index: number, parents: string[] = []) {
  const title = node?.getAttribute('aria-label') || node?.getAttribute('data-name') || node?.getAttribute('id') || node?.getAttribute('class');
  const own = title?.replace(/[_-]+/g, ' ').trim().slice(0, 80) || `Pieza ${index + 1}`;
  return [...parents.slice(-2), own].join(' / ');
}

function getBounds(points: THREE.Vector2[]) {
  if (!points.length) return { minX: 0, minY: 0, width: 0, height: 0 };
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const point of points) { minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function readViewBox(root: Element) {
  const raw = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (raw?.length === 4 && raw.every(Number.isFinite) && raw[2] > 0 && raw[3] > 0) return { x: raw[0], y: raw[1], width: raw[2], height: raw[3] };
  const width = parseLength(root.getAttribute('width'))?.value ?? 100;
  const height = parseLength(root.getAttribute('height'))?.value ?? 100;
  return { x: 0, y: 0, width: Math.max(0.001, width), height: Math.max(0.001, height) };
}

function parseLength(value: string | null): ParsedLength | null {
  if (!value) return null;
  const match = value.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(mm|cm|in|pt|pc|px)?$/i);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number) || number <= 0) return null;
  const unit = (match[2]?.toLowerCase() ?? 'px') as Exclude<VectorUnit, null>;
  return { value: number, unit };
}

function diagnostic(severity: VectorDiagnostic['severity'], message: string): VectorDiagnostic {
  return { id: makeId('diagnostic'), severity, message: message.slice(0, 500) };
}

function colorToHex(input: string, fallback: string) {
  const color = input.trim();
  if (/^#[\da-f]{3}$/i.test(color)) return `#${color.slice(1).split('').map((part) => part + part).join('')}`;
  if (/^#[\da-f]{4}$/i.test(color)) return `#${color.slice(1, 4).split('').map((part) => part + part).join('')}`;
  if (/^#[\da-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[\da-f]{8}$/i.test(color)) return color.slice(0, 7).toLowerCase();
  if (color.toLowerCase() === 'black') return '#000000';
  if (color.toLowerCase() === 'white') return '#ffffff';
  if (color.toLowerCase() === 'currentcolor') return `#${fallback.replace(/^#/, '').slice(0, 6).padEnd(6, '0')}`;
  if (/^(?:rgb|hsl)a?\(/i.test(color) || /^[a-z]+$/i.test(color)) {
    try {
      const parsed = new THREE.Color();
      parsed.setStyle(color);
      return `#${parsed.getHexString()}`;
    } catch { /* Use the parsed path color as the fallback. */ }
  }
  return `#${fallback.replace(/^#/, '').slice(0, 6).padEnd(6, '0')}`;
}

function numberValue(input: unknown, fallback: number) {
  const value = typeof input === 'string' ? Number(input) : input;
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
}

function cleanName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[\s_-]+/g, ' ').trim().slice(0, 100) || 'Modelo vectorial';
}

function clamp(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}
