import { offsetBoxLayout } from './boxKerf';
import { buildFingerJointEdgePoints } from './boxJoints';

export type BoxUnit = 'mm' | 'cm' | 'in';
export type BoxModelType = 'basic' | 'flexible' | 'sliding' | 'bottle' | 'jewelry';
export type BoxDimensionMode = 'outside' | 'inside';
export type BoxClosure = 'open' | 'closed';
export type BoxJointStyle = 'finger' | 'flat';
export type BoxEdgeStyle = 'flat' | 'tab' | 'slot';
export type BoxPanelId = 'base' | 'front' | 'back' | 'left' | 'right' | 'lid';
export type BoxPanelEdge = 'bottom' | 'right' | 'top' | 'left';

export interface BoxPanelEdgeRef {
  panelId: BoxPanelId;
  edge: BoxPanelEdge;
}

export interface BoxPanelEdgeJoint {
  pairId: string;
  matePanelId: BoxPanelId;
  mateEdge: BoxPanelEdge;
  role: 'male' | 'female' | 'flat';
  /** Distance the profile extends, taken from the mating panel's thickness. */
  depthMm: number;
  /** Intentional fit gap per mating flank; independent of laser kerf. */
  clearanceMm: number;
}

export interface BoxEdgeInset {
  startMm: number;
  endMm: number;
}

export interface BoxJointPair {
  id: string;
  a: BoxPanelEdgeRef;
  b: BoxPanelEdgeRef;
  aRole: BoxPanelEdgeJoint['role'];
  bRole: BoxPanelEdgeJoint['role'];
  aDepthMm: number;
  bDepthMm: number;
  clearanceMm: number;
  activeLengthMm: number;
}

export interface BoxCamProfile {
  materialName: string;
  /** null means not measured/configured; zero exports nominal, uncompensated contours. */
  kerfMm: number | null;
  cutSpeedMmPerMin: number | null;
  machineRatePerHour: number | null;
  sheetPrice: number | null;
}

export interface BoxSheetSpec {
  widthMm: number;
  heightMm: number;
  marginMm: number;
  gapMm: number;
  rotationAllowed: boolean;
  /** Axis of the sheet grain. Legacy projects normalize to `none`. */
  sheetGrainDirection?: 'x' | 'y' | 'none';
}

export type BoxLightingPreset = 'studio' | 'warm' | 'cool';

export interface BoxPanelArtwork {
  dataUrl: string;
  /** Normalized rectangle in the panel's local outline bounds (0–1). */
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BoxVector3 = [number, number, number];

export interface BoxPanelAssembly {
  positionMm: BoxVector3;
  rotationRad: BoxVector3;
  explosionDirection: BoxVector3;
}

export interface BoxProject {
  schemaVersion: 1 | 2;
  title: string;
  modelType: BoxModelType;
  dimensionsMm: { width: number; height: number; depth: number };
  thicknessMm: number;
  /** Per-panel overrides; omitted panels inherit thicknessMm for old files. */
  panelThicknessMm: Partial<Record<BoxPanelId, number>>;
  /** Mechanical fit gap per side, not laser kerf compensation. */
  jointClearanceMm: number;
  /** Difference between the rear and front top edge; only used by open boxes. */
  frontDropMm: number;
  unit: BoxUnit;
  dimensionMode: BoxDimensionMode;
  closure: BoxClosure;
  jointStyle: BoxJointStyle;
  fingerWidthMm: number;
  dividerCount: number;
  lidOpenDegrees: number;
  slidingClearanceMm: number;
  panelGapMm: number;
  previewColor: string;
  lightingPreset: BoxLightingPreset;
  artworkByPanel: Partial<Record<BoxPanel['id'], BoxPanelArtwork>>;
  includePartLabels: boolean;
  sheetSpec: BoxSheetSpec | null;
  camProfile: BoxCamProfile;
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
  id: string;
  label: string;
  width: number;
  height: number;
  thicknessMm: number;
  column: number;
  row: number;
  edges: Record<'bottom' | 'right' | 'top' | 'left', BoxEdgeStyle>;
  assembly: BoxPanelAssembly;
  topStartHeight?: number;
  topEndHeight?: number;
  edges: Record<BoxPanelEdge, BoxEdgeStyle>;
  edgeInsets?: Partial<Record<BoxPanelEdge, number | BoxEdgeInset>>;
  edgePhases?: Partial<Record<BoxPanelEdge, 0 | 1>>;
  edgeJoints?: Partial<Record<BoxPanelEdge, BoxPanelEdgeJoint>>;
}

export interface BoxPanelPlacement {
  panel: BoxPanel;
  x: number;
  y: number;
  /** Nominal face contour; artwork is clipped to this, never to the kerf path. */
  points: BoxPoint[];
  /** Optional machine centerline contour, offset from the nominal face. */
  cutPoints?: BoxPoint[];
  rotationDeg?: 0 | 90;
}

export interface BoxCutLayout {
  width: number;
  height: number;
  panels: BoxPanelPlacement[];
}

export const defaultBoxProject: BoxProject = {
  schemaVersion: 2,
  title: 'Caja básica',
  modelType: 'basic',
  dimensionsMm: { width: 100, height: 50, depth: 100 },
  thicknessMm: 3,
  panelThicknessMm: {},
  jointClearanceMm: 0,
  frontDropMm: 0,
  unit: 'mm',
  dimensionMode: 'outside',
  closure: 'open',
  jointStyle: 'finger',
  fingerWidthMm: 12,
  dividerCount: 0,
  lidOpenDegrees: 110,
  slidingClearanceMm: 0.5,
  panelGapMm: 5,
  previewColor: '#d6ad56',
  lightingPreset: 'studio',
  artworkByPanel: {},
  includePartLabels: false,
  sheetSpec: null,
  camProfile: { materialName: '', kerfMm: null, cutSpeedMmPerMin: null, machineRatePerHour: null, sheetPrice: null },
};

export const boxModelLabels: Record<BoxModelType, string> = {
  basic: 'Caja básica',
  flexible: 'Caja flexible con tapa articulada',
  sliding: 'Caja con tapa deslizable',
  bottle: 'Caja para botellas',
  jewelry: 'Caja para joyas',
};
export const mmToBoxUnit = (value: number, unit: BoxUnit) => unit === 'in' ? value / 25.4 : unit === 'cm' ? value / 10 : value;
export const boxUnitToMm = (value: number, unit: BoxUnit) => unit === 'in' ? value * 25.4 : unit === 'cm' ? value * 10 : value;

export function maxBoxThicknessMm(project: Pick<BoxProject, 'dimensionsMm' | 'dimensionMode'>) {
  return Math.max(0.5, Math.min(
    30,
    project.dimensionsMm.width / 3,
    project.dimensionsMm.depth / 3,
    project.dimensionsMm.height / 3,
  ));
}

export function getBoxPanelThicknessMm(project: Pick<BoxProject, 'thicknessMm' | 'panelThicknessMm' | 'dimensionsMm' | 'dimensionMode'>, panelId: BoxPanelId) {
  const requested = project.panelThicknessMm?.[panelId] ?? project.thicknessMm;
  return Math.min(maxBoxThicknessMm(project), Math.max(0.5, Number.isFinite(requested) ? requested : project.thicknessMm));
}

export function formatBoxLength(mm: number, unit: BoxUnit, maximumFractionDigits = 2) {
  const value = mmToBoxUnit(mm, unit);
  return `${new Intl.NumberFormat('es-EC', { maximumFractionDigits }).format(value)} ${unit}`;
}

export function formatBoxArea(mm2: number, unit: BoxUnit, maximumFractionDigits = 1) {
  const divisor = unit === 'in' ? 25.4 ** 2 : unit === 'cm' ? 100 : 1;
  const label = unit === 'in' ? 'in²' : unit === 'cm' ? 'cm²' : 'mm²';
  return `${new Intl.NumberFormat('es-EC', { maximumFractionDigits }).format(mm2 / divisor)} ${label}`;
}

export function resolveBoxDimensions(project: BoxProject): BoxResolvedDimensions {
  const requested = project.dimensionsMm;
  const baseThickness = getBoxPanelThicknessMm(project, 'base');
  const frontThickness = getBoxPanelThicknessMm(project, 'front');
  const backThickness = getBoxPanelThicknessMm(project, 'back');
  const leftThickness = getBoxPanelThicknessMm(project, 'left');
  const rightThickness = getBoxPanelThicknessMm(project, 'right');
  const lidThickness = getBoxPanelThicknessMm(project, 'lid');
  const outside = project.dimensionMode === 'outside'
    ? { width: requested.width, height: requested.height, depth: requested.depth }
    : {
        width: requested.width + leftThickness + rightThickness,
        height: requested.height + baseThickness + (project.closure === 'closed' ? lidThickness : 0),
        depth: requested.depth + frontThickness + backThickness,
      };

  const inside = {
    width: outside.width - leftThickness - rightThickness,
    height: outside.height - baseThickness - (project.closure === 'closed' ? lidThickness : 0),
    depth: outside.depth - frontThickness - backThickness,
  };
  return {
    outside,
    inside: {
      width: Math.max(1, inside.width),
      height: Math.max(1, inside.height),
      depth: Math.max(1, inside.depth),
    },
    wallHeight: outside.height,
    baseWidth: Math.max(1, outside.width - leftThickness - rightThickness),
    baseDepth: Math.max(1, outside.depth - frontThickness - backThickness),
  };
}

function edgeStyle(project: BoxProject, style: BoxEdgeStyle): BoxEdgeStyle {
  return project.jointStyle === 'flat' ? 'flat' : style;
}

interface BoxJointPairDefinition {
  id: string;
  a: BoxPanelEdgeRef;
  b: BoxPanelEdgeRef;
}

function panelEdgeEndpoints(panel: BoxPanel, edge: BoxPanelEdge): [BoxPoint, BoxPoint] {
  const topStartHeight = Math.min(panel.height, Math.max(1, panel.topStartHeight ?? panel.height));
  const topEndHeight = Math.min(panel.height, Math.max(1, panel.topEndHeight ?? panel.height));
  const endpoints: Record<BoxPanelEdge, [BoxPoint, BoxPoint]> = {
    bottom: [{ x: 0, y: 0 }, { x: panel.width, y: 0 }],
    right: [{ x: panel.width, y: 0 }, { x: panel.width, y: topEndHeight }],
    top: [{ x: panel.width, y: topEndHeight }, { x: 0, y: topStartHeight }],
    left: [{ x: 0, y: topStartHeight }, { x: 0, y: 0 }],
  };
  return endpoints[edge];
}

function getBoxEdgeInsets(panel: BoxPanel, edge: BoxPanelEdge): [number, number] {
  const insets = panel.edgeInsets?.[edge];
  if (typeof insets === 'number') return [insets, insets];
  return [insets?.startMm ?? 0, insets?.endMm ?? 0];
}

function pairBoxPanelEdges(project: BoxProject, panels: BoxPanel[]) {
  const pairDefinitions: BoxJointPairDefinition[] = [
    { id: 'base-front', a: { panelId: 'base', edge: 'bottom' }, b: { panelId: 'front', edge: 'bottom' } },
    { id: 'base-back', a: { panelId: 'base', edge: 'top' }, b: { panelId: 'back', edge: 'bottom' } },
    { id: 'base-left', a: { panelId: 'base', edge: 'left' }, b: { panelId: 'left', edge: 'bottom' } },
    { id: 'base-right', a: { panelId: 'base', edge: 'right' }, b: { panelId: 'right', edge: 'bottom' } },
    { id: 'front-left', a: { panelId: 'front', edge: 'left' }, b: { panelId: 'left', edge: 'right' } },
    { id: 'front-right', a: { panelId: 'front', edge: 'right' }, b: { panelId: 'right', edge: 'left' } },
    { id: 'back-left', a: { panelId: 'back', edge: 'right' }, b: { panelId: 'left', edge: 'left' } },
    { id: 'back-right', a: { panelId: 'back', edge: 'left' }, b: { panelId: 'right', edge: 'right' } },
  ];
  if (project.closure === 'closed') {
    pairDefinitions.push(
      { id: 'lid-front', a: { panelId: 'front', edge: 'top' }, b: { panelId: 'lid', edge: 'bottom' } },
      { id: 'lid-back', a: { panelId: 'back', edge: 'top' }, b: { panelId: 'lid', edge: 'top' } },
      { id: 'lid-left', a: { panelId: 'left', edge: 'top' }, b: { panelId: 'lid', edge: 'left' } },
      { id: 'lid-right', a: { panelId: 'right', edge: 'top' }, b: { panelId: 'lid', edge: 'right' } },
    );
  }

  const panelsById = new Map(panels.map((panel) => [panel.id, panel]));
  const pairedEdges = new Set<string>();
  for (const pair of pairDefinitions) {
    const aPanel = panelsById.get(pair.a.panelId);
    const bPanel = panelsById.get(pair.b.panelId);
    if (!aPanel || !bPanel) throw new Error(`No se encontraron las piezas del encastre ${pair.id}.`);
    const aKey = `${pair.a.panelId}.${pair.a.edge}`;
    const bKey = `${pair.b.panelId}.${pair.b.edge}`;
    if (pairedEdges.has(aKey) || pairedEdges.has(bKey)) throw new Error(`Una arista aparece más de una vez en el encastre ${pair.id}.`);
    pairedEdges.add(aKey);
    pairedEdges.add(bKey);

    const aStyle = aPanel.edges[pair.a.edge];
    const bStyle = bPanel.edges[pair.b.edge];
    const compatible = project.jointStyle === 'flat'
      ? aStyle === 'flat' && bStyle === 'flat'
      : (aStyle === 'tab' && bStyle === 'slot') || (aStyle === 'slot' && bStyle === 'tab');
    if (!compatible) throw new Error(`Las aristas ${aKey} y ${bKey} no forman una pareja macho/hembra compatible.`);

    const [aFrom, aTo] = panelEdgeEndpoints(aPanel, pair.a.edge);
    const [bFrom, bTo] = panelEdgeEndpoints(bPanel, pair.b.edge);
    const [aInsetStart, aInsetEnd] = getBoxEdgeInsets(aPanel, pair.a.edge);
    const [bInsetStart, bInsetEnd] = getBoxEdgeInsets(bPanel, pair.b.edge);
    const aLength = Math.hypot(aTo.x - aFrom.x, aTo.y - aFrom.y) - aInsetStart - aInsetEnd;
    const bLength = Math.hypot(bTo.x - bFrom.x, bTo.y - bFrom.y) - bInsetStart - bInsetEnd;
    if (aLength <= 1 || bLength <= 1 || Math.abs(aLength - bLength) > 0.05) {
      throw new Error(`Las aristas ${aKey} y ${bKey} no tienen la misma longitud útil para encastrar.`);
    }

    const roleOf = (style: BoxEdgeStyle): BoxPanelEdgeJoint['role'] => style === 'tab' ? 'male' : style === 'slot' ? 'female' : 'flat';
    const clearanceMm = project.jointStyle === 'flat' ? 0 : project.jointClearanceMm;
    aPanel.edgeJoints = { ...aPanel.edgeJoints, [pair.a.edge]: {
      pairId: pair.id, matePanelId: bPanel.id, mateEdge: pair.b.edge,
      role: roleOf(aStyle), depthMm: bPanel.thicknessMm, clearanceMm,
    } };
    bPanel.edgeJoints = { ...bPanel.edgeJoints, [pair.b.edge]: {
      pairId: pair.id, matePanelId: aPanel.id, mateEdge: pair.a.edge,
      role: roleOf(bStyle), depthMm: aPanel.thicknessMm, clearanceMm,
    } };
  }
  return panels;
}

export function buildBoxPanels(project: BoxProject): BoxPanel[] {
  const dimensions = resolveBoxDimensions(project);
  const { outside, baseWidth, baseDepth, wallHeight } = dimensions;
  const thickness = project.thicknessMm;
  const basicModel = project.modelType === 'basic';
  const edge = (style: BoxEdgeStyle) => edgeStyle(project, style);
  const panelThickness = (id: string) => (
    id === 'base' || id === 'front' || id === 'back' || id === 'left' || id === 'right' || id === 'lid'
      ? getBoxPanelThicknessMm(project, id as BoxPanelId)
      : thickness
  );
  const panel = (
    id: string,
    label: string,
    width: number,
    height: number,
    edges: BoxPanel['edges'],
    assembly: BoxPanelAssembly,
    edgeInsets?: BoxPanel['edgeInsets'],
    edgePhases?: BoxPanel['edgePhases'],
    topStartHeight?: number,
    topEndHeight?: number,
  ): BoxPanel => ({
    id, label, width, height, thicknessMm: panelThickness(id), column: 0, row: 0,
    edges, assembly, edgeInsets, edgePhases, topStartHeight, topEndHeight,
  });

  const base: BoxPanel = panel('base', 'Base', baseWidth, baseDepth,
    { bottom: edge('tab'), right: edge('tab'), top: edge('tab'), left: edge('tab') },
    { positionMm: [-baseWidth / 2, 0, baseDepth / 2], rotationRad: [-Math.PI / 2, 0, 0], explosionDirection: [0, -1, 0] });
  const frontThickness = panelThickness('front');
  const frontHeight = Math.max(panelThickness('base'), frontThickness,
    wallHeight - (basicModel && project.closure === 'open' ? project.frontDropMm : 0));
  const front: BoxPanel = panel('front', 'Frente', baseWidth, frontHeight,
    { bottom: edge('slot'), right: edge('tab'), top: edge(project.closure === 'closed' && project.modelType !== 'sliding' ? 'slot' : 'flat'), left: edge('tab') },
    { positionMm: [-baseWidth / 2, 0, baseDepth / 2], rotationRad: [0, 0, 0], explosionDirection: [0, 0, 1] });
  const back: BoxPanel = {
    ...front,
    id: 'back', label: 'Fondo', height: wallHeight, thicknessMm: panelThickness('back'),
    assembly: { positionMm: [baseWidth / 2, 0, -baseDepth / 2], rotationRad: [0, Math.PI, 0], explosionDirection: [0, 0, -1] },
    edgePhases: { bottom: 1, top: 0 },
  };
  const leftTop = basicModel ? frontHeight : wallHeight;
  const left: BoxPanel = panel('left', 'Lateral izquierdo', outside.depth, wallHeight,
    { bottom: edge('slot'), right: edge('slot'), top: edge(project.closure === 'closed' && project.modelType !== 'sliding' ? 'slot' : 'flat'), left: edge('slot') },
    { positionMm: [-baseWidth / 2, 0, -outside.depth / 2], rotationRad: [0, -Math.PI / 2, 0], explosionDirection: [-1, 0, 0] },
    { bottom: { startMm: panelThickness('back'), endMm: frontThickness }, top: project.closure === 'closed' ? { startMm: frontThickness, endMm: panelThickness('back') } : 0 },
    { bottom: 1, top: 0 }, basicModel ? wallHeight : undefined, leftTop);
  const right: BoxPanel = {
    ...left,
    id: 'right', label: 'Lateral derecho', thicknessMm: panelThickness('right'),
    assembly: { positionMm: [baseWidth / 2, 0, baseDepth / 2], rotationRad: [0, Math.PI / 2, 0], explosionDirection: [1, 0, 0] },
    topStartHeight: basicModel ? frontHeight : undefined,
    topEndHeight: basicModel ? wallHeight : undefined,
    edgePhases: undefined,
    edgeInsets: {
      bottom: { startMm: frontThickness, endMm: panelThickness('back') },
      top: project.closure === 'closed' ? { startMm: panelThickness('back'), endMm: frontThickness } : 0,
    },
  };
  const panels = [base, front, back, left, right];

  const hasLid = project.modelType === 'flexible' || project.modelType === 'sliding'
    || project.modelType === 'jewelry' || project.closure === 'closed';
  if (hasLid) {
    const lidWidth = project.modelType === 'sliding' ? Math.max(1, baseWidth - thickness * 2 - project.slidingClearanceMm * 2) : baseWidth;
    const lidDepth = project.modelType === 'sliding' ? Math.max(1, baseDepth - project.slidingClearanceMm * 2) : baseDepth;
    let lidAssembly: BoxPanelAssembly = {
      positionMm: [-baseWidth / 2, outside.height - panelThickness('lid'), baseDepth / 2],
      rotationRad: [-Math.PI / 2, 0, 0], explosionDirection: [0, 1, 0],
    };
    if (project.modelType === 'flexible') {
      const angle = project.closure === 'closed' ? 0 : project.lidOpenDegrees;
      lidAssembly = {
        positionMm: [-baseWidth / 2, outside.height - thickness, -baseDepth / 2],
        rotationRad: [Math.PI / 2 - angle * Math.PI / 180, 0, 0], explosionDirection: [0, 1, -0.6],
      };
    } else if (project.modelType === 'sliding') {
      lidAssembly = {
        positionMm: [-baseWidth / 2 + thickness + project.slidingClearanceMm, outside.height - thickness * 2,
          baseDepth / 2 - project.slidingClearanceMm + (project.closure === 'open' ? baseDepth * 0.72 : 0)],
        rotationRad: [-Math.PI / 2, 0, 0], explosionDirection: [0, 0.35, 1],
      };
    } else if (project.modelType === 'jewelry' && project.closure === 'open') {
      lidAssembly = {
        positionMm: [-baseWidth / 2 - lidWidth - thickness * 2, 0, baseDepth / 2],
        rotationRad: [-Math.PI / 2, 0, 0], explosionDirection: [-1, 0.35, 0],
      };
    }
    panels.push(panel(
      'lid', project.modelType === 'jewelry' ? 'Tapa suelta' : project.modelType === 'sliding' ? 'Tapa deslizable' : 'Tapa',
      lidWidth, lidDepth,
      basicModel ? { bottom: edge('tab'), right: edge('tab'), top: edge('tab'), left: edge('tab') }
        : { bottom: 'flat', right: 'flat', top: 'flat', left: 'flat' },
      lidAssembly,
    ));
  }

  if (project.modelType === 'sliding') {
    const railThickness = Math.max(1, thickness * 0.65);
    const railEdges = { bottom: 'flat', right: 'flat', top: 'flat', left: 'flat' } as const;
    panels.push(panel('guide-left', 'Guía izquierda', baseDepth, railThickness, railEdges,
      { positionMm: [-baseWidth / 2 + thickness, outside.height - thickness * 2.6, baseDepth / 2], rotationRad: [0, Math.PI / 2, 0], explosionDirection: [-1, 0.2, 0] }));
    panels.push(panel('guide-right', 'Guía derecha', baseDepth, railThickness, railEdges,
      { positionMm: [baseWidth / 2 - thickness * 1.5, outside.height - thickness * 2.6, baseDepth / 2], rotationRad: [0, Math.PI / 2, 0], explosionDirection: [1, 0.2, 0] }));
  }
  if (project.modelType === 'bottle' && project.dividerCount > 0) {
    for (let index = 1; index <= project.dividerCount; index += 1) {
      const x = -baseWidth / 2 + (baseWidth * index) / (project.dividerCount + 1);
      panels.push(panel(`divider-${index}`, `Separador ${index}`, baseDepth, wallHeight,
        { bottom: 'flat', right: 'flat', top: 'flat', left: 'flat' },
        { positionMm: [x, 0, baseDepth / 2], rotationRad: [0, Math.PI / 2, 0], explosionDirection: [index % 2 ? -0.3 : 0.3, 0, 0] }));
    }
  }
  if (project.modelType === 'jewelry' && project.dividerCount > 0) {
    const alongDepth = Math.ceil(project.dividerCount / 2);
    const alongWidth = Math.floor(project.dividerCount / 2);
    for (let index = 1; index <= alongDepth; index += 1) {
      const x = -baseWidth / 2 + (baseWidth * index) / (alongDepth + 1);
      panels.push(panel(`divider-depth-${index}`, `Separador de fondo ${index}`, baseDepth, wallHeight,
        { bottom: 'flat', right: 'flat', top: 'flat', left: 'flat' },
        { positionMm: [x, 0, baseDepth / 2], rotationRad: [0, Math.PI / 2, 0], explosionDirection: [index % 2 ? -0.3 : 0.3, 0, 0] }));
    }
    for (let index = 1; index <= alongWidth; index += 1) {
      const z = baseDepth / 2 - (baseDepth * index) / (alongWidth + 1);
      panels.push(panel(`divider-width-${index}`, `Separador lateral ${index}`, baseWidth, wallHeight,
        { bottom: 'flat', right: 'flat', top: 'flat', left: 'flat' },
        { positionMm: [-baseWidth / 2, 0, z], rotationRad: [0, 0, 0], explosionDirection: [0, 0, index % 2 ? -0.3 : 0.3] }));
    }
  }
  const arranged = panels.map((item, index) => ({ ...item, column: index % 3, row: Math.floor(index / 3) }));
  return basicModel ? pairBoxPanelEdges(project, arranged) : arranged;
}

export function buildBoxJointPairs(project: BoxProject): BoxJointPair[] {
  const panelsById = new Map(buildBoxPanels(project).map((panel) => [panel.id, panel]));
  const pairs: BoxJointPair[] = [];
  for (const panel of panelsById.values()) {
    for (const [edge, joint] of Object.entries(panel.edgeJoints ?? {}) as Array<[BoxPanelEdge, BoxPanelEdgeJoint]>) {
      if (panel.id.localeCompare(joint.matePanelId) > 0) continue;
      const matePanel = panelsById.get(joint.matePanelId);
      const mateJoint = matePanel?.edgeJoints?.[joint.mateEdge];
      if (!matePanel || !mateJoint || mateJoint.pairId !== joint.pairId) throw new Error(`La pareja ${joint.pairId} no es recíproca.`);
      const [from, to] = panelEdgeEndpoints(panel, edge);
      const [insetStart, insetEnd] = getBoxEdgeInsets(panel, edge);
      pairs.push({
        id: joint.pairId,
        a: { panelId: panel.id as BoxPanelId, edge },
        b: { panelId: matePanel.id as BoxPanelId, edge: joint.mateEdge },
        aRole: joint.role,
        bRole: mateJoint.role,
        aDepthMm: joint.depthMm,
        bDepthMm: mateJoint.depthMm,
        clearanceMm: joint.clearanceMm,
        activeLengthMm: Math.hypot(to.x - from.x, to.y - from.y) - insetStart - insetEnd,
      });
    }
  }
  return pairs;
}

function addPoint(points: BoxPoint[], point: BoxPoint) {
  const previous = points[points.length - 1];
  if (!previous || Math.abs(previous.x - point.x) > 0.0001 || Math.abs(previous.y - point.y) > 0.0001) points.push(point);
}

export function buildPanelOutline(panel: BoxPanel, project: BoxProject): BoxPoint[] {
  const { width, height } = panel;
  const topStartHeight = Math.min(height, Math.max(1, panel.topStartHeight ?? height));
  const topEndHeight = Math.min(height, Math.max(1, panel.topEndHeight ?? height));
  const edges: Array<{ key: BoxPanelEdge; from: BoxPoint; to: BoxPoint; phase: number }> = [
    { key: 'bottom', from: { x: 0, y: 0 }, to: { x: width, y: 0 }, phase: 0 },
    { key: 'right', from: { x: width, y: 0 }, to: { x: width, y: topEndHeight }, phase: 0 },
    { key: 'top', from: { x: width, y: topEndHeight }, to: { x: 0, y: topStartHeight }, phase: 1 },
    { key: 'left', from: { x: 0, y: topStartHeight }, to: { x: 0, y: 0 }, phase: 1 },
  ];
  const points: BoxPoint[] = [];
  for (const edge of edges) {
    const joint = panel.edgeJoints?.[edge.key];
    const style = panel.edges[edge.key];
    const depthMm = joint?.depthMm ?? panel.thicknessMm ?? project.thicknessMm;
    const [insetStartMm, insetEndMm] = getBoxEdgeInsets(panel, edge.key);
    const normalExtent = edge.key === 'bottom' ? height
      : edge.key === 'left' || edge.key === 'right' ? width
        : Math.min(width, height);
    if (style !== 'flat' && depthMm >= normalExtent - 0.0001) {
      throw new Error(`El grosor de la pieza vecina no cabe en el perfil ${panel.id}.${edge.key}; reduce el grosor o cambia las medidas.`);
    }
    const generated = buildFingerJointEdgePoints(
      edge.from,
      edge.to,
      style,
      depthMm,
      project.fingerWidthMm,
      insetStartMm,
      insetEndMm,
      panel.edgePhases?.[edge.key] ?? edge.phase,
      joint?.clearanceMm ?? 0,
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
  const maximumPanelThickness = Math.max(...panels.map((panel) => panel.thicknessMm));
  const nominalGap = Math.max(0, project.panelGapMm, project.jointStyle === 'finger' ? maximumPanelThickness * 2 + 2 : 0);
  const gap = nominalGap + (project.camProfile.kerfMm ?? 0);
  const outlined = panels.map((panel) => {
    const points = buildPanelOutline(panel, project);
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return { panel, points, minX: Math.min(...xs), minY: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  });
  const columns = Array.from({ length: 3 }, (_, column) => Math.max(0, ...outlined.filter(({ panel }) => panel.column === column).map((item) => item.width)));
  const rowCount = Math.max(1, ...outlined.map(({ panel }) => panel.row + 1));
  const rows = Array.from({ length: rowCount }, (_, row) => Math.max(0, ...outlined.filter(({ panel }) => panel.row === row).map((item) => item.height)));
  const columnOffsets = [0, columns[0] + gap, columns[0] + columns[1] + gap * 2];
  const rowOffsets = rows.map((_, row) => rows.slice(0, row).reduce((sum, value) => sum + value + gap, 0));
  const placedPanels = outlined.map(({ panel, points, minX, minY }): BoxPanelPlacement => ({
    panel,
    x: columnOffsets[panel.column] - minX,
    y: rowOffsets[panel.row] - minY,
    points,
  }));
  return {
    width: columns.reduce((sum, value) => sum + value, 0) + gap * 2,
    height: rows.reduce((sum, value) => sum + value, 0) + gap * Math.max(0, rows.length - 1),
    panels: placedPanels,
  };
}

function pathForPoints(points: BoxPoint[], offsetX = 0, offsetY = 0) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${(point.x + offsetX).toFixed(3)} ${(point.y + offsetY).toFixed(3)}`).join(' ') + ' Z';
}

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function boxPanelArtworkPlacement(panel: BoxPanelPlacement, artwork: BoxPanelArtwork) {
  const sourcePoints = panel.rotationDeg === 90
    ? panel.points.map(({ x, y }) => ({ x: y, y: -x }))
    : panel.points;
  const xs = sourcePoints.map((point) => point.x);
  const ys = sourcePoints.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX;
  const height = Math.max(...ys) - minY;
  const x = minX + width * artwork.x;
  const y = minY + height * artwork.y;
  return {
    x: panel.rotationDeg === 90 ? x : panel.x + x,
    y: panel.rotationDeg === 90 ? y : panel.y + y,
    width: width * artwork.width,
    height: height * artwork.height,
    transform: panel.rotationDeg === 90 ? `translate(${panel.x} ${panel.y}) rotate(90)` : undefined,
  };
}

function buildBoxExportLayout(project: BoxProject) {
  return offsetBoxLayout(buildBoxCutLayout(project), project.camProfile.kerfMm ?? 0, true);
}

export function createBoxSvg(project: BoxProject, layout = buildBoxExportLayout(project)) {
  const { outside } = resolveBoxDimensions(project);
  const panelThicknessInfo = layout.panels.map(({ panel }) => `${panel.label}: ${panel.thicknessMm.toFixed(2)} mm`).join(' · ');
  const info = `${project.title} · ${outside.width.toFixed(2)} × ${outside.height.toFixed(2)} × ${outside.depth.toFixed(2)} mm · espesores: ${panelThicknessInfo}`;
  const cutPaths = layout.panels.map(({ panel, x, y, points, cutPoints }) => `<path data-panel="${panel.id}" d="${pathForPoints(cutPoints ?? points, x, y)}"/>`).join('\n  ');
  const artClipPaths = layout.panels.flatMap((placement) => project.artworkByPanel[placement.panel.id]
    ? [`<clipPath id="panel-art-${placement.panel.id}"><path d="${pathForPoints(placement.points, placement.x, placement.y)}"/></clipPath>`]
    : []).join('\n  ');
  const artwork = layout.panels.flatMap((placement) => {
    const design = project.artworkByPanel[placement.panel.id];
    if (!design) return [];
    const position = boxPanelArtworkPlacement(placement, design);
    const transform = position.transform ? ` transform="${position.transform}"` : '';
    return [`<image data-panel="${placement.panel.id}" clip-path="url(#panel-art-${placement.panel.id})" x="${position.x.toFixed(3)}" y="${position.y.toFixed(3)}" width="${position.width.toFixed(3)}" height="${position.height.toFixed(3)}"${transform} preserveAspectRatio="none" href="${escapeXml(design.dataUrl)}"/>`];
  }).join('\n  ');
  const labels = project.includePartLabels
    ? layout.panels.map(({ panel, x, y, points }) => {
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
        const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
        return `<text data-panel="${panel.id}" x="${(x + centerX).toFixed(3)}" y="${(y + centerY).toFixed(3)}" text-anchor="middle" dominant-baseline="middle">${escapeXml(panel.label)}</text>`;
      }).join('\n  ')
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width.toFixed(3)}mm" height="${layout.height.toFixed(3)}mm" viewBox="0 0 ${layout.width.toFixed(3)} ${layout.height.toFixed(3)}">
  <title>${escapeXml(info)}</title>
  <desc>${project.camProfile.kerfMm === null || project.camProfile.kerfMm === 0 ? 'Kerf sin compensar; se exportaron rutas nominales.' : `Compensación de kerf de ${project.camProfile.kerfMm.toFixed(3)} mm aplicada al centro de la ruta.`} Diseño preliminar. Verificar tolerancia y ensamble con un corte de muestra.</desc>
  ${artClipPaths ? `<defs>${artClipPaths}</defs>` : ''}
  ${artwork ? `<g id="ARTWORK" data-operation="engrave">${artwork}</g>` : ''}
  ${labels ? `<g id="ENGRAVE" fill="#0000ff" stroke="none" font-family="sans-serif" font-size="${Math.max(2, project.thicknessMm * 1.5).toFixed(2)}">${labels}</g>` : ''}
  <g id="CUT" fill="none" stroke="#ff0000" stroke-width="0.1" stroke-linecap="round" stroke-linejoin="round">${cutPaths}</g>
</svg>`;
}

export function createBoxDxf(project: BoxProject, layout = buildBoxExportLayout(project)) {
  const pair = (code: number, value: string | number) => `${code}\n${value}\n`;
  let output = pair(0, 'SECTION') + pair(2, 'HEADER') + pair(9, '$INSUNITS') + pair(70, 4) + pair(0, 'ENDSEC');
  output += pair(0, 'SECTION') + pair(2, 'TABLES') + pair(0, 'TABLE') + pair(2, 'LAYER') + pair(70, 2);
  output += pair(0, 'LAYER') + pair(2, 'CUT') + pair(70, 0) + pair(62, 1) + pair(6, 'CONTINUOUS');
  output += pair(0, 'LAYER') + pair(2, 'ENGRAVE') + pair(70, 0) + pair(62, 5) + pair(6, 'CONTINUOUS');
  output += pair(0, 'ENDTAB') + pair(0, 'ENDSEC') + pair(0, 'SECTION') + pair(2, 'ENTITIES');
  const cutEntities: string[] = [];
  const engraveEntities: string[] = [];
  for (const { panel, x, y, points, cutPoints } of layout.panels) {
    const cutContour = cutPoints ?? points;
    let cutEntity = pair(0, 'LWPOLYLINE') + pair(8, 'CUT') + pair(100, 'AcDbEntity') + pair(100, 'AcDbPolyline') + pair(90, cutContour.length) + pair(70, 1) + pair(999, panel.label);
    for (const point of cutContour) {
      cutEntity += pair(10, (x + point.x).toFixed(3)) + pair(20, (layout.height - y - point.y).toFixed(3));
    }
    cutEntities.push(cutEntity);
    if (project.includePartLabels) {
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      const centerX = (x + (Math.min(...xs) + Math.max(...xs)) / 2).toFixed(3);
      const centerY = (layout.height - y - (Math.min(...ys) + Math.max(...ys)) / 2).toFixed(3);
      let textEntity = pair(0, 'TEXT') + pair(8, 'ENGRAVE') + pair(100, 'AcDbEntity') + pair(100, 'AcDbText');
      textEntity += pair(10, centerX) + pair(20, centerY) + pair(30, 0);
      textEntity += pair(40, Math.max(2, project.thicknessMm * 1.5).toFixed(2)) + pair(1, panel.label);
      textEntity += pair(72, 1) + pair(73, 2) + pair(11, centerX) + pair(21, centerY) + pair(31, 0);
      engraveEntities.push(textEntity);
    }
  }
  output += engraveEntities.join('') + cutEntities.join('');
  output += pair(0, 'ENDSEC') + pair(0, 'EOF');
  return output;
}

export function normalizeBoxProject(candidate: unknown): BoxProject {
  if (!candidate || typeof candidate !== 'object') throw new Error('El archivo no contiene un diseño válido.');
  const source = candidate as Partial<BoxProject>;
  if ((source.schemaVersion !== 1 && source.schemaVersion !== 2) || !source.dimensionsMm) throw new Error('La versión del archivo no es compatible.');
  const numberOr = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const unit: BoxUnit = source.unit === 'in' ? 'in' : source.unit === 'cm' ? 'cm' : 'mm';
  const modelType: BoxModelType = source.modelType === 'flexible' || source.modelType === 'sliding' || source.modelType === 'bottle' || source.modelType === 'jewelry' ? source.modelType : 'basic';
  const dimensionMode: BoxDimensionMode = source.dimensionMode === 'inside' ? 'inside' : 'outside';
  const closure: BoxClosure = source.closure === 'closed' ? 'closed' : 'open';
  const jointStyle: BoxJointStyle = source.jointStyle === 'flat' ? 'flat' : 'finger';
  const color = typeof source.previewColor === 'string' && /^#[0-9a-f]{6}$/i.test(source.previewColor) ? source.previewColor : defaultBoxProject.previewColor;
  const lightingPreset: BoxLightingPreset = source.lightingPreset === 'warm' || source.lightingPreset === 'cool' ? source.lightingPreset : 'studio';
  const sheetCandidate = source.sheetSpec;
  const sheetSpec = sheetCandidate
    && Number.isFinite(sheetCandidate.widthMm) && Number.isFinite(sheetCandidate.heightMm)
    && Number.isFinite(sheetCandidate.marginMm) && Number.isFinite(sheetCandidate.gapMm)
    && sheetCandidate.widthMm >= 50 && sheetCandidate.widthMm <= 4000
    && sheetCandidate.heightMm >= 50 && sheetCandidate.heightMm <= 4000
    && sheetCandidate.marginMm >= 0 && sheetCandidate.marginMm <= 100
    && sheetCandidate.gapMm >= 0 && sheetCandidate.gapMm <= 100
    ? {
        widthMm: sheetCandidate.widthMm,
        heightMm: sheetCandidate.heightMm,
        marginMm: sheetCandidate.marginMm,
        gapMm: sheetCandidate.gapMm,
        rotationAllowed: Boolean(sheetCandidate.rotationAllowed),
        sheetGrainDirection: sheetCandidate.sheetGrainDirection === 'x' || sheetCandidate.sheetGrainDirection === 'y'
          ? sheetCandidate.sheetGrainDirection
          : 'none' as const,
      }
    : null;
  const camSource = source.camProfile && typeof source.camProfile === 'object' ? source.camProfile : defaultBoxProject.camProfile;
  const optionalCamNumber = (value: unknown, maximum: number) => (
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum ? value : null
  );
  const artworkCandidate = source.artworkByPanel && typeof source.artworkByPanel === 'object' ? source.artworkByPanel : {};
  const validPanelIds: BoxPanel['id'][] = ['base', 'front', 'back', 'left', 'right', 'lid'];
  const artworkByPanel: BoxProject['artworkByPanel'] = {};
  let artworkPayloadLength = 0;
  for (const panelId of validPanelIds) {
    const design = artworkCandidate[panelId];
    if (!design || typeof design !== 'object' || typeof design.dataUrl !== 'string') continue;
    const allowedDataUrl = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
    if (design.dataUrl.length > 8_500_000 || !allowedDataUrl.test(design.dataUrl)) continue;
    artworkPayloadLength += design.dataUrl.length;
    if (artworkPayloadLength > 20_000_000) throw new Error('El conjunto de imágenes supera el límite de 20 MB del archivo de proyecto.');
    const normalized = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
    const width = typeof design.width === 'number' && Number.isFinite(design.width) ? Math.min(1, Math.max(0.05, design.width)) : 0.65;
    const height = typeof design.height === 'number' && Number.isFinite(design.height) ? Math.min(1, Math.max(0.05, design.height)) : 0.65;
    artworkByPanel[panelId] = {
      dataUrl: design.dataUrl,
      width,
      height,
      x: Math.min(1 - width, normalized(design.x, (1 - width) / 2)),
      y: Math.min(1 - height, normalized(design.y, (1 - height) / 2)),
    };
  }
  const dimensionsMm = {
    width: Math.min(2000, Math.max(10, numberOr(source.dimensionsMm.width, 100))),
    height: Math.min(2000, Math.max(10, numberOr(source.dimensionsMm.height, 50))),
    depth: Math.min(2000, Math.max(10, numberOr(source.dimensionsMm.depth, 100))),
  };
  const thicknessMm = Math.min(30, Math.max(0.5, numberOr(source.thicknessMm, 3)));
  const maximumThickness = maxBoxThicknessMm({ dimensionsMm, dimensionMode });
  const normalizedThickness = Math.min(maximumThickness, thicknessMm);
  const panelThicknessSource = source.panelThicknessMm && typeof source.panelThicknessMm === 'object' ? source.panelThicknessMm : {};
  const panelIds: BoxPanelId[] = ['base', 'front', 'back', 'left', 'right', 'lid'];
  const panelThicknessMm: BoxProject['panelThicknessMm'] = {};
  for (const panelId of panelIds) {
    const candidateThickness = panelThicknessSource[panelId];
    if (typeof candidateThickness === 'number' && Number.isFinite(candidateThickness)) {
      panelThicknessMm[panelId] = Math.min(maximumThickness, Math.max(0.5, candidateThickness));
    }
  }
  const panelThickness = (panelId: BoxPanelId) => panelThicknessMm[panelId] ?? normalizedThickness;
  const jointClearanceMm = typeof source.jointClearanceMm === 'number'
    && Number.isFinite(source.jointClearanceMm) && source.jointClearanceMm >= 0 && source.jointClearanceMm <= 10
    ? source.jointClearanceMm
    : defaultBoxProject.jointClearanceMm;
  const normalizedWallHeight = dimensionMode === 'outside'
    ? dimensionsMm.height
    : dimensionsMm.height + panelThickness('base') + (closure === 'closed' ? panelThickness('lid') : 0);
  const normalizedFrontThickness = panelThickness('front');
  const minimumFrontHeight = Math.max(normalizedFrontThickness, panelThickness('base'));
  return {
    ...defaultBoxProject,
    ...source,
    schemaVersion: 2,
    title: typeof source.title === 'string' ? source.title.slice(0, 100) : defaultBoxProject.title,
    modelType,
    dimensionsMm,
    thicknessMm: normalizedThickness,
    panelThicknessMm,
    jointClearanceMm,
    frontDropMm: closure === 'open'
      ? Math.min(Math.max(0, normalizedWallHeight - minimumFrontHeight), Math.max(0, numberOr(source.frontDropMm, 0)))
      : 0,
    fingerWidthMm: Math.min(120, Math.max(3, numberOr(source.fingerWidthMm, 12))),
    dividerCount: Math.round(Math.min(6, Math.max(0, numberOr(source.dividerCount, modelType === 'bottle' ? 1 : modelType === 'jewelry' ? 3 : 0)))),
    lidOpenDegrees: Math.min(135, Math.max(0, numberOr(source.lidOpenDegrees, 110))),
    slidingClearanceMm: Math.min(5, Math.max(0, numberOr(source.slidingClearanceMm, 0.5))),
    panelGapMm: Math.min(100, Math.max(0, numberOr(source.panelGapMm, 5))),
    unit,
    dimensionMode,
    closure,
    jointStyle,
    previewColor: color,
    lightingPreset,
    artworkByPanel,
    includePartLabels: Boolean(source.includePartLabels),
    sheetSpec,
    camProfile: {
      materialName: typeof camSource.materialName === 'string' ? camSource.materialName.slice(0, 80) : '',
      kerfMm: optionalCamNumber(camSource.kerfMm, 10),
      cutSpeedMmPerMin: optionalCamNumber(camSource.cutSpeedMmPerMin, 100000),
      machineRatePerHour: optionalCamNumber(camSource.machineRatePerHour, 100000),
      sheetPrice: optionalCamNumber(camSource.sheetPrice, 1000000),
    },
  };
}

export function createBoxProjectFile(project: BoxProject) {
  const normalized = normalizeBoxProject(project);
  return JSON.stringify({ ...normalized, exportedAt: new Date().toISOString() }, null, 2);
}

export function boxProjectFilename(project: BoxProject, extension: 'svg' | 'dxf' | 'vcbox.json') {
  const dimensions = resolveBoxDimensions(project).outside;
  const title = project.title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'caja';
  const mixedThickness = new Set(buildBoxPanels(project).map((panel) => panel.thicknessMm)).size > 1 ? '-mixto' : '';
  return `${title}-${Math.round(dimensions.width)}x${Math.round(dimensions.height)}x${Math.round(dimensions.depth)}-${project.thicknessMm.toFixed(1).replace('.', 'p')}mm${mixedThickness}.${extension}`;
}

export function downloadBoxFile(filename: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
