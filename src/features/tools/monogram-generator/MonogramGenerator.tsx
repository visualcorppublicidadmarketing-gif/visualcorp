import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { ArrowDownToLine, Copy, FileUp, Layers3, Plus, RotateCcw, Shapes, Sparkles, Trash2, Type } from 'lucide-react';
import {
  createMonogramLayer,
  createMonogramPreset,
  DEFAULT_MONOGRAM_PROJECT,
  formatMonogramLength,
  millimetersToMonogramUnit,
  MONOGRAM_GEOMETRY_LIMITATION,
  MONOGRAM_LIMITS,
  monogramUnitToMillimeters,
  MONOGRAM_BACKGROUND_PRESETS,
  normalizeMonogramProject,
  MONOGRAM_SHAPES,
  validateMonogramProject,
} from './monogramModel';
import type { MonogramDisplayUnit, MonogramElement, MonogramProject } from './monogramModel';
import { createMonogramOutline, createMonogramSvg, estimateOutlineBounds, loadMonogramFont } from './monogramVector';
import type { MonogramOutline } from './monogramVector';
import { Monogram2DStage } from './Monogram2DStage';
import './monogram-generator.css';

const STORAGE_KEY = 'visualcorp-monogram-generator-v1';
type ViewMode = '2d' | '3d';
const Monogram3DViewer = lazy(() => import('./Monogram3DViewer').then((module) => ({ default: module.Monogram3DViewer })));

function readSavedProject(): MonogramProject {
  if (typeof window === 'undefined') return DEFAULT_MONOGRAM_PROJECT;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value ? normalizeMonogramProject(JSON.parse(value)) : DEFAULT_MONOGRAM_PROJECT;
  } catch {
    return DEFAULT_MONOGRAM_PROJECT;
  }
}

function safeFilename(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'monograma';
}

function downloadFile(filename: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function layerName(element: MonogramElement, index: number) {
  if (element.kind === 'ornament') return MONOGRAM_SHAPES.find((shape) => shape.id === element.shapeId)?.label ?? `Adorno ${index + 1}`;
  return element.text.trim() || `Texto ${index + 1}`;
}

function numberInputValue(value: number) {
  return Number(value.toFixed(3)).toString();
}

interface MonogramNumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
}

function MonogramNumberField({ label, value, min, max, step, onCommit }: MonogramNumberFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(numberInputValue(value));

  useEffect(() => {
    if (!inputRef.current || document.activeElement !== inputRef.current) setDraft(numberInputValue(value));
  }, [value]);

  const commitDraft = () => {
    const parsed = Number(draft);
    const normalized = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
    onCommit(normalized);
    setDraft(numberInputValue(normalized));
  };

  return (
    <label className="monogram__field">
      {label}
      <input
        ref={inputRef}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (!next || next === '-' || next === '.') return;
          const numeric = Number(next);
          if (Number.isFinite(numeric) && numeric >= min && numeric <= max) onCommit(numeric);
        }}
        onBlur={commitDraft}
      />
    </label>
  );
}

export function MonogramGenerator() {
  const [project, setProject] = useState<MonogramProject>(readSavedProject);
  const [selectedId, setSelectedId] = useState<string | null>(() => project.elements[0]?.id ?? null);
  const [view, setView] = useState<ViewMode>('2d');
  const [shapeDraft, setShapeDraft] = useState<MonogramElement['shapeId']>('star');
  const [autoRotate, setAutoRotate] = useState(false);
  const [explodedGap, setExplodedGap] = useState(0);
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [font, setFont] = useState<Awaited<ReturnType<typeof loadMonogramFont>> | null>(null);
  const [fontError, setFontError] = useState('');
  const [status, setStatus] = useState('Los cambios se guardan en este navegador.');
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    loadMonogramFont('dm-sans')
      .then((loadedFont) => { if (active) setFont(loadedFont); })
      .catch((error: unknown) => {
        if (!active) return;
        setFontError(error instanceof Error ? error.message : 'No se pudo cargar DM Sans.');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch {
      setStatus('El navegador no permitió guardar automáticamente. Puedes descargar el archivo del diseño.');
    }
  }, [project]);

  const selected = project.elements.find((element) => element.id === selectedId) ?? null;
  const displayUnit = project.displayUnit;
  const displayLength = (valueMm: number) => millimetersToMonogramUnit(valueMm, displayUnit);
  const displayStep = displayUnit === 'cm' ? 0.01 : 0.1;
  const saveDisplayUnit = (unit: MonogramDisplayUnit) => {
    setProject((current) => normalizeMonogramProject({ ...current, displayUnit: unit }));
  };
  const outlineResult = useMemo(() => {
    const outlines: MonogramOutline[] = [];
    const errors: string[] = [];

    project.elements.forEach((element) => {
      try {
        const outline = createMonogramOutline(font, project.height, element);
        if (outline) outlines.push(outline);
      } catch {
        const text = element.text.trim();
        errors.push(`«${text || 'Texto vacío'}»: no se pudo convertir a contornos. Revisa los caracteres de esta capa.`);
      }
    });

    return { outlines, errors };
  }, [font, project]);
  const { outlines, errors: outlineErrors } = outlineResult;
  const validation = useMemo(() => validateMonogramProject(project), [project]);
  const outsideWarnings = font
    ? outlines.flatMap((outline) => {
      const bounds = estimateOutlineBounds(outline);
      const edges = [
        bounds.x < 0 ? 'izquierdo' : '',
        bounds.x + bounds.width > project.width ? 'derecho' : '',
        bounds.y < 0 ? 'superior' : '',
        bounds.y + bounds.height > project.height ? 'inferior' : '',
      ].filter(Boolean);
      return edges.length > 0 ? [{ elementId: outline.id, message: `«${outline.text}» sobresale por el borde ${edges.join(' y ')} del artboard.` }] : [];
    })
    : validation.warnings.filter((warning) => warning.code === 'outside-artboard');
  const missingCharacters = Array.from(new Set(outlines.flatMap((outline) => outline.missingCharacters)));
  const usedSimpleShaping = outlines.some((outline) => outline.usedSimpleShaping);
  const hasTextContent = project.elements.some((element) => element.kind === 'text' && element.text.trim().length > 0);
  const exportReady = Boolean(outlines.length > 0 && (!hasTextContent || font) && missingCharacters.length === 0 && outlineErrors.length === 0);
  const visibleDepth = outlines.length > 0
    ? Number(outlines.reduce((sum, outline) => sum + outline.depth, 0).toFixed(1))
    : 0;
  const gradientStyle = project.background.preset === 'gradient'
    ? { background: `linear-gradient(${project.background.gradientAngle}deg, ${project.background.gradientStart}, ${project.background.gradientEnd})` }
    : undefined;

  const updateLayer = (id: string, patch: Partial<MonogramElement>) => {
    setProject((current) => normalizeMonogramProject({
      ...current,
      elements: current.elements.map((element) => element.id === id ? { ...element, ...patch } : element),
    }));
  };

  const moveLayer = (id: string, dx: number, dy: number) => {
    setProject((current) => normalizeMonogramProject({
      ...current,
      elements: current.elements.map((element) => element.id === id
        ? { ...element, x: element.x + dx, y: element.y + dy }
        : element),
    }));
  };

  const choosePreset = (id: 'initial' | 'name-initial') => {
    const next = { ...createMonogramPreset(id), displayUnit: project.displayUnit };
    setProject(next);
    setSelectedId(next.elements[0]?.id ?? null);
    setStatus(`Preajuste «${next.title}» aplicado.`);
  };

  const addLayer = () => {
    try {
      const added = createMonogramLayer(project, { text: 'Texto' });
      setProject(added.project);
      setSelectedId(added.layer.id);
      setStatus('Capa de texto añadida. Puedes escribirla y moverla en el lienzo.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo añadir otra capa.');
    }
  };

  const addOrnament = () => {
    try {
      const added = createMonogramLayer(project, { kind: 'ornament', shapeId: shapeDraft ?? 'star' });
      setProject(added.project);
      setSelectedId(added.layer.id);
      setStatus('Adorno paramétrico añadido. Puedes cambiar su forma, tamaño y posición.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo añadir el adorno.');
    }
  };

  const duplicateLayer = (source: MonogramElement | null = selected) => {
    if (!source) return;
    try {
      const added = createMonogramLayer(project, {
        kind: source.kind,
        shapeId: source.shapeId,
        text: source.text,
        x: source.x + 5,
        y: source.y - 5,
        fontSize: source.fontSize,
        fontId: source.fontId,
        rotation: source.rotation,
        depth: source.depth,
        color: source.color,
      });
      setProject(added.project);
      setSelectedId(added.layer.id);
      setStatus('Capa duplicada.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo duplicar la capa.');
    }
  };

  const removeLayerById = (id: string) => {
    const next = project.elements.filter((element) => element.id !== id);
    setProject({ ...project, elements: next });
    setSelectedId(next[0]?.id ?? null);
    setStatus('Capa eliminada.');
  };

  const exportSvg = () => {
    if (outlines.length === 0) return;
    const svg = createMonogramSvg(project, outlines, project.title);
    downloadFile(`${safeFilename(project.title)}.svg`, new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    setStatus('SVG de contornos descargado. Revisa solapes y puentes antes de fabricar.');
  };

  const saveJson = () => {
    downloadFile(`${safeFilename(project.title)}.vcmg.json`, new Blob([JSON.stringify(project, null, 2)], { type: 'application/json;charset=utf-8' }));
    setStatus('Archivo editable del proyecto descargado.');
  };

  const openJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (file.size > 1_000_000) {
      setStatus('El archivo supera el límite de 1 MB para diseños de monograma.');
      return;
    }
    try {
      const candidate = JSON.parse(await file.text());
      if (!candidate || (candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2) || candidate.unit !== 'mm' || !Array.isArray(candidate.elements)) {
        throw new Error('Formato de proyecto no reconocido.');
      }
      const loaded = normalizeMonogramProject(candidate);
      setProject(loaded);
      setSelectedId(loaded.elements[0]?.id ?? null);
      setView('2d');
      setStatus(`Diseño «${loaded.title}» abierto. Revisa las advertencias de fabricación.`);
    } catch {
      setStatus('No se pudo abrir el archivo. Selecciona un JSON de monograma válido.');
    }
  };

  const reset = () => {
    const clean = normalizeMonogramProject(DEFAULT_MONOGRAM_PROJECT);
    setProject(clean);
    setSelectedId(clean.elements[0]?.id ?? null);
    setView('2d');
    setAutoRotate(false);
    setExplodedGap(0);
    setCameraResetKey((current) => current + 1);
    setShapeDraft('star');
    setStatus('Diseño reiniciado.');
  };

  return (
    <section className="monogram" aria-label="Editor paramétrico de monogramas">
      <div className="monogram__topbar">
        <div className="monogram__topbar-copy"><span className="monogram__eyebrow">DISEÑO PARAMÉTRICO · CAPAS 2D/3D</span><strong>{project.title || 'Monograma sin título'}</strong></div>
        <div className="monogram__actions">
          <button type="button" className="button button-outline" onClick={() => importRef.current?.click()}><FileUp size={15} /> Abrir</button>
          <button type="button" className="button button-outline" onClick={saveJson}><ArrowDownToLine size={15} /> Guardar</button>
          <button type="button" className="button button-dark" onClick={exportSvg} disabled={!exportReady}><ArrowDownToLine size={15} /> Exportar SVG</button>
          <input ref={importRef} className="monogram__visually-hidden" type="file" accept=".json,.vcmg.json,application/json" onChange={openJson} aria-label="Abrir diseño de monograma" />
        </div>
      </div>

      <div className="monogram__workspace">
        <aside className="monogram__sidebar" aria-label="Controles del diseño">
          <section className="monogram__card">
            <div className="monogram__section-heading"><div><span className="monogram__eyebrow">01 · EMPIEZA RÁPIDO</span><h2>Preajustes</h2></div></div>
            <div className="monogram__presets">
              <button type="button" onClick={() => choosePreset('initial')}><span className="monogram__preset-glyph">A</span><span><strong>Inicial</strong><small>Una capa</small></span></button>
              <button type="button" onClick={() => choosePreset('name-initial')}><span className="monogram__preset-glyph is-combo">A<span>Nombre</span></span><span><strong>Nombre + inicial</strong><small>Dos capas</small></span></button>
            </div>
          </section>

          <section className="monogram__card">
            <div className="monogram__section-heading"><div><span className="monogram__eyebrow">02 · TU COMPOSICIÓN</span><h2>Capas</h2></div><span className="monogram__layer-count">{project.elements.length}/{MONOGRAM_LIMITS.maxElements}</span></div>
            <div className="monogram__layer-list" role="list" aria-label="Capas del monograma">
              {project.elements.map((element, index) => (
                <div className={`monogram__layer-row${element.id === selectedId ? ' is-active' : ''}`} key={element.id} role="listitem">
                  <button type="button" className="monogram__layer-select" aria-pressed={element.id === selectedId} onClick={() => setSelectedId(element.id)}>
                    <span className="monogram__layer-icon">{element.kind === 'ornament' ? <Shapes size={15} /> : <Type size={15} />}</span><span><strong>{layerName(element, index)}</strong><small>{formatMonogramLength(element.fontSize, displayUnit)} {displayUnit} · {element.kind === 'ornament' ? 'adorno paramétrico' : 'DM Sans'}</small></span>
                  </button>
                  <button type="button" className="monogram__icon-action" onClick={() => { setSelectedId(element.id); duplicateLayer(element); }} aria-label={`Duplicar ${layerName(element, index)}`} title="Duplicar capa"><Copy size={14} /></button>
                  <button type="button" className="monogram__icon-action is-danger" onClick={() => removeLayerById(element.id)} aria-label={`Eliminar ${layerName(element, index)}`} title="Eliminar capa"><Trash2 size={14} /></button>
                </div>
              ))}
              {project.elements.length === 0 && <p className="monogram__empty-note">No hay capas. Añade texto para iniciar.</p>}
            </div>
            <div className="monogram__add-actions">
              <button type="button" className="button button-outline monogram__add-layer" onClick={addLayer} disabled={project.elements.length >= MONOGRAM_LIMITS.maxElements}><Plus size={15} /> Texto</button>
              <label className="monogram__visually-hidden" htmlFor="monogram-shape-draft">Forma del adorno nuevo</label>
              <select id="monogram-shape-draft" className="monogram__compact-select" value={shapeDraft ?? 'star'} onChange={(event) => setShapeDraft(event.target.value as NonNullable<MonogramElement['shapeId']>)} aria-label="Forma del adorno nuevo">
                {MONOGRAM_SHAPES.map((shape) => <option key={shape.id} value={shape.id}>{shape.label}</option>)}
              </select>
              <button type="button" className="button button-outline monogram__add-layer" onClick={addOrnament} disabled={project.elements.length >= MONOGRAM_LIMITS.maxElements}><Plus size={15} /> Adorno</button>
            </div>
          </section>

          {selected && <section className="monogram__card">
            <div className="monogram__section-heading"><div><span className="monogram__eyebrow">03 · CAPA SELECCIONADA</span><h2>{selected.kind === 'ornament' ? 'Editar adorno' : 'Editar texto'}</h2></div></div>
            {selected.kind === 'text'
              ? <label className="monogram__field monogram__field--full">Texto
                  <input type="text" maxLength={MONOGRAM_LIMITS.maxTextLength} value={selected.text} onChange={(event) => updateLayer(selected.id, { text: event.target.value })} placeholder="Escribe un nombre o inicial" />
                </label>
              : <label className="monogram__field">Forma
                  <select value={selected.shapeId ?? 'star'} onChange={(event) => updateLayer(selected.id, { shapeId: event.target.value as NonNullable<MonogramElement['shapeId']> })}>
                    {MONOGRAM_SHAPES.map((shape) => <option key={shape.id} value={shape.id}>{shape.label}</option>)}
                  </select>
                </label>}
            <div className="monogram__field-grid">
              <MonogramNumberField label={`${selected.kind === 'ornament' ? 'Tamaño del adorno' : 'Tamaño de letra'} (${displayUnit})`} min={displayLength(MONOGRAM_LIMITS.minFontSize)} max={displayLength(MONOGRAM_LIMITS.maxFontSize)} step={displayStep} value={displayLength(selected.fontSize)} onCommit={(fontSize) => updateLayer(selected.id, { fontSize: monogramUnitToMillimeters(fontSize, displayUnit) })} />
              <MonogramNumberField label={`Profundidad 3D (${displayUnit})`} min={displayLength(MONOGRAM_LIMITS.minDepth)} max={displayLength(MONOGRAM_LIMITS.maxDepth)} step={displayStep} value={displayLength(selected.depth)} onCommit={(depth) => updateLayer(selected.id, { depth: monogramUnitToMillimeters(depth, displayUnit) })} />
              <MonogramNumberField label={`Posición X (${displayUnit})`} min={displayLength(MONOGRAM_LIMITS.minCoordinate)} max={displayLength(MONOGRAM_LIMITS.maxCoordinate)} step={displayStep} value={displayLength(selected.x)} onCommit={(x) => updateLayer(selected.id, { x: monogramUnitToMillimeters(x, displayUnit) })} />
              <MonogramNumberField label={`${selected.kind === 'ornament' ? 'Posición Y' : 'Línea base Y'} (${displayUnit})`} min={displayLength(MONOGRAM_LIMITS.minCoordinate)} max={displayLength(MONOGRAM_LIMITS.maxCoordinate)} step={displayStep} value={displayLength(selected.y)} onCommit={(y) => updateLayer(selected.id, { y: monogramUnitToMillimeters(y, displayUnit) })} />
            </div>
            <label className="monogram__field monogram__rotation">Rotación <span>{selected.rotation}°</span>
              <input type="range" min={MONOGRAM_LIMITS.minRotation} max={MONOGRAM_LIMITS.maxRotation} step="1" value={selected.rotation} onChange={(event) => updateLayer(selected.id, { rotation: Number(event.target.value) })} />
            </label>
            <label className="monogram__field monogram__color-field">Color de vista previa
              <input type="color" value={selected.color} onChange={(event) => updateLayer(selected.id, { color: event.target.value })} aria-label="Color de la capa en la vista previa" />
            </label>
            <p className="monogram__font-note">{selected.kind === 'text' ? 'Fuente local: DM Sans. El archivo guarda medidas y texto; no contiene el archivo de fuente.' : 'La forma se genera como contorno paramétrico y se conserva al guardar el proyecto.'} El color es solo visual; el SVG de fabricación usa un relleno neutro.</p>
          </section>}

          <section className="monogram__card">
            <div className="monogram__section-heading"><div><span className="monogram__eyebrow">04 · PRESENTACIÓN</span><h2>Acabado y fondo</h2></div><Sparkles size={16} aria-hidden="true" /></div>
            <label className="monogram__field">Material 3D
              <select value={project.finish} onChange={(event) => setProject((current) => normalizeMonogramProject({ ...current, finish: event.target.value }))}>
                <option value="matte">Mate</option>
                <option value="satin">Satín</option>
                <option value="metallic">Metálico</option>
              </select>
            </label>
            <label className="monogram__check-field"><input type="checkbox" checked={project.bevel} onChange={(event) => setProject((current) => normalizeMonogramProject({ ...current, bevel: event.target.checked }))} /> Bisel suave en vista 3D</label>
            <fieldset className="monogram__background-options">
              <legend>Fondo de la vista previa</legend>
              <div className="monogram__background-grid">
                {MONOGRAM_BACKGROUND_PRESETS.map((preset) => (
                  <button type="button" key={preset.id} className={`monogram__background-choice is-${preset.id}`} aria-pressed={project.background.preset === preset.id} onClick={() => setProject((current) => normalizeMonogramProject({ ...current, background: { ...current.background, preset: preset.id } }))}>
                    <span aria-hidden="true" /><small>{preset.label}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            {project.background.preset === 'gradient' && <div className="monogram__gradient-fields">
              <label className="monogram__field monogram__color-field">Color inicial<input type="color" value={project.background.gradientStart} onChange={(event) => setProject((current) => normalizeMonogramProject({ ...current, background: { ...current.background, gradientStart: event.target.value } }))} /></label>
              <label className="monogram__field monogram__color-field">Color final<input type="color" value={project.background.gradientEnd} onChange={(event) => setProject((current) => normalizeMonogramProject({ ...current, background: { ...current.background, gradientEnd: event.target.value } }))} /></label>
              <label className="monogram__field monogram__rotation">Ángulo del degradado <span>{project.background.gradientAngle}°</span>
                <input type="range" min="0" max="360" step="1" value={project.background.gradientAngle} onChange={(event) => setProject((current) => normalizeMonogramProject({ ...current, background: { ...current.background, gradientAngle: Number(event.target.value) } }))} />
              </label>
            </div>}
            <p className="monogram__font-note">Los acabados y fondos sirven para presentar el diseño; no cambian el SVG ni equivalen a un material certificado.</p>
          </section>

          <section className="monogram__card">
            <div className="monogram__section-heading"><div><span className="monogram__eyebrow">05 · MEDIDAS DEL DISEÑO</span><h2>Área de trabajo</h2></div></div>
            <label className="monogram__field">Nombre del diseño<input type="text" maxLength={MONOGRAM_LIMITS.maxTitleLength} value={project.title} onChange={(event) => setProject((current) => normalizeMonogramProject({ ...current, title: event.target.value }))} /></label>
            <label className="monogram__field">Unidad de visualización
              <select value={displayUnit} onChange={(event) => saveDisplayUnit(event.target.value === 'cm' ? 'cm' : 'mm')} aria-label="Unidad de visualización de medidas">
                <option value="mm">Milímetros (mm)</option>
                <option value="cm">Centímetros (cm)</option>
              </select>
            </label>
            <div className="monogram__field-grid">
              <MonogramNumberField label={`Ancho (${displayUnit})`} min={displayLength(MONOGRAM_LIMITS.minArtboard)} max={displayLength(MONOGRAM_LIMITS.maxArtboard)} step={displayStep} value={displayLength(project.width)} onCommit={(width) => setProject((current) => normalizeMonogramProject({ ...current, width: monogramUnitToMillimeters(width, displayUnit) }))} />
              <MonogramNumberField label={`Alto (${displayUnit})`} min={displayLength(MONOGRAM_LIMITS.minArtboard)} max={displayLength(MONOGRAM_LIMITS.maxArtboard)} step={displayStep} value={displayLength(project.height)} onCommit={(height) => setProject((current) => normalizeMonogramProject({ ...current, height: monogramUnitToMillimeters(height, displayUnit) }))} />
            </div>
            <MonogramNumberField label={`Profundidad predeterminada (${displayUnit})`} min={displayLength(MONOGRAM_LIMITS.minDepth)} max={displayLength(MONOGRAM_LIMITS.maxDepth)} step={displayStep} value={displayLength(project.thickness)} onCommit={(thickness) => setProject((current) => normalizeMonogramProject({ ...current, thickness: monogramUnitToMillimeters(thickness, displayUnit) }))} />
            <button type="button" className="button button-quiet monogram__reset" onClick={reset}><RotateCcw size={14} /> Reiniciar diseño</button>
          </section>
        </aside>

        <div className="monogram__canvas-column">
          <section className="monogram__card monogram__preview-card" aria-label="Vista previa del monograma">
            <div className="monogram__preview-toolbar">
              <div className="monogram__view-tabs" role="group" aria-label="Vista del diseño">
                <button type="button" aria-pressed={view === '2d'} onClick={() => setView('2d')}>2D · vector</button>
                <button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')}>3D · extrusión</button>
              </div>
              <span className="monogram__dimensions"><Layers3 size={14} /> {formatMonogramLength(project.width, displayUnit)} × {formatMonogramLength(project.height, displayUnit)} × {formatMonogramLength(visibleDepth, displayUnit)} {displayUnit}</span>
            </div>
            {view === '3d' && <div className="monogram__model-toolbar">
              <div className="monogram__model-actions">
                <button type="button" className="monogram__motion-toggle" aria-pressed={autoRotate} onClick={() => setAutoRotate((current) => !current)}><RotateCcw size={14} /> {autoRotate ? 'Detener giro' : 'Auto giro'}</button>
                <button type="button" className="monogram__motion-toggle" onClick={() => setCameraResetKey((current) => current + 1)}>Restablecer cámara</button>
              </div>
              <label className="monogram__field monogram__explode-control">Separación de capas <span>{explodedGap.toFixed(1)} mm</span>
                <input type="range" min="0" max="18" step="0.5" value={explodedGap} onChange={(event) => setExplodedGap(Number(event.target.value))} aria-label="Separación visual entre capas 3D" />
              </label>
              <span className="monogram__motion-note">El giro respeta la preferencia de movimiento reducido del dispositivo.</span>
            </div>}
            <div className={`monogram__stage is-${project.background.preset}${view === '2d' ? ' is-flat' : ''}`} style={gradientStyle}>
              {view === '2d'
                ? <Monogram2DStage width={project.width} height={project.height} displayUnit={displayUnit} outlines={outlines} selectedId={selectedId} onSelect={setSelectedId} onMove={moveLayer} />
                : <Suspense fallback={<div className="monogram__viewer-loading" role="status">Preparando la vista 3D…</div>}><Monogram3DViewer width={project.width} height={project.height} outlines={outlines} finish={project.finish} bevel={project.bevel} autoRotate={autoRotate} explodedGap={explodedGap} resetKey={cameraResetKey} /></Suspense>}
            </div>
            <div className="monogram__preview-footer"><span>Geometría y exportación en mm · pantalla en {displayUnit}</span><span>Flechas mueven {displayUnit === 'cm' ? '0,1 cm' : '1 mm'}; Shift + flecha, {displayUnit === 'cm' ? '1 cm' : '10 mm'}</span></div>
          </section>

          <section className="monogram__card monogram__export-card">
            <div className="monogram__export-heading"><div><span className="monogram__eyebrow">SALIDA ACTUAL</span><h2>SVG y archivo editable</h2></div><span className="monogram__ready-badge">Contornos vectoriales</span></div>
            <div className="monogram__export-actions">
              <button type="button" className="button button-dark" onClick={exportSvg} disabled={!exportReady}><ArrowDownToLine size={15} /> Exportar SVG</button>
              <button type="button" className="button button-outline" onClick={saveJson}><ArrowDownToLine size={15} /> Guardar proyecto JSON</button>
            </div>
            <div className="monogram__manufacturing-note" role="note">
              <strong>Antes de cortar o imprimir</strong>
              <p>{MONOGRAM_GEOMETRY_LIMITATION} El SVG no incluye unión de contornos, puentes para islas, compensación de kerf ni validación de fabricación. La vista 3D apila las capas en Z como previsualización; todavía no exporta STL/3MF.</p>
            </div>
            {outsideWarnings.length > 0 && <div className="monogram__validation-warning" role="status"><strong>Revisa el área de trabajo</strong>{outsideWarnings.map((warning) => <p key={`${warning.elementId}-outside`}>{warning.message}</p>)}</div>}
            {missingCharacters.length > 0 && <div className="monogram__validation-warning" role="status"><strong>Caracteres sin glifo en DM Sans</strong><p>{missingCharacters.join(' ')}. Cambia la fuente o el texto antes de exportar.</p></div>}
            {usedSimpleShaping && <div className="monogram__validation-warning" role="status"><strong>Modo tipográfico simplificado</strong><p>La fuente contiene reglas que el conversor no admite. Se generaron contornos glifo a glifo con kerning, sin sustituciones contextuales ni ligaduras automáticas. Revisa el resultado antes de fabricar.</p></div>}
            {outlineErrors.length > 0 && <div className="monogram__validation-error" role="alert"><strong>No se pudieron generar algunos contornos</strong>{outlineErrors.map((error) => <p key={error}>{error}</p>)}</div>}
            {validation.errors.map((error) => <p className="monogram__validation-error" key={error}>{error}</p>)}
            {fontError && hasTextContent && <p className="monogram__validation-error" role="alert">{fontError}</p>}
            <p className="monogram__status" role="status" aria-live="polite">{status}</p>
          </section>
        </div>
      </div>
    </section>
  );
}
