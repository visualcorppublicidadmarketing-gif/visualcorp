import type { InstallationWorkOrder } from '../../lib/geospatialProximity';

export type WorkshopScheduleEventKind = 'production' | 'installation' | 'delivery' | 'deadline';

export interface WorkshopScheduleJob extends InstallationWorkOrder {
  areaLabel?: string;
  currentStepTitle?: string;
  mapsUrl?: string;
  installationAt?: string | null;
  deliveryDueAt?: string | null;
  workDueAt?: string | null;
}

export interface WorkshopScheduleEvent {
  id: string;
  jobId: string;
  date: string;
  title: string;
  kind: WorkshopScheduleEventKind;
  code: string;
  clientName: string;
  areaLabel: string;
  status: string;
  time?: string;
  address?: string;
  hasMapLocation: boolean;
}

export function getWorkshopTodayKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function getWorkshopScheduleDate(job: InstallationWorkOrder) {
  return job.executionDate || job.scheduledDate || '';
}

export function hasWorkshopMapLocation(job: InstallationWorkOrder) {
  return Number.isFinite(job.lat) && Number.isFinite(job.lng)
    && Math.abs(job.lat as number) <= 90
    && Math.abs(job.lng as number) <= 180
    && (job.lat !== 0 || job.lng !== 0);
}
