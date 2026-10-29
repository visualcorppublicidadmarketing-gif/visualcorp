import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, CheckCircle2, PenLine, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import './advisor-jobs.css';

const PAGE_SIZE = 30;
const timeZone = 'America/Guayaquil';
const dayKey = (value: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const dayLabel = (value?: string | null) => value ? new Intl.DateTimeFormat('es-EC', { timeZone, dateStyle: 'medium' }).format(new Date(value)) : 'Por acordar';
const statusLabels: Record<string, string> = {
  waiting: 'En espera', queued: 'En cola', ready: 'Lista para iniciar', in_progress: 'En proceso',
  blocked: 'Necesita atención', open: 'En seguimiento', needs_review: 'Revisión necesaria',
  completed: 'Completado', cancelled: 'Cancelado',
};
const areaSlugs: Record<string, string> = {
  ASE: 'asesoria', ASESORIA: 'asesoria', DIS: 'diseno', DES: 'diseno', DISENO: 'diseno',
  IMP: 'impresion', SUB: 'sublimacion', LAS: 'laser', TAL: 'taller', NEO: 'taller',
};

type Job = {
  id: string; organization_id: string; branch_id: string; sale_id: string; sale_line_id: string;
  advisor_id: string; workflow_code: string | null; sale_code: string | null; customer_name: string | null;
  customer_phone: string | null; title: string; specifications: Record<string, unknown> | null;
  spec_version: number; status: string; due_at: string | null; created_at: string; updated_at: string;
};
type Step = {
  id: string; job_id: string; step_key: string; step_order: number; title: string; status: string;
  area_id: string | null; assigned_to: string | null; due_at: string | null;
  areas?: { name?: string; code?: string } | null;
};
type Props = { advisorId: string; advisorName?: string; weekStart: string; weekEnd: string; refreshKey?: number; };

function textValue(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function displayValue(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? String(value) : textValue(value); }
function isClosed(status: string) { return status === 'completed' || status === 'cancelled'; }
function currentStep(steps: Step[]) {
  return steps.find(step => step.status === 'in_progress') || steps.find(step => step.status === 'blocked') ||
    steps.find(step => step.status === 'ready') || steps.find(step => step.status === 'waiting') || steps.at(-1);
}

export function AdvisorJobsSection({ advisorId, advisorName, weekStart, weekEnd, refreshKey = 0 }: Props) {
  const { organizationId, user, hasPermission } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stepsByJob, setStepsByJob] = useState<Record<string, Step[]>>({});
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<'active' | 'due' | 'all'>('active');
  const [editingId, setEditingId] = useState('');
  const [description, setDescription] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [savingId, setSavingId] = useState('');
  const requestId = useRef(0);
  const canOpenArea = hasPermission('workshop', 'view');

  const loadJobs = useCallback(async (offset = 0) => {
    if (!supabase || !organizationId || !advisorId) return;
    const activeRequest = ++requestId.current;
    if (offset === 0) { setLoading(true); setJobs([]); setStepsByJob({}); }
    else setLoadingMore(true);
    setError('');
    try {
      const { data: page, error: jobsError } = await supabase.from('production_jobs')
        .select('id,organization_id,branch_id,sale_id,sale_line_id,advisor_id,workflow_code,sale_code,customer_name,customer_phone,title,specifications,spec_version,status,due_at,created_at,updated_at')
        .eq('organization_id', organizationId).eq('advisor_id', advisorId)
        .order('updated_at', { ascending: false }).order('id', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (jobsError) throw jobsError;
      if (activeRequest !== requestId.current) return;
      const nextJobs = (page || []) as Job[];
      let nextSteps: Step[] = [];
      if (nextJobs.length) {
        const { data, error: stepsError } = await supabase.from('production_job_steps')
          .select('id,job_id,step_key,step_order,title,status,area_id,assigned_to,due_at,areas(name,code)')
          .eq('organization_id', organizationId).in('job_id', nextJobs.map(job => job.id))
          .order('step_order', { ascending: true });
        if (stepsError) throw stepsError;
        if (activeRequest !== requestId.current) return;
        nextSteps = (data || []) as unknown as Step[];
      }
      const grouped: Record<string, Step[]> = {};
      nextSteps.forEach(step => { (grouped[step.job_id] ||= []).push(step); });
      setJobs(current => offset === 0 ? nextJobs : [...current, ...nextJobs.filter(job => !current.some(existing => existing.id === job.id))]);
      setStepsByJob(current => offset === 0 ? grouped : { ...current, ...grouped });
      setHasMore(nextJobs.length === PAGE_SIZE);
    } catch (cause) {
      if (activeRequest === requestId.current) setError(cause instanceof Error ? cause.message : 'No se pudieron consultar los trabajos.');
    } finally {
      if (activeRequest === requestId.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [organizationId, advisorId]);

  useEffect(() => {
    requestId.current += 1;
    setEditingId(''); setNotice(''); setError(''); setJobs([]); setStepsByJob({}); setHasMore(false);
    if (advisorId) void loadJobs();
    return () => { requestId.current += 1; };
  }, [advisorId, loadJobs, refreshKey]);

  const visibleJobs = useMemo(() => jobs.filter(job => {
    if (filter === 'active') return !isClosed(job.status);
    if (filter === 'due') return !isClosed(job.status) && (job.status === 'needs_review' || Boolean(job.due_at && dayKey(job.due_at) <= weekEnd));
    return true;
  }), [jobs, filter, weekEnd]);
  const activeCount = jobs.filter(job => !isClosed(job.status)).length;
  const dueCount = jobs.filter(job => !isClosed(job.status) && (job.status === 'needs_review' || Boolean(job.due_at && dayKey(job.due_at) <= weekEnd))).length;
  const thisWeekLabel = `${dayLabel(`${weekStart}T12:00:00-05:00`)} – ${dayLabel(`${weekEnd}T12:00:00-05:00`)}`;

  const startEditing = (job: Job) => {
    setEditingId(job.id);
    setDescription(textValue(job.specifications?.description));
    setChangeNote(''); setError(''); setNotice('');
  };
  const saveChange = async (job: Job) => {
    if (!supabase || savingId || changeNote.trim().length < 3) return;
    setSavingId(job.id); setError(''); setNotice('');
    try {
      const previous = textValue(job.specifications?.description);
      const next = description.trim();
      const specifications = next === previous ? null : { ...(job.specifications || {}), description: next };
      const { error: saveError } = await supabase.rpc('update_production_job', {
        p_job_id: job.id,
        p_expected_version: job.spec_version,
        p_specifications: specifications,
        p_note: changeNote.trim(),
      });
      if (saveError) throw saveError;
      setNotice(specifications ? 'Se actualizaron los detalles y quedó registrada la nota del cambio.' : 'La nota quedó registrada en el historial del trabajo.');
      setEditingId(''); setChangeNote('');
      window.dispatchEvent(new Event('visualcorp:production-changed'));
      await loadJobs();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el cambio. Actualiza el trabajo y reintenta.');
    } finally { setSavingId(''); }
  };

  return <section className="panel advisor-jobs" aria-labelledby="advisor-jobs-title">
    <header className="advisor-jobs-head">
      <div><span className="eyebrow">TRABAJOS · {advisorName || 'ASESORÍA'}</span><h2 id="advisor-jobs-title">Seguimiento de trabajos</h2><p>Consulta el avance y añade cambios de instrucciones para el equipo. Las ventas confirmadas conservan sus importes originales.</p></div>
      {advisorId && <button type="button" className="button button-outline" onClick={() => void loadJobs()} disabled={loading || loadingMore}><RefreshCw size={15}/> Actualizar</button>}
    </header>
    {!advisorId ? <div className="advisor-jobs-empty">Selecciona <b>Por asesora</b> o una caja para consultar sus trabajos.</div> : <>
      <div className="advisor-jobs-toolbar"><div className="advisor-jobs-filters" role="group" aria-label="Filtrar trabajos"><button type="button" aria-pressed={filter === 'active'} onClick={() => setFilter('active')}>En seguimiento <b>{activeCount}</b></button><button type="button" aria-pressed={filter === 'due'} onClick={() => setFilter('due')}>Por atender <b>{dueCount}</b></button><button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Todos <b>{jobs.length}</b></button></div><small>Semana {thisWeekLabel} · Conteos de trabajos cargados</small></div>
      {error && <div className="advisor-jobs-alert" role="alert">{error} <button type="button" onClick={() => void loadJobs()}>Actualizar</button></div>}
      {notice && <div className="advisor-jobs-notice" role="status">{notice}</div>}
      {loading ? <div className="advisor-jobs-empty" role="status">Cargando trabajos del asesor…</div> : !error && visibleJobs.length === 0 ? <div className="advisor-jobs-empty">{jobs.length === 0 ? 'Aún no hay trabajos vinculados a las ventas de esta persona.' : 'No hay trabajos para este filtro.'}</div> : <div className="advisor-jobs-list">{visibleJobs.map(job => {
        const stages = stepsByJob[job.id] || [];
        const step = currentStep(stages);
        const spec = job.specifications || {};
        const completed = stages.filter(item => item.status === 'completed').length;
        const overdue = Boolean(job.due_at && !isClosed(job.status) && dayKey(job.due_at) < dayKey(new Date()));
        const areaSlug = step?.areas?.code ? areaSlugs[step.areas.code.toUpperCase()] : undefined;
        const canEdit = job.advisor_id === user?.id || hasPermission('workshop', 'edit');
        return <article className="advisor-job" data-status={job.status} key={job.id}>
          <div className="advisor-job-main"><div className="advisor-job-top"><span className="advisor-job-code">{job.sale_code || job.workflow_code || 'Trabajo'}</span><span className="advisor-job-status">{statusLabels[job.status] || job.status}</span>{overdue && <span className="advisor-job-overdue">Plazo vencido</span>}</div><h3>{job.title}</h3><p className="advisor-job-customer">{job.customer_name || 'Cliente pendiente'}{job.customer_phone && <> · <a href={`tel:${job.customer_phone.replace(/[^+\d]/g, '')}`}>{job.customer_phone}</a></>}</p><div className="advisor-job-specs">{displayValue(spec.width_cm) && displayValue(spec.height_cm) && <span>Medidas <b>{displayValue(spec.width_cm)} × {displayValue(spec.height_cm)} cm</b></span>}{textValue(spec.material) && <span>Material <b>{textValue(spec.material)}</b></span>}{textValue(spec.finish) && <span>Acabado <b>{textValue(spec.finish)}</b></span>}{spec.site_visit_required === true && <span>Visita de medidas requerida</span>}{spec.installation_required === true && <span>Incluye instalación</span>}</div>{textValue(spec.description) && <p className="advisor-job-description">{textValue(spec.description)}</p>}</div>
          <div className="advisor-job-progress"><div><span>Etapa actual</span><b>{step?.title || 'Sin etapas configuradas'}</b><small>{step?.areas?.name || 'Área por asignar'} · {step ? statusLabels[step.status] || step.status : 'Ruta por revisar'}</small></div><div><span>Avance</span><b>{completed} / {stages.length}</b><small>etapas completadas</small></div><div><span>Entrega prevista</span><b className={overdue ? 'is-overdue' : ''}>{dayLabel(job.due_at)}</b></div></div>
          <div className="advisor-job-actions"><Link className="button button-outline" to={`/operaciones/trabajos/asesoria?trabajo=${encodeURIComponent(job.id)}`}>Ver ficha <ArrowUpRight size={14}/></Link>{canOpenArea && areaSlug && <Link className="advisor-job-area-link" to={`/operaciones/trabajos/${areaSlug}?trabajo=${encodeURIComponent(job.id)}`}>Abrir {step?.areas?.name || 'área'} <ArrowUpRight size={13}/></Link>}{canEdit && !isClosed(job.status) && <button type="button" className="button button-outline" onClick={() => editingId === job.id ? setEditingId('') : startEditing(job)}><PenLine size={14}/>{editingId === job.id ? 'Cerrar edición' : 'Ampliar detalles'}</button>}</div>
          {editingId === job.id && <div className="advisor-job-editor"><div><span className="eyebrow">ACTUALIZAR INSTRUCCIONES</span><p>Los cambios se envían al equipo y quedan registrados. Añade una nota que explique qué cambió o qué deben revisar.</p></div><label>Descripción del trabajo<textarea rows={3} maxLength={4000} value={description} onChange={event => setDescription(event.target.value)} placeholder="Objetivo, referencia, ubicación o detalles adicionales"/></label><label>Nota para el historial <span>obligatoria</span><textarea rows={2} maxLength={1000} value={changeNote} onChange={event => setChangeNote(event.target.value)} placeholder="Ej. El cliente cambió la ubicación de instalación"/></label><div className="advisor-job-editor-actions"><button type="button" className="button button-dark" disabled={savingId === job.id || changeNote.trim().length < 3} onClick={() => void saveChange(job)}>{savingId === job.id ? 'Guardando…' : 'Guardar cambio'} <CheckCircle2 size={15}/></button><button type="button" className="button button-outline" onClick={() => setEditingId('')} disabled={savingId === job.id}>Cancelar</button></div></div>}
        </article>;
      })}</div>}
      {hasMore && <div className="advisor-jobs-more"><span>Mostrando {jobs.length} trabajos recientes.</span><button type="button" className="button button-outline" disabled={loadingMore || loading} onClick={() => void loadJobs(jobs.length)}>{loadingMore ? 'Cargando…' : 'Cargar más trabajos'}</button></div>}
    </>}
  </section>;
}
