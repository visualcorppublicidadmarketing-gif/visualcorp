import type { BoxCutLayout, BoxPanelPlacement, BoxPoint } from './boxModel';

const EPSILON = 1e-8;

function cross(a: BoxPoint, b: BoxPoint) {
  return a.x * b.y - a.y * b.x;
}

function signedArea(points: readonly BoxPoint[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function segmentsIntersect(a: BoxPoint, b: BoxPoint, c: BoxPoint, d: BoxPoint) {
  const orient = (p: BoxPoint, q: BoxPoint, r: BoxPoint) => cross(
    { x: q.x - p.x, y: q.y - p.y },
    { x: r.x - p.x, y: r.y - p.y },
  );
  const onSegment = (p: BoxPoint, q: BoxPoint, r: BoxPoint) => (
    q.x >= Math.min(p.x, r.x) - EPSILON && q.x <= Math.max(p.x, r.x) + EPSILON
    && q.y >= Math.min(p.y, r.y) - EPSILON && q.y <= Math.max(p.y, r.y) + EPSILON
  );
  const abC = orient(a, b, c);
  const abD = orient(a, b, d);
  const cdA = orient(c, d, a);
  const cdB = orient(c, d, b);
  if (Math.abs(abC) <= EPSILON && onSegment(a, c, b)) return true;
  if (Math.abs(abD) <= EPSILON && onSegment(a, d, b)) return true;
  if (Math.abs(cdA) <= EPSILON && onSegment(c, a, d)) return true;
  if (Math.abs(cdB) <= EPSILON && onSegment(c, b, d)) return true;
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

/**
 * Offsets a simple polygon outward by `distanceMm` using miter joins. This is
 * a centerline compensation helper, not a material-specific kerf calibration.
 * Ambiguous or self-intersecting results are rejected instead of exported.
 */
export function offsetBoxContour(points: readonly BoxPoint[], distanceMm: number): BoxPoint[] {
  if (!Number.isFinite(distanceMm) || distanceMm < 0) throw new Error('La compensación de kerf debe ser un valor válido en mm.');
  if (points.length < 3 || points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) {
    throw new Error('No se puede compensar un contorno con coordenadas inválidas.');
  }
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (Math.hypot(next.x - current.x, next.y - current.y) <= EPSILON) throw new Error('El contorno contiene un segmento de longitud cero.');
  }
  const area = signedArea(points);
  if (Math.abs(area) <= EPSILON) throw new Error('No se puede compensar un contorno sin área.');
  if (distanceMm === 0) {
    for (let first = 0; first < points.length; first += 1) {
      const firstNext = (first + 1) % points.length;
      for (let second = first + 1; second < points.length; second += 1) {
        const secondNext = (second + 1) % points.length;
        if (first === second || firstNext === second || secondNext === first) continue;
        if (segmentsIntersect(points[first], points[firstNext], points[second], points[secondNext])) {
          throw new Error('El contorno nominal se cruza a sí mismo y no puede exportarse.');
        }
      }
    }
    return points.map(({ x, y }) => ({ x, y }));
  }

  const outwardSign = area > 0 ? 1 : -1;
  const directions: BoxPoint[] = [];
  const normals: BoxPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length <= EPSILON) throw new Error('El contorno contiene un segmento de longitud cero.');
    directions.push({ x: dx / length, y: dy / length });
    normals.push({ x: (dy / length) * outwardSign, y: (-dx / length) * outwardSign });
  }

  const shifted: BoxPoint[] = points.map((point, index) => {
    const previous = (index - 1 + points.length) % points.length;
    const incoming = directions[previous];
    const outgoing = directions[index];
    const incomingStart = {
      x: point.x + normals[previous].x * distanceMm - incoming.x * distanceMm,
      y: point.y + normals[previous].y * distanceMm - incoming.y * distanceMm,
    };
    const outgoingStart = {
      x: point.x + normals[index].x * distanceMm,
      y: point.y + normals[index].y * distanceMm,
    };
    const determinant = cross(incoming, outgoing);

    let result: BoxPoint;
    if (Math.abs(determinant) <= EPSILON) {
      const nx = normals[previous].x + normals[index].x;
      const ny = normals[previous].y + normals[index].y;
      const normalLength = Math.hypot(nx, ny);
      if (normalLength <= EPSILON) throw new Error('El contorno tiene un vértice ambiguo para compensar.');
      result = { x: point.x + nx / normalLength * distanceMm, y: point.y + ny / normalLength * distanceMm };
    } else {
      const between = { x: outgoingStart.x - incomingStart.x, y: outgoingStart.y - incomingStart.y };
      const alongIncoming = cross(between, outgoing) / determinant;
      result = { x: incomingStart.x + incoming.x * alongIncoming, y: incomingStart.y + incoming.y * alongIncoming };
    }
    if (Math.hypot(result.x - point.x, result.y - point.y) > Math.max(distanceMm * 8, distanceMm + EPSILON)) {
      throw new Error('La compensación genera una esquina demasiado aguda para exportarla con seguridad.');
    }
    return result;
  });

  for (let first = 0; first < shifted.length; first += 1) {
    const firstNext = (first + 1) % shifted.length;
    for (let second = first + 1; second < shifted.length; second += 1) {
      const secondNext = (second + 1) % shifted.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (segmentsIntersect(shifted[first], shifted[firstNext], shifted[second], shifted[secondNext])) {
        throw new Error('La compensación de kerf cruza la geometría de una pieza; reduce el kerf o revisa sus medidas.');
      }
    }
  }
  if (signedArea(shifted) * area <= 0) throw new Error('La compensación colapsa el contorno de la pieza.');
  return shifted;
}

/** Offsets every part contour; optionally rebases a single layout to its content. */
export function offsetBoxLayout(layout: BoxCutLayout, kerfMm: number, rebase = false): BoxCutLayout {
  const halfKerf = kerfMm / 2;
  const panels: BoxPanelPlacement[] = layout.panels.map((placement) => ({
    ...placement,
    points: placement.points,
    cutPoints: offsetBoxContour(placement.points, halfKerf),
  }));
  if (!rebase || panels.length === 0 || halfKerf === 0) return { ...layout, panels };

  const xs = panels.flatMap(({ cutPoints, x }) => (cutPoints ?? []).map((point) => point.x + x));
  const ys = panels.flatMap(({ cutPoints, y }) => (cutPoints ?? []).map((point) => point.y + y));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
    panels: panels.map((placement) => ({ ...placement, x: placement.x - minX, y: placement.y - minY })),
  };
}

