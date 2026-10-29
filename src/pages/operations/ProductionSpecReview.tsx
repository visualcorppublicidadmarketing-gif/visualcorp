import { useEffect, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import './production-spec-review.css';

type Props = {
  jobId: string;
  version: number;
  fromVersion: number | null;
  current: Record<string, unknown>;
  canResolve: boolean;
  lastRequest: string | null;
  onDecided: (decision: 'accepted' | 'changes_requested') => void;
};
type Version = { version: number; specifications: Record<string, unknown>; note: string; created_at: string };

const labels: Record<string, string> = {
  description: 'Descripción', notes: 'Indicaciones', width_cm: 'Ancho (cm)', height_cm: 'Alto (cm)',
  quantity: 'Cantidad', material: 'Material', finish: 'Acabado', color: 'Color',
  installation_address: 'Lugar de instalación', installation_required: 'Instalación',
  measurement_required: 'Visita para medir', reference: 'Referencia', site_visit_notes: 'Observaciones de visita',
};
const readable = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return 'Sin indicar';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (Array.isArray(value)) return value.map(readable).join(' · ');
  if (typeof value === 'object') return Object.entries(value).map(([key, part]) => `${labels[key] || key}: ${readable(part)}`).join(' · ');
  return String(value);
};

export function ProductionSpecReview({ jobId, version, fromVersion, current, canResolve, lastRequest, onDecided }: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!supabase || !fromVersion) { setLoading(false); setLoadError('Falta la versión inicial para revisar el cambio.'); return; }
    let active = true;
    setLoading(true); setLoadError(''); setVersions([]);
    void supabase.from('production_job_spec_versions')
      .select('version,specifications,note,created_at')
      .eq('job_id', jobId).gte('version', fromVersion).lte('version', version)
      .order('version', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        const rows = (data || []) as Version[];
        if (error || rows[0]?.version !== fromVersion || rows.at(-1)?.version !== version) {
          setLoadError('No pudimos cargar todas las versiones de la ficha. Actualiza la orden antes de decidir.');
        } else setVersions(rows);
        setLoading(false);
      });
    return () => { active = false; };
  }, [jobId, fromVersion, version]);

  const initial = versions[0]?.specifications || {};
  const changes = versions.length > 1
    ? [...new Set([...Object.keys(initial), ...Object.keys(current)])]
      .filter((key) => JSON.stringify(initial[key]) !== JSON.stringify(current[key]))
      .map((key) => ({ key, before: readable(initial[key]), after: readable(current[key]) }))
    : [];
  const notes = versions.slice(1).filter((entry) => entry.note.trim());

  const resolve = async (decision: 'accepted' | 'changes_requested') => {
    if (!supabase || busy || !canResolve || loading || loadError || note.trim().length < 3) return;
    setBusy(true); setActionError('');
    try {
      const { error } = await supabase.rpc('resolve_production_job_review', {
        p_job_id: jobId, p_expected_version: version, p_decision: decision, p_note: note.trim(),
      });
      if (error) throw error;
      setNote('');
      onDecided(decision);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos registrar la decisión.');
    } finally { setBusy(false); }
  };

  return <section className="pj-spec-review" aria-label="Revisión del cambio de especificaciones">
    <div className="pj-spec-review-heading"><AlertTriangle size={19} aria-hidden="true"/><div><h4>Cambio técnico por revisar</h4><p>La producción espera una decisión de coordinación. Revisa el cambio acumulado desde la versión {fromVersion ?? 'anterior'}.</p></div></div>
    {lastRequest && <p className="pj-spec-review-request"><b>Coordinación pidió corregir esta versión:</b> {lastRequest}</p>}
    {loading && <p className="pj-note" role="status">Cargando versiones…</p>}
    {loadError && <p className="pj-error" role="alert">{loadError}</p>}
    {!loading && !loadError && <>
      {changes.length ? <dl className="pj-spec-diff">{changes.map((change) => <div key={change.key}><dt>{labels[change.key] || change.key.replaceAll('_', ' ')}</dt><dd><span>Antes</span>{change.before}</dd><dd><span>Ahora</span>{change.after}</dd></div>)}</dl> : <p className="pj-note">La ficha volvió a los valores iniciales. Confirma si el trabajo puede continuar antes de aceptarla.</p>}
      {notes.length > 0 && <div className="pj-spec-review-notes"><b>Motivos registrados</b>{notes.map((entry) => <p key={entry.version}><span>v{entry.version}</span> {entry.note}</p>)}</div>}
      {canResolve ? <div className="pj-spec-review-decision"><label>Decisión para el equipo<textarea maxLength={1000} rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explica si se puede continuar o qué debe corregir Asesoría"/></label><div className="pj-spec-review-actions"><button className="button button-dark" type="button" disabled={busy || note.trim().length < 3} onClick={() => void resolve('accepted')}><Check size={14}/> Aceptar y reanudar</button><button className="button button-outline" type="button" disabled={busy || note.trim().length < 3} onClick={() => void resolve('changes_requested')}>Pedir corrección</button></div><small>Aceptar libera solo las etapas retenidas por esta revisión. Pedir corrección mantiene el trabajo detenido y registra la instrucción para Asesoría.</small></div> : <p className="pj-note">Coordinación debe revisar el cambio para que el trabajo avance.</p>}
    </>}
    {actionError && <p className="pj-error" role="alert">{actionError}</p>}
  </section>;
}
