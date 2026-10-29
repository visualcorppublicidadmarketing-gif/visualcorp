import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Bell, CalendarClock, CircleCheck, RefreshCw, UserRound } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Sheet } from '../../components/ui/OperationalKit';
import { supabase } from '../../lib/supabaseClient';
import './production-attention.css';

type Area = { code: string; name: string };
type Step = {
  id: string; job_id: string; title: string; status: string; assigned_to: string | null;
  due_at: string | null; updated_at: string; areas: Area | null;
};
type Job = {
  id: string; advisor_id: string | null; sale_code: string | null; customer_name: string | null;
  title: string; status: string; due_at: string | null; artwork_review_status: string;
};
type AttentionKind = 'blocked' | 'unassigned' | 'due' | 'ready' | 'assigned' | 'review' | 'artwork';
type Attention = {
  id: string; kind: AttentionKind; title: string; description: string;
  job: Job; step: Step | null; priority: number; dueAt: string | null;
  audience: 'mine' | 'team';
};
type Filter = 'all' | 'mine' | 'team';

const AREA_SLUG: Record<string, string> = {
  ASE: 'asesoria', DIS: 'diseno', IMP: 'impresion', SUB: 'sublimacion', LAS: 'laser', TAL: 'taller',
};
const KIND_LABEL: Record<AttentionKind, string> = {
  blocked: 'Bloqueo', unassigned: 'Sin responsable', due: 'Plazo',
  ready: 'Lista para empezar', assigned: 'Asignación', review: 'Revisión', artwork: 'Arte por aprobar',
};
const HORIZON_MS = 48 * 60 * 60 * 1000;
const RECENT_MS = 72 * 60 * 60 * 1000;
const FETCH_LIMIT = 100;
const DISPLAY_LIMIT = 40;
const dateMs = (value: string | null | undefined) => value ? new Date(value).getTime() : NaN;
const dateLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Sin fecha';
const attentionHref = (item: Attention, canSeeWorkshop: boolean) => {
  const area = item.step?.areas?.code || 'ASE';
  const slug = canSeeWorkshop ? AREA_SLUG[area] || 'asesoria' : 'asesoria';
  const params = new URLSearchParams({ trabajo: item.job.id });
  if (item.step) params.set('paso', item.step.id);
  return `/operaciones/trabajos/${slug}?${params.toString()}`;
};

function buildAttention(assigned: Step[], blocked: Step[], unassigned: Step[], advisorJobs: Job[], jobs: Map<string, Job>, now: number) {
  const items = new Map<string, Attention>();
  const addStep = (step: Step, kind: AttentionKind, description: string, priority: number, audience: 'mine' | 'team') => {
    const job = jobs.get(step.job_id);
    if (!job || ['completed', 'cancelled'].includes(job.status)) return;
    const key = `${audience}:${step.id}`;
    const previous = items.get(key);
    if (previous && previous.priority <= priority) return;
    items.set(key, { id: key, kind, title: step.title, description, job, step, priority, dueAt: step.due_at, audience });
  };

  assigned.forEach((step) => {
    const due = dateMs(step.due_at);
    if (step.status === 'blocked') addStep(step, 'blocked', 'Tu etapa está bloqueada. Revisa la indicación y coordina el siguiente paso.', 0, 'mine');
    else if (Number.isFinite(due) && due <= now + HORIZON_MS) addStep(step, 'due', due < now ? 'La fecha límite de tu etapa ya pasó.' : 'Tu etapa vence en las próximas 48 horas.', due < now ? 1 : 2, 'mine');
    else if (step.status === 'ready') addStep(step, 'ready', 'Las etapas anteriores terminaron. Ya puedes iniciar tu trabajo.', 3, 'mine');
    else if (dateMs(step.updated_at) >= now - RECENT_MS) addStep(step, 'assigned', 'Tienes una etapa asignada. Aparecerá lista cuando termine la anterior.', 4, 'mine');
  });
  const myStepIds = new Set(assigned.map((step) => step.id));
  blocked.forEach((step) => {
    if (!myStepIds.has(step.id)) addStep(step, 'blocked', 'Esta etapa necesita intervención de coordinación.', 0, 'team');
  });
  unassigned.forEach((step) => addStep(step, 'unassigned', 'La etapa está lista, pero aún no tiene responsable.', 2, 'team'));
  advisorJobs.forEach((job) => {
    if (job.status === 'needs_review') {
      items.set(`mine:job:${job.id}`, { id: `mine:job:${job.id}`, kind: 'review', title: job.title,
        description: 'Cambió la ficha durante producción. Revisa las indicaciones con el equipo.',
        job, step: null, priority: 0, dueAt: job.due_at, audience: 'mine' });
    } else if (job.artwork_review_status === 'awaiting_review') {
      items.set(`mine:job:${job.id}`, { id: `mine:job:${job.id}`, kind: 'artwork', title: job.title,
        description: 'Diseño entregó el arte. Revisa el enlace y apruébalo o pide correcciones para continuar.',
        job, step: null, priority: 0, dueAt: job.due_at, audience: 'mine' });
    } else {
      const due = dateMs(job.due_at);
      if (Number.isFinite(due) && due <= now + HORIZON_MS) {
        items.set(`mine:job:${job.id}`, { id: `mine:job:${job.id}`, kind: 'due', title: job.title,
          description: due < now ? 'La entrega prevista del cliente ya pasó.' : 'Entrega prevista en las próximas 48 horas.',
          job, step: null, priority: due < now ? 1 : 2, dueAt: job.due_at, audience: 'mine' });
      }
    }
  });
  return [...items.values()].sort((a, b) => a.priority - b.priority
    || (dateMs(a.dueAt) || Infinity) - (dateMs(b.dueAt) || Infinity)
    || a.title.localeCompare(b.title, 'es')).slice(0, DISPLAY_LIMIT);
}

export function ProductionAttention() {
  const { organizationId, user, hasPermission, profiles, roles } = useAuth();
  const canSeeWorkshop = hasPermission('workshop', 'view');
  const canSeeSales = hasPermission('sales', 'view');
  const enabled = Boolean(supabase && organizationId && user?.id && (canSeeWorkshop || canSeeSales));
  const canCoordinate = hasPermission('workshop', 'edit') && ((roles || []).some((role) => role === 'owner' || role === 'admin')
    || (profiles || []).some((profile) => ['admin', 'gerencia', 'coordinador_taller'].includes(profile.key)));
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Attention[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const requestId = useRef(0);
  useEffect(() => {
    if (!canCoordinate && filter === 'team') setFilter('all');
  }, [canCoordinate, filter]);

  const load = useCallback(async (active: () => boolean) => {
    if (!enabled || !supabase || !organizationId || !user?.id) return;
    const currentRequest = ++requestId.current;
    const isCurrent = () => active() && currentRequest === requestId.current;
    setLoading(true); setError('');
    try {
      const client = supabase;
      const fields = 'id,job_id,title,status,assigned_to,due_at,updated_at,areas(code,name)';
      const assignedRequest = client.from('production_job_steps').select(fields)
        .eq('organization_id', organizationId).eq('assigned_to', user.id)
        .in('status', ['waiting', 'ready', 'in_progress', 'blocked'])
        .order('updated_at', { ascending: false }).limit(FETCH_LIMIT);
      const blockedRequest = canCoordinate ? client.from('production_job_steps').select(fields)
        .eq('organization_id', organizationId).eq('status', 'blocked')
        .order('updated_at', { ascending: false }).limit(FETCH_LIMIT) : null;
      const unassignedRequest = canCoordinate ? client.from('production_job_steps').select(fields)
        .eq('organization_id', organizationId).eq('status', 'ready').is('assigned_to', null)
        .order('updated_at', { ascending: false }).limit(FETCH_LIMIT) : null;
      const advisorRequest = canSeeSales ? client.from('production_jobs')
        .select('id,advisor_id,sale_code,customer_name,title,status,due_at,artwork_review_status')
        .eq('organization_id', organizationId).eq('advisor_id', user.id)
        .in('status', ['open', 'needs_review'])
        .order('updated_at', { ascending: false }).limit(FETCH_LIMIT) : null;
      const [assignedResult, blockedResult, unassignedResult, advisorResult] = await Promise.all([
        assignedRequest, blockedRequest, unassignedRequest, advisorRequest,
      ]);
      const queryError = assignedResult.error || blockedResult?.error || unassignedResult?.error || advisorResult?.error;
      if (queryError) throw queryError;
      const assigned = (assignedResult.data || []) as unknown as Step[];
      const blocked = (blockedResult?.data || []) as unknown as Step[];
      const unassigned = (unassignedResult?.data || []) as unknown as Step[];
      const advisorJobs = (advisorResult?.data || []) as Job[];
      const ids = [...new Set([...assigned, ...blocked, ...unassigned].map((step) => step.job_id))];
      const jobResult = ids.length ? await client.from('production_jobs')
        .select('id,advisor_id,sale_code,customer_name,title,status,due_at,artwork_review_status')
        .eq('organization_id', organizationId).in('id', ids) : null;
      if (jobResult?.error) throw jobResult.error;
      const jobs = new Map<string, Job>([...advisorJobs, ...((jobResult?.data || []) as Job[])].map((job) => [job.id, job]));
      if (isCurrent()) setItems(buildAttention(assigned, blocked, unassigned, advisorJobs, jobs, Date.now()));
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : 'No pudimos cargar los avisos.');
    } finally { if (isCurrent()) setLoading(false); }
  }, [enabled, organizationId, user?.id, canCoordinate, canSeeSales]);

  useEffect(() => {
    if (!enabled) { setItems([]); return; }
    let active = true;
    const refresh = () => { if (document.visibilityState === 'visible') void load(() => active); };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('visualcorp:production-changed', refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('visualcorp:production-changed', refresh); };
  }, [enabled, load, revision]);

  const visible = useMemo(() => items.filter((item) => filter === 'all' || item.audience === filter), [items, filter]);
  const mine = items.filter((item) => item.audience === 'mine').length;
  const team = items.length - mine;
  if (!enabled) return null;

  return <div className="production-attention">
    <button className="production-attention-trigger" type="button" aria-label={`Abrir avisos de trabajos: ${items.length} visibles`} aria-haspopup="dialog" onClick={() => { setOpen(true); setRevision((value) => value + 1); }}><Bell size={17} aria-hidden="true"/><span>Avisos</span>{items.length > 0 && <b>{items.length >= DISPLAY_LIMIT ? `${DISPLAY_LIMIT}+` : items.length}</b>}</button>
    <Sheet open={open} onOpenChange={setOpen} title="Avisos de trabajos" description="Pendientes que necesitan tu atención o la de coordinación.">
      <div className="production-attention-sheet"><div className="production-attention-summary"><div><strong>{items.length}</strong><span>{items.length === 1 ? 'asunto visible' : 'asuntos visibles'}</span></div><button type="button" className="button button-outline" disabled={loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={14}/> Actualizar</button></div>
      <p className="production-attention-explainer">Estos avisos se calculan con las órdenes actuales y desaparecen cuando se resuelve la causa.</p>
      <div className="production-attention-filters" role="group" aria-label="Filtrar avisos"><button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Todos <b>{items.length}</b></button><button type="button" aria-pressed={filter === 'mine'} onClick={() => setFilter('mine')}>Para mí <b>{mine}</b></button>{canCoordinate && <button type="button" aria-pressed={filter === 'team'} onClick={() => setFilter('team')}>Equipo <b>{team}</b></button>}</div>
      {loading && !items.length && <p className="production-attention-empty" role="status">Consultando los trabajos…</p>}
      {error && <p className="production-attention-error" role="alert">No pudimos actualizar los avisos. <button type="button" onClick={() => setRevision((value) => value + 1)}>Reintentar</button></p>}
      {!loading && !error && !visible.length && <div className="production-attention-empty"><CircleCheck size={24}/><b>Todo al día</b><span>{filter === 'team' ? 'No hay bloqueos ni etapas listas sin responsable.' : 'No hay trabajos que requieran atención inmediata.'}</span></div>}
      <ol className="production-attention-list">{visible.map((item) => { const overdue = item.kind === 'due' && dateMs(item.dueAt) < Date.now(); return <li key={item.id} data-kind={item.kind} data-overdue={overdue}><div className="production-attention-icon" aria-hidden="true">{item.kind === 'blocked' || item.kind === 'review' ? <AlertTriangle size={17}/> : item.kind === 'due' ? <CalendarClock size={17}/> : item.kind === 'artwork' ? <CircleCheck size={17}/> : <UserRound size={17}/>}</div><div className="production-attention-copy"><div className="production-attention-top"><span>{overdue ? 'Plazo vencido' : KIND_LABEL[item.kind]}</span><small>{item.audience === 'team' ? 'Coordinación' : 'Para mí'}</small></div><h3>{item.title}</h3><p>{item.description}</p><div className="production-attention-meta"><span>{item.job.sale_code || 'Orden'} · {item.job.customer_name || 'Cliente por consultar'}</span>{item.dueAt && <span>{dateLabel(item.dueAt)}</span>}</div><Link to={attentionHref(item, canSeeWorkshop)} onClick={() => setOpen(false)}>Abrir trabajo <ArrowRight size={14}/></Link></div></li>; })}</ol>
      {items.length >= DISPLAY_LIMIT && <p className="production-attention-limit">Se muestran {DISPLAY_LIMIT} avisos detectados. Consulta las colas de cada área para ver todos los trabajos.</p>}
      </div>
    </Sheet>
  </div>;
}
