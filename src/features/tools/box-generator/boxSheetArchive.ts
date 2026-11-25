import { strToU8, zipSync } from 'fflate';
import { planBoxSheets, type BoxSheetPlan } from './boxFabrication';
import {
  boxProjectFilename,
  createBoxDxf,
  createBoxSvg,
  resolveBoxDimensions,
  type BoxPanel,
  type BoxPanelPlacement,
  type BoxProject,
} from './boxModel';

export interface BoxSheetArchiveManifest {
  formatVersion: 1;
  generatedAt: string;
  title: string;
  units: 'mm';
  box: {
    outsideMm: { width: number; height: number; depth: number };
    insideMm: { width: number; height: number; depth: number };
    thicknessMm: number;
    jointStyle: BoxProject['jointStyle'];
    closure: BoxProject['closure'];
  };
  placement: {
    method: 'shelf-bounding-boxes';
    rotationAllowed: false;
    widthMm: number;
    heightMm: number;
    marginMm: number;
    gapMm: number;
  };
  totals: {
    sheets: number;
    panels: number;
    panelAreaMm2: number;
    contourLengthMm: number;
  };
  sheets: Array<{
    index: number;
    svg: string;
    dxf: string;
    panelAreaMm2: number;
    /** Net panel area / full sheet area, not a purchased-material yield. */
    efficiency: number;
    panels: Array<{
      id: BoxPanel['id'];
      label: string;
      contourLengthMm: number;
      areaMm2: number;
      boundsMm: { x: number; y: number; width: number; height: number };
    }>;
  }>;
  notes: string[];
}

export interface BoxSheetArchive {
  filename: string;
  blob: Blob;
  manifest: BoxSheetArchiveManifest;
}

function panelBounds({ points, x, y }: BoxPanelPlacement) {
  const xs = points.map((point) => point.x + x);
  const ys = points.map((point) => point.y + y);
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
  const current = planBoxSheets(project, plan.spec);
  const dimensions = resolveBoxDimensions(project);
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
      jointStyle: project.jointStyle,
      closure: project.closure,
    },
    placement: {
      method: 'shelf-bounding-boxes',
      rotationAllowed: false,
      widthMm: current.spec.widthMm,
      heightMm: current.spec.heightMm,
      marginMm: current.spec.marginMm,
      gapMm: current.spec.gapMm,
    },
    totals: {
      sheets: current.totalSheets,
      panels: current.panelMetrics.length,
      panelAreaMm2: current.totalAreaMm2,
      contourLengthMm: current.totalCutLengthMm,
    },
    sheets: [],
    notes: [
      'Distribución por filas de rectángulos envolventes, sin rotación ni nesting poligonal óptimo.',
      'Archivos preliminares: sin compensación de kerf, holgura ni perfil de máquina.',
      'Las longitudes son perímetros geométricos; no estiman duración de corte ni precio.',
      'Verificar escala, capas, colores y ajuste físico en el software y material de destino.',
    ],
  };

  for (const sheet of current.sheets) {
    const prefix = `hojas/hoja-${String(sheet.index).padStart(3, '0')}`;
    const svg = `${prefix}.svg`;
    const dxf = `${prefix}.dxf`;
    files[svg] = strToU8(createBoxSvg(project, sheet.layout));
    files[dxf] = strToU8(createBoxDxf(project, sheet.layout));
    manifest.sheets.push({
      index: sheet.index,
      svg,
      dxf,
      panelAreaMm2: sheet.usedAreaMm2,
      efficiency: sheet.efficiency,
      panels: sheet.layout.panels.map((placement) => {
        const measured = metrics.get(placement.panel.id);
        if (!measured) throw new Error(`Faltan métricas para ${placement.panel.label}.`);
        return {
          id: placement.panel.id,
          label: placement.panel.label,
          contourLengthMm: measured.perimeterMm,
          areaMm2: measured.areaMm2,
          boundsMm: panelBounds(placement),
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
