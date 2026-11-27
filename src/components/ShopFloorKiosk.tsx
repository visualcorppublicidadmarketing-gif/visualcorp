import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Printer,
  Layers,
  Search,
  ZoomIn,
  RefreshCw,
  FileText,
  X,
  Info,
  PenTool,
  Hammer,
  ScanLine,
  Shirt,
  ClipboardList,
  UserRound,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Check,
  ArrowRight,
  RotateCcw,
  Wrench,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';
import { useConfirm } from './ui/OperationalKit';
import { ProductionMaterialPanel } from './inventory/ProductionMaterialPanel';
import { ProductionJobDetailSheet } from '../pages/operations/ProductionJobDetailSheet';
import {
  type AreaCode,
  type AreaSlug,
  type ProductionAreaRow,
  type ProductionJob,
  type ProductionStep,
  type ProductionStepCheck,
  type StepStatus,
  AREA_CODE_TO_SLUG,
  AREA_SLUG_TO_CODE,
  STEP_STATUS_LABELS,
  priorityDetails,
  isStepOpen,
  isDateOverdue,
  stamp,
  safeDate,
  dayKey,
  todayKey,
  resolveProductionPermissions,
  getKioskUiPrefs,
  setKioskUiPrefs,
  useProductionSync,
  emitProductionChanged,
} from '../lib/productionHub';
import './shop-floor-kiosk.css';

/* ==========================================================================
   1. TIPOS Y CONFIGURACIÓN DE ESTACIONES REALES
   ========================================================================== */

export type StationCode = 'all' | 'IMP' | 'TAL' | 'LAS' | 'SUB' | 'DIS' | 'ASE';
export type KioskStatusFilter = 'all' | 'in_progress' | 'ready' | 'blocked' | 'completed';

export interface EquipmentAssetRow {
  id: string;
  organization_id: string;
  asset_code: string;
  name: string;
  equipment_type: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  status: string;
  condition: string;
  location: string;
  notes: string;
  reference_image_url: string | null;
  area_id: string | null;
  branch_id: string | null;
  custom_fields?: Record<string, unknown> | null;
}

export interface EquipmentAreaRow {
  id: string;
  name: string;
  code: string;
  active?: boolean;
}

interface EnrichedStep {
  step: ProductionStep;
  job: ProductionJob;
  area: ProductionAreaRow | null;
  areaCode: AreaCode | string;
  pendingChecksCount: number;
}

interface StationTabItem {
  code: StationCode;
  name: string;
  shortName: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const STATIONS: StationTabItem[] = [
  { code: 'all', name: 'Todos los Centros', shortName: 'Todos', icon: Layers },
  { code: 'IMP', name: 'Impresión Gran Formato', shortName: 'Impresión', icon: Printer },
  { code: 'TAL', name: 'Taller & Acabados', shortName: 'Taller', icon: Hammer },
  { code: 'LAS', name: 'Corte Láser CNC', shortName: 'Láser', icon: ScanLine },
  { code: 'SUB', name: 'Sublimación Textil', shortName: 'Sublimación', icon: Shirt },
  { code: 'DIS', name: 'Diseño Gráfico & Preprensa', shortName: 'Diseño', icon: PenTool },
  { code: 'ASE', name: 'Asesoría & Recepción', shortName: 'Asesoría', icon: ClipboardList },
];

const COMMON_SCRAP_CAUSES = [
  'Cabezal tapado / Desfase de inyectores',
  'Arruga o atasco de material en rodillos',
  'Error de archivo / Arte desactualizado',
  'Corte / Troquel desfasado (descalibre)',
  'Burbujas en laminado en frío',
  'Defecto de bobina / Material con falla de fábrica',
  'Medidas erradas de pedido / Ajuste de preprensa',
  'Otro motivo / Incidente imprevisto',
];

const COMMON_PAUSE_REASONS = [
  'Cambio de bobina / nuevo rollo de material',
  'Almuerzo / Receso del operador',
  'Limpieza y purga profunda de inyectores',
  'Espera de material o insumos en bodega',
  'Aprobación de prueba de color con el cliente',
  'Revisión mecánica o cambio de cuchilla',
  'Observaciones técnicas en el archivo',
  'Otro motivo de detención',
];

const CONFIRMED_EQUIPMENT_STATUSES = [
  'Operativo',
  'Por verificar',
  'En mantenimiento',
  'Fuera de servicio',
] as const;

function normalizeStation(saved?: string): StationCode {
  if (!saved || saved === 'all') return 'all';
  if (['IMP', 'TAL', 'LAS', 'SUB', 'DIS', 'ASE'].includes(saved)) {
    return saved as StationCode;
  }
  const slugCode = AREA_SLUG_TO_CODE[saved as AreaSlug];
  if (slugCode && ['IMP', 'TAL', 'LAS', 'SUB', 'DIS', 'ASE'].includes(slugCode)) {
    return slugCode as StationCode;
  }
  return 'all';
}

function formatElapsed(totalSec: number): string {
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export interface ShopFloorKioskProps {
  initialStation?: string;
  onJobSelect?: (jobId: string) => void;
  className?: string;
}

/* ==========================================================================
   2. COMPONENTE PRINCIPAL: SHOP FLOOR KIOSK
   ========================================================================== */

export function ShopFloorKiosk({
  initialStation,
  onJobSelect,
  className = '',
}: ShopFloorKioskProps) {
  const auth = useAuth();
  const { user, organizationId, roles, hasPermission } = auth;
  const perms = useMemo(() => resolveProductionPermissions(auth), [auth]);
  const confirm = useConfirm();

  // Preferencias visuales persistidas en localStorage exclusivamente
  const initialPrefs = useMemo(() => getKioskUiPrefs(), []);
  const [selectedStation, setSelectedStation] = useState<StationCode>(() =>
    normalizeStation(initialStation || initialPrefs.stationArea)
  );
  const [statusFilter, setStatusFilter] = useState<KioskStatusFilter>(() => {
    const saved = initialPrefs.statusFilter;
    if (saved && ['all', 'in_progress', 'ready', 'blocked', 'completed'].includes(saved)) {
      return saved as KioskStatusFilter;
    }
    return 'all';
  });

  const [searchQuery, setSearchQuery] = useState('');

  // Estados de datos remotos reales de Supabase
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [steps, setSteps] = useState<ProductionStep[]>([]);
  const [stepChecks, setStepChecks] = useState<ProductionStepCheck[]>([]);
  const [areas, setAreas] = useState<ProductionAreaRow[]>([]);
  const [machines, setMachines] = useState<EquipmentAssetRow[]>([]);
  const [equipmentAreas, setEquipmentAreas] = useState<EquipmentAreaRow[]>([]);

  // Estados de carga y operaciones
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeMachineId, setActiveMachineId] = useState<string | null>(null);

  // Reloj en vivo de Ecuador y tick para cronómetros en vivo
  const [currentTime, setCurrentTime] = useState(new Date());
  const [nowMs, setNowMs] = useState(Date.now());

  // Modales de operación
  const [pauseModalStep, setPauseModalStep] = useState<ProductionStep | null>(null);
  const [selectedPauseReason, setSelectedPauseReason] = useState<string>(COMMON_PAUSE_REASONS[0]);
  const [pauseReasonCustom, setPauseReasonCustom] = useState<string>('');

  const [scrapModalItem, setScrapModalItem] = useState<{ step: ProductionStep; job: ProductionJob } | null>(null);
  const [scrapReason, setScrapReason] = useState<string>(COMMON_SCRAP_CAUSES[0]);
  const [scrapNotes, setScrapNotes] = useState<string>('');

  const [prepressModalItem, setPrepressModalItem] = useState<{ step: ProductionStep; job: ProductionJob } | null>(null);
  const [machineStatusModalMachine, setMachineStatusModalMachine] = useState<EquipmentAssetRow | null>(null);

  // Ficha técnica unificada (ProductionJobDetailSheet)
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [detailStepId, setDetailStepId] = useState<string | null>(null);
  const [detailAreaCode, setDetailAreaCode] = useState<string | null>(null);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string>('');
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.([40, 30, 40]);
      } catch {
        // ignore
      }
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage('');
    }, 4200);
  }, []);

  /* ------------------------------------------------------------------------
     Carga de Datos Reales desde Supabase
     ------------------------------------------------------------------------ */
  const reloadData = useCallback(async () => {
    if (!supabase || !organizationId) {
      setLoading(false);
      return;
    }

    try {
      const [areasResult, eqAreasResult, assetsResult, jobsResult] = await Promise.all([
        supabase.from('areas').select('*').eq('organization_id', organizationId),
        supabase.from('equipment_areas').select('id, name, code').eq('organization_id', organizationId).eq('active', true),
        supabase.from('equipment_assets').select('*').eq('organization_id', organizationId).neq('status', 'Retirado').order('name'),
        supabase
          .from('production_jobs')
          .select('*')
          .eq('organization_id', organizationId)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (areasResult.error) throw areasResult.error;
      if (eqAreasResult.error) throw eqAreasResult.error;
      if (assetsResult.error) throw assetsResult.error;
      if (jobsResult.error) throw jobsResult.error;

      const jobsData = (jobsResult.data || []) as ProductionJob[];
      setAreas((areasResult.data || []) as ProductionAreaRow[]);
      setEquipmentAreas((eqAreasResult.data || []) as EquipmentAreaRow[]);
      setMachines((assetsResult.data || []) as EquipmentAssetRow[]);
      setJobs(jobsData);

      const jobIds = jobsData.map((j) => j.id);
      if (jobIds.length > 0) {
        const [stepsResult, checksResult] = await Promise.all([
          supabase
            .from('production_job_steps')
            .select('*')
            .eq('organization_id', organizationId)
            .in('job_id', jobIds)
            .order('step_order', { ascending: true })
            .limit(900),
          supabase
            .from('production_job_step_checks')
            .select('*')
            .eq('organization_id', organizationId)
            .in('job_id', jobIds)
            .limit(900),
        ]);

        if (stepsResult.error) throw stepsResult.error;
        if (checksResult.error) throw checksResult.error;

        setSteps((stepsResult.data || []) as ProductionStep[]);
        setStepChecks((checksResult.data || []) as ProductionStepCheck[]);
      } else {
        setSteps([]);
        setStepChecks([]);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al consultar producción en Supabase');
    } finally {
      setLoading(false);
    }
  }, [organizationId, showToast]);

  // Hook de sincronización en tiempo real
  const { lastSyncedAt, refreshing, isStale, triggerRefresh, markSynced } = useProductionSync({
    onRefresh: reloadData,
    staleAfterMs: 180000,
  });

  useEffect(() => {
    void reloadData().then(() => markSynced());
  }, [reloadData, markSynced]);

  // Reloj local y cronómetro continuo
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      setNowMs(now.getTime());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Cierre de modales con tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPauseModalStep(null);
        setScrapModalItem(null);
        setPrepressModalItem(null);
        setMachineStatusModalMachine(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  /* ------------------------------------------------------------------------
     Mapeo y Enriquecimiento de Etapas
     ------------------------------------------------------------------------ */
  const areaById = useMemo(() => {
    const map = new Map<string, ProductionAreaRow>();
    areas.forEach((a) => map.set(a.id, a));
    return map;
  }, [areas]);

  const jobById = useMemo(() => {
    const map = new Map<string, ProductionJob>();
    jobs.forEach((j) => map.set(j.id, j));
    return map;
  }, [jobs]);

  const checksByStepId = useMemo(() => {
    const map = new Map<string, ProductionStepCheck[]>();
    stepChecks.forEach((c) => {
      const list = map.get(c.step_id) || [];
      list.push(c);
      map.set(c.step_id, list);
    });
    return map;
  }, [stepChecks]);

  const enrichedSteps = useMemo<EnrichedStep[]>(() => {
    return steps
      .map((step) => {
        const job = jobById.get(step.job_id);
        if (!job) return null;
        const area = areaById.get(step.area_id) || null;
        const areaCode = (area?.code || step.area_code || 'TAL').toUpperCase();
        const checks = checksByStepId.get(step.id) || [];
        const pendingChecksCount = checks.filter((c) => c.required && !c.completed_at).length;
        return {
          step,
          job,
          area,
          areaCode,
          pendingChecksCount,
        };
      })
      .filter((item): item is EnrichedStep => item !== null);
  }, [steps, jobById, areaById, checksByStepId]);

  // Conteos por centro de trabajo (estación)
  const stationCounts = useMemo(() => {
    const counts: Record<StationCode, number> = {
      all: 0,
      IMP: 0,
      TAL: 0,
      LAS: 0,
      SUB: 0,
      DIS: 0,
      ASE: 0,
    };

    enrichedSteps.forEach(({ step, areaCode }) => {
      if (isStepOpen(step.status)) {
        counts.all += 1;
        if (counts[areaCode as StationCode] !== undefined) {
          counts[areaCode as StationCode] += 1;
        }
      }
    });

    return counts;
  }, [enrichedSteps]);

  // Filtrado final de etapas para la vista
  const filteredSteps = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return enrichedSteps.filter(({ step, job, areaCode }) => {
      // Filtro de estación
      if (selectedStation !== 'all' && areaCode !== selectedStation) {
        return false;
      }

      // Filtro de estado
      if (statusFilter === 'all') {
        if (!isStepOpen(step.status)) return false;
      } else if (statusFilter === 'in_progress') {
        if (step.status !== 'in_progress') return false;
      } else if (statusFilter === 'ready') {
        if (step.status !== 'ready') return false;
      } else if (statusFilter === 'blocked') {
        if (step.status !== 'blocked') return false;
      } else if (statusFilter === 'completed') {
        if (step.status !== 'completed') return false;
      }

      // Filtro de búsqueda
      if (q) {
        const code = (job.sale_code || job.id).toLowerCase();
        const client = (job.customer_name || '').toLowerCase();
        const title = (job.title || '').toLowerCase();
        const stepTitle = (step.title || '').toLowerCase();
        const material = String(job.specifications?.material || '').toLowerCase();

        if (
          !code.includes(q) &&
          !client.includes(q) &&
          !title.includes(q) &&
          !stepTitle.includes(q) &&
          !material.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [enrichedSteps, selectedStation, statusFilter, searchQuery]);

  // Métricas del turno en vivo
  const shiftMetrics = useMemo(() => {
    let running = 0;
    let ready = 0;
    let blocked = 0;
    let completed = 0;
    let totalM2 = 0;

    enrichedSteps.forEach(({ step, job }) => {
      if (step.status === 'in_progress') running += 1;
      else if (step.status === 'ready') ready += 1;
      else if (step.status === 'blocked') blocked += 1;
      else if (step.status === 'completed') completed += 1;

      if (step.status === 'in_progress' || step.status === 'completed') {
        const w = Number(job.specifications?.width_cm) || 0;
        const h = Number(job.specifications?.height_cm) || 0;
        const qty = Number(job.specifications?.quantity) || 1;
        if (w > 0 && h > 0) {
          totalM2 += (w / 100) * (h / 100) * qty;
        }
      }
    });

    return {
      running,
      ready,
      blocked,
      completed,
      totalAreaM2: totalM2.toFixed(1),
    };
  }, [enrichedSteps]);

  // Control de permisos de operador
  const operatorName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Operador en Taller';
  const roleLabel = perms.roleLabels[0] || 'Personal de Taller';
  const canManageEquipment =
    perms.canCoordinate ||
    roles.some((r) => ['owner', 'admin', 'manager', 'warehouse', 'production'].includes(r)) ||
    hasPermission('inventory', 'edit') ||
    hasPermission('workshop', 'edit');

  /* ------------------------------------------------------------------------
     Acciones Operativas Reales sobre Etapas de Producción
     ------------------------------------------------------------------------ */
  const handleStationClick = (code: StationCode) => {
    setSelectedStation(code);
    setKioskUiPrefs({ stationArea: code });
  };

  const handleStatusFilterClick = (filter: KioskStatusFilter) => {
    setStatusFilter(filter);
    setKioskUiPrefs({ statusFilter: filter });
  };

  const openJobDetail = (jobId: string, stepId?: string, areaCode?: string) => {
    setDetailJobId(jobId);
    setDetailStepId(stepId || null);
    setDetailAreaCode(areaCode || null);
    setDetailOpen(true);
    if (onJobSelect) onJobSelect(jobId);
  };

  // Recibir etapa
  const handleReceiveStep = async (step: ProductionStep) => {
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('receive_production_job_step', {
        p_step_id: step.id,
        p_note: 'Recepción confirmada en Terminal Kiosk de Taller',
      });
      if (error) throw error;
      showToast(`📥 Etapa "${step.title}" recibida formalmente en taller.`);
      emitProductionChanged();
      await reloadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al recibir etapa');
    } finally {
      setBusy(false);
    }
  };

  // Tomar o Iniciar etapa
  const handleStartStep = async (step: ProductionStep) => {
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('transition_production_job_step', {
        p_step_id: step.id,
        p_action: 'start',
        p_note: 'Iniciado desde Terminal Kiosk',
        p_assigned_to: step.assigned_to ? null : user?.id || null,
      });
      if (error) throw error;
      showToast(`▶ Etapa "${step.title}" iniciada. Cronómetro en vivo activo.`);
      emitProductionChanged();
      await reloadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al iniciar etapa');
    } finally {
      setBusy(false);
    }
  };

  const handleTakeStep = async (step: ProductionStep) => {
    if (!supabase || busy || !user?.id) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('transition_production_job_step', {
        p_step_id: step.id,
        p_action: 'take',
        p_note: 'Etapa tomada por operador en Terminal Kiosk',
        p_assigned_to: user.id,
      });
      if (error) throw error;
      showToast(`👤 Etapa asignada a tu usuario.`);
      emitProductionChanged();
      await reloadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al tomar etapa');
    } finally {
      setBusy(false);
    }
  };

  // Terminar etapa con confirmación accesible
  const handleCompleteStep = async (
    step: ProductionStep,
    job: ProductionJob,
    pendingChecksCount: number
  ) => {
    if (!supabase || busy) return;

    const ok = await confirm({
      title: `¿Marcar como terminada la etapa "${step.title}"?`,
      eyebrow: 'FINALIZACIÓN DE ETAPA',
      description:
        pendingChecksCount > 0
          ? `⚠️ ATENCIÓN: Hay ${pendingChecksCount} control(es) de calidad requeridos pendientes en esta etapa. Si confirmas, la etapa se marcará como terminada y se habilitará la siguiente.`
          : `Se registrará la finalización de la etapa "${step.title}" del trabajo ${job.sale_code || job.title}. La etapa subsiguiente quedará habilitada en el flujo.`,
      tone: pendingChecksCount > 0 ? 'warning' : 'info',
      confirmLabel: 'Sí, marcar terminada',
      cancelLabel: 'Revisar etapa',
      summaryItems: [
        { label: 'Trabajo', value: job.sale_code || job.title },
        { label: 'Etapa', value: step.title },
        {
          label: 'Controles pendientes',
          value: pendingChecksCount > 0 ? `${pendingChecksCount} pendientes` : 'Completos',
        },
      ],
    });
    if (!ok) return;

    setBusy(true);
    try {
      const { error } = await supabase.rpc('transition_production_job_step', {
        p_step_id: step.id,
        p_action: 'complete',
        p_note: 'Terminada desde Terminal Kiosk',
        p_assigned_to: null,
      });
      if (error) throw error;
      showToast(`✔ Etapa "${step.title}" completada con éxito.`);
      emitProductionChanged();
      await reloadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al terminar etapa');
    } finally {
      setBusy(false);
    }
  };

  // Reanudar etapa bloqueada
  const handleUnblockStep = async (step: ProductionStep) => {
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('transition_production_job_step', {
        p_step_id: step.id,
        p_action: 'unblock',
        p_note: 'Reanudada desde Terminal Kiosk',
        p_assigned_to: null,
      });
      if (error) throw error;
      showToast(`▶ Etapa "${step.title}" reanudada. Lista para volver a producir.`);
      emitProductionChanged();
      await reloadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al reanudar etapa');
    } finally {
      setBusy(false);
    }
  };

  // Confirmar pausa/bloqueo con motivo
  const handleConfirmPause = async () => {
    if (!pauseModalStep || busy) return;
    const note = (pauseReasonCustom.trim() || selectedPauseReason).trim();
    if (note.length < 3) {
      showToast('Debes ingresar un motivo de pausa de al menos 3 caracteres.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('transition_production_job_step', {
        p_step_id: pauseModalStep.id,
        p_action: 'block',
        p_note: note,
        p_assigned_to: null,
      });
      if (error) throw error;
      showToast(`⏸ Etapa detenida/bloqueada: ${note}`);
      setPauseModalStep(null);
      setPauseReasonCustom('');
      emitProductionChanged();
      await reloadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al pausar etapa');
    } finally {
      setBusy(false);
    }
  };

  // Acciones auditable del modal de merma / incidente
  const handleScrapBlockStep = async () => {
    if (!scrapModalItem || busy) return;
    const fullNote = `Merma/Incidente: ${scrapReason}${scrapNotes.trim() ? ` · Detalle: ${scrapNotes.trim()}` : ''}`;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('transition_production_job_step', {
        p_step_id: scrapModalItem.step.id,
        p_action: 'block',
        p_note: fullNote,
        p_assigned_to: null,
      });
      if (error) throw error;
      showToast(`⚠️ Merma reportada y etapa detenida: ${scrapReason}`);
      setScrapModalItem(null);
      emitProductionChanged();
      await reloadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al reportar merma');
    } finally {
      setBusy(false);
    }
  };

  const handleScrapNoteJob = async () => {
    if (!scrapModalItem || busy) return;
    const fullNote = `Merma reportada en taller: ${scrapReason}${scrapNotes.trim() ? ` · Detalle: ${scrapNotes.trim()}` : ''}`;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('update_production_job', {
        p_job_id: scrapModalItem.job.id,
        p_expected_version: scrapModalItem.job.spec_version,
        p_specifications: null,
        p_note: fullNote,
      });
      if (error) throw error;
      showToast(`📝 Merma registrada en la bitácora del trabajo.`);
      setScrapModalItem(null);
      emitProductionChanged();
      await reloadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al registrar nota de merma');
    } finally {
      setBusy(false);
    }
  };

  // Cambio de estado real en equipment_assets
  const handleUpdateMachineStatus = async (asset: EquipmentAssetRow, newStatus: string) => {
    if (!supabase || busy || !organizationId) return;
    const ok = await confirm({
      title: `¿Actualizar estado de "${asset.name}"?`,
      eyebrow: 'PARQUE DE MAQUINARIA',
      description: `El estado del equipo pasará de "${asset.status}" a "${newStatus}". Este cambio se sincronizará inmediatamente con el inventario de la planta.`,
      tone: newStatus === 'Operativo' ? 'info' : 'warning',
      confirmLabel: `Marcar como ${newStatus}`,
      cancelLabel: 'Cancelar',
      summaryItems: [
        { label: 'Equipo', value: asset.name },
        { label: 'Código', value: asset.asset_code },
        { label: 'Nuevo Estado', value: newStatus },
      ],
    });
    if (!ok) return;

    setBusy(true);
    try {
      const { error } = await supabase
        .from('equipment_assets')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', asset.id)
        .eq('organization_id', organizationId);
      if (error) throw error;
      showToast(`🔧 Estado de ${asset.name} actualizado a "${newStatus}".`);
      setMachineStatusModalMachine(null);
      await reloadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al actualizar equipo');
    } finally {
      setBusy(false);
    }
  };

  // Formatos de fecha y hora
  const formattedTime = useMemo(() => {
    return currentTime.toLocaleTimeString('es-EC', {
      timeZone: 'America/Guayaquil',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }, [currentTime]);

  const formattedDate = useMemo(() => {
    return currentTime.toLocaleDateString('es-EC', {
      timeZone: 'America/Guayaquil',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, [currentTime]);

  const todayStr = useMemo(() => todayKey(), []);

  return (
    <div className={`sf-kiosk ${className}`}>
      {/* ===================================================================
          Cabecera Principal de Taller (Operador Real + Reloj Guayaquil)
          =================================================================== */}
      <header className="sf-header">
        <div className="sf-brand-area">
          <div className="sf-brand-badge" aria-hidden="true">
            <Printer size={24} />
          </div>
          <div className="sf-brand-info">
            <h1>
              Visual Corp · Terminal de Taller
              <span className="sf-brand-tag">MRP Kiosk v2.0</span>
            </h1>
            <p className="sf-brand-location">
              Planta de Producción · Milagro, Guayas, Ecuador · Supabase Realtime
            </p>
          </div>
        </div>

        <div className="sf-header-controls">
          {/* Reloj Digital en Vivo (Hora Oficial Ecuador) */}
          <div className="sf-live-clock" title="Hora oficial de planta en Milagro, Ecuador">
            <Clock size={18} className="text-primary" />
            <span className="sf-clock-time">{formattedTime}</span>
            <span className="sf-clock-date">{formattedDate}</span>
          </div>

          {/* Operador de Turno Autenticado Real */}
          <div
            className="sf-operator-pill"
            title={`Sesión activa: ${user?.email || 'Autenticado'}`}
          >
            <UserRound size={16} />
            <span className="sf-operator-label">Operador:</span>
            <strong>{operatorName}</strong>
            <span className="sf-operator-role">({roleLabel})</span>
          </div>

          {/* Estado de sincronización en tiempo real */}
          {isStale && (
            <div
              className="sf-sync-stale-badge"
              title="La conexión local tiene datos desactualizados (más de 3 min)"
            >
              <ShieldAlert size={15} />
              <span>Desactualizado</span>
            </div>
          )}

          {/* Botón táctil de refresco */}
          <button
            type="button"
            className="sf-btn-icon-tactile"
            title={`Actualizar cola de taller (Última sinc: ${lastSyncedAt ? stamp(lastSyncedAt) : 'Pendiente'})`}
            onClick={() => void triggerRefresh()}
            disabled={refreshing}
            aria-label="Actualizar datos de producción"
          >
            <RefreshCw size={20} className={refreshing ? 'sf-spin' : ''} />
          </button>
        </div>
      </header>

      {/* ===================================================================
          Barra de Maquinaria Real (equipment_assets de Supabase)
          =================================================================== */}
      <section className="sf-machines-bar">
        <div className="sf-machines-header">
          <div className="sf-machines-title">
            <Printer size={18} />
            <span>Monitoreo de Maquinaria en Planta ({machines.length} equipos reales)</span>
          </div>
          <div className="sf-machines-actions">
            <span className="sf-machines-summary">
              {machines.length === 0
                ? 'Sin equipos cargados en base de datos'
                : 'Toque cualquier equipo para cambiar su estado operativo'}
            </span>
            <Link
              to="/operaciones/equipos"
              className="sf-link-equipos"
              title="Ir al Registro completo de Equipos y Activos"
            >
              <span>Ver Registro</span>
              <ExternalLink size={13} />
            </Link>
          </div>
        </div>

        {machines.length === 0 ? (
          <div className="sf-machines-empty">
            <p>
              <strong>Pendiente de configuración en Registro de Equipos:</strong> Aún no se han
              registrado equipos ni maquinaria física en la organización.
            </p>
            <Link to="/operaciones/equipos" className="sf-btn-tactile sf-btn-finish">
              Configurar Equipos en /operaciones/equipos
            </Link>
          </div>
        ) : (
          <div className="sf-machines-grid">
            {machines.map((machine) => {
              const isSelected = activeMachineId === machine.id;
              const eqArea = equipmentAreas.find((a) => a.id === machine.area_id);
              const statusClass =
                machine.status === 'Operativo'
                  ? 'operational'
                  : machine.status === 'En mantenimiento'
                  ? 'maintenance'
                  : machine.status === 'Fuera de servicio'
                  ? 'stopped'
                  : 'standby';

              return (
                <div
                  key={machine.id}
                  className={`sf-machine-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setActiveMachineId(machine.id)}
                >
                  <div className="sf-machine-card-top">
                    <div className="sf-machine-name-group">
                      <Printer size={16} />
                      <span title={machine.name}>{machine.name}</span>
                    </div>

                    <button
                      type="button"
                      className={`sf-status-badge ${statusClass}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (canManageEquipment) {
                          setMachineStatusModalMachine(machine);
                        } else {
                          showToast('Tu rol no tiene permiso para cambiar el estado operativo.');
                        }
                      }}
                      title={
                        canManageEquipment
                          ? 'Toque para cambiar el estado operativo en Supabase'
                          : 'Estado operativo actual'
                      }
                    >
                      {machine.status}
                    </button>
                  </div>

                  <div className="sf-machine-meta-strip">
                    <span className="sf-machine-code-badge">{machine.asset_code}</span>
                    <span className="sf-machine-area-label">
                      {eqArea ? eqArea.name : 'Área no asignada'}
                    </span>
                    {machine.location && (
                      <span className="sf-machine-location-label" title={machine.location}>
                        📍 {machine.location}
                      </span>
                    )}
                  </div>

                  {machine.notes && (
                    <div className="sf-roll-info">
                      <span className="sf-roll-name" title={machine.notes}>
                        Nota: {machine.notes}
                      </span>
                    </div>
                  )}

                  <div className="sf-machine-telemetry-notice">
                    <span>Telemetría: Pendiente de integración hardware</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ===================================================================
          Selector Táctil de Centro de Trabajo (Estación)
          =================================================================== */}
      <nav className="sf-stations-bar" aria-label="Selector de estaciones de producción">
        {STATIONS.map((station) => {
          const Icon = station.icon;
          const isActive = selectedStation === station.code;
          const count = stationCounts[station.code] || 0;
          return (
            <button
              key={station.code}
              type="button"
              className={`sf-station-tab ${isActive ? 'active' : ''}`}
              onClick={() => handleStationClick(station.code)}
            >
              <Icon size={20} />
              <span>{station.name}</span>
              <span className="sf-station-badge">{count}</span>
            </button>
          );
        })}
      </nav>

      {/* ===================================================================
          Métricas de Producción del Turno (Derivadas de Datos Reales)
          =================================================================== */}
      <div className="sf-shift-metrics">
        <div className="sf-metric-card">
          <div className="sf-metric-icon green">
            <Play size={20} />
          </div>
          <div className="sf-metric-data">
            <span className="sf-metric-value">{shiftMetrics.running}</span>
            <span className="sf-metric-label">En Proceso</span>
          </div>
        </div>

        <div className="sf-metric-card">
          <div className="sf-metric-icon blue">
            <Clock size={20} />
          </div>
          <div className="sf-metric-data">
            <span className="sf-metric-value">{shiftMetrics.ready}</span>
            <span className="sf-metric-label">Listas p/ Iniciar</span>
          </div>
        </div>

        <div className="sf-metric-card">
          <div className="sf-metric-icon amber">
            <Pause size={20} />
          </div>
          <div className="sf-metric-data">
            <span className="sf-metric-value">{shiftMetrics.blocked}</span>
            <span className="sf-metric-label">Detenidas / Bloq.</span>
          </div>
        </div>

        <div className="sf-metric-card">
          <div className="sf-metric-icon purple">
            <CheckCircle2 size={20} />
          </div>
          <div className="sf-metric-data">
            <span className="sf-metric-value">{shiftMetrics.completed}</span>
            <span className="sf-metric-label">Terminadas</span>
          </div>
        </div>

        <div className="sf-metric-card">
          <div className="sf-metric-icon blue">
            <Layers size={20} />
          </div>
          <div className="sf-metric-data">
            <span className="sf-metric-value">{shiftMetrics.totalAreaM2} m²</span>
            <span className="sf-metric-label">Área Calculada</span>
          </div>
        </div>
      </div>

      {/* ===================================================================
          Barra de Búsqueda y Filtros de Estado
          =================================================================== */}
      <div className="sf-toolbar">
        <div className="sf-search-wrap">
          <Search size={18} className="sf-search-icon" />
          <input
            type="text"
            className="sf-search-input"
            placeholder="Buscar por cliente, N° orden (VEN-...) o material..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="sf-modal-close"
              style={{ position: 'absolute', right: 4, top: 4, width: 40, height: 40 }}
              onClick={() => setSearchQuery('')}
              aria-label="Limpiar búsqueda"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="sf-filter-pills">
          <button
            type="button"
            className={`sf-filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => handleStatusFilterClick('all')}
          >
            Activas ({stationCounts[selectedStation]})
          </button>
          <button
            type="button"
            className={`sf-filter-btn ${statusFilter === 'in_progress' ? 'active' : ''}`}
            onClick={() => handleStatusFilterClick('in_progress')}
          >
            <Play size={14} /> En Proceso ({shiftMetrics.running})
          </button>
          <button
            type="button"
            className={`sf-filter-btn ${statusFilter === 'ready' ? 'active' : ''}`}
            onClick={() => handleStatusFilterClick('ready')}
          >
            <Clock size={14} /> Listas ({shiftMetrics.ready})
          </button>
          <button
            type="button"
            className={`sf-filter-btn ${statusFilter === 'blocked' ? 'active' : ''}`}
            onClick={() => handleStatusFilterClick('blocked')}
          >
            <Pause size={14} /> Bloqueadas ({shiftMetrics.blocked})
          </button>
          <button
            type="button"
            className={`sf-filter-btn ${statusFilter === 'completed' ? 'active' : ''}`}
            onClick={() => handleStatusFilterClick('completed')}
          >
            <CheckCircle2 size={14} /> Terminadas ({shiftMetrics.completed})
          </button>
        </div>
      </div>

      {/* ===================================================================
          Rejilla de Tarjetas de Etapas de Producción (Grandes y Táctiles)
          =================================================================== */}
      <main className="sf-orders-grid">
        {loading ? (
          <div className="sf-empty-state">
            <RefreshCw size={36} className="sf-spin" style={{ margin: '0 auto 1rem' }} />
            <h3>Cargando etapas de producción desde Supabase…</h3>
          </div>
        ) : filteredSteps.length === 0 ? (
          <div className="sf-empty-state">
            <FileText size={48} style={{ color: 'var(--sf-text-subtle)', margin: '0 auto 1rem' }} />
            <h3>No hay etapas de producción en este filtro</h3>
            <p>
              No se encontraron trabajos activos para la estación seleccionada o el término de búsqueda ingresado.
            </p>
            <button
              type="button"
              className="sf-btn-tactile sf-btn-finish"
              style={{ display: 'inline-flex', margin: '0 auto' }}
              onClick={() => {
                handleStationClick('all');
                handleStatusFilterClick('all');
                setSearchQuery('');
              }}
            >
              Restablecer Filtros
            </button>
          </div>
        ) : (
          filteredSteps.map(({ step, job, area, areaCode, pendingChecksCount }) => {
            const isRunning = step.status === 'in_progress';
            const isPaused = step.status === 'blocked';
            const isCompleted = step.status === 'completed';
            const isReady = step.status === 'ready';
            const isHandoffPending = step.handoff_status === 'pending';

            const canActInThisArea = perms.canCoordinate || perms.canActInArea(areaCode);
            const isAssignedToMe = step.assigned_to === user?.id;

            // Medidas y especificaciones
            const wCm = Number(job.specifications?.width_cm);
            const hCm = Number(job.specifications?.height_cm);
            const qty = Number(job.specifications?.quantity) || 1;
            const hasDimensions = Number.isFinite(wCm) && wCm > 0 && Number.isFinite(hCm) && hCm > 0;
            const wM = hasDimensions ? wCm / 100 : 0;
            const hM = hasDimensions ? hCm / 100 : 0;
            const areaM2 = hasDimensions ? (wM * hM * qty).toFixed(2) : null;
            const materialStr = String(job.specifications?.material || 'Material en ficha');
            const finishStr = job.specifications?.finish ? String(job.specifications.finish) : null;

            // SLA y heurística operativa
            const targetDue = step.due_at || job.due_at;
            const isOverdue = isDateOverdue(targetDue, todayStr);
            const isDueToday = targetDue && dayKey(targetDue) === todayStr;
            const slaType = isOverdue ? 'overdue' : isDueToday ? 'urgent_today' : 'on_time';
            const slaText = isOverdue
              ? `🔴 Demorado (${stamp(targetDue)})`
              : isDueToday
              ? `🟡 Entrega Hoy (${stamp(targetDue)})`
              : targetDue
              ? `🟢 En tiempo (${stamp(targetDue)})`
              : '⚪ Plazo por definir';

            // Cronómetro calculado en vivo
            let elapsedDisplay = '00:00';
            let timerStatusText = 'LISTO PARA PRODUCIR';

            if (isRunning) {
              if (step.started_at) {
                const startMs = Date.parse(step.started_at);
                if (!Number.isNaN(startMs) && startMs > 0) {
                  const sec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
                  elapsedDisplay = formatElapsed(sec);
                  timerStatusText = 'EN PRODUCCIÓN VIVA';
                } else {
                  elapsedDisplay = '00:00';
                  timerStatusText = 'EN PRODUCCIÓN (Fecha inicio sin registrar)';
                }
              } else {
                elapsedDisplay = '00:00';
                timerStatusText = 'EN PRODUCCIÓN (Sin started_at)';
              }
            } else if (isPaused) {
              elapsedDisplay = '--:--';
              timerStatusText = step.review_hold
                ? 'DETENIDO: ESPERANDO REVISIÓN TÉCNICA'
                : `PAUSADO: ${step.notes || 'Detenido con motivo'}`;
            } else if (isCompleted) {
              if (step.started_at && step.completed_at) {
                const sMs = Date.parse(step.started_at);
                const cMs = Date.parse(step.completed_at);
                if (!Number.isNaN(sMs) && !Number.isNaN(cMs) && cMs >= sMs) {
                  elapsedDisplay = formatElapsed(Math.floor((cMs - sMs) / 1000));
                }
              }
              timerStatusText = `TERMINADA (${step.completed_at ? stamp(step.completed_at) : 'Hoy'})`;
            } else if (isReady) {
              elapsedDisplay = '00:00';
              timerStatusText = 'LISTA PARA TOMAR O INICIAR';
            } else {
              elapsedDisplay = '--:--';
              timerStatusText = 'EN ESPERA DE ETAPA PREVIA';
            }

            return (
              <article
                key={step.id}
                className={`sf-card ${isRunning ? 'running' : ''} ${isPaused ? 'paused' : ''} ${
                  isCompleted ? 'completed' : ''
                }`}
              >
                {/* Cabecera de la Tarjeta */}
                <header className="sf-card-header">
                  <div className="sf-card-identity">
                    <div className="sf-card-code-row">
                      <span className="sf-card-code">{job.sale_code || job.id.slice(0, 8)}</span>
                      <span className="sf-card-area-badge">
                        {area?.name || areaCode} · Etapa {step.step_order + 1}
                      </span>
                      {step.assigned_to && (
                        <span className="sf-card-assigned-pill">
                          👤 {isAssignedToMe ? 'Asignado a ti' : 'Asignado'}
                        </span>
                      )}
                    </div>
                    <span className="sf-card-client">{job.customer_name || 'Venta de Mostrador'}</span>
                    <span className="sf-card-title">{job.title}</span>
                    <span className="sf-card-step-name">
                      <strong>Paso:</strong> {step.title}
                    </span>
                  </div>

                  {/* Badge SLA */}
                  <div className={`sf-sla-badge ${slaType}`}>
                    {isOverdue && <AlertTriangle size={15} />}
                    {isDueToday && <AlertTriangle size={15} />}
                    {!isOverdue && !isDueToday && <CheckCircle2 size={15} />}
                    <span>{slaText}</span>
                  </div>
                </header>

                {/* Banner de Medidas Reales Legible a Distancia */}
                <div className="sf-measure-banner">
                  <div className="sf-measure-main">
                    <span className="sf-measure-label">Medidas de Producción</span>
                    {hasDimensions ? (
                      <span className="sf-measure-dimensions">
                        {wM.toFixed(2)} m × {hM.toFixed(2)} m
                      </span>
                    ) : (
                      <span className="sf-measure-dimensions sf-measure-text-auto">
                        Ver ficha técnica
                      </span>
                    )}
                  </div>

                  <div className="sf-measure-badges">
                    {areaM2 && (
                      <div className="sf-measure-chip">
                        <span className="sf-measure-chip-label">Área Total</span>
                        <span className="sf-measure-chip-val">{areaM2} m²</span>
                      </div>
                    )}
                    <div className="sf-measure-chip">
                      <span className="sf-measure-chip-label">Tiraje</span>
                      <span className="sf-measure-chip-val">{qty} un.</span>
                    </div>
                  </div>
                </div>

                {/* Material y Acabados Requeridos de la Orden */}
                <div className="sf-specs-box">
                  <div className="sf-material-badge">
                    <Layers size={16} />
                    <span>{materialStr}</span>
                  </div>

                  {finishStr && (
                    <div className="sf-finishes-list">
                      <span className="sf-finish-pill">
                        <CheckCircle2 size={13} />
                        {finishStr}
                      </span>
                    </div>
                  )}

                  {pendingChecksCount > 0 && (
                    <div className="sf-checks-warning-banner">
                      <AlertTriangle size={14} />
                      <span>{pendingChecksCount} control(es) de calidad requeridos pendientes</span>
                    </div>
                  )}
                </div>

                {/* Vista Previa de Preprensa y Acceso Rápido a Ficha */}
                <div className="sf-art-preview-strip">
                  <div className="sf-art-preview-diagram">
                    <div className="sf-art-canvas-box" title="Esquema técnico de preprensa">
                      <div className="sf-art-canvas-grommets" />
                      <span style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--sf-primary)' }}>
                        {hasDimensions ? `${wM.toFixed(1)}×${hM.toFixed(1)}m` : 'Ficha'}
                      </span>
                    </div>

                    <div className="sf-art-details">
                      <span className="sf-art-prepress-notes">
                        {job.artwork_reference
                          ? `Arte: ${job.artwork_reference}`
                          : 'Revisión técnica en proceso'}
                      </span>
                      <span className="sf-art-profile">
                        Estado arte: {job.artwork_review_status} · Revisión {job.artwork_revision}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="sf-btn-zoom"
                    onClick={() => setPrepressModalItem({ step, job })}
                    title="Ver cotas de preprensa y especificaciones técnicas"
                  >
                    <ZoomIn size={16} />
                    <span>Preprensa</span>
                  </button>

                  <button
                    type="button"
                    className="sf-btn-zoom sf-btn-detail-trigger"
                    onClick={() => openJobDetail(job.id, step.id, areaCode)}
                    title="Abrir la ficha completa de producción en panel lateral"
                  >
                    <FileText size={16} />
                    <span>Ficha 360°</span>
                  </button>
                </div>

                {/* Cronómetro en Vivo */}
                <div className="sf-timer-strip">
                  <div className="sf-timer-status">
                    {isRunning && <Play size={16} className="text-success" />}
                    {isPaused && <Pause size={16} className="text-warning" />}
                    {isCompleted && <CheckCircle2 size={16} className="text-primary" />}
                    {!isRunning && !isPaused && !isCompleted && <Clock size={16} />}

                    <span>{timerStatusText}</span>
                  </div>

                  <span className="sf-timer-digits">{elapsedDisplay}</span>
                </div>

                {/* Controles Táctiles de Acción (Botones Grandes) */}
                <div className="sf-actions-grid">
                  {/* Botón Recibir etapa (si el handoff está pendiente) */}
                  {isHandoffPending && (
                    <button
                      type="button"
                      className="sf-btn-tactile sf-btn-finish"
                      style={{ gridColumn: '1 / -1' }}
                      disabled={busy || !canActInThisArea}
                      onClick={() => void handleReceiveStep(step)}
                      title={
                        canActInThisArea
                          ? 'Recibir la etapa transferida a este centro de trabajo'
                          : 'No tienes autorización en esta área'
                      }
                    >
                      <Check size={20} />
                      <span>📥 Recibir Etapa en Taller</span>
                    </button>
                  )}

                  {/* Botón Iniciar / Tomar */}
                  {isReady && !step.assigned_to ? (
                    <>
                      <button
                        type="button"
                        className="sf-btn-tactile sf-btn-start"
                        disabled={busy || !canActInThisArea}
                        onClick={() => void handleStartStep(step)}
                        title={
                          canActInThisArea
                            ? 'Iniciar inmediatamente el trabajo'
                            : 'No tienes autorización en esta área'
                        }
                      >
                        <Play size={20} />
                        <span>▶ Iniciar Trabajo</span>
                      </button>

                      <button
                        type="button"
                        className="sf-btn-tactile sf-btn-take"
                        disabled={busy || !canActInThisArea}
                        onClick={() => void handleTakeStep(step)}
                        title="Tomar la etapa asignándola a tu usuario"
                      >
                        <UserRound size={18} />
                        <span>👤 Tomar Etapa</span>
                      </button>
                    </>
                  ) : isReady ? (
                    <button
                      type="button"
                      className="sf-btn-tactile sf-btn-start"
                      disabled={busy || !canActInThisArea}
                      onClick={() => void handleStartStep(step)}
                    >
                      <Play size={20} />
                      <span>▶ Iniciar Trabajo</span>
                    </button>
                  ) : null}

                  {/* Botón Reanudar (si está bloqueada sin hold técnico) */}
                  {isPaused && !step.review_hold && (
                    <button
                      type="button"
                      className="sf-btn-tactile sf-btn-start"
                      disabled={busy || !canActInThisArea}
                      onClick={() => void handleUnblockStep(step)}
                    >
                      <Play size={20} />
                      <span>▶ Reanudar Etapa</span>
                    </button>
                  )}

                  {/* Botón Pausar / Bloquear */}
                  <button
                    type="button"
                    className="sf-btn-tactile sf-btn-pause"
                    disabled={!isRunning || busy || !canActInThisArea}
                    onClick={() => {
                      setPauseModalStep(step);
                      setSelectedPauseReason(COMMON_PAUSE_REASONS[0]);
                      setPauseReasonCustom('');
                    }}
                    title="Pausar o detener la etapa indicando el motivo"
                  >
                    <Pause size={20} />
                    <span>⏸ Pausar</span>
                  </button>

                  {/* Botón Terminado */}
                  <button
                    type="button"
                    className="sf-btn-tactile sf-btn-finish"
                    disabled={!isRunning || isCompleted || busy || !canActInThisArea}
                    onClick={() => void handleCompleteStep(step, job, pendingChecksCount)}
                    title="Marcar etapa como terminada para habilitar la siguiente"
                  >
                    <CheckCircle2 size={20} />
                    <span>✔ Terminado</span>
                  </button>

                  {/* Botón Registrar Merma / Incidente */}
                  <button
                    type="button"
                    className="sf-btn-tactile sf-btn-scrap"
                    disabled={isCompleted || busy}
                    onClick={() => {
                      setScrapModalItem({ step, job });
                      setScrapReason(COMMON_SCRAP_CAUSES[0]);
                      setScrapNotes('');
                    }}
                    title="Reportar desperdicio o incidente técnico auditable"
                  >
                    <AlertTriangle size={20} />
                    <span>⚠ Registrar Merma</span>
                  </button>
                </div>
              </article>
            );
          })
        )}
      </main>

      {/* ===================================================================
          Modal Táctil de Registro de Merma / Incidente (Brecha de Esquema)
          =================================================================== */}
      {scrapModalItem && (
        <div
          className="sf-modal-overlay"
          onClick={() => setScrapModalItem(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="scrap-modal-title"
        >
          <div className="sf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sf-modal-header">
              <div className="sf-modal-title-group">
                <h2 id="scrap-modal-title" className="sf-modal-title">
                  <AlertTriangle size={24} style={{ color: '#ef4444' }} />
                  Reporte Auditable de Merma / Incidente
                </h2>
                <span className="sf-modal-subtitle">
                  {scrapModalItem.job.sale_code || scrapModalItem.job.id} · {scrapModalItem.step.title} (
                  {scrapModalItem.job.customer_name || 'Mostrador'})
                </span>
              </div>

              <button
                type="button"
                className="sf-modal-close"
                onClick={() => setScrapModalItem(null)}
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            </div>

            <ProductionMaterialPanel key={scrapModalItem.step.id} job={scrapModalItem.job} step={scrapModalItem.step} initialKind="scrap" onChanged={() => { emitProductionChanged(); }}/>
            <p>Si el incidente también requiere detener la etapa, registra la causa a continuación.</p>

            {/* Selector de Causa de la Merma */}
            <div>
              <label className="sf-form-label">Causa del Desperdicio o Incidente</label>
              <div className="sf-causes-grid">
                {COMMON_SCRAP_CAUSES.map((cause) => (
                  <div
                    key={cause}
                    className={`sf-cause-option ${scrapReason === cause ? 'selected' : ''}`}
                    onClick={() => setScrapReason(cause)}
                  >
                    <span style={{ width: 18, textAlign: 'center' }}>
                      {scrapReason === cause ? '✔' : '○'}
                    </span>
                    <span>{cause}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Detalle del Operador */}
            <div>
              <label className="sf-form-label">Detalle del Incidente (Obligatorio para auditoría)</label>
              <input
                type="text"
                className="sf-search-input"
                placeholder="Ej. Inyectores tapados a mitad de impresión; material descalibrado 1.5m..."
                value={scrapNotes}
                onChange={(e) => setScrapNotes(e.target.value)}
              />
            </div>

            {/* Opciones de Registro Real en Supabase */}
            <div className="sf-scrap-actions-container">
              {/* Opción 1: Bloquear la etapa activa con motivo de merma */}
              {['ready', 'in_progress'].includes(scrapModalItem.step.status) && (
                <button
                  type="button"
                  className="sf-btn-tactile sf-btn-scrap-block"
                  disabled={busy}
                  onClick={() => void handleScrapBlockStep()}
                >
                  <Pause size={18} />
                  <span>1. Reportar y Detener/Bloquear Etapa Activa</span>
                </button>
              )}

              {/* Opción 2: Registrar en bitácora de la ficha sin bloquear */}
              {(perms.canCoordinate || perms.canEditSales) && (
                <button
                  type="button"
                  className="sf-btn-tactile sf-btn-finish"
                  disabled={busy}
                  onClick={() => void handleScrapNoteJob()}
                >
                  <FileText size={18} />
                  <span>2. Anotar en Bitácora del Trabajo (Sin detener flujo)</span>
                </button>
              )}

              <button
                type="button"
                className="sf-btn-tactile sf-btn-outline"
                onClick={() => setScrapModalItem(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          Modal Táctil de Pausa / Bloqueo de Etapa
          =================================================================== */}
      {pauseModalStep && (
        <div
          className="sf-modal-overlay"
          onClick={() => setPauseModalStep(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-modal-title"
        >
          <div className="sf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sf-modal-header">
              <div className="sf-modal-title-group">
                <h2 id="pause-modal-title" className="sf-modal-title">
                  <Pause size={24} style={{ color: '#d97706' }} />
                  Pausar / Detener Etapa
                </h2>
                <span className="sf-modal-subtitle">
                  Etapa: {pauseModalStep.title} · Explica el motivo para el equipo
                </span>
              </div>

              <button
                type="button"
                className="sf-modal-close"
                onClick={() => setPauseModalStep(null)}
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className="sf-pause-options">
              {COMMON_PAUSE_REASONS.map((reason) => (
                <div
                  key={reason}
                  className={`sf-pause-option ${selectedPauseReason === reason ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedPauseReason(reason);
                    setPauseReasonCustom('');
                  }}
                >
                  <span>{selectedPauseReason === reason ? '✔' : '○'}</span>
                  <span>{reason}</span>
                </div>
              ))}
            </div>

            <div>
              <label className="sf-form-label">O escribe un motivo específico (mínimo 3 caracteres)</label>
              <input
                type="text"
                className="sf-search-input"
                placeholder="Escribe el motivo de la detención..."
                value={pauseReasonCustom}
                onChange={(e) => setPauseReasonCustom(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <button
                type="button"
                className="sf-btn-tactile sf-btn-outline"
                onClick={() => setPauseModalStep(null)}
              >
                Volver
              </button>

              <button
                type="button"
                className="sf-btn-tactile sf-btn-pause"
                disabled={busy || (pauseReasonCustom.trim() || selectedPauseReason).length < 3}
                onClick={() => void handleConfirmPause()}
              >
                <Pause size={20} />
                <span>Confirmar Pausa</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          Modal de Inspección de Preprensa (Zoom y Cotas)
          =================================================================== */}
      {prepressModalItem && (
        <div
          className="sf-modal-overlay"
          onClick={() => setPrepressModalItem(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="prepress-modal-title"
        >
          <div className="sf-modal large" onClick={(e) => e.stopPropagation()}>
            <div className="sf-modal-header">
              <div className="sf-modal-title-group">
                <h2 id="prepress-modal-title" className="sf-modal-title">
                  <ZoomIn size={24} style={{ color: 'var(--sf-primary)' }} />
                  Inspección de Preprensa & Cotas Técnicas
                </h2>
                <span className="sf-modal-subtitle">
                  {prepressModalItem.job.sale_code || prepressModalItem.job.id} ·{' '}
                  {prepressModalItem.job.title}
                </span>
              </div>

              <button
                type="button"
                className="sf-modal-close"
                onClick={() => setPrepressModalItem(null)}
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className="sf-prepress-view">
              {/* Blueprint Técnico */}
              <div className="sf-prepress-blueprint">
                <span className="sf-blueprint-dim-top">
                  ↔ ANCHO: {Number(prepressModalItem.job.specifications?.width_cm || 0)} cm (
                  {(Number(prepressModalItem.job.specifications?.width_cm || 0) / 100).toFixed(2)} m)
                </span>
                <span className="sf-blueprint-dim-left">
                  ↕ ALTO: {Number(prepressModalItem.job.specifications?.height_cm || 0)} cm (
                  {(Number(prepressModalItem.job.specifications?.height_cm || 0) / 100).toFixed(2)} m)
                </span>

                <div className="sf-blueprint-art">
                  <div className="sf-blueprint-bleed-mark" />
                  <span>
                    Tiraje: {Number(prepressModalItem.job.specifications?.quantity || 1)} un.
                  </span>
                </div>
              </div>

              {/* Especificaciones Reales */}
              <div className="sf-prepress-meta-grid">
                <div className="sf-prepress-meta-card">
                  <span className="sf-prepress-meta-title">Material</span>
                  <span className="sf-prepress-meta-val">
                    {String(prepressModalItem.job.specifications?.material || 'Por definir')}
                  </span>
                </div>

                <div className="sf-prepress-meta-card">
                  <span className="sf-prepress-meta-title">Acabado / Confección</span>
                  <span className="sf-prepress-meta-val">
                    {String(prepressModalItem.job.specifications?.finish || 'Estándar')}
                  </span>
                </div>

                <div className="sf-prepress-meta-card">
                  <span className="sf-prepress-meta-title">Referencia de Arte</span>
                  <span className="sf-prepress-meta-val">
                    {prepressModalItem.job.artwork_reference || 'Sin archivo asignado'}
                  </span>
                </div>

                <div className="sf-prepress-meta-card">
                  <span className="sf-prepress-meta-title">Estado del Arte</span>
                  <span className="sf-prepress-meta-val">
                    {prepressModalItem.job.artwork_review_status} (Rev.{' '}
                    {prepressModalItem.job.artwork_revision})
                  </span>
                </div>
              </div>

              <div className="sf-prepress-footer-actions">
                <button
                  type="button"
                  className="sf-btn-tactile sf-btn-outline"
                  onClick={() => setPrepressModalItem(null)}
                >
                  Cerrar Inspección
                </button>

                <button
                  type="button"
                  className="sf-btn-tactile sf-btn-finish"
                  onClick={() => {
                    const jId = prepressModalItem.job.id;
                    const sId = prepressModalItem.step.id;
                    setPrepressModalItem(null);
                    openJobDetail(jId, sId);
                  }}
                >
                  <FileText size={18} />
                  <span>Abrir Ficha Técnica Completa</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          Modal de Cambio de Estado Operativo de Maquinaria Real
          =================================================================== */}
      {machineStatusModalMachine && (
        <div
          className="sf-modal-overlay"
          onClick={() => setMachineStatusModalMachine(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="machine-status-modal-title"
        >
          <div className="sf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sf-modal-header">
              <div className="sf-modal-title-group">
                <h2 id="machine-status-modal-title" className="sf-modal-title">
                  <Printer size={24} style={{ color: 'var(--sf-primary)' }} />
                  Estado de {machineStatusModalMachine.name}
                </h2>
                <span className="sf-modal-subtitle">
                  Código: {machineStatusModalMachine.asset_code} · Seleccione el estado operativo en planta
                </span>
              </div>

              <button
                type="button"
                className="sf-modal-close"
                onClick={() => setMachineStatusModalMachine(null)}
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {CONFIRMED_EQUIPMENT_STATUSES.map((statusOption) => {
                const isCurrent = machineStatusModalMachine.status === statusOption;
                const statusColor =
                  statusOption === 'Operativo'
                    ? 'var(--sf-success-soft)'
                    : statusOption === 'En mantenimiento'
                    ? '#ffedd5'
                    : statusOption === 'Fuera de servicio'
                    ? 'var(--sf-danger-soft)'
                    : 'var(--sf-warning-soft)';

                const textColor =
                  statusOption === 'Operativo'
                    ? 'var(--sf-success-text)'
                    : statusOption === 'En mantenimiento'
                    ? '#c2410c'
                    : statusOption === 'Fuera de servicio'
                    ? 'var(--sf-danger-text)'
                    : 'var(--sf-warning-text)';

                return (
                  <button
                    key={statusOption}
                    type="button"
                    className="sf-btn-tactile"
                    style={{
                      backgroundColor: statusColor,
                      color: textColor,
                      border: isCurrent
                        ? '2px solid currentColor'
                        : '1.5px solid transparent',
                    }}
                    onClick={() =>
                      void handleUpdateMachineStatus(machineStatusModalMachine, statusOption)
                    }
                  >
                    <span>
                      {statusOption === 'Operativo' && '🟢 '}
                      {statusOption === 'Por verificar' && '🟡 '}
                      {statusOption === 'En mantenimiento' && '🟠 '}
                      {statusOption === 'Fuera de servicio' && '🔴 '}
                      {statusOption}
                      {isCurrent ? ' (Actual)' : ''}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="sf-btn-tactile sf-btn-outline"
              style={{ marginTop: '0.5rem' }}
              onClick={() => setMachineStatusModalMachine(null)}
            >
              Cerrar sin cambiar
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================
          Ficha Técnica Unificada (ProductionJobDetailSheet)
          =================================================================== */}
      <ProductionJobDetailSheet
        open={detailOpen}
        jobId={detailJobId}
        stepId={detailStepId}
        contextAreaCode={detailAreaCode}
        onClose={() => setDetailOpen(false)}
        onChanged={reloadData}
      />

      {/* ===================================================================
          Toast Feedback Táctil
          =================================================================== */}
      {toastMessage && (
        <div className="sf-toast" role="status" aria-live="polite">
          <Info size={18} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default ShopFloorKiosk;
