import {
  buildBoxPanels,
  buildPanelOutline,
  type BoxCutLayout,
  type BoxPanel,
  type BoxPanelPlacement,
  type BoxPoint,
  type BoxProject,
} from './boxModel';

/** Dimensions are in millimetres. No machine profile or kerf is implied. */
export interface BoxSheetSpec {
  widthMm: number;
  heightMm: number;
  marginMm: number;
  gapMm: number;
}

export interface BoxPanelMetrics {
  panelId: BoxPanel['id'];
  label: string;
  perimeterMm: number;
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
  metrics: BoxPanelMetrics;
}

function requireFinite(value: number, label: string, minimum: number, inclusive = false) {
  if (!Number.isFinite(value) || (inclusive ? value < minimum : value <= minimum)) {
    throw new Error(`${label} debe ser ${inclusive ? 'mayor o igual' : 'mayor'} que ${minimum} mm.`);
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

function measurePanel(panel: BoxPanel, project: BoxProject): MeasuredPanel {
  const points = buildPanelOutline(panel, project);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const { perimeterMm, areaMm2 } = measureBoxContour(points);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX;
  const height = Math.max(...ys) - minY;
  if (width <= 0 || height <= 0) throw new Error(`La pieza ${panel.label} no tiene dimensiones válidas.`);
  return {
    panel,
    points,
    minX,
    minY,
    width,
    height,
    metrics: { panelId: panel.id, label: panel.label, perimeterMm, areaMm2 },
  };
}

/**
 * Deterministic shelf placement using contour bounding boxes. It does not rotate
 * pieces or claim optimal nesting, but never overlaps bounding boxes.
 */
export function planBoxSheets(project: BoxProject, spec: BoxSheetSpec): BoxSheetPlan {
  requireFinite(spec.widthMm, 'El ancho de la plancha', 0);
  requireFinite(spec.heightMm, 'El alto de la plancha', 0);
  requireFinite(spec.marginMm, 'El margen', 0, true);
  requireFinite(spec.gapMm, 'La separación', 0, true);
  if (!Number.isFinite(spec.widthMm * spec.heightMm)) {
    throw new Error('El área de la plancha excede el rango numérico permitido.');
  }
  const usableWidth = spec.widthMm - spec.marginMm * 2;
  const usableHeight = spec.heightMm - spec.marginMm * 2;
  if (usableWidth <= 0 || usableHeight <= 0) {
    throw new Error('El margen deja la plancha sin área útil.');
  }

  const measured = buildBoxPanels(project).map((panel) => measurePanel(panel, project));
  for (const item of measured) {
    if (item.width > usableWidth + 1e-6 || item.height > usableHeight + 1e-6) {
      throw new Error(`${item.panel.label} (${item.width.toFixed(1)} × ${item.height.toFixed(1)} mm) no cabe en el área útil de la plancha (${usableWidth.toFixed(1)} × ${usableHeight.toFixed(1)} mm).`);
    }
  }

  // Sort large pieces first; retain stable order for equal areas.
  const ordered = measured.map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.width * b.item.height - a.item.width * a.item.height || a.index - b.index);
  const sheets: BoxPlannedSheet[] = [];
  const newSheet = (): BoxPlannedSheet => {
    const sheet: BoxPlannedSheet = {
      index: sheets.length + 1,
      layout: { width: spec.widthMm, height: spec.heightMm, panels: [] },
      usedAreaMm2: 0,
      efficiency: 0,
    };
    sheets.push(sheet);
    return sheet;
  };
  let sheet = newSheet();
  let cursorX = spec.marginMm;
  let cursorY = spec.marginMm;
  let rowHeight = 0;
  const rightLimit = spec.widthMm - spec.marginMm;
  const bottomLimit = spec.heightMm - spec.marginMm;

  for (const { item } of ordered) {
    if (cursorX + item.width > rightLimit + 1e-6) {
      cursorX = spec.marginMm;
      cursorY += rowHeight + spec.gapMm;
      rowHeight = 0;
    }
    if (cursorY + item.height > bottomLimit + 1e-6) {
      sheet = newSheet();
      cursorX = spec.marginMm;
      cursorY = spec.marginMm;
      rowHeight = 0;
    }
    const placement: BoxPanelPlacement = {
      panel: item.panel,
      points: item.points,
      x: cursorX - item.minX,
      y: cursorY - item.minY,
    };
    sheet.layout.panels.push(placement);
    sheet.usedAreaMm2 += item.metrics.areaMm2;
    cursorX += item.width + spec.gapMm;
    rowHeight = Math.max(rowHeight, item.height);
  }

  const sheetArea = spec.widthMm * spec.heightMm;
  sheets.forEach((placed) => { placed.efficiency = placed.usedAreaMm2 / sheetArea; });
  return {
    spec: { ...spec },
    sheets,
    panelMetrics: measured.map(({ metrics }) => metrics),
    totalSheets: sheets.length,
    totalAreaMm2: measured.reduce((sum, { metrics }) => sum + metrics.areaMm2, 0),
    totalCutLengthMm: measured.reduce((sum, { metrics }) => sum + metrics.perimeterMm, 0),
  };
}
