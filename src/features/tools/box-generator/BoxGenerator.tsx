import { useId, useRef, useState } from 'react';
import { Box, Download, FileDown, FolderOpen, Info, RotateCcw, Save, Trash2 } from 'lucide-react';
import { BoxCutPreview } from './BoxCutPreview';
import { BoxGenerator3D } from './BoxGenerator3D';
import { planBoxSheets, type BoxSheetPlan, type BoxSheetSpec } from './boxFabrication';
import {
  boxProjectFilename,
  boxModelLabels,
  formatBoxArea,
  boxUnitToMm,
  buildBoxCutLayout,
  createBoxDxf,
  createBoxProjectFile,
  createBoxSvg,
  defaultBoxProject,
  downloadBoxFile,
  formatBoxLength,
  mmToBoxUnit,
  maxBoxThicknessMm,
  normalizeBoxProject,
  resolveBoxDimensions,
  type BoxProject,
  type BoxModelType,
  type BoxUnit,
} from './boxModel';
import './box-generator.css';

type DimensionKey = 'width' | 'height' | 'depth';
type NumericField = DimensionKey | 'thickness' | 'fingerWidth' | 'panelGap' | 'slidingClearance';
type DraftValues = Record<NumericField, string>;
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

function draftValues(project: BoxProject): DraftValues {
  return {
    width: displayLength(project.dimensionsMm.width, project.unit),
    height: displayLength(project.dimensionsMm.height, project.unit),
    depth: displayLength(project.dimensionsMm.depth, project.unit),
    thickness: displayLength(project.thicknessMm, project.unit),
    fingerWidth: displayLength(project.fingerWidthMm, project.unit),
    panelGap: displayLength(project.panelGapMm, project.unit),
    slidingClearance: displayLength(project.slidingClearanceMm, project.unit),
  };
}

function lengthForField(project: BoxProject, field: NumericField) {
  if (field === 'thickness') return project.thicknessMm;
  if (field === 'fingerWidth') return project.fingerWidthMm;
  if (field === 'panelGap') return project.panelGapMm;
  if (field === 'slidingClearance') return project.slidingClearanceMm;
  return project.dimensionsMm[field];
}

function fieldRange(field: NumericField) {
  if (field === 'thickness') return { min: 0.5, max: 30 };
  if (field === 'fingerWidth') return { min: 3, max: 120 };
  if (field === 'panelGap') return { min: 0, max: 100 };
  if (field === 'slidingClearance') return { min: 0, max: 5 };
  return { min: 10, max: 2000 };
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

export function BoxGenerator() {
  const id = useId().replaceAll(':', '');
  const importRef = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<BoxProject>(() => ({ ...defaultBoxProject, dimensionsMm: { ...defaultBoxProject.dimensionsMm } }));
  const [savedDesigns, setSavedDesigns] = useState<SavedBoxDesign[]>(readSavedDesigns);
  const [drafts, setDrafts] = useState<DraftValues>(() => draftValues(defaultBoxProject));
  const [view, setView] = useState<'3d' | '2d' | 'sheet'>('3d');
  // Sheet draft strings remain in the selected display unit until Apply converts them to mm.
  const [sheetDraft, setSheetDraft] = useState(() => defaultSheetDraft(defaultBoxProject.unit));
  const [sheetIndex, setSheetIndex] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  const [explosion, setExplosion] = useState(0);
  const [notice, setNotice] = useState('');
  const resolved = resolveBoxDimensions(project);
  const layout = buildBoxCutLayout(project);
  let sheetPlan: BoxSheetPlan | null = null;
  let sheetError = '';
  if (project.sheetSpec) {
    try { sheetPlan = planBoxSheets(project, project.sheetSpec); }
    catch (error) { sheetError = error instanceof Error ? error.message : 'No se pudo distribuir el diseño en la plancha.'; }
  }
  const activeSheetIndex = sheetPlan ? Math.min(sheetIndex, sheetPlan.sheets.length - 1) : 0;
  const selectedSheet = sheetPlan?.sheets[activeSheetIndex];

  const updateProject = (change: Partial<BoxProject>) => {
    const nextUnit = change.unit;
    if (nextUnit && nextUnit !== project.unit) {
      setDrafts((current) => Object.fromEntries(Object.entries(current).map(([field, value]) => [field, convertDraftValue(value, project.unit, nextUnit)])) as DraftValues);
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
    setNotice(`Modelo “${boxModelLabels[modelType]}” seleccionado.`);
  };

  const setNumericField = (field: NumericField, rawValue: string) => {
    setDrafts((current) => ({ ...current, [field]: rawValue }));
    if (rawValue.trim() === '') return;
    const displayed = Number(rawValue);
    if (!Number.isFinite(displayed)) return;
    const millimeters = boxUnitToMm(displayed, project.unit);
    const range = field === 'thickness'
      ? { min: 0.5, max: maxBoxThicknessMm(project) }
      : fieldRange(field);
    if (millimeters < range.min || millimeters > range.max) return;

    setProject((current) => {
      if (field === 'thickness') return normalizeBoxProject({ ...current, thicknessMm: millimeters });
      if (field === 'fingerWidth') return normalizeBoxProject({ ...current, fingerWidthMm: millimeters });
      if (field === 'panelGap') return normalizeBoxProject({ ...current, panelGapMm: millimeters });
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
    setSheetDraft(next.sheetSpec
      ? Object.fromEntries(Object.entries(next.sheetSpec).map(([key, value]) => [key, displayLength(value, next.unit)])) as typeof sheetDraft
      : defaultSheetDraft(next.unit));
    setNotice(message);
  };

  const saveProject = () => {
    downloadBoxFile(boxProjectFilename(project, 'vcbox.json'), createBoxProjectFile(project), 'application/json;charset=utf-8');
    setNotice('Archivo .vcbox.json descargado.');
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
    setNotice(`“${title}” guardado en Mis diseños de este navegador.`);
  };

  const openSavedDesign = (design: SavedBoxDesign) => {
    applyProject(normalizeBoxProject(design.project), `Diseño “${design.title}” cargado desde Mis diseños.`);
    setView('3d');
    setExplosion(0);
    setResetToken((current) => current + 1);
  };

  const deleteSavedDesign = (design: SavedBoxDesign) => {
    if (!window.confirm(`¿Eliminar “${design.title}” de Mis diseños guardados en este navegador?`)) return;
    const next = savedDesigns.filter((item) => item.id !== design.id);
    if (!writeSavedDesigns(next)) {
      setNotice('No se pudo actualizar la biblioteca de este navegador.');
      return;
    }
    setSavedDesigns(next);
    setNotice(`“${design.title}” eliminado de Mis diseños.`);
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

  const exportSvg = () => {
    if (view === 'sheet' && !selectedSheet) { setNotice(sheetError || 'Configura una plancha válida antes de exportarla.'); return; }
    const currentLayout = view === 'sheet' ? selectedSheet!.layout : buildBoxCutLayout(project);
    const filename = boxProjectFilename(project, 'svg');
    downloadBoxFile(view === 'sheet' ? filename.replace(/\.svg$/, `-hoja-${selectedSheet!.index}.svg`) : filename, createBoxSvg(project, currentLayout), 'image/svg+xml;charset=utf-8');
    setNotice('Archivo SVG listo. Verifica la escala antes de enviarlo al equipo de corte.');
  };

  const exportDxf = () => {
    if (view === 'sheet' && !selectedSheet) { setNotice(sheetError || 'Configura una plancha válida antes de exportarla.'); return; }
    const currentLayout = view === 'sheet' ? selectedSheet!.layout : buildBoxCutLayout(project);
    const filename = boxProjectFilename(project, 'dxf');
    downloadBoxFile(view === 'sheet' ? filename.replace(/\.dxf$/, `-hoja-${selectedSheet!.index}.dxf`) : filename, createBoxDxf(project, currentLayout), 'application/dxf;charset=utf-8');
    setNotice('Archivo DXF listo, con geometría en milímetros.');
  };

  const restoreDefaults = () => {
    const clean = { ...defaultBoxProject, dimensionsMm: { ...defaultBoxProject.dimensionsMm } };
    applyProject(clean, 'Se restauraron los valores iniciales.');
    setView('3d');
    setExplosion(0);
    setResetToken((current) => current + 1);
  };

  const applySheet = () => {
    if (Object.values(sheetDraft).some((value) => value.trim() === '')) { setNotice('Completa las cuatro medidas de la plancha.'); return; }
    const spec: BoxSheetSpec = {
      widthMm: boxUnitToMm(Number(sheetDraft.widthMm), project.unit),
      heightMm: boxUnitToMm(Number(sheetDraft.heightMm), project.unit),
      marginMm: boxUnitToMm(Number(sheetDraft.marginMm), project.unit),
      gapMm: boxUnitToMm(Number(sheetDraft.gapMm), project.unit),
    };
    if (spec.widthMm < 50 || spec.widthMm > 4000 || spec.heightMm < 50 || spec.heightMm > 4000 || spec.marginMm < 0 || spec.marginMm > 100 || spec.gapMm < 0 || spec.gapMm > 100) {
      setNotice(`La plancha debe medir entre ${formatBoxLength(50, project.unit)} y ${formatBoxLength(4000, project.unit)} por lado, con margen y separación entre 0 y ${formatBoxLength(100, project.unit)}.`); return;
    }
    try {
      const planned = planBoxSheets(project, spec);
      updateProject({ sheetSpec: spec });
      setSheetIndex(0);
      setView('sheet');
      setNotice(`${planned.totalSheets} ${planned.totalSheets === 1 ? 'hoja calculada' : 'hojas calculadas'} sin solapar piezas.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo planificar la plancha.'); }
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

  return (
    <div className="box-generator">
      <header className="box-generator__header">
        <div className="box-generator__title-block">
          <span className="box-generator__overline"><Box size={15} aria-hidden="true" /> Estudio de cajas</span>
          <label className="box-generator__title-input">
            <span className="sr-only">Nombre del diseño</span>
            <input maxLength={100} value={project.title} onChange={(event) => updateProject({ title: event.currentTarget.value })} />
          </label>
          <p>Elige un tipo de caja, ajusta sus medidas y revisa el mismo diseño en 3D y en el plano de corte.</p>
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
                <span>Holgura de la tapa</span>
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
              <p>MIDILLI permite crear y exportar JSON en su propio esquema. Los demás generadores ofrecen archivos vectoriales personalizables. Este estudio importa y guarda diseños Visual Corp <code>.vcbox.json</code>.</p>
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
              </label>
            </div>
            <div className="box-generator__measure-mode">
              <span>Las medidas representan</span>
              <div className="box-generator__segmented" role="group" aria-label="Base de las medidas">
                <button type="button" aria-pressed={project.dimensionMode === 'outside'} onClick={() => updateProject({ dimensionMode: 'outside' })}>Exterior</button>
                <button type="button" aria-pressed={project.dimensionMode === 'inside'} onClick={() => updateProject({ dimensionMode: 'inside' })}>Interior</button>
              </div>
            </div>
            <p className="box-generator__field-note">Elige mm, cm o pulgadas. Las medidas se convierten a milímetros para generar la geometría y los archivos de corte.</p>
          </section>

          <section className="box-generator__control-section">
            <div className="box-generator__section-heading"><div><span className="box-generator__section-index">03</span><h3>Ensamble</h3></div></div>
            <div className="box-generator__control-stack">
              <div className="box-generator__choice-field">
                <span>Parte superior</span>
                <div className="box-generator__segmented" role="group" aria-label="Apertura de tapa">
                  <button type="button" aria-pressed={project.closure === 'open'} onClick={() => updateProject({ closure: 'open' })}>Abierta</button>
                  <button type="button" aria-pressed={project.closure === 'closed'} onClick={() => updateProject({ closure: 'closed' })}>Cerrada</button>
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
                  <input type="range" min={mmToBoxUnit(3, project.unit)} max={mmToBoxUnit(120, project.unit)} step={inputStep(project.unit)} value={mmToBoxUnit(project.fingerWidthMm, project.unit)} onChange={(event) => setNumericField('fingerWidth', event.currentTarget.value)} aria-label={`Ancho del dedo de ensamble en ${project.unit}`} />
                  <span className="box-generator__range-scale"><small>Fino</small><small>Ancho</small></span>
                </label>
              )}
            </div>
          </section>

          <details className="box-generator__advanced">
            <summary><span><span className="box-generator__section-index">04</span> Presentación y plano</span><span className="box-generator__summary-chevron" aria-hidden="true">⌄</span></summary>
            <div className="box-generator__advanced-content">
              {advancedField('panelGap')}
              <label className="box-generator__color-field">
                <span>Color de la vista 3D</span>
                <input type="color" value={project.previewColor} onChange={(event) => updateProject({ previewColor: event.currentTarget.value })} aria-label="Color de vista previa de la caja" />
              </label>
              <label className="box-generator__checkbox-field">
                <input type="checkbox" checked={project.includePartLabels} onChange={(event) => updateProject({ includePartLabels: event.currentTarget.checked })} />
                <span>Incluir nombres de piezas en SVG</span>
              </label>
            </div>
          </details>

          <details className="box-generator__advanced">
            <summary><span><span className="box-generator__section-index">05</span> Plancha de corte</span><span className="box-generator__summary-chevron" aria-hidden="true">⌄</span></summary>
            <div className="box-generator__advanced-content">
              <p className="box-generator__field-note">Introduce las medidas de la plancha en {project.unit}; se convierten a milímetros para calcular el acomodo. Los archivos vectoriales se exportan en milímetros. El margen reduce el área útil y las piezas no se rotan.</p>
              <div className="box-generator__sheet-fields">
                {([['widthMm', 'Ancho de plancha'], ['heightMm', 'Alto de plancha'], ['marginMm', 'Margen'], ['gapMm', 'Separación']] as const).map(([key, label]) => (
                  <label className="box-generator__dimension-field" key={key}>
                    <span>{label}</span>
                    <span className="box-generator__input-wrap">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={mmToBoxUnit(key === 'marginMm' || key === 'gapMm' ? 0 : 50, project.unit)}
                        max={mmToBoxUnit(key === 'marginMm' || key === 'gapMm' ? 100 : 4000, project.unit)}
                        step={inputStep(project.unit, 0.1)}
                        value={sheetDraft[key]}
                        onChange={(event) => setSheetDraft((current) => ({ ...current, [key]: event.currentTarget.value }))}
                        aria-label={`${label} en ${project.unit}`}
                      />
                      <span>{project.unit}</span>
                    </span>
                  </label>
                ))}
              </div>
              <button type="button" className="button button-outline box-generator__sheet-apply" onClick={applySheet}>Distribuir piezas</button>
              {sheetError && <p className="box-generator__sheet-error" role="alert">{sheetError}</p>}
            </div>
          </details>

          <div className="box-generator__spec-note">
            <Info size={17} aria-hidden="true" />
            <p>{project.modelType === 'sliding' ? 'Las guías de la tapa se exportan como piezas; falta definir una ranura de fabricación para el material y la máquina.' : project.modelType === 'bottle' || project.modelType === 'jewelry' ? 'Los separadores se muestran como paneles, sin ranuras de cruce ni tolerancias de ajuste.' : project.modelType === 'flexible' ? 'El giro de la tapa es una vista; la bisagra física requiere material flexible, cinta o herraje.' : 'El 3D usa los contornos del plano, pero el montaje aún es nominal.'} Haz un corte de muestra para validar encaje, tolerancia y kerf.</p>
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
              {view === '3d' ? <BoxGenerator3D project={project} resetToken={resetToken} explosion={explosion / 100} /> : view === '2d' ? <BoxCutPreview project={project} /> : selectedSheet ? <BoxCutPreview project={project} sheetLayout={selectedSheet.layout} sheetNumber={selectedSheet.index} /> : <div className="box-generator__sheet-empty">{sheetError || 'Indica las medidas de la plancha y pulsa «Distribuir piezas».'}</div>}
              {view === '3d' && <div className="box-generator__orbit-hint"><span aria-hidden="true">⤢</span> Arrastra para girar · pinza o rueda para acercar</div>}
            </div>
            {view === '3d' && <label className="box-generator__explode-control"><span>Armada</span><input type="range" min="0" max="100" step="1" value={explosion} onChange={(event) => setExplosion(Number(event.currentTarget.value))} aria-label="Separación de las piezas en la vista 3D" aria-valuetext={`${explosion} por ciento de despiece`} /><span>Ver piezas</span></label>}
            {view === 'sheet' && sheetPlan && (
              <div className="box-generator__sheet-summary" aria-live="polite">
                <div><strong>{sheetPlan.totalSheets} {sheetPlan.totalSheets === 1 ? 'plancha' : 'planchas'}</strong><span>{formatBoxLength(sheetPlan.spec.widthMm, project.unit)} × {formatBoxLength(sheetPlan.spec.heightMm, project.unit)}</span></div>
                <div><strong>{formatBoxLength(sheetPlan.totalCutLengthMm, project.unit)}</strong><span>Longitud de contornos</span></div>
                <div><strong>{formatBoxArea(sheetPlan.totalAreaMm2, project.unit)}</strong><span>Área de piezas</span></div>
                <div><strong>{((selectedSheet?.efficiency ?? 0) * 100).toFixed(1)} %</strong><span>Uso de esta hoja</span></div>
              </div>
            )}
            {view === 'sheet' && sheetPlan && sheetPlan.totalSheets > 1 && (
              <div className="box-generator__sheet-pages" role="group" aria-label="Seleccionar hoja">
                {sheetPlan.sheets.map((sheet, index) => <button type="button" key={sheet.index} aria-pressed={activeSheetIndex === index} onClick={() => setSheetIndex(index)}>Hoja {sheet.index}</button>)}
              </div>
            )}
            <div className="box-generator__preview-meta">
              <div><strong>{boxModelLabels[project.modelType]}</strong><span>{project.closure === 'open' ? 'Tapa abierta' : 'Tapa cerrada'} · {project.jointStyle === 'finger' ? 'Unión por dedos' : 'Unión plana'}</span></div>
              <span>{layout.panels.length} piezas · grosor {formatBoxLength(project.thicknessMm, project.unit)}</span>
            </div>
          </section>

          <section className="box-generator__dimensions-summary" aria-label="Medidas calculadas" aria-live="polite">
            <div><span>Interior</span><strong>{formatBoxLength(resolved.inside.width, project.unit)} <i>×</i> {formatBoxLength(resolved.inside.height, project.unit)} <i>×</i> {formatBoxLength(resolved.inside.depth, project.unit)}</strong><small>Ancho × alto × fondo</small></div>
            <div><span>Exterior</span><strong>{formatBoxLength(resolved.outside.width, project.unit)} <i>×</i> {formatBoxLength(resolved.outside.height, project.unit)} <i>×</i> {formatBoxLength(resolved.outside.depth, project.unit)}</strong><small>Ancho × alto × fondo</small></div>
          </section>

          <section className="box-generator__export-card" aria-label="Exportar el diseño">
            <div><h3>{view === 'sheet' ? 'Exportar la hoja visible' : 'Archivos para el siguiente paso'}</h3><p>{view === 'sheet' ? 'Cada hoja se descarga por separado en tamaño real.' : 'Los vectores se generan en el navegador con las medidas actuales.'}</p></div>
            <div className="box-generator__export-actions">
              <button type="button" className="button button-outline" onClick={exportSvg} disabled={view === 'sheet' && !selectedSheet}><Download size={16} /> SVG</button>
              <button type="button" className="button button-dark" onClick={exportDxf} disabled={view === 'sheet' && !selectedSheet}><Download size={16} /> DXF</button>
            </div>
          </section>
          <p className="box-generator__status" role="status" aria-live="polite">{notice}</p>
          <p className="box-generator__small-print">Archivos vectoriales preliminares. No incluyen compensación automática de kerf ni perfil de máquina.</p>
        </main>
      </div>
    </div>
  );
}
