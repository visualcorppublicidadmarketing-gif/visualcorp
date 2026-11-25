import { strToU8, zipSync } from 'fflate';
import { planBoxSheets, type BoxSheetPlan } from './boxFabrication';
import { estimateBoxProduction } from './boxCam';
import { offsetBoxContour } from './boxKerf';
import {
  boxProjectFilename,
  createBoxDxf,
  createBoxSvg,
  resolveBoxDimensions,
  type BoxPanel,
  type BoxPanelPlacement,
  type BoxProject,
} from './boxModel';
import { offsetBoxLayout } from './boxKerf';

export interface BoxSheetArchiveManifest {
  formatVersion: 1;
  generatedAt: string;
  title: string;
  units: 'mm';
  box: {
    outsideMm: { width: number; height: number; depth: number };
    insideMm: { width: number; height: number; depth: number };
    thicknessMm: number;
    panelThicknessMm: Partial<Record<BoxPanel['id'], number>>;
    frontDropMm: number;
    jointStyle: BoxProject['jointStyle'];
    closure: BoxProject['closure'];
  };
  placement: {
    method: 'polygon-contact-heuristic';
    rotationAllowed: boolean;
    sheetGrainDirection: 'x' | 'y' | 'none';
    kerfMm: number | null;
    widthMm: number;
    heightMm: number;
    marginMm: number;
    gapMm: number;
  };
  totals: {
    sheets: number;
    panels: number;
    panelAreaMm2: number;
    nominalPerimeterMm: number;
    cutLengthMm: number;
  };
  estimate: {
    cutMinutes: number | null;
    materialCost: number | null;
    machineCost: number | null;
    totalCost: number | null;
    materialName: string;
    inputs: {
      kerfMm: number | null;
      cutSpeedMmPerMin: number | null;
      machineRatePerHour: number | null;
      sheetPrice: number | null;
    };
    costUnit: 'u.m. ingresada por el operador';
  };
  sheets: Array<{
    index: number;
    svg: string;
    dxf: string;
    panelAreaMm2: number;
    cutLengthMm: number;
    /** Net panel area / full sheet area, not a purchased-material yield. */
    efficiency: number;
    panels: Array<{
      id: BoxPanel['id'];
      label: string;
      contourLengthMm: number;
      cutLengthMm: number;
      areaMm2: number;
      thicknessMm: number;
      rotationDeg: 0 | 90;
      nominalBoundsMm: { x: number; y: number; width: number; height: number };
      cutBoundsMm: { x: number; y: number; width: number; height: number };
    }>;
  }>;
  notes: string[];
}

export interface BoxSheetArchive {
  filename: string;
  blob: Blob;
  manifest: BoxSheetArchiveManifest;
}

function panelBounds({ points, x, y }: BoxPanelPlacement, kerfMm = 0) {
  const boundsPoints = kerfMm > 0 ? offsetBoxContour(points, kerfMm / 2) : points;
  const xs = boundsPoints.map((point) => point.x + x);
  const ys = boundsPoints.map((point) => point.y + y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

/**
 * Build one ZIP containing every planned sheet in both vector formats and a
 * descriptive manifest. Replans from the project and the supplied sheet spec
 * so a stale plan cannot mix old placements with new project dimensions.
 */
export function createBoxSheetArchive(project: BoxProject, plan: BoxSheetPlan): BoxSheetArchive {
  const kerfMm = project.camProfile.kerfMm ?? 0;
  const current = planBoxSheets(project, plan.spec, kerfMm);
  const dimensions = resolveBoxDimensions(project);
  const estimate = estimateBoxProduction(project, project.camProfile, current);
  const metrics = new Map(current.panelMetrics.map((item) => [item.panelId, item]));
  const files: Record<string, Uint8Array> = {};
  const manifest: BoxSheetArchiveManifest = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    title: project.title,
    units: 'mm',
    box: {
      outsideMm: dimensions.outside,
      insideMm: dimensions.inside,
      thicknessMm: project.thicknessMm,
      panelThicknessMm: Object.fromEntries(current.sheets.flatMap((sheet) => sheet.layout.panels.map(({ panel }) => [panel.id, panel.thicknessMm]))),
      frontDropMm: project.frontDropMm,
      jointStyle: project.jointStyle,
      closure: project.closure,
    },
    placement: {
      method: 'polygon-contact-heuristic',
      rotationAllowed: current.spec.rotationAllowed,
      sheetGrainDirection: current.spec.sheetGrainDirection ?? 'none',
      kerfMm: project.camProfile.kerfMm,
      widthMm: current.spec.widthMm,
      heightMm: current.spec.heightMm,
      marginMm: current.spec.marginMm,
      gapMm: current.spec.gapMm,
    },
    totals: {
      sheets: current.totalSheets,
      panels: current.panelMetrics.length,
      panelAreaMm2: current.totalAreaMm2,
      nominalPerimeterMm: current.panelMetrics.reduce((sum, item) => sum + item.perimeterMm, 0),
      cutLengthMm: current.totalCutLengthMm,
    },
    estimate: {
      cutMinutes: estimate.cutMinutes,
      materialCost: estimate.materialCost,
      machineCost: estimate.machineCost,
      totalCost: estimate.totalCost,
      materialName: project.camProfile.materialName,
      inputs: {
        kerfMm: project.camProfile.kerfMm,
        cutSpeedMmPerMin: project.camProfile.cutSpeedMmPerMin,
        machineRatePerHour: project.camProfile.machineRatePerHour,
        sheetPrice: project.camProfile.sheetPrice,
      },
      costUnit: 'u.m. ingresada por el operador',
    },
    sheets: [],
    notes: [
      `Nesting poligonal heurístico${current.spec.rotationAllowed ? ', con rotación de 90° permitida' : ', sin rotación'}; no es una optimización global. Se validan contornos cóncavos, sin agujeros; veta de plancha: ${current.spec.sheetGrainDirection ?? 'none'}.`,
      kerfMm > 0 ? `La ruta SVG/DXF se desplazó ${kerfMm.toFixed(3)} mm en total, equivalente a la mitad hacia afuera desde cada lado. Valida este valor con un cupón de prueba.` : 'Kerf no configurado: se exportaron contornos nominales, sin compensación.',
      'El tiempo y coste solo se estiman cuando se ingresan valores del operador; no incluyen desplazamientos, aceleraciones, perforaciones, pasadas, preparación, impuestos o desperdicio.',
      'Verificar escala, capas, colores y ajuste físico en el software y material de destino.',
    ],
  };

  for (const sheet of current.sheets) {
    const prefix = `hojas/hoja-${String(sheet.index).padStart(3, '0')}`;
    const svg = `${prefix}.svg`;
    const dxf = `${prefix}.dxf`;
    const compensatedLayout = offsetBoxLayout(sheet.layout, kerfMm, false);
    files[svg] = strToU8(createBoxSvg(project, compensatedLayout));
    files[dxf] = strToU8(createBoxDxf(project, compensatedLayout));
    manifest.sheets.push({
      index: sheet.index,
      svg,
      dxf,
      panelAreaMm2: sheet.usedAreaMm2,
      cutLengthMm: sheet.layout.panels.reduce((sum, placement) => sum + (metrics.get(placement.panel.id)?.cutLengthMm ?? 0), 0),
      efficiency: sheet.efficiency,
      panels: sheet.layout.panels.map((placement) => {
        const measured = metrics.get(placement.panel.id);
        if (!measured) throw new Error(`Faltan métricas para ${placement.panel.label}.`);
        return {
          id: placement.panel.id,
          label: placement.panel.label,
          contourLengthMm: measured.perimeterMm,
          cutLengthMm: measured.cutLengthMm,
          areaMm2: measured.areaMm2,
          thicknessMm: placement.panel.thicknessMm,
          rotationDeg: placement.rotationDeg ?? 0,
          nominalBoundsMm: panelBounds(placement),
          cutBoundsMm: panelBounds(placement, kerfMm),
        };
      }),
    });
  }

  files['manifiesto.json'] = strToU8(JSON.stringify(manifest, null, 2));
  const zipped = zipSync(files, { level: 6 });
  const buffer = new ArrayBuffer(zipped.byteLength);
  new Uint8Array(buffer).set(zipped);
  const filename = boxProjectFilename(project, 'svg').replace(/\.svg$/, '-planos.zip');
  return {
    filename,
    blob: new Blob([buffer], { type: 'application/zip' }),
    manifest,
  };
}

export function downloadBoxSheetArchive(archive: BoxSheetArchive) {
  const url = URL.createObjectURL(archive.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = archive.filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
