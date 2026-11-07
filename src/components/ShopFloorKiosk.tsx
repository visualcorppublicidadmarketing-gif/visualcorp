import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Printer,
  Scissors,
  Flame,
  Shirt,
  Layers,
  Search,
  Filter,
  ZoomIn,
  RefreshCw,
  FileText,
  Sparkles,
  X,
  Plus,
  Minus,
  Info
} from 'lucide-react';
import './shop-floor-kiosk.css';

// Safe optional access to Workspace Provider if mounted inside Visual Corp Suite
import { useWorkspace } from '../app/workspace';

export type StationId = 'all' | 'plotter' | 'taller' | 'laser' | 'sublimacion' | 'dtf';

export type MachineStatus = 'operational' | 'standby' | 'maintenance' | 'stopped';

export interface CmykLevels {
  c: number;
  m: number;
  y: number;
  k: number;
  w?: number;
}

export interface MachineInfo {
  id: string;
  name: string;
  stationId: StationId;
  status: MachineStatus;
  statusLabel: string;
  cmyk?: CmykLevels;
  mountedRoll?: {
    material: string;
    width_m: number;
    remaining_m: number;
    total_m: number;
  };
  laserParams?: {
    chillerTemp: string;
    tubePower: number;
    bedMaterial: string;
  };
  notes?: string;
}

export type JobStatus = 'queued' | 'in_progress' | 'paused' | 'completed';
export type JobSla = 'on_time' | 'urgent_today' | 'overdue';

export interface WorkOrder {
  id: string;
  saleCode: string;
  clientName: string;
  clientPhone?: string;
  title: string;
  stationId: StationId;
  machineId: string;
  width_m: number;
  height_m: number;
  area_m2: number;
  quantity: number;
  unit: string;
  material: string;
  finishes: string[];
  status: JobStatus;
  sla: JobSla;
  slaLabel: string;
  dueTime: string;
  prepressNotes: string;
  colorMode: string;
  resolution: string;
  bleed_mm: number;
  elapsedSeconds: number;
  startedAt?: string;
  pausedAt?: string;
  pauseReason?: string;
  completedAt?: string;
  isTemplate: boolean;
}

export interface ScrapRecord {
  id: string;
  jobId: string;
  clientName: string;
  stationId: StationId;
  machineId: string;
  machineName: string;
  amount: number;
  unit: 'm' | 'm2';
  reason: string;
  notes?: string;
  operator: string;
  createdAt: string;
}

const STORAGE_PRINTERS_KEY = 'visualcorp_inventory_printers';
const STORAGE_JOBS_KEY = 'visualcorp_production_jobs';
const STORAGE_SCRAPS_KEY = 'visualcorp_production_scraps';

// Centros de trabajo oficiales de Visual Corp
const STATIONS_CONFIG: Array<{
  id: StationId;
  name: string;
  shortName: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  category: string;
}> = [
  { id: 'all', name: 'Todos los Centros', shortName: 'Todos', icon: Layers, category: 'Planta Completa' },
  { id: 'plotter', name: 'Plotter Gran Formato (Lona / Vinil)', shortName: 'Plotters', icon: Printer, category: 'Impresión Industrial' },
  { id: 'taller', name: 'Taller y Acabados (Ojales / Bastidores / Rótulos)', shortName: 'Taller', icon: Scissors, category: 'Confección y Armado' },
  { id: 'laser', name: 'Corte Láser & Grabado (Acrílico / MDF / Sintra)', shortName: 'Láser', icon: Flame, category: 'Corte CNC' },
  { id: 'sublimacion', name: 'Sublimación & Confección (Uniformes / Tazas / Merch)', shortName: 'Sublimación', icon: Shirt, category: 'Textil & Regalos' },
  { id: 'dtf', name: 'Impresión DTF Textil', shortName: 'DTF', icon: Sparkles, category: 'Transfer Textil' },
];

// Parque de maquinaria oficial de Visual Corp (Milagro, Guayas)
const DEFAULT_MACHINES: MachineInfo[] = [
  {
    id: 'CHALLENGER-3200',
    name: 'Plotter Challenger FY-3200 (Gran Formato 3.20m Solvente)',
    stationId: 'plotter',
    status: 'operational',
    statusLabel: '🟢 Operativa',
    cmyk: { c: 88, m: 74, y: 92, k: 65 },
    mountedRoll: {
      material: 'Lona Frontlit 13oz Blanco Brillante',
      width_m: 3.20,
      remaining_m: 38.5,
      total_m: 50.0,
    },
    notes: 'Cabezales Seiko 508GS purgados hoy 08:00',
  },
  {
    id: 'ROLAND-SG540',
    name: 'Plotter Roland TrueVIS SG-540 (Ecosolvente 1.37m)',
    stationId: 'plotter',
    status: 'standby',
    statusLabel: '🟡 Standby',
    cmyk: { c: 62, m: 81, y: 54, k: 48 },
    mountedRoll: {
      material: 'Vinil Arlon Adhesivo Brillante',
      width_m: 1.52,
      remaining_m: 24.0,
      total_m: 50.0,
    },
    notes: 'Listo para corte y medio corte OPOS',
  },
  {
    id: 'LASER-CO2-130',
    name: 'Router Láser CNC CO2 130W (Mesa 1300×900mm)',
    stationId: 'laser',
    status: 'operational',
    statusLabel: '🟢 Operativa',
    laserParams: {
      chillerTemp: '18.5 °C',
      tubePower: 98,
      bedMaterial: 'Acrílico Cristal 3mm 122×244cm',
    },
    notes: 'Espejos alineados, óptica limpia',
  },
  {
    id: 'EPSON-F6370',
    name: 'Plotter Epson SureColor F6370 (Sublimación 1.11m)',
    stationId: 'sublimacion',
    status: 'maintenance',
    statusLabel: '🟠 En Mantenimiento',
    cmyk: { c: 35, m: 18, y: 45, k: 22 },
    mountedRoll: {
      material: 'Papel Sublimación FastDry 100g',
      width_m: 1.11,
      remaining_m: 15.0,
      total_m: 100.0,
    },
    notes: 'Mantenimiento preventivo de bomba de succión',
  },
  {
    id: 'DTF-PRESTIGE',
    name: 'Estación DTF Prestige A3+ (Doble Cabezal i1600)',
    stationId: 'dtf',
    status: 'standby',
    statusLabel: '🟡 Standby',
    cmyk: { c: 70, m: 75, y: 80, k: 68, w: 90 },
    mountedRoll: {
      material: 'Film DTF Pet Roll Premium',
      width_m: 0.33,
      remaining_m: 62.0,
      total_m: 100.0,
    },
    notes: 'Sistema de agitación de tinta blanca activado',
  },
  {
    id: 'MESA-ACABADOS-01',
    name: 'Mesa Central de Acabados, Bastidores & Ojales',
    stationId: 'taller',
    status: 'operational',
    statusLabel: '🟢 Operativa',
    notes: 'Remachadora neumática troquel #3 y vulcanizadora térmica',
  },
];

// Órdenes de trabajo realistas para Visual Corp (Milagro, Ecuador)
const INITIAL_WORK_ORDERS: WorkOrder[] = [
  {
    id: 'OT-2026-0481',
    saleCode: 'VEN-2026-0891',
    clientName: 'Carnicería El Milagreño',
    clientPhone: '0981234567',
    title: 'Lona 13oz 3.20x2.00m con ojales c/50cm para fachada',
    stationId: 'plotter',
    machineId: 'CHALLENGER-3200',
    width_m: 3.20,
    height_m: 2.00,
    area_m2: 6.40,
    quantity: 1,
    unit: 'unidad',
    material: 'Lona Frontlit 13oz Blanco Brillante',
    finishes: [
      'Ojales metálicos reforzados cada 50cm',
      'Dobladillo perimetral vulcanizado con cinta térmica',
      'Refuerzo en 4 esquinas',
    ],
    status: 'in_progress',
    sla: 'urgent_today',
    slaLabel: '🟡 Entrega Hoy (Urgente)',
    dueTime: 'Hoy 17:00',
    prepressNotes: '300 DPI CMYK · Sangría perimetral 5cm para dobladillo · Ojales marcados',
    colorMode: 'CMYK Fogra39',
    resolution: '300 DPI (1:1)',
    bleed_mm: 50,
    elapsedSeconds: 2535, // 42 min 15 seg
    isTemplate: true,
  },
  {
    id: 'OT-2026-0485',
    saleCode: 'VEN-2026-0895',
    clientName: 'Farmacia San Alejo',
    clientPhone: '0997654321',
    title: 'Banner Roll Up 85x200cm con estructura de aluminio retráctil',
    stationId: 'plotter',
    machineId: 'ROLAND-SG540',
    width_m: 0.85,
    height_m: 2.00,
    area_m2: 1.70,
    quantity: 2,
    unit: 'unidades',
    material: 'Lona Mate 13oz Anti-curvatura (No-Curl)',
    finishes: [
      'Montaje en estructura Roll Up retráctil aluminio',
      'Punteras cromadas reforzadas',
      'Funda de transporte acolchada',
    ],
    status: 'queued',
    sla: 'on_time',
    slaLabel: '🟢 En tiempo',
    dueTime: 'Mañana 12:00',
    prepressNotes: '150 DPI escala 1:1 · Margen inferior ciego 10cm para mecanismo interno',
    colorMode: 'CMYK Roland VersaWorks',
    resolution: '150 DPI',
    bleed_mm: 10,
    elapsedSeconds: 0,
    isTemplate: true,
  },
  {
    id: 'OT-2026-0488',
    saleCode: 'VEN-2026-0902',
    clientName: 'Boutique Bella',
    clientPhone: '0961122334',
    title: 'Letras volumétricas en acrílico dorado 3mm con luz indirecta',
    stationId: 'laser',
    machineId: 'LASER-CO2-130',
    width_m: 2.40,
    height_m: 0.65,
    area_m2: 1.56,
    quantity: 1,
    unit: 'juego completo',
    material: 'Acrílico Espejo Dorado 3mm + Respaldo Sintra 10mm',
    finishes: [
      'Corte láser con borde pulido a la llama',
      'Separadores de acero inoxidable 2cm',
      'Módulos LED cálido 3000K IP65',
    ],
    status: 'queued',
    sla: 'overdue',
    slaLabel: '🔴 Demorado (+24h)',
    dueTime: 'Ayer 18:00',
    prepressNotes: 'Vector AI curvas · Offset de corte compensado 0.15mm · Plantilla papel kraft',
    colorMode: 'Vectorial / DXF',
    resolution: 'Vectores 1:1',
    bleed_mm: 0,
    elapsedSeconds: 0,
    isTemplate: true,
  },
  {
    id: 'OT-2026-0492',
    saleCode: 'VEN-2026-0910',
    clientName: 'Distribuidora Los Andes',
    clientPhone: '0978899001',
    title: 'Stickers troquelados en vinil brillante con laminado UV mate',
    stationId: 'plotter',
    machineId: 'ROLAND-SG540',
    width_m: 0.08,
    height_m: 0.08,
    area_m2: 6.40,
    quantity: 1000,
    unit: 'stickers circulares',
    material: 'Vinil Adhesivo Arlon Brillante + Laminado Frío UV',
    finishes: [
      'Laminado mate anti-rayas',
      'Medio corte (Kiss Cut) con marcas OPOS',
      'Despacho en planchas de 50 unidades',
    ],
    status: 'paused',
    sla: 'urgent_today',
    slaLabel: '🟡 Entrega Hoy (Urgente)',
    dueTime: 'Hoy 16:30',
    prepressNotes: 'Trazo de corte spot CutContour · Sangría perimetral 2mm · 300 DPI',
    colorMode: 'CMYK + CutContour',
    resolution: '300 DPI',
    bleed_mm: 2,
    elapsedSeconds: 1840,
    pauseReason: 'Espera de laminado / Curado de tinta fresca',
    isTemplate: true,
  },
  {
    id: 'OT-2026-0496',
    saleCode: 'VEN-2026-0914',
    clientName: 'Club Deportivo Milagro',
    clientPhone: '0955667788',
    title: 'Camisetas sublimadas poliéster deportivo Dry-Fit institucional',
    stationId: 'sublimacion',
    machineId: 'EPSON-F6370',
    width_m: 0.60,
    height_m: 0.80,
    area_m2: 12.00,
    quantity: 25,
    unit: 'camisetas',
    material: 'Microfibra Poliéster Dry-Fit 160g',
    finishes: [
      'Sublimación total full print (frente, espalda y mangas)',
      'Cuello en V tejido rib elástico',
      'Numeración y nombres personalizados por jugador',
    ],
    status: 'queued',
    sla: 'on_time',
    slaLabel: '🟢 En tiempo',
    dueTime: 'Viernes 14:00',
    prepressNotes: 'Patrones escalados tallas S, M, L, XL · Sangría costura 1.5cm',
    colorMode: 'CMYK Epson Sublimation',
    resolution: '300 DPI',
    bleed_mm: 15,
    elapsedSeconds: 0,
    isTemplate: true,
  },
  {
    id: 'OT-2026-0501',
    saleCode: 'VEN-2026-0922',
    clientName: 'Ferretería La Central',
    clientPhone: '0987654321',
    title: 'Rótulo bastidor metálico 4.00x1.20m en lona translúcida con tubo estructural',
    stationId: 'taller',
    machineId: 'MESA-ACABADOS-01',
    width_m: 4.00,
    height_m: 1.20,
    area_m2: 4.80,
    quantity: 1,
    unit: 'estructura metálica',
    material: 'Lona Backlight Translúcida 15oz + Tubo Cuadrado 1" × 1.5mm',
    finishes: [
      'Estructura soldada MIG con fondo anticorrosivo negro',
      'Tensado perimetral con grapa neumática y cantonera aluminio',
      'Pernos de anclaje para montaje en pared exterior',
    ],
    status: 'in_progress',
    sla: 'on_time',
    slaLabel: '🟢 En tiempo',
    dueTime: 'Hoy 18:30',
    prepressNotes: 'Borde de tensado 10cm adicional por lado · Fondo translúcido',
    colorMode: 'CMYK Fogra39',
    resolution: '200 DPI',
    bleed_mm: 100,
    elapsedSeconds: 4320, // 1h 12m
    isTemplate: true,
  },
  {
    id: 'OT-2026-0504',
    saleCode: 'VEN-2026-0928',
    clientName: 'Colegio San José',
    clientPhone: '0991122445',
    title: 'DTF Textil 50 estampados escudo escolar pecho izquierdo 9x9cm',
    stationId: 'dtf',
    machineId: 'DTF-PRESTIGE',
    width_m: 0.09,
    height_m: 0.09,
    area_m2: 0.45,
    quantity: 50,
    unit: 'estampados en film',
    material: 'Film DTF Pet Premium + Poliamida termofusible fina blanca',
    finishes: [
      'Horneado y curado a 130°C por 120s',
      'Corte individual en pliegos listo para plancha térmica (160°C 15s)',
    ],
    status: 'queued',
    sla: 'on_time',
    slaLabel: '🟢 En tiempo',
    dueTime: 'Mañana 10:00',
    prepressNotes: 'Base blanca al 80% con choke de 1px · Espejo activado para transfer',
    colorMode: 'CMYK + White Layer',
    resolution: '300 DPI',
    bleed_mm: 1,
    elapsedSeconds: 0,
    isTemplate: true,
  },
];

const COMMON_SCRAP_CAUSES = [
  'Cabezal tapado / Desfase de inyectores',
  'Arruga o atasco de material en rodillos',
  'Error de archivo / Arte desactualizado',
  'Corte / Troquel desfasado (descalibre)',
  'Burbujas en laminado en frío',
  'Defecto de bobina / Material con falla de fábrica',
  'Medidas erradas de pedido / Ajuste de preprensa',
];

const COMMON_PAUSE_REASONS = [
  'Cambio de bobina / nuevo rollo de material',
  'Almuerzo / Receso del operador',
  'Limpieza y purga profunda de inyectores',
  'Espera de material o insumos en bodega',
  'Aprobación de prueba de color con el cliente',
  'Revisión mecánica o cambio de cuchilla',
];

const OPERATORS_LIST = [
  'Esteban M. (Jefe de Taller)',
  'Operador Plotter 1',
  'Operador Láser y CNC',
  'Técnico Sublimación & DTF',
  'Operador Acabados y Rótulos',
];

export interface ShopFloorKioskProps {
  initialStation?: StationId;
  onJobSelect?: (jobId: string) => void;
  className?: string;
}

export function ShopFloorKiosk({
  initialStation = 'all',
  onJobSelect,
  className = '',
}: ShopFloorKioskProps) {
  // Safe workspace reading
  let workspaceData: any = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    workspaceData = useWorkspace();
  } catch {
    workspaceData = null;
  }

  // State: Stations & Filters
  const [selectedStation, setSelectedStation] = useState<StationId>(initialStation);
  const [statusFilter, setStatusFilter] = useState<'all' | 'queued' | 'in_progress' | 'paused' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // State: Machines
  const [machines, setMachines] = useState<MachineInfo[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PRINTERS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return DEFAULT_MACHINES;
  });
  const [activeMachineId, setActiveMachineId] = useState<string>('CHALLENGER-3200');

  // State: Work Orders
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_JOBS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return INITIAL_WORK_ORDERS;
  });

  // State: Scraps
  const [scraps, setScraps] = useState<ScrapRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SCRAPS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback
    }
    return [];
  });

  // Shift & Clock
  const [currentOperator, setCurrentOperator] = useState(OPERATORS_LIST[0]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Modals State
  const [scrapModalJob, setScrapModalJob] = useState<WorkOrder | null>(null);
  const [scrapAmount, setScrapAmount] = useState<number>(1.0);
  const [scrapUnit, setScrapUnit] = useState<'m' | 'm2'>('m');
  const [scrapReason, setScrapReason] = useState<string>(COMMON_SCRAP_CAUSES[0]);
  const [scrapNotes, setScrapNotes] = useState<string>('');

  const [pauseModalJob, setPauseModalJob] = useState<WorkOrder | null>(null);
  const [selectedPauseReason, setSelectedPauseReason] = useState<string>(COMMON_PAUSE_REASONS[0]);

  const [prepressModalJob, setPrepressModalJob] = useState<WorkOrder | null>(null);
  const [machineStatusModalMachine, setMachineStatusModalMachine] = useState<MachineInfo | null>(null);
  const [showScrapsAudit, setShowScrapsAudit] = useState(false);

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
    }, 3800);
  }, []);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PRINTERS_KEY, JSON.stringify(machines));
    } catch {
      // ignore
    }
  }, [machines]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_JOBS_KEY, JSON.stringify(workOrders));
    } catch {
      // ignore
    }
  }, [workOrders]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SCRAPS_KEY, JSON.stringify(scraps));
    } catch {
      // ignore
    }
  }, [scraps]);

  // Live Clock (1 second interval)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Live Production Chronometers for running orders
  useEffect(() => {
    const interval = setInterval(() => {
      setWorkOrders((prevOrders) => {
        let changed = false;
        const next = prevOrders.map((order) => {
          if (order.status === 'in_progress') {
            changed = true;
            return {
              ...order,
              elapsedSeconds: (order.elapsedSeconds || 0) + 1,
            };
          }
          return order;
        });
        return changed ? next : prevOrders;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Format Chronometer
  const formatSeconds = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Work order actions
  const handleStartOrder = useCallback((jobId: string) => {
    setWorkOrders((prev) =>
      prev.map((order) => {
        if (order.id === jobId) {
          return {
            ...order,
            status: 'in_progress',
            startedAt: order.startedAt || new Date().toISOString(),
            pauseReason: undefined,
          };
        }
        return order;
      })
    );
    showToast(`▶ Orden ${jobId} iniciada. Cronómetro activo.`);
    if (onJobSelect) onJobSelect(jobId);
  }, [showToast, onJobSelect]);

  const handleOpenPauseModal = useCallback((order: WorkOrder) => {
    setPauseModalJob(order);
    setSelectedPauseReason(order.pauseReason || COMMON_PAUSE_REASONS[0]);
  }, []);

  const handleConfirmPause = useCallback(() => {
    if (!pauseModalJob) return;
    const jobId = pauseModalJob.id;
    setWorkOrders((prev) =>
      prev.map((order) => {
        if (order.id === jobId) {
          return {
            ...order,
            status: 'paused',
            pausedAt: new Date().toISOString(),
            pauseReason: selectedPauseReason,
          };
        }
        return order;
      })
    );
    showToast(`⏸ Orden ${jobId} pausada: ${selectedPauseReason}`);
    setPauseModalJob(null);
  }, [pauseModalJob, selectedPauseReason, showToast]);

  const handleCompleteOrder = useCallback((jobId: string) => {
    const nowStr = new Intl.DateTimeFormat('es-EC', {
      timeZone: 'America/Guayaquil',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());

    setWorkOrders((prev) =>
      prev.map((order) => {
        if (order.id === jobId) {
          return {
            ...order,
            status: 'completed',
            completedAt: new Date().toISOString(),
          };
        }
        return order;
      })
    );
    showToast(`✔ ¡Orden ${jobId} completada con éxito a las ${nowStr}!`);
  }, [showToast]);

  // Open Scrap Modal
  const handleOpenScrapModal = useCallback((order: WorkOrder) => {
    setScrapModalJob(order);
    setScrapAmount(order.width_m > 1 ? 1.0 : 0.5);
    setScrapUnit(order.width_m > 2 ? 'm' : 'm2');
    setScrapReason(COMMON_SCRAP_CAUSES[0]);
    setScrapNotes('');
  }, []);

  const handleSaveScrap = useCallback(() => {
    if (!scrapModalJob || scrapAmount <= 0) return;

    const currentMach = machines.find((m) => m.id === scrapModalJob.machineId) || machines[0];

    const newRecord: ScrapRecord = {
      id: `scrap-${Date.now()}`,
      jobId: scrapModalJob.id,
      clientName: scrapModalJob.clientName,
      stationId: scrapModalJob.stationId,
      machineId: currentMach.id,
      machineName: currentMach.name,
      amount: scrapAmount,
      unit: scrapUnit,
      reason: scrapReason,
      notes: scrapNotes.trim(),
      operator: currentOperator,
      createdAt: new Date().toISOString(),
    };

    setScraps((prev) => [newRecord, ...prev]);

    // Also deduct remaining meters from machine roll if applicable
    if (scrapUnit === 'm' && currentMach.mountedRoll) {
      setMachines((prev) =>
        prev.map((m) => {
          if (m.id === currentMach.id && m.mountedRoll) {
            const nextRemaining = Math.max(0, m.mountedRoll.remaining_m - scrapAmount);
            return {
              ...m,
              mountedRoll: {
                ...m.mountedRoll,
                remaining_m: Number(nextRemaining.toFixed(2)),
              },
            };
          }
          return m;
        })
      );
    }

    showToast(`⚠ Merma registrada: ${scrapAmount} ${scrapUnit} (${scrapReason})`);
    setScrapModalJob(null);
  }, [scrapModalJob, scrapAmount, scrapUnit, scrapReason, scrapNotes, currentOperator, machines, showToast]);

  // Quick machine status update
  const handleUpdateMachineStatus = useCallback((machineId: string, newStatus: MachineStatus) => {
    const labels: Record<MachineStatus, string> = {
      operational: '🟢 Operativa',
      standby: '🟡 Standby',
      maintenance: '🟠 En Mantenimiento',
      stopped: '🔴 Parada Técnica',
    };

    setMachines((prev) =>
      prev.map((m) => (m.id === machineId ? { ...m, status: newStatus, statusLabel: labels[newStatus] } : m))
    );
    showToast(`Estado de máquina actualizado a: ${labels[newStatus]}`);
    setMachineStatusModalMachine(null);
  }, [showToast]);

  // Station counts
  const stationCounts = useMemo(() => {
    const counts: Record<StationId, number> = {
      all: workOrders.filter((o) => o.status !== 'completed').length,
      plotter: 0,
      taller: 0,
      laser: 0,
      sublimacion: 0,
      dtf: 0,
    };
    workOrders.forEach((o) => {
      if (o.status !== 'completed' && counts[o.stationId] !== undefined) {
        counts[o.stationId] += 1;
      }
    });
    return counts;
  }, [workOrders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return workOrders.filter((order) => {
      // Station filter
      if (selectedStation !== 'all' && order.stationId !== selectedStation) {
        return false;
      }
      // Status filter
      if (statusFilter !== 'all' && order.status !== statusFilter) {
        return false;
      }
      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = order.id.toLowerCase().includes(q);
        const matchClient = order.clientName.toLowerCase().includes(q);
        const matchTitle = order.title.toLowerCase().includes(q);
        const matchMaterial = order.material.toLowerCase().includes(q);
        if (!matchId && !matchClient && !matchTitle && !matchMaterial) {
          return false;
        }
      }
      return true;
    });
  }, [workOrders, selectedStation, statusFilter, searchQuery]);

  // Shift summary metrics
  const shiftMetrics = useMemo(() => {
    const running = workOrders.filter((o) => o.status === 'in_progress').length;
    const queued = workOrders.filter((o) => o.status === 'queued').length;
    const paused = workOrders.filter((o) => o.status === 'paused').length;
    const completed = workOrders.filter((o) => o.status === 'completed').length;
    const totalAreaM2 = workOrders
      .filter((o) => o.status === 'completed' || o.status === 'in_progress')
      .reduce((sum, o) => sum + (o.area_m2 || 0), 0);
    const totalScrapM = scraps.reduce((sum, s) => (s.unit === 'm' ? sum + s.amount : sum), 0);

    return {
      running,
      queued,
      paused,
      completed,
      totalAreaM2: totalAreaM2.toFixed(1),
      totalScrapM: totalScrapM.toFixed(1),
    };
  }, [workOrders, scraps]);

  // Formatted date and time strings for Ecuador
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

  return (
    <div className={`sf-kiosk ${className}`}>
      {/* ===================================================================
          Cabecera Principal de Taller (Operador de Turno + Reloj de Ecuador)
          =================================================================== */}
      <header className="sf-header">
        <div className="sf-brand-area">
          <div className="sf-brand-badge" aria-hidden="true">
            <Printer size={24} />
          </div>
          <div className="sf-brand-info">
            <h1>
              Visual Corp · Terminal de Taller
              <span className="sf-brand-tag">MRP Kiosk v1.0</span>
            </h1>
            <p className="sf-brand-location">
              Planta de Producción · Milagro, Guayas, Ecuador · Odoo 18 MRP
            </p>
          </div>
        </div>

        <div className="sf-header-controls">
          {/* Reloj Digital en Vivo (Hora Oficial Ecuador) */}
          <div className="sf-live-clock" title="Hora de planta en Milagro, Ecuador">
            <Clock size={18} className="text-primary" />
            <span className="sf-clock-time">{formattedTime}</span>
            <span className="sf-clock-date">{formattedDate}</span>
          </div>

          {/* Operador de Turno */}
          <div
            className="sf-operator-pill"
            title="Hacer clic para cambiar operador de turno"
            onClick={() => {
              const nextIndex = (OPERATORS_LIST.indexOf(currentOperator) + 1) % OPERATORS_LIST.length;
              setCurrentOperator(OPERATORS_LIST[nextIndex]);
              showToast(`Operador de turno: ${OPERATORS_LIST[nextIndex]}`);
            }}
          >
            <span className="sf-operator-label">Operador:</span>
            <strong>{currentOperator.split(' ')[0]}</strong>
          </div>

          {/* Botón de Auditoría de Mermas */}
          <button
            type="button"
            className="sf-btn-icon-tactile"
            title="Ver historial de mermas registradas en el turno"
            onClick={() => setShowScrapsAudit(true)}
            aria-label="Auditoría de mermas"
          >
            <AlertTriangle size={20} />
          </button>

          {/* Refresco Rápido */}
          <button
            type="button"
            className="sf-btn-icon-tactile"
            title="Refrescar estado de órdenes y cola de máquinas"
            onClick={() => showToast('Cola de taller sincronizada.')}
            aria-label="Refrescar quiosco"
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </header>

      {/* ===================================================================
          Barra de Estado de Máquinas en Vivo (Plotters, Láser, Sublimación, DTF)
          =================================================================== */}
      <section className="sf-machines-bar">
        <div className="sf-machines-header">
          <div className="sf-machines-title">
            <Printer size={18} />
            <span>Monitoreo de Maquinaria en Planta ({machines.length} equipos)</span>
          </div>
          <span className="sf-machines-summary">
            Toque cualquier máquina para cambiar su estado o ver detalles de bobina y tintas
          </span>
        </div>

        <div className="sf-machines-grid">
          {machines.map((machine) => {
            const isSelected = activeMachineId === machine.id;
            return (
              <div
                key={machine.id}
                className={`sf-machine-card ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  setActiveMachineId(machine.id);
                  if (machine.stationId !== 'all') {
                    setSelectedStation(machine.stationId);
                  }
                }}
              >
                <div className="sf-machine-card-top">
                  <div className="sf-machine-name-group">
                    {machine.stationId === 'plotter' && <Printer size={16} />}
                    {machine.stationId === 'laser' && <Flame size={16} />}
                    {machine.stationId === 'sublimacion' && <Shirt size={16} />}
                    {machine.stationId === 'dtf' && <Sparkles size={16} />}
                    {machine.stationId === 'taller' && <Scissors size={16} />}
                    <span>{machine.name.split('(')[0].trim()}</span>
                  </div>

                  {/* Badge de Estado Táctil (Abre modal al tocar) */}
                  <button
                    type="button"
                    className={`sf-status-badge ${machine.status}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMachineStatusModalMachine(machine);
                    }}
                    title="Toque para cambiar el estado operativo"
                  >
                    {machine.statusLabel}
                  </button>
                </div>

                {/* Niveles CMYK para Plotters y DTF */}
                {machine.cmyk && (
                  <div className="sf-cmyk-gauge" title="Niveles de tinta de plotter">
                    <span className="sf-cmyk-label">CMYK</span>
                    <div className="sf-cmyk-bars">
                      <div className="sf-cmyk-channel">
                        <span className="sf-cmyk-letter c">C</span>
                        <div className="sf-cmyk-bar-track">
                          <div className="sf-cmyk-bar-fill c" style={{ width: `${machine.cmyk.c}%` }} />
                        </div>
                        <span className="sf-cmyk-bar-pct">{machine.cmyk.c}%</span>
                      </div>
                      <div className="sf-cmyk-channel">
                        <span className="sf-cmyk-letter m">M</span>
                        <div className="sf-cmyk-bar-track">
                          <div className="sf-cmyk-bar-fill m" style={{ width: `${machine.cmyk.m}%` }} />
                        </div>
                        <span className="sf-cmyk-bar-pct">{machine.cmyk.m}%</span>
                      </div>
                      <div className="sf-cmyk-channel">
                        <span className="sf-cmyk-letter y">Y</span>
                        <div className="sf-cmyk-bar-track">
                          <div className="sf-cmyk-bar-fill y" style={{ width: `${machine.cmyk.y}%` }} />
                        </div>
                        <span className="sf-cmyk-bar-pct">{machine.cmyk.y}%</span>
                      </div>
                      <div className="sf-cmyk-channel">
                        <span className="sf-cmyk-letter k">K</span>
                        <div className="sf-cmyk-bar-track">
                          <div className="sf-cmyk-bar-fill k" style={{ width: `${machine.cmyk.k}%` }} />
                        </div>
                        <span className="sf-cmyk-bar-pct">{machine.cmyk.k}%</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Parámetros de Router Láser */}
                {machine.laserParams && (
                  <div className="sf-roll-info">
                    <span className="sf-roll-name">
                      Chiller: <strong>{machine.laserParams.chillerTemp}</strong> · Potencia: <strong>{machine.laserParams.tubePower}%</strong>
                    </span>
                    <span className="sf-roll-meters">{machine.laserParams.bedMaterial.split(' ')[0]}</span>
                  </div>
                )}

                {/* Bobina Montada */}
                {machine.mountedRoll && (
                  <div className="sf-roll-info">
                    <span className="sf-roll-name" title={machine.mountedRoll.material}>
                      Rollo: {machine.mountedRoll.material.split(' ')[0]} {machine.mountedRoll.width_m}m
                    </span>
                    <span className="sf-roll-meters">{machine.mountedRoll.remaining_m}m rest.</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ===================================================================
          Selector Táctil de Centro de Trabajo (Estación)
          =================================================================== */}
      <nav className="sf-stations-bar" aria-label="Selector de estaciones de producción">
        {STATIONS_CONFIG.map((station) => {
          const Icon = station.icon;
          const isActive = selectedStation === station.id;
          const count = stationCounts[station.id] || 0;
          return (
            <button
              key={station.id}
              type="button"
              className={`sf-station-tab ${isActive ? 'active' : ''}`}
              onClick={() => setSelectedStation(station.id)}
            >
              <Icon size={20} />
              <span>{station.name}</span>
              <span className="sf-station-badge">{count}</span>
            </button>
          );
        })}
      </nav>

      {/* ===================================================================
          Métricas de Producción del Turno
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
            <span className="sf-metric-value">{shiftMetrics.queued}</span>
            <span className="sf-metric-label">En Cola</span>
          </div>
        </div>

        <div className="sf-metric-card">
          <div className="sf-metric-icon amber">
            <Pause size={20} />
          </div>
          <div className="sf-metric-data">
            <span className="sf-metric-value">{shiftMetrics.paused}</span>
            <span className="sf-metric-label">Pausadas</span>
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
            <span className="sf-metric-label">Área Producida</span>
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
            placeholder="Buscar por cliente, N° orden (OT-2026-...) o material..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="sf-modal-close"
              style={{ position: 'absolute', right: 4, top: 4, width: 40, height: 40 }}
              onClick={() => setSearchQuery('')}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="sf-filter-pills">
          <button
            type="button"
            className={`sf-filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            Todas ({workOrders.length})
          </button>
          <button
            type="button"
            className={`sf-filter-btn ${statusFilter === 'in_progress' ? 'active' : ''}`}
            onClick={() => setStatusFilter('in_progress')}
          >
            <Play size={14} /> En Proceso ({shiftMetrics.running})
          </button>
          <button
            type="button"
            className={`sf-filter-btn ${statusFilter === 'queued' ? 'active' : ''}`}
            onClick={() => setStatusFilter('queued')}
          >
            <Clock size={14} /> En Cola ({shiftMetrics.queued})
          </button>
          <button
            type="button"
            className={`sf-filter-btn ${statusFilter === 'paused' ? 'active' : ''}`}
            onClick={() => setStatusFilter('paused')}
          >
            <Pause size={14} /> Pausadas ({shiftMetrics.paused})
          </button>
          <button
            type="button"
            className={`sf-filter-btn ${statusFilter === 'completed' ? 'active' : ''}`}
            onClick={() => setStatusFilter('completed')}
          >
            <CheckCircle2 size={14} /> Terminadas ({shiftMetrics.completed})
          </button>
        </div>
      </div>

      {/* ===================================================================
          Rejilla de Tarjetas de Órdenes de Trabajo (Grandes y Táctiles)
          =================================================================== */}
      <main className="sf-orders-grid">
        {filteredOrders.length === 0 ? (
          <div
            style={{
              gridColumn: '1 / -1',
              padding: '3rem 1.5rem',
              textAlign: 'center',
              backgroundColor: 'var(--sf-card-bg)',
              borderRadius: 'var(--sf-radius-lg)',
              border: '2px dashed var(--sf-card-border)',
            }}
          >
            <FileText size={48} style={{ color: 'var(--sf-text-subtle)', margin: '0 auto 1rem' }} />
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 800 }}>
              No hay órdenes de trabajo en este filtro
            </h3>
            <p style={{ color: 'var(--sf-text-muted)', margin: '0 auto 1.5rem', maxWidth: '420px' }}>
              No se encontraron trabajos para la estación o término de búsqueda ingresado.
            </p>
            <button
              type="button"
              className="sf-btn-tactile sf-btn-finish"
              style={{ display: 'inline-flex', margin: '0 auto' }}
              onClick={() => {
                setSelectedStation('all');
                setStatusFilter('all');
                setSearchQuery('');
              }}
            >
              Restablecer Filtros
            </button>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const isRunning = order.status === 'in_progress';
            const isPaused = order.status === 'paused';
            const isCompleted = order.status === 'completed';

            return (
              <article
                key={order.id}
                className={`sf-card ${isRunning ? 'running' : ''} ${isPaused ? 'paused' : ''} ${
                  isCompleted ? 'completed' : ''
                }`}
              >
                {/* Cabecera de la Tarjeta */}
                <header className="sf-card-header">
                  <div className="sf-card-identity">
                    <div className="sf-card-code-row">
                      <span className="sf-card-code">{order.id}</span>
                      {order.isTemplate && (
                        <span className="sf-card-ref-badge" title="Registro de plantilla operativa">
                          📋 Referencia / Demo operativa
                        </span>
                      )}
                    </div>
                    <span className="sf-card-client">{order.clientName}</span>
                    <span className="sf-card-title">{order.title}</span>
                  </div>

                  {/* Badge SLA */}
                  <div className={`sf-sla-badge ${order.sla}`}>
                    {order.sla === 'urgent_today' && <AlertTriangle size={15} />}
                    {order.sla === 'overdue' && <AlertTriangle size={15} />}
                    {order.sla === 'on_time' && <CheckCircle2 size={15} />}
                    <span>{order.slaLabel}</span>
                  </div>
                </header>

                {/* Banner Gigante de Medidas (Legible a 2 metros de distancia) */}
                <div className="sf-measure-banner">
                  <div className="sf-measure-main">
                    <span className="sf-measure-label">Medidas de Producción</span>
                    <span className="sf-measure-dimensions">
                      {order.width_m.toFixed(2)} m × {order.height_m.toFixed(2)} m
                    </span>
                  </div>

                  <div className="sf-measure-badges">
                    <div className="sf-measure-chip">
                      <span className="sf-measure-chip-label">Superficie Total</span>
                      <span className="sf-measure-chip-val">{order.area_m2.toFixed(2)} m²</span>
                    </div>

                    <div className="sf-measure-chip">
                      <span className="sf-measure-chip-label">Tiraje</span>
                      <span className="sf-measure-chip-val">
                        {order.quantity} {order.unit}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Material y Acabados Requeridos */}
                <div className="sf-specs-box">
                  <div className="sf-material-badge">
                    <Layers size={16} />
                    <span>{order.material}</span>
                  </div>

                  <div className="sf-finishes-list">
                    {order.finishes.map((finish, idx) => (
                      <span key={idx} className="sf-finish-pill">
                        <CheckCircle2 size={13} />
                        {finish}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Miniatura de Arte con Botón de Lupa/Zoom para Preprensa */}
                <div className="sf-art-preview-strip">
                  <div className="sf-art-preview-diagram">
                    <div className="sf-art-canvas-box" title="Esquema técnico de preprensa">
                      <div className="sf-art-canvas-grommets" />
                      <span style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--sf-primary)' }}>
                        {order.width_m.toFixed(1)}×{order.height_m.toFixed(1)}m
                      </span>
                    </div>

                    <div className="sf-art-details">
                      <span className="sf-art-prepress-notes">{order.prepressNotes}</span>
                      <span className="sf-art-profile">
                        Modo: {order.colorMode} · Sangría: {order.bleed_mm}mm
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="sf-btn-zoom"
                    onClick={() => setPrepressModalJob(order)}
                    title="Ver detalles de preprensa y cotas a gran escala"
                  >
                    <ZoomIn size={16} />
                    <span>Zoom Preprensa</span>
                  </button>
                </div>

                {/* Cronómetro en Vivo */}
                <div className="sf-timer-strip">
                  <div className="sf-timer-status">
                    {isRunning && <Play size={16} className="text-success" />}
                    {isPaused && <Pause size={16} className="text-warning" />}
                    {isCompleted && <CheckCircle2 size={16} className="text-primary" />}
                    {!isRunning && !isPaused && !isCompleted && <Clock size={16} />}

                    <span>
                      {isRunning && 'EN PRODUCCIÓN VIVA'}
                      {isPaused && `PAUSADO: ${order.pauseReason || 'En espera'}`}
                      {isCompleted && `TERMINADO (${order.completedAt ? new Date(order.completedAt).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }) : 'Hoy'})`}
                      {!isRunning && !isPaused && !isCompleted && 'LISTO PARA PRODUCIR'}
                    </span>
                  </div>

                  <span className="sf-timer-digits">{formatSeconds(order.elapsedSeconds || 0)}</span>
                </div>

                {/* Controles Táctiles de Acción (Botones Grandes) */}
                <div className="sf-actions-grid">
                  {/* Botón Iniciar */}
                  <button
                    type="button"
                    className="sf-btn-tactile sf-btn-start"
                    disabled={isRunning || isCompleted}
                    onClick={() => handleStartOrder(order.id)}
                  >
                    <Play size={20} />
                    <span>{isPaused ? 'Reanudar' : '▶ Iniciar'}</span>
                  </button>

                  {/* Botón Pausar */}
                  <button
                    type="button"
                    className="sf-btn-tactile sf-btn-pause"
                    disabled={!isRunning}
                    onClick={() => handleOpenPauseModal(order)}
                  >
                    <Pause size={20} />
                    <span>⏸ Pausar</span>
                  </button>

                  {/* Botón Terminado */}
                  <button
                    type="button"
                    className="sf-btn-tactile sf-btn-finish"
                    disabled={isCompleted}
                    onClick={() => handleCompleteOrder(order.id)}
                  >
                    <CheckCircle2 size={20} />
                    <span>✔ Terminado</span>
                  </button>

                  {/* Botón Registrar Merma */}
                  <button
                    type="button"
                    className="sf-btn-tactile sf-btn-scrap"
                    onClick={() => handleOpenScrapModal(order)}
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
          Modal Táctil de Registro de Merma ("Scrap Tracking")
          =================================================================== */}
      {scrapModalJob && (
        <div className="sf-modal-overlay" onClick={() => setScrapModalJob(null)}>
          <div className="sf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sf-modal-header">
              <div className="sf-modal-title-group">
                <h2 className="sf-modal-title">
                  <AlertTriangle size={24} style={{ color: '#ef4444' }} />
                  Registro de Merma / Desperdicio
                </h2>
                <span className="sf-modal-subtitle">
                  {scrapModalJob.id} · {scrapModalJob.clientName} ({scrapModalJob.material})
                </span>
              </div>

              <button
                type="button"
                className="sf-modal-close"
                onClick={() => setScrapModalJob(null)}
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Display Numérico Gigante de la Cantidad de Merma */}
            <div className="sf-scrap-display">
              <span className="sf-scrap-number">
                {scrapAmount.toFixed(2)} {scrapUnit}
              </span>

              <div className="sf-scrap-unit-toggle">
                <button
                  type="button"
                  className={`sf-unit-btn ${scrapUnit === 'm' ? 'active' : ''}`}
                  onClick={() => setScrapUnit('m')}
                >
                  Metros Lineales (m)
                </button>
                <button
                  type="button"
                  className={`sf-unit-btn ${scrapUnit === 'm2' ? 'active' : ''}`}
                  onClick={() => setScrapUnit('m2')}
                >
                  Metros Cuadrados (m²)
                </button>
              </div>
            </div>

            {/* Incrementadores Táctiles de Acceso Rápido */}
            <div className="sf-stepper-grid">
              <button
                type="button"
                className="sf-step-btn"
                onClick={() => setScrapAmount((prev) => Math.max(0.1, Number((prev - 1.0).toFixed(2))))}
              >
                - 1.0 m
              </button>
              <button
                type="button"
                className="sf-step-btn"
                onClick={() => setScrapAmount((prev) => Math.max(0.1, Number((prev - 0.5).toFixed(2))))}
              >
                - 0.5 m
              </button>
              <button
                type="button"
                className="sf-step-btn"
                onClick={() => setScrapAmount((prev) => Number((prev + 0.5).toFixed(2)))}
              >
                + 0.5 m
              </button>
              <button
                type="button"
                className="sf-step-btn"
                onClick={() => setScrapAmount((prev) => Number((prev + 1.0).toFixed(2)))}
              >
                + 1.0 m
              </button>
              <button
                type="button"
                className="sf-step-btn"
                onClick={() => setScrapAmount((prev) => Number((prev + 2.0).toFixed(2)))}
              >
                + 2.0 m
              </button>
              <button
                type="button"
                className="sf-step-btn"
                onClick={() => setScrapAmount((prev) => Number((prev + 5.0).toFixed(2)))}
              >
                + 5.0 m
              </button>
              <button
                type="button"
                className="sf-step-btn"
                style={{ gridColumn: 'span 2', fontSize: '0.85rem' }}
                onClick={() => setScrapAmount(0.5)}
              >
                Restablecer (0.5m)
              </button>
            </div>

            {/* Selector Táctil de Causas de Merma */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  color: 'var(--sf-text-muted)',
                  marginBottom: '0.5rem',
                }}
              >
                Causa del Desperdicio
              </label>
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

            {/* Observación Opcional */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  color: 'var(--sf-text-muted)',
                  marginBottom: '0.4rem',
                }}
              >
                Nota del Operador (Opcional)
              </label>
              <input
                type="text"
                className="sf-search-input"
                placeholder="Ej. Inyectores cian fallaron a la mitad del paño..."
                value={scrapNotes}
                onChange={(e) => setScrapNotes(e.target.value)}
              />
            </div>

            {/* Botón de Confirmación Táctil Grande */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <button
                type="button"
                className="sf-btn-tactile sf-btn-finish"
                style={{ backgroundColor: 'var(--sf-card-border)', color: 'var(--sf-text-main)' }}
                onClick={() => setScrapModalJob(null)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="sf-btn-tactile sf-btn-start"
                style={{ background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' }}
                onClick={handleSaveScrap}
              >
                <AlertTriangle size={20} />
                <span>Confirmar Merma</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          Modal Táctil de Pausa de Producción
          =================================================================== */}
      {pauseModalJob && (
        <div className="sf-modal-overlay" onClick={() => setPauseModalJob(null)}>
          <div className="sf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sf-modal-header">
              <div className="sf-modal-title-group">
                <h2 className="sf-modal-title">
                  <Pause size={24} style={{ color: '#d97706' }} />
                  Seleccionar Motivo de Pausa
                </h2>
                <span className="sf-modal-subtitle">
                  {pauseModalJob.id} · {pauseModalJob.clientName}
                </span>
              </div>

              <button
                type="button"
                className="sf-modal-close"
                onClick={() => setPauseModalJob(null)}
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
                  onClick={() => setSelectedPauseReason(reason)}
                >
                  <span style={{ fontSize: '1.1rem' }}>
                    {selectedPauseReason === reason ? '✔' : '○'}
                  </span>
                  <span>{reason}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="sf-btn-tactile"
                style={{ backgroundColor: 'var(--sf-card-border)', color: 'var(--sf-text-main)' }}
                onClick={() => setPauseModalJob(null)}
              >
                Volver
              </button>

              <button
                type="button"
                className="sf-btn-tactile sf-btn-pause"
                onClick={handleConfirmPause}
              >
                <Pause size={20} />
                <span>Confirmar Pausa</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          Modal de Inspección de Preprensa (Zoom & Cotas Técnicas)
          =================================================================== */}
      {prepressModalJob && (
        <div className="sf-modal-overlay" onClick={() => setPrepressModalJob(null)}>
          <div className="sf-modal large" onClick={(e) => e.stopPropagation()}>
            <div className="sf-modal-header">
              <div className="sf-modal-title-group">
                <h2 className="sf-modal-title">
                  <ZoomIn size={24} style={{ color: 'var(--sf-primary)' }} />
                  Inspección de Preprensa & Cotas Técnicas
                </h2>
                <span className="sf-modal-subtitle">
                  {prepressModalJob.id} · {prepressModalJob.title}
                </span>
              </div>

              <button
                type="button"
                className="sf-modal-close"
                onClick={() => setPrepressModalJob(null)}
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className="sf-prepress-view">
              {/* Blueprint Técnico */}
              <div className="sf-prepress-blueprint">
                <span className="sf-blueprint-dim-top">
                  ↔ ANCHO: {prepressModalJob.width_m.toFixed(2)} m (
                  {(prepressModalJob.width_m * 100).toFixed(0)} cm)
                </span>
                <span className="sf-blueprint-dim-left">
                  ↕ ALTO: {prepressModalJob.height_m.toFixed(2)} m (
                  {(prepressModalJob.height_m * 100).toFixed(0)} cm)
                </span>

                <div className="sf-blueprint-art">
                  <div className="sf-blueprint-bleed-mark" />
                  <span>ÁREA IMPRESA: {prepressModalJob.area_m2.toFixed(2)} m²</span>
                </div>
              </div>

              {/* Especificaciones Técnicas de Preprensa */}
              <div className="sf-prepress-meta-grid">
                <div className="sf-prepress-meta-card">
                  <span className="sf-prepress-meta-title">Perfil de Color</span>
                  <span className="sf-prepress-meta-val">{prepressModalJob.colorMode}</span>
                </div>

                <div className="sf-prepress-meta-card">
                  <span className="sf-prepress-meta-title">Resolución Escala</span>
                  <span className="sf-prepress-meta-val">{prepressModalJob.resolution}</span>
                </div>

                <div className="sf-prepress-meta-card">
                  <span className="sf-prepress-meta-title">Sangría Perimetral</span>
                  <span className="sf-prepress-meta-val">{prepressModalJob.bleed_mm} mm</span>
                </div>

                <div className="sf-prepress-meta-card">
                  <span className="sf-prepress-meta-title">SLA / Vencimiento</span>
                  <span className="sf-prepress-meta-val">{prepressModalJob.dueTime}</span>
                </div>
              </div>

              {/* Acabados requeridos */}
              <div
                style={{
                  backgroundColor: 'var(--sf-bg)',
                  padding: '1rem',
                  borderRadius: 'var(--sf-radius-md)',
                  border: '1px solid var(--sf-card-border)',
                }}
              >
                <strong style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                  Acabados y Confección:
                </strong>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--sf-text-muted)' }}>
                  {prepressModalJob.finishes.map((f, i) => (
                    <li key={i} style={{ marginBottom: '0.25rem' }}>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                className="sf-btn-tactile sf-btn-finish"
                onClick={() => setPrepressModalJob(null)}
              >
                Entendido / Cerrar Vista
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          Modal de Cambio de Estado de Máquina
          =================================================================== */}
      {machineStatusModalMachine && (
        <div className="sf-modal-overlay" onClick={() => setMachineStatusModalMachine(null)}>
          <div className="sf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sf-modal-header">
              <div className="sf-modal-title-group">
                <h2 className="sf-modal-title">
                  <Printer size={24} style={{ color: 'var(--sf-primary)' }} />
                  Estado de {machineStatusModalMachine.name.split('(')[0].trim()}
                </h2>
                <span className="sf-modal-subtitle">
                  Seleccione el estado operativo actual de la máquina
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
              <button
                type="button"
                className="sf-btn-tactile"
                style={{
                  backgroundColor: 'var(--sf-success-soft)',
                  color: 'var(--sf-success-text)',
                  border: '1.5px solid rgba(22, 163, 74, 0.4)',
                }}
                onClick={() => handleUpdateMachineStatus(machineStatusModalMachine.id, 'operational')}
              >
                🟢 Operativa (Produciendo o lista para imprimir)
              </button>

              <button
                type="button"
                className="sf-btn-tactile"
                style={{
                  backgroundColor: 'var(--sf-warning-soft)',
                  color: 'var(--sf-warning-text)',
                  border: '1.5px solid rgba(217, 119, 6, 0.4)',
                }}
                onClick={() => handleUpdateMachineStatus(machineStatusModalMachine.id, 'standby')}
              >
                🟡 Standby (En reposo / Esperando archivo)
              </button>

              <button
                type="button"
                className="sf-btn-tactile"
                style={{
                  backgroundColor: '#ffedd5',
                  color: '#c2410c',
                  border: '1.5px solid rgba(194, 65, 12, 0.4)',
                }}
                onClick={() => handleUpdateMachineStatus(machineStatusModalMachine.id, 'maintenance')}
              >
                🟠 En Mantenimiento (Purga, limpieza o calibración)
              </button>

              <button
                type="button"
                className="sf-btn-tactile"
                style={{
                  backgroundColor: 'var(--sf-danger-soft)',
                  color: 'var(--sf-danger-text)',
                  border: '1.5px solid rgba(220, 38, 38, 0.4)',
                }}
                onClick={() => handleUpdateMachineStatus(machineStatusModalMachine.id, 'stopped')}
              >
                🔴 Parada Técnica (Avería o falta de repuesto)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          Modal de Auditoría de Mermas del Turno
          =================================================================== */}
      {showScrapsAudit && (
        <div className="sf-modal-overlay" onClick={() => setShowScrapsAudit(false)}>
          <div className="sf-modal large" onClick={(e) => e.stopPropagation()}>
            <div className="sf-modal-header">
              <div className="sf-modal-title-group">
                <h2 className="sf-modal-title">
                  <AlertTriangle size={24} style={{ color: '#ef4444' }} />
                  Auditoría de Mermas Registradas ({scraps.length})
                </h2>
                <span className="sf-modal-subtitle">
                  Registro para control de costos y calidad de Visual Corp
                </span>
              </div>

              <button
                type="button"
                className="sf-modal-close"
                onClick={() => setShowScrapsAudit(false)}
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            </div>

            {scraps.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <CheckCircle2 size={40} style={{ color: 'var(--sf-success)', margin: '0 auto 0.75rem' }} />
                <p style={{ margin: 0, fontWeight: 700 }}>¡Excelente! No hay mermas registradas en este turno.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: '420px', overflowY: 'auto' }}>
                {scraps.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.85rem 1rem',
                      borderRadius: 'var(--sf-radius-md)',
                      backgroundColor: 'var(--sf-bg)',
                      border: '1px solid var(--sf-card-border)',
                      gap: '0.75rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '1rem', color: '#ef4444', marginRight: '0.5rem' }}>
                        {s.amount.toFixed(2)} {s.unit}
                      </strong>
                      <span style={{ fontWeight: 700 }}>{s.reason}</span>
                      <div style={{ fontSize: '0.8rem', color: 'var(--sf-text-muted)', marginTop: '0.2rem' }}>
                        OT: {s.jobId} ({s.clientName}) · Operador: {s.operator}
                        {s.notes && ` · Nota: "${s.notes}"`}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--sf-text-subtle)' }}>
                      {new Date(s.createdAt).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              className="sf-btn-tactile sf-btn-finish"
              onClick={() => setShowScrapsAudit(false)}
            >
              Cerrar Auditoría
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================
          Toast Feedback Táctil de Operación
          =================================================================== */}
      {toastMessage && (
        <div className="sf-toast" role="status">
          <Info size={18} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default ShopFloorKiosk;
