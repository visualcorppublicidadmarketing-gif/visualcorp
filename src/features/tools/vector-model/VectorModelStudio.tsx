import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronDown, CircleHelp, Download, Eye, EyeOff, FileJson2, FileUp, Layers3, LoaderCircle, Plus, RotateCcw, Shapes, Trash2, Upload, X } from 'lucide-react';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import {
  VECTOR_CONTROL_TARGETS,
  MAX_VECTOR_FILE_BYTES_PUBLIC,
  addVectorControl,
  applyVectorControlValue,
  cloneVectorModel,
  createDefaultVectorModel,
  parseVectorModelFile,
  removeVectorControl,
  serializeVectorModel,
  setVectorLayer,
  setVectorModelDefaults,
  updateVectorDocumentSize,
  type VectorControlType,
  type VectorCustomControl,
  type VectorModelDocument,
  type VectorModelLayer,
  type VectorControlValue,
} from './vectorModel';
import { importSvgVector } from './vectorSvg';
import './VectorModelStudio.css';

const VectorModel3DPreview = lazy(() => import('./VectorModel3DPreview').then((module) => ({ default: module.VectorModel3DPreview })));
type ViewMode = '2d' | '3d';

export function VectorModelStudio() {
  const [document, setDocument] = useState<VectorModelDocument>(() => createDefaultVectorModel());
  const [selectedLayerId, setSelectedLayerId] = useState('');
  const [view, setView] = useState<ViewMode>('2d');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [customEditorOpen, setCustomEditorOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState({ label: '', type: 'text' as VectorControlType, target: 'custom.parameter', value: '', min: '', max: '', step: '1', options: '' });
  const svgInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const serialized = useMemo(() => {
    try { return serializeVectorModel(document); } catch { return ''; }
  }, [document]);
  const selectedLayer = document.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const isImported = Boolean(document.source.svgText && document.layers.length);

  const importSource = useCallback(async (file?: File) => {
    if (!file) return;
    setError(''); setMessage('');
    const extension = file.name.toLowerCase().split('.').pop();
    if (extension === 'ai' || extension === 'eps' || extension === 'epsf' || extension === 'ps') {
      setError('V1 recibe SVG. En Illustrator abre el original, convierte el texto a contornos y usa Archivo → Exportar → Exportar como → SVG. Luego carga aquí ese SVG.');
      return;
    }
    if (isImported && !window.confirm('¿Reemplazar el modelo que está abierto? Descarga su JSON si quieres conservar los cambios.')) return;
    setBusy(true);
    try {
      const result = await importSvgVector(file);
      setDocument(result.document);
      setSelectedLayerId(result.document.layers[0]?.id ?? '');
      setView('2d');
      setMessage(`Se importó ${file.name} localmente. Revisa las advertencias y confirma la escala antes de usar dimensiones reales.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo importar el SVG.');
    } finally { setBusy(false); }
  }, [isImported]);

  const openProject = useCallback(async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_VECTOR_FILE_BYTES_PUBLIC * 4) { setError('El archivo JSON supera el máximo permitido de 32 MiB.'); return; }
    if (isImported && !window.confirm('¿Reemplazar el modelo que está abierto? Descarga su JSON si quieres conservar los cambios.')) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const next = parseVectorModelFile(await file.text());
      setDocument(next);
      setSelectedLayerId(next.layers[0]?.id ?? '');
      setView('2d');
      setMessage(`Se abrió ${file.name} en este dispositivo.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo abrir el JSON. El modelo actual sigue intacto.');
    } finally { setBusy(false); }
  }, [isImported]);

  const replaceDocument = (update: (current: VectorModelDocument) => VectorModelDocument) => {
    try {
      setDocument(update(document));
      setError(''); setMessage('Cambios en el modelo actual. Descarga el JSON para guardarlos.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo aplicar el cambio.');
    }
  };

  const updateLayer = (layerId: string, patch: Partial<VectorModelLayer>) => replaceDocument((current) => setVectorLayer(current, layerId, patch));
  const updateDefaults = (patch: Partial<VectorModelDocument['defaults']>) => replaceDocument((current) => setVectorModelDefaults(current, patch));

  const downloadJson = () => {
    if (!serialized) { setError('No se puede exportar un documento incompleto.'); return; }
    const safeName = (document.metadata.title || 'modelo-vectorial').replace(/[^a-z0-9áéíóúñ_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'modelo-vectorial';
    downloadText(`${safeName}.vcvector.json`, serialized, 'application/json;charset=utf-8');
    setMessage('JSON descargado. Consérvalo como archivo del proyecto para poder reabrirlo.');
  };

  const copyJson = async () => {
    if (!serialized) return;
    try { await navigator.clipboard.writeText(serialized); setMessage('JSON copiado al portapapeles.'); }
    catch { setError('El navegador no permitió copiar. Usa Descargar JSON para guardar el documento.'); }
  };

  const addCustomControl = () => {
    const label = customDraft.label.trim();
    if (!label) { setError('Escribe un nombre para el control.'); return; }
    const target = customDraft.target as VectorCustomControl['target'];
    const targetMeta = VECTOR_CONTROL_TARGETS.find((item) => item.value === target);
    const type = target === 'custom.parameter' ? customDraft.type : (targetMeta?.type ?? customDraft.type);
    const initialDraftValue = customDraft.value || (target === 'custom.parameter' ? '' : getControlDraftDefault(target, document, selectedLayer));
    let defaultValue: string | number | boolean = initialDraftValue;
    if (type === 'number' || type === 'length') {
      defaultValue = Number(initialDraftValue);
      if (!Number.isFinite(defaultValue)) { setError('El valor inicial del control debe ser numérico.'); return; }
    } else if (type === 'boolean') defaultValue = initialDraftValue === 'true';
    else if (type === 'color' && !/^#[\da-f]{6}$/i.test(initialDraftValue)) { setError('El color inicial debe tener formato HEX #RRGGBB.'); return; }
    const control = {
      label,
      type,
      target,
      ...(target.startsWith('layer.') && selectedLayer ? { targetLayerId: selectedLayer.id } : {}),
      defaultValue,
      ...(type === 'length' ? { unit: 'mm' as const } : type === 'number' && target !== 'custom.parameter' ? { unit: target.includes('rotation') ? 'deg' as const : target.includes('scale') ? 'ratio' as const : '%' as const } : {}),
      ...(customDraft.min.trim() && Number.isFinite(Number(customDraft.min)) ? { min: Number(customDraft.min) } : {}),
      ...(customDraft.max.trim() && Number.isFinite(Number(customDraft.max)) ? { max: Number(customDraft.max) } : {}),
      ...(type === 'number' || type === 'length' ? { step: Number(customDraft.step) > 0 ? Number(customDraft.step) : 1 } : {}),
      ...(type === 'select' ? { options: customDraft.options.split(',').map((option) => option.trim()).filter(Boolean).slice(0, 40) } : {}),
    } as Omit<VectorCustomControl, 'id'>;
    if (type === 'select') {
      const options = customDraft.options.split(',').map((option) => option.trim()).filter(Boolean).slice(0, 40);
      if (!options.length) { setError('Agrega al menos una opción para el control de lista.'); return; }
      if (!options.includes(String(defaultValue))) defaultValue = options[0];
      control.defaultValue = defaultValue;
      control.options = options;
    }
    const minimum = customDraft.min.trim() ? Number(customDraft.min) : undefined;
    const maximum = customDraft.max.trim() ? Number(customDraft.max) : undefined;
    if ((customDraft.min.trim() && !Number.isFinite(minimum)) || (customDraft.max.trim() && !Number.isFinite(maximum))) { setError('Los límites deben ser numéricos.'); return; }
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) { setError('El mínimo no puede superar el máximo.'); return; }
    if ((type === 'number' || type === 'length') && ((minimum !== undefined && Number(defaultValue) < minimum) || (maximum !== undefined && Number(defaultValue) > maximum))) { setError('El valor inicial debe quedar dentro del rango indicado.'); return; }
    try {
      replaceDocument((current) => addVectorControl(current, control));
      setCustomDraft({ label: '', type: 'text', target: 'custom.parameter', value: '', min: '', max: '', step: '1', options: '' });
      setCustomEditorOpen(false);
      setMessage('Control agregado. Su valor se guarda en el JSON del modelo.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo agregar el control.'); }
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault(); setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file?.name.toLowerCase().endsWith('.json')) void openProject(file);
    else void importSource(file);
  };

  return (
    <section className={`vector-model${dragging ? ' is-dragging' : ''}`} aria-label="Conversor vectorial y configurador de modelo 2D y 3D"
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
      onDrop={onDrop}>
      <div className="vector-model__toolbar">
        <div className="vector-model__toolbar-copy"><span className="vector-model__eyebrow"><Layers3 size={13} /> MODELO CONFIGURABLE · LOCAL</span><strong>{document.metadata.title || 'Modelo vectorial'}</strong></div>
        <div className="vector-model__toolbar-actions">
          <input ref={svgInputRef} className="vector-model__sr-only" type="file" accept=".svg,.ai,.eps,.epsf,.ps,image/svg+xml" onChange={(event) => { void importSource(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} aria-label="Seleccionar vector para importar" />
          <input ref={jsonInputRef} className="vector-model__sr-only" type="file" accept=".vcvector.json,.json,application/json" onChange={(event) => { void openProject(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} aria-label="Abrir modelo vectorial JSON" />
          <button type="button" className="vector-model__button vector-model__button--secondary" disabled={busy} onClick={() => jsonInputRef.current?.click()}><FileJson2 size={15} /> Abrir JSON</button>
          <button type="button" className="vector-model__button vector-model__button--secondary" disabled={busy} onClick={() => svgInputRef.current?.click()}><Upload size={15} /> Importar vector</button>
          <button type="button" className="vector-model__button vector-model__button--primary" disabled={!isImported || busy} onClick={downloadJson}><Download size={15} /> Descargar JSON</button>
        </div>
      </div>

      {(error || message) && <div className={`vector-model__notice${error ? ' is-error' : ' is-success'}`} role={error ? 'alert' : 'status'}>
        {error ? <AlertTriangle size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}<span>{error || message}</span>
        <button type="button" className="vector-model__notice-close" aria-label="Cerrar aviso" onClick={() => { setError(''); setMessage(''); }}><X size={14} /></button>
      </div>}

      {busy && <div className="vector-model__busy" role="status"><LoaderCircle size={18} /> Procesando en este dispositivo…</div>}

      <div className="vector-model__workspace">
        <aside className="vector-model__panel vector-model__layers-panel" aria-label="Capas y piezas">
          <div className="vector-model__panel-heading"><div><span className="vector-model__eyebrow">ESTRUCTURA</span><h2>Capas y piezas</h2></div><span className="vector-model__count">{document.layers.length}</span></div>
          {document.layers.length ? <div className="vector-model__layer-list" role="list">
            {document.layers.map((layer, index) => <div className={`vector-model__layer${layer.id === selectedLayerId ? ' is-selected' : ''}`} key={layer.id} role="listitem">
              <button type="button" className="vector-model__layer-select" aria-pressed={layer.id === selectedLayerId} onClick={() => setSelectedLayerId(layer.id)}>
                <span className="vector-model__swatch" style={{ '--layer-color': layer.color } as CSSProperties} aria-hidden="true" />
                <span className="vector-model__layer-name">{layer.name}</span>
                {!layer.canExtrude && <span className="vector-model__layer-open" title="Solo vista 2D">2D</span>}
              </button>
              <div className="vector-model__layer-tools">
                <button type="button" className="vector-model__icon-button" aria-label={`${layer.visible ? 'Ocultar' : 'Mostrar'} ${layer.name}`} title={layer.visible ? 'Ocultar pieza' : 'Mostrar pieza'} onClick={() => updateLayer(layer.id, { visible: !layer.visible })}>{layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                <button type="button" className="vector-model__icon-button" aria-label={`Subir ${layer.name}`} disabled={index === 0} onClick={() => moveLayer(index, -1, replaceDocument)}><ArrowUp size={14} /></button>
                <button type="button" className="vector-model__icon-button" aria-label={`Bajar ${layer.name}`} disabled={index === document.layers.length - 1} onClick={() => moveLayer(index, 1, replaceDocument)}><ArrowDown size={14} /></button>
              </div>
            </div>)}
          </div> : <div className="vector-model__layer-empty"><Layers3 size={20} /><span>Al importar un vector, sus rutas aparecerán aquí como piezas configurables.</span></div>}
          <div className="vector-model__panel-footnote"><CircleHelp size={14} /><span>Los grupos del archivo se muestran junto al nombre de cada pieza cuando están disponibles.</span></div>
        </aside>

        <div className="vector-model__stage-panel" role="region" aria-label="Vista del modelo">
          <div className="vector-model__stage-toolbar">
            <div className="vector-model__view-switch" role="group" aria-label="Modo de previsualización">
              <button type="button" aria-pressed={view === '2d'} className={view === '2d' ? 'is-active' : ''} onClick={() => setView('2d')}>Vista 2D</button>
              <button type="button" aria-pressed={view === '3d'} className={view === '3d' ? 'is-active' : ''} onClick={() => setView('3d')}>Vista 3D</button>
            </div>
            {isImported && <div className="vector-model__stage-measure"><span>{formatLength(document.source.widthMm)} mm</span><i /> <span>{formatLength(document.source.heightMm)} mm</span></div>}
          </div>
          <div className={`vector-model__stage${!isImported ? ' is-empty' : ''}`}>
            {view === '2d' ? <VectorModel2DCanvas document={document} selectedLayerId={selectedLayerId} /> : isImported ? <Suspense fallback={<div className="vector-model__loading"><LoaderCircle size={22} /> Preparando la vista 3D…</div>}><VectorModel3DPreview document={document} /></Suspense> : <div className="vector-model__empty-stage"><Shapes size={38} /><h2>El modelo aparecerá aquí</h2><p>Importa un SVG para revisar el trazado y configurar su volumen.</p><button type="button" className="vector-model__button vector-model__button--primary" disabled={busy} onClick={() => svgInputRef.current?.click()}><FileUp size={15} /> Seleccionar SVG</button><span>SVG directo · 8 MB máximo · procesamiento local</span></div>}
          </div>
          <div className="vector-model__stage-caption"><span>{view === '2d' ? 'Plano XY · origen inferior izquierdo' : 'Extrusión +Z · visualización de configuración'}</span><span>{document.layers.filter((layer) => layer.visible).length} visible{document.layers.filter((layer) => layer.visible).length === 1 ? '' : 's'}</span></div>
        </div>

        <aside className="vector-model__panel vector-model__inspector" aria-label="Propiedades del modelo y la pieza">
          <div className="vector-model__panel-heading"><div><span className="vector-model__eyebrow">CONFIGURACIÓN</span><h2>Propiedades</h2></div><button type="button" className="vector-model__icon-button vector-model__reset" aria-label="Restaurar valores predeterminados" title="Restaurar valores predeterminados" disabled={!isImported} onClick={() => resetProject(setDocument, setSelectedLayerId, createDefaultVectorModel)}><RotateCcw size={14} /></button></div>
          <section className="vector-model__form-section">
            <h3>Modelo</h3>
            <label className="vector-model__field vector-model__field--wide"><span>Nombre del proyecto</span><input value={document.metadata.title} maxLength={100} onChange={(event) => replaceDocument((current) => { const next = cloneVectorModel(current); next.metadata.title = event.target.value; return next; })} /></label>
            <div className="vector-model__field-grid">
              <LengthField label="Ancho total" value={document.source.widthMm} disabled={!isImported} onChange={(value) => replaceDocument((current) => updateVectorDocumentSize(current, 'widthMm', value))} />
              <LengthField label="Alto total" value={document.source.heightMm} disabled={!isImported} onChange={(value) => replaceDocument((current) => updateVectorDocumentSize(current, 'heightMm', value))} />
            </div>
            <p className="vector-model__field-help">Cambiar una medida conserva la proporción del diseño. Las longitudes del JSON se guardan en milímetros.</p>
            {!document.source.scaleConfirmed && isImported && <div className="vector-model__scale-warning"><AlertTriangle size={15} /><span>Escala provisional. Ajusta una medida al tamaño físico conocido antes de usar cotas reales.</span></div>}
            <LengthField label="Espesor general" value={document.defaults.thicknessMm} max={100000} disabled={!isImported} onChange={(value) => updateDefaults({ thicknessMm: value })} />
            <ColorField label="Frente predeterminado" value={document.defaults.faceColors.front ?? '#9b83d5'} disabled={!isImported} onChange={(front) => updateDefaults({ faceColors: { ...document.defaults.faceColors, front } })} />
            <ColorField label="Dorso predeterminado" value={document.defaults.faceColors.back ?? '#7662ac'} disabled={!isImported} onChange={(back) => updateDefaults({ faceColors: { ...document.defaults.faceColors, back } })} />
            <ColorField label="Lateral predeterminado" value={document.defaults.faceColors.side ?? '#514574'} disabled={!isImported} onChange={(side) => updateDefaults({ faceColors: { ...document.defaults.faceColors, side } })} />
            <label className="vector-model__check"><input type="checkbox" checked={document.defaults.bevelEnabled} disabled={!isImported} onChange={(event) => updateDefaults({ bevelEnabled: event.target.checked })} /><span>Previsualizar bisel</span></label>
            {document.defaults.bevelEnabled && <div className="vector-model__field-grid"><LengthField label="Tamaño de bisel" value={document.defaults.bevelSizeMm} max={100000} disabled={!isImported} onChange={(value) => updateDefaults({ bevelSizeMm: value })} /><LengthField label="Profundidad del bisel" value={document.defaults.bevelThicknessMm} max={100000} disabled={!isImported} onChange={(value) => updateDefaults({ bevelThicknessMm: value })} /></div>}
          </section>

          {selectedLayer && <section className="vector-model__form-section vector-model__selected-section">
            <div className="vector-model__section-title"><h3>Pieza seleccionada</h3><span>{selectedLayer.canExtrude ? 'Perfil 3D' : 'Solo 2D'}</span></div>
            <label className="vector-model__field vector-model__field--wide"><span>Nombre</span><input value={selectedLayer.name} maxLength={160} onChange={(event) => updateLayer(selectedLayer.id, { name: event.target.value })} /></label>
            <div className="vector-model__field-grid">
              <LengthField label="Ancho" value={selectedLayer.widthMm} disabled={!isImported} onChange={(value) => updateLayer(selectedLayer.id, { widthMm: value })} />
              <LengthField label="Alto" value={selectedLayer.heightMm} disabled={!isImported} onChange={(value) => updateLayer(selectedLayer.id, { heightMm: value })} />
              <NumberField label="Posición X" value={selectedLayer.xMm} min={-10000000} max={10000000} unit="mm" onChange={(value) => updateLayer(selectedLayer.id, { xMm: value })} />
              <NumberField label="Posición Y" value={selectedLayer.yMm} min={-10000000} max={10000000} unit="mm" onChange={(value) => updateLayer(selectedLayer.id, { yMm: value })} />
              <NumberField label="Giro" value={selectedLayer.rotationDeg} unit="°" onChange={(value) => updateLayer(selectedLayer.id, { rotationDeg: value })} />
              <NumberField label="Escala X" value={selectedLayer.scaleX} min={-10000} max={10000} step={0.01} unit="×" onChange={(value) => { if (Math.abs(value) >= 0.001) updateLayer(selectedLayer.id, { scaleX: value }); }} />
              <NumberField label="Escala Y" value={selectedLayer.scaleY} min={-10000} max={10000} step={0.01} unit="×" onChange={(value) => { if (Math.abs(value) >= 0.001) updateLayer(selectedLayer.id, { scaleY: value }); }} />
              <LengthField label="Espesor propio" value={selectedLayer.thicknessMm ?? document.defaults.thicknessMm} max={100000} disabled={!selectedLayer.canExtrude} onChange={(value) => updateLayer(selectedLayer.id, { thicknessMm: value })} />
            </div>
            {selectedLayer.thicknessMm !== null && <button type="button" className="vector-model__text-action" onClick={() => updateLayer(selectedLayer.id, { thicknessMm: null })}>Usar el espesor general</button>}
            <ColorField label="Color de pieza" value={selectedLayer.color} onChange={(color) => updateLayer(selectedLayer.id, { color })} />
            <ColorField label="Color de trazo" value={selectedLayer.strokeColor ?? '#555555'} onChange={(strokeColor) => updateLayer(selectedLayer.id, { strokeColor })} />
            <NumberField label="Ancho de trazo" value={selectedLayer.strokeWidthMm} min={0} max={100000} unit="mm" onChange={(strokeWidthMm) => updateLayer(selectedLayer.id, { strokeWidthMm })} />
            <ColorField label="Cara frontal" value={selectedLayer.faceColors.front ?? document.defaults.faceColors.front ?? selectedLayer.color} onChange={(front) => updateLayer(selectedLayer.id, { faceColors: { ...selectedLayer.faceColors, front } })} />
            <ColorField label="Cara posterior" value={selectedLayer.faceColors.back ?? document.defaults.faceColors.back ?? selectedLayer.color} onChange={(back) => updateLayer(selectedLayer.id, { faceColors: { ...selectedLayer.faceColors, back } })} />
            <ColorField label="Lateral" value={selectedLayer.faceColors.side ?? document.defaults.faceColors.side ?? selectedLayer.color} onChange={(side) => updateLayer(selectedLayer.id, { faceColors: { ...selectedLayer.faceColors, side } })} />
          </section>}

          <section className="vector-model__form-section vector-model__custom-section">
            <div className="vector-model__section-title"><h3>Controles personalizados</h3><button type="button" className="vector-model__icon-button" aria-label="Agregar control personalizado" disabled={!isImported || document.controls.length >= 80} onClick={() => setCustomEditorOpen((open) => !open)}>{customEditorOpen ? <X size={15} /> : <Plus size={15} />}</button></div>
            {customEditorOpen && <div className="vector-model__custom-builder">
              <label className="vector-model__field vector-model__field--wide"><span>Nombre del control</span><input value={customDraft.label} maxLength={80} placeholder="Ej. Tipo de acabado" onChange={(event) => setCustomDraft((draft) => ({ ...draft, label: event.target.value }))} /></label>
              <label className="vector-model__field vector-model__field--wide"><span>Qué propiedad cambia</span><select value={customDraft.target} onChange={(event) => { const target = event.target.value as VectorCustomControl['target']; const meta = VECTOR_CONTROL_TARGETS.find((item) => item.value === target); setCustomDraft((draft) => ({ ...draft, target, type: target === 'custom.parameter' ? draft.type : (meta?.type ?? draft.type), value: target === 'custom.parameter' ? draft.value : getControlDraftDefault(target, document, selectedLayer) })); }}>
                {VECTOR_CONTROL_TARGETS.map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}
              </select></label>
              {customDraft.target === 'custom.parameter' && <label className="vector-model__field vector-model__field--wide"><span>Tipo de dato</span><select value={customDraft.type} onChange={(event) => { const type = event.target.value as VectorControlType; setCustomDraft((draft) => ({ ...draft, type, value: type === 'boolean' ? 'false' : type === 'color' ? '#8a72c6' : type === 'select' ? draft.options.split(',').map((option) => option.trim()).filter(Boolean)[0] ?? '' : '' })); }}><option value="text">Texto</option><option value="number">Número</option><option value="length">Medida (mm)</option><option value="color">Color</option><option value="select">Lista de opciones</option><option value="boolean">Interruptor</option></select></label>}
              <label className="vector-model__field vector-model__field--wide"><span>Valor inicial</span><ControlDraftInput type={customDraft.type} value={customDraft.value} options={customDraft.options} onChange={(value) => setCustomDraft((draft) => ({ ...draft, value }))} /></label>
              {(customDraft.type === 'number' || customDraft.type === 'length') && <div className="vector-model__field-grid"><label className="vector-model__field"><span>Mínimo</span><input type="number" value={customDraft.min} onChange={(event) => setCustomDraft((draft) => ({ ...draft, min: event.target.value }))} /></label><label className="vector-model__field"><span>Máximo</span><input type="number" value={customDraft.max} onChange={(event) => setCustomDraft((draft) => ({ ...draft, max: event.target.value }))} /></label></div>}
              {customDraft.type === 'select' && <label className="vector-model__field vector-model__field--wide"><span>Opciones separadas por coma</span><input value={customDraft.options} placeholder="Mate, Satín, Brillante" onChange={(event) => setCustomDraft((draft) => ({ ...draft, options: event.target.value }))} /></label>}
              {customDraft.target.startsWith('layer.') && !selectedLayer && <p className="vector-model__field-help">Selecciona una pieza antes de asociar el control a una propiedad de capa.</p>}
              <button type="button" className="vector-model__button vector-model__button--primary" disabled={!selectedLayer && customDraft.target.startsWith('layer.')} onClick={addCustomControl}><Plus size={14} /> Añadir control</button>
            </div>}
            {document.controls.length ? <div className="vector-model__custom-controls">{document.controls.map((control) => <CustomControlField key={control.id} control={control} value={document.controlValues[control.id] ?? control.defaultValue} onChange={(value) => { try { replaceDocument((current) => applyVectorControlValue(current, control.id, value)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo aplicar el valor.'); } }} onRemove={() => replaceDocument((current) => removeVectorControl(current, control.id))} />)}</div> : <p className="vector-model__field-help">Agrega campos propios del modelo. Los parámetros personalizados quedan en el JSON para que otro consumidor pueda interpretarlos.</p>}
          </section>
        </aside>
      </div>

      {document.diagnostics.length > 0 && <section className="vector-model__diagnostics" aria-labelledby="vector-diagnostics-title"><div className="vector-model__diagnostic-heading"><div><span className="vector-model__eyebrow">REVISIÓN DEL ARCHIVO</span><h2 id="vector-diagnostics-title">Advertencias y notas</h2></div><span>{document.diagnostics.length}</span></div><ul>{document.diagnostics.map((item) => <li key={item.id} className={`is-${item.severity}`}><AlertTriangle size={14} /><span>{item.message}</span></li>)}</ul></section>}

      {isImported && <details className="vector-model__json-preview"><summary><span><FileJson2 size={15} /> Vista previa del JSON</span><ChevronDown size={15} aria-hidden="true" /></summary><div className="vector-model__json-actions"><button type="button" className="vector-model__text-action" onClick={() => void copyJson()}>Copiar contenido</button><span>{new Blob([serialized]).size.toLocaleString('es-EC')} bytes · JSON v1</span></div><pre>{serialized.slice(0, 14000)}{serialized.length > 14000 ? '\n… Vista acortada. Descargar JSON guarda el documento completo.' : ''}</pre></details>}

      {dragging && <div className="vector-model__drop-overlay" aria-hidden="true"><div><FileUp size={30} /><strong>Suelta el SVG o JSON aquí</strong><span>El archivo se procesa localmente</span></div></div>}
      <p className="vector-model__privacy-note"><span /> Los archivos se procesan en este navegador. No se suben ni se guardan en una cuenta.</p>
    </section>
  );
}

function VectorModel2DCanvas({ document, selectedLayerId }: { document: VectorModelDocument; selectedLayerId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const parsedPaths = useMemo(() => {
    if (!document.source.svgText) return [];
    try { return new SVGLoader().parse(document.source.svgText).paths; } catch { return []; }
  }, [document.source.svgText]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const draw = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const appThemeRoot = host.closest('.work-app');
      const isDark = globalThis.document.documentElement?.dataset?.theme === 'dark' || globalThis.document.body.classList.contains('theme-dark') || appThemeRoot?.classList.contains('theme-dark') === true;
      context.fillStyle = isDark ? '#171923' : '#f3f4f8';
      context.fillRect(0, 0, width, height);
      const gridColor = isDark ? 'rgba(190,199,222,.075)' : 'rgba(64,70,91,.08)';
      context.strokeStyle = gridColor; context.lineWidth = 1;
      for (let x = 24; x < width; x += 24) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
      for (let y = 24; y < height; y += 24) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
      const drawing = document as unknown as VectorModelDocument;
      if (!drawing.source.svgText || !drawing.layers.length) return;
      const fitScale = Math.min((width - 56) / drawing.source.widthMm, (height - 56) / drawing.source.heightMm);
      if (!Number.isFinite(fitScale) || fitScale <= 0) return;
      const offsetX = (width - drawing.source.widthMm * fitScale) / 2;
      const offsetY = (height - drawing.source.heightMm * fitScale) / 2;
      context.strokeStyle = isDark ? 'rgba(222,229,245,.32)' : 'rgba(72,75,92,.32)';
      context.lineWidth = 1; context.setLineDash([5, 5]);
      context.strokeRect(offsetX, offsetY, drawing.source.widthMm * fitScale, drawing.source.heightMm * fitScale);
      context.setLineDash([]);
      drawing.layers.forEach((layer) => {
        if (!layer.visible) return;
        const path = parsedPaths[layer.sourcePathIndex];
        if (!path) return;
        const points = path.subPaths.map((subPath) => subPath.getPoints(20));
        const flat = points.flat();
        if (!flat.length) return;
        const minX = flat.reduce((minimum, point) => Math.min(minimum, point.x), Infinity);
        const minY = flat.reduce((minimum, point) => Math.min(minimum, point.y), Infinity);
        const maxX = flat.reduce((maximum, point) => Math.max(maximum, point.x), -Infinity);
        const maxY = flat.reduce((maximum, point) => Math.max(maximum, point.y), -Infinity);
        const centerX = layer.widthMm / 2;
        const centerY = layer.heightMm / 2;
        const rotation = (layer.rotationDeg * Math.PI) / 180;
        const cos = Math.cos(rotation); const sin = Math.sin(rotation);
        const toScreen = (point: { x: number; y: number }) => {
          const localX = (point.x - minX) * drawing.source.mmPerSourceUnit * layer.scaleX;
          const localY = (maxY - point.y) * drawing.source.mmPerSourceUnit * layer.scaleY;
          const rotatedX = centerX + (localX - centerX) * cos - (localY - centerY) * sin;
          const rotatedY = centerY + (localX - centerX) * sin + (localY - centerY) * cos;
          return { x: offsetX + (layer.xMm + rotatedX) * fitScale, y: offsetY + (drawing.source.heightMm - layer.yMm - rotatedY) * fitScale };
        };
        context.save();
        context.globalAlpha = layer.opacity;
        context.beginPath();
        points.forEach((subPathPoints) => {
          if (subPathPoints.length < 2) return;
          const first = toScreen(subPathPoints[0]);
          context.moveTo(first.x, first.y);
          for (let index = 1; index < subPathPoints.length; index += 1) {
            const next = toScreen(subPathPoints[index]);
            context.lineTo(next.x, next.y);
          }
          const firstPoint = subPathPoints[0]; const lastPoint = subPathPoints[subPathPoints.length - 1];
          if (firstPoint.distanceTo(lastPoint) < 0.05) context.closePath();
        });
        context.fillStyle = layer.color;
        context.strokeStyle = layer.strokeColor ?? layer.color;
        const sourceStyle = path.userData?.style as Record<string, unknown> | undefined;
        const fillValue = typeof sourceStyle?.fill === 'string' ? sourceStyle.fill : 'black';
        const hasFill = fillValue.toLowerCase() !== 'none';
        const hasStroke = layer.strokeColor !== null && layer.strokeWidthMm > 0;
        if (hasFill) context.fill(layer.fillRule);
        if (hasStroke) {
          context.lineWidth = Math.max(0.5, layer.strokeWidthMm * fitScale * Math.sqrt(Math.abs(layer.scaleX * layer.scaleY)));
          context.stroke();
        }
        if (layer.id === selectedLayerId) {
          const topLeft = toScreen({ x: minX, y: maxY });
          context.globalAlpha = 1; context.strokeStyle = '#e5007e'; context.lineWidth = 1.5; context.setLineDash([5, 4]);
          context.strokeRect(topLeft.x, topLeft.y, Math.max(2, layer.widthMm * fitScale), Math.max(2, layer.heightMm * fitScale)); context.setLineDash([]);
        }
        context.restore();
      });
      context.fillStyle = isDark ? '#b7bed2' : '#656c7c';
      context.font = '11px system-ui, sans-serif';
      context.fillText('X · mm', Math.max(12, offsetX), Math.min(height - 12, offsetY + drawing.source.heightMm * fitScale + 20));
      context.save(); context.translate(Math.max(12, offsetX - 6), Math.min(height - 24, offsetY + drawing.source.heightMm * fitScale - 6)); context.rotate(-Math.PI / 2); context.fillText('Y · mm', 0, 0); context.restore();
    };
    const observer = new ResizeObserver(draw);
    const themeObserver = new MutationObserver(draw);
    const appThemeRoot = host.closest('.work-app') ?? globalThis.document.body;
    observer.observe(host); draw();
    themeObserver.observe(globalThis.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    themeObserver.observe(appThemeRoot, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => { observer.disconnect(); themeObserver.disconnect(); };
  }, [document, parsedPaths, selectedLayerId]);

  return <div className="vector-model__canvas-frame"><canvas ref={canvasRef} aria-label="Vista 2D con contornos y medidas en milímetros" role="img" />{!document.source.svgText && <div className="vector-model__canvas-empty"><Shapes size={30} /><strong>El vector aparecerá aquí</strong><span>Arrastra un SVG a esta zona o usa Importar vector.</span></div>}</div>;
}

function LengthField({ label, value, max = 10000000, disabled, onChange }: { label: string; value: number; max?: number; disabled?: boolean; onChange: (value: number) => void }) {
  return <label className="vector-model__field"><span>{label}</span><span className="vector-model__unit-input"><input type="number" min="0" max={max} step="0.1" value={formatLength(value)} disabled={disabled} onChange={(event) => { const number = Number(event.target.value); if (Number.isFinite(number) && number > 0 && number <= max) onChange(number); }} /><i>mm</i></span></label>;
}

function NumberField({ label, value, min, max, step = 0.1, unit, inputId, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; unit?: string; inputId?: string; onChange: (value: number) => void }) {
  return <label className="vector-model__field"><span>{label}</span><span className="vector-model__unit-input"><input id={inputId} type="number" min={min} max={max} step={step} value={Number.isFinite(value) ? value : 0} onChange={(event) => { const number = Number(event.target.value); if (Number.isFinite(number) && (min === undefined || number >= min) && (max === undefined || number <= max)) onChange(number); }} />{unit && <i>{unit}</i>}</span></label>;
}

function ColorField({ label, value, disabled, onChange, inputId, ariaLabel }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void; inputId?: string; ariaLabel?: string }) {
  return <label className="vector-model__color-field"><span>{label}</span><input id={inputId} aria-label={ariaLabel ?? (label || 'Seleccionar color')} type="color" value={/^#[\da-f]{6}$/i.test(value) ? value : '#8a72c6'} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} /><code>{value.toUpperCase()}</code></label>;
}

function ControlDraftInput({ type, value, options, onChange }: { type: VectorControlType; value: string; options: string; onChange: (value: string) => void }) {
  if (type === 'boolean') return <select value={value || 'false'} onChange={(event) => onChange(event.target.value)}><option value="false">Desactivado</option><option value="true">Activado</option></select>;
  if (type === 'color') return <input type="color" value={/^#[\da-f]{6}$/i.test(value) ? value : '#8a72c6'} onChange={(event) => onChange(event.currentTarget.value)} />;
  if (type === 'number' || type === 'length') return <input type="number" step="0.1" value={value} onChange={(event) => onChange(event.target.value)} />;
  if (type === 'select') {
    const choices = options.split(',').map((option) => option.trim()).filter(Boolean).slice(0, 40);
    return <select value={choices.includes(value) ? value : (choices[0] ?? '')} disabled={!choices.length} onChange={(event) => onChange(event.target.value)}><option value="" disabled>Agrega primero las opciones</option>{choices.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
  }
  return <input value={value} maxLength={500} placeholder="Valor inicial" onChange={(event) => onChange(event.target.value)} />;
}

function CustomControlField({ control, value, onChange, onRemove }: { control: VectorCustomControl; value: VectorControlValue; onChange: (value: VectorControlValue) => void; onRemove: () => void }) {
  return <div className="vector-model__custom-control"><div className="vector-model__custom-control-label"><label htmlFor={`custom-${control.id}`}>{control.label}</label><button type="button" className="vector-model__icon-button" aria-label={`Eliminar control ${control.label}`} onClick={onRemove}><Trash2 size={13} /></button></div>
    {control.type === 'boolean' ? <label className="vector-model__check"><input id={`custom-${control.id}`} type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /><span>{Boolean(value) ? 'Activado' : 'Desactivado'}</span></label>
      : control.type === 'color' ? <ColorField label="" inputId={`custom-${control.id}`} ariaLabel={control.label} value={String(value)} onChange={onChange} />
        : control.type === 'select' ? <select id={`custom-${control.id}`} value={String(value)} onChange={(event) => onChange(event.target.value)}>{(control.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select>
          : control.type === 'number' || control.type === 'length' ? <NumberField label="" inputId={`custom-${control.id}`} value={Number(value)} min={control.min} max={control.max} step={control.step ?? 0.1} unit={control.unit === 'mm' ? 'mm' : control.unit === 'deg' ? '°' : control.unit === 'ratio' ? '×' : ''} onChange={onChange} />
            : <input id={`custom-${control.id}`} value={String(value)} maxLength={500} onChange={(event) => onChange(event.target.value)} />}
    {control.target === 'custom.parameter' && <small className="vector-model__field-help">Parámetro adicional del JSON</small>}
  </div>;
}

function moveLayer(index: number, offset: number, replace: (update: (current: VectorModelDocument) => VectorModelDocument) => void) {
  replace((current) => {
    const next = cloneVectorModel(current);
    const target = index + offset;
    if (target < 0 || target >= next.layers.length) return next;
    [next.layers[index], next.layers[target]] = [next.layers[target], next.layers[index]];
    return next;
  });
}

function getControlDraftDefault(target: VectorCustomControl['target'], document: VectorModelDocument, selectedLayer: VectorModelLayer | null): string {
  if (target === 'document.widthMm') return String(document.source.widthMm);
  if (target === 'document.heightMm') return String(document.source.heightMm);
  if (target === 'document.thicknessMm') return String(document.defaults.thicknessMm);
  if (target === 'custom.parameter') return '';
  const layer = selectedLayer;
  if (!layer) return '';
  if (target === 'layer.widthMm') return String(layer.widthMm);
  if (target === 'layer.heightMm') return String(layer.heightMm);
  if (target === 'layer.xMm') return String(layer.xMm);
  if (target === 'layer.yMm') return String(layer.yMm);
  if (target === 'layer.rotationDeg') return String(layer.rotationDeg);
  if (target === 'layer.scaleX') return String(layer.scaleX);
  if (target === 'layer.scaleY') return String(layer.scaleY);
  if (target === 'layer.thicknessMm') return String(layer.thicknessMm ?? document.defaults.thicknessMm);
  if (target === 'layer.color') return layer.color;
  if (target === 'layer.strokeColor') return layer.strokeColor ?? layer.color;
  if (target === 'layer.strokeWidthMm') return String(layer.strokeWidthMm);
  if (target === 'layer.faceColors.front') return layer.faceColors.front ?? document.defaults.faceColors.front ?? layer.color;
  if (target === 'layer.faceColors.back') return layer.faceColors.back ?? document.defaults.faceColors.back ?? layer.color;
  return layer.faceColors.side ?? document.defaults.faceColors.side ?? layer.color;
}

function resetProject(setDocument: (document: VectorModelDocument) => void, setSelectedLayerId: (id: string) => void, createDefault: () => VectorModelDocument) {
  if (!window.confirm('¿Cerrar el modelo actual? Descarga el JSON si quieres conservar los cambios.')) return;
  setDocument(createDefault()); setSelectedLayerId('');
}

function downloadText(fileName: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url; anchor.download = fileName; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatLength(value: number) { return Number.isFinite(value) ? Number(value.toFixed(2)) : 0; }
