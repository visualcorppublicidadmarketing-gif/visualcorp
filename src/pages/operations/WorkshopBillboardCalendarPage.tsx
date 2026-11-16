import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  FileText,
  MapPin,
  RefreshCw,
  Search,
  Truck,
} from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { LocationEditorModal } from '../../components/workshop/LocationEditorModal';
import { WorkshopScheduleCalendar } from '../../components/workshop/WorkshopScheduleCalendar';
import { ProductionJobDetailSheet } from './ProductionJobDetailSheet';
import type { GeoCoordinates, InstallationWorkOrder } from '../../lib/geospatialProximity';
import { getWorkshopTodayKey, hasWorkshopMapLocation } from '../../components/workshop/workshopTypes';
import { useWorkshopSchedule } from '../../components/workshop/useWorkshopSchedule';
import {
  type AreaCode,
  AREA_SLUG_TO_CODE,
  useProductionSync,
} from '../../lib/productionHub';
import { supabase } from '../../lib/supabaseClient';
import type { WorkshopScheduleEvent } from '../../components/workshop/workshopTypes';
import {
  DEFAULT_WORKSHOP_SPECIAL_PINS,
  type WorkshopSpecialPin,
  type WorkshopSpecialPinKey,
} from '../../lib/workshopSpecialMapPins';
import './workshop-billboard-calendar.css';

type ViewMode = 'calendar' | 'map';
type DateScope = 'all' | 'day';

const WorkshopInteractiveMap = lazy(() => import('../../components/workshop/WorkshopInteractiveMap')
  .then((module) => ({ default: module.WorkshopInteractiveMap })));

const AREA_OPTIONS: Array<{ code: 'ALL' | AreaCode; label: string }> = [
  { code: 'ALL', label: 'Todas las áreas' },
  { code: 'ASE', label: 'Asesoría (ASE)' },
  { code: 'DIS', label: 'Diseño (DIS)' },
  { code: 'IMP', label: 'Impresión (IMP)' },
  { code: 'SUB', label: 'Sublimación (SUB)' },
  { code: 'LAS', label: 'Láser (LAS)' },
  { code: 'TAL', label: 'Taller (TAL)' },
];

function normalizeView(value: string | null): ViewMode {
  return value === 'map' ? 'map' : 'calendar';
}

function normalizeScope(value: string | null): DateScope {
  return value === 'all' ? 'all' : 'day';
}

export function WorkshopBillboardCalendarPage() {
  const { hasPermission, organizationId, roles, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const schedule = useWorkshopSchedule();

  const sync = useProductionSync({
    onRefresh: schedule.reload,
    staleAfterMs: 120000,
  });

  // Estado unificado elevado a URL searchParams
  const viewMode = normalizeView(searchParams.get('tab'));
  const selectedDate = searchParams.get('fecha') ?? getWorkshopTodayKey();
  const dateScope = normalizeScope(searchParams.get('alcance'));
  const areaFilter = (searchParams.get('area') || 'ALL') as 'ALL' | AreaCode;
  const searchQuery = searchParams.get('q') || '';
  const installationOnly = searchParams.get('instalacion') === '1';
  const selectedJobId = searchParams.get('trabajo') || null;
  const isFichaOpen = searchParams.get('ficha') === '1' && Boolean(selectedJobId);

  // Estado local para búsqueda suave
  const [searchInput, setSearchInput] = useState(searchQuery);
  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  // Modales de ubicación
  const [locationDraftJob, setLocationDraftJob] = useState<InstallationWorkOrder | null>(null);
  const [pickingLocationFor, setPickingLocationFor] = useState<string | null>(null);
  const [pickedCoordinates, setPickedCoordinates] = useState<GeoCoordinates | null>(null);
  const [specialMapPins, setSpecialMapPins] = useState<readonly WorkshopSpecialPin[]>(DEFAULT_WORKSHOP_SPECIAL_PINS);
  const [specialMapPinsReady, setSpecialMapPinsReady] = useState(false);

  const canViewSales = hasPermission('sales', 'view');
  const canEditLocations = hasPermission('workshop', 'edit');
  const isOrganizationOwner = roles.includes('owner');

  useEffect(() => {
    let active = true;
    setSpecialMapPins(DEFAULT_WORKSHOP_SPECIAL_PINS);
    setSpecialMapPinsReady(false);
    if (!organizationId || !supabase) {
      setSpecialMapPinsReady(true);
      return () => { active = false; };
    }

    void supabase
      .from('organization_map_pins')
      .select('pin_key,name,address,latitude,longitude,is_verified')
      .eq('organization_id', organizationId)
      .then(({ data, error }) => {
        if (!active) return;
        if (!error && data) {
          const savedPins = new Map(data.map((row) => [row.pin_key, row]));
          setSpecialMapPins(DEFAULT_WORKSHOP_SPECIAL_PINS.map((fallback) => {
            const saved = savedPins.get(fallback.key);
            if (!saved || !Number.isFinite(Number(saved.latitude)) || !Number.isFinite(Number(saved.longitude))) return fallback;
            return {
              ...fallback,
              name: saved.name || fallback.name,
              address: saved.address || fallback.address,
              lat: Number(saved.latitude),
              lng: Number(saved.longitude),
              verified: Boolean(saved.is_verified),
            };
          }));
        }
        setSpecialMapPinsReady(true);
      }, () => {
        if (active) setSpecialMapPinsReady(true);
      });

    return () => { active = false; };
  }, [organizationId]);

  // Modificadores sincronizados de URL
  const setViewMode = useCallback((mode: ViewMode) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (mode === 'calendar') next.delete('tab');
      else next.set('tab', 'map');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setSelectedDate = useCallback((date: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (date) next.set('fecha', date);
      else next.delete('fecha');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setDateScope = useCallback((scope: DateScope) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (scope === 'all') next.set('alcance', 'all');
      else next.delete('alcance');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setAreaFilter = useCallback((area: 'ALL' | AreaCode) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (area && area !== 'ALL') next.set('area', area);
      else next.delete('area');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value.trim()) next.set('q', value.trim());
      else next.delete('q');
      return next;
    }, { replace: true });
  };

  const setInstallationOnly = useCallback((active: boolean) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (active) next.set('instalacion', '1');
      else next.delete('instalacion');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const selectJob = useCallback((jobId: string | null) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (jobId) next.set('trabajo', jobId);
      else next.delete('trabajo');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const openJobDetail = useCallback((jobId: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('trabajo', jobId);
      next.set('ficha', '1');
      return next;
    });
  }, [setSearchParams]);

  const closeJobDetail = useCallback(() => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('ficha');
      return next;
    });
    void schedule.reload();
  }, [schedule, setSearchParams]);

  // Filtros unificados compartidos entre Calendario, Mapa y Resumen de pendientes
  const visibleJobs = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('es');
    return schedule.jobs.filter((job) => {
      if (installationOnly && !job.requiresInstallation) return false;
      if (areaFilter !== 'ALL') {
        const jobAreaCode = job.areaCode || (job.area ? AREA_SLUG_TO_CODE[job.area] : 'TAL');
        if (jobAreaCode !== areaFilter) return false;
      }
      if (!query) return true;
      return [job.code, job.title, job.clientName, job.address, job.areaLabel || '']
        .some((value) => value.toLocaleLowerCase('es').includes(query));
    });
  }, [schedule.jobs, searchQuery, installationOnly, areaFilter]);

  const visibleIds = useMemo(() => new Set(visibleJobs.map((job) => job.id)), [visibleJobs]);

  const visibleEvents = useMemo(
    () => schedule.events.filter((event) => visibleIds.has(event.jobId)),
    [schedule.events, visibleIds],
  );

  const installationJobs = useMemo(
    () => visibleJobs.filter((job) => job.requiresInstallation),
    [visibleJobs],
  );

  // Trabajos a desplegar en el mapa según el toggle explícito de fecha
  const mapJobs = useMemo(() => {
    if (dateScope === 'day' && selectedDate) {
      return installationJobs.filter((job) => (job.executionDate || job.scheduledDate) === selectedDate);
    }
    return installationJobs;
  }, [installationJobs, dateScope, selectedDate]);

  const mappedCount = installationJobs.filter(hasWorkshopMapLocation).length;
  const unmappedJobs = installationJobs.filter((job) => !hasWorkshopMapLocation(job));
  const undatedJobs = visibleJobs.filter((job) => !schedule.events.some((event) => event.jobId === job.id));
  const eventCount = visibleEvents.length;
  const todayKey = getWorkshopTodayKey();
  const todayEvents = visibleEvents.filter((event) => event.date === todayKey).length;

  // Acciones en mapa y eventos
  const chooseEvent = (event: WorkshopScheduleEvent) => selectJob(event.jobId);
  const selectMapJob = useCallback((job: InstallationWorkOrder) => selectJob(job.id || null), [selectJob]);

  const showOnMap = (jobId: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('tab', 'map');
      next.set('trabajo', jobId);
      return next;
    });
  };

  const openLocationEditor = useCallback((job: InstallationWorkOrder) => {
    selectJob(job.id);
    setPickedCoordinates(null);
    setPickingLocationFor(null);
    setLocationDraftJob(job);
    setViewMode('map');
  }, [selectJob, setViewMode]);

  const requestMapPick = useCallback(() => {
    if (!locationDraftJob) return;
    setPickingLocationFor(locationDraftJob.id);
    setViewMode('map');
  }, [locationDraftJob, setViewMode]);

  const receiveMapPick = useCallback((coordinates: GeoCoordinates) => {
    setPickedCoordinates(coordinates);
    setPickingLocationFor(null);
  }, []);

  const moveSpecialMapPin = useCallback(async (key: WorkshopSpecialPinKey, coords: GeoCoordinates) => {
    if (!isOrganizationOwner || !organizationId || !user?.id || !supabase) {
      throw new Error('Solo el propietario puede mover las sedes del mapa.');
    }
    const pin = specialMapPins.find((candidate) => candidate.key === key);
    if (!pin) throw new Error('No encontramos esa sede en el mapa.');

    const { error } = await supabase.from('organization_map_pins').upsert({
      organization_id: organizationId,
      pin_key: key,
      name: pin.name,
      address: pin.address,
      latitude: coords.lat,
      longitude: coords.lng,
      is_verified: true,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,pin_key' });
    if (error) throw error;

    setSpecialMapPins((current) => current.map((candidate) => candidate.key === key
      ? { ...candidate, lat: coords.lat, lng: coords.lng, verified: true }
      : candidate));
  }, [isOrganizationOwner, organizationId, specialMapPins, user?.id]);

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
    sync.markSynced();
  }, [organizationId, schedule, sync]);

  const handleManualRefresh = async () => {
    await sync.triggerRefresh();
  };

  const handleDetailChanged = async () => {
    await schedule.reload();
    sync.markSynced();
  };

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
              {(schedule.isWorkshopView || canViewSales) && (
                <Link className="button button-outline" to="/operaciones/coordinacion-trabajos">
                  <ClipboardList size={15} aria-hidden="true" /> Coordinación
                </Link>
              )}
              <button
                type="button"
                className="button button-outline ws-refresh-btn"
                onClick={() => void handleManualRefresh()}
                disabled={schedule.loading || sync.refreshing}
                title="Sincronizar y recargar trabajos"
              >
                <RefreshCw size={15} className={sync.refreshing ? 'ws-spin' : ''} aria-hidden="true" />
                <span>{schedule.loading || sync.refreshing ? 'Actualizando…' : 'Actualizar'}</span>
              </button>
            </div>
          )}
        />

        {sync.isStale && (
          <div className="ws-stale-alert" role="status">
            <div className="ws-stale-alert-text">
              <AlertCircle size={16} aria-hidden="true" />
              <span>Hay cambios de producción recientes pendientes de sincronizar en la cartelera.</span>
            </div>
            <button
              type="button"
              className="ws-stale-refresh-btn"
              onClick={() => void handleManualRefresh()}
            >
              Recargar ahora
            </button>
          </div>
        )}

        <section className="ws-scope-note" aria-label="Alcance de la vista">
          <span className="ws-scope-icon">
            {schedule.isWorkshopView ? <Truck size={17} aria-hidden="true" /> : <CalendarDays size={17} aria-hidden="true" />}
          </span>
          <div>
            <b>{schedule.isWorkshopView ? 'Vista según permisos de taller' : 'Vista personal de asesoría'}</b>
            <p>
              {schedule.isWorkshopView
                ? 'Se muestran trabajos de las sucursales habilitadas para tu perfil.'
                : 'Solo se cargan trabajos asignados a tu cuenta. Esta vista no permite cambiar etapas ni ubicaciones.'}
            </p>
          </div>
        </section>

        <section className="ws-stats" aria-label="Resumen de programación">
          <article>
            <span>Trabajos visibles</span>
            <b>{schedule.loading ? '—' : visibleJobs.length}</b>
          </article>
          <article>
            <span>Eventos con fecha</span>
            <b>{schedule.loading ? '—' : eventCount}</b>
          </article>
          <article>
            <span>Instalaciones con pin</span>
            <b>{schedule.loading ? '—' : mappedCount}</b>
          </article>
          <article>
            <span>Eventos para hoy</span>
            <b>{schedule.loading ? '—' : todayEvents}</b>
          </article>
        </section>

        <section className="ws-toolbar" aria-label="Filtros y vista">
          <label className="ws-search-field">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Buscar por trabajo, cliente o dirección</span>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar trabajo, cliente o dirección"
            />
          </label>

          <label className="ws-area-filter">
            <span className="ws-filter-label">Área:</span>
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value as 'ALL' | AreaCode)}
              aria-label="Filtrar por área de producción"
            >
              {AREA_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label className="ws-install-filter">
            <input
              type="checkbox"
              checked={installationOnly}
              onChange={(e) => setInstallationOnly(e.target.checked)}
            />
            <span>Solo instalaciones</span>
          </label>

          <div className="ws-view-switch" role="group" aria-label="Vista de trabajos">
            <button
              type="button"
              aria-pressed={viewMode === 'calendar'}
              onClick={() => setViewMode('calendar')}
            >
              <CalendarDays size={15} aria-hidden="true" />
              <span>Calendario</span>
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'map'}
              onClick={() => setViewMode('map')}
            >
              <MapPin size={15} aria-hidden="true" />
              <span>Mapa</span>
            </button>
          </div>
        </section>

        {schedule.loading && <p className="ws-loading" role="status">Cargando trabajos y fechas registradas…</p>}
        {schedule.error && (
          <div className="ws-alert" role="alert">
            <span>{schedule.error}</span>
            <button type="button" onClick={() => void handleManualRefresh()}>Intentar de nuevo</button>
          </div>
        )}
        {!schedule.loading && !schedule.error && !schedule.canView && (
          <p className="ws-empty">Tu perfil no tiene permiso para consultar el calendario de taller.</p>
        )}

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
                onViewDetail={openJobDetail}
                onRequestLocationEdit={canEditLocations ? (jobId) => {
                  const job = visibleJobs.find((candidate) => candidate.id === jobId);
                  if (job) openLocationEditor(job);
                } : undefined}
              />
            )}

            {viewMode === 'map' && (
              <>
                <section className="ws-map-header-bar" aria-label="Filtro temporal del mapa">
                  <div className="ws-map-scope-group" role="group" aria-label="Alcance de fechas del mapa">
                    <span className="ws-map-scope-label">Mostrar en mapa:</span>
                    <button
                      type="button"
                      className={`ws-map-scope-btn ${dateScope === 'all' ? 'is-active' : ''}`}
                      aria-pressed={dateScope === 'all'}
                      onClick={() => setDateScope('all')}
                    >
                      Todo el rango filtrado ({installationJobs.length})
                    </button>
                    <button
                      type="button"
                      className={`ws-map-scope-btn ${dateScope === 'day' ? 'is-active' : ''}`}
                      aria-pressed={dateScope === 'day'}
                      onClick={() => setDateScope('day')}
                    >
                      Solo fecha seleccionada: {selectedDate || 'Sin fecha'} ({installationJobs.filter((job) => (job.executionDate || job.scheduledDate) === selectedDate).length})
                    </button>
                  </div>
                </section>

                <div className="ws-map-frame">
                  <Suspense fallback={<p className="ws-loading" role="status">Cargando el mapa interactivo…</p>}>
                    <WorkshopInteractiveMap
                      jobs={mapJobs}
                      selectedJobId={selectedJobId}
                      onSelectJob={selectMapJob}
                      onEditLocation={canEditLocations ? openLocationEditor : undefined}
                      onViewDetail={openJobDetail}
                      pickingMode={Boolean(pickingLocationFor)}
                      onLocationPick={receiveMapPick}
                      onCancelLocationPick={() => setPickingLocationFor(null)}
                      specialPins={specialMapPins}
                      specialPinsReady={specialMapPinsReady}
                      canEditSpecialPins={isOrganizationOwner}
                      onMoveSpecialPin={moveSpecialMapPin}
                      className="ws-map"
                    />
                  </Suspense>
                </div>

                {unmappedJobs.length > 0 && (
                  <section className="ws-unmapped" aria-labelledby="ws-unmapped-heading">
                    <header>
                      <div>
                        <span>UBICACIÓN PENDIENTE</span>
                        <h2 id="ws-unmapped-heading">Instalaciones sin pin guardado</h2>
                      </div>
                      <b>{unmappedJobs.length}</b>
                    </header>
                    <ul>
                      {unmappedJobs.map((job) => (
                        <li key={job.id}>
                          <div className="ws-unmapped-info">
                            <b>{job.code} · {job.title}</b>
                            <span>{job.clientName} · {job.address}</span>
                          </div>
                          <div className="ws-unmapped-actions">
                            {job.mapsUrl && (
                              <a
                                href={job.mapsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="ws-link-maps"
                                title="Abrir enlace de referencia"
                              >
                                <ExternalLink size={12} aria-hidden="true" />
                                <span>Referencia</span>
                              </a>
                            )}
                            <button
                              type="button"
                              className="button button-outline ws-btn-action"
                              onClick={() => openJobDetail(job.id)}
                            >
                              <FileText size={13} aria-hidden="true" />
                              <span>Ver ficha</span>
                            </button>
                            {canEditLocations && (
                              <button
                                type="button"
                                className="button button-outline ws-btn-action is-locate"
                                onClick={() => openLocationEditor(job)}
                              >
                                <MapPin size={13} aria-hidden="true" />
                                <span>Ubicar en mapa</span>
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}

            {undatedJobs.length > 0 && (
              <section className="ws-undated" aria-labelledby="ws-undated-heading">
                <header>
                  <div>
                    <span>PROGRAMACIÓN PENDIENTE</span>
                    <h2 id="ws-undated-heading">Trabajos sin fecha programada</h2>
                  </div>
                  <b>{undatedJobs.length}</b>
                </header>
                <ul>
                  {undatedJobs.map((job) => (
                    <li key={job.id}>
                      <div className="ws-undated-info">
                        <b>{job.code} · {job.title}</b>
                        <span>{job.clientName} · {job.areaLabel || 'Taller'} · {job.status.replaceAll('_', ' ')}</span>
                      </div>
                      <div className="ws-undated-actions">
                        <button
                          type="button"
                          className="button button-outline ws-btn-action"
                          onClick={() => openJobDetail(job.id)}
                        >
                          <FileText size={13} aria-hidden="true" />
                          <span>Ver ficha</span>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {schedule.jobs.length === 0 && (
              <p className="ws-empty">No hay trabajos activos o programados disponibles para este perfil.</p>
            )}
            {schedule.jobs.length > 0 && visibleJobs.length === 0 && (
              <p className="ws-empty">No hay trabajos que coincidan con los filtros seleccionados.</p>
            )}
            {visibleJobs.length > 0 && eventCount === 0 && viewMode === 'calendar' && (
              <p className="ws-hint">Las fechas sin registro permanecen pendientes; nunca se asignan fechas automáticas sin confirmación.</p>
            )}
          </>
        )}
      </main>

      <LocationEditorModal
        isOpen={Boolean(locationDraftJob)}
        isPickingLocation={Boolean(pickingLocationFor)}
        job={locationDraftJob}
        pickedCoordinates={pickedCoordinates}
        onClose={() => {
          setLocationDraftJob(null);
          setPickingLocationFor(null);
          setPickedCoordinates(null);
        }}
        onRequestMapPick={requestMapPick}
        onSaveLocation={saveLocation}
      />

      {/* FICHA UNIFICADA DE DETALLE DE TRABAJO */}
      <ProductionJobDetailSheet
        open={Boolean(isFichaOpen && selectedJobId)}
        jobId={selectedJobId}
        onClose={closeJobDetail}
        onChanged={handleDetailChanged}
      />
    </AppFrame>
  );
}
