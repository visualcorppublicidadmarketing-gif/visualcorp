import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  ExternalLink,
  Hammer,
  Layers,
  MapPin,
  MessageCircle,
  Package,
  Plus,
  Printer,
  RefreshCw,
  ScanLine,
  Search,
  Shirt,
  Sparkles,
  TriangleAlert,
  Truck,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import {
  type InstallationWorkOrder,
  type ProximityPair,
  type ProximityCluster,
  MILAGRO_CENTER,
  MILAGRO_LANDMARKS,
  calculateHaversineDistance,
  detectProximityPairs,
  clusterJobsByProximity,
  formatDistance,
} from '../../lib/geospatialProximity';
import { WorkshopInteractiveMap } from '../../components/workshop/WorkshopInteractiveMap';
import { LocationEditorModal } from '../../components/workshop/LocationEditorModal';
import { ChatterDrawer360 } from '../../components/ui/ChatterDrawer360';
import {
  AnimatedShinyText,
  BorderBeam,
  NumberTicker,
  SpotlightLayer,
  updateSpotlight,
  clearSpotlight,
} from '../../components/ui/MagicComponents';
import { Calendar, dateFromKey, dateToKey } from '../../components/ui/Calendar';
import './workshop-billboard-calendar.css';

type ViewMode = 'billboard' | 'calendar' | 'map';
type GroupByMode = 'executionDate' | 'installationDate';
type AreaFilter = 'all' | 'taller' | 'impresion' | 'sublimacion' | 'laser';

// Fechas auxiliares
const padZero = (n: number) => String(n).padStart(2, '0');
const toISODate = (d = new Date()) => `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;

const getMonday = (d = new Date()) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return toISODate(new Date(date.setDate(diff)));
};

const addDaysISO = (isoDate: string, days: number) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toISODate(date);
};

const DAYS_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const STAGES_ORDER = [
  { id: 'diseno', label: 'Diseño' },
  { id: 'impresion', label: 'Impresión / Corte' },
  { id: 'acabados', label: 'Acabados & Armado' },
  { id: 'calidad', label: 'Control de Calidad' },
  { id: 'listo', label: 'Listo para Entrega' },
  { id: 'instalacion', label: 'En Instalación' },
  { id: 'completado', label: 'Completado' },
];

/**
 * Trabajos iniciales verosímiles de taller en Milagro con coordenadas reales
 * diseñados para demostrar de inmediato la detección de proximidad inteligente
 * (ej. OT-2026-104 y OT-2026-108 a ~180m de distancia en el centro de Milagro).
 */
const SEED_WORKSHOP_JOBS: InstallationWorkOrder[] = [
  {
    id: 'job-104',
    code: 'OT-2026-104',
    title: 'Lona Translúcida 3.00 × 2.00m con Bastidor Metálico',
    clientName: 'Farmacia Comunitaria Milagro',
    clientPhone: '0997078212',
    address: 'Av. 17 de Septiembre y Colón, Centro',
    referenceNotes: 'Llevar escalera de 4 cuerpos y pernos expansivos. Contactar a Ing. Morales.',
    scheduledDate: toISODate(),
    executionDate: toISODate(),
    status: 'in_progress',
    priority: 'urgente',
    area: 'taller',
    technician: 'Carlos M. (Cuadrilla 1)',
    requiresInstallation: true,
    lat: -2.1328,
    lng: -79.5912,
    specifications: { material: 'Lona 13oz Translúcida', medidas: '300 × 200 cm', acabado: 'Estructura ángulo 1 pulgada' },
  },
  {
    id: 'job-108',
    code: 'OT-2026-108',
    title: 'Letrero Cintra PVC 5mm con Vinil Laminado UV',
    clientName: 'Boutique D’Luxe',
    clientPhone: '0967872396',
    address: 'Calle Colón e/ 17 de Septiembre y Seminario (~180m de Farmacia Comunitaria)',
    referenceNotes: 'Instalación en pared frontal, altura 2.80m. Misma zona que OT-2026-104.',
    scheduledDate: toISODate(),
    executionDate: toISODate(),
    status: 'ready',
    priority: 'alta',
    area: 'taller',
    technician: 'Carlos M. (Cuadrilla 1)',
    requiresInstallation: true,
    lat: -2.1338,
    lng: -79.5922,
    specifications: { material: 'Cintra PVC 5mm', medidas: '240 × 120 cm', acabado: 'Cinta doble faz 3M y silicona' },
  },
  {
    id: 'job-112',
    code: 'OT-2026-112',
    title: 'Brandeo Microperforado y Vinil de Seguridad',
    clientName: 'Clínica Dental Sonrisas',
    clientPhone: '0981234567',
    address: 'Av. García Moreno y Seminario',
    referenceNotes: 'Limpieza profunda de cristales antes de pegar. 3 ventanales altos.',
    scheduledDate: addDaysISO(toISODate(), 1),
    executionDate: addDaysISO(toISODate(), 1),
    status: 'ready',
    priority: 'normal',
    area: 'taller',
    technician: 'Roberto T. (Cuadrilla 2)',
    requiresInstallation: true,
    lat: -2.1370,
    lng: -79.5955,
    specifications: { material: 'Vinil Microperforado 140g', medidas: '4 ventanales 150 × 200 cm', acabado: 'Sellado perimetral' },
  },
  {
    id: 'job-115',
    code: 'OT-2026-115',
    title: 'Totem Publicitario Iluminado con Letras Acrílico 3D',
    clientName: 'Distribuidora Agrícola San Pedro',
    clientPhone: '0995544332',
    address: 'Vía a Naranjito Km 2, Frente al Parque Industrial',
    referenceNotes: 'Se requiere taladro de impacto y conexión a línea de 110V exterior.',
    scheduledDate: addDaysISO(toISODate(), 2),
    executionDate: addDaysISO(toISODate(), 1),
    status: 'in_progress',
    priority: 'alta',
    area: 'taller',
    technician: 'Equipo Taller Pesado',
    requiresInstallation: true,
    lat: -2.1420,
    lng: -79.5780,
    specifications: { material: 'Acrílico 3mm + Módulos LED Samsung', medidas: '120 × 250 cm', acabado: 'Estructura tubo cuadrado' },
  },
  {
    id: 'job-119',
    code: 'OT-2026-119',
    title: 'Señalética Institucional Fotoluminiscente & Acrílico',
    clientName: 'UNEMI - Edificio de Posgrado',
    clientPhone: '0978901234',
    address: 'UNEMI, Cdla. Universitaria, Bloque B',
    referenceNotes: 'Ingreso autorizado por Garita 2. Entregar a Arq. Domínguez.',
    scheduledDate: addDaysISO(toISODate(), 3),
    executionDate: addDaysISO(toISODate(), 2),
    status: 'ready',
    priority: 'normal',
    area: 'laser',
    technician: 'Cuadrilla Señalética',
    requiresInstallation: true,
    lat: -2.1472,
    lng: -79.6018,
    specifications: { material: 'Acrílico 4mm + Fotoluminiscente 8h', medidas: '25 placas 30 × 20 cm', acabado: 'Distanciadores de acero' },
  },
  {
    id: 'job-122',
    code: 'OT-2026-122',
    title: 'Gigantografía Frontlit 6.00 × 3.00m para Valla Publicitaria',
    clientName: 'Automotores del Río',
    clientPhone: '0998877665',
    address: 'Paseo Shopping Milagro, Exteriores Parqueadero',
    referenceNotes: 'Montaje en altura a 7 metros. Requiere arnés de seguridad certificado.',
    scheduledDate: addDaysISO(toISODate(), 4),
    executionDate: addDaysISO(toISODate(), 3),
    status: 'ready',
    priority: 'urgente',
    area: 'taller',
    technician: 'Cuadrilla Altura',
    requiresInstallation: true,
    lat: -2.1285,
    lng: -79.6010,
    specifications: { material: 'Lona Frontlit 13oz Brillante', medidas: '600 × 300 cm', acabado: 'Bolsillo superior e inferior con tubo' },
  },
];

export function WorkshopBillboardCalendarPage() {
  const { organizationId, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Vista activa (cartelera, calendario, mapa)
  const [viewMode, setViewMode] = useState<ViewMode>(
    (searchParams.get('tab') as ViewMode) || 'billboard'
  );

  // Navegación semanal
  const [currentMonday, setCurrentMonday] = useState(() => getMonday());
  const [groupBy, setGroupBy] = useState<GroupByMode>('executionDate');
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('all');
  const [installationOnly, setInstallationOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Trabajos de taller en memoria
  const [jobs, setJobs] = useState<InstallationWorkOrder[]>(() => {
    try {
      const saved = localStorage.getItem('visualcorp:workshop-jobs-v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignorar errores de localStorage
    }
    return SEED_WORKSHOP_JOBS;
  });

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [pickingLocationForJob, setPickingLocationForJob] = useState<InstallationWorkOrder | null>(null);
  const [chatterTarget, setChatterTarget] = useState<{ id: string; title: string; stage: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Guardar en localStorage al modificar
  useEffect(() => {
    try {
      localStorage.setItem('visualcorp:workshop-jobs-v2', JSON.stringify(jobs));
    } catch {
      // Storage ignorado
    }
  }, [jobs]);

  // Sincronizar URL search param
  useEffect(() => {
    setSearchParams((prev) => {
      prev.set('tab', viewMode);
      return prev;
    }, { replace: true });
  }, [viewMode, setSearchParams]);

  // Cargar trabajos de Supabase si están disponibles
  const loadSupabaseJobs = useCallback(async () => {
    if (!supabase || !organizationId) return;
    setLoading(true);
    try {
      const res = await supabase.rpc('list_production_coordination_jobs', {
        p_organization_id: organizationId,
        p_limit: 50,
        p_offset: 0,
      });

      if (res.data?.items) {
        const supaJobs: InstallationWorkOrder[] = (res.data.items as any[])
          .filter((item) => item.job)
          .map((item) => {
            const j = item.job;
            const specs = (j.specifications || {}) as Record<string, any>;
            const coords = specs.installation_coordinates || specs.coordinates || {};
            const lat = Number(coords.lat || specs.lat || -2.1345);
            const lng = Number(coords.lng || specs.lng || -79.5942);

            return {
              id: j.id,
              code: j.sale_code || `OT-${j.id.slice(0, 6).toUpperCase()}`,
              title: j.title || 'Trabajo de Taller',
              clientName: j.customer_name || 'Cliente Visual Corp',
              clientPhone: j.customer_phone || '',
              address: specs.installation_address || 'Milagro, Ecuador',
              referenceNotes: specs.notes || '',
              scheduledDate: j.due_at ? j.due_at.slice(0, 10) : toISODate(),
              executionDate: j.due_at ? j.due_at.slice(0, 10) : toISODate(),
              status: j.status || 'ready',
              priority: j.priority === 'urgente' ? 'urgente' : 'normal',
              area: 'taller',
              technician: 'Equipo Taller',
              requiresInstallation: Boolean(specs.installation_required || specs.requires_installation || true),
              lat: Number.isFinite(lat) ? lat : -2.1345,
              lng: Number.isFinite(lng) ? lng : -79.5942,
              specifications: specs,
            };
          });

        if (supaJobs.length > 0) {
          // Fusionar preservando los seeds
          setJobs((current) => {
            const map = new Map(current.map((x) => [x.id, x]));
            supaJobs.forEach((sj) => map.set(sj.id, sj));
            return Array.from(map.values());
          });
        }
      }
    } catch {
      // Usar seeds en local si falla Supabase
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void loadSupabaseJobs();
  }, [loadSupabaseJobs]);

  // --- MOTOR DE PROXIMIDAD Y CLUSTERS GEOESPACIALES ---
  const proximityPairs = useMemo<ProximityPair[]>(() => {
    const installJobs = jobs.filter((j) => j.requiresInstallation);
    return detectProximityPairs(installJobs, 500); // Umbral de 500m (~5 cuadras)
  }, [jobs]);

  const proximityClusters = useMemo<ProximityCluster[]>(() => {
    const installJobs = jobs.filter((j) => j.requiresInstallation);
    return clusterJobsByProximity(installJobs, 500);
  }, [jobs]);

  // Filtro de búsqueda y área
  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return jobs.filter((job) => {
      if (areaFilter !== 'all' && job.area !== areaFilter) return false;
      if (installationOnly && !job.requiresInstallation) return false;
      if (q) {
        const matchesCode = job.code.toLowerCase().includes(q);
        const matchesTitle = job.title.toLowerCase().includes(q);
        const matchesClient = job.clientName.toLowerCase().includes(q);
        const matchesAddress = job.address.toLowerCase().includes(q);
        if (!matchesCode && !matchesTitle && !matchesClient && !matchesAddress) return false;
      }
      return true;
    });
  }, [jobs, areaFilter, installationOnly, searchQuery]);

  // Matriz semanal para la cartelera
  const weeklyMatrix = useMemo(() => {
    return Array.from({ length: 6 }, (_, index) => {
      const dateStr = addDaysISO(currentMonday, index);
      const dayJobs = filteredJobs.filter((job) => {
        const targetDate = groupBy === 'installationDate' ? job.scheduledDate : (job.executionDate || job.scheduledDate);
        return targetDate === dateStr;
      });

      return {
        date: dateStr,
        dayName: DAYS_NAMES[index],
        jobs: dayJobs,
        count: dayJobs.length,
        installationCount: dayJobs.filter((j) => j.requiresInstallation).length,
        urgentCount: dayJobs.filter((j) => j.priority === 'urgente').length,
      };
    });
  }, [currentMonday, filteredJobs, groupBy]);

  // Estadísticas globales de cabecera
  const stats = useMemo(() => {
    const totalWeekly = filteredJobs.length;
    const installations = jobs.filter((j) => j.requiresInstallation).length;
    const urgentCount = jobs.filter((j) => j.priority === 'urgente').length;
    const clustersCount = proximityClusters.length;
    return { totalWeekly, installations, urgentCount, clustersCount };
  }, [filteredJobs, jobs, proximityClusters]);

  // Avanzar etapa de trabajo con un clic
  const handleAdvanceStage = (jobId: string) => {
    setJobs((prev) =>
      prev.map((job) => {
        if (job.id !== jobId) return job;
        const currentIdx = STAGES_ORDER.findIndex((s) => s.id === job.status);
        const nextIdx = currentIdx < STAGES_ORDER.length - 1 ? currentIdx + 1 : currentIdx;
        return { ...job, status: STAGES_ORDER[nextIdx].id };
      })
    );
  };

  // Guardar ubicación actualizada
  const handleSaveLocation = (
    jobId: string,
    data: { address: string; lat: number; lng: number; referenceNotes: string }
  ) => {
    setJobs((prev) =>
      prev.map((job) => {
        if (job.id !== jobId) return job;
        return {
          ...job,
          address: data.address,
          lat: data.lat,
          lng: data.lng,
          referenceNotes: data.referenceNotes,
          requiresInstallation: true,
        };
      })
    );
  };

  // Unificar cuadrilla de par cercano
  const handleUnifyCrew = (pair: ProximityPair) => {
    const assignedTechnician = pair.jobA.technician || 'Cuadrilla Unificada Milagro';
    const targetDate = pair.jobA.scheduledDate;

    setJobs((prev) =>
      prev.map((job) => {
        if (job.id === pair.jobA.id || job.id === pair.jobB.id) {
          return {
            ...job,
            technician: assignedTechnician,
            scheduledDate: targetDate,
            executionDate: targetDate,
          };
        }
        return job;
      })
    );
  };

  // Navegación de semanas
  const handlePrevWeek = () => setCurrentMonday((prev) => addDaysISO(prev, -7));
  const handleNextWeek = () => setCurrentMonday((prev) => addDaysISO(prev, 7));
  const handleCurrentWeek = () => setCurrentMonday(getMonday());

  const todayStr = toISODate();

  return (
    <AppFrame area="operations">
      <main className="wbc-page">
        {/* Cabecera Principal */}
        <PageHeading
          eyebrow="TALLER · LOGÍSTICA & DESPACHO"
          title="Cartelera Semanal Inteligente & Calendario de Taller"
          description="Planificación semanal de fabricación, cola de armado y mapa de cuadrillas con detección automática de trabajos cercanos en Milagro para optimizar rutas de instalación."
          action={
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Link className="button button-outline" to="/operaciones/coordinacion-trabajos">
                <ChevronLeft size={15} /> Coordinación general
              </Link>
              <Link className="button button-outline" to="/operaciones/kiosk">
                <ScanLine size={15} /> Kiosk Taller
              </Link>
              <button
                className="button button-outline"
                type="button"
                onClick={() => void loadSupabaseJobs()}
                disabled={loading}
              >
                <RefreshCw size={15} /> {loading ? 'Actualizando...' : 'Actualizar'}
              </button>
            </div>
          }
        />

        {/* ------------------------------------------------------------------
            1. TARJETAS DE MÉTRICAS CON NUMBER TICKER & SPOTLIGHT
            ------------------------------------------------------------------ */}
        <section className="wbc-stats-grid" aria-label="Métricas de Taller">
          <article className="wbc-stat-card" onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight}>
            <SpotlightLayer />
            <div className="wbc-stat-icon" style={{ background: '#e0e7ff', color: '#4338ca' }}>
              <Hammer size={22} />
            </div>
            <div className="wbc-stat-content">
              <h4>Trabajos Filtrados</h4>
              <div className="wbc-stat-value">
                <NumberTicker value={stats.totalWeekly} />
              </div>
              <p className="wbc-stat-note">En cartelera actual</p>
            </div>
          </article>

          <article className="wbc-stat-card" onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight}>
            <SpotlightLayer />
            <div className="wbc-stat-icon" style={{ background: '#e0f2fe', color: '#0369a1' }}>
              <Truck size={22} />
            </div>
            <div className="wbc-stat-content">
              <h4>Instalaciones en Sitio</h4>
              <div className="wbc-stat-value">
                <NumberTicker value={stats.installations} />
              </div>
              <p className="wbc-stat-note">Requieren montaje / cuadrilla</p>
            </div>
          </article>

          <article className="wbc-stat-card" onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight}>
            <SpotlightLayer />
            <div className="wbc-stat-icon" style={{ background: '#fef3c7', color: '#b45309' }}>
              <Sparkles size={22} />
            </div>
            <div className="wbc-stat-content">
              <h4>Proximidad Inteligente</h4>
              <div className="wbc-stat-value">
                <NumberTicker value={proximityPairs.length} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#b45309' }}>
                  {proximityPairs.length === 1 ? 'par cercano' : 'pares'}
                </span>
              </div>
              <p className="wbc-stat-note">Ahorro de flete detectado (&lt;500m)</p>
            </div>
          </article>

          <article className="wbc-stat-card" onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight}>
            <SpotlightLayer />
            <div className="wbc-stat-icon" style={{ background: '#fee2e2', color: '#b91c1c' }}>
              <TriangleAlert size={22} />
            </div>
            <div className="wbc-stat-content">
              <h4>Trabajos Urgentes</h4>
              <div className="wbc-stat-value">
                <NumberTicker value={stats.urgentCount} />
              </div>
              <p className="wbc-stat-note">Prioridad de taller</p>
            </div>
          </article>
        </section>

        {/* ------------------------------------------------------------------
            2. RADAR INTELIGENTE DE PROXIMIDAD GEOESPACIAL (HAVERSINE ALERTS)
            ------------------------------------------------------------------ */}
        {proximityPairs.length > 0 && (
          <section className="wbc-proximity-radar" aria-label="Alertas de proximidad de instalaciones">
            <BorderBeam colorFrom="#f59e0b" colorTo="#d97706" duration={8} />
            <div className="wbc-radar-header">
              <div className="wbc-radar-title">
                <Sparkles size={18} />
                <AnimatedShinyText>
                  Radar de Proximidad Inteligente: {proximityPairs.length} {proximityPairs.length === 1 ? 'oportunidad de optimización detectada' : 'oportunidades de optimización detectadas'} en Milagro
                </AnimatedShinyText>
              </div>
              <button
                type="button"
                className="button button-outline"
                style={{ fontSize: '11.5px', padding: '4px 10px' }}
                onClick={() => setViewMode('map')}
              >
                <MapPin size={13} /> Ver conexiones en mapa
              </button>
            </div>

            <div className="wbc-radar-grid">
              {proximityPairs.map((pair, idx) => (
                <div key={idx} className="wbc-radar-item">
                  <div className="wbc-radar-item-info">
                    <div>
                      <b>{pair.jobA.code}</b> ({pair.jobA.clientName}) ↔ <b>{pair.jobB.code}</b> ({pair.jobB.clientName})
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {pair.recommendation}
                    </div>
                  </div>

                  <div className="wbc-radar-actions">
                    <span className="wbc-radar-distance-badge">
                      📍 {formatDistance(pair.distanceMeters)}
                    </span>
                    <button
                      type="button"
                      className="button button-dark"
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                      title="Unificar cuadrilla y fecha para ambos trabajos"
                      onClick={() => handleUnifyCrew(pair)}
                    >
                      Unificar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ------------------------------------------------------------------
            3. BARRA DE HERRAMIENTAS, SELECTOR DE VISTA Y FILTROS
            ------------------------------------------------------------------ */}
        <section className="wbc-toolbar" aria-label="Controles de cartelera">
          {/* Switcher de Vistas */}
          <div className="wbc-nav-group">
            <div className="wbc-view-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'billboard'}
                className={`wbc-view-tab ${viewMode === 'billboard' ? 'is-active' : ''}`}
                onClick={() => setViewMode('billboard')}
              >
                <CalendarRange size={14} />
                <span>Cartelera Semanal</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'calendar'}
                className={`wbc-view-tab ${viewMode === 'calendar' ? 'is-active' : ''}`}
                onClick={() => setViewMode('calendar')}
              >
                <CalendarDays size={14} />
                <span>Calendario Completo</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'map'}
                className={`wbc-view-tab ${viewMode === 'map' ? 'is-active' : ''}`}
                onClick={() => setViewMode('map')}
              >
                <MapPin size={14} />
                <span>Mapa & Cuadrillas</span>
              </button>
            </div>
          </div>

          {/* Navegación Semanal (Visible en Cartelera) */}
          {viewMode === 'billboard' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="button button-outline"
                style={{ padding: '6px 10px' }}
                onClick={handlePrevWeek}
                title="Semana anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className="button button-outline"
                style={{ padding: '6px 12px', fontWeight: 800, fontSize: '12px' }}
                onClick={handleCurrentWeek}
              >
                Esta Semana
              </button>
              <button
                type="button"
                className="button button-outline"
                style={{ padding: '6px 10px' }}
                onClick={handleNextWeek}
                title="Semana siguiente"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Filtros de Agrupación, Área e Instalación */}
          <div className="wbc-filters-row">
            {viewMode === 'billboard' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b' }}>Agrupar por:</span>
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as GroupByMode)}
                  style={{
                    background: '#fff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '5px 8px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                  }}
                >
                  <option value="executionDate">📅 Fecha de Fabricación</option>
                  <option value="installationDate">🚚 Fecha de Instalación en Sitio</option>
                </select>
              </div>
            )}

            {/* Selector de Área */}
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value as AreaFilter)}
              style={{
                background: '#fff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '5px 8px',
                fontSize: '11.5px',
                fontWeight: 700,
              }}
            >
              <option value="all">Todas las áreas</option>
              <option value="taller">Armado & Taller</option>
              <option value="impresion">Impresión</option>
              <option value="sublimacion">Sublimación / DTF</option>
              <option value="laser">Corte Láser & CNC</option>
            </select>

            {/* Botón rápido solo instalaciones */}
            <button
              type="button"
              className={`button ${installationOnly ? 'button-dark' : 'button-outline'}`}
              style={{ fontSize: '11.5px', padding: '5px 10px' }}
              onClick={() => setInstallationOnly((prev) => !prev)}
            >
              <Truck size={13} /> Solo Montajes
            </button>

            {/* Buscador de texto */}
            <div style={{ position: 'relative' }}>
              <input
                type="search"
                placeholder="Buscar trabajo, cliente o calle..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '5px 10px 5px 28px',
                  fontSize: '12px',
                  width: '200px',
                }}
              />
              <Search size={13} style={{ position: 'absolute', left: '9px', top: '9px', color: '#94a3b8' }} />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------
            4. VISTA A: CARTELERA SEMANAL (WEEKLY BILLBOARD COLUMNS)
            ------------------------------------------------------------------ */}
        {viewMode === 'billboard' && (
          <section className="wbc-weekly-grid" aria-label="Cartelera semanal de producción">
            {weeklyMatrix.map((col) => {
              const isToday = col.date === todayStr;

              return (
                <div key={col.date} className={`wbc-day-column ${isToday ? 'is-today' : ''}`}>
                  {/* Cabecera de la Columna Diaria */}
                  <div className="wbc-day-header">
                    <div>
                      <div className="wbc-day-title">
                        <span>{col.dayName}</span>
                        <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>
                          {col.date.split('-').slice(1).reverse().join('/')}
                        </span>
                        {isToday && <span className="wbc-today-tag">HOY</span>}
                      </div>
                      <div className="wbc-day-metrics">
                        {col.count} {col.count === 1 ? 'trabajo' : 'trabajos'}
                        {col.installationCount > 0 && ` · 🚚 ${col.installationCount} montaje(s)`}
                      </div>
                    </div>

                    {col.urgentCount > 0 && (
                      <span
                        style={{
                          background: '#fee2e2',
                          color: '#dc2626',
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: '6px',
                        }}
                      >
                        🚨 {col.urgentCount}
                      </span>
                    )}
                  </div>

                  {/* Lista de Tarjetas del Día */}
                  <div className="wbc-day-cards">
                    {col.jobs.length === 0 ? (
                      <div className="wbc-day-empty">Sin trabajos programados</div>
                    ) : (
                      col.jobs.map((job) => {
                        const isUrgent = job.priority === 'urgente';
                        const isSelected = selectedJobId === job.id;

                        // Verificar si tiene un par cercano
                        const nearbyPair = proximityPairs.find(
                          (p) => p.jobA.id === job.id || p.jobB.id === job.id
                        );
                        const otherJob = nearbyPair ? (nearbyPair.jobA.id === job.id ? nearbyPair.jobB : nearbyPair.jobA) : null;

                        const whatsappUrl = job.clientPhone
                          ? `https://wa.me/${job.clientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                              `Hola ${job.clientName}, te saluda el taller de Visual Corp para coordinar la instalación de tu trabajo ${job.code} en ${job.address}.`
                            )}`
                          : '';

                        return (
                          <article
                            key={job.id}
                            className={`wbc-job-card ${isUrgent ? 'is-urgent' : ''} ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => setSelectedJobId(job.id)}
                          >
                            <div className="wbc-card-header">
                              <span className="wbc-card-code">{job.code}</span>
                              <span
                                className="wbc-card-area-badge"
                                style={{
                                  background: job.area === 'taller' ? '#e0e7ff' : '#f1f5f9',
                                  color: job.area === 'taller' ? '#4338ca' : '#475569',
                                }}
                              >
                                {job.area || 'TALLER'}
                              </span>
                            </div>

                            <h4 className="wbc-card-title">{job.title}</h4>
                            <p className="wbc-card-client">
                              👤 <b>{job.clientName}</b> {job.clientPhone ? `· ${job.clientPhone}` : ''}
                            </p>

                            {/* Especificaciones Técnicas */}
                            {job.specifications && (
                              <div className="wbc-card-specs">
                                {String(job.specifications.medidas || '') && (
                                  <span>📐 {String(job.specifications.medidas)}</span>
                                )}
                                {String(job.specifications.material || '') && (
                                  <span>📦 {String(job.specifications.material)}</span>
                                )}
                              </div>
                            )}

                            {/* Información de Instalación y Proximidad */}
                            {job.requiresInstallation && (
                              <div className="wbc-installation-box">
                                <div className="wbc-installation-head">
                                  <span>🚚 Requiere Instalación</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPickingLocationForJob(job);
                                    }}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#15803d',
                                      fontSize: '10.5px',
                                      fontWeight: 800,
                                      cursor: 'pointer',
                                      textDecoration: 'underline',
                                    }}
                                  >
                                    Editar mapa
                                  </button>
                                </div>
                                <div>📍 {job.address}</div>

                                {/* Indicador de Proximidad si hay otro trabajo a pocas cuadras */}
                                {nearbyPair && otherJob && (
                                  <div className="wbc-proximity-indicator">
                                    <Sparkles size={11} />
                                    <span>
                                      A {formatDistance(nearbyPair.distanceMeters)} de {otherJob.code}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Pie de Tarjeta con Asignación y Acciones */}
                            <div className="wbc-card-footer">
                              <span style={{ fontSize: '11px', color: '#64748b' }}>
                                👨‍🔧 {job.technician || 'Sin asignar'}
                              </span>

                              <div className="wbc-card-actions">
                                {whatsappUrl && (
                                  <a
                                    href={whatsappUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="wbc-btn-icon"
                                    title="Contactar por WhatsApp"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MessageCircle size={14} style={{ color: '#16a34a' }} />
                                  </a>
                                )}

                                <button
                                  type="button"
                                  className="wbc-btn-icon"
                                  title="Ver ubicación en mapa"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedJobId(job.id);
                                    setViewMode('map');
                                  }}
                                >
                                  <MapPin size={14} style={{ color: '#2563eb' }} />
                                </button>

                                <button
                                  type="button"
                                  className="button button-outline"
                                  style={{ fontSize: '10.5px', padding: '3px 8px' }}
                                  title="Avanzar a la siguiente etapa de taller"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAdvanceStage(job.id);
                                  }}
                                >
                                  <CheckCircle2 size={12} />
                                  <span>{job.status}</span>
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ------------------------------------------------------------------
            5. VISTA B: CALENDARIO COMPLETO (MONTH / AGENDA VIEW)
            ------------------------------------------------------------------ */}
        {viewMode === 'calendar' && (
          <section
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
            aria-label="Calendario de Taller"
          >
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                  Planificador Mensual de Entregas & Montajes
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                  Selecciona cualquier día para ver la carga de taller y las instalaciones programadas.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 400px) 1fr', gap: '24px' }}>
              <div>
                <Calendar
                  mode="single"
                  value={todayStr}
                  onChange={(val) => {
                    if (val) {
                      setSearchQuery(val);
                    }
                  }}
                  getDateMetadata={(date) => {
                    const key = dateToKey(date);
                    const count = jobs.filter((j) => (j.scheduledDate || j.executionDate) === key).length;
                    if (count > 0) {
                      return { badge: `${count} trab.`, className: 'has-jobs' };
                    }
                    return undefined;
                  }}
                />
              </div>

              {/* Lista del día seleccionado */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                  Trabajos Registrados ({filteredJobs.length})
                </h4>

                <div style={{ display: 'grid', gap: '8px', maxHeight: '480px', overflowY: 'auto', paddingRight: '4px' }}>
                  {filteredJobs.map((j) => (
                    <div
                      key={j.id}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>
                          {j.code} · {j.title}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          👤 {j.clientName} · 📍 {j.address}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb' }}>
                          {j.scheduledDate}
                        </span>
                        <button
                          type="button"
                          className="button button-outline"
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                          onClick={() => {
                            setSelectedJobId(j.id);
                            setViewMode('map');
                          }}
                        >
                          <MapPin size={12} /> Ver Mapa
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ------------------------------------------------------------------
            6. VISTA C: MAPA LOGÍSTICO INTERACTIVO DE CUADRILLAS (OPENSTREETMAP)
            ------------------------------------------------------------------ */}
        {viewMode === 'map' && (
          <section className="wbc-map-split-view" aria-label="Mapa de cuadrillas e instalaciones">
            {/* Barra lateral de trabajos georreferenciados */}
            <aside className="wbc-map-sidebar">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>Instalaciones en Mapa</h3>
                  <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                    {filteredJobs.filter((j) => j.requiresInstallation).length} ubicaciones en Milagro
                  </span>
                </div>

                <button
                  type="button"
                  className="button button-dark"
                  style={{ fontSize: '11px', padding: '5px 10px' }}
                  onClick={() => {
                    const firstJob = filteredJobs[0];
                    if (firstJob) setPickingLocationForJob(firstJob);
                  }}
                >
                  <Plus size={13} /> Ubicar
                </button>
              </div>

              {/* Lista de Trabajos en el Mapa */}
              <div className="wbc-map-sidebar-list">
                {filteredJobs
                  .filter((j) => j.requiresInstallation)
                  .map((job) => {
                    const isSelected = selectedJobId === job.id;
                    const inCluster = proximityClusters.some((c) => c.jobs.some((j) => j.id === job.id));

                    return (
                      <div
                        key={job.id}
                        className={`wbc-map-sidebar-card ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => setSelectedJobId(job.id)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: 900, color: '#0f172a' }}>
                            {job.code}
                          </span>
                          {inCluster && (
                            <span
                              style={{
                                background: '#fef3c7',
                                color: '#b45309',
                                fontSize: '9.5px',
                                fontWeight: 800,
                                padding: '1px 5px',
                                borderRadius: '4px',
                              }}
                            >
                              ⚡ Cluster Cercano
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginTop: '2px' }}>
                          {job.title}
                        </div>

                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                          👤 {job.clientName}
                        </div>

                        <div
                          style={{
                            fontSize: '10.5px',
                            color: '#0369a1',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            marginTop: '4px',
                          }}
                        >
                          <MapPin size={11} />
                          <span>{job.address}</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                            GPS: {job.lat.toFixed(4)}, {job.lng.toFixed(4)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPickingLocationForJob(job);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#2563eb',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            Modificar pin
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </aside>

            {/* Mapa Interactivo Leaflet con OpenStreetMap */}
            <div style={{ height: '680px', width: '100%' }}>
              <WorkshopInteractiveMap
                jobs={jobs.filter((j) => j.requiresInstallation)}
                clusters={proximityClusters}
                proximityPairs={proximityPairs}
                selectedJobId={selectedJobId}
                onSelectJob={(job) => setSelectedJobId(job.id)}
                onLocationPick={(coords) => {
                  if (selectedJobId) {
                    setJobs((prev) =>
                      prev.map((j) => (j.id === selectedJobId ? { ...j, lat: coords.lat, lng: coords.lng } : j))
                    );
                  }
                }}
              />
            </div>
          </section>
        )}

        {/* Modal de Georreferenciación y Edición de Coordenadas */}
        <LocationEditorModal
          isOpen={Boolean(pickingLocationForJob)}
          job={pickingLocationForJob}
          onClose={() => setPickingLocationForJob(null)}
          onSaveLocation={handleSaveLocation}
        />

        {/* Drawer Chatter 360° para comunicación del taller */}
        {chatterTarget && (
          <ChatterDrawer360
            open={Boolean(chatterTarget)}
            onClose={() => setChatterTarget(null)}
            recordType="job"
            recordId={chatterTarget.id}
            recordTitle={chatterTarget.title}
            recordSubtitle={`Taller · ${chatterTarget.id}`}
            recordStage={chatterTarget.stage}
          />
        )}
      </main>
    </AppFrame>
  );
}
