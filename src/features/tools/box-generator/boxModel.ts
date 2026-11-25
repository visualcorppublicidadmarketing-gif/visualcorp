export type BoxUnit = 'mm' | 'in';
export type BoxDimensionMode = 'outside' | 'inside';
export type BoxClosure = 'open' | 'closed';
export type BoxJointStyle = 'finger' | 'flat';
export type BoxEdgeStyle = 'flat' | 'tab' | 'slot';

export interface BoxProject {
  schemaVersion: 1;
  title: string;
  dimensionsMm: { width: number; height: number; depth: number };
  thicknessMm: number;
  unit: BoxUnit;
  dimensionMode: BoxDimensionMode;
  closure: BoxClosure;
  jointStyle: BoxJointStyle;
  fingerWidthMm: number;
  panelGapMm: number;
  previewColor: string;
  includePartLabels: boolean;
  sheetSpec: { widthMm: number; heightMm: number; marginMm: number; gapMm: number } | null;
}

export interface BoxResolvedDimensions {
  outside: { width: number; height: number; depth: number };
  inside: { width: number; height: number; depth: number };
  wallHeight: number;
  baseWidth: number;
  baseDepth: number;
}

export interface BoxPoint {
  x: number;
  y: number;
}

export interface BoxPanel {
  id: 'base' | 'front' | 'back' | 'left' | 'right' | 'lid';
  label: string;
  width: number;
  height: number;
  column: number;
  row: number;
  edges: Record<'bottom' | 'right' | 'top' | 'left', BoxEdgeStyle>;
  edgeInsets?: Partial<Record<'bottom' | 'right' | 'top' | 'left', number>>;
  edgePhases?: Partial<Record<'bottom' | 'right' | 'top' | 'left', 0 | 1>>;
}

export interface BoxPanelPlacement {
  panel: BoxPanel;
  x: number;
  y: number;
  points: BoxPoint[];
}

export interface BoxCutLayout {
  width: number;
  height: number;
  panels: BoxPanelPlacement[];
}

export const defaultBoxProject: BoxProject = {
  schemaVersion: 1,
  title: 'Caja básica',
  dimensionsMm: { width: 100, height: 50, depth: 100 },
  thicknessMm: 3,
  unit: 'mm',
  dimensionMode: 'outside',
  closure: 'open',
  jointStyle: 'finger',
  fingerWidthMm: 12,
  panelGapMm: 5,
  previewColor: '#d6ad56',
  includePartLabels: false,
  sheetSpec: null,
};

export const mmToBoxUnit = (value: number, unit: BoxUnit) => unit === 'in' ? value / 25.4 : value;
export const boxUnitToMm = (value: number, unit: BoxUnit) => unit === 'in' ? value * 25.4 : value;

export function maxBoxThicknessMm(project: Pick<BoxProject, 'dimensionsMm' | 'dimensionMode'>) {
  return Math.max(0.5, Math.min(
    30,
    (project.dimensionsMm.width - 1) / 2,
    (project.dimensionsMm.depth - 1) / 2,
    (project.dimensionsMm.height - 1) / 2,
  ));
}

export function formatBoxLength(mm: number, unit: BoxUnit, maximumFractionDigits = 2) {
  const value = mmToBoxUnit(mm, unit);
  return `${new Intl.NumberFormat('es-EC', { maximumFractionDigits }).format(value)} ${unit}`;
}

export function resolveBoxDimensions(project: BoxProject): BoxResolvedDimensions {
  const thickness = Math.min(maxBoxThicknessMm(project), Math.max(0.5, project.thicknessMm));
  const requested = project.dimensionsMm;
  const outside = project.dimensionMode === 'outside'
    ? { width: requested.width, height: requested.height, depth: requested.depth }
    : {
        width: requested.width + thickness * 2,
        height: requested.height + thickness * (project.closure === 'closed' ? 2 : 1),
        depth: requested.depth + thickness * 2,
      };

  return {
    outside,
    inside: {
      width: Math.max(1, outside.width - thickness * 2),
      height: Math.max(1, outside.height - thickness * (project.closure === 'closed' ? 2 : 1)),
      depth: Math.max(1, outside.depth - thickness * 2),
    },
    wallHeight: outside.height,
    baseWidth: Math.max(1, outside.width - thickness * 2),
    baseDepth: Math.max(1, outside.depth - thickness * 2),
  };
}

function edgeStyle(project: BoxProject, style: BoxEdgeStyle): BoxEdgeStyle {
  return project.jointStyle === 'flat' ? 'flat' : style;
}

export function buildBoxPanels(project: BoxProject): BoxPanel[] {
  const dimensions = resolveBoxDimensions(project);
  const { outside, baseWidth, baseDepth, wallHeight } = dimensions;
  const bottom: BoxPanel = {
    id: 'base', label: 'Base', width: baseWidth, height: baseDepth, column: 0, row: 0,
    edges: { bottom: edgeStyle(project, 'tab'), right: edgeStyle(project, 'tab'), top: edgeStyle(project, 'tab'), left: edgeStyle(project, 'tab') },
  };
  const front: BoxPanel = {
    id: 'front', label: 'Frente', width: baseWidth, height: wallHeight, column: 1, row: 0,
    edges: { bottom: edgeStyle(project, 'slot'), right: edgeStyle(project, 'tab'), top: edgeStyle(project, project.closure === 'closed' ? 'slot' : 'flat'), left: edgeStyle(project, 'tab') },
  };
  // These panels traverse the base/lid edges in the opposite direction once assembled.
  const back: BoxPanel = { ...front, id: 'back', label: 'Fondo', column: 2, edgePhases: { bottom: 1, top: 0 } };
  const left: BoxPanel = {
    id: 'left', label: 'Lateral izquierdo', width: outside.depth, height: wallHeight, column: 0, row: 1,
    edges: { bottom: edgeStyle(project, 'slot'), right: edgeStyle(project, 'slot'), top: edgeStyle(project, project.closure === 'closed' ? 'slot' : 'flat'), left: edgeStyle(project, 'slot') },
    edgeInsets: { bottom: project.thicknessMm, top: project.thicknessMm },
    edgePhases: { bottom: 1, top: 0 },
  };
  const right: BoxPanel = { ...left, id: 'right', label: 'Lateral derecho', column: 1, edgePhases: undefined };

  const panels = [bottom, front, back, left, right];
  if (project.closure === 'closed') {
    panels.push({
      id: 'lid', label: 'Tapa', width: baseWidth, height: baseDepth, column: 2, row: 1,
      edges: { bottom: edgeStyle(project, 'tab'), right: edgeStyle(project, 'tab'), top: edgeStyle(project, 'tab'), left: edgeStyle(project, 'tab') },
    });
  }
  return panels;
}

function addPoint(points: BoxPoint[], point: BoxPoint) {
  const previous = points[points.length - 1];
  if (!previous || Math.abs(previous.x - point.x) > 0.0001 || Math.abs(previous.y - point.y) > 0.0001) points.push(point);
}

function edgePoints(
  from: BoxPoint,
  to: BoxPoint,
  style: BoxEdgeStyle,
  depth: number,
  fingerWidth: number,
  insetStart = 0,
  insetEnd = 0,
  phase = 0,
): BoxPoint[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const points: BoxPoint[] = [];
  if (style === 'flat' || length <= insetStart + insetEnd + 1) return [from, to];

  const activeLength = length - insetStart - insetEnd;
  let segmentCount = Math.max(2, Math.round(activeLength / Math.max(3, fingerWidth)));
  if (segmentCount % 2 !== 0) segmentCount += 1;
  const segmentLength = activeLength / segmentCount;
  const tangentX = dx / length;
  const tangentY = dy / length;
  const outwardX = tangentY;
  const outwardY = -tangentX;
  const at = (along: number, offset: number): BoxPoint => ({
    x: from.x + tangentX * along + outwardX * offset,
    y: from.y + tangentY * along + outwardY * offset,
  });

  addPoint(points, from);
  addPoint(points, at(insetStart, 0));
  for (let index = 0; index < segmentCount; index += 1) {
    const start = insetStart + segmentLength * index;
    const end = insetStart + segmentLength * (index + 1);
    const active = (index + phase) % 2 === 0;
    const offset = active ? (style === 'tab' ? depth : -depth) : 0;
    addPoint(points, at(start, offset));
    addPoint(points, at(end, offset));
    addPoint(points, at(end, 0));
  }
  addPoint(points, to);
  return points;
}

export function buildPanelOutline(panel: BoxPanel, project: BoxProject): BoxPoint[] {
  const { width, height } = panel;
  const depth = project.thicknessMm;
  const edges: Array<{ key: keyof BoxPanel['edges']; from: BoxPoint; to: BoxPoint; phase: number }> = [
    { key: 'bottom', from: { x: 0, y: 0 }, to: { x: width, y: 0 }, phase: 0 },
    { key: 'right', from: { x: width, y: 0 }, to: { x: width, y: height }, phase: 0 },
    { key: 'top', from: { x: width, y: height }, to: { x: 0, y: height }, phase: 1 },
    { key: 'left', from: { x: 0, y: height }, to: { x: 0, y: 0 }, phase: 1 },
  ];
  const points: BoxPoint[] = [];
  for (const edge of edges) {
    const generated = edgePoints(
      edge.from,
      edge.to,
      panel.edges[edge.key],
      depth,
      project.fingerWidthMm,
      panel.edgeInsets?.[edge.key] ?? 0,
      panel.edgeInsets?.[edge.key] ?? 0,
      panel.edgePhases?.[edge.key] ?? edge.phase,
    );
    generated.forEach((point) => addPoint(points, point));
  }
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.abs(first.x - last.x) < 0.0001 && Math.abs(first.y - last.y) < 0.0001) points.pop();
  }
  return points;
}

export function buildBoxCutLayout(project: BoxProject): BoxCutLayout {
  const panels = buildBoxPanels(project);
  const gap = Math.max(0, project.panelGapMm, project.jointStyle === 'finger' ? project.thicknessMm * 2 + 2 : 0);
  const outlined = panels.map((panel) => {
    const points = buildPanelOutline(panel, project);
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return { panel, points, minX: Math.min(...xs), minY: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  });
  const columns = Array.from({ length: 3 }, (_, column) => Math.max(0, ...outlined.filter(({ panel }) => panel.column === column).map((item) => item.width)));
  const rows = Array.from({ length: 2 }, (_, row) => Math.max(0, ...outlined.filter(({ panel }) => panel.row === row).map((item) => item.height)));
  const columnOffsets = [0, columns[0] + gap, columns[0] + columns[1] + gap * 2];
  const rowOffsets = [0, rows[0] + gap];
  const placedPanels = outlined.map(({ panel, points, minX, minY }): BoxPanelPlacement => ({
    panel,
    x: columnOffsets[panel.column] - minX,
    y: rowOffsets[panel.row] - minY,
    points,
  }));
  return {
    width: columns.reduce((sum, value) => sum + value, 0) + gap * 2,
    height: rows.reduce((sum, value) => sum + value, 0) + gap,
    panels: placedPanels,
  };
}

function pathForPoints(points: BoxPoint[], offsetX = 0, offsetY = 0) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${(point.x + offsetX).toFixed(3)} ${(point.y + offsetY).toFixed(3)}`).join(' ') + ' Z';
}

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function createBoxSvg(project: BoxProject, layout = buildBoxCutLayout(project)) {
  const { outside } = resolveBoxDimensions(project);
  const info = `${project.title} · ${outside.width.toFixed(2)} × ${outside.height.toFixed(2)} × ${outside.depth.toFixed(2)} mm · material ${project.thicknessMm.toFixed(2)} mm`;
  const cutPaths = layout.panels.map(({ panel, x, y, points }) => `<path data-panel="${panel.id}" d="${pathForPoints(points, x, y)}"/>`).join('\n  ');
  const labels = project.includePartLabels
    ? layout.panels.map(({ panel, x, y }) => `<text x="${(x + panel.width / 2).toFixed(3)}" y="${(y + panel.height / 2).toFixed(3)}" text-anchor="middle" dominant-baseline="middle">${escapeXml(panel.label)}</text>`).join('\n  ')
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width.toFixed(3)}mm" height="${layout.height.toFixed(3)}mm" viewBox="0 0 ${layout.width.toFixed(3)} ${layout.height.toFixed(3)}">
  <title>${escapeXml(info)}</title>
  <desc>Diseño preliminar generado en Visual Corp Suite. Verificar kerf, tolerancia y ensamble con un corte de muestra.</desc>
  <g id="CUT" fill="none" stroke="#ff4057" stroke-width="0.1" stroke-linecap="round" stroke-linejoin="round">${cutPaths}</g>
  ${labels ? `<g id="LABELS" fill="#20202a" stroke="none" font-family="sans-serif" font-size="${Math.max(2, project.thicknessMm * 1.5).toFixed(2)}">${labels}</g>` : ''}
</svg>`;
}

export function createBoxDxf(project: BoxProject, layout = buildBoxCutLayout(project)) {
  const pair = (code: number, value: string | number) => `${code}\n${value}\n`;
  let output = pair(0, 'SECTION') + pair(2, 'HEADER') + pair(9, '$INSUNITS') + pair(70, 4) + pair(0, 'ENDSEC') + pair(0, 'SECTION') + pair(2, 'ENTITIES');
  for (const { panel, x, y, points } of layout.panels) {
    output += pair(0, 'LWPOLYLINE') + pair(8, 'CUT') + pair(100, 'AcDbEntity') + pair(100, 'AcDbPolyline') + pair(90, points.length) + pair(70, 1) + pair(999, panel.label);
    for (const point of points) {
      output += pair(10, (x + point.x).toFixed(3)) + pair(20, (layout.height - y - point.y).toFixed(3));
    }
  }
  output += pair(0, 'ENDSEC') + pair(0, 'EOF');
  return output;
}

export function normalizeBoxProject(candidate: unknown): BoxProject {
  if (!candidate || typeof candidate !== 'object') throw new Error('El archivo no contiene un diseño válido.');
  const source = candidate as Partial<BoxProject>;
  if (source.schemaVersion !== 1 || !source.dimensionsMm) throw new Error('La versión del archivo no es compatible.');
  const numberOr = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const unit: BoxUnit = source.unit === 'in' ? 'in' : 'mm';
  const dimensionMode: BoxDimensionMode = source.dimensionMode === 'inside' ? 'inside' : 'outside';
  const closure: BoxClosure = source.closure === 'closed' ? 'closed' : 'open';
  const jointStyle: BoxJointStyle = source.jointStyle === 'flat' ? 'flat' : 'finger';
  const color = typeof source.previewColor === 'string' && /^#[0-9a-f]{6}$/i.test(source.previewColor) ? source.previewColor : defaultBoxProject.previewColor;
  const sheetCandidate = source.sheetSpec;
  const sheetSpec = sheetCandidate
    && Number.isFinite(sheetCandidate.widthMm) && Number.isFinite(sheetCandidate.heightMm)
    && Number.isFinite(sheetCandidate.marginMm) && Number.isFinite(sheetCandidate.gapMm)
    && sheetCandidate.widthMm >= 50 && sheetCandidate.widthMm <= 4000
    && sheetCandidate.heightMm >= 50 && sheetCandidate.heightMm <= 4000
    && sheetCandidate.marginMm >= 0 && sheetCandidate.marginMm <= 100
    && sheetCandidate.gapMm >= 0 && sheetCandidate.gapMm <= 100
    ? { widthMm: sheetCandidate.widthMm, heightMm: sheetCandidate.heightMm, marginMm: sheetCandidate.marginMm, gapMm: sheetCandidate.gapMm }
    : null;
  const dimensionsMm = {
    width: Math.min(2000, Math.max(10, numberOr(source.dimensionsMm.width, 100))),
    height: Math.min(2000, Math.max(10, numberOr(source.dimensionsMm.height, 50))),
    depth: Math.min(2000, Math.max(10, numberOr(source.dimensionsMm.depth, 100))),
  };
  const thicknessMm = Math.min(30, Math.max(0.5, numberOr(source.thicknessMm, 3)));
  const maximumThickness = maxBoxThicknessMm({ dimensionsMm, dimensionMode });
  return {
    ...defaultBoxProject,
    ...source,
    schemaVersion: 1,
    title: typeof source.title === 'string' ? source.title.slice(0, 100) : defaultBoxProject.title,
    dimensionsMm,
    thicknessMm: Math.min(maximumThickness, thicknessMm),
    fingerWidthMm: Math.min(120, Math.max(3, numberOr(source.fingerWidthMm, 12))),
    panelGapMm: Math.min(100, Math.max(0, numberOr(source.panelGapMm, 5))),
    unit,
    dimensionMode,
    closure,
    jointStyle,
    previewColor: color,
    includePartLabels: Boolean(source.includePartLabels),
    sheetSpec,
  };
}

export function createBoxProjectFile(project: BoxProject) {
  const normalized = normalizeBoxProject(project);
  return JSON.stringify({ ...normalized, exportedAt: new Date().toISOString() }, null, 2);
}

export function boxProjectFilename(project: BoxProject, extension: 'svg' | 'dxf' | 'vcbox.json') {
  const dimensions = resolveBoxDimensions(project).outside;
  const title = project.title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'caja';
  return `${title}-${Math.round(dimensions.width)}x${Math.round(dimensions.height)}x${Math.round(dimensions.depth)}-${project.thicknessMm.toFixed(1).replace('.', 'p')}mm.${extension}`;
}

export function downloadBoxFile(filename: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
