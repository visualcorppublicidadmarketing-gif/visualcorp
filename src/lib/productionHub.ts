/**
 * Visual Corp Suite — Production Hub Core Module (Fase 1.1)
 *
 * Módulo centralizado y tipado para coordinación, áreas de producción,
 * estados, fechas en zona horaria America/Guayaquil, heurística operativa,
 * permisos y sincronización de eventos de producción.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ClipboardList,
  PenTool,
  Printer,
  Shirt,
  ScanLine,
  Hammer,
} from 'lucide-react';
import { supabase } from './supabaseClient';

/* ==========================================================================
   1. TIPOS BASE Y ENUMS CONFIRMADOS EN BD Y CÓDIGO
   ========================================================================== */

export type AreaCode = 'ASE' | 'DIS' | 'IMP' | 'SUB' | 'LAS' | 'TAL';

export type AreaSlug =
  | 'asesoria'
  | 'diseno'
  | 'impresion'
  | 'sublimacion'
  | 'laser'
  | 'taller';

export type StepStatus =
  | 'waiting'
  | 'ready'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'cancelled';

export type JobStatus = 'open' | 'needs_review' | 'completed' | 'cancelled';

export type ArtworkReviewStatus =
  | 'not_required'
  | 'awaiting_art'
  | 'awaiting_review'
  | 'changes_requested'
  | 'approved';

export type FulfillmentStatus =
  | 'not_ready'
  | 'quality_check'
  | 'ready_for_delivery'
  | 'scheduled'
  | 'delivered'
  | 'installed';

export type ProductionQueueViewMode =
  | 'summary'
  | 'cards'
  | 'list'
  | 'table'
  | 'kanban'
  | 'month'
  | 'week';

export type ProductionQueueFilter =
  | 'all'
  | 'active'
  | 'mine'
  | 'blocked'
  | 'overdue'
  | 'review'
  | 'done';

/* ==========================================================================
   2. INTERFACES DE ENTIDADES REALES DE SUPABASE
   ========================================================================== */

export interface ProductionAreaRow {
  id: string;
  organization_id?: string;
  code: AreaCode | string;
  name: string;
  active?: boolean;
  created_at?: string;
}

export interface ProductionJob {
  id: string;
  organization_id: string;
  branch_id: string;
  sale_id: string;
  sale_line_id: string;
  advisor_id: string | null;
  catalog_product_id?: string | null;
  workflow_code: string;
  sale_code: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  title: string;
  specifications: Record<string, unknown> | null;
  spec_version: number;
  review_from_version: number | null;
  deposit_required?: number;
  approval_required: boolean;
  artwork_review_status: ArtworkReviewStatus;
  artwork_revision: number;
  artwork_reference: string;
  artwork_submitted_by?: string | null;
  artwork_submitted_at: string | null;
  artwork_reviewed_by?: string | null;
  artwork_reviewed_at: string | null;
  status: JobStatus | string;
  due_at: string | null;
  fulfillment_status?: FulfillmentStatus | string;
  fulfillment_due_at?: string | null;
  fulfillment_note?: string;
  fulfillment_by?: string | null;
  fulfillment_at?: string | null;
  quality_checked_by?: string | null;
  quality_checked_at?: string | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Relaciones y agregaciones opcionales
  branch?: { id: string; name: string; code?: string } | null;
  catalog_product?: { id: string; name: string; sku?: string } | null;
  balance_due?: boolean;
  material_blocked?: boolean;
  advisor_name?: string | null;
  can_open_detail?: boolean;
  lot_summary?: {
    unit: string;
    total: number;
    in_production: number;
    quality_check: number;
    ready_for_delivery: number;
    scheduled: number;
    delivered: number;
    installed: number;
  } | null;
}

export interface ProductionStep {
  id: string;
  organization_id?: string;
  job_id: string;
  step_key: string;
  step_order: number;
  area_id: string;
  title: string;
  status: StepStatus;
  review_hold?: boolean;
  assigned_to: string | null;
  assigned_name?: string | null;
  due_at: string | null;
  notes: string | null;
  estimated_minutes?: number;
  requirements?: { before_start?: string[]; before_complete?: string[] };
  readiness_reasons?: Array<{ code: string; message: string }> | null;
  handoff_status?: 'not_required' | 'pending' | 'accepted' | string | null;
  received_by?: string | null;
  received_at?: string | null;
  due_at_is_manual?: boolean;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  // Campos derivados y joins
  area?: ProductionAreaRow | { code: string; name: string } | null;
  assigned?: boolean;
  area_code?: string;
  area_name?: string;
}

export interface ProductionStepCheck {
  id: string;
  organization_id?: string;
  job_id?: string;
  step_id: string;
  check_key: string;
  title: string;
  required: boolean;
  requires_evidence: boolean;
  completed_at: string | null;
  completed_by?: string | null;
  evidence_url: string;
  note: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProductionLot {
  id: string;
  organization_id?: string;
  job_id?: string;
  parent_lot_id: string | null;
  label: string;
  quantity: number;
  unit: string;
  status: string;
  due_at: string | null;
  notes: string;
  produced_by?: string | null;
  produced_at: string | null;
  quality_by?: string | null;
  quality_at: string | null;
  delivered_by?: string | null;
  delivered_at: string | null;
  installed_by?: string | null;
  installed_at: string | null;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProductionJobEvent {
  id: number;
  organization_id?: string;
  job_id: string;
  step_id: string | null;
  event_type: string;
  details: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

export interface ProductionAssignee {
  user_id: string;
  display_name: string;
  email?: string;
  role?: string;
}

export interface LegacyProductionOrder {
  id: string;
  order_code: string;
  title: string;
  next_step: string | null;
  priority: string;
  due_at: string | null;
  status: string;
  assigned?: boolean;
  assigned_to?: string | null;
  assigned_name?: string | null;
  area_id?: string | null;
  area_code?: string | null;
  area_name?: string | null;
  can_open_detail?: boolean;
}

export interface CoordinationListItem {
  source: 'job' | 'legacy';
  job?: ProductionJob;
  steps?: ProductionStep[];
  currentStep?: ProductionStep | null;
  order?: LegacyProductionOrder;
}

/* ==========================================================================
   3. CONFIGURACIÓN DECLARATIVA Y MAPAS DE ESTADOS
   ========================================================================== */

export interface ProductionAreaConfigItem {
  code: AreaCode;
  slug: AreaSlug;
  areaName: string;
  title: string;
  subtitle: string;
  roleLabel: string;
  profiles: string[];
  filters: string[];
  icon: LucideIcon;
  intro: string;
}

export const PRODUCTION_AREA_CONFIG: Record<AreaSlug, ProductionAreaConfigItem> = {
  asesoria: {
    code: 'ASE',
    slug: 'asesoria',
    areaName: 'Asesoría',
    title: 'Asesoría',
    subtitle: 'Sigue cada trabajo vendido, sus cambios y el avance de producción.',
    roleLabel: 'Asesoría y Ventas',
    profiles: ['asesoras', 'coordinador_ventas'],
    filters: ['all', 'mine', 'unassigned', 'today', 'overdue', 'blocked'],
    icon: ClipboardList,
    intro: 'Sigue cada trabajo vendido, sus cambios y el avance de producción.',
  },
  diseno: {
    code: 'DIS',
    slug: 'diseno',
    areaName: 'Diseño',
    title: 'Diseño',
    subtitle: 'Prepara archivos y entrega diseños listos a la siguiente área.',
    roleLabel: 'Diseñador Gráfico',
    profiles: ['disenador_grafico'],
    filters: ['all', 'mine', 'unassigned', 'today', 'overdue', 'blocked'],
    icon: PenTool,
    intro: 'Prepara archivos y entrega diseños listos a la siguiente área.',
  },
  impresion: {
    code: 'IMP',
    slug: 'impresion',
    areaName: 'Impresión',
    title: 'Impresión',
    subtitle: 'Consulta artes listos, medidas y fechas antes de producir.',
    roleLabel: 'Operador de Impresión',
    profiles: ['impresor'],
    filters: ['all', 'mine', 'unassigned', 'today', 'overdue', 'blocked'],
    icon: Printer,
    intro: 'Consulta artes listos, medidas y fechas antes de producir.',
  },
  sublimacion: {
    code: 'SUB',
    slug: 'sublimacion',
    areaName: 'Sublimación',
    title: 'Sublimación',
    subtitle: 'Organiza los trabajos personalizados y su entrega.',
    roleLabel: 'Operador de Sublimación',
    profiles: ['sublimacion'],
    filters: ['all', 'mine', 'unassigned', 'today', 'overdue', 'blocked'],
    icon: Shirt,
    intro: 'Organiza los trabajos personalizados y su entrega.',
  },
  laser: {
    code: 'LAS',
    slug: 'laser',
    areaName: 'Corte láser',
    title: 'Corte láser',
    subtitle: 'Revisa material, piezas y referencias de corte.',
    roleLabel: 'Operador de Corte Láser',
    profiles: ['personal_taller'],
    filters: ['all', 'mine', 'unassigned', 'today', 'overdue', 'blocked'],
    icon: ScanLine,
    intro: 'Revisa material, piezas y referencias de corte.',
  },
  taller: {
    code: 'TAL',
    slug: 'taller',
    areaName: 'Taller',
    title: 'Taller',
    subtitle: 'Coordina visitas, armado e instalación según cada orden.',
    roleLabel: 'Personal de Taller',
    profiles: ['personal_taller'],
    filters: ['all', 'mine', 'unassigned', 'today', 'overdue', 'blocked'],
    icon: Hammer,
    intro: 'Coordina visitas, armado e instalación según cada orden.',
  },
};

export const PRODUCTION_AREA_LIST: ProductionAreaConfigItem[] = Object.values(
  PRODUCTION_AREA_CONFIG
);

export const AREA_CODE_TO_SLUG: Record<AreaCode, AreaSlug> = {
  ASE: 'asesoria',
  DIS: 'diseno',
  IMP: 'impresion',
  SUB: 'sublimacion',
  LAS: 'laser',
  TAL: 'taller',
};

export const AREA_SLUG_TO_CODE: Record<AreaSlug, AreaCode> = {
  asesoria: 'ASE',
  diseno: 'DIS',
  impresion: 'IMP',
  sublimacion: 'SUB',
  laser: 'LAS',
  taller: 'TAL',
};

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  waiting: 'Espera etapa anterior',
  ready: 'Lista para tomar',
  in_progress: 'En proceso',
  blocked: 'Bloqueada',
  completed: 'Terminada',
  cancelled: 'Cancelada',
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  open: 'En curso',
  needs_review: 'Revisión técnica',
  completed: 'Terminado',
  cancelled: 'Cancelado',
};

export const FULFILLMENT_STATUS_LABELS: Record<FulfillmentStatus, string> = {
  not_ready: 'No preparado',
  quality_check: 'Control de calidad',
  ready_for_delivery: 'Calidad aprobada',
  scheduled: 'Entrega programada',
  delivered: 'Entregado',
  installed: 'Instalado',
};

export const ARTWORK_STATUS_LABELS: Record<ArtworkReviewStatus, string> = {
  not_required: 'Sin revisión',
  awaiting_art: 'Diseño pendiente',
  awaiting_review: 'Por aprobar',
  changes_requested: 'Correcciones solicitadas',
  approved: 'Aprobado',
};

export interface KanbanStatusColumn {
  key: StepStatus;
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'critical' | 'muted';
  description: string;
}

export const KANBAN_STATUS_COLUMNS: KanbanStatusColumn[] = [
  {
    key: 'ready',
    label: 'Lista para iniciar',
    tone: 'info',
    description: 'Etapa habilitada y lista para ser tomada o iniciada por el área.',
  },
  {
    key: 'in_progress',
    label: 'En proceso',
    tone: 'info',
    description: 'Trabajo en curso asignado a un responsable.',
  },
  {
    key: 'blocked',
    label: 'Bloqueada',
    tone: 'critical',
    description: 'Detenida por observaciones, falta de insumos o dependencia técnica.',
  },
  {
    key: 'waiting',
    label: 'En espera',
    tone: 'neutral',
    description: 'Esperando que concluyan las etapas anteriores del flujo.',
  },
  {
    key: 'completed',
    label: 'Terminada',
    tone: 'success',
    description: 'Paso de producción completado y verificado.',
  },
  {
    key: 'cancelled',
    label: 'Cancelada',
    tone: 'muted',
    description: 'Etapa descartada o cancelada por cambio de ruta.',
  },
];

export const SPEC_LABELS: Record<string, string> = {
  description: 'Descripción',
  notes: 'Indicaciones',
  width_cm: 'Ancho',
  height_cm: 'Alto',
  quantity: 'Cantidad',
  material: 'Material',
  finish: 'Acabado',
  color: 'Color',
  installation_address: 'Lugar de instalación',
  installation_required: 'Instalación',
  measurement_required: 'Visita para medir',
  reference: 'Referencia',
  artwork_status: 'Archivo al recibir el pedido',
  approval_required: 'Revisión de arte',
  site_visit_notes: 'Observaciones de visita',
};

export const WORKFLOW_CHOICES = [
  { code: 'none', label: 'Entrega directa' },
  { code: 'print', label: 'Diseño → Impresión' },
  { code: 'laser', label: 'Diseño → Corte láser' },
  { code: 'sign', label: 'Diseño → Impresión → Taller' },
  { code: 'sign_measure', label: 'Visita de medidas → Diseño → Impresión → Taller' },
  { code: 'neon', label: 'Diseño → Corte láser → Taller' },
  { code: 'sublimation', label: 'Diseño → Sublimación' },
] as const;

export const HANDOFF_FIELDS: Record<AreaCode, Array<[string, string]>> = {
  ASE: [
    ['description', 'Descripción'],
    ['quantity', 'Cantidad física'],
    ['width_cm', 'Ancho'],
    ['height_cm', 'Alto'],
    ['material', 'Material'],
    ['finish', 'Acabado'],
    ['installation_address', 'Lugar de instalación'],
    ['notes', 'Indicaciones'],
  ],
  DIS: [
    ['description', 'Descripción'],
    ['width_cm', 'Ancho'],
    ['height_cm', 'Alto'],
    ['material', 'Material'],
    ['color', 'Color'],
    ['finish', 'Acabado'],
    ['notes', 'Indicaciones'],
  ],
  IMP: [
    ['width_cm', 'Ancho'],
    ['height_cm', 'Alto'],
    ['material', 'Material'],
    ['color', 'Color'],
    ['finish', 'Acabado'],
    ['installation_address', 'Lugar de instalación'],
    ['notes', 'Indicaciones'],
  ],
  SUB: [
    ['quantity', 'Cantidad física'],
    ['width_cm', 'Ancho'],
    ['height_cm', 'Alto'],
    ['material', 'Material'],
    ['color', 'Color'],
    ['notes', 'Indicaciones'],
  ],
  LAS: [
    ['quantity', 'Cantidad física'],
    ['width_cm', 'Ancho'],
    ['height_cm', 'Alto'],
    ['material', 'Material'],
    ['finish', 'Acabado'],
    ['notes', 'Indicaciones'],
  ],
  TAL: [
    ['width_cm', 'Ancho verificado'],
    ['height_cm', 'Alto verificado'],
    ['material', 'Material'],
    ['finish', 'Acabado o montaje'],
    ['installation_address', 'Lugar de instalación'],
    ['site_visit_notes', 'Observaciones de visita'],
  ],
};

export const EVENT_TITLE_LABELS: Record<string, string> = {
  job_created: 'Trabajo creado',
  workflow_selected: 'Ruta definida',
  step_take: 'Tarea tomada',
  step_ready: 'Etapa lista para el área',
  step_received: 'Etapa recibida',
  rework_requested: 'Retrabajo solicitado',
  quality_check_ready: 'Control de calidad pendiente',
  step_coordinated: 'Responsable o fecha actualizados',
  step_start: 'Trabajo iniciado',
  step_complete: 'Etapa terminada',
  step_block: 'Trabajo bloqueado',
  step_unblock: 'Trabajo reanudado',
  specifications_updated: 'Indicaciones actualizadas',
  note_added: 'Nota añadida',
  specification_review_accepted: 'Cambio técnico aceptado',
  specification_review_changes_requested: 'Corrección técnica solicitada',
  artwork_submitted: 'Arte entregado para revisar',
  artwork_approved: 'Arte aprobado',
  artwork_changes_requested: 'Correcciones solicitadas',
  quantity_tracking_enabled: 'Control de lotes activado',
  lot_transition: 'Movimiento de lote',
  fulfillment_direct_ready: 'Entrega directa preparada',
  fulfillment_status_updated: 'Entrega actualizada',
};

/* ==========================================================================
   4. HELPERS DE FECHAS (AMERICA/GUAYAQUIL), ETAPAS Y PRIORIDAD HEURÍSTICA
   ========================================================================== */

export const PRODUCTION_TIMEZONE = 'America/Guayaquil';

export const safeDate = (value: string | number | Date | null | undefined): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const dayKey = (value: string | number | Date | null | undefined): string => {
  const date = safeDate(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PRODUCTION_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const todayKey = (): string => dayKey(new Date());

export const stamp = (value: string | number | Date | null | undefined): string => {
  const date = safeDate(value);
  if (!date) return 'Por definir';
  return date.toLocaleString('es-EC', {
    timeZone: PRODUCTION_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

export const localDateTime = (value: string | number | Date | null | undefined): string => {
  const date = safeDate(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PRODUCTION_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};

export const isStepOpen = (status: StepStatus | string): boolean => {
  return !['completed', 'cancelled'].includes(status);
};

export const isDateOverdue = (
  dueAt: string | number | Date | null | undefined,
  compareDayKey: string = todayKey()
): boolean => {
  if (!dueAt) return false;
  const key = dayKey(dueAt);
  return Boolean(key && key < compareDayKey);
};

export function currentStage<T extends { status: StepStatus | string }>(steps: T[]): T | null {
  return (
    steps.find((step) => ['in_progress', 'blocked', 'ready'].includes(step.status)) ||
    steps.find((step) => step.status === 'waiting') ||
    steps.at(-1) ||
    null
  );
}

/**
 * Calcula el puntaje y el motivo de la prioridad operativa para una etapa o ítem de producción.
 *
 * @note ATENCIÓN: Esta puntuación es una heurística estrictamente operativa de ordenamiento interno
 * para las colas de taller / áreas técnicas y NO representa valor comercial, rentabilidad,
 * ni prioridad contractual ante el cliente.
 */
export function priorityDetails(
  target: {
    status?: StepStatus | string;
    due_at?: string | null;
    estimated_minutes?: number;
    assigned_to?: string | null;
    step?: {
      status: StepStatus | string;
      due_at?: string | null;
      estimated_minutes?: number;
      assigned_to?: string | null;
    } | null;
    currentStep?: {
      status: StepStatus | string;
      due_at?: string | null;
      estimated_minutes?: number;
      assigned_to?: string | null;
    } | null;
    job?: { due_at?: string | null };
  },
  now = Date.now()
): { score: number; reason: string } {
  const step =
    target.step ||
    target.currentStep ||
    (target.status
      ? (target as {
          status: StepStatus | string;
          due_at?: string | null;
          estimated_minutes?: number;
          assigned_to?: string | null;
        })
      : null);

  if (!step || !isStepOpen(step.status)) {
    return { score: 0, reason: 'Sin acción pendiente' };
  }

  const statusScores: Record<string, number> = {
    blocked: 64,
    in_progress: 52,
    ready: 42,
    waiting: 8,
  };
  let score = statusScores[step.status] || 0;
  let reason =
    step.status === 'blocked'
      ? 'Bloqueo requiere coordinación'
      : step.status === 'ready'
      ? 'Lista para recibir o iniciar'
      : step.status === 'in_progress'
      ? 'Trabajo en curso'
      : 'Espera una dependencia';

  const rawDue = step.due_at || target.job?.due_at;
  const due = safeDate(rawDue)?.getTime();
  if (Number.isFinite(due)) {
    const slack = due! - now;
    const estimate = Math.max(1, step.estimated_minutes || 60) * 60_000;
    if (slack < 0) {
      score += Math.min(34, 18 + Math.floor(Math.abs(slack) / 86_400_000) * 4);
      reason = 'Plazo vencido';
    } else if (slack <= estimate) {
      score += 27;
      reason = 'Plazo menor que el tiempo estimado';
    } else if (slack <= 86_400_000) {
      score += 20;
      reason = 'Vence en menos de 24 horas';
    } else if (slack <= 259_200_000) {
      score += 12;
      reason = 'Vence en menos de 3 días';
    }
  }

  if (step.status === 'ready' && !step.assigned_to) {
    score += 5;
  }

  return { score: Math.min(100, score), reason };
}

/* ==========================================================================
   5. PERMISOS CENTRALIZADOS (RESOLVE PRODUCTION PERMISSIONS)
   ========================================================================== */

export interface ProductionAuthContextInput {
  roles?: string[] | null;
  profiles?: Array<{ key: string } | string> | null;
  hasPermission: (module: string, action: string) => boolean;
}

export interface ProductionPermissions {
  canViewWorkshop: boolean;
  canViewSales: boolean;
  canEditWorkshop: boolean;
  canEditSales: boolean;
  canCoordinate: boolean;
  canManageFulfillment: boolean;
  isOnlySalesViewer: boolean;
  canActInArea: (areaCode: AreaCode | string) => boolean;
  canOpenDetail: boolean;
  roleLabels: string[];
}

export function resolveProductionPermissions(
  auth: ProductionAuthContextInput
): ProductionPermissions {
  const hasPermission = auth.hasPermission;

  const canViewWorkshop = hasPermission('workshop', 'view');
  const canEditWorkshop = hasPermission('workshop', 'edit');
  const canViewSales = hasPermission('sales', 'view');
  const canEditSales = hasPermission('sales', 'edit');

  const roles = auth.roles || [];
  const profiles = auth.profiles || [];
  const profileKeys = new Set<string>(
    profiles.map((profile) => (typeof profile === 'string' ? profile : profile?.key)).filter(Boolean)
  );
  const isOwnerOrAdmin = roles.some((role) => role === 'owner' || role === 'admin');
  const coordinatorProfiles = ['admin', 'gerencia', 'coordinador_taller', 'encargado_local'];
  const canCoordinate = canEditWorkshop &&
    (isOwnerOrAdmin || coordinatorProfiles.some((key) => profileKeys.has(key)));
  const canManageFulfillment = canCoordinate || canEditSales;
  const isOnlySalesViewer = canViewSales && !canViewWorkshop;
  const canActInArea = (areaCode: AreaCode | string) => {
    if (!canEditWorkshop) return areaCode === 'ASE' && canEditSales;
    if (isOwnerOrAdmin || coordinatorProfiles.some((key) => profileKeys.has(key))) return true;
    const areaConfig = PRODUCTION_AREA_CONFIG[AREA_CODE_TO_SLUG[areaCode as AreaCode]];
    return areaCode === 'ASE'
      ? canEditSales || (areaConfig?.profiles.some((key) => profileKeys.has(key)) ?? false)
      : (areaConfig?.profiles.some((key) => profileKeys.has(key)) ?? false);
  };
  const canOpenDetail = canViewWorkshop || canViewSales;
  const roleLabels = [canCoordinate ? 'Coordinación' : '', canViewWorkshop ? 'Producción' : '', canViewSales ? 'Ventas' : ''].filter(Boolean);

  return {
    canViewWorkshop,
    canViewSales,
    canEditWorkshop,
    canEditSales,
    canCoordinate,
    canManageFulfillment,
    isOnlySalesViewer,
    canActInArea,
    canOpenDetail,
    roleLabels,
  };
}

/* ==========================================================================
   6. PREFERENCIAS UI EN LOCALSTORAGE (EXCLUSIVAMENTE UI, NUNCA DATOS CORE)
   ========================================================================== */

export interface GlobalProductionUiPrefs {
  coordinationScope?: string;
  calendarDefaultTab?: 'calendar' | 'map';
  showCompleted?: boolean;
}

export interface KioskUiPrefs {
  stationArea?: AreaSlug | string;
  statusFilter?: string;
}

const VALID_VIEW_MODES = new Set<ProductionQueueViewMode>([
  'summary',
  'cards',
  'list',
  'table',
  'kanban',
  'month',
  'week',
]);

export function getProductionViewMode(
  scope: string,
  defaultMode: ProductionQueueViewMode = 'cards'
): ProductionQueueViewMode {
  if (typeof window === 'undefined') return defaultMode;
  try {
    const raw = window.localStorage.getItem(`visualcorp:production-view:${scope}`);
    if (!raw) return defaultMode;
    if (VALID_VIEW_MODES.has(raw as ProductionQueueViewMode)) {
      return raw as ProductionQueueViewMode;
    }
  } catch {
    // Modo privado o SSR sin acceso a almacenamiento
  }
  return defaultMode;
}

export function setProductionViewMode(scope: string, mode: ProductionQueueViewMode): void {
  if (typeof window === 'undefined') return;
  try {
    if (VALID_VIEW_MODES.has(mode)) {
      window.localStorage.setItem(`visualcorp:production-view:${scope}`, mode);
    }
  } catch {
    // Almacenamiento restringido
  }
}

export function getGlobalProductionUiPrefs(): GlobalProductionUiPrefs {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem('visualcorp:prod:prefs:global:v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as GlobalProductionUiPrefs;
      }
    }
  } catch {
    // Parse / storage error safe fallback
  }
  return {};
}

export function setGlobalProductionUiPrefs(prefs: Partial<GlobalProductionUiPrefs>): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getGlobalProductionUiPrefs();
    const updated = { ...current, ...prefs };
    window.localStorage.setItem('visualcorp:prod:prefs:global:v1', JSON.stringify(updated));
  } catch {
    // Storage fallback
  }
}

export function getKioskUiPrefs(): KioskUiPrefs {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem('visualcorp:kiosk:ui-prefs:v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as KioskUiPrefs;
      }
    }
  } catch {
    // Parse / storage error safe fallback
  }
  return {};
}

export function setKioskUiPrefs(prefs: Partial<KioskUiPrefs>): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getKioskUiPrefs();
    const updated = { ...current, ...prefs };
    window.localStorage.setItem('visualcorp:kiosk:ui-prefs:v1', JSON.stringify(updated));
  } catch {
    // Storage fallback
  }
}

/* ==========================================================================
   7. SINCRONIZACIÓN E INVALIDACIÓN EXPLÍCITA (EVENTO + HOOK)
   ========================================================================== */

export const PRODUCTION_CHANGED_EVENT = 'visualcorp:production-changed';

export function emitProductionChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PRODUCTION_CHANGED_EVENT));
  }
}

export interface UseProductionSyncOptions {
  onRefresh?: () => Promise<void> | void;
  staleAfterMs?: number;
}

export interface ProductionSyncState {
  lastSyncedAt: Date | null;
  refreshing: boolean;
  isStale: boolean;
  triggerRefresh: () => Promise<void>;
  markSynced: () => void;
  markSyncError: (error?: unknown) => void;
}

export function useProductionSync({
  onRefresh,
  staleAfterMs = 180000,
}: UseProductionSyncOptions = {}): ProductionSyncState {
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const markSynced = useCallback(() => {
    setLastSyncedAt(new Date());
    setIsStale(false);
    setRefreshing(false);
  }, []);

  const markSyncError = useCallback((_err?: unknown) => {
    setIsStale(true);
    setRefreshing(false);
  }, []);

  const triggerRefresh = useCallback(async () => {
    if (!onRefreshRef.current) return;
    setRefreshing(true);
    try {
      await onRefreshRef.current();
      markSynced();
    } catch (err) {
      markSyncError(err);
      throw err;
    }
  }, [markSynced, markSyncError]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const interval = window.setInterval(() => {
      if (lastSyncedAt && Date.now() - lastSyncedAt.getTime() > staleAfterMs) {
        setIsStale(true);
      }
    }, 15000);
    return () => window.clearInterval(interval);
  }, [lastSyncedAt, staleAfterMs]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleProductionChange = () => {
      void triggerRefresh();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!lastSyncedAt || Date.now() - lastSyncedAt.getTime() > staleAfterMs) {
          setIsStale(true);
          void triggerRefresh();
        }
      }
    };

    window.addEventListener(PRODUCTION_CHANGED_EVENT, handleProductionChange);
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener(PRODUCTION_CHANGED_EVENT, handleProductionChange);
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [triggerRefresh, lastSyncedAt, staleAfterMs]);

  return {
    lastSyncedAt,
    refreshing,
    isStale,
    triggerRefresh,
    markSynced,
    markSyncError,
  };
}

/* ==========================================================================
   8. CONSULTAS Y RPC HELPERS COMPARTIDOS
   ========================================================================== */

export async function fetchJobBalanceFlags(
  organizationId: string,
  jobIds: string[]
): Promise<{ flags: Record<string, boolean>; error: string | null; unavailable: boolean }> {
  if (!supabase || !organizationId || !jobIds.length) {
    return { flags: {}, error: null, unavailable: false };
  }
  try {
    const { data, error } = await supabase.rpc('list_production_job_balance_flags', {
      p_organization_id: organizationId,
      p_job_ids: jobIds,
    });
    if (error) {
      return { flags: {}, error: error.message, unavailable: true };
    }
    const flags: Record<string, boolean> = {};
    const entries = (data || []) as Array<{ job_id: string; balance_due: boolean }>;
    for (const entry of entries) {
      if (entry?.job_id) {
        flags[entry.job_id] = Boolean(entry.balance_due);
      }
    }
    return { flags, error: null, unavailable: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido al consultar saldos.';
    return { flags: {}, error: message, unavailable: true };
  }
}

export interface ProductionJobDetailResult {
  job: ProductionJob;
  steps: ProductionStep[];
  stepChecks: ProductionStepCheck[];
  lots: ProductionLot[];
  events: ProductionJobEvent[];
  areas: ProductionAreaRow[];
}

export async function fetchProductionJobDetail(
  jobId: string,
  organizationId?: string
): Promise<ProductionJobDetailResult> {
  if (!supabase) {
    throw new Error('La conexión a Supabase no está configurada.');
  }
  if (!jobId || !jobId.trim()) {
    throw new Error('Identificador de trabajo no especificado.');
  }

  let jobQuery = supabase.from('production_jobs').select('*').eq('id', jobId.trim());
  if (organizationId) {
    jobQuery = jobQuery.eq('organization_id', organizationId);
  }
  const jobResult = await jobQuery.maybeSingle();

  if (jobResult.error) {
    throw new Error(`Error al consultar el trabajo: ${jobResult.error.message}`);
  }
  if (!jobResult.data) {
    throw new Error(`Trabajo de producción ${jobId} no encontrado o sin acceso.`);
  }

  const job = jobResult.data as ProductionJob;
  const orgId = job.organization_id;

  const [stepsResult, checksResult, lotsResult, eventsResult, areasResult] = await Promise.all([
    supabase
      .from('production_job_steps')
      .select('*')
      .eq('organization_id', orgId)
      .eq('job_id', job.id)
      .order('step_order', { ascending: true }),
    supabase
      .from('production_job_step_checks')
      .select('*')
      .eq('organization_id', orgId)
      .eq('job_id', job.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('production_job_lots')
      .select('*')
      .eq('organization_id', orgId)
      .eq('job_id', job.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('production_job_events')
      .select('*')
      .eq('organization_id', orgId)
      .eq('job_id', job.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('areas')
      .select('id, code, name')
      .eq('organization_id', orgId),
  ]);

  if (stepsResult.error) {
    throw new Error(`Error al consultar las etapas: ${stepsResult.error.message}`);
  }
  if (checksResult.error) {
    throw new Error(`Error al consultar los controles de etapa: ${checksResult.error.message}`);
  }
  if (lotsResult.error) {
    throw new Error(`Error al consultar los lotes físicos: ${lotsResult.error.message}`);
  }
  if (eventsResult.error) {
    throw new Error(`Error al consultar el historial de eventos: ${eventsResult.error.message}`);
  }
  if (areasResult.error) {
    throw new Error(`Error al consultar las áreas de trabajo: ${areasResult.error.message}`);
  }

  return {
    job,
    steps: (stepsResult.data || []) as ProductionStep[],
    stepChecks: (checksResult.data || []) as ProductionStepCheck[],
    lots: (lotsResult.data || []) as ProductionLot[],
    events: (eventsResult.data || []) as ProductionJobEvent[],
    areas: (areasResult.data || []) as ProductionAreaRow[],
  };
}

/** Exact IDs only. Names and titles are display data, never record identity. */
export function matchesProductionRecord(item: { recordId?: string; recordType?: string }, type: string, id: string) {
  return Boolean(id && item.recordType === type && item.recordId === id);
}

export function productionArtworkLabel(job: Pick<ProductionJob, 'artwork_review_status' | 'approval_required'>) {
  if (job.artwork_review_status === 'awaiting_art') return 'Archivo pendiente';
  if (job.artwork_review_status === 'changes_requested') return 'Corrección de archivo pendiente';
  if (job.artwork_review_status === 'awaiting_review') return 'Archivo pendiente de aprobación';
  return '';
}

export async function enrichProductionJobs(organizationId: string, jobs: ProductionJob[], steps: ProductionStep[]) {
  if (!supabase || !jobs.length) return;
  const { data, error } = await supabase.rpc('production_coordination_metadata', {
    p_organization_id: organizationId, p_job_ids: jobs.map((job) => job.id),
  });
  if (error) throw error;
  const metadata = new Map<string, { material_blocked: boolean; advisor_name: string | null; steps: Array<{ id: string; assigned_name: string | null }> }>(
    (data || []).map((row: any) => [row.id, row]),
  );
  const names = new Map<string, string | null>();
  for (const job of jobs) {
    const row = metadata.get(job.id);
    if (!row) continue;
    job.material_blocked = row.material_blocked;
    job.advisor_name = row.advisor_name;
    for (const step of row.steps) names.set(step.id, step.assigned_name);
  }
  for (const step of steps) step.assigned_name = names.get(step.id) || null;
}

export const PRODUCTION_VAULT_BUCKET = 'production-vault';
export const PRODUCTION_VAULT_MAX_BYTES = 50 * 1024 * 1024;
export function validateProductionVaultFile(file: { name: string; size: number; type: string }) {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const types: Record<string, string[]> = {
    png: ['image/png'], jpg: ['image/jpeg'], jpeg: ['image/jpeg'], webp: ['image/webp'],
    pdf: ['application/pdf'], svg: ['image/svg+xml'], ai: ['application/postscript','application/pdf'],
    eps: ['application/postscript'], psd: ['image/vnd.adobe.photoshop','application/x-photoshop'],
    cdr: ['application/vnd.corel-draw','application/x-coreldraw'], afdesign: [], dxf: ['application/dxf','image/vnd.dxf'],
  };
  if (!(extension in types) || (file.type && file.type !== 'application/octet-stream' && !types[extension].includes(file.type)))
    throw new Error('Tipo de archivo no permitido o incompatible con su extensión.');
  if (file.size <= 0 || file.size > PRODUCTION_VAULT_MAX_BYTES)
    throw new Error('El archivo debe tener contenido y pesar como máximo 50 MB.');
}

// Injectable storage boundary allows deterministic failure/retry tests without remote I/O.
export async function uploadProductionVaultFile(
  bucket: { upload: (path: string, file: File, options: any) => Promise<any>; createSignedUrl: (path: string, seconds: number) => Promise<any> },
  file: File, path: string, uploadedPath: string | undefined, rememberUploaded: (path: string) => void,
): Promise<{ storagePath: string; fileUrl: string }> {
  validateProductionVaultFile(file);
  let storagePath = uploadedPath;
  if (!storagePath) {
    const { data, error } = await bucket.upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || 'application/octet-stream' });
    if (error || !data?.path) throw error || new Error('El servidor no confirmó la subida.');
    storagePath = data.path as string;
    rememberUploaded(storagePath);
  }
  const { data, error } = await bucket.createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) throw error || new Error('No se pudo abrir el archivo privado.');
  return { storagePath, fileUrl: data.signedUrl };
}
