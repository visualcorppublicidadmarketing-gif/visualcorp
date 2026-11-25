import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { Box, Download, FileDown, FolderOpen, ImagePlus, Info, Pause, Play, RotateCcw, Save, Trash2 } from 'lucide-react';
import { BoxCutPreview } from './BoxCutPreview';
import { BoxDesignLibrary } from './BoxDesignLibrary';
const BoxGenerator3D = lazy(() => import('./BoxGenerator3D').then((module) => ({ default: module.BoxGenerator3D })));
import { estimateBoxProduction } from './boxCam';
import { createBoxSheetArchive, downloadBoxSheetArchive } from './boxSheetArchive';
import { planBoxSheets, type BoxSheetPlan, type BoxSheetSpec } from './boxFabrication';
import { offsetBoxLayout } from './boxKerf';
import {
  boxProjectFilename,
  boxModelLabels,
  formatBoxArea,
  boxUnitToMm,
  buildBoxPanels,
  buildBoxCutLayout,
  createBoxDxf,
  createBoxProjectFile,
  createBoxSvg,
  defaultBoxProject,
  downloadBoxFile,
  formatBoxLength,
  buildBoxJointPairs,
  getBoxPanelThicknessMm,
  mmToBoxUnit,
  maxBoxThicknessMm,
  normalizeBoxProject,
  resolveBoxDimensions,
  type BoxPanel,
  type BoxModelType,
  type BoxProject,
  type BoxUnit,
} from './boxModel';
import './box-generator.css';

type DimensionKey = 'width' | 'height' | 'depth';
type NumericField = DimensionKey | 'thickness' | 'fingerWidth' | 'panelGap' | 'frontDrop' | 'slidingClearance';
type DraftValues = Record<NumericField, string>;
type MixedDraftValues = Record<BoxPanel['id'], string> & { clearance: string };

interface SavedBoxDesign {
  id: string;
  title: string;
  savedAt: string;
  project: BoxProject;
}

const savedDesignsStorageKey = 'visualcorp.box-generator.saved-designs.v1';

function readSavedDesigns(): SavedBoxDesign[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(savedDesignsStorageKey);
    const records: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(records)) return [];
    return records.flatMap((record): SavedBoxDesign[] => {
      if (!record || typeof record !== 'object') return [];
      const candidate = record as Partial<SavedBoxDesign>;
      if (typeof candidate.id !== 'string' || typeof candidate.title !== 'string' || typeof candidate.savedAt !== 'string' || !Number.isFinite(Date.parse(candidate.savedAt))) return [];
      try {
        return [{ id: candidate.id, title: candidate.title.slice(0, 100), savedAt: candidate.savedAt, project: normalizeBoxProject(candidate.project) }];
      } catch {
        return [];
      }
    }).sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt));
  } catch {
    return [];
  }
}

function writeSavedDesigns(designs: SavedBoxDesign[]) {
  try {
    if (typeof window === 'undefined') return false;
    window.localStorage.setItem(savedDesignsStorageKey, JSON.stringify(designs));
    return true;
  } catch {
    return false;
  }
}

const fieldLabels: Record<NumericField, string> = {
  width: 'Ancho',
  height: 'Alto',
  depth: 'Fondo',
  thickness: 'Grosor del material',
  fingerWidth: 'Ancho del dedo',
  panelGap: 'Separación entre piezas',
  frontDrop: 'Descenso del frente',
  slidingClearance: 'Holgura de la tapa',
};

function displayPrecision(unit: BoxUnit) {
  return unit === 'mm' ? 2 : unit === 'cm' ? 3 : 5;
}

function displayLength(valueMm: number, unit: BoxUnit) {
  return String(Number(mmToBoxUnit(valueMm, unit).toFixed(displayPrecision(unit))));
}

function convertDraftValue(value: string, fromUnit: BoxUnit, toUnit: BoxUnit) {
  if (value.trim() === '') return '';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return displayLength(boxUnitToMm(numeric, fromUnit), toUnit);
}

function inputStep(unit: BoxUnit, millimeterStep = 0.1) {
  if (unit === 'in') return '0.01';
  return String(unit === 'cm' ? millimeterStep / 10 : millimeterStep);
}

const modelDescriptions: Record<BoxModelType, string> = {
  basic: 'Caja de paneles con unión plana o dedos y tapa separada opcional.',
  flexible: 'Caja con tapa articulada en la vista 3D; para fabricarla se requiere una bisagra flexible, cinta o herraje aparte.',
  sliding: 'Bandeja con tapa guiada por dos piezas laterales. La guía se muestra como panel; revisar el ajuste antes de cortar.',
  bottle: 'Caja con separadores verticales editables para distribuir botellas; los cruces de panel no llevan ranuras automáticas.',
  jewelry: 'Bandeja para joyas con tapa suelta y separadores interiores configurables.',
};

const externalBoxResources = [
  { name: 'MIDILLI Visual Box Designer · JSON', href: 'https://midilli.tech/visual-box-designer', note: 'Diseñador gratuito y abierto; exporta JSON para herramientas MIDILLI.' },
  { name: 'Formato JSON de MIDILLI', href: 'https://docs.midilli.tech/books/reference-documents/page/json-file-definition', note: 'Referencia y ejemplo del esquema MIDILLI; no es compatible con .vcbox.json.' },
  { name: 'Buddy Packaging', href: 'https://buddypackaging.co.uk/3d-design-studio/', note: '40 estructuras personalizables; gratuito, mm/cm/pulgadas; PDF, SVG, DXF, AI y GLB.' },
  { name: 'BoxDiegen', href: 'https://www.boxdiegen.com/', note: '23 tipos editables; gratuito sin registro; SVG y PDF.' },
  { name: 'Packaging Dieline', href: 'https://packagingdieline.com/', note: '66 estructuras configurables; gratuito, mm/cm/pulgadas; PDF, SVG y AI.' },
  { name: 'Packfino', href: 'https://packfino.com/dielines/', note: '308 estructuras personalizables para cajas, botellas, bolsas y más; PDF, SVG y DXF.' },
  { name: 'Packaging Dock', href: 'https://packagingdock.com/dielines/', note: '35 estructuras configurables; descarga PDF, SVG, DXF y PNG gratis.' },
  { name: 'Boxes.py', href: 'https://florianfesti.github.io/boxes/', note: 'Diseños paramétricos de código abierto GPLv3 para corte; exporta vectores.' },
  { name: 'MakerCase', href: 'https://www.makercase.com/', note: 'Cajas, tapas, divisores y variantes para corte láser/CNC; SVG y DXF.' },
];

function defaultSheetDraft(unit: BoxUnit) {
  return { widthMm: '', heightMm: '', marginMm: displayLength(10, unit), gapMm: displayLength(5, unit) };
}

function draftValues(project: BoxProject): DraftValues {
  return {
    width: displayLength(project.dimensionsMm.width, project.unit),
    height: displayLength(project.dimensionsMm.height, project.unit),
    depth: displayLength(project.dimensionsMm.depth, project.unit),
    thickness: displayLength(project.thicknessMm, project.unit),
    fingerWidth: displayLength(project.fingerWidthMm, project.unit),
    panelGap: displayLength(project.panelGapMm, project.unit),
    frontDrop: displayLength(project.frontDropMm, project.unit),
    slidingClearance: displayLength(project.slidingClearanceMm, project.unit),
  };
}

function mixedDraftValues(project: BoxProject): MixedDraftValues {
  const panelIds: BoxPanel['id'][] = ['base', 'front', 'back', 'left', 'right', 'lid'];
  return {
    ...Object.fromEntries(panelIds.map((panelId) => [
      panelId,
      displayLength(getBoxPanelThicknessMm(project, panelId), project.unit),
    ])) as Record<BoxPanel['id'], string>,
    clearance: displayLength(project.jointClearanceMm, project.unit),
  };
}

function lengthForField(project: BoxProject, field: NumericField) {
  if (field === 'thickness') return project.thicknessMm;
  if (field === 'fingerWidth') return project.fingerWidthMm;
  if (field === 'panelGap') return project.panelGapMm;
  if (field === 'frontDrop') return project.frontDropMm;
  if (field === 'slidingClearance') return project.slidingClearanceMm;
  return project.dimensionsMm[field];
}

function fieldRange(field: NumericField) {
  if (field === 'thickness') return { min: 0.5, max: 30 };
  if (field === 'fingerWidth') return { min: 3, max: 120 };
  if (field === 'panelGap') return { min: 0, max: 100 };
  if (field === 'frontDrop') return { min: 0, max: 2000 };
  if (field === 'slidingClearance') return { min: 0, max: 5 };
  return { min: 10, max: 2000 };
}

export function BoxGenerator() {
  const id = useId().replaceAll(':', '');
  const importRef = useRef<HTMLInputElement>(null);
  const assemblyProgressRef = useRef<number | null>(null);
  const [project, setProject] = useState<BoxProject>(() => ({ ...defaultBoxProject, dimensionsMm: { ...defaultBoxProject.dimensionsMm } }));
  const [savedDesigns, setSavedDesigns] = useState<SavedBoxDesign[]>(readSavedDesigns);
  const [drafts, setDrafts] = useState<DraftValues>(() => draftValues(defaultBoxProject));
  const [mixedDrafts, setMixedDrafts] = useState<MixedDraftValues>(() => mixedDraftValues(defaultBoxProject));
  const [view, setView] = useState<'3d' | '2d' | 'sheet'>('3d');
  const [sheetDraft, setSheetDraft] = useState(() => defaultSheetDraft(defaultBoxProject.unit));
  const [rotationAllowed, setRotationAllowed] = useState(false);
  const [sheetGrainDirection, setSheetGrainDirection] = useState<NonNullable<BoxSheetSpec['sheetGrainDirection']>>('none');
  const [sheetIndex, setSheetIndex] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  const [explosion, setExplosion] = useState(0);
  const [assemblyProgress, setAssemblyProgress] = useState<number | null>(null);
  const [assemblyPlaying, setAssemblyPlaying] = useState(false);
  const [camDrafts, setCamDrafts] = useState({ kerfMm: '', cutSpeedMmPerMin: '', machineRatePerHour: '', sheetPrice: '' });
  const [artworkPanel, setArtworkPanel] = useState<BoxPanel['id']>('front');
  const [notice, setNotice] = useState('');
  const resolved = resolveBoxDimensions(project);
  const layout = buildBoxCutLayout(project);
  const maxFrontDropMm = Math.max(0, resolved.wallHeight - Math.max(
    getBoxPanelThicknessMm(project, 'base'),
    getBoxPanelThicknessMm(project, 'front'),
  ));
  const maxJointClearanceMm = project.jointStyle === 'finger'
    ? Math.max(0, Math.min(...buildBoxJointPairs(project).map((pair) => {
        let segmentCount = Math.max(2, Math.round(pair.activeLengthMm / Math.max(3, project.fingerWidthMm)));
        if (segmentCount % 2 !== 0) segmentCount += 1;
        return pair.activeLengthMm / segmentCount - 0.01;
      })))
    : 0;
  let sheetPlan: BoxSheetPlan | null = null;
  let sheetError = '';
  if (project.sheetSpec) {
    try { sheetPlan = planBoxSheets(project, project.sheetSpec, project.camProfile.kerfMm ?? 0); }
    catch (error) { sheetError = error instanceof Error ? error.message : 'No se pudo distribuir el diseño en la plancha.'; }
  }
  let camEstimate: ReturnType<typeof estimateBoxProduction> | null = null;
  let camEstimateError = '';
  try { camEstimate = estimateBoxProduction(project, project.camProfile, sheetPlan); }
  catch (error) { camEstimateError = error instanceof Error ? error.message : 'No se pudo estimar la ruta de corte.'; }
  const activeSheetIndex = sheetPlan ? Math.min(sheetIndex, sheetPlan.sheets.length - 1) : 0;
  const selectedSheet = sheetPlan?.sheets[activeSheetIndex];

  useEffect(() => {
    setDrafts(draftValues(project));
  }, [project.unit, project.dimensionsMm.width, project.dimensionsMm.height, project.dimensionsMm.depth, project.thicknessMm, project.fingerWidthMm, project.panelGapMm, project.frontDropMm, project.slidingClearanceMm]);

  useEffect(() => {
    setMixedDrafts(mixedDraftValues(project));
  }, [project.unit, project.dimensionsMm.width, project.dimensionsMm.height, project.dimensionsMm.depth, project.thicknessMm, project.panelThicknessMm, project.jointClearanceMm]);

  useEffect(() => {
    setRotationAllowed(project.sheetSpec?.rotationAllowed ?? false);
    setSheetGrainDirection(project.sheetSpec?.sheetGrainDirection ?? 'none');
  }, [project.sheetSpec]);

  useEffect(() => {
    setCamDrafts({
      kerfMm: project.camProfile.kerfMm === null ? '' : String(project.camProfile.kerfMm),
      cutSpeedMmPerMin: project.camProfile.cutSpeedMmPerMin === null ? '' : String(project.camProfile.cutSpeedMmPerMin),
      machineRatePerHour: project.camProfile.machineRatePerHour === null ? '' : String(project.camProfile.machineRatePerHour),
      sheetPrice: project.camProfile.sheetPrice === null ? '' : String(project.camProfile.sheetPrice),
    });
  }, [project.camProfile.kerfMm, project.camProfile.cutSpeedMmPerMin, project.camProfile.machineRatePerHour, project.camProfile.sheetPrice]);

  useEffect(() => {
    if (assemblyProgressRef.current !== null) {
      setAssemblyPlaying(false);
      assemblyProgressRef.current = null;
      setAssemblyProgress(null);
    }
  }, [project]);

  useEffect(() => {
    if (!assemblyPlaying) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      assemblyProgressRef.current = 1;
      setAssemblyProgress(1);
      setAssemblyPlaying(false);
      return undefined;
    }
    const from = assemblyProgressRef.current ?? 0;
    const start = performance.now();
    const duration = Math.max(1, (1 - from) * 2800);
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, from + ((now - start) / duration) * (1 - from));
      assemblyProgressRef.current = progress;
      setAssemblyProgress(progress);
      if (progress < 1) frame = window.requestAnimationFrame(tick);
      else setAssemblyPlaying(false);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [assemblyPlaying]);

  const updateProject = (change: Partial<BoxProject>) => {
    const nextUnit = change.unit;
    if (nextUnit && nextUnit !== project.unit) {
      setDrafts((current) => Object.fromEntries(Object.entries(current).map(([field, value]) => [field, convertDraftValue(value, project.unit, nextUnit)])) as DraftValues);
      setMixedDrafts((current) => Object.fromEntries(Object.entries(current).map(([field, value]) => [field, convertDraftValue(value, project.unit, nextUnit)])) as MixedDraftValues);
      setSheetDraft((current) => Object.fromEntries(Object.entries(current).map(([field, value]) => [field, convertDraftValue(value, project.unit, nextUnit)])) as typeof sheetDraft);
    }
    setProject((current) => normalizeBoxProject({ ...current, ...change }));
  };

  const selectModel = (modelType: BoxModelType) => {
    setProject((current) => normalizeBoxProject({
      ...current,
      modelType,
      title: current.title === boxModelLabels[current.modelType] ? boxModelLabels[modelType] : current.title,
      closure: modelType === 'sliding' ? 'closed' : 'open',
      dividerCount: modelType === 'bottle' ? 1 : modelType === 'jewelry' ? 3 : 0,
    }));
    setNotice(`Modelo «${boxModelLabels[modelType]}» seleccionado.`);
  };

  const commitPanelThickness = (panelId: BoxPanel['id']) => {
    const rawValue = mixedDrafts[panelId];
    const valueMm = boxUnitToMm(Number(rawValue), project.unit);
    if (rawValue.trim() === '' || !Number.isFinite(valueMm) || valueMm < 0.5 || valueMm > maxBoxThicknessMm(project)) {
      setMixedDrafts((current) => ({ ...current, [panelId]: mixedDraftValues(project)[panelId] }));
      return;
    }
    const next = normalizeBoxProject({ ...project, panelThicknessMm: { ...project.panelThicknessMm, [panelId]: valueMm } });
    setProject(next);
    setMixedDrafts((current) => ({ ...current, [panelId]: mixedDraftValues(next)[panelId] }));
  };

  const commitJointClearance = () => {
    const rawValue = mixedDrafts.clearance;
    const valueMm = boxUnitToMm(Number(rawValue), project.unit);
    if (rawValue.trim() === '' || !Number.isFinite(valueMm) || valueMm < 0 || valueMm > maxJointClearanceMm) {
      setMixedDrafts((current) => ({ ...current, clearance: mixedDraftValues(project).clearance }));
      return;
    }
    const next = normalizeBoxProject({ ...project, jointClearanceMm: valueMm });
    setProject(next);
    setMixedDrafts((current) => ({ ...current, clearance: mixedDraftValues(next).clearance }));
  };

  const setAssemblyPosition = (progress: number | null) => {
    assemblyProgressRef.current = progress;
    setAssemblyProgress(progress);
  };

  const setNumericField = (field: NumericField, rawValue: string) => {
    setDrafts((current) => ({ ...current, [field]: rawValue }));
    if (rawValue.trim() === '') return;
    const displayed = Number(rawValue);
    if (!Number.isFinite(displayed)) return;
    const millimeters = boxUnitToMm(displayed, project.unit);
    const range = field === 'thickness'
      ? { min: 0.5, max: maxBoxThicknessMm(project) }
      : field === 'frontDrop'
        ? { min: 0, max: maxFrontDropMm }
      : fieldRange(field);
    if (millimeters < range.min || millimeters > range.max) return;

    setProject((current) => {
      if (field === 'thickness') return normalizeBoxProject({ ...current, thicknessMm: millimeters });
      if (field === 'fingerWidth') return normalizeBoxProject({ ...current, fingerWidthMm: millimeters });
      if (field === 'panelGap') return normalizeBoxProject({ ...current, panelGapMm: millimeters });
      if (field === 'frontDrop') return normalizeBoxProject({ ...current, frontDropMm: millimeters });
      if (field === 'slidingClearance') return normalizeBoxProject({ ...current, slidingClearanceMm: millimeters });
      return normalizeBoxProject({ ...current, dimensionsMm: { ...current.dimensionsMm, [field]: millimeters } });
    });
  };

  const resetNumericDraft = (field: NumericField) => {
    setDrafts((current) => ({ ...current, [field]: displayLength(lengthForField(project, field), project.unit) }));
  };

  const applyProject = (next: BoxProject, message: string) => {
    setProject(next);
    setDrafts(draftValues(next));
    setMixedDrafts(mixedDraftValues(next));
    setSheetDraft(next.sheetSpec
      ? {
          widthMm: displayLength(next.sheetSpec.widthMm, next.unit),
          heightMm: displayLength(next.sheetSpec.heightMm, next.unit),
          marginMm: displayLength(next.sheetSpec.marginMm, next.unit),
          gapMm: displayLength(next.sheetSpec.gapMm, next.unit),
        }
      : defaultSheetDraft(next.unit));
    setNotice(message);
  };

  const saveProject = () => {
    downloadBoxFile(boxProjectFilename(project, 'vcbox.json'), createBoxProjectFile(project), 'application/json;charset=utf-8');
    setNotice('Diseño guardado en un archivo .vcbox.json.');
  };

  const saveDesignToLibrary = () => {
    const savedAt = new Date().toISOString();
    const title = project.title.trim().slice(0, 100) || boxModelLabels[project.modelType];
    const id = typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function' ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const next = [{ id, title, savedAt, project: normalizeBoxProject({ ...project, title }) }, ...savedDesigns]
      .sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt));
    if (!writeSavedDesigns(next)) {
      setNotice('No se pudo guardar en este navegador. Descarga el archivo .vcbox.json como respaldo.');
      return;
    }
    setSavedDesigns(next);
    setNotice(`«${title}» guardado en Mis diseños de este navegador.`);
  };

  const openSavedDesign = (design: SavedBoxDesign) => {
    applyProject(normalizeBoxProject(design.project), `Diseño «${design.title}» cargado desde Mis diseños.`);
    setView('3d');
    setExplosion(0);
    setResetToken((current) => current + 1);
  };

  const deleteSavedDesign = (design: SavedBoxDesign) => {
    if (!window.confirm(`¿Eliminar «${design.title}» de Mis diseños guardados en este navegador?`)) return;
    const next = savedDesigns.filter((item) => item.id !== design.id);
    if (!writeSavedDesigns(next)) {
      setNotice('No se pudo actualizar la biblioteca de este navegador.');
      return;
    }
    setSavedDesigns(next);
    setNotice(`«${design.title}» eliminado de Mis diseños.`);
  };

  const importProject = async (file?: File) => {
    if (!file) return;
    try {
      const imported = normalizeBoxProject(JSON.parse(await file.text()));
      applyProject(imported, `Diseño “${imported.title}” abierto.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo abrir ese archivo de diseño.');
    }
    if (importRef.current) importRef.current.value = '';
  };

  const importArtwork = async (file?: File) => {
    if (!file) return;
    try {
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) throw new Error('Elige una imagen SVG, PNG, JPEG o WebP.');
      if (file.size > 20 * 1024 * 1024) throw new Error('La imagen debe pesar menos de 20 MB antes de optimizarse.');
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Este navegador no pudo procesar la imagen.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const dataUrl = canvas.toDataURL('image/webp', 0.88);
      if (dataUrl.length > 8_000_000) throw new Error('La imagen optimizada sigue siendo demasiado grande para guardarla en el diseño.');
      const otherArtworkSize = Object.entries(project.artworkByPanel)
        .filter(([panelId]) => panelId !== artworkPanel)
        .reduce((sum, [, design]) => sum + (design?.dataUrl.length ?? 0), 0);
      if (otherArtworkSize + dataUrl.length > 20_000_000) throw new Error('El conjunto de imágenes del diseño supera el límite local de 20 MB. Quita una imagen o usa archivos más pequeños.');
      const current = project.artworkByPanel[artworkPanel];
      updateProject({ artworkByPanel: {
        ...project.artworkByPanel,
        [artworkPanel]: current
          ? { ...current, dataUrl }
          : { dataUrl, x: 0.15, y: 0.15, width: 0.7, height: 0.7 },
      } });
      setNotice(`Imagen añadida a ${buildBoxPanels(project).find((panel) => panel.id === artworkPanel)?.label ?? 'la pieza'}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo cargar la imagen.');
    }
  };

  const updateSelectedArtwork = (change: Partial<NonNullable<BoxProject['artworkByPanel'][typeof artworkPanel]>>) => {
    const current = project.artworkByPanel[artworkPanel];
    if (!current) return;
    const next = { ...current, ...change };
    next.x = Math.min(1 - next.width, Math.max(0, next.x));
    next.y = Math.min(1 - next.height, Math.max(0, next.y));
    updateProject({ artworkByPanel: { ...project.artworkByPanel, [artworkPanel]: next } });
  };

  const removeSelectedArtwork = () => {
    const next = { ...project.artworkByPanel };
    delete next[artworkPanel];
    updateProject({ artworkByPanel: next });
    setNotice('Se quitó el diseño de esta pieza.');
  };

  const exportSvg = () => {
    if (view === 'sheet' && !selectedSheet) { setNotice(sheetError || 'Configura una plancha válida antes de exportarla.'); return; }
    const currentLayout = view === 'sheet' ? selectedSheet!.layout : buildBoxCutLayout(project);
    let exportLayout;
    try { exportLayout = offsetBoxLayout(currentLayout, project.camProfile.kerfMm ?? 0, view !== 'sheet'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo compensar el contorno.'); return; }
    const filename = boxProjectFilename(project, 'svg');
    downloadBoxFile(view === 'sheet' ? filename.replace(/\.svg$/, `-hoja-${selectedSheet!.index}.svg`) : filename, createBoxSvg(project, exportLayout), 'image/svg+xml;charset=utf-8');
    setNotice('Archivo SVG listo. Verifica la escala antes de enviarlo al equipo de corte.');
  };

  const exportDxf = () => {
    if (view === 'sheet' && !selectedSheet) { setNotice(sheetError || 'Configura una plancha válida antes de exportarla.'); return; }
    const currentLayout = view === 'sheet' ? selectedSheet!.layout : buildBoxCutLayout(project);
    let exportLayout;
    try { exportLayout = offsetBoxLayout(currentLayout, project.camProfile.kerfMm ?? 0, view !== 'sheet'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo compensar el contorno.'); return; }
    const filename = boxProjectFilename(project, 'dxf');
    downloadBoxFile(view === 'sheet' ? filename.replace(/\.dxf$/, `-hoja-${selectedSheet!.index}.dxf`) : filename, createBoxDxf(project, exportLayout), 'application/dxf;charset=utf-8');
    setNotice('Archivo DXF listo, con geometría en milímetros.');
  };

  const exportAllSheets = () => {
    if (!sheetPlan) { setNotice(sheetError || 'Configura una plancha válida antes de descargar todas las hojas.'); return; }
    try {
      const archive = createBoxSheetArchive(project, sheetPlan);
      downloadBoxSheetArchive(archive);
      setNotice(`Paquete descargado: ${archive.manifest.totals.sheets} hojas con SVG, DXF y manifiesto.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo preparar el paquete de planchas.'); }
  };

  const setCamField = (field: keyof typeof camDrafts, rawValue: string) => {
    setCamDrafts((current) => ({ ...current, [field]: rawValue }));
    const parsed = rawValue.trim() === '' ? null : Number(rawValue);
    const limits = { kerfMm: 10, cutSpeedMmPerMin: 100000, machineRatePerHour: 100000, sheetPrice: 1000000 };
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > limits[field])) return;
    setProject((current) => normalizeBoxProject({
      ...current,
      camProfile: { ...current.camProfile, [field]: parsed },
    }));
  };

  const restoreDefaults = () => {
    const clean = { ...defaultBoxProject, dimensionsMm: { ...defaultBoxProject.dimensionsMm } };
    applyProject(clean, 'Se restauraron los valores iniciales.');
    setView('3d');
    setExplosion(0);
    setResetToken((current) => current + 1);
  };

  const applySheet = () => {
    const spec: BoxSheetSpec = {
      widthMm: boxUnitToMm(Number(sheetDraft.widthMm), project.unit),
      heightMm: boxUnitToMm(Number(sheetDraft.heightMm), project.unit),
      marginMm: boxUnitToMm(Number(sheetDraft.marginMm), project.unit),
      gapMm: boxUnitToMm(Number(sheetDraft.gapMm), project.unit),
      rotationAllowed,
      sheetGrainDirection,
    };
    if (Object.values(sheetDraft).some((value) => value.trim() === '')) { setNotice('Completa las cuatro medidas de la plancha.'); return; }
    if (spec.widthMm < 50 || spec.widthMm > 4000 || spec.heightMm < 50 || spec.heightMm > 4000 || spec.marginMm < 0 || spec.marginMm > 100 || spec.gapMm < 0 || spec.gapMm > 100) {
      setNotice('La plancha debe medir 50–4000 mm por lado, con margen y separación entre 0 y 100 mm.'); return;
    }
    try {
      const planned = planBoxSheets(project, spec, project.camProfile.kerfMm ?? 0);
      updateProject({ sheetSpec: spec });
      setSheetIndex(0);
      setView('sheet');
      setNotice(`${planned.totalSheets} ${planned.totalSheets === 1 ? 'hoja calculada' : 'hojas calculadas'} sin solapar piezas.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo planificar la plancha.'); }
  };

  const toggleAssemblyPlayback = () => {
    if (assemblyPlaying) { setAssemblyPlaying(false); return; }
    if (assemblyProgress === null || assemblyProgress >= 1) {
      setExplosion(0);
      setAssemblyPosition(0);
    }
    setAssemblyPlaying(true);
  };

  const dimensionField = (field: DimensionKey) => {
    const range = fieldRange(field);
    return (
      <label className="box-generator__dimension-field" key={field}>
        <span>{fieldLabels[field]}</span>
        <span className="box-generator__input-wrap">
          <input
            type="number"
            inputMode="decimal"
            min={mmToBoxUnit(range.min, project.unit)}
            max={mmToBoxUnit(range.max, project.unit)}
            step={inputStep(project.unit)}
            value={drafts[field]}
            onChange={(event) => setNumericField(field, event.currentTarget.value)}
            onBlur={() => resetNumericDraft(field)}
            aria-label={`${fieldLabels[field]} en ${project.unit}`}
          />
          <span>{project.unit}</span>
        </span>
      </label>
    );
  };

  const advancedField = (field: Exclude<NumericField, DimensionKey>) => {
    const range = fieldRange(field);
    const max = field === 'frontDrop' ? maxFrontDropMm : range.max;
    return (
      <label className="box-generator__dimension-field" key={field}>
        <span>{fieldLabels[field]}</span>
        <span className="box-generator__input-wrap">
          <input
            type="number"
            inputMode="decimal"
            min={mmToBoxUnit(range.min, project.unit)}
            max={mmToBoxUnit(max, project.unit)}
            step={inputStep(project.unit)}
            value={drafts[field]}
            onChange={(event) => setNumericField(field, event.currentTarget.value)}
            onBlur={() => resetNumericDraft(field)}
            aria-label={`${fieldLabels[field]} en ${project.unit}`}
          />
          <span>{project.unit}</span>
        </span>
      </label>
    );
  };

  return (
    <div className="box-generator">
      <header className="box-generator__header">
        <div className="box-generator__title-block">
          <span className="box-generator__overline"><Box size={15} aria-hidden="true" /> Estudio de cajas</span>
          <label className="box-generator__title-input">
            <span className="sr-only">Nombre del diseño</span>
            <input maxLength={100} value={project.title} onChange={(event) => updateProject({ title: event.currentTarget.value })} />
          </label>
          <p>Elige una estructura paramétrica, configura sus piezas y prepara archivos de fabricación desde una sola fuente de geometría.</p>
        </div>
        <div className="box-generator__file-actions">
          <input
            ref={importRef}
            className="box-generator__file-input"
            type="file"
            accept=".vcbox.json,application/json"
            onChange={(event) => void importProject(event.currentTarget.files?.[0])}
            aria-label="Abrir un archivo de diseño de caja"
          />
          <button type="button" className="button button-outline" onClick={() => importRef.current?.click()}><FolderOpen size={16} /> Abrir diseño</button>
          <button type="button" className="button button-outline" onClick={saveDesignToLibrary}><Save size={16} /> Guardar diseño</button>
          <button type="button" className="button button-outline" onClick={saveProject}><Download size={16} /> Descargar proyecto</button>
        </div>
      </header>

      <BoxDesignLibrary project={project} onLoad={(next) => applyProject(next, `Diseño «${next.title}» cargado desde la biblioteca de la organización.`)} />

      <div className="box-generator__workspace">
        <aside className="box-generator__controls" aria-label="Configuración de la caja">
          <section className="box-generator__control-section">
            <div className="box-generator__section-heading"><div><span className="box-generator__section-index">01</span><h3>Modelo</h3></div></div>
            <label className="box-generator__choice-field">
              <span>Tipo de caja</span>
              <select className="box-generator__model-select" value={project.modelType} onChange={(event) => selectModel(event.currentTarget.value as BoxModelType)} aria-label="Modelo de caja">
                {(Object.keys(boxModelLabels) as BoxModelType[]).map((modelType) => <option key={modelType} value={modelType}>{boxModelLabels[modelType]}</option>)}
              </select>
            </label>
            <p className="box-generator__field-note">{modelDescriptions[project.modelType]}</p>
            {(project.modelType === 'bottle' || project.modelType === 'jewelry') && (
              <label className="box-generator__dimension-field box-generator__model-number-field">
                <span>{project.modelType === 'bottle' ? 'Separadores de botellas' : 'Separadores para compartimentos'}</span>
                <span className="box-generator__input-wrap">
                  <input type="number" min="0" max="6" step="1" value={project.dividerCount} onChange={(event) => updateProject({ dividerCount: Number(event.currentTarget.value) })} aria-label="Cantidad de separadores" />
                  <span>piezas</span>
                </span>
              </label>
            )}
            {project.modelType === 'flexible' && (
              <label className="box-generator__range-field box-generator__model-range-field">
                <span>Apertura de tapa <b>{project.closure === 'closed' ? '0°' : `${project.lidOpenDegrees}°`}</b></span>
                <input type="range" min="0" max="135" step="5" value={project.lidOpenDegrees} disabled={project.closure === 'closed'} onChange={(event) => updateProject({ lidOpenDegrees: Number(event.currentTarget.value) })} aria-label="Ángulo de apertura de la tapa" />
                <span className="box-generator__range-scale"><small>Cerrada</small><small>Abierta</small></span>
              </label>
            )}
            {project.modelType === 'sliding' && (
              <label className="box-generator__dimension-field box-generator__model-number-field">
                <span>{fieldLabels.slidingClearance}</span>
                <span className="box-generator__input-wrap">
                  <input type="number" inputMode="decimal" min={mmToBoxUnit(0, project.unit)} max={mmToBoxUnit(5, project.unit)} step={inputStep(project.unit, 0.1)} value={drafts.slidingClearance} onChange={(event) => setNumericField('slidingClearance', event.currentTarget.value)} onBlur={() => resetNumericDraft('slidingClearance')} aria-label={`${fieldLabels.slidingClearance} en ${project.unit}`} />
                  <span>{project.unit}</span>
                </span>
              </label>
            )}
            <details className="box-generator__saved-library">
              <summary>Mis diseños guardados ({savedDesigns.length})</summary>
              <p>Cada guardado crea una versión en este navegador. Descarga el proyecto .vcbox.json para trasladarlo o hacer una copia.</p>
              {savedDesigns.length === 0 ? <p className="box-generator__saved-empty">Aún no guardas diseños en esta biblioteca.</p> : (
                <ul>
                  {savedDesigns.map((design) => (
                    <li key={design.id}>
                      <div className="box-generator__saved-info">
                        <strong title={design.title}>{design.title}</strong>
                        <small>{new Date(design.savedAt).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}</small>
                      </div>
                      <div className="box-generator__saved-actions">
                        <button type="button" className="button button-outline" onClick={() => openSavedDesign(design)}>Abrir</button>
                        <button type="button" className="button button-outline" onClick={() => deleteSavedDesign(design)} aria-label={`Eliminar ${design.title}`} title={`Eliminar ${design.title}`}><Trash2 size={14} aria-hidden="true" /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </details>
            <details className="box-generator__model-resources">
              <summary>Fuentes gratuitas: JSON y plantillas</summary>
              <p>MIDILLI exporta JSON para su propio esquema. Los otros generadores ofrecen vectores personalizables. Este estudio importa y guarda archivos Visual Corp <code>.vcbox.json</code>.</p>
              <ul>{externalBoxResources.map((resource) => <li key={resource.name}><a href={resource.href} target="_blank" rel="noopener noreferrer">{resource.name}</a><span>{resource.note}</span></li>)}</ul>
            </details>
          </section>

          <section className="box-generator__control-section">
            <div className="box-generator__section-heading">
              <div><span className="box-generator__section-index">02</span><h3>Medidas</h3></div>
              <div className="box-generator__segmented box-generator__unit-toggle" aria-label="Unidad de medida">
                {(['mm', 'cm', 'in'] as BoxUnit[]).map((unit) => <button key={unit} type="button" aria-pressed={project.unit === unit} onClick={() => updateProject({ unit })}>{unit}</button>)}
              </div>
            </div>
            <div className="box-generator__dimension-grid">
              {dimensionField('width')}
              {dimensionField('height')}
              {dimensionField('depth')}
              <label className="box-generator__dimension-field">
                <span>{fieldLabels.thickness}</span>
                <span className="box-generator__input-wrap">
                  <input type="number" inputMode="decimal" min={mmToBoxUnit(0.5, project.unit)} max={mmToBoxUnit(maxBoxThicknessMm(project), project.unit)} step={inputStep(project.unit, 0.1)} value={drafts.thickness} onChange={(event) => setNumericField('thickness', event.currentTarget.value)} onBlur={() => resetNumericDraft('thickness')} aria-label={`${fieldLabels.thickness} en ${project.unit}`} />
                  <span>{project.unit}</span>
                </span>
                <small>Valor predeterminado para las piezas sin espesor propio.</small>
              </label>
            </div>
            <div className="box-generator__measure-mode">
              <span>Las medidas representan</span>
              <div className="box-generator__segmented" role="group" aria-label="Base de las medidas">
                <button type="button" aria-pressed={project.dimensionMode === 'outside'} onClick={() => updateProject({ dimensionMode: 'outside' })}>Exterior</button>
                <button type="button" aria-pressed={project.dimensionMode === 'inside'} onClick={() => updateProject({ dimensionMode: 'inside' })}>Interior</button>
              </div>
            </div>
            <p className="box-generator__field-note">Los valores se guardan en milímetros y cambian de unidad solo en pantalla.</p>
          </section>

          <section className="box-generator__control-section">
              <div className="box-generator__section-heading"><div><span className="box-generator__section-index">03</span><h3>Ensamble</h3></div></div>
            <div className="box-generator__control-stack">
              <div className="box-generator__choice-field">
                <span>Parte superior</span>
                <div className="box-generator__segmented" role="group" aria-label="Tipo de caja">
                  <button type="button" aria-pressed={project.closure === 'open'} onClick={() => updateProject({ closure: 'open' })}>Abierta</button>
                  <button type="button" aria-pressed={project.closure === 'closed'} onClick={() => updateProject({ closure: 'closed', frontDropMm: 0 })}>Cerrada</button>
                </div>
              </div>
              <div className="box-generator__choice-field">
                <span>Tipo de unión</span>
                <div className="box-generator__segmented" role="group" aria-label="Tipo de unión entre paneles">
                  <button type="button" aria-pressed={project.jointStyle === 'flat'} onClick={() => updateProject({ jointStyle: 'flat' })}>Plana</button>
                  <button type="button" aria-pressed={project.jointStyle === 'finger'} onClick={() => updateProject({ jointStyle: 'finger' })}>Dedos</button>
                </div>
                <small>La unión T-slot queda para una siguiente etapa.</small>
              </div>
              {project.jointStyle === 'finger' && (
                <label className="box-generator__range-field">
                  <span>Ancho del dedo <b>{formatBoxLength(project.fingerWidthMm, project.unit)}</b></span>
                  <input type="range" min={mmToBoxUnit(3, project.unit)} max={mmToBoxUnit(120, project.unit)} step={inputStep(project.unit)} value={mmToBoxUnit(project.fingerWidthMm, project.unit)} onChange={(event) => setNumericField('fingerWidth', event.currentTarget.value)} aria-label="Ancho del dedo de ensamble" />
                  <span className="box-generator__range-scale"><small>Fino</small><small>Ancho</small></span>
                </label>
              )}
            </div>
          </section>

          <details className="box-generator__advanced">
            <summary><span><span className="box-generator__section-index">MIX</span> Espesores y ajuste de encastre</span><span className="box-generator__summary-chevron" aria-hidden="true">⌄</span></summary>
            <div className="box-generator__advanced-content">
              <p className="box-generator__field-note">Cada pieza puede tener su propio espesor. Las aristas emparejadas usan la profundidad de la pieza vecina; los controles de holgura y kerf son independientes.</p>
              <div className="box-generator__panel-thickness-grid">
                {buildBoxPanels(project).map((panel) => (
                  <label className="box-generator__dimension-field" key={panel.id}>
                    <span>{panel.label}</span>
                    <span className="box-generator__input-wrap">
                      <input type="number" inputMode="decimal" min={mmToBoxUnit(0.5, project.unit)} max={mmToBoxUnit(maxBoxThicknessMm(project), project.unit)} step={inputStep(project.unit)} value={mixedDrafts[panel.id]} onChange={(event) => setMixedDrafts((current) => ({ ...current, [panel.id]: event.currentTarget.value }))} onBlur={() => commitPanelThickness(panel.id)} aria-label={`Espesor de ${panel.label} en ${project.unit}`} />
                      <span>{project.unit}</span>
                    </span>
                  </label>
                ))}
              </div>
              {project.jointStyle === 'finger' && (
                <label className="box-generator__dimension-field">
                  <span>Holgura por flanco de encastre</span>
                  <span className="box-generator__input-wrap">
                    <input type="number" inputMode="decimal" min="0" max={mmToBoxUnit(maxJointClearanceMm, project.unit)} step={inputStep(project.unit, 0.05)} value={mixedDrafts.clearance} onChange={(event) => setMixedDrafts((current) => ({ ...current, clearance: event.currentTarget.value }))} onBlur={commitJointClearance} aria-label={`Holgura de encastre en ${project.unit}`} />
                    <span>{project.unit}</span>
                  </span>
                  <small>Máximo seguro para el paso actual: {formatBoxLength(maxJointClearanceMm, project.unit)} por lado. Se aplica a la geometría antes de compensar el kerf del láser.</small>
                </label>
              )}
            </div>
          </details>

          <details className="box-generator__advanced">
            <summary><span><span className="box-generator__section-index">03</span> Presentación y plano</span><span className="box-generator__summary-chevron" aria-hidden="true">⌄</span></summary>
            <div className="box-generator__advanced-content">
              {advancedField('panelGap')}
              {project.closure === 'open' && advancedField('frontDrop')}
              <label className="box-generator__color-field">
                <span>Color de la vista 3D</span>
                <input type="color" value={project.previewColor} onChange={(event) => updateProject({ previewColor: event.currentTarget.value })} aria-label="Color de vista previa de la caja" />
              </label>
              <label className="box-generator__dimension-field">
                <span>Iluminación PBR · ambiente de estudio</span>
                <select className="box-generator__select" value={project.lightingPreset} onChange={(event) => updateProject({ lightingPreset: event.currentTarget.value as BoxProject['lightingPreset'] })} aria-label="Preset de iluminación 3D">
                  <option value="studio">Neutro</option>
                  <option value="warm">Cálido</option>
                  <option value="cool">Frío</option>
                </select>
                <small>Reflejos generados localmente; no carga una foto ni un HDRI externo.</small>
              </label>
              <label className="box-generator__checkbox-field">
                <input type="checkbox" checked={project.includePartLabels} onChange={(event) => updateProject({ includePartLabels: event.currentTarget.checked })} />
                <span>Incluir nombres de piezas en SVG</span>
              </label>
            </div>
          </details>

          <details className="box-generator__advanced">
            <summary><span><span className="box-generator__section-index">04</span> Plancha de corte</span><span className="box-generator__summary-chevron" aria-hidden="true">⌄</span></summary>
            <div className="box-generator__advanced-content">
              <p className="box-generator__field-note">El anidado comprueba los contornos reales de las piezas y evita solapes. Introduce las medidas en {project.unit}; se convierten a milímetros para fabricar. La dirección de veta limita las orientaciones permitidas; activa los giros solo cuando el material lo admita.</p>
              <div className="box-generator__sheet-fields">
                {([['widthMm', 'Ancho de plancha'], ['heightMm', 'Alto de plancha'], ['marginMm', 'Margen'], ['gapMm', 'Separación']] as const).map(([key, label]) => (
                  <label className="box-generator__dimension-field" key={key}>
                    <span>{label}</span>
                    <span className="box-generator__input-wrap">
                      <input type="number" inputMode="decimal" min={mmToBoxUnit(key === 'marginMm' || key === 'gapMm' ? 0 : 50, project.unit)} max={mmToBoxUnit(key === 'marginMm' || key === 'gapMm' ? 100 : 4000, project.unit)} step={inputStep(project.unit)} value={sheetDraft[key]} onChange={(event) => setSheetDraft((current) => ({ ...current, [key]: event.currentTarget.value }))} aria-label={`${label} en ${project.unit}`} />
                      <span>{project.unit}</span>
                    </span>
                  </label>
                ))}
              </div>
              <label className="box-generator__checkbox-field">
                <input type="checkbox" checked={rotationAllowed} onChange={(event) => {
                  const enabled = event.currentTarget.checked;
                  setRotationAllowed(enabled);
                  if (project.sheetSpec) {
                    updateProject({ sheetSpec: { ...project.sheetSpec, rotationAllowed: enabled } });
                    setSheetIndex(0);
                  }
                }} />
                <span>Permitir giros de 90° (la veta puede limitar cada pieza)</span>
              </label>
              <label className="box-generator__dimension-field">
                <span>Dirección de veta de la plancha</span>
                <select className="box-generator__select" value={sheetGrainDirection} onChange={(event) => {
                  const sheetGrainDirection = event.currentTarget.value as NonNullable<BoxSheetSpec['sheetGrainDirection']>;
                  setSheetGrainDirection(sheetGrainDirection);
                  if (project.sheetSpec) updateProject({ sheetSpec: { ...project.sheetSpec, sheetGrainDirection } });
                  setSheetIndex(0);
                }} aria-label="Dirección de veta">
                  <option value="x">Paralela al ancho</option>
                  <option value="y">Paralela al alto</option>
                  <option value="none">Sin restricción de veta</option>
                </select>
              </label>
              <button type="button" className="button button-outline box-generator__sheet-apply" onClick={applySheet}>Distribuir piezas</button>
              {sheetError && <p className="box-generator__sheet-error" role="alert">{sheetError}</p>}
            </div>
          </details>

          <details className="box-generator__advanced">
            <summary><span><span className="box-generator__section-index">05</span> Perfil de fabricación CAM</span><span className="box-generator__summary-chevron" aria-hidden="true">⌄</span></summary>
            <div className="box-generator__advanced-content">
              <p className="box-generator__field-note">Usa datos medidos para tu material y máquina. Los campos vacíos no suponen valores por defecto; la estimación de tiempo solo considera la longitud de corte.</p>
              <label className="box-generator__dimension-field">
                <span>Material o perfil</span>
                <span className="box-generator__input-wrap">
                  <input maxLength={80} value={project.camProfile.materialName} onChange={(event) => updateProject({ camProfile: { ...project.camProfile, materialName: event.currentTarget.value } })} aria-label="Nombre del material o perfil de fabricación" placeholder="Nombre opcional" />
                </span>
              </label>
              <div className="box-generator__cam-fields">
                {([
                  ['kerfMm', 'Kerf medido', 'mm', 10, 'Compensación geométrica; déjalo vacío si no lo mediste.'],
                  ['cutSpeedMmPerMin', 'Velocidad de corte', 'mm/min', 100000, 'Valor real del material y espesor actuales.'],
                  ['machineRatePerHour', 'Tarifa de máquina', 'u.m./h', 100000, 'Unidad monetaria definida por tu taller.'],
                  ['sheetPrice', 'Precio de la plancha', 'u.m.', 1000000, 'Se multiplica por el número de planchas.'],
                ] as const).map(([field, label, unit, max, hint]) => (
                  <label className="box-generator__dimension-field" key={field}>
                    <span>{label}</span>
                    <span className="box-generator__input-wrap">
                      <input type="number" inputMode="decimal" min="0" max={max} step="0.01" value={camDrafts[field]} onChange={(event) => setCamField(field, event.currentTarget.value)} aria-label={`${label} (${unit})`} />
                      <span>{unit}</span>
                    </span>
                    <small>{hint}</small>
                  </label>
                ))}
              </div>
            </div>
          </details>

          <details className="box-generator__advanced">
            <summary><span><span className="box-generator__section-index">06</span> Diseño por pieza</span><span className="box-generator__summary-chevron" aria-hidden="true">⌄</span></summary>
            <div className="box-generator__advanced-content">
              <p className="box-generator__field-note">Doble clic en una pieza 3D o usa el selector accesible. Las imágenes se optimizan en este navegador y se guardan dentro del archivo del proyecto. El SVG incluye la imagen para grabado; el DXF conserva las rutas vectoriales de corte.</p>
              <label className="box-generator__dimension-field">
                <span>Pieza a personalizar</span>
                <select className="box-generator__select" value={artworkPanel} onChange={(event) => setArtworkPanel(event.currentTarget.value as BoxPanel['id'])} aria-label="Seleccionar pieza para personalizar">
                  {buildBoxPanels(project).map((panel) => <option key={panel.id} value={panel.id}>{panel.label}</option>)}
                </select>
              </label>
              <label className="box-generator__artwork-upload">
                <input type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" onChange={(event) => { void importArtwork(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} aria-label="Cargar imagen para esta pieza" />
                <ImagePlus size={16} />
                <span>{project.artworkByPanel[artworkPanel] ? 'Reemplazar imagen' : 'Cargar imagen'}</span>
              </label>
              {project.artworkByPanel[artworkPanel] && (
                <>
                  <label className="box-generator__range-field">
                    <span>Ancho de imagen <b>{Math.round(project.artworkByPanel[artworkPanel]!.width * 100)} %</b></span>
                    <input type="range" min="5" max="95" step="1" value={Math.round(project.artworkByPanel[artworkPanel]!.width * 100)} onChange={(event) => updateSelectedArtwork({ width: Number(event.currentTarget.value) / 100 })} aria-label="Ancho de la imagen sobre la pieza" />
                  </label>
                  <div className="box-generator__artwork-position">
                    <label className="box-generator__range-field">
                      <span>Posición horizontal <b>{Math.round(project.artworkByPanel[artworkPanel]!.x * 100)} %</b></span>
                      <input type="range" min="0" max={Math.round((1 - project.artworkByPanel[artworkPanel]!.width) * 100)} step="1" value={Math.round(project.artworkByPanel[artworkPanel]!.x * 100)} onChange={(event) => updateSelectedArtwork({ x: Number(event.currentTarget.value) / 100 })} aria-label="Posición horizontal de la imagen" />
                    </label>
                    <label className="box-generator__range-field">
                      <span>Posición vertical <b>{Math.round(project.artworkByPanel[artworkPanel]!.y * 100)} %</b></span>
                      <input type="range" min="0" max={Math.round((1 - project.artworkByPanel[artworkPanel]!.height) * 100)} step="1" value={Math.round(project.artworkByPanel[artworkPanel]!.y * 100)} onChange={(event) => updateSelectedArtwork({ y: Number(event.currentTarget.value) / 100 })} aria-label="Posición vertical de la imagen" />
                    </label>
                  </div>
                  <button type="button" className="button button-outline box-generator__artwork-remove" onClick={removeSelectedArtwork}><Trash2 size={15} /> Quitar de esta pieza</button>
                </>
              )}
            </div>
          </details>

          <div className="box-generator__spec-note">
            <Info size={17} aria-hidden="true" />
            <p>La compensación desplaza el centro de la ruta hacia afuera la mitad del kerf que ingreses. El 3D sigue mostrando la pieza nominal; comprueba con un cupón de prueba la holgura y el kerf antes de fabricar.</p>
          </div>
        </aside>

        <main className="box-generator__preview-column">
          <section className="box-generator__preview-card" aria-label="Vista previa del diseño">
            <div className="box-generator__preview-toolbar">
              <div className="box-generator__view-switch" role="group" aria-label="Tipo de vista">
                <button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')}><Box size={15} /> Vista 3D</button>
                <button type="button" aria-pressed={view === '2d'} onClick={() => setView('2d')}><FileDown size={15} /> Plano de corte</button>
                <button type="button" aria-pressed={view === 'sheet'} onClick={() => setView('sheet')}><FileDown size={15} /> Plancha</button>
              </div>
              {view === '3d' && <button type="button" className="box-generator__reset-view" onClick={() => setResetToken((current) => current + 1)}><RotateCcw size={14} /> Restablecer vista</button>}
            </div>
            <div className={`box-generator__stage ${view !== '3d' ? 'is-flat' : ''}`}>
              {view === '3d' ? <Suspense fallback={<div className="box-generator__webgl-loading" role="status">Activando el visor 3D…</div>}><BoxGenerator3D project={project} resetToken={resetToken} explosion={explosion / 100} assemblyProgress={assemblyProgress ?? undefined} onPanelSelect={(panelId) => { setArtworkPanel(panelId); setNotice(`Pieza seleccionada: ${buildBoxPanels(project).find((panel) => panel.id === panelId)?.label ?? panelId}. Abre “Diseño por pieza” para cargar o ajustar una imagen.`); }} /></Suspense> : view === '2d' ? <BoxCutPreview project={project} /> : selectedSheet ? <BoxCutPreview project={project} sheetLayout={selectedSheet.layout} sheetNumber={selectedSheet.index} /> : <div className="box-generator__sheet-empty">{sheetError || 'Indica las medidas de la plancha y pulsa «Distribuir piezas».'}</div>}
              {view === '3d' && <div className="box-generator__orbit-hint"><span aria-hidden="true">⤢</span> Arrastra para girar · pinza o rueda para acercar</div>}
            </div>
            {view === '3d' && (
              <div className="box-generator__assembly-controls">
                <label className="box-generator__explode-control"><span>Armada</span><input type="range" min="0" max="100" step="1" value={explosion} onChange={(event) => { setAssemblyPosition(null); setAssemblyPlaying(false); setExplosion(Number(event.currentTarget.value)); }} aria-label="Separación de las piezas en la vista 3D" aria-valuetext={`${explosion} por ciento de despiece`} /><span>Ver piezas</span></label>
                <div className="box-generator__assembly-row">
                  <button type="button" className="button button-outline" onClick={toggleAssemblyPlayback}>{assemblyPlaying ? <Pause size={15} /> : <Play size={15} />}{assemblyPlaying ? 'Pausar armado' : assemblyProgress !== null && assemblyProgress < 1 ? 'Continuar armado' : 'Reproducir armado'}</button>
                  <label className="box-generator__assembly-progress"><span>Secuencia de despiece a armado</span><input type="range" min="0" max="100" step="1" value={assemblyProgress === null ? 100 : Math.round(assemblyProgress * 100)} onChange={(event) => { setAssemblyPlaying(false); setAssemblyPosition(Number(event.currentTarget.value) / 100); }} aria-label="Progreso de la secuencia de armado" /></label>
                </div>
              </div>
            )}
            {view === 'sheet' && sheetPlan && (
              <div className="box-generator__sheet-summary" aria-live="polite">
                <div><strong>{sheetPlan.totalSheets} {sheetPlan.totalSheets === 1 ? 'plancha' : 'planchas'}</strong><span>{formatBoxLength(sheetPlan.spec.widthMm, project.unit)} × {formatBoxLength(sheetPlan.spec.heightMm, project.unit)}</span></div>
                <div><strong>{formatBoxLength(sheetPlan.totalCutLengthMm, project.unit)}</strong><span>Ruta total de todas las hojas</span></div>
                <div><strong>{formatBoxArea(sheetPlan.totalAreaMm2, project.unit)}</strong><span>Área de piezas</span></div>
                <div><strong>{((selectedSheet?.efficiency ?? 0) * 100).toFixed(1)} %</strong><span>Área neta / hoja · no es rendimiento de compra</span></div>
              </div>
            )}
            {view === 'sheet' && sheetPlan && sheetPlan.totalSheets > 1 && (
              <div className="box-generator__sheet-pages" role="group" aria-label="Seleccionar hoja">
                {sheetPlan.sheets.map((sheet, index) => <button type="button" key={sheet.index} aria-pressed={activeSheetIndex === index} onClick={() => setSheetIndex(index)}>Hoja {sheet.index}</button>)}
              </div>
            )}
            <div className="box-generator__preview-meta">
              <div><strong>{boxModelLabels[project.modelType]}</strong><span>{project.closure === 'open' ? 'Caja abierta' : 'Caja cerrada'} · {project.jointStyle === 'finger' ? 'Unión por dedos' : 'Unión plana'}{project.frontDropMm > 0 ? ' · frente más bajo, laterales inclinados' : ''}</span></div>
              <span>{layout.panels.length} piezas · espesores {Array.from(new Set(layout.panels.map(({ panel }) => panel.thicknessMm))).map((thickness) => formatBoxLength(thickness, project.unit)).join(' / ')}</span>
            </div>
          </section>

          <section className="box-generator__dimensions-summary" aria-label="Medidas calculadas" aria-live="polite">
            <div><span>Interior</span><strong>{formatBoxLength(resolved.inside.width, project.unit)} <i>×</i> {formatBoxLength(resolved.inside.height, project.unit)} <i>×</i> {formatBoxLength(resolved.inside.depth, project.unit)}</strong><small>{project.frontDropMm > 0 ? `Ancho × alto máximo al fondo × fondo · frente ${formatBoxLength(resolved.wallHeight - project.frontDropMm, project.unit)}` : 'Ancho × alto × fondo'}</small></div>
            <div><span>Exterior</span><strong>{formatBoxLength(resolved.outside.width, project.unit)} <i>×</i> {formatBoxLength(resolved.outside.height, project.unit)} <i>×</i> {formatBoxLength(resolved.outside.depth, project.unit)}</strong><small>Ancho × alto × fondo</small></div>
          </section>

          <section className="box-generator__cam-estimate" aria-label="Estimación de fabricación" aria-live="polite">
            <div className="box-generator__cam-estimate-heading"><div><span className="box-generator__section-index">CAM</span><h3>Estimación de fabricación</h3></div><span>{project.camProfile.materialName || 'Sin perfil nombrado'}</span></div>
            {camEstimateError ? <p className="box-generator__sheet-error" role="alert">{camEstimateError}</p> : camEstimate && (
              <div className="box-generator__cam-estimate-grid">
                <div><strong>{camEstimate.cutLengthMm.toFixed(1)} mm</strong><span>Ruta total de corte</span></div>
                <div><strong>{camEstimate.cutMinutes === null ? 'Pendiente' : `${camEstimate.cutMinutes.toFixed(1)} min`}</strong><span>Tiempo geométrico{camEstimate.cutMinutes === null ? ' · ingresa velocidad' : ''}</span></div>
                <div><strong>{camEstimate.materialCost === null ? 'Pendiente' : `${camEstimate.materialCost.toFixed(2)} u.m.`}</strong><span>Material{camEstimate.materialCost === null ? ' · plancha y precio' : ''}</span></div>
                <div><strong>{camEstimate.machineCost === null ? 'Pendiente' : `${camEstimate.machineCost.toFixed(2)} u.m.`}</strong><span>Máquina{camEstimate.machineCost === null ? ' · velocidad y tarifa' : ''}</span></div>
                <div className="is-total"><strong>{camEstimate.totalCost === null ? 'Completa datos CAM' : `${camEstimate.totalCost.toFixed(2)} u.m.`}</strong><span>Subtotal estimado</span></div>
              </div>
            )}
            <p>El cálculo no incluye aceleraciones, perforaciones, pasadas, preparación, desperdicio ni impuestos. Usa el dato como referencia inicial.</p>
          </section>

          <section className="box-generator__export-card" aria-label="Exportar el diseño">
            <div><h3>{view === 'sheet' ? 'Exportar planchas' : 'Archivos para el siguiente paso'}</h3><p>{view === 'sheet' ? 'Descarga la hoja visible o empaqueta todas las hojas con su manifiesto.' : 'SVG/DXF usan la geometría actual y el kerf configurado.'}</p></div>
            <div className="box-generator__export-actions">
              <button type="button" className="button button-outline" onClick={exportSvg} disabled={view === 'sheet' && !selectedSheet}><Download size={16} /> SVG</button>
              <button type="button" className="button button-dark" onClick={exportDxf} disabled={view === 'sheet' && !selectedSheet}><Download size={16} /> DXF</button>
              {view === 'sheet' && <button type="button" className="button button-outline" onClick={exportAllSheets} disabled={!sheetPlan}><Download size={16} /> Todas (.zip)</button>}
            </div>
          </section>
          <p className="box-generator__status" role="status" aria-live="polite">{notice}</p>
          <p className="box-generator__small-print">Archivos vectoriales preliminares. Los colores de capas y las condiciones de corte deben confirmarse en el software y equipo de destino. Las estimaciones no sustituyen una prueba física.</p>
        </main>
      </div>
    </div>
  );
}
