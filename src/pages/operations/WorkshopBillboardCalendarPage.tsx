import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, ClipboardList, MapPin, RefreshCw, Search, Truck } from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { LocationEditorModal } from '../../components/workshop/LocationEditorModal';
import { WorkshopScheduleCalendar } from '../../components/workshop/WorkshopScheduleCalendar';
import type { GeoCoordinates, InstallationWorkOrder } from '../../lib/geospatialProximity';
import { getWorkshopTodayKey, hasWorkshopMapLocation } from '../../components/workshop/workshopTypes';
import { useWorkshopSchedule } from '../../components/workshop/useWorkshopSchedule';
import { supabase } from '../../lib/supabaseClient';
import type { WorkshopScheduleEvent } from '../../components/workshop/workshopTypes';
import './workshop-billboard-calendar.css';

type ViewMode = 'calendar' | 'map';
const WorkshopInteractiveMap = lazy(() => import('../../components/workshop/WorkshopInteractiveMap')
  .then((module) => ({ default: module.WorkshopInteractiveMap })));

function normalizeView(value: string | null): ViewMode {
  return value === 'map' ? 'map' : 'calendar';
}

export function WorkshopBillboardCalendarPage() {
  const { hasPermission, organizationId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const schedule = useWorkshopSchedule();
  const [viewMode, setViewMode] = useState<ViewMode>(() => normalizeView(searchParams.get('tab')));
  const [selectedDate, setSelectedDate] = useState(getWorkshopTodayKey);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [installationOnly, setInstallationOnly] = useState(false);
  const [locationDraftJob, setLocationDraftJob] = useState<InstallationWorkOrder | null>(null);
  const [pickingLocationFor, setPickingLocationFor] = useState<string | null>(null);
  const [pickedCoordinates, setPickedCoordinates] = useState<GeoCoordinates | null>(null);
  const canViewSales = hasPermission('sales', 'view');
  const canEditLocations = hasPermission('workshop', 'edit');

  useEffect(() => {
    setSearchParams((current) => {
      if (current.get('tab') === viewMode) return current;
      current.set('tab', viewMode);
      return current;
    }, { replace: true });
  }, [viewMode, setSearchParams]);

  const visibleJobs = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('es');
    return schedule.jobs.filter((job) => {
      if (installationOnly && !job.requiresInstallation) return false;
      if (!query) return true;
      return [job.code, job.title, job.clientName, job.address, job.areaLabel || '']
        .some((value) => value.toLocaleLowerCase('es').includes(query));
    });
  }, [schedule.jobs, searchQuery, installationOnly]);
  const visibleIds = useMemo(() => new Set(visibleJobs.map((job) => job.id)), [visibleJobs]);
  const visibleEvents = useMemo(
    () => schedule.events.filter((event) => visibleIds.has(event.jobId)),
    [schedule.events, visibleIds],
  );
  const installationJobs = useMemo(() => visibleJobs.filter((job) => job.requiresInstallation), [visibleJobs]);
  const mappedCount = installationJobs.filter(hasWorkshopMapLocation).length;
  const unmappedJobs = installationJobs.filter((job) => !hasWorkshopMapLocation(job));
  const undatedJobs = visibleJobs.filter((job) => !schedule.events.some((event) => event.jobId === job.id));
  const eventCount = visibleEvents.length;
  const todayKey = getWorkshopTodayKey();
  const todayEvents = visibleEvents.filter((event) => event.date === todayKey).length;

  const chooseEvent = (event: WorkshopScheduleEvent) => setSelectedJobId(event.jobId);
  const selectMapJob = useCallback((job: InstallationWorkOrder) => setSelectedJobId(job.id), []);
  const showOnMap = (jobId: string) => {
    setSelectedJobId(jobId);
    setViewMode('map');
  };
  const openLocationEditor = useCallback((job: InstallationWorkOrder) => {
    setSelectedJobId(job.id);
    setPickedCoordinates(null);
    setPickingLocationFor(null);
    setLocationDraftJob(job);
    setViewMode('map');
  }, []);
  const requestMapPick = useCallback(() => {
    if (!locationDraftJob) return;
    setPickingLocationFor(locationDraftJob.id);
    setViewMode('map');
  }, [locationDraftJob]);
  const receiveMapPick = useCallback((coordinates: GeoCoordinates) => {
    setPickedCoordinates(coordinates);
    setPickingLocationFor(null);
  }, []);
  const saveLocation = useCallback(async (jobId: string, data: { address: string; lat: number; lng: number; mapsUrl: string }) => {
    if (!supabase || !organizationId) throw new Error('No hay una sesión de trabajo disponible. Actualiza la página e inténtalo de nuevo.');
    const { error } = await supabase.rpc('update_workshop_installation_location', {
      p_job_id: jobId,
      p_address: data.address,
      p_maps_url: data.mapsUrl || null,
      p_latitude: data.lat,
      p_longitude: data.lng,
    });
    if (error) throw error;
    setLocationDraftJob(null);
    setPickedCoordinates(null);
    await schedule.reload();
  }, [organizationId, schedule.reload]);

  const title = schedule.isWorkshopView ? 'Agenda del taller' : 'Calendario de mis trabajos';
  const description = schedule.isWorkshopView
    ? 'Consulta fechas de producción, entrega e instalación. El equipo con permiso de taller puede registrar y corregir ubicaciones.'
    : 'Consulta el calendario y las ubicaciones de los trabajos vinculados a tus ventas. El acceso se limita a tus propios trabajos.';

  return (
    <AppFrame area="operations">
      <main className="wbc-page">
        <PageHeading
          eyebrow={schedule.isWorkshopView ? 'OPERACIONES · TALLER' : 'OPERACIONES · ASESORÍA'}
          title={title}
          description={description}
          action={(
            <div className="ws-page-actions">
              {(schedule.isWorkshopView || canViewSales) && <Link className="button button-outline" to="/operaciones/coordinacion-trabajos"><ClipboardList size={15} /> Coordinación</Link>}
              <button type="button" className="button button-outline" onClick={() => void schedule.reload()} disabled={schedule.loading}>
                <RefreshCw size={15} aria-hidden="true" /> {schedule.loading ? 'Actualizando…' : 'Actualizar'}
              </button>
            </div>
          )}
        />

        <section className="ws-scope-note" aria-label="Alcance de la vista">
          <span className="ws-scope-icon">{schedule.isWorkshopView ? <Truck size={17} /> : <CalendarDays size={17} />}</span>
          <div>
            <b>{schedule.isWorkshopView ? 'Vista según permisos de taller' : 'Vista personal de asesoría'}</b>
            <p>{schedule.isWorkshopView
              ? 'Se muestran trabajos de las sucursales habilitadas para tu perfil.'
                : 'Solo se cargan trabajos asignados a tu cuenta. Esta vista no permite cambiar etapas ni ubicaciones.'}</p>
          </div>
        </section>

        <section className="ws-stats" aria-label="Resumen de programación">
          <article><span>Trabajos visibles</span><b>{schedule.loading ? '—' : visibleJobs.length}</b></article>
          <article><span>Eventos con fecha</span><b>{schedule.loading ? '—' : eventCount}</b></article>
          <article><span>Instalaciones con pin</span><b>{schedule.loading ? '—' : mappedCount}</b></article>
          <article><span>Eventos para hoy</span><b>{schedule.loading ? '—' : todayEvents}</b></article>
        </section>

        <section className="ws-toolbar" aria-label="Buscar y elegir vista">
          <label className="ws-search-field">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Buscar por trabajo, cliente o dirección</span>
            <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar trabajo, cliente o dirección" />
          </label>
          <label className="ws-install-filter">
            <input type="checkbox" checked={installationOnly} onChange={(event) => setInstallationOnly(event.target.checked)} />
            <span>Solo instalaciones</span>
          </label>
          <div className="ws-view-switch" role="group" aria-label="Vista de trabajos">
            <button type="button" aria-pressed={viewMode === 'calendar'} onClick={() => setViewMode('calendar')}><CalendarDays size={15} /> Calendario</button>
            <button type="button" aria-pressed={viewMode === 'map'} onClick={() => setViewMode('map')}><MapPin size={15} /> Mapa</button>
          </div>
        </section>

        {schedule.loading && <p className="ws-loading" role="status">Cargando trabajos y fechas registradas…</p>}
        {schedule.error && <div className="ws-alert" role="alert"><span>{schedule.error}</span><button type="button" onClick={() => void schedule.reload()}>Intentar de nuevo</button></div>}
        {!schedule.loading && !schedule.error && !schedule.canView && <p className="ws-empty">Tu perfil no tiene permiso para consultar el calendario de taller.</p>}

        {!schedule.loading && !schedule.error && schedule.canView && (
          <>
            {viewMode === 'calendar' && (
              <WorkshopScheduleCalendar
                events={visibleEvents}
                selectedDate={selectedDate}
                selectedJobId={selectedJobId}
                onSelectDate={setSelectedDate}
                onSelectEvent={chooseEvent}
                onShowOnMap={showOnMap}
                onRequestLocationEdit={canEditLocations ? (jobId) => {
                  const job = visibleJobs.find((candidate) => candidate.id === jobId);
                  if (job) openLocationEditor(job);
                } : undefined}
              />
            )}

            {viewMode === 'map' && (
              <>
                <div className="ws-map-frame">
                  <Suspense fallback={<p className="ws-loading" role="status">Cargando el mapa…</p>}>
                    <WorkshopInteractiveMap
                      jobs={installationJobs}
                      selectedJobId={selectedJobId}
                      onSelectJob={selectMapJob}
                      onEditLocation={canEditLocations ? openLocationEditor : undefined}
                      pickingMode={Boolean(pickingLocationFor)}
                      onLocationPick={receiveMapPick}
                      onCancelLocationPick={() => setPickingLocationFor(null)}
                      className="ws-map"
                    />
                  </Suspense>
                </div>
                {unmappedJobs.length > 0 && (
                  <section className="ws-unmapped" aria-labelledby="ws-unmapped-heading">
                    <header><div><span>UBICACIÓN PENDIENTE</span><h2 id="ws-unmapped-heading">Instalaciones sin pin guardado</h2></div><b>{unmappedJobs.length}</b></header>
                    <ul>
                      {unmappedJobs.map((job) => (
                        <li key={job.id}>
                          <div><b>{job.code} · {job.title}</b><span>{job.clientName} · {job.address}</span></div>
                          {job.mapsUrl && <a href={job.mapsUrl} target="_blank" rel="noreferrer">Abrir referencia del mapa</a>}
                          {canEditLocations && <button type="button" className="button button-outline" onClick={() => openLocationEditor(job)}>Registrar ubicación</button>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}

            {undatedJobs.length > 0 && (
              <section className="ws-undated" aria-labelledby="ws-undated-heading">
                <header><div><span>PROGRAMACIÓN PENDIENTE</span><h2 id="ws-undated-heading">Trabajos sin fecha registrada</h2></div><b>{undatedJobs.length}</b></header>
                <ul>{undatedJobs.map((job) => <li key={job.id}><b>{job.code} · {job.title}</b><span>{job.clientName} · {job.areaLabel || 'Taller'} · {job.status.replaceAll('_', ' ')}</span></li>)}</ul>
              </section>
            )}

            {schedule.jobs.length === 0 && <p className="ws-empty">No hay trabajos activos o programados disponibles para este perfil.</p>}
            {schedule.jobs.length > 0 && visibleJobs.length === 0 && <p className="ws-empty">No hay trabajos que coincidan con la búsqueda actual.</p>}
            {visibleJobs.length > 0 && eventCount === 0 && viewMode === 'calendar' && <p className="ws-hint">Las fechas sin registro permanecen pendientes; no se asignan automáticamente.</p>}
          </>
        )}
      </main>
      <LocationEditorModal
        isOpen={Boolean(locationDraftJob)}
        isPickingLocation={Boolean(pickingLocationFor)}
        job={locationDraftJob}
        pickedCoordinates={pickedCoordinates}
        onClose={() => { setLocationDraftJob(null); setPickingLocationFor(null); setPickedCoordinates(null); }}
        onRequestMapPick={requestMapPick}
        onSaveLocation={saveLocation}
      />
    </AppFrame>
  );
}
