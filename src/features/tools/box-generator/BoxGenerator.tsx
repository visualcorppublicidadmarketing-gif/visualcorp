import { useEffect, useId, useRef, useState } from 'react';
import { Box, Download, FileDown, FolderOpen, Info, RotateCcw, Save } from 'lucide-react';
import { BoxCutPreview } from './BoxCutPreview';
import { BoxGenerator3D } from './BoxGenerator3D';
import { planBoxSheets, type BoxSheetPlan, type BoxSheetSpec } from './boxFabrication';
import {
  boxProjectFilename,
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
  type BoxUnit,
} from './boxModel';
import './box-generator.css';

type DimensionKey = 'width' | 'height' | 'depth';
type NumericField = DimensionKey | 'thickness' | 'fingerWidth' | 'panelGap';
type DraftValues = Record<NumericField, string>;

const fieldLabels: Record<NumericField, string> = {
  width: 'Ancho',
  height: 'Alto',
  depth: 'Fondo',
  thickness: 'Grosor del material',
  fingerWidth: 'Ancho del dedo',
  panelGap: 'Separación entre piezas',
};

function draftValues(project: BoxProject): DraftValues {
  return {
    width: String(Number(mmToBoxUnit(project.dimensionsMm.width, project.unit).toFixed(2))),
    height: String(Number(mmToBoxUnit(project.dimensionsMm.height, project.unit).toFixed(2))),
    depth: String(Number(mmToBoxUnit(project.dimensionsMm.depth, project.unit).toFixed(2))),
    thickness: String(Number(mmToBoxUnit(project.thicknessMm, project.unit).toFixed(2))),
    fingerWidth: String(Number(mmToBoxUnit(project.fingerWidthMm, project.unit).toFixed(2))),
    panelGap: String(Number(mmToBoxUnit(project.panelGapMm, project.unit).toFixed(2))),
  };
}

function lengthForField(project: BoxProject, field: NumericField) {
  if (field === 'thickness') return project.thicknessMm;
  if (field === 'fingerWidth') return project.fingerWidthMm;
  if (field === 'panelGap') return project.panelGapMm;
  return project.dimensionsMm[field];
}

function fieldRange(field: NumericField) {
  if (field === 'thickness') return { min: 0.5, max: 30 };
  if (field === 'fingerWidth') return { min: 3, max: 120 };
  if (field === 'panelGap') return { min: 0, max: 100 };
  return { min: 10, max: 2000 };
}

export function BoxGenerator() {
  const id = useId().replaceAll(':', '');
  const importRef = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<BoxProject>(() => ({ ...defaultBoxProject, dimensionsMm: { ...defaultBoxProject.dimensionsMm } }));
  const [drafts, setDrafts] = useState<DraftValues>(() => draftValues(defaultBoxProject));
  const [view, setView] = useState<'3d' | '2d' | 'sheet'>('3d');
  const [sheetDraft, setSheetDraft] = useState({ widthMm: '', heightMm: '', marginMm: '10', gapMm: '5' });
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

  useEffect(() => {
    setDrafts(draftValues(project));
  }, [project.unit, project.dimensionsMm.width, project.dimensionsMm.height, project.dimensionsMm.depth, project.thicknessMm, project.fingerWidthMm, project.panelGapMm]);

  useEffect(() => {
    setSheetDraft(project.sheetSpec
      ? Object.fromEntries(Object.entries(project.sheetSpec).map(([key, value]) => [key, String(value)])) as typeof sheetDraft
      : { widthMm: '', heightMm: '', marginMm: '10', gapMm: '5' });
  }, [project.sheetSpec]);

  const updateProject = (change: Partial<BoxProject>) => setProject((current) => normalizeBoxProject({ ...current, ...change }));

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
      return normalizeBoxProject({ ...current, dimensionsMm: { ...current.dimensionsMm, [field]: millimeters } });
    });
  };

  const resetNumericDraft = (field: NumericField) => {
    const value = mmToBoxUnit(lengthForField(project, field), project.unit);
    setDrafts((current) => ({ ...current, [field]: String(Number(value.toFixed(2))) }));
  };

  const applyProject = (next: BoxProject, message: string) => {
    setProject(next);
    setNotice(message);
  };

  const saveProject = () => {
    downloadBoxFile(boxProjectFilename(project, 'vcbox.json'), createBoxProjectFile(project), 'application/json;charset=utf-8');
    setNotice('Diseño guardado en un archivo .vcbox.json.');
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
    const spec = Object.fromEntries(Object.entries(sheetDraft).map(([key, value]) => [key, Number(value)])) as unknown as BoxSheetSpec;
    if (Object.values(sheetDraft).some((value) => value.trim() === '')) { setNotice('Completa las cuatro medidas de la plancha.'); return; }
    if (spec.widthMm < 50 || spec.widthMm > 4000 || spec.heightMm < 50 || spec.heightMm > 4000 || spec.marginMm < 0 || spec.marginMm > 100 || spec.gapMm < 0 || spec.gapMm > 100) {
      setNotice('La plancha debe medir 50–4000 mm por lado, con margen y separación entre 0 y 100 mm.'); return;
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
            step={project.unit === 'in' ? '0.01' : '1'}
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
            step={project.unit === 'in' ? '0.01' : '1'}
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
          <p>Configura una caja básica y genera sus piezas con la misma geometría para la vista 3D y el plano de corte.</p>
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
          <button type="button" className="button button-outline" onClick={saveProject}><Save size={16} /> Guardar diseño</button>
        </div>
      </header>

      <div className="box-generator__workspace">
        <aside className="box-generator__controls" aria-label="Configuración de la caja">
          <section className="box-generator__control-section">
            <div className="box-generator__section-heading">
              <div><span className="box-generator__section-index">01</span><h3>Medidas</h3></div>
              <div className="box-generator__segmented box-generator__unit-toggle" aria-label="Unidad de medida">
                {(['mm', 'in'] as BoxUnit[]).map((unit) => <button key={unit} type="button" aria-pressed={project.unit === unit} onClick={() => updateProject({ unit })}>{unit}</button>)}
              </div>
            </div>
            <div className="box-generator__dimension-grid">
              {dimensionField('width')}
              {dimensionField('height')}
              {dimensionField('depth')}
              <label className="box-generator__dimension-field">
                <span>{fieldLabels.thickness}</span>
                <span className="box-generator__input-wrap">
                  <input type="number" inputMode="decimal" min={mmToBoxUnit(0.5, project.unit)} max={mmToBoxUnit(maxBoxThicknessMm(project), project.unit)} step={project.unit === 'in' ? '0.01' : '0.5'} value={drafts.thickness} onChange={(event) => setNumericField('thickness', event.currentTarget.value)} onBlur={() => resetNumericDraft('thickness')} aria-label={`${fieldLabels.thickness} en ${project.unit}`} />
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
            <p className="box-generator__field-note">Los valores se guardan en milímetros y cambian de unidad solo en pantalla.</p>
          </section>

          <section className="box-generator__control-section">
            <div className="box-generator__section-heading"><div><span className="box-generator__section-index">02</span><h3>Ensamble</h3></div></div>
            <div className="box-generator__control-stack">
              <div className="box-generator__choice-field">
                <span>Parte superior</span>
                <div className="box-generator__segmented" role="group" aria-label="Tipo de caja">
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
                  <input type="range" min={mmToBoxUnit(3, project.unit)} max={mmToBoxUnit(120, project.unit)} step={project.unit === 'in' ? '0.01' : '1'} value={mmToBoxUnit(project.fingerWidthMm, project.unit)} onChange={(event) => setNumericField('fingerWidth', event.currentTarget.value)} aria-label="Ancho del dedo de ensamble" />
                  <span className="box-generator__range-scale"><small>Fino</small><small>Ancho</small></span>
                </label>
              )}
            </div>
          </section>

          <details className="box-generator__advanced">
            <summary><span><span className="box-generator__section-index">03</span> Presentación y plano</span><span className="box-generator__summary-chevron" aria-hidden="true">⌄</span></summary>
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
            <summary><span><span className="box-generator__section-index">04</span> Plancha de corte</span><span className="box-generator__summary-chevron" aria-hidden="true">⌄</span></summary>
            <div className="box-generator__advanced-content">
              <p className="box-generator__field-note">Introduce las medidas totales de tu plancha en mm; el margen reduce el área útil. Esta distribución usa rectángulos envolventes, sin rotar piezas.</p>
              <div className="box-generator__sheet-fields">
                {([['widthMm', 'Ancho de plancha'], ['heightMm', 'Alto de plancha'], ['marginMm', 'Margen'], ['gapMm', 'Separación']] as const).map(([key, label]) => (
                  <label className="box-generator__dimension-field" key={key}>
                    <span>{label}</span>
                    <span className="box-generator__input-wrap">
                      <input type="number" inputMode="decimal" min={key === 'marginMm' || key === 'gapMm' ? 0 : 50} max={key === 'marginMm' || key === 'gapMm' ? 100 : 4000} step="0.1" value={sheetDraft[key]} onChange={(event) => setSheetDraft((current) => ({ ...current, [key]: event.currentTarget.value }))} aria-label={`${label} en milímetros`} />
                      <span>mm</span>
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
            <p>El 3D usa los contornos del plano, pero el montaje aún es nominal. Haz un corte de muestra para validar encaje, tolerancia y kerf.</p>
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
                <div><strong>{sheetPlan.totalSheets} {sheetPlan.totalSheets === 1 ? 'plancha' : 'planchas'}</strong><span>{sheetPlan.spec.widthMm} × {sheetPlan.spec.heightMm} mm</span></div>
                <div><strong>{sheetPlan.totalCutLengthMm.toFixed(1)} mm</strong><span>Longitud de contornos</span></div>
                <div><strong>{sheetPlan.totalAreaMm2.toFixed(0)} mm²</strong><span>Área de piezas</span></div>
                <div><strong>{((selectedSheet?.efficiency ?? 0) * 100).toFixed(1)} %</strong><span>Uso de esta hoja</span></div>
              </div>
            )}
            {view === 'sheet' && sheetPlan && sheetPlan.totalSheets > 1 && (
              <div className="box-generator__sheet-pages" role="group" aria-label="Seleccionar hoja">
                {sheetPlan.sheets.map((sheet, index) => <button type="button" key={sheet.index} aria-pressed={activeSheetIndex === index} onClick={() => setSheetIndex(index)}>Hoja {sheet.index}</button>)}
              </div>
            )}
            <div className="box-generator__preview-meta">
              <div><strong>{project.closure === 'open' ? 'Caja abierta' : 'Caja cerrada'}</strong><span>{project.jointStyle === 'finger' ? 'Unión por dedos' : 'Unión plana'}</span></div>
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
