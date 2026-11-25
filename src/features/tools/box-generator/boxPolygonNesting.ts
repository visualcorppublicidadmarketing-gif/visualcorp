export interface NestPoint {
  x: number;
  y: number;
}

export interface NestPolygon {
  id: string;
  /** Simple closed contour. The first point may be repeated at the end. Holes are not supported. */
  points: readonly NestPoint[];
  /** Optional grain axis in the polygon's local coordinates. An axis is undirected. */
  grainDirection?: NestPoint;
  /** Candidate rotations in degrees. Defaults to quarter turns. */
  allowedRotationsDeg?: readonly number[];
}

export interface PolygonNestingOptions {
  sheetWidthMm: number;
  sheetHeightMm: number;
  marginMm: number;
  /** Minimum Euclidean distance between distinct cut contours. */
  gapMm: number;
  allowedRotationsDeg?: readonly number[];
  /** Grain axis on the sheet; defaults to +X. A piece's grain axis must be parallel to it. */
  sheetGrainDirection?: NestPoint;
  grainToleranceDeg?: number;
}

export interface PolygonNestingPlacement {
  id: string;
  /** Translation to apply to `points` to obtain sheet coordinates. */
  x: number;
  y: number;
  rotationDeg: number;
  /** Rotated, normalized polygon coordinates before x/y translation. */
  points: NestPoint[];
  boundsMm: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
  areaMm2: number;
}

export interface PolygonNestingSheet {
  index: number;
  placements: PolygonNestingPlacement[];
}

export type PolygonNestingFailureCode = 'invalid-polygon' | 'invalid-grain' | 'no-grain-compatible-rotation' | 'too-large' | 'no-polygon-fit';

export interface PolygonNestingFailure {
  id: string;
  code: PolygonNestingFailureCode;
  message: string;
}

export interface PolygonNestingResult {
  sheets: PolygonNestingSheet[];
  failures: PolygonNestingFailure[];
  placedCount: number;
  unplacedCount: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

interface NormalizedPolygon {
  id: string;
  points: NestPoint[];
  areaMm2: number;
  inputOrder: number;
  grainDirection?: NestPoint;
  rotations: number[];
}

interface WorkingPlacement extends PolygonNestingPlacement {
  globalPoints: NestPoint[];
}

interface WorkingSheet {
  index: number;
  placements: WorkingPlacement[];
}

type PlacementAttempt = { kind: 'placed'; placement: WorkingPlacement } | { kind: 'failed'; hadSizeFit: boolean };

interface VertexAnchor {
  point: NestPoint;
  normals: NestPoint[];
}

const EPSILON = 1e-7;
const DEFAULT_ROTATIONS = [0, 90, 180, 270] as const;
const MAX_ANCHORS = 24;

function cross(a: NestPoint, b: NestPoint) {
  return a.x * b.y - a.y * b.x;
}

function subtract(a: NestPoint, b: NestPoint): NestPoint {
  return { x: a.x - b.x, y: a.y - b.y };
}

function dot(a: NestPoint, b: NestPoint) {
  return a.x * b.x + a.y * b.y;
}

function length(point: NestPoint) {
  return Math.hypot(point.x, point.y);
}

function normalize(point: NestPoint) {
  const magnitude = length(point);
  if (!Number.isFinite(magnitude) || magnitude <= EPSILON) return null;
  return { x: point.x / magnitude, y: point.y / magnitude };
}

function signedArea(points: readonly NestPoint[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function orientation(a: NestPoint, b: NestPoint, c: NestPoint) {
  return cross(subtract(b, a), subtract(c, a));
}

function onSegment(a: NestPoint, b: NestPoint, point: NestPoint) {
  return Math.abs(orientation(a, b, point)) <= EPSILON
    && point.x >= Math.min(a.x, b.x) - EPSILON && point.x <= Math.max(a.x, b.x) + EPSILON
    && point.y >= Math.min(a.y, b.y) - EPSILON && point.y <= Math.max(a.y, b.y) + EPSILON;
}

function properIntersection(a: NestPoint, b: NestPoint, c: NestPoint, d: NestPoint) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return ((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
    && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON));
}

function segmentsIntersectOrTouch(a: NestPoint, b: NestPoint, c: NestPoint, d: NestPoint) {
  return properIntersection(a, b, c, d)
    || onSegment(a, b, c) || onSegment(a, b, d)
    || onSegment(c, d, a) || onSegment(c, d, b);
}

function collinearOverlap(a: NestPoint, b: NestPoint, c: NestPoint, d: NestPoint) {
  if (Math.abs(orientation(a, b, c)) > EPSILON || Math.abs(orientation(a, b, d)) > EPSILON) return false;
  const useX = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const a1 = useX ? a.x : a.y;
  const b1 = useX ? b.x : b.y;
  const c1 = useX ? c.x : c.y;
  const d1 = useX ? d.x : d.y;
  return Math.min(Math.max(a1, b1), Math.max(c1, d1)) - Math.max(Math.min(a1, b1), Math.min(c1, d1)) > EPSILON;
}

function distancePointToSegment(point: NestPoint, start: NestPoint, end: NestPoint) {
  const segment = subtract(end, start);
  const segmentLengthSquared = dot(segment, segment);
  if (segmentLengthSquared <= EPSILON * EPSILON) return length(subtract(point, start));
  const t = Math.max(0, Math.min(1, dot(subtract(point, start), segment) / segmentLengthSquared));
  return length(subtract(point, { x: start.x + segment.x * t, y: start.y + segment.y * t }));
}

function segmentDistance(a: NestPoint, b: NestPoint, c: NestPoint, d: NestPoint) {
  if (properIntersection(a, b, c, d) || collinearOverlap(a, b, c, d)) return 0;
  return Math.min(
    distancePointToSegment(a, c, d),
    distancePointToSegment(b, c, d),
    distancePointToSegment(c, a, b),
    distancePointToSegment(d, a, b),
  );
}

function pointInPolygon(point: NestPoint, polygon: readonly NestPoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const start = polygon[previous];
    const end = polygon[index];
    if (onSegment(start, end, point)) return false;
    const crosses = (start.y > point.y) !== (end.y > point.y)
      && point.x < ((end.x - start.x) * (point.y - start.y)) / (end.y - start.y) + start.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function getBounds(points: readonly NestPoint[]): Bounds {
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function validateAndNormalizePolygon(points: readonly NestPoint[]) {
  const clean = points.map(({ x, y }) => ({ x, y }));
  while (clean.length > 1 && length(subtract(clean[0], clean[clean.length - 1])) <= EPSILON) clean.pop();
  if (clean.length < 3 || clean.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) {
    throw new Error('El polígono necesita al menos tres vértices finitos.');
  }
  for (let index = 0; index < clean.length; index += 1) {
    if (length(subtract(clean[index], clean[(index + 1) % clean.length])) <= EPSILON) {
      throw new Error('El polígono contiene un lado de longitud cero.');
    }
  }
  const area = signedArea(clean);
  if (!Number.isFinite(area) || Math.abs(area) <= EPSILON) throw new Error('El polígono no tiene área positiva.');
  for (let first = 0; first < clean.length; first += 1) {
    const firstNext = (first + 1) % clean.length;
    for (let second = first + 1; second < clean.length; second += 1) {
      const secondNext = (second + 1) % clean.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (segmentsIntersectOrTouch(clean[first], clean[firstNext], clean[second], clean[secondNext])) {
        throw new Error('El contorno se cruza o se superpone a sí mismo.');
      }
    }
  }
  return { points: area < 0 ? clean.reverse() : clean, areaMm2: Math.abs(area) };
}

function normalizeRotation(value: number) {
  const normalized = ((value % 360) + 360) % 360;
  return Math.abs(normalized - 360) <= EPSILON ? 0 : Number(normalized.toFixed(6));
}

function rotatePoint(point: NestPoint, radians: number): NestPoint {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return { x: point.x * cosine - point.y * sine, y: point.x * sine + point.y * cosine };
}

function rotationsFor(piece: NestPolygon, defaults: readonly number[]) {
  const source = piece.allowedRotationsDeg ?? defaults;
  return [...new Set(source.filter(Number.isFinite).map(normalizeRotation))];
}

function respectsGrain(rotationDeg: number, localGrain: NestPoint, sheetGrain: NestPoint, toleranceDeg: number) {
  const rotated = rotatePoint(localGrain, rotationDeg * Math.PI / 180);
  const parallel = Math.abs(dot(rotated, sheetGrain));
  const tolerance = Math.sin(Math.min(89, Math.max(0, toleranceDeg)) * Math.PI / 180);
  return Math.abs(cross(rotated, sheetGrain)) <= tolerance + EPSILON && parallel >= Math.cos(Math.min(89, Math.max(0, toleranceDeg)) * Math.PI / 180) - EPSILON;
}

function boundsConflict(a: Bounds, b: Bounds, gap: number) {
  return !(a.maxX + gap <= b.minX + EPSILON || b.maxX + gap <= a.minX + EPSILON
    || a.maxY + gap <= b.minY + EPSILON || b.maxY + gap <= a.minY + EPSILON);
}

function polygonsConflict(aPoints: readonly NestPoint[], aBounds: Bounds, bPoints: readonly NestPoint[], bBounds: Bounds, gap: number) {
  if (!boundsConflict(aBounds, bBounds, gap)) return false;
  if (aPoints.some((point) => pointInPolygon(point, bPoints)) || bPoints.some((point) => pointInPolygon(point, aPoints))) return true;
  for (let first = 0; first < aPoints.length; first += 1) {
    const a = aPoints[first];
    const b = aPoints[(first + 1) % aPoints.length];
    for (let second = 0; second < bPoints.length; second += 1) {
      const c = bPoints[second];
      const d = bPoints[(second + 1) % bPoints.length];
      if (gap <= EPSILON) {
        if (properIntersection(a, b, c, d) || collinearOverlap(a, b, c, d)) return true;
        continue;
      }
      const distance = segmentDistance(a, b, c, d);
      if (distance < gap - EPSILON) return true;
    }
  }
  return false;
}

function sampleAnchors(points: readonly NestPoint[]): VertexAnchor[] {
  const indices = new Set<number>();
  const count = Math.min(MAX_ANCHORS, points.length);
  for (let sample = 0; sample < count; sample += 1) indices.add(Math.floor(sample * points.length / count));
  for (const selector of [
    (point: NestPoint) => point.x,
    (point: NestPoint) => -point.x,
    (point: NestPoint) => point.y,
    (point: NestPoint) => -point.y,
  ]) {
    let bestIndex = 0;
    for (let index = 1; index < points.length; index += 1) {
      if (selector(points[index]) < selector(points[bestIndex])) bestIndex = index;
    }
    indices.add(bestIndex);
  }
  return [...indices].map((index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const normals = [
      normalize({ x: current.y - previous.y, y: previous.x - current.x }),
      normalize({ x: next.y - current.y, y: current.x - next.x }),
    ].filter((normal): normal is NestPoint => normal !== null);
    return { point: current, normals };
  });
}

function translated(points: readonly NestPoint[], x: number, y: number): NestPoint[] {
  return points.map((point) => ({ x: point.x + x, y: point.y + y }));
}

function uniqueCandidateKey(x: number, y: number) {
  return `${Math.round(x * 1000)}:${Math.round(y * 1000)}`;
}

function generateCandidateTranslations(
  movingPoints: readonly NestPoint[],
  movingBounds: Bounds,
  placed: readonly WorkingPlacement[],
  margin: number,
  gap: number,
) {
  const candidates = new Map<string, NestPoint>();
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const key = uniqueCandidateKey(x, y);
    if (!candidates.has(key)) candidates.set(key, { x, y });
  };

  add(margin - movingBounds.minX, margin - movingBounds.minY);
  const movingAnchors = sampleAnchors(movingPoints);
  const cardinal = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

  for (const other of placed) {
    const otherBounds = other.boundsMm;
    const xContacts = [
      otherBounds.maxX + gap - movingBounds.minX,
      otherBounds.minX - gap - movingBounds.maxX,
      otherBounds.minX - movingBounds.minX,
      otherBounds.maxX - movingBounds.maxX,
    ];
    const yContacts = [
      otherBounds.maxY + gap - movingBounds.minY,
      otherBounds.minY - gap - movingBounds.maxY,
      otherBounds.minY - movingBounds.minY,
      otherBounds.maxY - movingBounds.maxY,
    ];
    xContacts.forEach((x) => yContacts.forEach((y) => add(x, y)));

    const targetAnchors = sampleAnchors(other.globalPoints);
    for (const moving of movingAnchors) {
      for (const target of targetAnchors) {
        const baseX = target.point.x - moving.point.x;
        const baseY = target.point.y - moving.point.y;
        add(baseX, baseY);
        if (gap <= 0) continue;
        const directions = [...cardinal, ...moving.normals, ...target.normals];
        for (const direction of directions) {
          add(baseX + direction.x * gap, baseY + direction.y * gap);
          add(baseX - direction.x * gap, baseY - direction.y * gap);
        }
      }
    }
  }

  return [...candidates.values()].sort((a, b) => {
    const aBottom = a.y + movingBounds.maxY;
    const bBottom = b.y + movingBounds.maxY;
    return aBottom - bBottom || (a.x + movingBounds.minX) - (b.x + movingBounds.minX) || a.y - b.y || a.x - b.x;
  });
}

function findPlacement(
  polygon: NormalizedPolygon,
  sheet: WorkingSheet,
  options: PolygonNestingOptions,
  sheetGrain: NestPoint,
  toleranceDeg: number,
): PlacementAttempt {
  const usableWidth = options.sheetWidthMm - options.marginMm * 2;
  const usableHeight = options.sheetHeightMm - options.marginMm * 2;
  let hadSizeFit = false;
  const existing = sheet.placements;

  for (const rotationDeg of polygon.rotations) {
    if (polygon.grainDirection && !respectsGrain(rotationDeg, polygon.grainDirection, sheetGrain, toleranceDeg)) continue;
    const radians = rotationDeg * Math.PI / 180;
    const rotated = polygon.points.map((point) => rotatePoint(point, radians));
    const rotatedBounds = getBounds(rotated);
    if (rotatedBounds.width > usableWidth + EPSILON || rotatedBounds.height > usableHeight + EPSILON) continue;
    hadSizeFit = true;
    const candidates = generateCandidateTranslations(rotated, rotatedBounds, existing, options.marginMm, options.gapMm);
    const possible = candidates.find((candidate) => {
      const candidateBounds: Bounds = {
        minX: rotatedBounds.minX + candidate.x,
        minY: rotatedBounds.minY + candidate.y,
        maxX: rotatedBounds.maxX + candidate.x,
        maxY: rotatedBounds.maxY + candidate.y,
        width: rotatedBounds.width,
        height: rotatedBounds.height,
      };
      if (candidateBounds.minX < options.marginMm - EPSILON || candidateBounds.minY < options.marginMm - EPSILON
        || candidateBounds.maxX > options.sheetWidthMm - options.marginMm + EPSILON
        || candidateBounds.maxY > options.sheetHeightMm - options.marginMm + EPSILON) return false;
      const globalPoints = translated(rotated, candidate.x, candidate.y);
      return existing.every((other) => !polygonsConflict(globalPoints, candidateBounds, other.globalPoints, other.boundsMm, options.gapMm));
    });
    if (!possible) continue;
    const boundsMm: Bounds = {
      minX: rotatedBounds.minX + possible.x,
      minY: rotatedBounds.minY + possible.y,
      maxX: rotatedBounds.maxX + possible.x,
      maxY: rotatedBounds.maxY + possible.y,
      width: rotatedBounds.width,
      height: rotatedBounds.height,
    };
    return { kind: 'placed', placement: {
      id: polygon.id,
      x: possible.x,
      y: possible.y,
      rotationDeg,
      points: rotated,
      boundsMm,
      areaMm2: polygon.areaMm2,
      globalPoints: translated(rotated, possible.x, possible.y),
    } };
  }
  return { kind: 'failed', hadSizeFit };
}

/**
 * Deterministic polygon nesting heuristic. It tests the real contours, including
 * concave edges, but uses sampled vertex contacts and bounding-box contacts to
 * generate candidates; it is not an optimal no-fit-polygon solver.
 */
export function nestPolygons(polygons: readonly NestPolygon[], options: PolygonNestingOptions): PolygonNestingResult {
  const { sheetWidthMm, sheetHeightMm, marginMm, gapMm } = options;
  if (![sheetWidthMm, sheetHeightMm, marginMm, gapMm].every(Number.isFinite)
    || sheetWidthMm <= 0 || sheetHeightMm <= 0 || marginMm < 0 || gapMm < 0
    || sheetWidthMm <= marginMm * 2 || sheetHeightMm <= marginMm * 2) {
    throw new RangeError('Las medidas de plancha, margen y separación deben definir un área útil positiva.');
  }
  const sheetGrain = normalize(options.sheetGrainDirection ?? { x: 1, y: 0 });
  if (!sheetGrain) throw new RangeError('La dirección de veta de la plancha debe tener longitud positiva.');
  const toleranceDeg = options.grainToleranceDeg ?? 2;
  if (!Number.isFinite(toleranceDeg) || toleranceDeg < 0 || toleranceDeg >= 90) {
    throw new RangeError('La tolerancia angular de veta debe estar entre 0 y 90 grados.');
  }

  const failures: PolygonNestingFailure[] = [];
  const prepared: NormalizedPolygon[] = [];
  const seenIds = new Set<string>();
  for (const [inputOrder, source] of polygons.entries()) {
    try {
      if (!source.id.trim()) throw new Error('Cada pieza necesita un identificador.');
      if (seenIds.has(source.id)) throw new Error(`El identificador «${source.id}» está repetido.`);
      seenIds.add(source.id);
      const normalized = validateAndNormalizePolygon(source.points);
      const rotations = rotationsFor(source, options.allowedRotationsDeg ?? DEFAULT_ROTATIONS);
      if (rotations.length === 0) throw new Error('La pieza no tiene rotaciones permitidas.');
      const grainDirection = source.grainDirection ? normalize(source.grainDirection) : undefined;
      if (source.grainDirection && !grainDirection) {
        failures.push({ id: source.id, code: 'invalid-grain', message: 'La dirección de veta de la pieza debe tener longitud positiva.' });
        continue;
      }
      prepared.push({ id: source.id, points: normalized.points, areaMm2: normalized.areaMm2, inputOrder, grainDirection: grainDirection ?? undefined, rotations });
    } catch (error) {
      failures.push({ id: source.id || '(sin id)', code: 'invalid-polygon', message: error instanceof Error ? error.message : 'La pieza no tiene un contorno válido.' });
    }
  }

  prepared.sort((a, b) => b.areaMm2 - a.areaMm2 || (a.id < b.id ? -1 : a.id > b.id ? 1 : a.inputOrder - b.inputOrder));
  const sheets: WorkingSheet[] = [];
  const newSheet = (): WorkingSheet => {
    const sheet = { index: sheets.length + 1, placements: [] as WorkingPlacement[] };
    sheets.push(sheet);
    return sheet;
  };

  for (const polygon of prepared) {
    const sheet = sheets[sheets.length - 1] ?? newSheet();
    let attempt = findPlacement(polygon, sheet, options, sheetGrain, toleranceDeg);
    if (attempt.kind === 'failed') {
      if (sheet.placements.length > 0) {
        const nextSheet = newSheet();
        attempt = findPlacement(polygon, nextSheet, options, sheetGrain, toleranceDeg);
      }
    }
    if (attempt.kind === 'placed') {
      sheets[sheets.length - 1].placements.push(attempt.placement);
      continue;
    }

    const grainCompatible = !polygon.grainDirection || polygon.rotations.some((rotation) => respectsGrain(rotation, polygon.grainDirection!, sheetGrain, toleranceDeg));
    const code: PolygonNestingFailureCode = !grainCompatible
      ? 'no-grain-compatible-rotation'
      : !attempt.hadSizeFit ? 'too-large' : 'no-polygon-fit';
    failures.push({
      id: polygon.id,
      code,
      message: code === 'no-grain-compatible-rotation'
        ? 'Ninguna rotación permitida alinea la veta de la pieza con la veta de la plancha.'
        : code === 'too-large'
          ? 'La pieza no cabe dentro del área útil de ninguna rotación permitida.'
          : 'La pieza no encontró una posición poligonal válida con la separación indicada.',
    });
  }

  const publicSheets: PolygonNestingSheet[] = sheets
    .filter((sheet) => sheet.placements.length > 0)
    .map((sheet) => ({
      index: sheet.index,
      placements: sheet.placements.map((placement) => {
        const { globalPoints: _globalPoints, ...publicPlacement } = placement;
        return publicPlacement;
      }),
    }));
  const placedCount = publicSheets.reduce((sum, sheet) => sum + sheet.placements.length, 0);
  return { sheets: publicSheets, failures, placedCount, unplacedCount: failures.length };
}
