import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarClock, Check, CircleCheck, ClipboardCheck, ClipboardList, Clock3, Hammer, PackageCheck, PenTool, Play, Printer, RefreshCw, RotateCcw, ScanLine, Search, ShieldCheck, Shirt, UserRound } from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { Sheet } from '../../components/ui/OperationalKit';
import { supabase } from '../../lib/supabaseClient';
import { ProductionArtworkReference } from './ProductionArtworkReference';
import { ProductionQueueSkeleton, ProductionQueueSummary, ProductionStageProgress } from './ProductionQueueComponents';
import { ProductionQueueViews, type ProductionQueueViewItem } from './ProductionQueueViews';
import { ProductionSpecReview } from './ProductionSpecReview';
import './production-jobs.css';
import './production-queue-components.css';

type AreaSlug = 'asesoria' | 'diseno' | 'impresion' | 'sublimacion' | 'laser' | 'taller';
type StepStatus = 'waiting' | 'ready' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
type Job = {
  id: string; organization_id: string; branch_id: string; advisor_id: string | null;
  workflow_code: string;
  sale_code: string | null; customer_name: string | null; customer_phone: string | null;
  title: string; specifications: Record<string, unknown> | null; spec_version: number; review_from_version: number | null;
  approval_required: boolean; artwork_review_status: 'not_required' | 'awaiting_art' | 'awaiting_review' | 'changes_requested' | 'approved';
  artwork_revision: number; artwork_reference: string; artwork_submitted_at: string | null; artwork_reviewed_at: string | null;
  status: string; due_at: string | null; fulfillment_status?: string; fulfillment_due_at?: string | null;
  fulfillment_note?: string; created_at: string; updated_at: string;
};
type Step = {
  id: string; job_id: string; step_key: string; step_order: number; area_id: string;
  title: string; status: StepStatus; assigned_to: string | null; due_at: string | null;
  notes: string | null; created_at: string; updated_at: string; estimated_minutes?: number;
  requirements?: { before_start?: string[]; before_complete?: string[] };
  readiness_reasons?: Array<{ code: string; message: string }>;
  handoff_status?: 'not_required' | 'pending' | 'accepted'; received_by?: string | null; received_at?: string | null;
  due_at_is_manual?: boolean;
};
type StepCheck = { id: string; step_id: string; check_key: string; title: string; required: boolean; requires_evidence: boolean; completed_at: string | null; evidence_url: string; note: string };
type ProductionLot = { id: string; parent_lot_id: string | null; label: string; quantity: number; unit: string; status: string; due_at: string | null; notes: string; produced_at: string | null; quality_at: string | null; delivered_at: string | null; installed_at: string | null };
type JobEvent = {
  id: number; job_id: string; step_id: string | null; event_type: string;
  details: Record<string, unknown> | null; created_by: string | null; created_at: string;
};
type AreaRow = { id: string; code: string; name: string };
type Assignee = { user_id: string; display_name: string };
type QueueItem = { job: Job; step: Step | null; currentStep: Step | null };
type Filter = 'all' | 'mine' | 'unassigned' | 'today' | 'overdue' | 'blocked';
const WORKFLOW_CHOICES = [
  { code: 'none', label: 'Entrega directa' },
  { code: 'print', label: 'Diseño → Impresión' },
  { code: 'laser', label: 'Diseño → Corte láser' },
  { code: 'sign', label: 'Diseño → Impresión → Taller' },
  { code: 'sign_measure', label: 'Visita de medidas → Diseño → Impresión → Taller' },
  { code: 'neon', label: 'Diseño → Corte láser → Taller' },
  { code: 'sublimation', label: 'Diseño → Sublimación' },
] as const;

const AREA_CONFIG = [
  { slug: 'asesoria', code: 'ASE', name: 'Asesoría', icon: ClipboardList, intro: 'Sigue cada trabajo vendido, sus cambios y el avance de producción.' },
  { slug: 'diseno', code: 'DIS', name: 'Diseño', icon: PenTool, intro: 'Prepara archivos y entrega diseños listos a la siguiente área.' },
  { slug: 'impresion', code: 'IMP', name: 'Impresión', icon: Printer, intro: 'Consulta artes listos, medidas y fechas antes de producir.' },
  { slug: 'sublimacion', code: 'SUB', name: 'Sublimación', icon: Shirt, intro: 'Organiza los trabajos personalizados y su entrega.' },
  { slug: 'laser', code: 'LAS', name: 'Corte láser', icon: ScanLine, intro: 'Revisa material, piezas y referencias de corte.' },
  { slug: 'taller', code: 'TAL', name: 'Taller', icon: Hammer, intro: 'Coordina visitas, armado e instalación según cada orden.' },
] as const;

const STATUS_LABELS: Record<StepStatus, string> = {
  waiting: 'Espera etapa anterior', ready: 'Lista para tomar', in_progress: 'En proceso',
  blocked: 'Bloqueada', completed: 'Terminada', cancelled: 'Cancelada',
};
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todos' }, { id: 'mine', label: 'Para mí' },
  { id: 'unassigned', label: 'Sin asignar' }, { id: 'today', label: 'Hoy' },
  { id: 'overdue', label: 'Vencidos' }, { id: 'blocked', label: 'Bloqueados' },
];
const ARTWORK_FILE_TYPES: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf',
};
const ARTWORK_FILE_MAX_BYTES = 6 * 1024 * 1024;
const SPEC_LABELS: Record<string, string> = {
  description: 'Descripción', notes: 'Indicaciones', width_cm: 'Ancho', height_cm: 'Alto',
  quantity: 'Cantidad', material: 'Material', finish: 'Acabado', color: 'Color',
  installation_address: 'Lugar de instalación', installation_required: 'Instalación',
  measurement_required: 'Visita para medir', reference: 'Referencia',
  artwork_status: 'Archivo al recibir el pedido', approval_required: 'Revisión de arte',
};

const safeDate = (value: string | null | undefined) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value) : null;
const stamp = (value: string | null | undefined) => safeDate(value)?.toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'medium', timeStyle: 'short' }) || 'Por definir';
const localDateTime = (value: string | null | undefined) => {
  const date = safeDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
const dayKey = (value: string | null | undefined) => {
  const date = safeDate(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).reduce<Record<string, string>>((result, part) => { result[part.type] = part.value; return result; }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const todayKey = () => dayKey(new Date().toISOString());
const moveCardSpotlight = (event: ReactPointerEvent<HTMLElement>) => {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--spotlight-x', `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty('--spotlight-y', `${event.clientY - rect.top}px`);
};
const isOpen = (status: StepStatus) => !['completed', 'cancelled'].includes(status);
const queueDueAt = (item: QueueItem) => item.step?.due_at || item.job.due_at;
const isLate = (item: QueueItem) => Boolean((item.step || item.currentStep) && isOpen((item.step || item.currentStep)!.status) && queueDueAt(item) && dayKey(queueDueAt(item)) < todayKey());
const matchesQueueFilter = (item: QueueItem, filter: Filter, areaCode: string | undefined, userId: string | undefined) => {
  const step = item.step || item.currentStep;
  const owner = areaCode === 'ASE' ? item.job.advisor_id : item.step?.assigned_to;
  if (filter === 'mine') return owner === userId;
  if (filter === 'unassigned') return Boolean(step && isOpen(step.status) && !(areaCode === 'ASE' ? step.assigned_to : owner));
  if (filter === 'today') return dayKey(queueDueAt(item)) === todayKey();
  if (filter === 'overdue') return isLate(item);
  if (filter === 'blocked') return step?.status === 'blocked';
  return true;
};
const presentValue = (value: unknown): string => {
  if (value == null || value === '') return 'Por definir';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (Array.isArray(value)) return value.map(presentValue).join(' · ');
  if (typeof value === 'object') return Object.entries(value).map(([key, part]) => `${SPEC_LABELS[key] || key.replaceAll('_', ' ')}: ${presentValue(part)}`).join(' · ');
  return String(value);
};
const priorityDetails = (item: QueueItem, now = Date.now()) => {
  const step = item.step || item.currentStep;
  if (!step || !isOpen(step.status)) return { score: 0, reason: 'Sin acción pendiente' };
  let score = ({ blocked: 64, in_progress: 52, ready: 42, waiting: 8 } as Record<string, number>)[step.status] || 0;
  const due = safeDate(step.due_at || item.job.due_at)?.getTime();
  let reason = step.status === 'blocked' ? 'Bloqueo requiere coordinación'
    : step.status === 'ready' ? 'Lista para recibir o iniciar'
      : step.status === 'in_progress' ? 'Trabajo en curso' : 'Espera una dependencia';
  if (Number.isFinite(due)) {
    const slack = due! - now; const estimate = Math.max(1, step.estimated_minutes || 60) * 60_000;
    if (slack < 0) { score += Math.min(34, 18 + Math.floor(Math.abs(slack) / 86_400_000) * 4); reason = 'Plazo vencido'; }
    else if (slack <= estimate) { score += 27; reason = 'Plazo menor que el tiempo estimado'; }
    else if (slack <= 86_400_000) { score += 20; reason = 'Vence en menos de 24 horas'; }
    else if (slack <= 259_200_000) { score += 12; reason = 'Vence en menos de 3 días'; }
  }
  if (step.status === 'ready' && !step.assigned_to) score += 5;
  return { score: Math.min(100, score), reason };
};
const humanKey = (key: string) => SPEC_LABELS[key] || key.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const eventTitle = (event: JobEvent) => ({
  job_created: 'Trabajo creado', workflow_selected: 'Ruta definida', step_take: 'Tarea tomada', step_ready: 'Etapa lista para el área', step_received: 'Etapa recibida', rework_requested: 'Retrabajo solicitado', quality_check_ready: 'Control de calidad pendiente',
  step_coordinated: 'Responsable o fecha actualizados',
  step_start: 'Trabajo iniciado', step_complete: 'Etapa terminada', step_block: 'Trabajo bloqueado',
  step_unblock: 'Trabajo reanudado', specifications_updated: 'Indicaciones actualizadas', note_added: 'Nota añadida',
  specification_review_accepted: 'Cambio técnico aceptado',
  specification_review_changes_requested: 'Corrección técnica solicitada',
  artwork_submitted: 'Arte entregado para revisar', artwork_approved: 'Arte aprobado', artwork_changes_requested: 'Correcciones solicitadas',
}[event.event_type] || event.event_type.replaceAll('_', ' '));
const eventNote = (event: JobEvent) => {
  if (event.event_type === 'step_coordinated') {
    const details = event.details || {};
    const changes: string[] = [];
    if (details.previous_assignee !== details.assigned_to) {
      const name = typeof details.assigned_to_name === 'string' && details.assigned_to_name.trim()
        ? details.assigned_to_name : 'integrante del equipo';
      changes.push(details.assigned_to ? `Responsable: ${name}` : 'Sin responsable');
    }
    if (details.previous_due_at !== details.due_at) {
      changes.push(`Fecha límite: ${stamp(typeof details.due_at === 'string' ? details.due_at : null)}`);
    }
    if (typeof details.note === 'string' && details.note.trim()) changes.push(details.note);
    return changes.join(' · ');
  }
  const value = event.details?.note || event.details?.reason || event.details?.description;
  return typeof value === 'string' ? value : '';
};

function currentStage(steps: Step[]) {
  return steps.find((step) => ['in_progress', 'blocked', 'ready'].includes(step.status))
    || steps.find((step) => step.status === 'waiting') || steps.at(-1) || null;
}

const HANDOFF_FIELDS: Record<string, Array<[string, string]>> = {
  ASE: [['description', 'Descripción'], ['quantity', 'Cantidad física'], ['width_cm', 'Ancho'], ['height_cm', 'Alto'], ['material', 'Material'], ['finish', 'Acabado'], ['installation_address', 'Lugar de instalación'], ['notes', 'Indicaciones']],
  DIS: [['description', 'Descripción'], ['width_cm', 'Ancho'], ['height_cm', 'Alto'], ['material', 'Material'], ['color', 'Color'], ['finish', 'Acabado'], ['notes', 'Indicaciones']],
  IMP: [['width_cm', 'Ancho'], ['height_cm', 'Alto'], ['material', 'Material'], ['color', 'Color'], ['finish', 'Acabado'], ['installation_address', 'Lugar de instalación'], ['notes', 'Indicaciones']],
  SUB: [['quantity', 'Cantidad física'], ['width_cm', 'Ancho'], ['height_cm', 'Alto'], ['material', 'Material'], ['color', 'Color'], ['notes', 'Indicaciones']],
  LAS: [['quantity', 'Cantidad física'], ['width_cm', 'Ancho'], ['height_cm', 'Alto'], ['material', 'Material'], ['finish', 'Acabado'], ['notes', 'Indicaciones']],
  TAL: [['width_cm', 'Ancho verificado'], ['height_cm', 'Alto verificado'], ['material', 'Material'], ['finish', 'Acabado o montaje'], ['installation_address', 'Lugar de instalación'], ['site_visit_notes', 'Observaciones de visita']],
};
function ProductionHandoff({ step, areas, specifications }: { step: Step; areas: AreaRow[]; specifications: Record<string, unknown> | null }) {
  const code = areas.find((area) => area.id === step.area_id)?.code || '';
  const fields = HANDOFF_FIELDS[code] || [];
  const filled = fields.filter(([key]) => specifications?.[key] !== undefined && specifications?.[key] !== null && String(specifications[key]).trim() !== '');
  if (!fields.length) return null;
  return <section className="pj-handoff" aria-label={`Información para ${step.title}`}>
    <div className="pj-handoff-heading"><div><span className="pj-artwork-eyebrow">PASE ENTRE ÁREAS</span><h4>Información para {step.title}</h4></div><span className="pj-handoff-count">{filled.length} de {fields.length} datos</span></div>
    <p>Resumen de la ficha que acompaña este paso. Los requisitos que sí bloquean el avance aparecen en los motivos de preparación de la etapa.</p>
    <ul className="pj-handoff-list">{fields.map(([key, label]) => {
      const value = specifications?.[key];
      const complete = value !== undefined && value !== null && String(value).trim() !== '';
      return <li key={key} data-complete={complete}><span aria-hidden="true">{complete ? <Check size={13}/> : '•'}</span><b>{label}</b><small>{complete ? String(value) : 'Por confirmar en la ficha'}</small></li>;
    })}</ul>
  </section>;
}

export function ProductionJobsPage() {
  const { area: areaParam } = useParams<{ area: AreaSlug }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { organizationId, user, hasPermission, profiles, roles } = useAuth();
  const area = AREA_CONFIG.find((entry) => entry.slug === areaParam);
  const canSeeWorkshop = hasPermission('workshop', 'view');
  const canEditWorkshop = hasPermission('workshop', 'edit');
  const canEditSales = hasPermission('sales', 'edit');
  const canSeeAdvisory = hasPermission('sales', 'view') || canSeeWorkshop;
  const profileKeys = new Set<string>((profiles || []).map((profile: { key: string }) => profile.key));
  const canCoordinate = canEditWorkshop && ((roles || []).some((role: string) => role === 'owner' || role === 'admin')
    || ['admin', 'gerencia', 'coordinador_taller', 'encargado_local'].some((key) => profileKeys.has(key)));
  const canActInArea = (code: string) => {
    if ((roles || []).some((role: string) => role === 'owner' || role === 'admin')
      || ['admin', 'gerencia', 'coordinador_taller', 'encargado_local'].some((key) => profileKeys.has(key))) return true;
    const keysByArea: Record<string, string[]> = {
      ASE: ['asesoras', 'coordinador_ventas'], DIS: ['disenador_grafico'],
      IMP: ['impresor'], SUB: ['sublimacion'], LAS: ['personal_taller'], TAL: ['personal_taller'],
    };
    return (keysByArea[code] || []).some((key) => profileKeys.has(key));
  };
  const [jobs, setJobs] = useState<Job[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [stepChecks, setStepChecks] = useState<StepCheck[]>([]);
  const [productionLots, setProductionLots] = useState<ProductionLot[]>([]);
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [artworkReference, setArtworkReference] = useState('');
  const [artworkNote, setArtworkNote] = useState('');
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [artworkFileKey, setArtworkFileKey] = useState(0);
  const [draftSpec, setDraftSpec] = useState<Record<string, string>>({});
  const [draftRoute, setDraftRoute] = useState('print');
  const [eligibleStaff, setEligibleStaff] = useState<Assignee[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [draftAssignee, setDraftAssignee] = useState('');
  const [draftDueAt, setDraftDueAt] = useState('');
  const [coordinationNote, setCoordinationNote] = useState('');
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<string, string>>({});
  const [reworkTarget, setReworkTarget] = useState('');
  const [fulfillmentDueAt, setFulfillmentDueAt] = useState('');
  const [physicalQuantity, setPhysicalQuantity] = useState('');
  const [physicalUnit, setPhysicalUnit] = useState('unidad');
  const [lotQuantityDrafts, setLotQuantityDrafts] = useState<Record<string, string>>({});
  const [lotNote, setLotNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [queueLimit, setQueueLimit] = useState(150);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const selectedJobId = searchParams.get('trabajo') || searchParams.get('job');
  const selectedStepId = searchParams.get('paso');

  useEffect(() => {
    const refreshForProductionChange = () => setRevision((value) => value + 1);
    window.addEventListener('visualcorp:production-changed', refreshForProductionChange);
    return () => window.removeEventListener('visualcorp:production-changed', refreshForProductionChange);
  }, []);

  useEffect(() => {
    if (!organizationId || !supabase || !area) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const client = supabase;
        const areaResult = await client.from('areas').select('id,code,name').eq('organization_id', organizationId).in('code', AREA_CONFIG.map((entry) => entry.code));
        if (areaResult.error) throw areaResult.error;
        const availableAreas = (areaResult.data || []) as AreaRow[];
        let jobRows: Job[] = [];
        let targetSteps: Step[] = [];
        if (area.code === 'ASE') {
          // Advisory follows whole jobs. An advisor without workshop access only requests their own jobs.
          let query = client.from('production_jobs').select('*').eq('organization_id', organizationId).order('updated_at', { ascending: false }).limit(queueLimit);
          if (!canSeeWorkshop && user?.id) query = query.eq('advisor_id', user.id);
          const result = await query;
          if (result.error) throw result.error;
          jobRows = (result.data || []) as Job[];
        } else {
          const areaId = availableAreas.find((row) => row.code === area.code)?.id;
          if (areaId) {
            const result = await client.from('production_job_steps').select('*').eq('organization_id', organizationId).eq('area_id', areaId).order('updated_at', { ascending: false }).limit(queueLimit);
            if (result.error) throw result.error;
            targetSteps = (result.data || []) as Step[];
            const jobIds = [...new Set(targetSteps.map((step) => step.job_id))];
            if (jobIds.length) {
              const jobResult = await client.from('production_jobs').select('*').eq('organization_id', organizationId).in('id', jobIds);
              if (jobResult.error) throw jobResult.error;
              jobRows = (jobResult.data || []) as Job[];
            }
          }
        }
        // Deep links from Mi semana remain usable when a job falls outside the recent queue.
        if (selectedJobId && !jobRows.some((job) => job.id === selectedJobId)) {
          const linked = await client.from('production_jobs').select('*').eq('organization_id', organizationId).eq('id', selectedJobId).maybeSingle();
          if (linked.error) throw linked.error;
          if (linked.data) jobRows.push(linked.data as Job);
        }
        const jobIds = [...new Set(jobRows.map((job) => job.id))];
        let allSteps: Step[] = [];
        let jobEvents: JobEvent[] = [];
        let selectedChecks: StepCheck[] = [];
        if (jobIds.length) {
          const [stepResult, eventResult] = await Promise.all([
            client.from('production_job_steps').select('*').eq('organization_id', organizationId).in('job_id', jobIds).order('step_order', { ascending: true }).limit(900),
            client.from('production_job_events').select('*').eq('organization_id', organizationId).in('job_id', jobIds).order('created_at', { ascending: false }).limit(900),
          ]);
          if (stepResult.error) throw stepResult.error;
          if (eventResult.error) throw eventResult.error;
          allSteps = (stepResult.data || []) as Step[];
          jobEvents = (eventResult.data || []) as JobEvent[];
        }
        if (selectedJobId && jobIds.includes(selectedJobId)) {
          const [selectedStepResult, selectedEventResult, selectedCheckResult, lotResult] = await Promise.all([
            client.from('production_job_steps').select('*').eq('organization_id', organizationId).eq('job_id', selectedJobId).order('step_order', { ascending: true }),
            client.from('production_job_events').select('*').eq('organization_id', organizationId).eq('job_id', selectedJobId).order('created_at', { ascending: false }).limit(100),
            client.from('production_job_step_checks').select('*').eq('organization_id', organizationId).eq('job_id', selectedJobId).order('created_at', { ascending: true }),
            client.from('production_job_lots').select('*').eq('organization_id', organizationId).eq('job_id', selectedJobId).order('created_at', { ascending: true }),
          ]);
          if (selectedStepResult.error) throw selectedStepResult.error;
          if (selectedEventResult.error) throw selectedEventResult.error;
          if (selectedCheckResult.error) throw selectedCheckResult.error;
          if (lotResult.error) throw lotResult.error;
          allSteps = [...allSteps.filter((step) => step.job_id !== selectedJobId), ...((selectedStepResult.data || []) as Step[])];
          jobEvents = [...jobEvents.filter((event) => event.job_id !== selectedJobId), ...((selectedEventResult.data || []) as JobEvent[])];
          selectedChecks = (selectedCheckResult.data || []) as StepCheck[];
          if (active) setProductionLots((lotResult.data || []) as ProductionLot[]);
        } else if (active) {
          setProductionLots([]);
        }
        if (!selectedJobId && active) setProductionLots([]);
        if (active) {
          setAreas(availableAreas); setJobs(jobRows); setSteps(allSteps); setEvents(jobEvents); setStepChecks(selectedChecks);
          setActionError(''); setLoading(false);
        }
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : 'No pudimos cargar los trabajos.');
          setLoading(false);
        }
      }
    };
    void load();
    return () => { active = false; };
  }, [organizationId, area?.code, canSeeWorkshop, user?.id, selectedJobId, queueLimit, revision]);

  const rows = useMemo<QueueItem[]>(() => {
    if (!area) return [];
    const byJob = new Map<string, Step[]>();
    for (const step of steps) byJob.set(step.job_id, [...(byJob.get(step.job_id) || []), step]);
    if (area.code === 'ASE') return jobs.map((job) => ({ job, step: null, currentStep: currentStage(byJob.get(job.id) || []) }));
    const areaId = areas.find((entry) => entry.code === area.code)?.id;
    const jobById = new Map(jobs.map((job) => [job.id, job]));
    return steps.filter((step) => step.area_id === areaId).flatMap((step) => {
      const job = jobById.get(step.job_id);
      return job ? [{ job, step, currentStep: currentStage(byJob.get(job.id) || []) }] : [];
    });
  }, [area, jobs, steps, areas]);
  const filterCounts = useMemo<Record<Filter, number>>(() => {
    const counts: Record<Filter, number> = { all: 0, mine: 0, unassigned: 0, today: 0, overdue: 0, blocked: 0 };
    for (const item of rows) for (const option of FILTERS) {
      if (matchesQueueFilter(item, option.id, area?.code, user?.id)) counts[option.id] += 1;
    }
    return counts;
  }, [rows, area?.code, user?.id]);
  const stageProgress = useMemo(() => {
    const progress = new Map<string, { completed: number; total: number }>();
    for (const step of steps) {
      if (step.status === 'cancelled') continue;
      const current = progress.get(step.job_id) || { completed: 0, total: 0 };
      current.total += 1;
      if (step.status === 'completed') current.completed += 1;
      progress.set(step.job_id, current);
    }
    return progress;
  }, [steps]);
  const visible = useMemo(() => rows.filter((item) => {
    if (!matchesQueueFilter(item, filter, area?.code, user?.id)) return false;
    const needle = search.trim().toLocaleLowerCase('es');
    return !needle || `${item.job.sale_code || ''} ${item.job.customer_name || ''} ${item.job.title} ${item.step?.title || ''}`.toLocaleLowerCase('es').includes(needle);
  }).sort((a, b) => {
    const aScore = priorityDetails(a); const bScore = priorityDetails(b);
    return bScore.score - aScore.score || (safeDate(queueDueAt(a))?.getTime() || Infinity) - (safeDate(queueDueAt(b))?.getTime() || Infinity);
  }), [rows, filter, search, area?.code, user?.id]);
  const viewItems = useMemo<ProductionQueueViewItem<QueueItem>[]>(() => visible.map((item) => {
    const shownStep = item.step || item.currentStep;
    const status = shownStep?.status || 'waiting';
    const owner = area?.code === 'ASE' ? item.job.advisor_id : item.step?.assigned_to;
    const dueAt = queueDueAt(item);
    return {
      id: `${item.job.id}-${item.step?.id || 'advisor'}`,
      title: item.step ? `${item.step.title} · ${item.job.title}` : item.job.title,
      code: item.job.sale_code || 'TRABAJO',
      customer: item.job.customer_name || 'Cliente por consultar',
      dueAt,
      dueKey: dayKey(dueAt),
      status,
      statusLabel: STATUS_LABELS[status] || status,
      ownerLabel: owner === user?.id ? 'A mi cargo' : owner ? 'Asignado' : 'Sin responsable',
      overdue: isLate(item),
      original: item,
    };
  }), [visible, area?.code, user?.id]);
  const selectedJob = jobs.find((job) => job.id === selectedJobId) || null;
  const selectedSteps = steps.filter((step) => step.job_id === selectedJob?.id).sort((a, b) => a.step_order - b.step_order);
  const selectedStep = selectedSteps.find((step) => step.id === selectedStepId) || (area?.code === 'ASE' ? currentStage(selectedSteps) : selectedSteps.find((step) => step.area_id === areas.find((entry) => entry.code === area?.code)?.id)) || null;
  const selectedEvents = events.filter((event) => event.job_id === selectedJob?.id).slice(0, 30);
  const selectedStepChecks = stepChecks.filter((check) => check.step_id === selectedStep?.id);
  const reworkCandidates = selectedStep ? selectedSteps.filter((step) => step.status === 'completed' && step.step_order <= selectedStep.step_order) : [];
  const selectedReworkTarget = reworkCandidates.find((step) => step.id === reworkTarget) || reworkCandidates.at(-1) || null;
  const reviewRequest = selectedEvents.find((event) => event.event_type === 'specification_review_changes_requested'
    && event.details?.to_version === selectedJob?.spec_version
    && event.details?.from_version === selectedJob?.review_from_version);
  const reviewRequestNote = typeof reviewRequest?.details?.note === 'string' ? reviewRequest.details.note : null;
  useEffect(() => {
    setDraftAssignee(selectedStep?.assigned_to || '');
    setDraftDueAt(localDateTime(selectedStep?.due_at));
    setCoordinationNote('');
  }, [selectedStep?.id, selectedStep?.updated_at]);
  useEffect(() => {
    if (!selectedStep || !canCoordinate || !supabase) {
      setEligibleStaff([]);
      setStaffError('');
      setStaffLoading(false);
      return;
    }
    let active = true;
    setStaffLoading(true);
    setStaffError('');
    void supabase.rpc('list_production_step_assignees', { p_step_id: selectedStep.id }).then(({ data, error }) => {
      if (!active) return;
      setEligibleStaff(error ? [] : (data || []) as Assignee[]);
      setStaffError(error ? 'No pudimos consultar el personal habilitado. Actualiza la ficha e inténtalo de nuevo.' : '');
      setStaffLoading(false);
    });
    return () => { active = false; };
  }, [selectedStep?.id, canCoordinate, revision]);
  const canEditSelectedSpec = Boolean(selectedJob && selectedJob.advisor_id === user?.id && canEditSales);
  const isSiteVisitEditor = area?.code === 'TAL' && selectedStep?.step_key === 'site_visit'
    && selectedStep.assigned_to === user?.id && canEditWorkshop && canActInArea('TAL');
  const showSpecEditor = selectedJob && (canEditSelectedSpec || isSiteVisitEditor)
    && ['open', 'needs_review'].includes(selectedJob.status);
  useEffect(() => {
    const spec = selectedJob?.specifications || {};
    const fields = ['description', 'width_cm', 'height_cm', 'material', 'finish', 'installation_address', 'site_visit_notes'];
    setDraftSpec(Object.fromEntries(fields.map((key) => [key, String(spec[key] ?? '')])));
    setDraftRoute('print');
  }, [selectedJob?.id, selectedJob?.spec_version]);
  useEffect(() => {
    setFulfillmentDueAt(localDateTime(selectedJob?.fulfillment_due_at));
  }, [selectedJob?.id, selectedJob?.fulfillment_due_at, selectedJob?.status]);
  useEffect(() => {
    setArtworkReference(selectedJob?.artwork_reference || '');
    setArtworkNote('');
    setArtworkFile(null);
    setArtworkFileKey((value) => value + 1);
  }, [selectedJob?.id, selectedJob?.artwork_revision]);
  const currentAreaName = (id: string) => areas.find((row) => row.id === id)?.name || 'Área de trabajo';
  const renderQueueCard = (viewItem: ProductionQueueViewItem<QueueItem>, compact = false) => {
    const item = viewItem.original;
    const shownStep = item.step || item.currentStep;
    const status = shownStep?.status || 'waiting';
    const owner = area.code === 'ASE' ? item.job.advisor_id : item.step?.assigned_to;
    const progress = stageProgress.get(item.job.id);
    const priority = priorityDetails(item);
    return <article className={`pj-card${viewItem.overdue ? ' is-overdue' : ''}${compact ? ' pj-card--compact' : ''}`} data-state={status} onPointerMove={moveCardSpotlight}>
      <div className="pj-card-main"><div className="pj-card-top"><span className="pj-card-code">{viewItem.code}</span><span className="pj-status" data-state={status}>{status === 'blocked' ? <AlertTriangle size={12}/> : status === 'completed' ? <CircleCheck size={12}/> : <Clock3 size={12}/>} {viewItem.statusLabel}</span>{priority.score > 0 && <span className="pj-priority" title={priority.reason}>Prioridad {priority.score} · {priority.reason}</span>}</div>
        <h2>{viewItem.title}</h2><div className="pj-card-meta"><span><UserRound size={13}/>{viewItem.customer}</span><span><CalendarClock size={13}/>{viewItem.overdue ? <b className="is-late">Atrasado · {stamp(viewItem.dueAt)}</b> : stamp(viewItem.dueAt)}</span><span>{owner === user?.id ? 'A mi cargo' : owner ? 'Asignado' : 'Sin responsable'}</span></div>
        {item.step?.status === 'waiting' && item.step.readiness_reasons?.length ? <p className="pj-card-next">Pendiente: <b>{item.step.readiness_reasons.map((reason) => reason.message).join(' · ')}</b></p> : null}
        {area.code === 'ASE' && shownStep && <p className="pj-card-next">Ahora: <b>{shownStep.title}</b> · {currentAreaName(shownStep.area_id)}</p>}{item.step?.notes && <p className="pj-card-next">Indicación: <b>{item.step.notes}</b></p>}
        {!compact && progress && <ProductionStageProgress completed={progress.completed} total={progress.total} title={item.job.title}/>}</div>
      <button type="button" className="pj-card-action" onClick={() => openJob(item)} aria-label={`Abrir ficha de ${item.job.title}`}>Ver ficha <ArrowRight size={14}/></button>
    </article>;
  };
  const openJob = (item: QueueItem) => {
    const params = new URLSearchParams(searchParams);
    params.set('trabajo', item.job.id);
    if (item.step) params.set('paso', item.step.id); else params.delete('paso');
    setActionError(''); setActionMessage(''); setActionNote(''); setSearchParams(params);
  };
  const closeJob = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('trabajo'); params.delete('job'); params.delete('paso'); setSearchParams(params);
    setActionError(''); setActionMessage(''); setActionNote('');
  };
  const chooseStep = (stepId: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('paso', stepId);
    setActionError(''); setActionMessage(''); setSearchParams(params);
  };
  const refreshAfterChange = () => {
    window.dispatchEvent(new Event('visualcorp:production-changed'));
  };
  const saveCoordination = async () => {
    if (!supabase || !selectedStep || !selectedJob || !canCoordinate || busy || staffLoading || staffError
      || !isOpen(selectedStep.status) || selectedJob.status === 'completed' || selectedJob.status === 'cancelled') return;
    const parsed = draftDueAt ? new Date(draftDueAt) : null;
    if (draftDueAt && (!parsed || Number.isNaN(parsed.getTime()))) {
      setActionError('Escribe una fecha y hora válidas.'); return;
    }
    const assignee = draftAssignee || null;
    const dueAt = draftDueAt === localDateTime(selectedStep.due_at)
      ? selectedStep.due_at : parsed?.toISOString() || null;
    if (assignee === selectedStep.assigned_to && dueAt === selectedStep.due_at) {
      setActionError('Cambia el responsable o la fecha antes de guardar.'); return;
    }
    setBusy(true); setActionError(''); setActionMessage('');
    try {
      const { error } = await supabase.rpc('coordinate_production_job_step', {
        p_step_id: selectedStep.id, p_expected_updated_at: selectedStep.updated_at,
        p_assigned_to: assignee, p_due_at: dueAt, p_note: coordinationNote.trim(),
      });
      if (error) throw error;
      setActionMessage('Responsable y fecha guardados. El cambio quedó registrado en el historial.');
      refreshAfterChange();
    } catch (error) { setActionError(error instanceof Error ? error.message : 'No pudimos coordinar la etapa.'); }
    finally { setBusy(false); }
  };
  const runStepAction = async (action: 'take' | 'start' | 'complete' | 'block' | 'unblock') => {
    if (!supabase || !selectedStep || busy || !area || !canActInArea(area.code)
      || !(canEditWorkshop || canEditSales && area.code === 'ASE')) return;
    if (action === 'block' && actionNote.trim().length < 3) { setActionError('Explica por qué se bloquea este trabajo.'); return; }
    setBusy(true); setActionError(''); setActionMessage('');
    try {
      const { error } = await supabase.rpc('transition_production_job_step', {
        p_step_id: selectedStep.id, p_action: action, p_note: actionNote.trim(), p_assigned_to: null,
      });
      if (error) throw error;
      setActionNote(''); setActionMessage('Cambio guardado. La siguiente etapa se actualiza automáticamente cuando corresponde.');
      refreshAfterChange();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos actualizar esta etapa.');
    } finally { setBusy(false); }
  };
  const receiveStep = async () => {
    if (!supabase || !selectedStep || busy) return;
    setBusy(true); setActionError(''); setActionMessage('');
    try {
      const { error } = await supabase.rpc('receive_production_job_step', { p_step_id: selectedStep.id, p_note: actionNote.trim() });
      if (error) throw error;
      setActionNote(''); setActionMessage('Recepción registrada. La etapa queda a cargo de esta área.'); refreshAfterChange();
    } catch (error) { setActionError(error instanceof Error ? error.message : 'No pudimos recibir la etapa.'); }
    finally { setBusy(false); }
  };
  const updateStepCheck = async (check: StepCheck, completed: boolean) => {
    if (!supabase || busy) return;
    setBusy(true); setActionError(''); setActionMessage('');
    try {
      const { error } = await supabase.rpc('set_production_step_check', {
        p_check_id: check.id, p_completed: completed, p_evidence_url: evidenceDrafts[check.id]?.trim() || '', p_note: '',
      });
      if (error) throw error;
      refreshAfterChange();
    } catch (error) { setActionError(error instanceof Error ? error.message : 'No pudimos guardar el control.'); }
    finally { setBusy(false); }
  };
  const requestRework = async () => {
    const targetId = selectedReworkTarget?.id || reworkTarget;
    if (!supabase || !selectedJob || !selectedStep || !targetId || busy || actionNote.trim().length < 3) {
      setActionError('Selecciona la etapa que debe repetirse y explica el motivo.'); return;
    }
    setBusy(true); setActionError(''); setActionMessage('');
    try {
      const { error } = await supabase.rpc('request_production_job_rework', {
        p_report_step: selectedStep.id, p_target_step: targetId, p_note: actionNote.trim(),
      });
      if (error) throw error;
      setActionNote(''); setActionMessage('Retrabajo registrado; las etapas afectadas se reabrieron y el equipo recibió el aviso.'); refreshAfterChange();
    } catch (error) { setActionError(error instanceof Error ? error.message : 'No pudimos solicitar el retrabajo.'); }
    finally { setBusy(false); }
  };
  const updateFulfillment = async (action: 'quality_pass' | 'schedule_delivery' | 'deliver' | 'install') => {
    if (!supabase || !selectedJob || busy) return;
    const due = fulfillmentDueAt ? new Date(fulfillmentDueAt) : null;
    if (action === 'schedule_delivery' && (!due || Number.isNaN(due.getTime()))) { setActionError('Elige la fecha y hora de entrega.'); return; }
    setBusy(true); setActionError(''); setActionMessage('');
    try {
      const { error } = await supabase.rpc('transition_production_job_fulfillment', {
        p_job_id: selectedJob.id, p_action: action, p_due_at: action === 'schedule_delivery' ? due?.toISOString() : null,
        p_note: actionNote.trim(),
      });
      if (error) throw error;
      setActionNote(''); setActionMessage('Control de calidad o entrega registrado en el historial.'); refreshAfterChange();
    } catch (error) { setActionError(error instanceof Error ? error.message : 'No pudimos actualizar la entrega.'); }
    finally { setBusy(false); }
  };
  const configurePhysicalQuantity = async () => {
    const quantity = Number(physicalQuantity);
    if (!supabase || !selectedJob || busy || !canManageFulfillment) return;
    if (!Number.isFinite(quantity) || quantity <= 0 || !physicalUnit.trim()) { setActionError('Indica la cantidad física total y su unidad.'); return; }
    setBusy(true); setActionError(''); setActionMessage('');
    try {
      const { error } = await supabase.rpc('configure_production_job_quantity', {
        p_job_id: selectedJob.id, p_quantity: quantity, p_unit: physicalUnit.trim(),
      });
      if (error) throw error;
      setPhysicalQuantity(''); setLotNote('');
      setActionMessage('Cantidad física configurada. El lote completo sigue en producción hasta registrar los tramos terminados.');
      refreshAfterChange();
    } catch (error) { setActionError(error instanceof Error ? error.message : 'No pudimos configurar la cantidad física.'); }
    finally { setBusy(false); }
  };
  const transitionLot = async (lot: ProductionLot, action: 'submit_quality' | 'approve_quality' | 'request_rework' | 'schedule_delivery' | 'deliver' | 'install') => {
    if (!supabase || !selectedJob || busy) return;
    const rawQuantity = lotQuantityDrafts[lot.id]?.trim() || '';
    const quantity = rawQuantity ? Number(rawQuantity) : null;
    const due = fulfillmentDueAt ? new Date(fulfillmentDueAt) : null;
    if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) { setActionError('La cantidad del tramo debe ser mayor a cero.'); return; }
    if (action === 'request_rework' && lotNote.trim().length < 3) { setActionError('Explica el motivo del retrabajo.'); return; }
    if (action === 'schedule_delivery' && (!due || Number.isNaN(due.getTime()))) { setActionError('Elige una fecha y hora de entrega.'); return; }
    setBusy(true); setActionError(''); setActionMessage('');
    try {
      const { error } = await supabase.rpc('transition_production_job_lot', {
        p_lot_id: lot.id, p_action: action, p_quantity: quantity,
        p_due_at: action === 'schedule_delivery' ? due?.toISOString() : null, p_note: lotNote.trim(),
      });
      if (error) throw error;
      setLotNote(''); setLotQuantityDrafts((current) => ({ ...current, [lot.id]: '' }));
      setActionMessage('Movimiento del lote guardado con cantidad, responsable y fecha en el historial.');
      refreshAfterChange();
    } catch (error) { setActionError(error instanceof Error ? error.message : 'No pudimos actualizar este lote.'); }
    finally { setBusy(false); }
  };
  const saveSpecifications = async () => {
    if (!supabase || !selectedJob || !showSpecEditor || busy) return;
    const current = selectedJob.specifications || {};
    const keys = isSiteVisitEditor && !canEditSelectedSpec
      ? ['width_cm', 'height_cm', 'site_visit_notes']
      : ['description', 'width_cm', 'height_cm', 'material', 'finish', 'installation_address', 'site_visit_notes'];
    const next = { ...current };
    keys.forEach((key) => {
      const value = draftSpec[key]?.trim() || '';
      if (value !== String(current[key] ?? '')) next[key] = value;
    });
    if (JSON.stringify(next) === JSON.stringify(current) && !actionNote.trim()) {
      setActionError('Añade un cambio o una nota antes de guardar.'); return;
    }
    setBusy(true); setActionError(''); setActionMessage('');
    try {
      const { error } = await supabase.rpc('update_production_job', {
        p_job_id: selectedJob.id, p_expected_version: selectedJob.spec_version,
        p_specifications: next, p_note: actionNote.trim(),
      });
      if (error) throw error;
      setActionNote(''); setActionMessage('Ficha actualizada y cambio registrado para todas las áreas.');
      refreshAfterChange();
    } catch (error) { setActionError(error instanceof Error ? error.message : 'No pudimos guardar los detalles.'); }
    finally { setBusy(false); }
  };
  const chooseWorkflow = async () => {
    if (!supabase || !selectedJob || busy || !canEditSelectedSpec) return;
    setBusy(true); setActionError(''); setActionMessage('');
    try {
      const { error } = await supabase.rpc('choose_production_job_workflow', {
        p_job_id: selectedJob.id, p_workflow_code: draftRoute,
        p_expected_version: selectedJob.spec_version, p_note: actionNote.trim(),
      });
      if (error) throw error;
      setActionNote(''); setActionMessage('Ruta definida. Las etapas se asignaron automáticamente.');
      refreshAfterChange();
    } catch (error) { setActionError(error instanceof Error ? error.message : 'No pudimos definir la ruta.'); }
    finally { setBusy(false); }
  };
  const submitArtwork = async () => {
    if (!supabase || !selectedJob || !selectedStep || busy || selectedStep.step_key !== 'design'
      || selectedStep.assigned_to !== user?.id || !canActInArea('DIS') || !canEditWorkshop) return;
    if (artworkFile) {
      if (!ARTWORK_FILE_TYPES[artworkFile.type] || artworkFile.size > ARTWORK_FILE_MAX_BYTES || artworkFile.size === 0) {
        setActionError('Usa PNG, JPG, WebP o PDF de hasta 6 MB.'); return;
      }
    } else if (!artworkReference.startsWith('storage://production-artwork/')) {
      try {
        const url = new URL(artworkReference.trim());
        if (url.protocol !== 'https:' || !url.hostname) throw new Error('Enlace inválido');
      } catch { setActionError('Añade un enlace HTTPS válido o selecciona un archivo.'); return; }
    }
    setBusy(true); setActionError(''); setActionMessage('');
    try {
      let reference = artworkReference.trim();
      if (artworkFile) {
        const path = `${selectedJob.organization_id}/${selectedJob.id}/${crypto.randomUUID()}.${ARTWORK_FILE_TYPES[artworkFile.type]}`;
        const { error: uploadError } = await supabase.storage.from('production-artwork').upload(path, artworkFile, {
          contentType: artworkFile.type, cacheControl: '3600', upsert: false,
        });
        if (uploadError) throw new Error(`No pudimos subir la prueba privada: ${uploadError.message}`);
        reference = `storage://production-artwork/${path}`;
        setArtworkReference(reference);
        setArtworkFile(null);
        setArtworkFileKey((value) => value + 1);
      }
      const { error } = await supabase.rpc('submit_production_artwork', {
        p_job_id: selectedJob.id, p_reference: reference, p_note: artworkNote.trim(),
      });
      if (error) throw error;
      setArtworkNote(''); setActionMessage('Arte entregado. Asesoría recibirá un aviso para aprobarlo o pedir correcciones.');
      refreshAfterChange();
    } catch (error) { setActionError(error instanceof Error ? error.message : 'No pudimos entregar el arte.'); }
    finally { setBusy(false); }
  };
  const reviewArtwork = async (decision: 'approved' | 'changes_requested') => {
    if (!supabase || !selectedJob || busy || !(canCoordinate || canEditSelectedSpec)) return;
    if (decision === 'changes_requested' && artworkNote.trim().length < 3) {
      setActionError('Explica qué debe corregir Diseño.'); return;
    }
    setBusy(true); setActionError(''); setActionMessage('');
    try {
      const { error } = await supabase.rpc('review_production_artwork', {
        p_job_id: selectedJob.id, p_expected_revision: selectedJob.artwork_revision,
        p_decision: decision, p_note: artworkNote.trim(),
      });
      if (error) throw error;
      setArtworkNote('');
      setActionMessage(decision === 'approved' ? 'Arte aprobado. La siguiente etapa se habilitó si cumple los demás requisitos.' : 'Correcciones enviadas. Diseño puede retomar su etapa.');
      refreshAfterChange();
    } catch (error) { setActionError(error instanceof Error ? error.message : 'No pudimos registrar la revisión.'); }
    finally { setBusy(false); }
  };

  if (!area) return <Navigate to="/operaciones/trabajos/asesoria" replace/>;
  if ((area.code === 'ASE' ? !canSeeAdvisory : !canSeeWorkshop)) return <AppFrame area="operations"><PageHeading eyebrow="TRABAJOS" title="Sin acceso a esta área" description="Pide a un responsable que revise los permisos de tu perfil."/></AppFrame>;
  const Icon = area.icon;
  const canChangeSelected = selectedJob?.status !== 'needs_review' && canActInArea(area.code)
    && (area.code === 'ASE' ? canEditSelectedSpec : canEditWorkshop)
    && Boolean(selectedStep && selectedStep.area_id === areas.find((row) => row.code === area.code)?.id);
  const assignedToMe = selectedStep?.assigned_to === user?.id;
  const canSubmitArtwork = selectedJob?.approval_required && selectedJob.status === 'open'
    && selectedStep?.step_key === 'design' && assignedToMe && canActInArea('DIS') && canEditWorkshop
    && ['awaiting_art', 'changes_requested'].includes(selectedJob.artwork_review_status)
    && ['in_progress', 'completed'].includes(selectedStep.status);
  const canReviewArtwork = selectedJob?.approval_required && selectedJob.status === 'open'
    && selectedJob.artwork_review_status === 'awaiting_review' && (canCoordinate || canEditSelectedSpec);
  const isAssignedAdvisor = Boolean(selectedJob && selectedSteps.some((step) => areas.find((entry) => entry.id === step.area_id)?.code === 'ASE' && step.assigned_to === user?.id));
  const canManageFulfillment = Boolean(selectedJob && (canCoordinate || (canEditSales && (selectedJob.advisor_id === user?.id || isAssignedAdvisor))));
  const canSubmitQuantity = Boolean(canManageFulfillment || selectedSteps.some((step) => step.assigned_to === user?.id && step.status === 'in_progress'));
  const lotQuantityTotal = (statuses: string[]) => productionLots.filter((lot) => statuses.includes(lot.status)).reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
  const lotStatusLabel: Record<string, string> = { in_production: 'En producción', quality_check: 'Control de calidad', ready_for_delivery: 'Calidad aprobada', scheduled: 'Entrega programada', delivered: 'Entregado', installed: 'Instalado' };
  return <AppFrame area="operations"><main className="production-jobs">
    <PageHeading eyebrow="OPERACIONES · TRABAJOS" title={area.name} description={area.intro} action={<button className="button button-outline" type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading}><RefreshCw size={15}/> Actualizar</button>}/>
    <nav className="pj-area-nav" aria-label="Áreas de trabajo">{AREA_CONFIG.filter((entry) => entry.code === 'ASE' ? canSeeAdvisory : canSeeWorkshop).map((entry) => { const AreaIcon = entry.icon; return <Link key={entry.slug} to={`/operaciones/trabajos/${entry.slug}`} aria-current={entry.slug === area.slug ? 'page' : undefined}><AreaIcon size={15}/>{entry.name}</Link>; })}</nav>
    <p className="pj-intro">Organiza la carga de esta área por fecha, etapa o formato. Abre cada trabajo para consultar la solicitud, sus pasos y los cambios registrados.</p>
    <ProductionQueueSummary total={filterCounts.all} unassigned={filterCounts.unassigned} overdue={filterCounts.overdue} blocked={filterCounts.blocked} loading={loading}/>
    <div className="pj-toolbar"><div className="pj-filter" role="group" aria-label="Filtrar trabajos">{FILTERS.map((entry) => <button type="button" key={entry.id} aria-pressed={filter === entry.id} onClick={() => setFilter(entry.id)}>{entry.label}{!loading && <span className="pj-filter-count" aria-label={`${filterCounts[entry.id]} trabajos`}>{filterCounts[entry.id]}</span>}</button>)}</div><label className="pj-search"><span>Buscar trabajo</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente, venta o producto"/></label></div>
    <div className="pj-count" role="status" aria-live="polite">{loading ? 'Cargando trabajos…' : `${visible.length} ${visible.length === 1 ? 'trabajo visible' : 'trabajos visibles'}`}</div>
    {loadError && <div className="pj-error" role="alert">No pudimos consultar las órdenes actuales. {loadError} <button className="button button-outline" type="button" onClick={() => setRevision((value) => value + 1)}>Reintentar</button></div>}
    {!loading && !loadError && !visible.length && <div className="pj-empty"><Icon size={23}/><b>{rows.length ? 'No hay trabajos para este filtro' : 'No hay trabajos asignados a esta área'}</b><p>{rows.length ? 'Cambia el filtro o busca por cliente, venta o producto.' : 'Los nuevos trabajos aparecerán aquí al confirmar una venta con una ruta de producción configurada.'}</p>{rows.length > 0 && (filter !== 'all' || search) && <button className="button button-outline" type="button" onClick={() => { setFilter('all'); setSearch(''); }}>Mostrar todos</button>}</div>}
    {loading && !loadError && <ProductionQueueSkeleton/>}
    {!loading && !loadError && visible.length > 0 && <ProductionQueueViews areaSlug={area.slug} areaName={area.name} items={viewItems} today={todayKey()} renderCard={renderQueueCard} onOpen={(item) => openJob(item.original)}/>}
    {!loading && !loadError && rows.length >= queueLimit && <div className="pj-count"><span>Se muestran los {queueLimit} trabajos más recientes de esta área.</span> <button className="button button-outline" type="button" onClick={() => setQueueLimit((value) => value + 150)}>Cargar más</button></div>}
    <div className="pj-detail-modal"><Sheet open={Boolean(selectedJob)} onOpenChange={(open) => { if (!open) closeJob(); }} title={selectedJob?.sale_code ? `Trabajo ${selectedJob.sale_code}` : 'Ficha de trabajo'} description={selectedJob ? selectedJob.customer_name || 'Seguimiento de producción' : undefined}><div className="pj-detail">
      {selectedJob && <><div className="pj-detail-hero"><span className="pj-card-code">ORDEN DE TRABAJO · VERSIÓN {selectedJob.spec_version}</span><h3>{selectedJob.title}</h3><p>Las indicaciones se comparten entre asesoría y producción. Cada cambio queda asociado a la ficha.</p></div><dl className="pj-detail-facts"><div><dt>Cliente</dt><dd>{selectedJob.customer_name || 'Por consultar'}</dd></div><div><dt>Teléfono</dt><dd>{selectedJob.customer_phone || 'Por consultar'}</dd></div><div><dt>Venta</dt><dd>{selectedJob.sale_code || 'Sin código'}</dd></div><div><dt>Fecha prevista</dt><dd>{stamp(selectedJob.due_at)}</dd></div></dl>
      {selectedJob.status === 'needs_review' && <ProductionSpecReview
        key={`${selectedJob.id}:${selectedJob.spec_version}`}
        jobId={selectedJob.id}
        version={selectedJob.spec_version}
        fromVersion={selectedJob.review_from_version}
        current={selectedJob.specifications || {}}
        canResolve={canCoordinate}
        lastRequest={reviewRequestNote}
        onDecided={(decision) => {
          setActionMessage(decision === 'accepted'
            ? 'Cambio técnico aceptado. Las etapas correspondientes se actualizaron.'
            : 'Corrección solicitada. El trabajo permanece detenido hasta la revisión de la ficha.');
          refreshAfterChange();
        }}
      />}
      <section><h4>Detalles del trabajo</h4>{Object.keys(selectedJob.specifications || {}).length ? <dl className="pj-detail-facts">{Object.entries(selectedJob.specifications || {}).map(([key, value]) => <div key={key}><dt>{humanKey(key)}</dt><dd>{key === 'artwork_status' ? ({ pending: 'Por definir', design_needed: 'Hay que diseñarlo', provided: 'Archivo del cliente', approved: 'Archivo indicado como aprobado al vender' }[String(value)] || presentValue(value)) : presentValue(value)}</dd></div>)}</dl> : <p className="pj-note">Aún no hay especificaciones adicionales. Solicita al asesor los datos que faltan antes de empezar.</p>}</section>
      {selectedStep && <ProductionHandoff step={selectedStep} areas={areas} specifications={selectedJob.specifications}/>}
      {selectedJob.approval_required && <section className="pj-artwork" aria-label="Revisión del arte"><div className="pj-artwork-top"><div><span className="pj-artwork-eyebrow">CONTROL DE ARTE</span><h4>Revisión antes de producir</h4></div><span className="pj-artwork-state" data-state={selectedJob.artwork_review_status}>{({ awaiting_art: 'Diseño pendiente', awaiting_review: 'Por aprobar', changes_requested: 'Correcciones', approved: 'Aprobado', not_required: 'Sin revisión' })[selectedJob.artwork_review_status]}</span></div><p>{({ awaiting_art: 'Diseño prepara el archivo y comparte un enlace para que Asesoría lo revise.', awaiting_review: 'Asesoría revisa la versión entregada. Producción espera su decisión.', changes_requested: 'Diseño debe atender las correcciones y entregar una nueva versión.', approved: 'El arte fue aprobado. Las siguientes etapas avanzan según sus demás requisitos.', not_required: 'Este trabajo no requiere una revisión de arte.' })[selectedJob.artwork_review_status]}</p>{selectedJob.artwork_revision > 0 && <div className="pj-artwork-meta"><span>Versión {selectedJob.artwork_revision}</span><span>Entregado: {stamp(selectedJob.artwork_submitted_at)}</span>{selectedJob.artwork_reviewed_at && <span>Revisado: {stamp(selectedJob.artwork_reviewed_at)}</span>}</div>}<ProductionArtworkReference key={selectedJob.artwork_reference} reference={selectedJob.artwork_reference}/>{canSubmitArtwork && <div className="pj-artwork-form"><label>Prueba privada (PNG, JPG, WebP o PDF · hasta 6 MB)<input key={artworkFileKey} type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => { const file = event.target.files?.[0] || null; if (file && (!ARTWORK_FILE_TYPES[file.type] || file.size > ARTWORK_FILE_MAX_BYTES || file.size === 0)) { setActionError("Usa PNG, JPG, WebP o PDF de hasta 6 MB."); event.target.value = ""; setArtworkFile(null); } else { setActionError(""); setArtworkFile(file); } }}/></label><p className="pj-artwork-hint">La prueba queda privada. Para archivos de producción más grandes, usa un enlace HTTPS.</p>{artworkReference.startsWith("storage://production-artwork/") && !artworkFile && <p className="pj-artwork-hint">La prueba ya se subió. Pulsa entregar para registrarla en la orden.</p>}<label>O enlace HTTPS del arte<input type="url" inputMode="url" maxLength={1000} value={artworkReference.startsWith("storage://production-artwork/") ? "" : artworkReference} onChange={(event) => setArtworkReference(event.target.value)} placeholder="https://…"/></label><label>Nota de entrega <span className="pj-optional">opcional</span><textarea maxLength={1000} rows={2} value={artworkNote} onChange={(event) => setArtworkNote(event.target.value)} placeholder="Qué cambió en esta versión"/></label><button className="button button-dark" type="button" disabled={busy || (!artworkFile && !artworkReference.trim())} onClick={() => void submitArtwork()}>Entregar para aprobación <ArrowRight size={14}/></button></div>}{canReviewArtwork && <div className="pj-artwork-form"><label>Decisión para Diseño<textarea maxLength={1000} rows={2} value={artworkNote} onChange={(event) => setArtworkNote(event.target.value)} placeholder="Si pides correcciones, explica qué hay que cambiar"/></label><div className="pj-action-row"><button className="button button-dark" type="button" disabled={busy} onClick={() => void reviewArtwork('approved')}><Check size={14}/> Aprobar arte</button><button className="button button-outline" type="button" disabled={busy || artworkNote.trim().length < 3} onClick={() => void reviewArtwork('changes_requested')}>Pedir correcciones</button></div></div>}</section>}
      {selectedJob.workflow_code === 'review' && canEditSelectedSpec && <section className="pj-actions"><h4>Definir ruta de producción</h4><p className="pj-note">Elige el recorrido para activar las tareas de cada área. Revisa antes los detalles del pedido.</p><label>Recorrido<select value={draftRoute} onChange={(event) => setDraftRoute(event.target.value)}>{WORKFLOW_CHOICES.map((choice) => <option key={choice.code} value={choice.code}>{choice.label}</option>)}</select></label><button className="button button-dark" type="button" disabled={busy} onClick={() => void chooseWorkflow()}>Activar ruta <ArrowRight size={14}/></button></section>}
      {showSpecEditor && <section className="pj-actions"><h4>{isSiteVisitEditor && !canEditSelectedSpec ? 'Medidas de la visita' : 'Editar ficha del trabajo'}</h4><p className="pj-note">Los cambios se guardan con una nueva versión y quedan visibles para todas las áreas.</p><div className="pj-edit-grid"><label>Ancho (cm)<input type="number" min="0.01" step="0.01" inputMode="decimal" value={draftSpec.width_cm || ''} onChange={(event) => setDraftSpec((value) => ({ ...value, width_cm: event.target.value }))}/></label><label>Alto (cm)<input type="number" min="0.01" step="0.01" inputMode="decimal" value={draftSpec.height_cm || ''} onChange={(event) => setDraftSpec((value) => ({ ...value, height_cm: event.target.value }))}/></label></div>{(!isSiteVisitEditor || canEditSelectedSpec) && <><label>Descripción<textarea maxLength={4000} rows={3} value={draftSpec.description || ''} onChange={(event) => setDraftSpec((value) => ({ ...value, description: event.target.value }))}/></label><label>Material<input maxLength={180} value={draftSpec.material || ''} onChange={(event) => setDraftSpec((value) => ({ ...value, material: event.target.value }))}/></label><label>Acabado<input maxLength={220} value={draftSpec.finish || ''} onChange={(event) => setDraftSpec((value) => ({ ...value, finish: event.target.value }))}/></label><label>Dirección de instalación<input maxLength={400} value={draftSpec.installation_address || ''} onChange={(event) => setDraftSpec((value) => ({ ...value, installation_address: event.target.value }))}/></label></>}<label>Observaciones de la visita<textarea maxLength={1000} rows={2} value={draftSpec.site_visit_notes || ''} onChange={(event) => setDraftSpec((value) => ({ ...value, site_visit_notes: event.target.value }))}/></label><label>Motivo del cambio<textarea maxLength={1000} rows={2} value={actionNote} onChange={(event) => setActionNote(event.target.value)} placeholder="Ej. Medidas verificadas en el local del cliente"/></label><button className="button button-dark" type="button" disabled={busy} onClick={() => void saveSpecifications()}>Guardar detalles <Check size={14}/></button></section>}
      {canCoordinate && selectedStep && <section className="pj-actions pj-coordination" aria-label="Coordinación de etapas"><div className="pj-coordination-heading"><div><h4>Coordinar etapa</h4><p>Asigna a una persona del área y fija una fecha para este paso.</p></div><CalendarClock size={19} aria-hidden="true"/></div><label>Etapa<select value={selectedStep.id} onChange={(event) => chooseStep(event.target.value)}>{selectedSteps.map((step, index) => <option value={step.id} key={step.id}>{String(index + 1).padStart(2, '0')} · {step.title} · {currentAreaName(step.area_id)}</option>)}</select></label><p className="pj-coordination-status"><span className="pj-status" data-state={selectedStep.status}>{STATUS_LABELS[selectedStep.status]}</span><span>{currentAreaName(selectedStep.area_id)}</span></p>{isOpen(selectedStep.status) && selectedJob.status !== 'completed' && selectedJob.status !== 'cancelled' ? <><div className="pj-edit-grid"><label>Responsable<select value={draftAssignee} onChange={(event) => setDraftAssignee(event.target.value)} disabled={staffLoading || Boolean(staffError)}><option value="">Sin responsable</option>{selectedStep.assigned_to && !staffLoading && !staffError && !eligibleStaff.some((person) => person.user_id === selectedStep.assigned_to) && <option value={selectedStep.assigned_to} disabled>Responsable anterior sin acceso</option>}{eligibleStaff.map((person) => <option value={person.user_id} key={person.user_id}>{person.display_name}{person.user_id === user?.id ? ' (yo)' : ''}</option>)}</select></label><label>Fecha y hora límite<input type="datetime-local" value={draftDueAt} onChange={(event) => setDraftDueAt(event.target.value)}/></label></div>{staffLoading && <p className="pj-note" role="status">Cargando personas habilitadas…</p>}{staffError && <p className="pj-error" role="alert">{staffError}</p>}{!staffLoading && !staffError && !eligibleStaff.length && <p className="pj-note">No hay personas activas para esta área. La etapa puede quedar sin responsable.</p>}<label>Motivo o indicación para el equipo <span className="pj-optional">opcional</span><textarea maxLength={1000} rows={2} value={coordinationNote} onChange={(event) => setCoordinationNote(event.target.value)} placeholder="Ej. Priorizar para entrega del viernes"/></label><div className="pj-coordination-footer"><p>Los cambios se registran en el historial del trabajo.</p><button className="button button-dark" type="button" disabled={busy || staffLoading || Boolean(staffError) || (Boolean(draftAssignee) && !eligibleStaff.some((person) => person.user_id === draftAssignee)) || (draftAssignee === (selectedStep.assigned_to || '') && draftDueAt === localDateTime(selectedStep.due_at))} onClick={() => void saveCoordination()}><Check size={14}/> Guardar cambios</button></div></> : <p className="pj-note">Esta etapa ya terminó y su asignación quedó cerrada.</p>}</section>}
      <section><h4>Recorrido de producción</h4>{selectedSteps.length ? <ol className="pj-stages">{selectedSteps.map((step, index) => <li key={step.id} data-state={step.status}><span className="pj-stage-dot" aria-hidden="true">{step.status === 'completed' ? <Check size={12}/> : String(index + 1).padStart(2, '0')}</span><div className="pj-stage-copy"><b>{step.title} · {currentAreaName(step.area_id)}</b><small>{STATUS_LABELS[step.status]} · {step.assigned_to === user?.id ? 'A mi cargo' : step.assigned_to ? 'Asignado' : 'Sin responsable'} · {stamp(step.due_at)} · {step.due_at_is_manual ? 'Fecha manual' : `${step.estimated_minutes || 60} min estimados`}</small>{step.handoff_status === 'pending' && <small>Recepción pendiente del área</small>}{step.handoff_status === 'accepted' && step.received_at && <small>Recibida: {stamp(step.received_at)}</small>}{step.readiness_reasons?.map((reason) => <small key={reason.code}>Pendiente: {reason.message}</small>)}{step.notes && <small>{step.notes}</small>}</div></li>)}</ol> : <p className="pj-note">Todavía no hay etapas disponibles para esta ficha.</p>}</section>
      <section><h4>Historial de cambios</h4>{selectedEvents.length ? <ol className="pj-history">{selectedEvents.map((event) => <li key={event.id}><span className="pj-stage-dot" aria-hidden="true">·</span><div><b>{eventTitle(event)}</b><small> · {stamp(event.created_at)}</small>{eventNote(event) && <p>{eventNote(event)}</p>}</div></li>)}</ol> : <p className="pj-note">No hay cambios registrados todavía.</p>}</section>
      {canChangeSelected && selectedStep && <section className="pj-actions"><h4>Actualizar mi etapa</h4>{selectedStep.status === 'waiting' ? <div className="pj-decision-reasons"><p className="pj-note">Esta etapa está en espera:</p>{(selectedStep.readiness_reasons || []).map((reason) => <span key={reason.code}><Clock3 size={13}/>{reason.message}</span>)}</div> : <><label>Nota para el equipo<textarea maxLength={900} value={actionNote} onChange={(event) => setActionNote(event.target.value)} placeholder="Incluye una decisión, referencia o motivo de bloqueo"/></label>{selectedStepChecks.length > 0 && <div className="pj-checklist"><h5><ClipboardCheck size={15}/> Lista de control de esta etapa</h5>{selectedStepChecks.map((check) => <div className="pj-check" key={check.id}><label><input type="checkbox" checked={Boolean(check.completed_at)} disabled={busy || !['ready','in_progress'].includes(selectedStep.status) || !(assignedToMe || canCoordinate)} onChange={(event) => void updateStepCheck(check,event.target.checked)}/><span>{check.title}{!check.required && <small>Opcional</small>}{check.requires_evidence && <small>Requiere evidencia</small>}</span></label>{check.requires_evidence && !check.completed_at && <input className="pj-evidence-input" type="url" value={evidenceDrafts[check.id] || ''} onChange={(event) => setEvidenceDrafts((current) => ({...current,[check.id]:event.target.value}))} placeholder="Enlace HTTPS de evidencia"/>}{check.evidence_url && <a className="pj-check-evidence" href={check.evidence_url} target="_blank" rel="noreferrer">Ver evidencia registrada</a>}</div>)}</div>}<div className="pj-action-row">{selectedStep.status === 'ready' && selectedStep.handoff_status === 'pending' && (!selectedStep.assigned_to || assignedToMe || canCoordinate) && <button className="button button-dark" type="button" disabled={busy} onClick={() => void receiveStep()}><PackageCheck size={14}/> Recibir etapa</button>}{selectedStep.status === 'ready' && !selectedStep.assigned_to && <button className="button button-outline" type="button" disabled={busy} onClick={() => void runStepAction('take')}><UserRound size={14}/> Tomar tarea</button>}{selectedStep.status === 'ready' && assignedToMe && selectedStep.handoff_status !== 'pending' && <button className="button button-dark" type="button" disabled={busy} onClick={() => void runStepAction('start')}><Play size={14}/> Empezar</button>}{selectedStep.status === 'in_progress' && assignedToMe && !(selectedJob.approval_required && selectedStep.step_key === 'design') && <button className="button button-dark" type="button" disabled={busy} onClick={() => void runStepAction('complete')}><Check size={14}/> Marcar lista</button>}{selectedStep.status === 'blocked' && selectedJob.status !== 'needs_review' && (assignedToMe || canCoordinate) && <button className="button button-outline" type="button" disabled={busy} onClick={() => void runStepAction('unblock')}>Reanudar</button>}{['ready', 'in_progress'].includes(selectedStep.status) && assignedToMe && <button className="button button-outline" type="button" disabled={busy} onClick={() => void runStepAction('block')}><AlertTriangle size={14}/> Bloquear</button>}</div>{selectedStep.handoff_status === 'pending' && <p className="pj-note">El área anterior terminó. Recibe formalmente esta etapa antes de iniciarla.</p>}{selectedStep.assigned_to && !assignedToMe && isOpen(selectedStep.status) && !canCoordinate && <p className="pj-note">Esta etapa está a cargo de otra persona.</p>}</>}</section>}
      {selectedJob && <section className="pj-lots" aria-label="Control de cantidades, calidad y entrega por lote"><div className="pj-lots-heading"><div><span className="pj-artwork-eyebrow">PRODUCCIÓN PARCIAL</span><h4><PackageCheck size={16}/> Lotes, calidad y entrega</h4><p>La cantidad física se registra por separado de la facturación. Puedes cerrar y entregar una parte mientras el saldo continúa en producción.</p></div>{productionLots.length > 0 && <span className="pj-lots-state">{productionLots.length} {productionLots.length === 1 ? 'lote' : 'lotes'}</span>}</div>
        {productionLots.length ? <><div className="pj-lot-totals"><span>En producción <b>{lotQuantityTotal(['in_production']).toLocaleString('es-EC')} {productionLots[0]?.unit}</b></span><span>En calidad <b>{lotQuantityTotal(['quality_check']).toLocaleString('es-EC')} {productionLots[0]?.unit}</b></span><span>Aprobado <b>{lotQuantityTotal(['ready_for_delivery','scheduled']).toLocaleString('es-EC')} {productionLots[0]?.unit}</b></span><span>Entregado <b>{lotQuantityTotal(['delivered','installed']).toLocaleString('es-EC')} {productionLots[0]?.unit}</b></span></div>
          <div className="pj-lot-list">{productionLots.map((lot) => <article className="pj-lot" key={lot.id}><div className="pj-lot-main"><div><b>{lot.label}</b><small>{Number(lot.quantity).toLocaleString('es-EC')} {lot.unit}{lot.due_at ? ` · ${stamp(lot.due_at)}` : ''}</small></div><span data-state={lot.status}>{lotStatusLabel[lot.status] || lot.status}</span></div>{lot.notes && <p>{lot.notes}</p>}{!['installed','cancelled'].includes(lot.status) && <div className="pj-lot-actions">{lot.status !== 'delivered' && <label>Tramo a mover <input type="number" min="0.0001" max={lot.quantity} step="any" value={lotQuantityDrafts[lot.id] || ''} onChange={(event) => setLotQuantityDrafts((current) => ({ ...current, [lot.id]: event.target.value }))} placeholder={`Todo el lote (${lot.quantity})`}/></label>}{lot.status === 'in_production' && canSubmitQuantity && <button className="button button-outline" type="button" disabled={busy} onClick={() => void transitionLot(lot,'submit_quality')}>Enviar a calidad</button>}{lot.status === 'quality_check' && <>{canManageFulfillment && <button className="button button-dark" type="button" disabled={busy} onClick={() => void transitionLot(lot,'approve_quality')}><Check size={14}/> Aprobar cantidad</button>}{canManageFulfillment && <button className="button button-outline" type="button" disabled={busy} onClick={() => void transitionLot(lot,'request_rework')}><RotateCcw size={14}/> Devolver a producción</button>}</>}{['ready_for_delivery','scheduled'].includes(lot.status) && <><label>Fecha y hora<input type="datetime-local" value={fulfillmentDueAt || localDateTime(lot.due_at)} onChange={(event) => setFulfillmentDueAt(event.target.value)}/></label>{canManageFulfillment && <button className="button button-outline" type="button" disabled={busy || !fulfillmentDueAt && !lot.due_at} onClick={() => void transitionLot(lot,'schedule_delivery')}><CalendarClock size={14}/> Programar</button>}{canManageFulfillment && <button className="button button-dark" type="button" disabled={busy} onClick={() => void transitionLot(lot,'deliver')}>Confirmar entrega</button>}{canManageFulfillment && <button className="button button-outline" type="button" disabled={busy} onClick={() => void transitionLot(lot,'request_rework')}>Pedir retrabajo</button>}</>}{lot.status === 'delivered' && canManageFulfillment && <button className="button button-dark" type="button" disabled={busy} onClick={() => void transitionLot(lot,'install')}><Check size={14}/> Confirmar instalación</button>}</div>}</article>)}</div>
          {canManageFulfillment && productionLots.some((lot) => ['quality_check','ready_for_delivery','scheduled'].includes(lot.status)) && <label className="pj-lot-note">Observación de calidad o motivo del retrabajo<textarea maxLength={1000} rows={2} value={lotNote} onChange={(event) => setLotNote(event.target.value)} placeholder="Deja una razón breve y útil para el siguiente responsable"/></label>}
        </> : <>{canManageFulfillment && ['open','needs_review'].includes(selectedJob.status) && <><p className="pj-note">Activa esta opción al trabajar con cantidades físicas o entregas parciales. La cantidad del POS puede representar m² u otra base de facturación; no se copiará automáticamente.</p><div className="pj-lot-config"><label>Cantidad física total<input type="number" min="0.0001" max="1000000" step="any" value={physicalQuantity} onChange={(event) => setPhysicalQuantity(event.target.value)} placeholder="Ej. 50"/></label><label>Unidad física<input maxLength={24} value={physicalUnit} onChange={(event) => setPhysicalUnit(event.target.value)} placeholder="unidades, m, piezas…"/></label><button className="button button-dark" type="button" disabled={busy || !physicalQuantity.trim() || !physicalUnit.trim()} onClick={() => void configurePhysicalQuantity()}>Iniciar control por cantidades</button></div></>}</>}
        {canManageFulfillment && !productionLots.length && selectedJob.status === 'completed' && <section className="pj-fulfillment"><div><span className="pj-artwork-eyebrow">CIERRE Y ENTREGA</span><h4><ShieldCheck size={16}/> {selectedJob.workflow_code === 'none' ? 'Coordinar entrega' : 'Calidad y entrega'}</h4><p>{selectedJob.workflow_code === 'none' ? 'Esta ruta no requiere etapas de producción. Registra la fecha y confirma la entrega cuando corresponda.' : 'Al cerrar las etapas se abre el control de calidad; después podrás programar y registrar la entrega.'}</p></div><span className="pj-fulfillment-state">{selectedJob.fulfillment_status === 'ready_for_delivery' && selectedJob.workflow_code === 'none' ? 'Listo para entrega' : ({ quality_check: 'Control de calidad', ready_for_delivery: 'Calidad aprobada', scheduled: 'Entrega programada', delivered: 'Entregado', installed: 'Instalado', not_ready: 'No preparado' } as Record<string,string>)[selectedJob.fulfillment_status || 'quality_check'] || selectedJob.fulfillment_status}</span>{['ready_for_delivery','scheduled'].includes(selectedJob.fulfillment_status || '') && <label>Fecha y hora de entrega<input type="datetime-local" value={fulfillmentDueAt || localDateTime(selectedJob.fulfillment_due_at)} onChange={(event) => setFulfillmentDueAt(event.target.value)}/></label>}<label>{selectedJob.workflow_code === 'none' ? 'Nota de entrega' : 'Nota de calidad o entrega'}<textarea maxLength={1000} rows={2} value={actionNote} onChange={(event) => setActionNote(event.target.value)} placeholder={selectedJob.workflow_code === 'none' ? 'Horario, referencia o constancia de entrega' : 'Observación del acabado, horario o constancia de entrega'}/></label><div className="pj-action-row">{selectedJob.fulfillment_status === 'quality_check' && <button className="button button-dark" type="button" disabled={busy} onClick={() => void updateFulfillment('quality_pass')}><Check size={14}/> Aprobar calidad</button>}{['ready_for_delivery','scheduled'].includes(selectedJob.fulfillment_status || '') && <button className="button button-outline" type="button" disabled={busy || !fulfillmentDueAt && !selectedJob.fulfillment_due_at} onClick={() => void updateFulfillment('schedule_delivery')}><CalendarClock size={14}/> Programar entrega</button>}{['ready_for_delivery','scheduled'].includes(selectedJob.fulfillment_status || '') && <button className="button button-dark" type="button" disabled={busy} onClick={() => void updateFulfillment('deliver')}><PackageCheck size={14}/> Confirmar entrega</button>}{selectedJob.fulfillment_status === 'delivered' && <button className="button button-dark" type="button" disabled={busy} onClick={() => void updateFulfillment('install')}><Check size={14}/> Confirmar instalación</button>}</div>{selectedJob.fulfillment_note && <small>{selectedJob.fulfillment_note}</small>}</section>}
      </section>}
       {selectedStep?.status === 'completed' && selectedJob.status !== 'cancelled' && (canCoordinate || canActInArea(area.code)) && <section className="pj-actions pj-rework"><h4><RotateCcw size={15}/> Solicitar retrabajo</h4><p className="pj-note">Elige una etapa anterior terminada. Se reabrirán esa etapa y las dependientes que ya se completaron, con historial del motivo.</p><label>Etapa que debe repetirse<select value={selectedReworkTarget?.id || ''} onChange={(event) => setReworkTarget(event.target.value)}><option value="">Selecciona una etapa</option>{reworkCandidates.map((step) => <option value={step.id} key={step.id}>{step.title} · {currentAreaName(step.area_id)}</option>)}</select></label><label>Motivo del retrabajo<textarea maxLength={1000} rows={2} value={actionNote} onChange={(event) => setActionNote(event.target.value)} placeholder="Ej. La medida de la pieza final no coincide con la ficha"/></label><button className="button button-outline" type="button" disabled={busy || !selectedReworkTarget || actionNote.trim().length < 3} onClick={() => void requestRework()}><RotateCcw size={14}/> Reabrir etapa afectada</button></section>}
      {area.code === 'ASE' && <p className="pj-note">Para corregir las indicaciones del pedido, abre <Link to="/operaciones/mi-semana">Mi semana</Link>. Los cambios quedan visibles para cada área.</p>}
      {actionError && <p className="pj-error" role="alert">{actionError}</p>}{actionMessage && <p className="pj-note" role="status">{actionMessage}</p>}</>}
    </div></Sheet></div>
  </main></AppFrame>;
}
