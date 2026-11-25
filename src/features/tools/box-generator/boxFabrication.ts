import {
  buildBoxPanels,
  buildPanelOutline,
  formatBoxLength,
  type BoxCutLayout,
  type BoxPanel,
  type BoxPanelPlacement,
  type BoxPoint,
  type BoxProject,
  type BoxSheetSpec,
} from './boxModel';
import { offsetBoxContour } from './boxKerf';
import { nestPolygons } from './boxPolygonNesting';

export type { BoxSheetSpec } from './boxModel';

export interface BoxPanelMetrics {
  panelId: BoxPanel['id'];
  label: string;
  perimeterMm: number;
  cutLengthMm: number;
  areaMm2: number;
}

export interface BoxPlannedSheet {
  /** One-based sheet number for display and filenames. */
  index: number;
  /** Uses full sheet dimensions and placements accepted by SVG/DXF exporters. */
  layout: BoxCutLayout;
  usedAreaMm2: number;
  /** Net panel area divided by the full sheet area; value from 0 to 1. */
  efficiency: number;
}

export interface BoxSheetPlan {
  spec: BoxSheetSpec;
  sheets: BoxPlannedSheet[];
  panelMetrics: BoxPanelMetrics[];
  totalSheets: number;
  totalAreaMm2: number;
  totalCutLengthMm: number;
}

interface MeasuredPanel {
  panel: BoxPanel;
  points: BoxPoint[];
  minX: number;
  minY: number;
  width: number;
  height: number;
  cutPoints: BoxPoint[];
  cutMinX: number;
  cutMinY: number;
  cutWidth: number;
  cutHeight: number;
  metrics: BoxPanelMetrics;
}

function requireFinite(value: number, label: string, minimum: number, unit: BoxProject['unit'], inclusive = false) {
  if (!Number.isFinite(value) || (inclusive ? value < minimum : value <= minimum)) {
    throw new Error(`${label} debe ser ${inclusive ? 'mayor o igual' : 'mayor'} que ${formatBoxLength(minimum, unit)}.`);
  }
}

/** Perimeter and shoelace area of a simple, closed contour without holes. */
export function measureBoxContour(points: readonly BoxPoint[]) {
  if (points.length < 3) throw new Error('El contorno de la pieza necesita al menos tres puntos.');
  let perimeterMm = 0;
  let twiceSignedArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error('El contorno contiene coordenadas inválidas.');
    }
    perimeterMm += Math.hypot(next.x - point.x, next.y - point.y);
    twiceSignedArea += point.x * next.y - next.x * point.y;
  }
  const areaMm2 = Math.abs(twiceSignedArea) / 2;
  if (!Number.isFinite(perimeterMm) || !Number.isFinite(areaMm2) || areaMm2 <= 0) {
    throw new Error('El contorno de la pieza no tiene un área válida.');
  }
  return { perimeterMm, areaMm2 };
}

function bounds(points: readonly BoxPoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs), minY: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function rotatePoints(points: readonly BoxPoint[]) {
  return points.map(({ x, y }) => ({ x: -y, y: x }));
}

function measurePanel(panel: BoxPanel, project: BoxProject, kerfMm: number): MeasuredPanel {
  const points = buildPanelOutline(panel, project);
  const nominalBounds = bounds(points);
  const { perimeterMm, areaMm2 } = measureBoxContour(points);
  const cutPoints = offsetBoxContour(points, kerfMm / 2);
  const cutBounds = bounds(cutPoints);
  const { perimeterMm: cutLengthMm } = measureBoxContour(cutPoints);
  if (nominalBounds.width <= 0 || nominalBounds.height <= 0 || cutBounds.width <= 0 || cutBounds.height <= 0) {
    throw new Error(`La pieza ${panel.label} no tiene dimensiones válidas.`);
  }
  return {
    panel,
    points,
    minX: nominalBounds.minX,
    minY: nominalBounds.minY,
    width: nominalBounds.width,
    height: nominalBounds.height,
    cutPoints,
    cutMinX: cutBounds.minX,
    cutMinY: cutBounds.minY,
    cutWidth: cutBounds.width,
    cutHeight: cutBounds.height,
    metrics: { panelId: panel.id, label: panel.label, perimeterMm, cutLengthMm, areaMm2 },
  };
}

/**
 * Deterministic polygon nesting of kerf-compensated contours. Sheet dimensions,
 * clearances, and kerf are in millimetres regardless of the project's display unit.
 */
export function planBoxSheets(
  project: BoxProject,
  spec: BoxSheetSpec,
  kerfMm = project.camProfile.kerfMm ?? 0,
): BoxSheetPlan {
  requireFinite(spec.widthMm, 'El ancho de la plancha', 0, project.unit);
  requireFinite(spec.heightMm, 'El alto de la plancha', 0, project.unit);
  requireFinite(spec.marginMm, 'El margen', 0, project.unit, true);
  requireFinite(spec.gapMm, 'La separación', 0, project.unit, true);
  requireFinite(kerfMm, 'La compensación de kerf', 0, 'mm', true);
  if (kerfMm > 0 && spec.gapMm + 1e-6 < kerfMm) {
    throw new Error(`La separación entre rutas debe ser al menos ${kerfMm.toFixed(3)} mm cuando hay kerf configurado.`);
  }
  if (!Number.isFinite(spec.widthMm * spec.heightMm)) {
    throw new Error('El área de la plancha excede el rango numérico permitido.');
  }
  const usableWidth = spec.widthMm - spec.marginMm * 2;
  const usableHeight = spec.heightMm - spec.marginMm * 2;
  if (usableWidth <= 0 || usableHeight <= 0) throw new Error('El margen deja la plancha sin área útil.');

  const measured = buildBoxPanels(project).map((panel) => measurePanel(panel, project, kerfMm));
  const allowedRotationsDeg = spec.rotationAllowed ? [0, 90] : [0];
  const sheetGrainDirection = spec.sheetGrainDirection === 'x'
    ? { x: 1, y: 0 }
    : spec.sheetGrainDirection === 'y'
      ? { x: 0, y: 1 }
      : undefined;
  const nesting = nestPolygons(
    measured.map((item) => ({
      id: item.panel.id,
      points: item.cutPoints,
      allowedRotationsDeg,
      // Local X is the panel's grain reference when a sheet grain is selected.
      ...(sheetGrainDirection ? { grainDirection: { x: 1, y: 0 } } : {}),
    })),
    {
      sheetWidthMm: spec.widthMm,
      sheetHeightMm: spec.heightMm,
      marginMm: spec.marginMm,
      gapMm: spec.gapMm,
      allowedRotationsDeg,
      sheetGrainDirection,
    },
  );
  if (nesting.failures.length > 0) {
    const failure = nesting.failures[0];
    const item = measured.find(({ panel }) => panel.id === failure.id);
    const label = item?.panel.label ?? failure.id;
    if (failure.code === 'too-large') {
      throw new Error(`${label}, con compensación incluida, no cabe en el área útil de la plancha (${usableWidth.toFixed(1)} × ${usableHeight.toFixed(1)} mm).`);
    }
    if (failure.code === 'no-grain-compatible-rotation') {
      throw new Error(`${label}: ninguna rotación permitida alinea el eje de veta con la plancha.`);
    }
    throw new Error(`${label}: ${failure.message}`);
  }

  const measuredById = new Map<string, MeasuredPanel>(measured.map((item) => [item.panel.id, item]));
  const sheets: BoxPlannedSheet[] = nesting.sheets.map((nestedSheet) => {
    const panels: BoxPanelPlacement[] = nestedSheet.placements.map((placement) => {
      const item = measuredById.get(placement.id);
      if (!item) throw new Error(`No se encontró la geometría fuente de la pieza ${placement.id}.`);
      const rotated = placement.rotationDeg === 90;
      const nominalRotated = rotated ? rotatePoints(item.points) : item.points;
      const cutRotated = rotated ? rotatePoints(item.cutPoints) : item.cutPoints;
      const cutOrigin = bounds(cutRotated);
      const nominalLocal = nominalRotated.map((point) => ({ x: point.x - cutOrigin.minX, y: point.y - cutOrigin.minY }));
      return {
        panel: item.panel,
        points: nominalLocal,
        cutPoints: placement.points,
        x: placement.x,
        y: placement.y,
        rotationDeg: rotated ? 90 : 0,
      };
    });
    const usedAreaMm2 = nestedSheet.placements.reduce((sum, placement) => sum + placement.areaMm2, 0);
    const sheetAreaMm2 = spec.widthMm * spec.heightMm;
    return {
      index: nestedSheet.index,
      layout: { width: spec.widthMm, height: spec.heightMm, panels },
      usedAreaMm2,
      efficiency: usedAreaMm2 / sheetAreaMm2,
    };
  });
  return {
    spec: { ...spec, sheetGrainDirection: spec.sheetGrainDirection ?? 'none' },
    sheets,
    panelMetrics: measured.map(({ metrics }) => metrics),
    totalSheets: sheets.length,
    totalAreaMm2: measured.reduce((sum, { metrics }) => sum + metrics.areaMm2, 0),
    totalCutLengthMm: measured.reduce((sum, { metrics }) => sum + metrics.cutLengthMm, 0),
  };
}
