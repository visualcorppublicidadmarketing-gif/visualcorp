import type { BoxEdgeStyle, BoxPoint } from './boxModel';

const EPSILON = 1e-7;

function addPoint(points: BoxPoint[], point: BoxPoint) {
  const previous = points[points.length - 1];
  if (!previous || Math.abs(previous.x - point.x) > EPSILON || Math.abs(previous.y - point.y) > EPSILON) points.push(point);
}

/**
 * Creates a planar finger-joint edge. `clearanceMm` means free space per
 * mating flank: tabs shrink and slots widen by that amount on each side.
 * Kerf is deliberately handled elsewhere as a tool-centerline offset.
 */
export function buildFingerJointEdgePoints(
  from: BoxPoint,
  to: BoxPoint,
  style: BoxEdgeStyle,
  depthMm: number,
  fingerWidthMm: number,
  insetStartMm = 0,
  insetEndMm = 0,
  phase = 0,
  clearanceMm = 0,
): BoxPoint[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (![length, depthMm, fingerWidthMm, insetStartMm, insetEndMm, clearanceMm].every(Number.isFinite)) {
    throw new Error('La geometría de encastre contiene una medida inválida.');
  }
  if (depthMm < 0 || fingerWidthMm <= 0 || insetStartMm < 0 || insetEndMm < 0 || clearanceMm < 0) {
    throw new Error('La profundidad, el paso, los márgenes y la holgura del encastre deben ser válidos.');
  }
  if (style === 'flat' || length <= insetStartMm + insetEndMm + 1) return [from, to];
  if (depthMm <= 0) throw new Error('La profundidad del encastre debe ser mayor que cero.');

  const activeLength = length - insetStartMm - insetEndMm;
  let segmentCount = Math.max(2, Math.round(activeLength / Math.max(3, fingerWidthMm)));
  if (segmentCount % 2 !== 0) segmentCount += 1;
  const segmentLength = activeLength / segmentCount;
  if (clearanceMm >= segmentLength - EPSILON) {
    throw new Error(`La holgura por lado debe ser menor que el paso del encastre (${segmentLength.toFixed(2)} mm).`);
  }
  const tangentX = dx / length;
  const tangentY = dy / length;
  const outwardX = tangentY;
  const outwardY = -tangentX;
  const at = (along: number, offset: number): BoxPoint => ({
    x: from.x + tangentX * along + outwardX * offset,
    y: from.y + tangentY * along + outwardY * offset,
  });
  const points: BoxPoint[] = [];
  addPoint(points, from);
  addPoint(points, at(insetStartMm, 0));

  if (clearanceMm === 0) {
    // Keep the original zero-clearance vertex order for old .vcbox.json files.
    for (let index = 0; index < segmentCount; index += 1) {
      const start = insetStartMm + segmentLength * index;
      const end = insetStartMm + segmentLength * (index + 1);
      const active = (index + phase) % 2 === 0;
      const offset = active ? (style === 'tab' ? depthMm : -depthMm) : 0;
      addPoint(points, at(start, offset));
      addPoint(points, at(end, offset));
      addPoint(points, at(end, 0));
    }
  } else {
    const intervalExpansion = style === 'slot' ? clearanceMm / 2 : -clearanceMm / 2;
    const activeIntervals: Array<{ start: number; end: number }> = [];
    for (let index = 0; index < segmentCount; index += 1) {
      if ((index + phase) % 2 !== 0) continue;
      const nominalStart = insetStartMm + segmentLength * index;
      const nominalEnd = insetStartMm + segmentLength * (index + 1);
      const firstOrLast = index === 0 || index === segmentCount - 1;
      const startExpansion = firstOrLast && Math.abs(nominalStart - insetStartMm) <= EPSILON ? 0 : intervalExpansion;
      const endExpansion = firstOrLast && Math.abs(nominalEnd - (length - insetEndMm)) <= EPSILON ? 0 : intervalExpansion;
      const start = nominalStart - startExpansion;
      const end = nominalEnd + endExpansion;
      if (end - start <= EPSILON) throw new Error('La holgura elimina un diente; reduce la holgura o el paso.');
      activeIntervals.push({ start, end });
    }
    const offset = style === 'tab' ? depthMm : -depthMm;
    for (const interval of activeIntervals) {
      addPoint(points, at(interval.start, 0));
      addPoint(points, at(interval.start, offset));
      addPoint(points, at(interval.end, offset));
      addPoint(points, at(interval.end, 0));
    }
  }

  addPoint(points, to);
  return points;
}
