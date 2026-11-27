/**
 * Visual Corp Suite — Production Job Detail Sheet (Fase 2.1)
 *
 * Ficha Unificada de Trabajo de Producción.
 * Diseñada para abrirse desde cualquier ruta (Áreas, Coordinación, Calendario, Mapa, Kiosk, Flujos)
 * con carga autónoma y segura de datos, manejo de permisos, reemplazo de datetime inputs
 * por DateTimePicker accesible de Calendar.tsx, navegación cruzada profunda y Chatter 360.
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  MapPin,
  MessageSquare,
  PackageCheck,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { Sheet, useConfirm } from '../../components/ui/OperationalKit';
import { DateTimePicker } from '../../components/ui/Calendar';
import { ChatterDrawer360 } from '../../components/ui/ChatterDrawer360';
import { ProductionMaterialPanel } from '../../components/inventory/ProductionMaterialPanel';
import { ProductionArtworkReference } from './ProductionArtworkReference';
import { ProductionSpecReview } from './ProductionSpecReview';
import {
  type AreaCode,
  type AreaSlug,
  type ProductionAreaRow,
  type ProductionAssignee,
  type ProductionJob,
  type ProductionJobEvent,
  type ProductionLot,
  type ProductionStep,
  type ProductionStepCheck,
  type StepStatus,
  AREA_CODE_TO_SLUG,
  EVENT_TITLE_LABELS,
  HANDOFF_FIELDS,
  SPEC_LABELS,
  STEP_STATUS_LABELS,
  WORKFLOW_CHOICES,
  currentStage,
  emitProductionChanged,
  fetchJobBalanceFlags,
  isStepOpen,
  localDateTime,
  resolveProductionPermissions,
  safeDate,
  stamp,
} from '../../lib/productionHub';

import './production-jobs.css';
import './production-queue-components.css';
import './production-job-detail-sheet.css';

/* ==========================================================================
   TIPOS Y PROPS EXPORTADOS
   ========================================================================== */

export interface ProductionJobDetailSheetProps {
  open: boolean;
  jobId: string | null;
  stepId?: string | null;
  contextAreaCode?: AreaCode | string | null;
  onClose: () => void;
  onChanged?: () => Promise<void> | void;
  onSelectStep?: (stepId: string) => void;
}

const ARTWORK_FILE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const ARTWORK_FILE_MAX_BYTES = 6 * 1024 * 1024;

const LOT_STATUS_LABELS: Record<string, string> = {
  in_production: 'En producción',
  quality_check: 'Control de calidad',
  ready_for_delivery: 'Calidad aprobada',
  scheduled: 'Entrega programada',
  delivered: 'Entregado',
  installed: 'Instalado',
};

const FULFILLMENT_LABELS: Record<string, string> = {
  quality_check: 'Control de calidad',
  ready_for_delivery: 'Calidad aprobada',
  scheduled: 'Entrega programada',
  delivered: 'Entregado',
  installed: 'Instalado',
  not_ready: 'No preparado',
};

const ARTWORK_STATUS_EXPLANATIONS: Record<string, string> = {
  awaiting_art: 'Diseño prepara el archivo y comparte un enlace para que Asesoría lo revise.',
  awaiting_review: 'Asesoría revisa la versión entregada. Producción espera su decisión.',
  changes_requested: 'Diseño debe atender las correcciones y entregar una nueva versión.',
  approved: 'El arte fue aprobado. Las siguientes etapas avanzan según sus demás requisitos.',
  not_required: 'Este trabajo no requiere una revisión de arte.',
};

const ARTWORK_STATUS_SHORT: Record<string, string> = {
  awaiting_art: 'Diseño pendiente',
  awaiting_review: 'Por aprobar',
  changes_requested: 'Correcciones',
  approved: 'Aprobado',
  not_required: 'Sin revisión',
};

const ARTWORK_INPUT_STATUS: Record<string, string> = {
  pending: 'Por definir',
  design_needed: 'Hay que diseñarlo',
  provided: 'Archivo del cliente',
  approved: 'Archivo indicado como aprobado al vender',
};

const presentValue = (value: unknown): string => {
  if (value == null || value === '') return 'Por definir';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (Array.isArray(value)) return value.map(presentValue).join(' · ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, part]) => `${SPEC_LABELS[key] || key.replaceAll('_', ' ')}: ${presentValue(part)}`)
      .join(' · ');
  }
  return String(value);
};

const humanKey = (key: string) =>
  SPEC_LABELS[key] || key.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const eventTitle = (event: ProductionJobEvent) =>
  EVENT_TITLE_LABELS[event.event_type] || event.event_type.replaceAll('_', ' ');

const eventNote = (event: ProductionJobEvent) => {
  if (event.event_type === 'step_coordinated') {
    const details = event.details || {};
    const changes: string[] = [];
    if (details.previous_assignee !== details.assigned_to) {
      const name =
        typeof details.assigned_to_name === 'string' && details.assigned_to_name.trim()
          ? details.assigned_to_name
          : 'integrante del equipo';
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

/* ==========================================================================
   COMPONENTE AUXILIAR: PASE ENTRE ÁREAS (HANDOFF)
   ========================================================================== */

function ProductionHandoffSection({
  step,
  areas,
  specifications,
  contextAreaCode,
}: {
  step: ProductionStep | null;
  areas: ProductionAreaRow[];
  specifications: Record<string, unknown> | null;
  contextAreaCode?: AreaCode | string | null;
}) {
  const currentStepArea = step ? areas.find((a) => a.id === step.area_id)?.code : null;
  const targetCode = (currentStepArea || contextAreaCode || '') as AreaCode;
  const fields = HANDOFF_FIELDS[targetCode] || [];
  if (!fields.length) return null;

  const filled = fields.filter(
    ([key]) =>
      specifications?.[key] !== undefined &&
      specifications?.[key] !== null &&
      String(specifications[key]).trim() !== ''
  );

  return (
    <section className="pj-handoff" aria-label={`Información para ${step?.title || targetCode}`}>
      <div className="pj-handoff-heading">
        <div>
          <span className="pj-artwork-eyebrow">PASE ENTRE ÁREAS</span>
          <h4>Información para {step?.title || `Área ${targetCode}`}</h4>
        </div>
        <span className="pj-handoff-count">
          {filled.length} de {fields.length} datos
        </span>
      </div>
      <p>
        Resumen de la ficha que acompaña este paso. Los requisitos que sí bloquean el avance aparecen
        en los motivos de preparación de la etapa.
      </p>
      <ul className="pj-handoff-list">
        {fields.map(([key, label]) => {
          const value = specifications?.[key];
          const complete = value !== undefined && value !== null && String(value).trim() !== '';
          return (
            <li key={key} data-complete={complete}>
              <span aria-hidden="true">{complete ? <Check size={13} /> : '•'}</span>
              <b>{label}</b>
              <small>{complete ? String(value) : 'Por confirmar en la ficha'}</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ==========================================================================
   COMPONENTE PRINCIPAL: ProductionJobDetailSheet
   ========================================================================== */

export function ProductionJobDetailSheet({
  open,
  jobId,
  stepId: initialStepId,
  contextAreaCode,
  onClose,
  onChanged,
  onSelectStep,
}: ProductionJobDetailSheetProps) {
  const auth = useAuth();
  const { user, organizationId } = auth;
  const confirm = useConfirm();
  const perms = useMemo(() => resolveProductionPermissions(auth), [auth]);

  // Estados de datos remotos
  const [job, setJob] = useState<ProductionJob | null>(null);
  const [steps, setSteps] = useState<ProductionStep[]>([]);
  const [stepChecks, setStepChecks] = useState<ProductionStepCheck[]>([]);
  const [productionLots, setProductionLots] = useState<ProductionLot[]>([]);
  const [events, setEvents] = useState<JobEventInternal[]>([]);
  const [areas, setAreas] = useState<ProductionAreaRow[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  // Estados de carga y error
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unauthorizedMessage, setUnauthorizedMessage] = useState<string | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);

  // Estados de acciones y borradores
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionNote, setActionNote] = useState('');

  // Arte
  const [artworkReference, setArtworkReference] = useState('');
  const [artworkNote, setArtworkNote] = useState('');
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [artworkFileKey, setArtworkFileKey] = useState(0);

  // Especificaciones y ruta
  const [draftSpec, setDraftSpec] = useState<Record<string, string>>({});
  const [draftRoute, setDraftRoute] = useState('print');

  // Coordinación
  const [eligibleStaff, setEligibleStaff] = useState<ProductionAssignee[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [draftAssignee, setDraftAssignee] = useState('');
  const [draftDueAt, setDraftDueAt] = useState('');
  const [coordinationNote, setCoordinationNote] = useState('');

  // Checklist de etapa
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<string, string>>({});

  // Retrabajo
  const [reworkTarget, setReworkTarget] = useState('');

  // Lotes y Entrega
  const [fulfillmentDueAt, setFulfillmentDueAt] = useState('');
  const [physicalQuantity, setPhysicalQuantity] = useState('');
  const [physicalUnit, setPhysicalUnit] = useState('unidad');
  const [lotQuantityDrafts, setLotQuantityDrafts] = useState<Record<string, string>>({});
  const [lotNote, setLotNote] = useState('');

  // Drawer de Chatter 360
  const [orphanArtworkPath, setOrphanArtworkPath] = useState('');
  const [chatterOpen, setChatterOpen] = useState(false);

  // Identificadores de accesibilidad
  const titleId = useId();
  const descId = useId();

  type JobEventInternal = ProductionJobEvent;

  /* ------------------------------------------------------------------------
     1. CARGA AUTÓNOMA DE DATOS
     ------------------------------------------------------------------------ */
  const loadJobDetail = useCallback(async () => {
    if (!open || !jobId || !organizationId || !supabase) return;

    setLoading(true);
    setLoadError(null);
    setUnauthorizedMessage(null);

    try {
      // Consultar trabajo principal
      const jobResult = await supabase
        .from('production_jobs')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('id', jobId)
        .maybeSingle();

      if (jobResult.error) throw jobResult.error;

      if (!jobResult.data) {
        setUnauthorizedMessage(
          `No se encontró el trabajo de producción ${jobId} o tu perfil no cuenta con permisos para consultarlo.`
        );
        setJob(null);
        setLoading(false);
        return;
      }

      const rawJob = jobResult.data as ProductionJob;

      // Guarda de permisos: si solo tiene sales.view y no workshop.view,
      // debe ser el asesor del trabajo o no tendrá acceso a la orden técnica.
      if (perms.isOnlySalesViewer && rawJob.advisor_id !== user?.id) {
        setUnauthorizedMessage(
          'Acceso restringido. Tu perfil tiene permisos de asesoría, pero este trabajo está asignado a otro asesor.'
        );
        setJob(null);
        setLoading(false);
        return;
      }

      if (!perms.canViewWorkshop && !perms.canViewSales && rawJob.advisor_id !== user?.id) {
        setUnauthorizedMessage('Acceso no autorizado para ver esta orden de trabajo.');
        setJob(null);
        setLoading(false);
        return;
      }

      // Consultar pasos, controles, lotes, eventos, áreas, branch, catalog_product y balance flags
      const [
        stepsResult,
        checksResult,
        lotsResult,
        eventsResult,
        areasResult,
        branchResult,
        productResult,
        balanceResult,
      ] = await Promise.all([
        supabase
          .from('production_job_steps')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('job_id', rawJob.id)
          .order('step_order', { ascending: true }),
        supabase
          .from('production_job_step_checks')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('job_id', rawJob.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('production_job_lots')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('job_id', rawJob.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('production_job_events')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('job_id', rawJob.id)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('areas').select('id, code, name').eq('organization_id', organizationId),
        rawJob.branch_id
          ? supabase
              .from('branches')
              .select('id, name, code')
              .eq('id', rawJob.branch_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        rawJob.catalog_product_id
          ? supabase
              .from('catalog_products')
              .select('id, name, sku')
              .eq('id', rawJob.catalog_product_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        fetchJobBalanceFlags(organizationId, [rawJob.id]),
      ]);

      if (stepsResult.error) throw stepsResult.error;
      if (checksResult.error) throw checksResult.error;
      if (lotsResult.error) throw lotsResult.error;
      if (eventsResult.error) throw eventsResult.error;
      if (areasResult.error) throw areasResult.error;

      const loadedSteps = (stepsResult.data || []) as ProductionStep[];
      const enrichedJob: ProductionJob = {
        ...rawJob,
        branch: branchResult.data || null,
        catalog_product: productResult.data || null,
        balance_due: balanceResult.flags[rawJob.id] || false,
      };

      setJob(enrichedJob);
      setSteps(loadedSteps);
      setStepChecks((checksResult.data || []) as ProductionStepCheck[]);
      setProductionLots((lotsResult.data || []) as ProductionLot[]);
      setEvents((eventsResult.data || []) as JobEventInternal[]);
      setAreas((areasResult.data || []) as ProductionAreaRow[]);

      // Preseleccionar etapa adecuada
      if (initialStepId && loadedSteps.some((s) => s.id === initialStepId)) {
        setSelectedStepId(initialStepId);
      } else if (contextAreaCode) {
        const matchingArea = (areasResult.data || []).find((a) => a.code === contextAreaCode);
        const areaStep = matchingArea
          ? loadedSteps.find((s) => s.area_id === matchingArea.id)
          : null;
        if (areaStep) {
          setSelectedStepId(areaStep.id);
        } else {
          setSelectedStepId(currentStage(loadedSteps)?.id || loadedSteps[0]?.id || null);
        }
      } else {
        setSelectedStepId(currentStage(loadedSteps)?.id || loadedSteps[0]?.id || null);
      }

      setLoading(false);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Error al consultar los datos del trabajo.'
      );
      setLoading(false);
    }
  }, [open, jobId, organizationId, initialStepId, contextAreaCode, perms, user?.id]);

  useEffect(() => {
    if (open && jobId) {
      void loadJobDetail();
    } else if (!open) {
      // Limpiar estados al cerrar
      setJob(null);
      setSteps([]);
      setStepChecks([]);
      setProductionLots([]);
      setEvents([]);
      setSelectedStepId(null);
      setActionError('');
      setActionMessage('');
      setActionNote('');
      setChatterOpen(false);
    }
  }, [open, jobId, loadJobDetail, refreshRevision]);

  /* ------------------------------------------------------------------------
     2. RESOLUCIÓN DE ETAPA SELECCIONADA Y ASIGNACIÓN DE BORRADORES
     ------------------------------------------------------------------------ */
  const selectedStep = useMemo(() => {
    if (!steps.length) return null;
    if (selectedStepId) {
      const match = steps.find((s) => s.id === selectedStepId);
      if (match) return match;
    }
    return currentStage(steps) || steps[0] || null;
  }, [steps, selectedStepId]);

  const selectedStepArea = useMemo(() => {
    if (!selectedStep) return null;
    return areas.find((a) => a.id === selectedStep.area_id) || null;
  }, [selectedStep, areas]);

  const selectedStepAreaCode = (selectedStepArea?.code || '') as AreaCode;

  // Actualizar borradores al cambiar etapa
  useEffect(() => {
    setDraftAssignee(selectedStep?.assigned_to || '');
    setDraftDueAt(localDateTime(selectedStep?.due_at));
    setCoordinationNote('');
    setActionError('');
  }, [selectedStep?.id, selectedStep?.updated_at, selectedStep?.assigned_to, selectedStep?.due_at]);

  // Carga de personal elegible para coordinar
  useEffect(() => {
    if (!selectedStep || !perms.canCoordinate || !supabase) {
      setEligibleStaff([]);
      setStaffError('');
      setStaffLoading(false);
      return;
    }
    let active = true;
    setStaffLoading(true);
    setStaffError('');

    void supabase
      .rpc('list_production_step_assignees', { p_step_id: selectedStep.id })
      .then(({ data, error }) => {
        if (!active) return;
        setEligibleStaff(error ? [] : ((data || []) as ProductionAssignee[]));
        setStaffError(
          error
            ? 'No pudimos consultar el personal habilitado. Actualiza la ficha e inténtalo de nuevo.'
            : ''
        );
        setStaffLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedStep?.id, perms.canCoordinate, refreshRevision]);

  // Actualizar borradores al cambiar trabajo
  useEffect(() => {
    const spec = (job?.specifications || {}) as Record<string, unknown>;
    const fields = [
      'description',
      'width_cm',
      'height_cm',
      'material',
      'finish',
      'installation_address',
      'site_visit_notes',
    ];
    setDraftSpec(Object.fromEntries(fields.map((key) => [key, String(spec[key] ?? '')])));
    setDraftRoute('print');
    setFulfillmentDueAt(localDateTime(job?.fulfillment_due_at));
    setArtworkReference(job?.artwork_reference || '');
    setArtworkNote('');
    setArtworkFile(null);
    setArtworkFileKey((k) => k + 1);
  }, [job?.id, job?.spec_version, job?.artwork_revision, job?.fulfillment_due_at]);

  /* ------------------------------------------------------------------------
     3. REGLAS DE PERMISOS SOBRE EL TRABAJO Y ETAPAS
     ------------------------------------------------------------------------ */
  const assignedToMe = selectedStep?.assigned_to === user?.id;
  const isAssignedAdvisor = Boolean(
    job &&
      steps.some((step) => {
        const area = areas.find((entry) => entry.id === step.area_id);
        return area?.code === 'ASE' && step.assigned_to === user?.id;
      })
  );

  const canEditSelectedSpec = Boolean(
    job && (job.advisor_id === user?.id || isAssignedAdvisor) && perms.canEditSales
  );

  const isSiteVisitEditor =
    selectedStepAreaCode === 'TAL' &&
    selectedStep?.step_key === 'site_visit' &&
    assignedToMe &&
    perms.canEditWorkshop &&
    perms.canActInArea('TAL');

  const showSpecEditor =
    Boolean(job && (canEditSelectedSpec || isSiteVisitEditor)) &&
    ['open', 'needs_review'].includes(job?.status || '');

  const canSubmitArtwork = Boolean(
    job?.approval_required &&
      job?.status === 'open' &&
      selectedStep?.step_key === 'design' &&
      assignedToMe &&
      perms.canActInArea('DIS') &&
      perms.canEditWorkshop &&
      ['awaiting_art', 'changes_requested'].includes(job.artwork_review_status) &&
      ['in_progress', 'completed'].includes(selectedStep.status)
  );

  const canReviewArtwork = Boolean(
    job?.approval_required &&
      job?.status === 'open' &&
      job?.artwork_review_status === 'awaiting_review' &&
      (perms.canCoordinate || canEditSelectedSpec)
  );

  const canManageFulfillment = Boolean(
    job && (perms.canCoordinate || (perms.canEditSales && (job.advisor_id === user?.id || isAssignedAdvisor)))
  );

  const canSubmitQuantity = Boolean(
    canManageFulfillment ||
      steps.some((step) => step.assigned_to === user?.id && step.status === 'in_progress')
  );

  const canChangeSelected = Boolean(
    job?.status !== 'needs_review' &&
      selectedStep &&
      (perms.canCoordinate ||
        (perms.canActInArea(selectedStepAreaCode) &&
          (assignedToMe || !selectedStep.assigned_to || perms.canEditWorkshop)))
  );

  const reworkCandidates = selectedStep
    ? steps.filter((s) => s.status === 'completed' && s.step_order <= selectedStep.step_order)
    : [];
  const selectedReworkTarget =
    reworkCandidates.find((s) => s.id === reworkTarget) || reworkCandidates.at(-1) || null;

  const reviewRequest = events.find(
    (event) =>
      event.event_type === 'specification_review_changes_requested' &&
      event.details?.to_version === job?.spec_version &&
      event.details?.from_version === job?.review_from_version
  );
  const reviewRequestNote =
    typeof reviewRequest?.details?.note === 'string' ? reviewRequest.details.note : null;

  const selectedStepChecks = stepChecks.filter((c) => c.step_id === selectedStep?.id);

  /* ------------------------------------------------------------------------
     4. OPERACIONES Y RPCs CON INVALIDACIÓN COMPARTIDA
     ------------------------------------------------------------------------ */
  const refreshAfterChange = useCallback(async () => {
    emitProductionChanged();
    if (onChanged) {
      await onChanged();
    }
    setRefreshRevision((v) => v + 1);
  }, [onChanged]);

  const confirmDeliveryBalance = async (targetJobId: string): Promise<boolean> => {
    if (!supabase || !organizationId) return false;
    const { data, error } = await supabase.rpc('list_production_job_balance_flags', {
      p_organization_id: organizationId,
      p_job_ids: [targetJobId],
    });
    if (error) throw error;
    const due = ((data || []) as Array<{ job_id: string; balance_due: boolean }>).some(
      (entry) => entry.job_id === targetJobId && entry.balance_due
    );
    return (
      !due ||
      (await confirm({
        eyebrow: 'ENTREGA Y COBRO',
        title: 'El trabajo todavía tiene saldo pendiente',
        description: 'Puedes registrar la entrega y conservar el saldo pendiente para seguimiento.',
        tone: 'warning',
        confirmLabel: 'Continuar con la entrega',
        cancelLabel: 'Revisar el saldo',
        summaryItems: [{ label: 'Trabajo', value: targetJobId }],
      }))
    );
  };

  const handleStepSelect = (stepId: string) => {
    setSelectedStepId(stepId);
    setActionError('');
    setActionMessage('');
    if (onSelectStep) {
      onSelectStep(stepId);
    }
  };

  // Coordinar etapa (responsable y fecha límite)
  const saveCoordination = async () => {
    if (
      !supabase ||
      !selectedStep ||
      !job ||
      !perms.canCoordinate ||
      busy ||
      staffLoading ||
      staffError ||
      !isStepOpen(selectedStep.status) ||
      job.status === 'completed' ||
      job.status === 'cancelled'
    )
      return;

    const parsed = draftDueAt ? safeDate(draftDueAt) : null;
    if (draftDueAt && (!parsed || Number.isNaN(parsed.getTime()))) {
      setActionError('Escribe una fecha y hora válidas.');
      return;
    }

    const assignee = draftAssignee || null;
    const dueAt =
      draftDueAt === localDateTime(selectedStep.due_at)
        ? selectedStep.due_at
        : parsed?.toISOString() || null;

    if (assignee === selectedStep.assigned_to && dueAt === selectedStep.due_at) {
      setActionError('Cambia el responsable o la fecha antes de guardar.');
      return;
    }

    setBusy(true);
    setActionError('');
    setActionMessage('');
    try {
      const { error } = await supabase.rpc('coordinate_production_job_step', {
        p_step_id: selectedStep.id,
        p_expected_updated_at: selectedStep.updated_at,
        p_assigned_to: assignee,
        p_due_at: dueAt,
        p_note: coordinationNote.trim(),
      });
      if (error) throw error;
      setActionMessage('Responsable y fecha guardados. El cambio quedó registrado en el historial.');
      await refreshAfterChange();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos coordinar la etapa.');
    } finally {
      setBusy(false);
    }
  };

  // Transición de etapa (take, start, complete, block, unblock)
  const runStepAction = async (action: 'take' | 'start' | 'complete' | 'block' | 'unblock') => {
    if (!supabase || !selectedStep || busy || !canChangeSelected) return;
    if (action === 'block' && actionNote.trim().length < 3) {
      setActionError('Explica por qué se bloquea este trabajo.');
      return;
    }

    setBusy(true);
    setActionError('');
    setActionMessage('');
    try {
      const { error } = await supabase.rpc('transition_production_job_step', {
        p_step_id: selectedStep.id,
        p_action: action,
        p_note: actionNote.trim(),
        p_assigned_to: null,
      });
      if (error) throw error;
      setActionNote('');
      setActionMessage(
        'Cambio guardado. La siguiente etapa se actualiza automáticamente cuando corresponde.'
      );
      await refreshAfterChange();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos actualizar esta etapa.');
    } finally {
      setBusy(false);
    }
  };

  // Recepción de etapa
  const receiveStep = async () => {
    if (!supabase || !selectedStep || busy) return;
    setBusy(true);
    setActionError('');
    setActionMessage('');
    try {
      const { error } = await supabase.rpc('receive_production_job_step', {
        p_step_id: selectedStep.id,
        p_note: actionNote.trim(),
      });
      if (error) throw error;
      setActionNote('');
      setActionMessage('Recepción registrada. La etapa queda a cargo de esta área.');
      await refreshAfterChange();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos recibir la etapa.');
    } finally {
      setBusy(false);
    }
  };

  // Checklist de etapa
  const updateStepCheck = async (check: ProductionStepCheck, completed: boolean) => {
    if (!supabase || busy) return;
    setBusy(true);
    setActionError('');
    setActionMessage('');
    try {
      const { error } = await supabase.rpc('set_production_step_check', {
        p_check_id: check.id,
        p_completed: completed,
        p_evidence_url: evidenceDrafts[check.id]?.trim() || '',
        p_note: '',
      });
      if (error) throw error;
      await refreshAfterChange();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos guardar el control.');
    } finally {
      setBusy(false);
    }
  };

  // Solicitud de retrabajo
  const requestRework = async () => {
    const targetId = selectedReworkTarget?.id || reworkTarget;
    if (!supabase || !job || !selectedStep || !targetId || busy || actionNote.trim().length < 3) {
      setActionError('Selecciona la etapa que debe repetirse y explica el motivo.');
      return;
    }
    setBusy(true);
    setActionError('');
    setActionMessage('');
    try {
      const { error } = await supabase.rpc('request_production_job_rework', {
        p_report_step: selectedStep.id,
        p_target_step: targetId,
        p_note: actionNote.trim(),
      });
      if (error) throw error;
      setActionNote('');
      setActionMessage(
        'Retrabajo registrado; las etapas afectadas se reabrieron y el equipo recibió el aviso.'
      );
      await refreshAfterChange();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos solicitar el retrabajo.');
    } finally {
      setBusy(false);
    }
  };

  // Cierre y entrega general
  const updateFulfillment = async (
    action: 'quality_pass' | 'schedule_delivery' | 'deliver' | 'install'
  ) => {
    if (!supabase || !job || busy) return;
    const due = fulfillmentDueAt ? safeDate(fulfillmentDueAt) : null;
    if (action === 'schedule_delivery' && (!due || Number.isNaN(due.getTime()))) {
      setActionError('Elige la fecha y hora de entrega.');
      return;
    }
    setBusy(true);
    setActionError('');
    setActionMessage('');
    try {
      if (action === 'deliver' && !(await confirmDeliveryBalance(job.id))) return;
      const { error } = await supabase.rpc('transition_production_job_fulfillment', {
        p_job_id: job.id,
        p_action: action,
        p_due_at: action === 'schedule_delivery' ? due?.toISOString() : null,
        p_note: actionNote.trim(),
      });
      if (error) throw error;
      setActionNote('');
      setActionMessage('Control de calidad o entrega registrado en el historial.');
      await refreshAfterChange();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos actualizar la entrega.');
    } finally {
      setBusy(false);
    }
  };

  // Configurar cantidad física (inicio de control de lotes)
  const configurePhysicalQuantity = async () => {
    const quantity = Number(physicalQuantity);
    if (!supabase || !job || busy || !canManageFulfillment) return;
    if (!Number.isFinite(quantity) || quantity <= 0 || !physicalUnit.trim()) {
      setActionError('Indica la cantidad física total y su unidad.');
      return;
    }
    setBusy(true);
    setActionError('');
    setActionMessage('');
    try {
      const { error } = await supabase.rpc('configure_production_job_quantity', {
        p_job_id: job.id,
        p_quantity: quantity,
        p_unit: physicalUnit.trim(),
      });
      if (error) throw error;
      setPhysicalQuantity('');
      setLotNote('');
      setActionMessage(
        'Cantidad física configurada. El lote completo sigue en producción hasta registrar los tramos terminados.'
      );
      await refreshAfterChange();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'No pudimos configurar la cantidad física.'
      );
    } finally {
      setBusy(false);
    }
  };

  // Movimiento de lote físico
  const transitionLot = async (
    lot: ProductionLot,
    action:
      | 'submit_quality'
      | 'approve_quality'
      | 'request_rework'
      | 'schedule_delivery'
      | 'deliver'
      | 'install'
  ) => {
    if (!supabase || !job || busy) return;
    const rawQuantity = lotQuantityDrafts[lot.id]?.trim() || '';
    const quantity = rawQuantity ? Number(rawQuantity) : null;
    const due = fulfillmentDueAt ? safeDate(fulfillmentDueAt) : null;

    if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) {
      setActionError('La cantidad del tramo debe ser mayor a cero.');
      return;
    }
    if (action === 'request_rework' && lotNote.trim().length < 3) {
      setActionError('Explica el motivo del retrabajo.');
      return;
    }
    if (action === 'schedule_delivery' && (!due || Number.isNaN(due.getTime()))) {
      setActionError('Elige una fecha y hora de entrega.');
      return;
    }

    setBusy(true);
    setActionError('');
    setActionMessage('');
    try {
      if (action === 'deliver' && !(await confirmDeliveryBalance(job.id))) return;
      const { error } = await supabase.rpc('transition_production_job_lot', {
        p_lot_id: lot.id,
        p_action: action,
        p_quantity: quantity,
        p_due_at: action === 'schedule_delivery' ? due?.toISOString() : null,
        p_note: lotNote.trim(),
      });
      if (error) throw error;
      setLotNote('');
      setLotQuantityDrafts((current) => ({ ...current, [lot.id]: '' }));
      setActionMessage('Movimiento del lote guardado con cantidad, responsable y fecha en el historial.');
      await refreshAfterChange();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos actualizar este lote.');
    } finally {
      setBusy(false);
    }
  };

  // Guardar especificaciones
  const saveSpecifications = async () => {
    if (!supabase || !job || !showSpecEditor || busy) return;
    const current = (job.specifications || {}) as Record<string, unknown>;
    const keys =
      isSiteVisitEditor && !canEditSelectedSpec
        ? ['width_cm', 'height_cm', 'site_visit_notes']
        : [
            'description',
            'width_cm',
            'height_cm',
            'material',
            'finish',
            'installation_address',
            'site_visit_notes',
          ];

    const next = { ...current };
    keys.forEach((key) => {
      const value = draftSpec[key]?.trim() || '';
      if (value !== String(current[key] ?? '')) next[key] = value;
    });

    if (JSON.stringify(next) === JSON.stringify(current) && !actionNote.trim()) {
      setActionError('Añade un cambio o una nota antes de guardar.');
      return;
    }

    setBusy(true);
    setActionError('');
    setActionMessage('');
    try {
      const { error } = await supabase.rpc('update_production_job', {
        p_job_id: job.id,
        p_expected_version: job.spec_version,
        p_specifications: next,
        p_note: actionNote.trim(),
      });
      if (error) throw error;
      setActionNote('');
      setActionMessage('Ficha actualizada y cambio registrado para todas las áreas.');
      await refreshAfterChange();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos guardar los detalles.');
    } finally {
      setBusy(false);
    }
  };

  // Seleccionar ruta de trabajo
  const chooseWorkflow = async () => {
    if (!supabase || !job || busy || !canEditSelectedSpec) return;
    setBusy(true);
    setActionError('');
    setActionMessage('');
    try {
      const { error } = await supabase.rpc('choose_production_job_workflow', {
        p_job_id: job.id,
        p_workflow_code: draftRoute,
        p_expected_version: job.spec_version,
        p_note: actionNote.trim(),
      });
      if (error) throw error;
      setActionNote('');
      setActionMessage('Ruta definida. Las etapas se asignaron automáticamente.');
      await refreshAfterChange();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos definir la ruta.');
    } finally {
      setBusy(false);
    }
  };

  // Enviar arte para revisión
  const submitArtwork = async () => {
    if (
      !supabase ||
      !job ||
      !selectedStep ||
      busy ||
      selectedStep.step_key !== 'design' ||
      !assignedToMe ||
      !perms.canActInArea('DIS') ||
      !perms.canEditWorkshop
    )
      return;

    if (artworkFile) {
      if (
        !ARTWORK_FILE_TYPES[artworkFile.type] ||
        artworkFile.size > ARTWORK_FILE_MAX_BYTES ||
        artworkFile.size === 0
      ) {
        setActionError('Usa PNG, JPG, WebP o PDF de hasta 6 MB.');
        return;
      }
    } else if (!artworkReference.startsWith('storage://production-artwork/')) {
      try {
        const url = new URL(artworkReference.trim());
        if (url.protocol !== 'https:' || !url.hostname) throw new Error('Enlace inválido');
      } catch {
        setActionError('Añade un enlace HTTPS válido o selecciona un archivo.');
        return;
      }
    }

    setBusy(true);
    setActionError('');
    setActionMessage('');
    let uploadedPath = '';
    try {
      // Recheck ownership immediately before uploading, not only at render time.
      const { data: currentStep, error: ownerError } = await supabase.from('production_job_steps').select('assigned_to').eq('id', selectedStep.id).single();
      if (ownerError || currentStep?.assigned_to !== user?.id) throw new Error('La etapa debe estar asignada a ti antes de subir el arte. Actualiza la ficha.');
      let reference = artworkReference.trim();
      if (artworkFile) {
        const path = `${job.organization_id}/${job.id}/${crypto.randomUUID()}.${ARTWORK_FILE_TYPES[artworkFile.type]}`;
        const { error: uploadError } = await supabase.storage
          .from('production-artwork')
          .upload(path, artworkFile, {
            contentType: artworkFile.type,
            cacheControl: '3600',
            upsert: false,
          });
        if (uploadError) throw new Error(`No pudimos subir la prueba privada: ${uploadError.message}`);
        uploadedPath = path;
        reference = `storage://production-artwork/${path}`;
        setArtworkReference(reference);
        setArtworkFile(null);
        setArtworkFileKey((v) => v + 1);
      }

      const { error } = await supabase.rpc('submit_production_artwork', {
        p_job_id: job.id,
        p_reference: reference,
        p_note: artworkNote.trim(),
      });
      if (error) throw error;
      setOrphanArtworkPath('');
      setArtworkNote('');
      setActionMessage('Arte entregado. Asesoría recibirá un aviso para aprobarlo o pedir correcciones.');
      await refreshAfterChange();
    } catch (error) {
      if (uploadedPath) {
        const cleanup = await supabase.storage.from('production-artwork').remove([uploadedPath]);
        if (cleanup.error) setOrphanArtworkPath(uploadedPath);
        else { setArtworkReference(''); setOrphanArtworkPath(''); }
      }
      setActionError(error instanceof Error ? error.message : 'No pudimos entregar el arte.');
    } finally {
      setBusy(false);
    }
  };

  // Revisar arte
  const reviewArtwork = async (decision: 'approved' | 'changes_requested') => {
    if (!supabase || !job || busy || !(perms.canCoordinate || canEditSelectedSpec)) return;
    if (decision === 'changes_requested' && artworkNote.trim().length < 3) {
      setActionError('Explica qué debe corregir Diseño.');
      return;
    }
    setBusy(true);
    setActionError('');
    setActionMessage('');
    try {
      const { error } = await supabase.rpc('review_production_artwork', {
        p_job_id: job.id,
        p_expected_revision: job.artwork_revision,
        p_decision: decision,
        p_note: artworkNote.trim(),
      });
      if (error) throw error;
      setArtworkNote('');
      setActionMessage(
        decision === 'approved'
          ? 'Arte aprobado. La siguiente etapa se habilitó si cumple los demás requisitos.'
          : 'Correcciones enviadas. Diseño puede retomar su etapa.'
      );
      await refreshAfterChange();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos registrar la revisión.');
    } finally {
      setBusy(false);
    }
  };

  const lotQuantityTotal = (statuses: string[]) =>
    productionLots
      .filter((lot) => statuses.includes(lot.status))
      .reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);

  const currentAreaName = (id: string) => areas.find((row) => row.id === id)?.name || 'Área de trabajo';

  const sheetTitle = job
    ? job.sale_code
      ? `Trabajo ${job.sale_code}`
      : job.title
    : 'Ficha de trabajo';

  const sheetDescription = job
    ? job.customer_name || 'Seguimiento integral de producción'
    : 'Cargando información del trabajo…';

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onClose();
        }}
        title={sheetTitle}
        description={sheetDescription}
      >
        <div className="pjd-sheet">
          {/* ESTADO 1: CARGA */}
          {loading && (
            <div className="pjd-status-box is-loading" role="status" aria-live="polite">
              <RefreshCw size={24} className="ok-spinner-icon" />
              <h4>Consultando ficha de trabajo…</h4>
              <p>Cargando detalles de orden, etapas, controles y recorrido técnico.</p>
            </div>
          )}

          {/* ESTADO 2: ACCESO NO AUTORIZADO / NO ENCONTRADO */}
          {!loading && unauthorizedMessage && (
            <div className="pjd-status-box is-unauthorized" role="alert">
              <ShieldAlert size={28} />
              <h4>Acceso restringido</h4>
              <p>{unauthorizedMessage}</p>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => void loadJobDetail()}
                >
                  <RefreshCw size={14} /> Reintentar
                </button>
                <button type="button" className="button button-dark" onClick={onClose}>
                  Cerrar ficha
                </button>
              </div>
            </div>
          )}

          {/* ESTADO 3: ERROR DE RED O CONSULTA */}
          {!loading && !unauthorizedMessage && loadError && (
            <div className="pjd-status-box is-error" role="alert">
              <AlertTriangle size={28} />
              <h4>No pudimos cargar la orden</h4>
              <p>{loadError}</p>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => void loadJobDetail()}
                >
                  <RefreshCw size={14} /> Reintentar
                </button>
                <button type="button" className="button button-dark" onClick={onClose}>
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {/* ESTADO 4: FICHA COMPLETA */}
          {!loading && !unauthorizedMessage && !loadError && job && (
            <div className="pj-detail">
              {/* BARRA DE NAVEGACIÓN CRUZADA Y ENLACES PROFUNDOS */}
              <nav className="pjd-nav-bar" aria-label="Enlaces directos del trabajo">
                <Link
                  className="button button-outline"
                  to={`/operaciones/cartelera-taller?tab=calendar&trabajo=${job.id}`}
                  title="Ver en Cartelera y Calendario de Taller"
                >
                  <CalendarClock size={14} /> Calendario
                </Link>
                <Link
                  className="button button-outline"
                  to={`/operaciones/cartelera-taller?tab=map&trabajo=${job.id}`}
                  title="Ver en Mapa de Instalaciones"
                >
                  <MapPin size={14} /> Mapa
                </Link>
                {selectedStep && selectedStepAreaCode && (
                  <Link
                    className="button button-outline"
                    to={`/operaciones/trabajos/${AREA_CODE_TO_SLUG[selectedStepAreaCode] || 'asesoria'}?trabajo=${job.id}&paso=${selectedStep.id}`}
                    title={`Ver en cola de ${selectedStepArea?.name || selectedStepAreaCode}`}
                  >
                    <ArrowRight size={14} /> Cola {selectedStepArea?.name || selectedStepAreaCode}
                  </Link>
                )}
                <div className="pjd-nav-spacer" />
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setChatterOpen(true)}
                  aria-label="Abrir notas y comentarios 360"
                >
                  <MessageSquare size={14} /> Chatter 360
                </button>
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => void loadJobDetail()}
                  disabled={busy}
                  aria-label="Actualizar datos de la ficha"
                >
                  <RefreshCw size={14} />
                </button>
              </nav>

              {/* ENCABEZADO Y HERO */}
              <div className="pjd-hero">
                <div className="pjd-hero-top">
                  <div className="pjd-hero-badges">
                    <span className="pj-card-code">ORDEN · V{job.spec_version}</span>
                    {job.balance_due && (
                      <span className="pj-status" data-state="blocked" title="Saldo pendiente">
                        <AlertTriangle size={11} /> Saldo pendiente
                      </span>
                    )}
                    <span className="pj-status" data-state={job.status}>
                      {job.status === 'needs_review'
                        ? 'Revisión técnica'
                        : job.status === 'completed'
                        ? 'Terminado'
                        : job.status === 'cancelled'
                        ? 'Cancelado'
                        : 'En curso'}
                    </span>
                  </div>
                  {job.branch?.name && (
                    <span className="pj-card-code" title="Sucursal de venta">
                      {job.branch.name}
                    </span>
                  )}
                </div>
                <h3>{job.title}</h3>
                {job.catalog_product?.name && (
                  <p>
                    <b>Producto:</b> {job.catalog_product.name}
                  </p>
                )}
                <p>
                  Las indicaciones se comparten entre asesoría y producción. Cada cambio queda registrado
                  en el historial de la ficha.
                </p>
              </div>

              {/* FICHA DE DATOS Y METADATOS */}
              <dl className="pjd-facts">
                <div>
                  <dt>Cliente</dt>
                  <dd>{job.customer_name || 'Por consultar'}</dd>
                </div>
                <div>
                  <dt>Teléfono</dt>
                  <dd>{job.customer_phone || 'Por consultar'}</dd>
                </div>
                <div>
                  <dt>Venta</dt>
                  <dd>{job.sale_code || 'Sin código'}</dd>
                </div>
                <div>
                  <dt>Fecha prevista</dt>
                  <dd>{stamp(job.due_at)}</dd>
                </div>
              </dl>

              {/* REVISIÓN TÉCNICA DE ESPECIFICACIONES */}
              {job.status === 'needs_review' && (
                <ProductionSpecReview
                  key={`${job.id}:${job.spec_version}`}
                  jobId={job.id}
                  version={job.spec_version}
                  fromVersion={job.review_from_version}
                  current={job.specifications || {}}
                  canResolve={perms.canCoordinate}
                  lastRequest={reviewRequestNote}
                  onDecided={(decision) => {
                    setActionMessage(
                      decision === 'accepted'
                        ? 'Cambio técnico aceptado. Las etapas correspondientes se actualizaron.'
                        : 'Corrección solicitada. El trabajo permanece detenido hasta la revisión de la ficha.'
                    );
                    void refreshAfterChange();
                  }}
                />
              )}

              {/* ESPECIFICACIONES ACTUALES */}
              <section aria-labelledby={`${titleId}-specs`}>
                <h4 id={`${titleId}-specs`}>Detalles del trabajo</h4>
                {Object.keys(job.specifications || {}).length ? (
                  <dl className="pj-detail-facts">
                    {Object.entries(job.specifications || {}).map(([key, value]) => (
                      <div key={key}>
                        <dt>{humanKey(key)}</dt>
                        <dd>
                          {key === 'artwork_status'
                            ? ARTWORK_INPUT_STATUS[String(value)] || presentValue(value)
                            : presentValue(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="pj-note">
                    Aún no hay especificaciones adicionales. Solicita al asesor los datos que faltan antes
                    de empezar.
                  </p>
                )}
              </section>

              {/* PASE ENTRE ÁREAS (HANDOFF) */}
              <ProductionMaterialPanel key={`${job.id}:${selectedStep?.id || "none"}`} job={job} step={selectedStep} onChanged={refreshAfterChange}/>
              <ProductionHandoffSection
                step={selectedStep}
                areas={areas}
                specifications={job.specifications}
                contextAreaCode={contextAreaCode}
              />

              {/* CONTROL Y REVISIÓN DE ARTE */}
              {job.approval_required && (
                <section className="pj-artwork" aria-label="Revisión del arte">
                  <div className="pj-artwork-top">
                    <div>
                      <span className="pj-artwork-eyebrow">CONTROL DE ARTE</span>
                      <h4>Revisión antes de producir</h4>
                    </div>
                    <span className="pj-artwork-state" data-state={job.artwork_review_status}>
                      {ARTWORK_STATUS_SHORT[job.artwork_review_status] || job.artwork_review_status}
                    </span>
                  </div>
                  <p>
                    {ARTWORK_STATUS_EXPLANATIONS[job.artwork_review_status] ||
                      'Revisión requerida antes de autorizar producción.'}
                  </p>
                  {job.artwork_revision > 0 && (
                    <div className="pj-artwork-meta">
                      <span>Versión {job.artwork_revision}</span>
                      <span>Entregado: {stamp(job.artwork_submitted_at)}</span>
                      {job.artwork_reviewed_at && <span>Revisado: {stamp(job.artwork_reviewed_at)}</span>}
                    </div>
                  )}
                  <ProductionArtworkReference
                    key={job.artwork_reference}
                    reference={job.artwork_reference}
                  />

                  {/* Formulario de entrega de arte (Diseño) */}
                  {orphanArtworkPath && <div className="pj-artwork-form"><p>La prueba no quedó vinculada. Puedes descartar el archivo pendiente antes de intentar otra entrega.</p><button type="button" className="button button-outline" disabled={busy} onClick={async () => { if (!supabase) return; setBusy(true); const { error } = await supabase.storage.from('production-artwork').remove([orphanArtworkPath]); setBusy(false); if (error) setActionError(error.message); else { setOrphanArtworkPath(''); setArtworkReference(''); setActionMessage('Prueba pendiente descartada.'); } }}>Descartar prueba pendiente</button></div>}
                  {canSubmitArtwork && (
                    <div className="pj-artwork-form">
                      <label>
                        <span>Prueba privada (PNG, JPG, WebP o PDF · hasta 6 MB)</span>
                        <input
                          key={artworkFileKey}
                          type="file"
                          accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
                          onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            if (
                              file &&
                              (!ARTWORK_FILE_TYPES[file.type] ||
                                file.size > ARTWORK_FILE_MAX_BYTES ||
                                file.size === 0)
                            ) {
                              setActionError('Usa PNG, JPG, WebP o PDF de hasta 6 MB.');
                              event.target.value = '';
                              setArtworkFile(null);
                            } else {
                              setActionError('');
                              setArtworkFile(file);
                            }
                          }}
                        />
                      </label>
                      <p className="pj-artwork-hint">
                        La prueba queda privada. Para archivos de producción más grandes, usa un enlace
                        HTTPS.
                      </p>
                      {artworkReference.startsWith('storage://production-artwork/') && !artworkFile && (
                        <p className="pj-artwork-hint">
                          La prueba ya se subió. Pulsa entregar para registrarla en la orden.
                        </p>
                      )}
                      <label>
                        <span>O enlace HTTPS del arte</span>
                        <input
                          type="url"
                          inputMode="url"
                          maxLength={1000}
                          value={
                            artworkReference.startsWith('storage://production-artwork/')
                              ? ''
                              : artworkReference
                          }
                          onChange={(event) => setArtworkReference(event.target.value)}
                          placeholder="https://…"
                        />
                      </label>
                      <label>
                        <span>
                          Nota de entrega <span className="pj-optional">opcional</span>
                        </span>
                        <textarea
                          maxLength={1000}
                          rows={2}
                          value={artworkNote}
                          onChange={(event) => setArtworkNote(event.target.value)}
                          placeholder="Qué cambió en esta versión"
                        />
                      </label>
                      <button
                        className="button button-dark"
                        type="button"
                        disabled={busy || (!artworkFile && !artworkReference.trim())}
                        onClick={() => void submitArtwork()}
                      >
                        Entregar para aprobación <ArrowRight size={14} />
                      </button>
                    </div>
                  )}

                  {/* Formulario de revisión de arte (Asesoría / Coordinador) */}
                  {canReviewArtwork && (
                    <div className="pj-artwork-form">
                      <label>
                        <span>Decisión para Diseño</span>
                        <textarea
                          maxLength={1000}
                          rows={2}
                          value={artworkNote}
                          onChange={(event) => setArtworkNote(event.target.value)}
                          placeholder="Si pides correcciones, explica qué hay que cambiar"
                        />
                      </label>
                      <div className="pj-action-row">
                        <button
                          className="button button-dark"
                          type="button"
                          disabled={busy}
                          onClick={() => void reviewArtwork('approved')}
                        >
                          <Check size={14} /> Aprobar arte
                        </button>
                        <button
                          className="button button-outline"
                          type="button"
                          disabled={busy || artworkNote.trim().length < 3}
                          onClick={() => void reviewArtwork('changes_requested')}
                        >
                          Pedir correcciones
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* DEFINIR RUTA DE PRODUCCIÓN */}
              {job.workflow_code === 'review' && canEditSelectedSpec && (
                <section className="pj-actions">
                  <h4>Definir ruta de producción</h4>
                  <p className="pj-note">
                    Elige el recorrido para activar las tareas de cada área. Revisa antes los detalles del
                    pedido.
                  </p>
                  <label>
                    <span>Recorrido</span>
                    <select
                      value={draftRoute}
                      onChange={(event) => setDraftRoute(event.target.value)}
                    >
                      {WORKFLOW_CHOICES.map((choice) => (
                        <option key={choice.code} value={choice.code}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button button-dark"
                    type="button"
                    disabled={busy}
                    onClick={() => void chooseWorkflow()}
                  >
                    Activar ruta <ArrowRight size={14} />
                  </button>
                </section>
              )}

              {/* EDITAR ESPECIFICACIONES DE LA FICHA */}
              {showSpecEditor && (
                <section className="pj-actions">
                  <h4>
                    {isSiteVisitEditor && !canEditSelectedSpec
                      ? 'Medidas de la visita'
                      : 'Editar ficha del trabajo'}
                  </h4>
                  <p className="pj-note">
                    Los cambios se guardan con una nueva versión y quedan visibles para todas las áreas.
                  </p>
                  <div className="pj-edit-grid">
                    <label>
                      <span>Ancho (cm)</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        inputMode="decimal"
                        value={draftSpec.width_cm || ''}
                        onChange={(event) =>
                          setDraftSpec((val) => ({ ...val, width_cm: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      <span>Alto (cm)</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        inputMode="decimal"
                        value={draftSpec.height_cm || ''}
                        onChange={(event) =>
                          setDraftSpec((val) => ({ ...val, height_cm: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                  {(!isSiteVisitEditor || canEditSelectedSpec) && (
                    <>
                      <label>
                        <span>Descripción</span>
                        <textarea
                          maxLength={4000}
                          rows={3}
                          value={draftSpec.description || ''}
                          onChange={(event) =>
                            setDraftSpec((val) => ({ ...val, description: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        <span>Material</span>
                        <input
                          maxLength={180}
                          value={draftSpec.material || ''}
                          onChange={(event) =>
                            setDraftSpec((val) => ({ ...val, material: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        <span>Acabado</span>
                        <input
                          maxLength={220}
                          value={draftSpec.finish || ''}
                          onChange={(event) =>
                            setDraftSpec((val) => ({ ...val, finish: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        <span>Dirección de instalación</span>
                        <input
                          maxLength={400}
                          value={draftSpec.installation_address || ''}
                          onChange={(event) =>
                            setDraftSpec((val) => ({
                              ...val,
                              installation_address: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </>
                  )}
                  <label>
                    <span>Observaciones de la visita</span>
                    <textarea
                      maxLength={1000}
                      rows={2}
                      value={draftSpec.site_visit_notes || ''}
                      onChange={(event) =>
                        setDraftSpec((val) => ({ ...val, site_visit_notes: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>Motivo del cambio</span>
                    <textarea
                      maxLength={1000}
                      rows={2}
                      value={actionNote}
                      onChange={(event) => setActionNote(event.target.value)}
                      placeholder="Ej. Medidas verificadas en el local del cliente"
                    />
                  </label>
                  <button
                    className="button button-dark"
                    type="button"
                    disabled={busy}
                    onClick={() => void saveSpecifications()}
                  >
                    Guardar detalles <Check size={14} />
                  </button>
                </section>
              )}

              {/* COORDINACIÓN DE ETAPA (RESPONSABLE Y FECHA LÍMITE CON DATETIMEPICKER) */}
              {perms.canCoordinate && selectedStep && (
                <section className="pj-actions pj-coordination" aria-label="Coordinación de etapas">
                  <div className="pj-coordination-heading">
                    <div>
                      <h4>Coordinar etapa</h4>
                      <p>Asigna a una persona del área y fija una fecha límite para este paso.</p>
                    </div>
                    <CalendarClock size={19} aria-hidden="true" />
                  </div>
                  <label>
                    <span>Etapa</span>
                    <select
                      value={selectedStep.id}
                      onChange={(event) => handleStepSelect(event.target.value)}
                    >
                      {steps.map((step, index) => (
                        <option value={step.id} key={step.id}>
                          {String(index + 1).padStart(2, '0')} · {step.title} ·{' '}
                          {currentAreaName(step.area_id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="pj-coordination-status">
                    <span className="pj-status" data-state={selectedStep.status}>
                      {STEP_STATUS_LABELS[selectedStep.status] || selectedStep.status}
                    </span>
                    <span>{currentAreaName(selectedStep.area_id)}</span>
                  </p>

                  {isStepOpen(selectedStep.status) &&
                  job.status !== 'completed' &&
                  job.status !== 'cancelled' ? (
                    <>
                      <div className="pj-edit-grid">
                        <label>
                          <span>Responsable</span>
                          <select
                            value={draftAssignee}
                            onChange={(event) => setDraftAssignee(event.target.value)}
                            disabled={staffLoading || Boolean(staffError)}
                          >
                            <option value="">Sin responsable</option>
                            {selectedStep.assigned_to &&
                              !staffLoading &&
                              !staffError &&
                              !eligibleStaff.some(
                                (person) => person.user_id === selectedStep.assigned_to
                              ) && (
                                <option value={selectedStep.assigned_to} disabled>
                                  Responsable anterior sin acceso
                                </option>
                              )}
                            {eligibleStaff.map((person) => (
                              <option value={person.user_id} key={person.user_id}>
                                {person.display_name}
                                {person.user_id === user?.id ? ' (yo)' : ''}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="pjd-datetime-field">
                          <label id={`${titleId}-due-label`}>
                            <span>Fecha y hora límite</span>
                          </label>
                          <div className="pjd-datetime-wrap">
                            <DateTimePicker
                              value={draftDueAt}
                              onChange={(val) => setDraftDueAt(val)}
                              label="Fecha y hora límite"
                            />
                            {draftDueAt && (
                              <button
                                type="button"
                                className="button button-outline button-sm"
                                onClick={() => setDraftDueAt('')}
                                title="Dejar sin fecha límite"
                              >
                                Limpiar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {staffLoading && (
                        <p className="pj-note" role="status">
                          Cargando personas habilitadas…
                        </p>
                      )}
                      {staffError && (
                        <p className="pj-error" role="alert">
                          {staffError}
                        </p>
                      )}
                      {!staffLoading && !staffError && !eligibleStaff.length && (
                        <p className="pj-note">
                          No hay personas activas para esta área. La etapa puede quedar sin responsable.
                        </p>
                      )}

                      <label>
                        <span>
                          Motivo o indicación para el equipo{' '}
                          <span className="pj-optional">opcional</span>
                        </span>
                        <textarea
                          maxLength={1000}
                          rows={2}
                          value={coordinationNote}
                          onChange={(event) => setCoordinationNote(event.target.value)}
                          placeholder="Ej. Priorizar para entrega del viernes"
                        />
                      </label>

                      <div className="pj-coordination-footer">
                        <p>Los cambios se registran en el historial del trabajo.</p>
                        <button
                          className="button button-dark"
                          type="button"
                          disabled={
                            busy ||
                            staffLoading ||
                            Boolean(staffError) ||
                            (Boolean(draftAssignee) &&
                              !eligibleStaff.some((person) => person.user_id === draftAssignee)) ||
                            (draftAssignee === (selectedStep.assigned_to || '') &&
                              draftDueAt === localDateTime(selectedStep.due_at))
                          }
                          onClick={() => void saveCoordination()}
                        >
                          <Check size={14} /> Guardar cambios
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="pj-note">Esta etapa ya terminó y su asignación quedó cerrada.</p>
                  )}
                </section>
              )}

              {/* RECORRIDO DE PRODUCCIÓN CON SELECCIÓN INTERACTIVA */}
              <section aria-labelledby={`${titleId}-stages`}>
                <h4 id={`${titleId}-stages`}>Recorrido de producción</h4>
                {steps.length ? (
                  <ol className="pjd-stages-timeline">
                    {steps.map((step, index) => {
                      const isSelected = step.id === selectedStep?.id;
                      const isOwnerMe = step.assigned_to === user?.id;
                      return (
                        <li
                          key={step.id}
                          className={`pjd-stage-item${isSelected ? ' is-selected' : ''}`}
                          data-state={step.status}
                          onClick={() => handleStepSelect(step.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleStepSelect(step.id);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          aria-pressed={isSelected}
                          aria-label={`Etapa ${index + 1}: ${step.title}. Estado: ${STEP_STATUS_LABELS[step.status] || step.status}`}
                        >
                          <span className="pjd-stage-num" aria-hidden="true">
                            {step.status === 'completed' ? (
                              <Check size={12} />
                            ) : (
                              String(index + 1).padStart(2, '0')
                            )}
                          </span>
                          <div className="pjd-stage-content">
                            <b>
                              {step.title} · {currentAreaName(step.area_id)}
                            </b>
                            <small>
                              {STEP_STATUS_LABELS[step.status] || step.status} ·{' '}
                              {isOwnerMe
                                ? 'A mi cargo'
                                : step.assigned_to
                                ? 'Asignado'
                                : 'Sin responsable'}{' '}
                              · {stamp(step.due_at)} ·{' '}
                              {step.due_at_is_manual
                                ? 'Fecha manual'
                                : `${step.estimated_minutes || 60} min estimados`}
                            </small>
                            {step.handoff_status === 'pending' && (
                              <small style={{ color: '#b26500' }}>
                                Recepción pendiente del área
                              </small>
                            )}
                            {step.handoff_status === 'accepted' && step.received_at && (
                              <small style={{ color: '#276c48' }}>
                                Recibida: {stamp(step.received_at)}
                              </small>
                            )}
                            {step.readiness_reasons?.map((reason) => (
                              <small key={reason.code} style={{ color: '#9c5b16' }}>
                                Pendiente: {reason.message}
                              </small>
                            ))}
                            {step.notes && <small>Nota: {step.notes}</small>}
                          </div>
                          <span className="pj-status" data-state={step.status}>
                            {STEP_STATUS_LABELS[step.status] || step.status}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="pj-note">Todavía no hay etapas disponibles para esta ficha.</p>
                )}
              </section>

              {/* ACTUALIZAR MI ETAPA (CHECKLIST Y ACCIONES OPERATIVAS) */}
              {canChangeSelected && selectedStep && (
                <section className="pj-actions">
                  <h4>Actualizar etapa: {selectedStep.title}</h4>
                  {selectedStep.status === 'waiting' ? (
                    <div className="pj-decision-reasons">
                      <p className="pj-note">Esta etapa está en espera:</p>
                      {(selectedStep.readiness_reasons || []).map((reason) => (
                        <span key={reason.code}>
                          <Clock3 size={13} /> {reason.message}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <>
                      <label>
                        <span>Nota para el equipo</span>
                        <textarea
                          maxLength={900}
                          value={actionNote}
                          onChange={(event) => setActionNote(event.target.value)}
                          placeholder="Incluye una decisión, referencia o motivo de bloqueo"
                        />
                      </label>

                      {selectedStepChecks.length > 0 && (
                        <div className="pj-checklist">
                          <h5>
                            <ClipboardCheck size={15} /> Lista de control de esta etapa
                          </h5>
                          {selectedStepChecks.map((check) => (
                            <div className="pj-check" key={check.id}>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={Boolean(check.completed_at)}
                                  disabled={
                                    busy ||
                                    !['ready', 'in_progress'].includes(selectedStep.status) ||
                                    !(assignedToMe || perms.canCoordinate)
                                  }
                                  onChange={(event) =>
                                    void updateStepCheck(check, event.target.checked)
                                  }
                                />
                                <span>
                                  {check.title}
                                  {!check.required && <small>Opcional</small>}
                                  {check.requires_evidence && <small>Requiere evidencia</small>}
                                </span>
                              </label>
                              {check.requires_evidence && !check.completed_at && (
                                <input
                                  className="pj-evidence-input"
                                  type="url"
                                  value={evidenceDrafts[check.id] || ''}
                                  onChange={(event) =>
                                    setEvidenceDrafts((curr) => ({
                                      ...curr,
                                      [check.id]: event.target.value,
                                    }))
                                  }
                                  placeholder="Enlace HTTPS de evidencia"
                                />
                              )}
                              {check.evidence_url && (
                                <a
                                  className="pj-check-evidence"
                                  href={check.evidence_url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Ver evidencia registrada
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="pj-action-row">
                        {selectedStep.status === 'ready' &&
                          selectedStep.handoff_status === 'pending' &&
                          (!selectedStep.assigned_to || assignedToMe || perms.canCoordinate) && (
                            <button
                              className="button button-dark"
                              type="button"
                              disabled={busy}
                              onClick={() => void receiveStep()}
                            >
                              <PackageCheck size={14} /> Recibir etapa
                            </button>
                          )}

                        {selectedStep.status === 'ready' && !selectedStep.assigned_to && (
                          <button
                            className="button button-outline"
                            type="button"
                            disabled={busy}
                            onClick={() => void runStepAction('take')}
                          >
                            <UserRound size={14} /> Tomar tarea
                          </button>
                        )}

                        {selectedStep.status === 'ready' &&
                          assignedToMe &&
                          selectedStep.handoff_status !== 'pending' && (
                            <button
                              className="button button-dark"
                              type="button"
                              disabled={busy}
                              onClick={() => void runStepAction('start')}
                            >
                              <Play size={14} /> Empezar
                            </button>
                          )}

                        {selectedStep.status === 'in_progress' &&
                          assignedToMe &&
                          !(job.approval_required && selectedStep.step_key === 'design') && (
                            <button
                              className="button button-dark"
                              type="button"
                              disabled={busy}
                              onClick={() => void runStepAction('complete')}
                            >
                              <Check size={14} /> Marcar lista
                            </button>
                          )}

                        {selectedStep.status === 'blocked' &&
                          job.status !== 'needs_review' &&
                          (assignedToMe || perms.canCoordinate) && (
                            <button
                              className="button button-outline"
                              type="button"
                              disabled={busy}
                              onClick={() => void runStepAction('unblock')}
                            >
                              Reanudar
                            </button>
                          )}

                        {['ready', 'in_progress'].includes(selectedStep.status) &&
                          assignedToMe && (
                            <button
                              className="button button-outline"
                              type="button"
                              disabled={busy}
                              onClick={() => void runStepAction('block')}
                            >
                              <AlertTriangle size={14} /> Bloquear
                            </button>
                          )}
                      </div>

                      {selectedStep.handoff_status === 'pending' && (
                        <p className="pj-note">
                          El área anterior terminó. Recibe formalmente esta etapa antes de iniciarla.
                        </p>
                      )}
                      {selectedStep.assigned_to && !assignedToMe && isStepOpen(selectedStep.status) && !perms.canCoordinate && (
                        <p className="pj-note">Esta etapa está a cargo de otra persona.</p>
                      )}
                    </>
                  )}
                </section>
              )}

              {/* LOTES, CANTIDADES FÍSICAS Y ENTREGA */}
              <section className="pj-lots" aria-label="Control de cantidades, calidad y entrega por lote">
                <div className="pj-lots-heading">
                  <div>
                    <span className="pj-artwork-eyebrow">PRODUCCIÓN PARCIAL</span>
                    <h4>
                      <PackageCheck size={16} /> Lotes, calidad y entrega
                    </h4>
                    <p>
                      La cantidad física se registra por separado de la facturación. Puedes cerrar y entregar
                      una parte mientras el saldo continúa en producción.
                    </p>
                  </div>
                  {productionLots.length > 0 && (
                    <span className="pj-lots-state">
                      {productionLots.length} {productionLots.length === 1 ? 'lote' : 'lotes'}
                    </span>
                  )}
                </div>

                {productionLots.length ? (
                  <>
                    <div className="pj-lot-totals">
                      <span>
                        En producción{' '}
                        <b>
                          {lotQuantityTotal(['in_production']).toLocaleString('es-EC')}{' '}
                          {productionLots[0]?.unit}
                        </b>
                      </span>
                      <span>
                        En calidad{' '}
                        <b>
                          {lotQuantityTotal(['quality_check']).toLocaleString('es-EC')}{' '}
                          {productionLots[0]?.unit}
                        </b>
                      </span>
                      <span>
                        Aprobado{' '}
                        <b>
                          {lotQuantityTotal(['ready_for_delivery', 'scheduled']).toLocaleString('es-EC')}{' '}
                          {productionLots[0]?.unit}
                        </b>
                      </span>
                      <span>
                        Entregado{' '}
                        <b>
                          {lotQuantityTotal(['delivered', 'installed']).toLocaleString('es-EC')}{' '}
                          {productionLots[0]?.unit}
                        </b>
                      </span>
                    </div>

                    <div className="pj-lot-list">
                      {productionLots.map((lot) => (
                        <article className="pj-lot" key={lot.id}>
                          <div className="pj-lot-main">
                            <div>
                              <b>{lot.label}</b>
                              <small>
                                {Number(lot.quantity).toLocaleString('es-EC')} {lot.unit}
                                {lot.due_at ? ` · ${stamp(lot.due_at)}` : ''}
                              </small>
                            </div>
                            <span data-state={lot.status}>
                              {LOT_STATUS_LABELS[lot.status] || lot.status}
                            </span>
                          </div>

                          {lot.notes && <p>{lot.notes}</p>}

                          {!['installed', 'cancelled'].includes(lot.status) && (
                            <div className="pj-lot-actions">
                              {lot.status !== 'delivered' && (
                                <label>
                                  <span>Tramo a mover</span>
                                  <input
                                    type="number"
                                    min="0.0001"
                                    max={lot.quantity}
                                    step="any"
                                    value={lotQuantityDrafts[lot.id] || ''}
                                    onChange={(event) =>
                                      setLotQuantityDrafts((current) => ({
                                        ...current,
                                        [lot.id]: event.target.value,
                                      }))
                                    }
                                    placeholder={`Todo el lote (${lot.quantity})`}
                                  />
                                </label>
                              )}

                              {lot.status === 'in_production' && canSubmitQuantity && (
                                <button
                                  className="button button-outline"
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void transitionLot(lot, 'submit_quality')}
                                >
                                  Enviar a calidad
                                </button>
                              )}

                              {lot.status === 'quality_check' && (
                                <>
                                  {canManageFulfillment && (
                                    <button
                                      className="button button-dark"
                                      type="button"
                                      disabled={busy}
                                      onClick={() => void transitionLot(lot, 'approve_quality')}
                                    >
                                      <Check size={14} /> Aprobar cantidad
                                    </button>
                                  )}
                                  {canManageFulfillment && (
                                    <button
                                      className="button button-outline"
                                      type="button"
                                      disabled={busy}
                                      onClick={() => void transitionLot(lot, 'request_rework')}
                                    >
                                      <RotateCcw size={14} /> Devolver a producción
                                    </button>
                                  )}
                                </>
                              )}

                              {['ready_for_delivery', 'scheduled'].includes(lot.status) && (
                                <>
                                  <div style={{ display: 'grid', gap: '4px' }}>
                                    <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                                      Fecha y hora
                                    </span>
                                    <DateTimePicker
                                      value={fulfillmentDueAt || localDateTime(lot.due_at)}
                                      onChange={(val) => setFulfillmentDueAt(val)}
                                      label="Programar entrega de lote"
                                    />
                                  </div>

                                  {canManageFulfillment && (
                                    <button
                                      className="button button-outline"
                                      type="button"
                                      disabled={busy || (!fulfillmentDueAt && !lot.due_at)}
                                      onClick={() => void transitionLot(lot, 'schedule_delivery')}
                                    >
                                      <CalendarClock size={14} /> Programar
                                    </button>
                                  )}
                                  {canManageFulfillment && (
                                    <button
                                      className="button button-dark"
                                      type="button"
                                      disabled={busy}
                                      onClick={() => void transitionLot(lot, 'deliver')}
                                    >
                                      Confirmar entrega
                                    </button>
                                  )}
                                  {canManageFulfillment && (
                                    <button
                                      className="button button-outline"
                                      type="button"
                                      disabled={busy}
                                      onClick={() => void transitionLot(lot, 'request_rework')}
                                    >
                                      Pedir retrabajo
                                    </button>
                                  )}
                                </>
                              )}

                              {lot.status === 'delivered' && canManageFulfillment && (
                                <button
                                  className="button button-dark"
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void transitionLot(lot, 'install')}
                                >
                                  <Check size={14} /> Confirmar instalación
                                </button>
                              )}
                            </div>
                          )}
                        </article>
                      ))}
                    </div>

                    {canManageFulfillment &&
                      productionLots.some((lot) =>
                        ['quality_check', 'ready_for_delivery', 'scheduled'].includes(lot.status)
                      ) && (
                        <label className="pj-lot-note">
                          <span>Observación de calidad o motivo del retrabajo</span>
                          <textarea
                            maxLength={1000}
                            rows={2}
                            value={lotNote}
                            onChange={(event) => setLotNote(event.target.value)}
                            placeholder="Deja una razón breve y útil para el siguiente responsable"
                          />
                        </label>
                      )}
                  </>
                ) : (
                  <>
                    {canManageFulfillment && ['open', 'needs_review'].includes(job.status) && (
                      <>
                        <p className="pj-note">
                          Activa esta opción al trabajar con cantidades físicas o entregas parciales. La
                          cantidad de la venta puede representar m² u otra base de facturación; no se
                          copiará automáticamente.
                        </p>
                        <div className="pj-lot-config">
                          <label>
                            <span>Cantidad física total</span>
                            <input
                              type="number"
                              min="0.0001"
                              max="1000000"
                              step="any"
                              value={physicalQuantity}
                              onChange={(event) => setPhysicalQuantity(event.target.value)}
                              placeholder="Ej. 50"
                            />
                          </label>
                          <label>
                            <span>Unidad física</span>
                            <input
                              maxLength={24}
                              value={physicalUnit}
                              onChange={(event) => setPhysicalUnit(event.target.value)}
                              placeholder="unidades, m, piezas…"
                            />
                          </label>
                          <button
                            className="button button-dark"
                            type="button"
                            disabled={busy || !physicalQuantity.trim() || !physicalUnit.trim()}
                            onClick={() => void configurePhysicalQuantity()}
                          >
                            Iniciar control por cantidades
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* CIERRE DE TRABAJO COMPLETO SIN LOTES */}
                {canManageFulfillment && !productionLots.length && job.status === 'completed' && (
                  <section className="pj-fulfillment">
                    <div>
                      <span className="pj-artwork-eyebrow">CIERRE Y ENTREGA</span>
                      <h4>
                        <ShieldCheck size={16} />{' '}
                        {job.workflow_code === 'none' ? 'Coordinar entrega' : 'Calidad y entrega'}
                      </h4>
                      <p>
                        {job.workflow_code === 'none'
                          ? 'Esta ruta no requiere etapas de producción. Registra la fecha y confirma la entrega cuando corresponda.'
                          : 'Al cerrar las etapas se abre el control de calidad; después podrás programar y registrar la entrega.'}
                      </p>
                    </div>

                    <span className="pj-fulfillment-state">
                      {job.fulfillment_status === 'ready_for_delivery' && job.workflow_code === 'none'
                        ? 'Listo para entrega'
                        : FULFILLMENT_LABELS[job.fulfillment_status || 'quality_check'] ||
                          job.fulfillment_status}
                    </span>

                    {['ready_for_delivery', 'scheduled'].includes(job.fulfillment_status || '') && (
                      <div style={{ display: 'grid', gap: '4px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                          Fecha y hora de entrega
                        </span>
                        <DateTimePicker
                          value={fulfillmentDueAt || localDateTime(job.fulfillment_due_at)}
                          onChange={(val) => setFulfillmentDueAt(val)}
                          label="Fecha y hora de entrega"
                        />
                      </div>
                    )}

                    <label>
                      <span>
                        {job.workflow_code === 'none'
                          ? 'Nota de entrega'
                          : 'Nota de calidad o entrega'}
                      </span>
                      <textarea
                        maxLength={1000}
                        rows={2}
                        value={actionNote}
                        onChange={(event) => setActionNote(event.target.value)}
                        placeholder={
                          job.workflow_code === 'none'
                            ? 'Horario, referencia o constancia de entrega'
                            : 'Observación del acabado, horario o constancia de entrega'
                        }
                      />
                    </label>

                    <div className="pj-action-row">
                      {job.fulfillment_status === 'quality_check' && (
                        <button
                          className="button button-dark"
                          type="button"
                          disabled={busy}
                          onClick={() => void updateFulfillment('quality_pass')}
                        >
                          <Check size={14} /> Aprobar calidad
                        </button>
                      )}

                      {['ready_for_delivery', 'scheduled'].includes(job.fulfillment_status || '') && (
                        <button
                          className="button button-outline"
                          type="button"
                          disabled={busy || (!fulfillmentDueAt && !job.fulfillment_due_at)}
                          onClick={() => void updateFulfillment('schedule_delivery')}
                        >
                          <CalendarClock size={14} /> Programar entrega
                        </button>
                      )}

                      {['ready_for_delivery', 'scheduled'].includes(job.fulfillment_status || '') && (
                        <button
                          className="button button-dark"
                          type="button"
                          disabled={busy}
                          onClick={() => void updateFulfillment('deliver')}
                        >
                          <PackageCheck size={14} /> Confirmar entrega
                        </button>
                      )}

                      {job.fulfillment_status === 'delivered' && (
                        <button
                          className="button button-dark"
                          type="button"
                          disabled={busy}
                          onClick={() => void updateFulfillment('install')}
                        >
                          <Check size={14} /> Confirmar instalación
                        </button>
                      )}
                    </div>

                    {job.fulfillment_note && <small>{job.fulfillment_note}</small>}
                  </section>
                )}
              </section>

              {/* SOLICITAR RETRABAJO EN ETAPAS TERMINADAS */}
              {selectedStep?.status === 'completed' &&
                job.status !== 'cancelled' &&
                (perms.canCoordinate || perms.canActInArea(selectedStepAreaCode)) && (
                  <section className="pj-actions pj-rework">
                    <h4>
                      <RotateCcw size={15} /> Solicitar retrabajo
                    </h4>
                    <p className="pj-note">
                      Elige una etapa anterior terminada. Se reabrirán esa etapa y las dependientes que
                      ya se completaron, con historial del motivo.
                    </p>
                    <label>
                      <span>Etapa que debe repetirse</span>
                      <select
                        value={selectedReworkTarget?.id || ''}
                        onChange={(event) => setReworkTarget(event.target.value)}
                      >
                        <option value="">Selecciona una etapa</option>
                        {reworkCandidates.map((step) => (
                          <option value={step.id} key={step.id}>
                            {step.title} · {currentAreaName(step.area_id)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Motivo del retrabajo</span>
                      <textarea
                        maxLength={1000}
                        rows={2}
                        value={actionNote}
                        onChange={(event) => setActionNote(event.target.value)}
                        placeholder="Ej. La medida de la pieza final no coincide con la ficha"
                      />
                    </label>
                    <button
                      className="button button-outline"
                      type="button"
                      disabled={busy || !selectedReworkTarget || actionNote.trim().length < 3}
                      onClick={() => void requestRework()}
                    >
                      <RotateCcw size={14} /> Reabrir etapa afectada
                    </button>
                  </section>
                )}

              {/* HISTORIAL DE CAMBIOS Y EVENTOS */}
              <section aria-labelledby={`${titleId}-history`}>
                <h4 id={`${titleId}-history`}>Historial de cambios</h4>
                {events.length ? (
                  <ol className="pj-history">
                    {events.slice(0, 30).map((event) => (
                      <li key={event.id}>
                        <span className="pj-stage-dot" aria-hidden="true">
                          ·
                        </span>
                        <div>
                          <b>{eventTitle(event)}</b>
                          <small> · {stamp(event.created_at)}</small>
                          {eventNote(event) && <p>{eventNote(event)}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="pj-note">No hay cambios registrados todavía.</p>
                )}
              </section>

              {/* MENSAJES DE ACCIÓN Y ALERTAS */}
              {actionError && (
                <p className="pj-error" role="alert">
                  {actionError}
                </p>
              )}
              {actionMessage && (
                <p className="pj-note" role="status" aria-live="polite">
                  {actionMessage}
                </p>
              )}
            </div>
          )}
        </div>
      </Sheet>

      {/* DRAWER DE CHATTER 360 INTEGRADO */}
      {job && (
        <ChatterDrawer360
          open={chatterOpen}
          onClose={() => setChatterOpen(false)}
          recordType="job"
          recordId={job.id}
          recordTitle={job.title}
          recordSubtitle={job.customer_name || undefined}
          recordPhone={job.customer_phone || undefined}
          recordStage={job.status}
        />
      )}
    </>
  );
}

export default ProductionJobDetailSheet;
