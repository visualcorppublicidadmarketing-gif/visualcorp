import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeftRight, Box, Circle, Copy, Eye, EyeOff, FileUp, FolderOpen, Redo2, RotateCcw, Save, Trash2, Undo2, X } from 'lucide-react';
import * as THREE from 'three';
import { restoreParametricSolidsProject, serializeParametricSolidsProject } from './parametricSolidProjectFile';
import {
  createEmptyParametricSolidsDocument,
  createParametricPrimitive,
  createParametricSolidsSample,
  normalizeParametricSolidsDocument,
  PARAMETRIC_SOLIDS_MAX_PRIMITIVES,
  primitiveLabel,
  primitiveHalfExtents,
} from './parametricSolidModel';
import type { ParametricPrimitive, ParametricSolidsDocument, PrimitiveKind, PrimitiveOperation, PrimitiveTransform } from './parametricSolidModel';
import { ParametricSolids3DViewer } from './ParametricSolids3DViewer';
import './parametric-solids.css';

const draftKey = 'visualcorp.parametric-solids.draft.v1';
const primitiveKinds: PrimitiveKind[] = ['box', 'cylinder', 'cone', 'sphere', 'prism', 'pyramid'];
const geometryFields: Record<PrimitiveKind, Array<{ key: string; label: string; min: number; max: number; step: number }>> = {
  box: [
    { key: 'widthMm', label: 'Ancho', min: 0.1, max: 5000, step: 0.1 },
    { key: 'heightMm', label: 'Alto', min: 0.1, max: 5000, step: 0.1 },
    { key: 'depthMm', label: 'Fondo', min: 0.1, max: 5000, step: 0.1 },
  ],
  cylinder: [
    { key: 'bottomRadiusMm', label: 'Radio inferior', min: 0.1, max: 2500, step: 0.1 },
    { key: 'topRadiusMm', label: 'Radio superior', min: 0.1, max: 2500, step: 0.1 },
    { key: 'heightMm', label: 'Alto', min: 0.1, max: 5000, step: 0.1 },
    { key: 'sides', label: 'Lados', min: 8, max: 64, step: 1 },
  ],
  cone: [
    { key: 'radiusMm', label: 'Radio', min: 0.1, max: 2500, step: 0.1 },
    { key: 'heightMm', label: 'Alto', min: 0.1, max: 5000, step: 0.1 },
    { key: 'sides', label: 'Lados', min: 8, max: 64, step: 1 },
  ],
  sphere: [{ key: 'radiusMm', label: 'Radio', min: 0.1, max: 2500, step: 0.1 }],
  prism: [
    { key: 'radiusMm', label: 'Radio circunscrito', min: 0.1, max: 2500, step: 0.1 },
    { key: 'heightMm', label: 'Alto', min: 0.1, max: 5000, step: 0.1 },
    { key: 'sides', label: 'Lados', min: 3, max: 12, step: 1 },
  ],
  pyramid: [
    { key: 'radiusMm', label: 'Radio circunscrito', min: 0.1, max: 2500, step: 0.1 },
    { key: 'heightMm', label: 'Alto', min: 0.1, max: 5000, step: 0.1 },
    { key: 'sides', label: 'Lados', min: 3, max: 12, step: 1 },
  ],
};
const transformFields: Array<{ key: keyof PrimitiveTransform; label: string; step: number; min: number; max: number }> = [
  { key: 'xMm', label: 'X', step: 0.1, min: -10000, max: 10000 },
  { key: 'yMm', label: 'Y', step: 0.1, min: -10000, max: 10000 },
  { key: 'zMm', label: 'Z', step: 0.1, min: -10000, max: 10000 },
  { key: 'rotationXDeg', label: 'Rotación X', step: 0.1, min: -3600, max: 3600 },
  { key: 'rotationYDeg', label: 'Rotación Y', step: 0.1, min: -3600, max: 3600 },
  { key: 'rotationZDeg', label: 'Rotación Z', step: 0.1, min: -3600, max: 3600 },
];

function readDraft(): ParametricSolidsDocument {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(draftKey);
      if (stored) return normalizeParametricSolidsDocument(JSON.parse(stored));
    } catch {
      // A damaged browser draft must not prevent the editor from opening.
    }
  }
  return createParametricSolidsSample();
}

function downloadFile(filename: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function NumericDraft({ label, value, min, max, step, suffix, onCommit }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (!draft.trim() || !Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const bounded = Math.min(max, Math.max(min, parsed));
    onCommit(step >= 1 ? Math.round(bounded) : bounded);
    setDraft(String(step >= 1 ? Math.round(bounded) : bounded));
  };
  return (
    <label className="parametric-solids__field">
      <span>{label}</span>
      <span className="parametric-solids__input-wrap">
        <input type="number" inputMode="decimal" value={draft} min={min} max={max} step={step}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.currentTarget.blur(); }
            if (event.key === 'Escape') { setDraft(String(value)); event.currentTarget.blur(); }
          }} />
        {suffix && <small>{suffix}</small>}
      </span>
    </label>
  );
}

function copyPrimitive(primitive: ParametricPrimitive, count: number) {
  const clone = structuredClone(primitive);
  clone.id = `piece-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`}`;
  clone.name = `${primitive.name} copia`;
  clone.transform.xMm += Math.max(8, primitiveHalfExtents(primitive).x * 0.45);
  return normalizeParametricSolidsDocument({ ...createEmptyParametricSolidsDocument(), primitives: [clone] }).primitives[0] ?? createParametricPrimitive(primitive.type, primitive.operation, count);
}

export function ParametricSolidsStudio() {
  const [document, setDocument] = useState(readDraft);
  const [history, setHistory] = useState<ParametricSolidsDocument[]>(() => [document]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const selected = document.primitives.find((item) => item.id === selectedId) ?? null;
  const [placement, setPlacement] = useState<{ type: PrimitiveKind; operation: PrimitiveOperation } | null>(null);
  const [notice, setNotice] = useState('');
  const [fileError, setFileError] = useState('');
  const [titleDraft, setTitleDraft] = useState(document.title);
  const [nameDraft, setNameDraft] = useState(selected?.name ?? '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  useEffect(() => {
    try { window.localStorage.setItem(draftKey, JSON.stringify(document)); }
    catch { setNotice('El navegador no pudo guardar el borrador local. Descarga el proyecto para conservarlo.'); }
  }, [document]);

  useEffect(() => {
    if (!document.primitives.some((item) => item.id === selectedId)) setSelectedId(document.primitives.at(-1)?.id ?? '');
  }, [document.primitives, selectedId]);

  useEffect(() => { setNameDraft(selected?.name ?? ''); }, [selected?.id, selected?.name]);
  useEffect(() => { setTitleDraft(document.title); }, [document.title]);

  const pushDocument = (next: ParametricSolidsDocument) => {
    const normalized = normalizeParametricSolidsDocument(next);
    if (JSON.stringify(normalized) === JSON.stringify(document)) return;
    const updatedHistory = [...history.slice(0, historyIndex + 1), normalized].slice(-80);
    setHistory(updatedHistory);
    setHistoryIndex(updatedHistory.length - 1);
    setDocument(normalized);
    setNotice('');
    setFileError('');
  };

  const undo = () => {
    if (!canUndo) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setDocument(history[nextIndex]);
    setNotice('');
  };
  const redo = () => {
    if (!canRedo) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setDocument(history[nextIndex]);
    setNotice('');
  };

  const patchPrimitive = (id: string, update: (item: ParametricPrimitive) => ParametricPrimitive) => {
    const next = {
      ...document,
      primitives: document.primitives.map((item) => item.id === id ? update(structuredClone(item)) : item),
    };
    pushDocument(next);
  };

  const addAtOrigin = (type: PrimitiveKind, operation: PrimitiveOperation) => {
    if (document.primitives.length >= PARAMETRIC_SOLIDS_MAX_PRIMITIVES) {
      setNotice(`El modelo admite hasta ${PARAMETRIC_SOLIDS_MAX_PRIMITIVES} piezas.`);
      return;
    }
    const primitive = createParametricPrimitive(type, operation, document.primitives.length, document.primitives.length);
    const solidPieces = document.primitives.filter((item) => item.visible && item.operation === 'solid');
    if (operation === 'hole' && solidPieces.length) {
      const limits = solidPieces.reduce((current, item) => {
        const half = primitiveHalfExtents(item);
        return {
          minX: Math.min(current.minX, item.transform.xMm - half.x), maxX: Math.max(current.maxX, item.transform.xMm + half.x),
          minY: Math.min(current.minY, item.transform.yMm - half.y), maxY: Math.max(current.maxY, item.transform.yMm + half.y),
          minZ: Math.min(current.minZ, item.transform.zMm - half.z), maxZ: Math.max(current.maxZ, item.transform.zMm + half.z),
        };
      }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
      primitive.transform.xMm = (limits.minX + limits.maxX) / 2;
      primitive.transform.yMm = (limits.minY + limits.maxY) / 2;
      primitive.transform.zMm = (limits.minZ + limits.maxZ) / 2;
      if (primitive.type !== 'sphere') primitive.geometry.heightMm = Math.min(5000, Math.max(48, limits.maxY - limits.minY + 8));
    } else if (operation === 'solid') {
      const size = Math.max(...solidPieces.map((item) => primitiveHalfExtents(item).x), 0);
      if (size > 0) primitive.transform.xMm = size + primitiveHalfExtents(primitive).x + 4;
    }
    pushDocument({ ...document, primitives: [...document.primitives, primitive] });
    setSelectedId(primitive.id);
    setPlacement(null);
    setNotice(`${primitiveLabel(type)} añadida al origen. Ajusta su posición en el inspector.`);
  };

  const placeOnFace = ({ type, operation, point, normal }: { type: PrimitiveKind; operation: PrimitiveOperation; point: [number, number, number]; normal: [number, number, number] }) => {
    if (document.primitives.length >= PARAMETRIC_SOLIDS_MAX_PRIMITIVES) return;
    const primitive = createParametricPrimitive(type, operation, document.primitives.length, document.primitives.length);
    const direction = new THREE.Vector3(...normal).normalize();
    if (operation === 'hole' && primitive.type !== 'sphere') {
      const limits = document.primitives.filter((item) => item.visible && item.operation === 'solid').reduce((current, item) => {
        const half = primitiveHalfExtents(item);
        const { xMm, yMm, zMm } = item.transform;
        return {
          minX: Math.min(current.minX, xMm - half.x), maxX: Math.max(current.maxX, xMm + half.x),
          minY: Math.min(current.minY, yMm - half.y), maxY: Math.max(current.maxY, yMm + half.y),
          minZ: Math.min(current.minZ, zMm - half.z), maxZ: Math.max(current.maxZ, zMm + half.z),
        };
      }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
      const projectedSpan = Math.abs(direction.x) * (limits.maxX - limits.minX)
        + Math.abs(direction.y) * (limits.maxY - limits.minY)
        + Math.abs(direction.z) * (limits.maxZ - limits.minZ);
      primitive.geometry.heightMm = Math.min(5000, Math.max(48, projectedSpan + 8));
    }
    const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    const euler = new THREE.Euler().setFromQuaternion(orientation, 'XYZ');
    primitive.transform.rotationXDeg = THREE.MathUtils.radToDeg(euler.x);
    primitive.transform.rotationYDeg = THREE.MathUtils.radToDeg(euler.y);
    primitive.transform.rotationZDeg = THREE.MathUtils.radToDeg(euler.z);
    const halfHeight = primitive.type === 'sphere' ? primitive.geometry.radiusMm : primitive.geometry.heightMm / 2;
    const distance = operation === 'solid' ? Math.max(0, halfHeight - 0.5) : Math.max(0.3, halfHeight - 0.25);
    const sign = operation === 'solid' ? 1 : -1;
    primitive.transform.xMm = point[0] + direction.x * distance * sign;
    primitive.transform.yMm = point[1] + direction.y * distance * sign;
    primitive.transform.zMm = point[2] + direction.z * distance * sign;
    pushDocument({ ...document, primitives: [...document.primitives, primitive] });
    setSelectedId(primitive.id);
    setPlacement(null);
    setNotice(`${primitiveLabel(type)} colocada sobre la cara. Puedes ajustar cualquier medida y coordenada.`);
  };

  const handleOpenFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const next = restoreParametricSolidsProject(parsed);
      setHistory([next]);
      setHistoryIndex(0);
      setDocument(next);
      setSelectedId(next.primitives[0]?.id ?? '');
      setPlacement(null);
      setNotice(`Proyecto “${next.title}” abierto.`);
      setFileError('');
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'No se pudo abrir el archivo.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const saveFile = async () => {
    try {
      const contents = await serializeParametricSolidsProject(document);
      const filename = `${document.title.trim().toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-').replace(/^-|-$/g, '') || 'modelo-parametrico'}.vcparam.json`;
      downloadFile(filename, contents);
      setNotice('Proyecto paramétrico descargado. También se conserva un borrador en este navegador.');
      setFileError('');
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'No se pudo guardar el proyecto.');
    }
  };

  const duplicateSelected = () => {
    if (!selected || document.primitives.length >= PARAMETRIC_SOLIDS_MAX_PRIMITIVES) return;
    const duplicate = copyPrimitive(selected, document.primitives.length + 1);
    pushDocument({ ...document, primitives: [...document.primitives, duplicate] });
    setSelectedId(duplicate.id);
  };

  const deleteSelected = () => {
    if (!selected) return;
    pushDocument({ ...document, primitives: document.primitives.filter((item) => item.id !== selected.id) });
    setSelectedId('');
  };

  const totalVisible = useMemo(() => document.primitives.filter((item) => item.visible).length, [document.primitives]);

  return (
    <section className="parametric-solids" aria-label="Editor paramétrico de sólidos">
      <header className="parametric-solids__topbar">
        <div className="parametric-solids__project-name">
          <label htmlFor="parametric-project-title">Nombre del modelo</label>
          <input id="parametric-project-title" value={titleDraft} maxLength={100}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => pushDocument({ ...document, title: titleDraft.trim() || 'Modelo paramétrico' })} />
          <span>{document.primitives.length}/{PARAMETRIC_SOLIDS_MAX_PRIMITIVES} piezas · mm</span>
        </div>
        <div className="parametric-solids__actions">
          <button type="button" className="button button-outline" onClick={undo} disabled={!canUndo} title="Deshacer"><Undo2 size={15} /> <span>Deshacer</span></button>
          <button type="button" className="button button-outline" onClick={redo} disabled={!canRedo} title="Rehacer"><Redo2 size={15} /> <span>Rehacer</span></button>
          <button type="button" className="button button-outline" onClick={() => fileInputRef.current?.click()} aria-label="Abrir proyecto paramétrico" title="Abrir proyecto"><FolderOpen size={15} /> <span>Abrir</span></button>
          <input ref={fileInputRef} className="parametric-solids__file-input" type="file" accept=".json,.vcparam.json,application/json" onChange={(event) => void handleOpenFile(event.target.files?.[0])} />
          <button type="button" className="button button-dark" onClick={() => void saveFile()} aria-label="Guardar proyecto paramétrico" title="Guardar proyecto"><Save size={15} /> <span>Guardar proyecto</span></button>
        </div>
      </header>

      <div className="parametric-solids__modebar" aria-label="Crear pieza" role="toolbar">
        <div className="parametric-solids__mode-select">
          <button type="button" className={!placement || placement.operation === 'solid' ? 'is-active' : ''} onClick={() => setPlacement({ type: placement?.type ?? 'box', operation: 'solid' })}><Box size={15} /> Sólido</button>
          <button type="button" className={placement?.operation === 'hole' ? 'is-active is-hole' : ''} onClick={() => setPlacement({ type: placement?.type ?? 'cylinder', operation: 'hole' })}><Circle size={15} /> Vaciado</button>
        </div>
        <span className="parametric-solids__mode-divider" aria-hidden="true" />
        <div className="parametric-solids__shape-buttons">
          {primitiveKinds.map((kind) => (
            <button type="button" key={kind} disabled={document.primitives.length >= PARAMETRIC_SOLIDS_MAX_PRIMITIVES}
              className={placement?.type === kind ? 'is-selected' : ''}
              onClick={() => setPlacement({ type: kind, operation: placement?.operation ?? 'solid' })}>
              <span>{primitiveLabel(kind)}</span>
            </button>
          ))}
        </div>
        <button type="button" className="parametric-solids__origin-add" onClick={() => addAtOrigin(placement?.type ?? 'box', placement?.operation ?? 'solid')} disabled={document.primitives.length >= PARAMETRIC_SOLIDS_MAX_PRIMITIVES}>
          <ArrowDownToLine size={14} /> Añadir en origen
        </button>
        {placement && <button type="button" className="parametric-solids__cancel" onClick={() => setPlacement(null)}><X size={14} /> Cancelar</button>}
      </div>

      {(notice || fileError) && <div className={`parametric-solids__notice${fileError ? ' is-error' : ''}`} role={fileError ? 'alert' : 'status'}>{fileError || notice}</div>}

      <div className="parametric-solids__workspace">
        <aside className="parametric-solids__panel parametric-solids__tree" aria-label="Piezas del modelo">
          <div className="parametric-solids__panel-heading"><div><span>ESTRUCTURA</span><h2>Piezas</h2></div><b>{totalVisible} visibles</b></div>
          {document.primitives.length === 0 ? <p className="parametric-solids__empty">Selecciona una forma y colócala sobre el plano o añade una pieza en el origen.</p> : (
            <ul className="parametric-solids__piece-list">
              {document.primitives.map((item) => (
                <li key={item.id} className={item.id === selectedId ? 'is-selected' : ''}>
                  <button type="button" className="parametric-solids__piece-select" onClick={() => setSelectedId(item.id)}>
                    <i style={{ backgroundColor: item.color }} />
                    <span><strong>{item.name}</strong><small>{item.operation === 'hole' ? 'Vaciado' : 'Sólido'} · {primitiveLabel(item.type)}</small></span>
                  </button>
                  <button type="button" className="parametric-solids__piece-visibility" title={item.visible ? 'Ocultar pieza' : 'Mostrar pieza'} aria-label={item.visible ? `Ocultar ${item.name}` : `Mostrar ${item.name}`}
                    onClick={() => patchPrimitive(item.id, (current) => ({ ...current, visible: !current.visible }))}>{item.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="parametric-solids__sample" onClick={() => {
            const sample = createParametricSolidsSample();
            pushDocument(sample);
            setSelectedId(sample.primitives[0]?.id ?? '');
            setPlacement(null);
          }}><RotateCcw size={14} /> Cargar figura de ejemplo</button>
        </aside>

        <main className="parametric-solids__canvas-panel" aria-label="Modelo 3D">
          <div className="parametric-solids__canvas-heading"><div><span>VISTA DE TRABAJO</span><strong>{document.title || 'Modelo sin título'}</strong></div><span>Órbita · selección · colocación</span></div>
          <ParametricSolids3DViewer document={document} selectedPrimitiveId={selectedId} pendingPlacement={placement}
            onSelect={setSelectedId} onPlace={placeOnFace} onCancelPlacement={() => setPlacement(null)} />
          <p className="parametric-solids__precision-note">Las piezas se guardan como parámetros originales. La unión y los vaciados se calculan solo para esta vista previa.</p>
        </main>

        <aside className="parametric-solids__panel parametric-solids__inspector" aria-label="Propiedades de pieza">
          <div className="parametric-solids__panel-heading"><div><span>INSPECTOR</span><h2>{selected ? selected.name : 'Sin selección'}</h2></div></div>
          {!selected ? <p className="parametric-solids__empty">Selecciona una pieza en la lista o en la vista 3D para editar sus parámetros.</p> : (
            <div className="parametric-solids__inspector-content">
              <label className="parametric-solids__field"><span>Nombre</span><input type="text" value={nameDraft} maxLength={80} onChange={(event) => setNameDraft(event.target.value)} onBlur={() => patchPrimitive(selected.id, (item) => ({ ...item, name: nameDraft.trim() || primitiveLabel(item.type) }))} /></label>
              <label className="parametric-solids__field"><span>Operación</span><select value={selected.operation} onChange={(event) => patchPrimitive(selected.id, (item) => ({ ...item, operation: event.target.value as PrimitiveOperation }))}><option value="solid">Sólido · añade volumen</option><option value="hole">Vaciado · resta volumen</option></select></label>

              <section className="parametric-solids__field-group"><h3>Forma · {primitiveLabel(selected.type)}</h3><div className="parametric-solids__field-grid">
                {geometryFields[selected.type].map((field) => {
                  const geometry = selected.geometry as unknown as Record<string, number>;
                  return <NumericDraft key={field.key} label={field.label} value={geometry[field.key]} min={field.min} max={field.max} step={field.step} suffix={field.key.endsWith('Mm') ? 'mm' : undefined}
                    onCommit={(value) => patchPrimitive(selected.id, (item) => ({ ...item, geometry: { ...item.geometry, [field.key]: value } } as ParametricPrimitive))} />;
                })}
              </div></section>

              <section className="parametric-solids__field-group"><h3>Posición y giro</h3><div className="parametric-solids__field-grid parametric-solids__field-grid--transform">
                {transformFields.map((field) => <NumericDraft key={field.key} label={field.label} value={selected.transform[field.key]} min={field.min} max={field.max} step={field.step} suffix={field.key.endsWith('Mm') ? 'mm' : '°'}
                  onCommit={(value) => patchPrimitive(selected.id, (item) => ({ ...item, transform: { ...item.transform, [field.key]: value } }))} />)}
              </div></section>

              <label className="parametric-solids__field parametric-solids__color-field"><span>Color de referencia</span><input type="color" value={selected.color} onChange={(event) => patchPrimitive(selected.id, (item) => ({ ...item, color: event.target.value }))} /></label>
              <div className="parametric-solids__piece-actions">
                <button type="button" className="button button-outline" onClick={duplicateSelected} disabled={document.primitives.length >= PARAMETRIC_SOLIDS_MAX_PRIMITIVES}><Copy size={14} /> Duplicar</button>
                <button type="button" className="button button-outline danger" onClick={deleteSelected}><Trash2 size={14} /> Eliminar</button>
              </div>
            </div>
          )}
        </aside>
      </div>
      <div className="parametric-solids__footnote"><ArrowLeftRight size={14} /><span>Los modelos permanecen editables en archivos <code>.vcparam.json</code>. La vista CSG es experimental; este editor no genera archivos CAD certificados ni planos de fabricación.</span><FileUp size={14} /></div>
    </section>
  );
}

