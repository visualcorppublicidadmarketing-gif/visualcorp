import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { parseCoordinatesInput } from '../../lib/geospatialProximity';
import { hasWorkshopMapLocation, type WorkshopScheduleEvent, type WorkshopScheduleJob } from './workshopTypes';

const PAGE_SIZE = 250;
const CHUNK_SIZE = 100;
const TIME_ZONE = 'America/Guayaquil';

type JobRow = {
  id: string;
  organization_id: string;
  branch_id: string;
  sale_id: string;
  advisor_id: string;
  sale_code: string | null;
  customer_name: string | null;
  title: string;
  specifications: Record<string, unknown> | null;
  status: string;
  due_at: string | null;
  fulfillment_status: string | null;
  fulfillment_due_at: string | null;
};

type StepRow = {
  id: string;
  job_id: string;
  step_order: number;
  title: string;
  status: string;
  due_at: string | null;
  areas?: { name?: string | null; code?: string | null } | Array<{ name?: string | null; code?: string | null }> | null;
};

type FulfillmentRow = {
  sale_id: string;
  installation_required: boolean;
  installation_address: string | null;
  installation_maps_url: string | null;
  installation_latitude: number | string | null;
  installation_longitude: number | string | null;
  installation_estimated_at: string | null;
  delivery_due_at: string | null;
};

type PageResult<T> = { data: T[] | null; error: unknown };

async function readAllPages<T>(
  readPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = PAGE_SIZE,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await readPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function dateKey(value: string | null | undefined) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function timeLabel(value: string | null | undefined) {
  if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : new Intl.DateTimeFormat('es-EC', {
    timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeGoogleMapsUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isGoogleMapsPage = ['google.com', 'www.google.com'].includes(host) && url.pathname.startsWith('/maps/');
    const isMapsShortLink = host === 'maps.app.goo.gl' || (host === 'goo.gl' && url.pathname.startsWith('/maps/'));
    return url.protocol === 'https:' && (isGoogleMapsPage || isMapsShortLink) ? url.toString() : '';
  } catch {
    return '';
  }
}

function coordinate(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function areaFromCode(code: string) {
  const normalized = code.trim().toUpperCase();
  if (normalized === 'ASE' || normalized === 'ASESORIA') return 'asesoria';
  if (normalized === 'DIS' || normalized === 'DES') return 'diseno';
  if (normalized === 'IMP') return 'impresion';
  if (normalized === 'SUB') return 'sublimacion';
  if (normalized === 'LAS') return 'laser';
  return 'taller';
}

function areaForStep(step?: StepRow) {
  const area = Array.isArray(step?.areas) ? step.areas[0] : step?.areas;
  return { name: text(area?.name) || 'Taller', code: text(area?.code) };
}

function activeStep(steps: StepRow[]) {
  return steps.find((step) => step.status === 'in_progress')
    || steps.find((step) => step.status === 'blocked')
    || steps.find((step) => step.status === 'ready')
    || steps.find((step) => step.status === 'waiting');
}

function eventFor(
  job: WorkshopScheduleJob,
  kind: WorkshopScheduleEvent['kind'],
  dateTime: string | null | undefined,
  title: string,
  identity = dateTime || kind,
  areaLabel = job.areaLabel || 'Taller',
  status = job.status,
) {
  const date = dateKey(dateTime);
  if (!date) return undefined;
  return {
    id: `${job.id}:${kind}:${identity}`,
    jobId: job.id,
    date,
    title,
    kind,
    code: job.code,
    clientName: job.clientName,
    areaLabel,
    status,
    time: timeLabel(dateTime),
    address: job.requiresInstallation ? job.address : undefined,
    hasMapLocation: hasWorkshopMapLocation(job),
  } satisfies WorkshopScheduleEvent;
}

function createEvents(job: WorkshopScheduleJob, steps: StepRow[], fulfillment?: FulfillmentRow): WorkshopScheduleEvent[] {
  const events: WorkshopScheduleEvent[] = [];
  for (const step of steps) {
    if (!['waiting', 'ready', 'in_progress', 'blocked'].includes(step.status)) continue;
    const area = areaForStep(step);
    const stepEvent = eventFor(job, 'production', step.due_at, step.title || 'Etapa de producción', step.id, area.name, step.status);
    if (stepEvent) events.push(stepEvent);
  }

  const installationDate = fulfillment?.installation_estimated_at || job.installationAt;
  if (job.requiresInstallation) {
    const installationEvent = eventFor(job, 'installation', installationDate, 'Instalación');
    if (installationEvent) events.push(installationEvent);
  }

  const deliveryDate = fulfillment?.delivery_due_at || job.deliveryDueAt;
  const deliveryEvent = eventFor(job, 'delivery', deliveryDate, 'Entrega');
  if (deliveryEvent) events.push(deliveryEvent);

  const deadlineEvent = eventFor(job, 'deadline', job.workDueAt, 'Fecha de trabajo');
  if (deadlineEvent) events.push(deadlineEvent);
  return events;
}

export interface WorkshopScheduleData {
  jobs: WorkshopScheduleJob[];
  events: WorkshopScheduleEvent[];
  loading: boolean;
  error: string;
  isWorkshopView: boolean;
  canView: boolean;
  reload: () => Promise<void>;
}

export function useWorkshopSchedule(): WorkshopScheduleData {
  const { organizationId, user, hasPermission } = useAuth();
  const canViewWorkshop = hasPermission('workshop', 'view');
  const canViewSales = hasPermission('sales', 'view');
  const canView = canViewWorkshop || canViewSales;
  const [jobs, setJobs] = useState<WorkshopScheduleJob[]>([]);
  const [events, setEvents] = useState<WorkshopScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const request = ++requestId.current;
    if (!supabase || !organizationId || !user?.id || !canView) {
      setJobs([]);
      setEvents([]);
      setError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const jobRows = await readAllPages<JobRow>((from, to) => {
        let query = supabase.from('production_jobs')
          .select('id,organization_id,branch_id,sale_id,advisor_id,sale_code,customer_name,title,specifications,status,due_at,fulfillment_status,fulfillment_due_at')
          .eq('organization_id', organizationId)
          .or('status.in.(open,needs_review),fulfillment_status.in.(quality_check,ready_for_delivery,scheduled)');
        if (!canViewWorkshop) query = query.eq('advisor_id', user.id);
        return query.order('due_at', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true })
          .range(from, to);
      });

      const jobIds = [...new Set(jobRows.map((job) => job.id))];
      const saleIds = [...new Set(jobRows.map((job) => job.sale_id))];
      const stepChunks = Array.from({ length: Math.ceil(jobIds.length / CHUNK_SIZE) }, (_, index) => jobIds.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE));
      const saleChunks = Array.from({ length: Math.ceil(saleIds.length / CHUNK_SIZE) }, (_, index) => saleIds.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE));
      const [stepGroups, fulfillmentGroups] = await Promise.all([
        Promise.all(stepChunks.map((ids) => readAllPages<StepRow>((from, to) => supabase.from('production_job_steps')
          .select('id,job_id,step_order,title,status,due_at,areas(name,code)')
          .eq('organization_id', organizationId).in('job_id', ids)
          .order('step_order', { ascending: true }).range(from, to)))),
        Promise.all(saleChunks.map((ids) => readAllPages<FulfillmentRow>((from, to) => supabase.from('sale_fulfillment_details')
          .select('sale_id,installation_required,installation_address,installation_maps_url,installation_latitude,installation_longitude,installation_estimated_at,delivery_due_at')
          .eq('organization_id', organizationId).in('sale_id', ids)
          .order('sale_id', { ascending: true }).range(from, to)))),
      ]);

      if (request !== requestId.current) return;
      const stepsByJob = new Map<string, StepRow[]>();
      stepGroups.flat().forEach((step) => stepsByJob.set(step.job_id, [...(stepsByJob.get(step.job_id) || []), step]));
      const fulfillmentBySale = new Map(fulfillmentGroups.flat().map((detail) => [detail.sale_id, detail]));
      const jobRowById = new Map(jobRows.map((row) => [row.id, row]));

      const nextJobs = jobRows.map((row): WorkshopScheduleJob => {
        const specs = row.specifications || {};
        const steps = (stepsByJob.get(row.id) || []).sort((a, b) => a.step_order - b.step_order);
        const step = activeStep(steps);
        const area = areaForStep(step);
        const detail = fulfillmentBySale.get(row.sale_id);
        const installationAt = detail?.installation_estimated_at || null;
        const deliveryDueAt = detail?.delivery_due_at || row.fulfillment_due_at;
        const coordinates = (specs.installation_coordinates || specs.coordinates || {}) as Record<string, unknown>;
        const rawMapsUrl = detail?.installation_maps_url || text(specs.installation_maps_url) || text(specs.maps_url);
        const mapsUrl = safeGoogleMapsUrl(rawMapsUrl);
        const parsedMapCoordinates = parseCoordinatesInput(mapsUrl);
        const lat = coordinate(detail?.installation_latitude)
          ?? coordinate(specs.installation_latitude)
          ?? coordinate(coordinates.lat)
          ?? parsedMapCoordinates?.lat;
        const lng = coordinate(detail?.installation_longitude)
          ?? coordinate(specs.installation_longitude)
          ?? coordinate(coordinates.lng)
          ?? parsedMapCoordinates?.lng;
        const requiresInstallation = detail?.installation_required === true
          || specs.installation_required === true
          || specs.requires_installation === true;
        const scheduledAt = requiresInstallation
          ? installationAt || deliveryDueAt || step?.due_at || row.due_at
          : step?.due_at || deliveryDueAt || row.due_at;
        const status = step?.status || row.fulfillment_status || row.status;
        return {
          id: row.id,
          code: row.sale_code || 'Código pendiente',
          title: row.title || 'Trabajo sin título',
          clientName: row.customer_name || 'Cliente pendiente',
          address: detail?.installation_address || text(specs.installation_address) || 'Dirección pendiente',
          scheduledDate: dateKey(scheduledAt),
          executionDate: dateKey(step?.due_at || row.due_at),
          status,
          area: areaFromCode(area.code),
          areaLabel: area.name,
          currentStepTitle: step?.title,
          requiresInstallation,
          installationAt,
          deliveryDueAt,
          workDueAt: row.due_at,
          mapsUrl,
          ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
        };
      });
      const nextEvents = nextJobs.flatMap((job) => createEvents(
        job,
        stepsByJob.get(job.id) || [],
        fulfillmentBySale.get(jobRowById.get(job.id)?.sale_id || ''),
      ));
      nextEvents.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || a.code.localeCompare(b.code));
      setJobs(nextJobs);
      setEvents(nextEvents);
    } catch (cause) {
      if (request === requestId.current) {
        setJobs([]);
        setEvents([]);
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los trabajos del taller.');
      }
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [canView, canViewWorkshop, organizationId, user?.id]);

  useEffect(() => {
    void reload();
    return () => { requestId.current += 1; };
  }, [reload]);

  return { jobs, events, loading, error, isWorkshopView: canViewWorkshop, canView, reload };
}
