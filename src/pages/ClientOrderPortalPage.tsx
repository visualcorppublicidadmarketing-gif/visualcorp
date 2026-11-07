import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useWorkspace, formatMoney, formatDate } from '../app/workspace';
import {
  Search,
  Check,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Eye,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Printer,
  Scissors,
  FileText,
  Package,
  Truck,
  ShieldCheck,
  MessageSquare,
  Send,
  RefreshCw,
  Layers,
  Activity,
  FileCheck2,
  User,
  Calendar,
  MapPin,
  Share2,
  ChevronRight,
  Info,
  X,
  ThumbsUp,
  Edit3,
  Download,
  Lock,
  Phone,
  Building2,
  SlidersHorizontal,
} from 'lucide-react';
import './ClientOrderPortalPage.css';

// ============================================================================
// Tipos & Modelos de Datos del Portal de Seguimiento y Aprobación
// ============================================================================

export interface PortalOrderItem {
  id: string;
  name: string;
  description: string;
  material: string;
  dimensions: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface PortalOrderProof {
  id: string;
  title: string;
  version: string;
  dimensions: string;
  materials: string;
  colorProfile: string;
  scaleNote: string;
  previewUrl?: string;
  vectorType?: 'rotulo_led' | 'lona_banner' | 'textil_sublimacion';
  uploadedAt: string;
  designer: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  approvalChecklist?: {
    spelling: boolean;
    dimensions: boolean;
    colors: boolean;
  };
  feedback?: string;
  status: 'pendiente_revision' | 'aprobado' | 'cambios_solicitados';
}

export interface PortalChatterEvent {
  id: string;
  timestamp: string;
  author: string;
  role: string;
  content: string;
  type: 'system' | 'designer' | 'approval' | 'revision' | 'client_message';
}

export interface PortalOrder {
  code: string;
  id: string;
  title: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerCompany?: string;
  currentStage: number; // 1 to 6
  stageName: string;
  stageStatus: 'en_proceso' | 'aprobacion_pendiente' | 'cambios_solicitados' | 'completado';
  responsibleArea: string;
  responsibleAdvisor: string;
  branch: string;
  createdAt: string;
  updatedAt?: string;
  estimatedDelivery: string;
  financials: {
    total: number;
    paid: number;
    balance: number;
    paymentStatus: 'pagado' | 'abonado' | 'pendiente';
    method?: string;
  };
  items: PortalOrderItem[];
  proof: PortalOrderProof;
  chatter: PortalChatterEvent[];
  isDemo?: boolean;
}

// Claves de Almacenamiento Local
const STORAGE_PORTAL_ORDERS_KEY = 'vc-enterprise-portal-orders-v1';
const STORAGE_PORTAL_CHATTER_KEY = 'vc-enterprise-chatter-v1';
const STORAGE_VAULT_KEY = 'vc-enterprise-vault-v1';

// Etapas estándar de producción en Visual Corp
const STAGES_CONFIG = [
  {
    step: 1,
    id: 'orden_recibida',
    title: '1. Orden Recibida',
    subtitle: 'Registro & Asignación',
    desc: 'Orden confirmada, pago de anticipo validado y ficha técnica aperturada.',
    icon: FileText,
    area: 'Administración & POS',
  },
  {
    step: 2,
    id: 'diseno_preprensa',
    title: '2. Diseño y Preprensa',
    subtitle: 'Vectorización & Pre-vuelo',
    desc: 'Elaboración de boceto a escala, revisión de fuentes y curvas CMYK.',
    icon: Scissors,
    area: 'Taller de Diseño',
  },
  {
    step: 3,
    id: 'aprobacion_arte',
    title: '3. Aprobación de Arte',
    subtitle: 'Firma Digital en 1 Clic',
    desc: 'Visto bueno del cliente en medidas, textos y colores antes del envío a máquinas.',
    icon: FileCheck2,
    area: 'Portal del Cliente',
  },
  {
    step: 4,
    id: 'impresion_taller',
    title: '4. Impresión / Taller',
    subtitle: 'Producción en Máquinas',
    desc: 'Impresión gran formato, corte láser/CNC, armado acrílico o confección.',
    icon: Printer,
    area: 'Taller Central Milagro',
  },
  {
    step: 5,
    id: 'control_calidad',
    title: '5. Control de Calidad',
    subtitle: 'Inspección de Salida',
    desc: 'Verificación de tolerancias, encendido de LEDs, fijaciones y embalaje.',
    icon: ShieldCheck,
    area: 'Control de Calidad',
  },
  {
    step: 6,
    id: 'listo_entrega',
    title: '6. Listo para Entrega',
    subtitle: 'Despacho o Instalación',
    desc: 'Disponible para retiro en mostrador o cuadrilla técnica en ruta a tu local.',
    icon: Package,
    area: 'Logística & Despacho',
  },
];

// Órdenes base realistas de muestra para demostración inmediata
const SHOWCASE_ORDERS: PortalOrder[] = [
  {
    code: 'VC-OT-2026-104',
    id: 'ord-104',
    title: 'Rótulo Luminoso 3D + Vinil Microperforado Fachada',
    customerName: 'Dra. Elena Villacreses',
    customerCompany: 'Clínica Dental Milagro',
    customerPhone: '0984123456',
    customerEmail: 'contacto@clinicavillacreses.ec',
    currentStage: 3,
    stageName: '3. Aprobación de Arte',
    stageStatus: 'aprobacion_pendiente',
    responsibleArea: 'Diseño y Preprensa',
    responsibleAdvisor: 'Esteban Gavilanes (Preprensa Técnica)',
    branch: 'Visual Corp · Matriz Milagro (Juan Montalvo & 9 de Octubre)',
    createdAt: '2026-11-05T09:30:00Z',
    estimatedDelivery: '2026-11-10T17:00:00Z',
    financials: {
      total: 460.2,
      paid: 250.0,
      balance: 210.2,
      paymentStatus: 'abonado',
      method: 'Transferencia Banco Pichincha',
    },
    items: [
      {
        id: 'item-104-1',
        name: 'Rótulo Luminoso Acrílico 3D con Luz Neón LED Frontal',
        description: 'Caja luminosa de perfil de aluminio reforzado lacado negro mate, letras corporeas acrílico blanco opal 3mm con luz LED blanca 6500K y logotipo en tono cyan corporativo.',
        material: 'Acrílico 3mm + Neón LED IP67 + Transformador 12V 20A',
        dimensions: '240 cm × 80 cm',
        quantity: 1,
        unit: 'unidad',
        unitPrice: 280.0,
        total: 280.0,
      },
      {
        id: 'item-104-2',
        name: 'Vinil Microperforado UV Alta Resolución Fachada',
        description: 'Impresión UV con filtro de protección solar 70% visibilidad interna para mampara y ventanal frontal. Incluye horarios de atención y teléfonos de emergencia.',
        material: 'Vinil Microperforado 140g + Tintas UV Curables',
        dimensions: '400 cm × 180 cm (7.20 m²)',
        quantity: 7.2,
        unit: 'm²',
        unitPrice: 16.0,
        total: 115.2,
      },
      {
        id: 'item-104-3',
        name: 'Servicio de Montaje e Instalación Eléctrica en Altura',
        description: 'Instalación con anclaje químico en fachada, cableado vulcanizado y conexión a llave térmica independiente en local.',
        material: 'Pernos de expansión + Cable vulcanizado #14',
        dimensions: 'Altura 3.80 m',
        quantity: 1,
        unit: 'servicio',
        unitPrice: 65.0,
        total: 65.0,
      },
    ],
    proof: {
      id: 'proof-104',
      title: 'Fotomontaje & Boceto Escala 1:10 · Rótulo Dental Villacreses',
      version: 'v2',
      dimensions: '240 cm × 80 cm (Rótulo) + 400 cm × 180 cm (Ventanal)',
      materials: 'Acrílico Opal 3mm + Módulo Neón LED + Vinil Microperforado UV',
      colorProfile: 'CMYK / Pantone 312 C (Cyan Médico) & White LED 6500K',
      scaleNote: 'Escala 1:10 · Curvas de corte CNC validadas · Sangría perimetral 2cm',
      vectorType: 'rotulo_led',
      uploadedAt: '2026-11-06T14:15:00Z',
      designer: 'Esteban Gavilanes',
      status: 'pendiente_revision',
    },
    chatter: [
      {
        id: 'chat-1',
        timestamp: '2026-11-05T09:30:00Z',
        author: 'Sistema POS Visual Corp',
        role: 'Sistema',
        content: 'Orden de trabajo generada con anticipo del 54% ($250.00). Documento asignado a Taller de Preprensa.',
        type: 'system',
      },
      {
        id: 'chat-2',
        timestamp: '2026-11-05T15:20:00Z',
        author: 'Esteban Gavilanes',
        role: 'Diseño & Preprensa',
        content: 'Vectorización del isotipo dental finalizada. Se enviaron las tolerancias de calado para fresadora CNC.',
        type: 'designer',
      },
      {
        id: 'chat-3',
        timestamp: '2026-11-06T14:15:00Z',
        author: 'Esteban Gavilanes',
        role: 'Diseño & Preprensa',
        content: 'Se cargó el boceto V2 con la corrección en el tono cyan solicitada por la Dra. Elena. Queda pendiente la aprobación digital del cliente para corte inmediato.',
        type: 'designer',
      },
    ],
    isDemo: true,
  },
  {
    code: 'VC-OT-2026-108',
    id: 'ord-108',
    title: 'Lona Gran Formato 3.20m + Roll Up Corporativo',
    customerName: 'Ing. Roberto Alvarado',
    customerCompany: 'AgroComercial San José',
    customerPhone: '0991234567',
    customerEmail: 'compras@agrosanjose.com.ec',
    currentStage: 4,
    stageName: '4. Impresión / Taller',
    stageStatus: 'en_proceso',
    responsibleArea: 'Impresión Gran Formato',
    responsibleAdvisor: 'Operador Plotter Mimaki 3.20m',
    branch: 'Visual Corp · Taller Central Milagro',
    createdAt: '2026-11-06T11:00:00Z',
    estimatedDelivery: '2026-11-09T14:00:00Z',
    financials: {
      total: 144.8,
      paid: 144.8,
      balance: 0.0,
      paymentStatus: 'pagado',
      method: 'Efectivo en Mostrador',
    },
    items: [
      {
        id: 'item-108-1',
        name: 'Lona Frontlit Reforzada 13oz Impresión 3.20m × 2.00m',
        description: 'Impresión eco-solvente de alta durabilidad exterior, dobladillo perimetral vulcanizado y ojales metálicos cada 50cm.',
        material: 'Lona Banner 13oz Brillo + Ojales Zincados #3',
        dimensions: '320 cm × 200 cm (6.40 m²)',
        quantity: 6.4,
        unit: 'm²',
        unitPrice: 9.5,
        total: 60.8,
      },
      {
        id: 'item-108-2',
        name: 'Roll Up Banner de Aluminio 85cm × 200cm',
        description: 'Estructura retráctil importada con base de aluminio reforzada, impresión en película Pet Film mate anti-reflejo y bolso de lona acolchado.',
        material: 'Pet Film 220 micras + Estructura Roll Up Aluminio',
        dimensions: '85 cm × 200 cm',
        quantity: 2,
        unit: 'unidad',
        unitPrice: 42.0,
        total: 84.0,
      },
    ],
    proof: {
      id: 'proof-108',
      title: 'Arte Final Gran Formato AgroComercial V1',
      version: 'v1',
      dimensions: '320 cm × 200 cm (Lona) + 85 cm × 200 cm (Roll Up)',
      materials: 'Lona 13oz Brillo Eco-Solvente + Pet Film Roll Up',
      colorProfile: 'CMYK FOGRA39 / 1440 DPI Ultra HD',
      scaleNote: 'Resolución a tamaño real: 150 DPI · Sangría de doblado: 5 cm',
      vectorType: 'lona_banner',
      uploadedAt: '2026-11-06T15:00:00Z',
      designer: 'Preprensa Visual Corp',
      approvedAt: '2026-11-06T16:20:00Z',
      approvedBy: 'Ing. Roberto Alvarado',
      approvalChecklist: { spelling: true, dimensions: true, colors: true },
      status: 'aprobado',
    },
    chatter: [
      {
        id: 'chat-108-1',
        timestamp: '2026-11-06T11:00:00Z',
        author: 'Sistema POS',
        role: 'Sistema',
        content: 'Orden cancelada al 100% en caja. Archivos originales verificados.',
        type: 'system',
      },
      {
        id: 'chat-108-2',
        timestamp: '2026-11-06T16:20:00Z',
        author: 'Ing. Roberto Alvarado',
        role: 'Cliente (Aprobación)',
        content: '✅ Arte aprobado digitalmente por el cliente con medidas y textos revisados.',
        type: 'approval',
      },
      {
        id: 'chat-108-3',
        timestamp: '2026-11-06T16:30:00Z',
        author: 'Operador Plotter Mimaki',
        role: 'Taller',
        content: 'Archivo cargado en el RIP de impresión. Orden encolada en cabezal de gran formato.',
        type: 'designer',
      },
    ],
    isDemo: true,
  },
  {
    code: 'VC-OT-2026-112',
    id: 'ord-112',
    title: 'Pack Sublimación 50 Camisetas + 36 Tazas Mágicas',
    customerName: 'Lcda. Mónica Zambrano',
    customerCompany: 'Unidad Educativa Milagro',
    customerPhone: '0995551234',
    customerEmail: 'monica.zambrano@uemilagro.edu.ec',
    currentStage: 2,
    stageName: '2. Diseño y Preprensa',
    stageStatus: 'en_proceso',
    responsibleArea: 'Sublimación & Textil',
    responsibleAdvisor: 'Área Textil Visual Corp',
    branch: 'Visual Corp · Matriz Milagro',
    createdAt: '2026-11-07T08:15:00Z',
    estimatedDelivery: '2026-11-12T16:00:00Z',
    financials: {
      total: 555.0,
      paid: 300.0,
      balance: 255.0,
      paymentStatus: 'abonado',
      method: 'Transferencia Guayaquil',
    },
    items: [
      {
        id: 'item-112-1',
        name: 'Camisetas Deportivas Sublimación Full Color Frente/Espalda',
        description: 'Confección en tela microfibra dry-fit tacto suave con diseño integral conmemorativo de graduación.',
        material: 'Microfibra Poliéster 160g + Tintas Epson SubliHD',
        dimensions: 'Tallas S (15), M (25), L (10)',
        quantity: 50,
        unit: 'unidad',
        unitPrice: 7.5,
        total: 375.0,
      },
      {
        id: 'item-112-2',
        name: 'Tazas Cerámica Mágicas 11oz Negro Brillante',
        description: 'Tazas sublimadas que revelan el diseño institucional al verter líquido caliente.',
        material: 'Cerámica AAA Grado Alimentario + Polímero Térmico',
        dimensions: '11 oz (21 cm × 9.5 cm de área imprimible)',
        quantity: 36,
        unit: 'unidad',
        unitPrice: 5.0,
        total: 180.0,
      },
    ],
    proof: {
      id: 'proof-112',
      title: 'Muestra Digital Sublimación Textil & Tazas Promoción 2026',
      version: 'v1',
      dimensions: 'Formato A3 Sublimación + 21 cm × 9.5 cm (Tazas)',
      materials: 'Papel Sublimación Koreano 100g + Cerámica Térmica',
      colorProfile: 'RGB Perfil Epson HD Subli / Pantone 286 C',
      scaleNote: 'Plantilla de corte textil calibrada · Termofijado 200°C 45 seg',
      vectorType: 'textil_sublimacion',
      uploadedAt: '2026-11-07T09:00:00Z',
      designer: 'Taller de Sublimación',
      status: 'pendiente_revision',
    },
    chatter: [
      {
        id: 'chat-112-1',
        timestamp: '2026-11-07T08:15:00Z',
        author: 'Sistema POS',
        role: 'Sistema',
        content: 'Anticipo de $300.00 confirmado. Listado de nombres y tallas recibido correctamente.',
        type: 'system',
      },
      {
        id: 'chat-112-2',
        timestamp: '2026-11-07T09:10:00Z',
        author: 'Área Textil Visual Corp',
        role: 'Diseño',
        content: 'Boceto inicial en composición para validar ortografía de los 50 estudiantes antes de planchar.',
        type: 'designer',
      },
    ],
    isDemo: true,
  },
];

// ============================================================================
// Funciones Auxiliares de Persistencia y Búsqueda
// ============================================================================

function readPersistedOrders(): Record<string, PortalOrder> {
  try {
    const raw = localStorage.getItem(STORAGE_PORTAL_ORDERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

function savePersistedOrders(orders: Record<string, PortalOrder>) {
  try {
    localStorage.setItem(STORAGE_PORTAL_ORDERS_KEY, JSON.stringify(orders));
  } catch (err) {
    console.error('Error al guardar órdenes del portal en localStorage:', err);
  }
}

function readPersistedChatter(): Record<string, PortalChatterEvent[]> {
  try {
    const raw = localStorage.getItem(STORAGE_PORTAL_CHATTER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

function savePersistedChatter(chatterMap: Record<string, PortalChatterEvent[]>) {
  try {
    localStorage.setItem(STORAGE_PORTAL_CHATTER_KEY, JSON.stringify(chatterMap));
  } catch (err) {
    console.error('Error al guardar historial de chatter:', err);
  }
}

// ============================================================================
// Componente de Simulación Visual de Boceto Digital (SVG Engine Ultra-HD)
// ============================================================================

interface VectorPreviewSimulationProps {
  type?: 'rotulo_led' | 'lona_banner' | 'textil_sublimacion';
  showAnnotations: boolean;
  zoom: number;
}

function VectorPreviewSimulation({ type = 'rotulo_led', showAnnotations, zoom }: VectorPreviewSimulationProps) {
  if (type === 'rotulo_led') {
    return (
      <div className="vc-portal-svg-canvas" style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
        <svg viewBox="0 0 960 480" className="vc-portal-svg-art" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="wallGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e2430" />
              <stop offset="50%" stopColor="#151922" />
              <stop offset="100%" stopColor="#0c0e15" />
            </linearGradient>
            <linearGradient id="acrylicGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#e2e8f0" />
            </linearGradient>
            <linearGradient id="cyanNeon" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="50%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#0ea5e9" />
            </linearGradient>
            <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="acrylicShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="3" dy="6" stdDeviation="6" floodColor="#000000" floodOpacity="0.75" />
            </filter>
            <pattern id="microperfPattern" width="6" height="6" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="1.2" fill="rgba(0,0,0,0.6)" />
            </pattern>
          </defs>

          {/* Fachada del Local */}
          <rect width="960" height="480" fill="url(#wallGradient)" />

          {/* Líneas de estructura de fachada */}
          <line x1="80" y1="20" x2="80" y2="460" stroke="#2a3245" strokeWidth="2" strokeDasharray="6,6" />
          <line x1="880" y1="20" x2="880" y2="460" stroke="#2a3245" strokeWidth="2" strokeDasharray="6,6" />

          {/* Caja del Rótulo Luminoso */}
          <g filter="url(#acrylicShadow)">
            <rect x="160" y="55" width="640" height="150" rx="14" fill="#0f131c" stroke="#334155" strokeWidth="4" />
            {/* Halo de luz trasera LED */}
            <rect x="164" y="59" width="632" height="142" rx="12" fill="none" stroke="url(#cyanNeon)" strokeWidth="3" filter="url(#neonGlow)" opacity="0.85" />
          </g>

          {/* Logotipo Diente 3D con luz cyan */}
          <g transform="translate(195, 75)" filter="url(#neonGlow)">
            <path
              d="M30,15 C20,15 10,25 10,40 C10,65 25,85 32,100 C35,85 45,70 50,70 C55,70 65,85 68,100 C75,85 90,65 90,40 C90,25 80,15 70,15 C60,15 54,25 50,25 C46,25 40,15 30,15 Z"
              fill="url(#cyanNeon)"
            />
            <path
              d="M35,28 C42,28 47,35 50,35 C53,35 58,28 65,28"
              fill="none"
              stroke="#ffffff"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </g>

          {/* Texto Corporativo Principal en Acrílico Blanco Relieve */}
          <text
            x="320"
            y="118"
            fill="#ffffff"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontSize="32"
            fontWeight="800"
            letterSpacing="2"
            filter="url(#acrylicShadow)"
          >
            CLÍNICA DENTAL
          </text>
          <text
            x="320"
            y="162"
            fill="url(#cyanNeon)"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontSize="38"
            fontWeight="900"
            letterSpacing="3"
            filter="url(#neonGlow)"
          >
            VILLACRESES
          </text>
          <text
            x="322"
            y="186"
            fill="#94a3b8"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontSize="12"
            fontWeight="600"
            letterSpacing="5"
          >
            ODONTOLOGÍA INTEGRAL · ORTODONCIA · IMPLANTES
          </text>

          {/* Ventanal Frontal con Vinil Microperforado */}
          <g transform="translate(140, 240)">
            {/* Vidrio base */}
            <rect x="0" y="0" width="680" height="200" rx="6" fill="#0d1b2a" stroke="#475569" strokeWidth="3" />
            {/* Trama de microperforación simulada */}
            <rect x="0" y="0" width="680" height="200" rx="6" fill="url(#microperfPattern)" opacity="0.4" />

            {/* Diseño institucional impreso sobre el vinil */}
            <rect x="15" y="15" width="650" height="170" rx="4" fill="rgba(6, 182, 212, 0.08)" stroke="rgba(56, 189, 248, 0.3)" strokeWidth="1.5" />
            <text x="340" y="60" textAnchor="middle" fill="#f8fafc" fontSize="18" fontWeight="700" letterSpacing="1">
              DRA. ELENA VILLACRESES · ESPECIALISTA
            </text>
            <text x="340" y="90" textAnchor="middle" fill="#38bdf8" fontSize="14" fontWeight="600">
              Lunes a Sábado: 09h00 a 19h00 | Consultas & Citas: 0984123456
            </text>
            <text x="340" y="130" textAnchor="middle" fill="#cbd5e1" fontSize="13">
              Limpiezas Ultrasónicas · Blanqueamiento LED · Prótesis · Cirugía
            </text>
            <text x="340" y="155" textAnchor="middle" fill="#64748b" fontSize="11" letterSpacing="2">
              MILAGRO · AV. PRINCIPAL & JUAN MONTALVO
            </text>
          </g>

          {/* Cotas de Medida y Anotaciones Técnicas (si están habilitadas) */}
          {showAnnotations && (
            <g className="vc-portal-annotations">
              {/* Cota Rótulo Ancho 240 cm */}
              <line x1="160" y1="40" x2="800" y2="40" stroke="#f43f5e" strokeWidth="1.5" markerEnd="url(#arrow)" />
              <line x1="160" y1="35" x2="160" y2="45" stroke="#f43f5e" strokeWidth="2" />
              <line x1="800" y1="35" x2="800" y2="45" stroke="#f43f5e" strokeWidth="2" />
              <rect x="430" y="28" width="100" height="22" rx="4" fill="#f43f5e" />
              <text x="480" y="44" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="700">240.0 cm</text>

              {/* Cota Rótulo Alto 80 cm */}
              <line x1="825" y1="55" x2="825" y2="205" stroke="#f43f5e" strokeWidth="1.5" />
              <line x1="820" y1="55" x2="830" y2="55" stroke="#f43f5e" strokeWidth="2" />
              <line x1="820" y1="205" x2="830" y2="205" stroke="#f43f5e" strokeWidth="2" />
              <rect x="835" y="118" width="80" height="22" rx="4" fill="#f43f5e" />
              <text x="875" y="134" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="700">80.0 cm</text>

              {/* Cota Ventanal Ancho 400 cm */}
              <line x1="140" y1="455" x2="820" y2="455" stroke="#10b981" strokeWidth="1.5" />
              <rect x="430" y="444" width="100" height="22" rx="4" fill="#10b981" />
              <text x="480" y="460" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="700">400.0 cm</text>

              {/* Indicadores de Corte & Registro */}
              <circle cx="20" cy="20" r="10" fill="none" stroke="#e11d48" strokeWidth="1.5" />
              <line x1="10" y1="20" x2="30" y2="20" stroke="#e11d48" strokeWidth="1.5" />
              <line x1="20" y1="10" x2="20" y2="30" stroke="#e11d48" strokeWidth="1.5" />
            </g>
          )}

          {/* Marca de Agua / Sello de Protección Técnica */}
          <text x="940" y="465" textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize="11" fontWeight="600">
            VISUAL CORP · PREPRENSA MILAGRO · PRUEBA DIGITAL CONFIDENCIAL
          </text>
        </svg>
      </div>
    );
  }

  if (type === 'lona_banner') {
    return (
      <div className="vc-portal-svg-canvas" style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
        <svg viewBox="0 0 960 480" className="vc-portal-svg-art" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="agroSky" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="60%" stopColor="#bae6fd" />
              <stop offset="100%" stopColor="#fef08a" />
            </linearGradient>
            <linearGradient id="agroField" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#15803d" />
              <stop offset="50%" stopColor="#16a34a" />
              <stop offset="100%" stopColor="#84cc16" />
            </linearGradient>
          </defs>

          {/* Lona Gigantografía 3.20m × 2.00m */}
          <rect x="60" y="40" width="620" height="390" fill="#f8fafc" stroke="#334155" strokeWidth="3" rx="4" />
          <rect x="70" y="50" width="600" height="370" fill="url(#agroSky)" />

          {/* Silueta de campos agrícolas y tractor */}
          <path d="M70,300 Q200,260 380,310 T670,290 L670,420 L70,420 Z" fill="url(#agroField)" />

          {/* Ojales perimetrales cada 50cm */}
          {[90, 200, 310, 420, 530, 640].map((x, i) => (
            <g key={`grommet-top-${i}`}>
              <circle cx={x} cy="46" r="5" fill="#94a3b8" stroke="#475569" strokeWidth="2" />
              <circle cx={x} cy="424" r="5" fill="#94a3b8" stroke="#475569" strokeWidth="2" />
            </g>
          ))}
          {[120, 230, 340].map((y, i) => (
            <g key={`grommet-side-${i}`}>
              <circle cx="66" cy={y} r="5" fill="#94a3b8" stroke="#475569" strokeWidth="2" />
              <circle cx="674" cy={y} r="5" fill="#94a3b8" stroke="#475569" strokeWidth="2" />
            </g>
          ))}

          {/* Título de la Lona */}
          <rect x="90" y="80" width="560" height="110" rx="10" fill="rgba(15, 23, 42, 0.88)" />
          <text x="370" y="130" textAnchor="middle" fill="#facc15" fontSize="34" fontWeight="900" letterSpacing="2">
            AGROCOMERCIAL SAN JOSÉ
          </text>
          <text x="370" y="165" textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="700">
            SEMILLAS CERTIFICADAS · INSUMOS AGRÍCOLAS · FERTILIZANTES
          </text>

          <text x="370" y="370" textAnchor="middle" fill="#ffffff" fontSize="22" fontWeight="800" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.8))">
            VENTAS POR MAYOR & MENOR · ENVÍOS A TODO EL PAÍS
          </text>

          {/* Roll Up Corporativo lateral */}
          <rect x="730" y="40" width="170" height="390" fill="#ffffff" stroke="#0284c7" strokeWidth="2" rx="4" />
          <rect x="720" y="425" width="190" height="12" rx="4" fill="#64748b" />
          <text x="815" y="80" textAnchor="middle" fill="#0369a1" fontSize="14" fontWeight="800">
            AGROSANJOSÉ
          </text>
          <text x="815" y="105" textAnchor="middle" fill="#0f172a" fontSize="10" fontWeight="600">
            ROLL UP STAND
          </text>
          <rect x="745" y="130" width="140" height="180" rx="6" fill="#f0fdf4" stroke="#86efac" />
          <text x="815" y="180" textAnchor="middle" fill="#15803d" fontSize="13" fontWeight="800">85 × 200 cm</text>
          <text x="815" y="210" textAnchor="middle" fill="#475569" fontSize="10">Pet Film Mate</text>
          <text x="815" y="235" textAnchor="middle" fill="#475569" fontSize="10">Anti-reflejo HD</text>

          {showAnnotations && (
            <g>
              <rect x="300" y="18" width="140" height="20" rx="4" fill="#f43f5e" />
              <text x="370" y="33" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="700">Lona 320 × 200 cm</text>
              <rect x="760" y="18" width="110" height="20" rx="4" fill="#0284c7" />
              <text x="815" y="33" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="700">Roll Up 85 × 200 cm</text>
            </g>
          )}
        </svg>
      </div>
    );
  }

  // Fallback: textil_sublimacion
  return (
    <div className="vc-portal-svg-canvas" style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
      <svg viewBox="0 0 960 480" className="vc-portal-svg-art" xmlns="http://www.w3.org/2000/svg">
        <rect width="960" height="480" fill="#0f172a" />

        {/* Camiseta deportiva de sublimación */}
        <g transform="translate(120, 60)">
          <path
            d="M80,30 L160,70 L210,30 C220,50 250,50 260,30 L310,70 L390,30 L350,140 L310,120 L310,360 L160,360 L160,120 L120,140 Z"
            fill="#1e293b"
            stroke="#38bdf8"
            strokeWidth="3"
          />
          {/* Mangas y detalles en cyan */}
          <path d="M80,30 L120,140 L160,120 L160,70 Z" fill="#0284c7" />
          <path d="M390,30 L350,140 L310,120 L310,70 Z" fill="#0284c7" />

          {/* Estampado Central */}
          <circle cx="235" cy="180" r="45" fill="#facc15" stroke="#ffffff" strokeWidth="2" />
          <text x="235" y="175" textAnchor="middle" fill="#0f172a" fontSize="14" fontWeight="900">U.E.M</text>
          <text x="235" y="195" textAnchor="middle" fill="#0f172a" fontSize="10" fontWeight="700">2026</text>

          <text x="235" y="260" textAnchor="middle" fill="#ffffff" fontSize="18" fontWeight="800" letterSpacing="1">
            PROMOCIÓN XXVI
          </text>
          <text x="235" y="285" textAnchor="middle" fill="#38bdf8" fontSize="13" fontWeight="600">
            UNIDAD EDUCATIVA MILAGRO
          </text>
        </g>

        {/* Taza Mágica Sublimada */}
        <g transform="translate(620, 110)">
          {/* Asa de la taza */}
          <path d="M190,40 C250,40 250,180 190,180" fill="none" stroke="#475569" strokeWidth="18" strokeLinecap="round" />
          {/* Cuerpo cilíndrico */}
          <rect x="40" y="20" width="160" height="200" rx="14" fill="#1e293b" stroke="#64748b" strokeWidth="4" />
          {/* Degradado térmico revelado */}
          <rect x="50" y="40" width="140" height="160" rx="8" fill="#0284c7" opacity="0.9" />
          <text x="120" y="100" textAnchor="middle" fill="#ffffff" fontSize="15" fontWeight="800">
            RECUERDO
          </text>
          <text x="120" y="125" textAnchor="middle" fill="#facc15" fontSize="13" fontWeight="700">
            GRADUACIÓN 2026
          </text>
          <text x="120" y="155" textAnchor="middle" fill="#e2e8f0" fontSize="10">
            Taza Mágica Térmica
          </text>
        </g>

        {showAnnotations && (
          <g>
            <rect x="260" y="20" width="150" height="22" rx="4" fill="#38bdf8" />
            <text x="335" y="36" textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="700">50 Camisetas Dry-Fit</text>
            <rect x="670" y="60" width="140" height="22" rx="4" fill="#facc15" />
            <text x="740" y="76" textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="700">36 Tazas Mágicas 11oz</text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ============================================================================
// COMPONENTE PRINCIPAL: ClientOrderPortalPage
// ============================================================================

export function ClientOrderPortalPage() {
  const { code: urlCode } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const { data: workspaceData } = useWorkspace();

  // Estados de Búsqueda y Selección
  const [searchQuery, setSearchQuery] = useState(urlCode || '');
  const [activeCode, setActiveCode] = useState(urlCode || 'VC-OT-2026-104');
  const [persistedOrders, setPersistedOrders] = useState<Record<string, PortalOrder>>(readPersistedOrders);
  const [persistedChatter, setPersistedChatter] = useState<Record<string, PortalChatterEvent[]>>(readPersistedChatter);

  // Estados de Interacción del Boceto Digital
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [isFullscreenModal, setIsFullscreenModal] = useState(false);

  // Estados del Checklist y Aprobación
  const [checkSpelling, setCheckSpelling] = useState(false);
  const [checkDimensions, setCheckDimensions] = useState(false);
  const [checkColors, setCheckColors] = useState(false);
  const [approverName, setApproverName] = useState('');
  const [approverIdDoc, setApproverIdDoc] = useState('');
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [validationError, setValidationError] = useState('');
  const [celebrationBanner, setCelebrationBanner] = useState(false);

  // Estados del Chatter
  const [newChatterMessage, setNewChatterMessage] = useState('');

  // Sincronizar parámetro de URL si cambia
  useEffect(() => {
    if (urlCode) {
      setActiveCode(urlCode);
      setSearchQuery(urlCode);
    }
  }, [urlCode]);

  // Recarga reactiva de almacenamiento local ante cambios de pestaña
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_PORTAL_ORDERS_KEY) {
        setPersistedOrders(readPersistedOrders());
      }
      if (e.key === STORAGE_PORTAL_CHATTER_KEY) {
        setPersistedChatter(readPersistedChatter());
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Normalizar y buscar la orden activa combinando las 4 fuentes
  const activeOrder = useMemo((): PortalOrder | null => {
    const clean = activeCode.trim().toUpperCase();
    if (!clean) return null;

    // 1. Verificar si existe en órdenes persistidas del portal
    if (persistedOrders[clean]) {
      return persistedOrders[clean];
    }
    const persistedMatch = Object.values(persistedOrders).find(
      (o) => o.code.toUpperCase() === clean || o.id.toUpperCase() === clean
    );
    if (persistedMatch) return persistedMatch;

    // 2. Verificar en showcase orders iniciales
    const showcaseMatch = SHOWCASE_ORDERS.find(
      (o) => o.code.toUpperCase() === clean || o.id.toUpperCase() === clean
    );
    if (showcaseMatch) {
      // Reconciliar con cualquier chatter persistido
      const extraChatter = persistedChatter[showcaseMatch.code] || [];
      return {
        ...showcaseMatch,
        chatter: [...showcaseMatch.chatter, ...extraChatter],
      };
    }

    // 3. Verificar en data.sales del workspace local
    if (workspaceData?.sales && Array.isArray(workspaceData.sales)) {
      const sale = workspaceData.sales.find(
        (s: any) =>
          String(s.code || '').toUpperCase() === clean ||
          String(s.id || '').toUpperCase() === clean
      );
      if (sale) {
        const total = Number(sale.total) || 0;
        const paid = Number(sale.paid) || 0;
        const balance = Math.max(0, total - paid);
        return {
          code: sale.code || `VC-VTA-${String(sale.id).slice(0, 6).toUpperCase()}`,
          id: sale.id,
          title: sale.description || 'Orden de Producción Publicitaria',
          customerName: sale.customer || 'Cliente de Mostrador',
          customerPhone: '0967872396',
          currentStage: sale.status === 'entregado' ? 6 : sale.status === 'taller' ? 4 : 3,
          stageName: sale.status === 'entregado' ? '6. Listo para Entrega' : sale.status === 'taller' ? '4. Impresión / Taller' : '3. Aprobación de Arte',
          stageStatus: sale.status === 'entregado' ? 'completado' : 'en_proceso',
          responsibleArea: 'Taller Central Milagro',
          responsibleAdvisor: 'Equipo Visual Corp',
          branch: 'Visual Corp · Matriz Milagro',
          createdAt: sale.date || new Date().toISOString(),
          estimatedDelivery: new Date(Date.now() + 4 * 86400000).toISOString(),
          financials: {
            total,
            paid,
            balance,
            paymentStatus: balance <= 0 ? 'pagado' : paid > 0 ? 'abonado' : 'pendiente',
            method: sale.method || 'Efectivo / Transferencia',
          },
          items: [
            {
              id: `item-${sale.id}`,
              name: sale.description || 'Trabajo Publicitario a Medida',
              description: 'Especificación técnica registrada en el sistema de ventas.',
              material: 'Material estándar de catálogo',
              dimensions: 'Conforme a cotización aprobada',
              quantity: sale.quantity || 1,
              unit: 'trabajo',
              unitPrice: total,
              total,
            },
          ],
          proof: {
            id: `proof-${sale.id}`,
            title: `Boceto Digital para Orden ${sale.code || sale.id}`,
            version: 'v1',
            dimensions: 'Medidas oficiales de producción',
            materials: 'Conforme a especificación contratada',
            colorProfile: 'CMYK FOGRA39',
            scaleNote: 'Archivo preparado para impresión',
            vectorType: 'rotulo_led',
            uploadedAt: sale.date || new Date().toISOString(),
            designer: 'Taller Visual Corp',
            status: 'pendiente_revision',
          },
          chatter: [
            {
              id: `chat-${sale.id}-1`,
              timestamp: sale.date || new Date().toISOString(),
              author: 'Sistema POS Visual Corp',
              role: 'Sistema',
              content: `Venta registrada por un valor total de ${formatMoney(total)}.`,
              type: 'system',
            },
          ],
        };
      }
    }

    // 4. Verificar en data.quotes del workspace local
    if (workspaceData?.quotes && Array.isArray(workspaceData.quotes)) {
      const quote = workspaceData.quotes.find(
        (q: any) =>
          String(q.code || '').toUpperCase() === clean ||
          String(q.id || '').toUpperCase() === clean
      );
      if (quote) {
        const total = Number(quote.total) || 0;
        return {
          code: quote.code || `VC-COT-${String(quote.id).slice(0, 6).toUpperCase()}`,
          id: quote.id,
          title: quote.title || 'Cotización de Publicidad & Señalética',
          customerName: quote.customerName || quote.customer || 'Cliente Visual Corp',
          customerPhone: quote.phone || '0967872396',
          currentStage: 2,
          stageName: '2. Diseño y Preprensa',
          stageStatus: 'en_proceso',
          responsibleArea: 'Cotizaciones & Preprensa',
          responsibleAdvisor: quote.advisor || 'Asesor Comercial',
          branch: 'Visual Corp · Matriz Milagro',
          createdAt: quote.createdAt || new Date().toISOString(),
          estimatedDelivery: new Date(Date.now() + 5 * 86400000).toISOString(),
          financials: {
            total,
            paid: 0,
            balance: total,
            paymentStatus: 'pendiente',
            method: 'Pendiente de confirmación',
          },
          items: (quote.items || []).map((it: any, idx: number) => ({
            id: `item-q-${idx}`,
            name: it.name || 'Ítem cotizado',
            description: it.description || 'Detalle técnico de cotización.',
            material: it.material || 'Estándar',
            dimensions: it.dimensions || 'A definir',
            quantity: Number(it.quantity) || 1,
            unit: it.unit || 'unid',
            unitPrice: Number(it.unitPrice) || 0,
            total: Number(it.total) || 0,
          })),
          proof: {
            id: `proof-q-${quote.id}`,
            title: `Boceto preliminar de cotización`,
            version: 'v1',
            dimensions: 'Escala 1:1',
            materials: 'Materiales cotizados',
            colorProfile: 'CMYK',
            scaleNote: 'Pendiente visto bueno',
            vectorType: 'lona_banner',
            uploadedAt: quote.createdAt || new Date().toISOString(),
            designer: 'Preprensa Visual Corp',
            status: 'pendiente_revision',
          },
          chatter: [
            {
              id: `chat-q-${quote.id}-1`,
              timestamp: quote.createdAt || new Date().toISOString(),
              author: 'Cotizador Inteligente',
              role: 'Sistema',
              content: 'Cotización digital generada con éxito.',
              type: 'system',
            },
          ],
        };
      }
    }

    return null;
  }, [activeCode, persistedOrders, persistedChatter, workspaceData]);

  // Si la orden ya estaba aprobada, sincronizar su nombre en el input
  useEffect(() => {
    if (activeOrder?.proof?.approvedBy) {
      setApproverName(activeOrder.proof.approvedBy);
      setCheckSpelling(true);
      setCheckDimensions(true);
      setCheckColors(true);
    } else {
      setApproverName('');
      setCheckSpelling(false);
      setCheckDimensions(false);
      setCheckColors(false);
      setValidationError('');
      setCelebrationBanner(false);
    }
  }, [activeOrder?.code]);

  // Manejar el submit de la barra de búsqueda
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = searchQuery.trim().toUpperCase();
    if (!clean) return;
    setActiveCode(clean);
    navigate(`/seguimiento/${clean}`);
  };

  // Seleccionar orden por chip rápido
  const handleSelectQuickOrder = (code: string) => {
    setActiveCode(code);
    setSearchQuery(code);
    navigate(`/seguimiento/${code}`);
  };

  // Función para aprobar arte en 1 clic
  const handleApproveArtwork = useCallback(() => {
    if (!activeOrder) return;
    setValidationError('');

    if (!approverName.trim()) {
      setValidationError('Por favor ingresa tu nombre y apellido para autorizar la firma digital.');
      return;
    }

    if (!checkSpelling || !checkDimensions || !checkColors) {
      setValidationError('Por favor marca las 3 casillas de verificación técnica antes de autorizar la producción.');
      return;
    }

    const timestamp = new Date().toISOString();
    const approver = approverName.trim();

    const approvalEvent: PortalChatterEvent = {
      id: `chat-appr-${Date.now()}`,
      timestamp,
      author: approver,
      role: 'Cliente (Firma Digital)',
      content: `✅ Arte aprobado digitalmente para producción inmediata. Checklist técnico 100% validado por ${approver}${approverIdDoc ? ` (Doc: ${approverIdDoc})` : ''}.`,
      type: 'approval',
    };

    const updatedOrder: PortalOrder = {
      ...activeOrder,
      currentStage: 4,
      stageName: '4. Impresión / Taller',
      stageStatus: 'en_proceso',
      updatedAt: timestamp,
      proof: {
        ...activeOrder.proof,
        status: 'aprobado',
        approvedAt: timestamp,
        approvedBy: approver,
        approvalChecklist: {
          spelling: checkSpelling,
          dimensions: checkDimensions,
          colors: checkColors,
        },
        feedback: feedbackNotes.trim() || undefined,
      },
      chatter: [...activeOrder.chatter, approvalEvent],
    };

    // Actualizar estado reactivo
    const nextOrders = { ...persistedOrders, [updatedOrder.code]: updatedOrder };
    setPersistedOrders(nextOrders);
    savePersistedOrders(nextOrders);

    // Guardar chatter histórico
    const nextChatter = {
      ...persistedChatter,
      [updatedOrder.code]: [...(persistedChatter[updatedOrder.code] || []), approvalEvent],
    };
    setPersistedChatter(nextChatter);
    savePersistedChatter(nextChatter);

    setCelebrationBanner(true);
  }, [
    activeOrder,
    approverName,
    approverIdDoc,
    checkSpelling,
    checkDimensions,
    checkColors,
    feedbackNotes,
    persistedOrders,
    persistedChatter,
  ]);

  // Función para solicitar corrección de diseño
  const handleRequestCorrection = useCallback(() => {
    if (!activeOrder) return;
    setValidationError('');

    if (!feedbackNotes.trim() || feedbackNotes.trim().length < 6) {
      setValidationError('Por favor describe en el campo de observaciones los cambios específicos que necesitas en el diseño.');
      return;
    }

    const timestamp = new Date().toISOString();
    const author = approverName.trim() || 'Cliente';

    const revisionEvent: PortalChatterEvent = {
      id: `chat-rev-${Date.now()}`,
      timestamp,
      author,
      role: 'Cliente (Solicitud de Cambios)',
      content: `✏️ Corrección solicitada: "${feedbackNotes.trim()}"`,
      type: 'revision',
    };

    const updatedOrder: PortalOrder = {
      ...activeOrder,
      stageStatus: 'cambios_solicitados',
      updatedAt: timestamp,
      proof: {
        ...activeOrder.proof,
        status: 'cambios_solicitados',
        feedback: feedbackNotes.trim(),
      },
      chatter: [...activeOrder.chatter, revisionEvent],
    };

    const nextOrders = { ...persistedOrders, [updatedOrder.code]: updatedOrder };
    setPersistedOrders(nextOrders);
    savePersistedOrders(nextOrders);

    const nextChatter = {
      ...persistedChatter,
      [updatedOrder.code]: [...(persistedChatter[updatedOrder.code] || []), revisionEvent],
    };
    setPersistedChatter(nextChatter);
    savePersistedChatter(nextChatter);

    alert('📝 Tu solicitud de corrección ha sido registrada. Nuestro equipo de diseño la revisará de inmediato.');
  }, [activeOrder, feedbackNotes, approverName, persistedOrders, persistedChatter]);

  // Enviar mensaje libre en el chatter
  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder || !newChatterMessage.trim()) return;

    const timestamp = new Date().toISOString();
    const author = approverName.trim() || activeOrder.customerName || 'Cliente';

    const clientMsg: PortalChatterEvent = {
      id: `chat-msg-${Date.now()}`,
      timestamp,
      author,
      role: 'Cliente',
      content: newChatterMessage.trim(),
      type: 'client_message',
    };

    const updatedOrder: PortalOrder = {
      ...activeOrder,
      chatter: [...activeOrder.chatter, clientMsg],
    };

    const nextOrders = { ...persistedOrders, [updatedOrder.code]: updatedOrder };
    setPersistedOrders(nextOrders);
    savePersistedOrders(nextOrders);

    const nextChatter = {
      ...persistedChatter,
      [updatedOrder.code]: [...(persistedChatter[updatedOrder.code] || []), clientMsg],
    };
    setPersistedChatter(nextChatter);
    savePersistedChatter(nextChatter);

    setNewChatterMessage('');
  };

  // WhatsApp Support Builder
  const whatsappSupportUrl = useMemo(() => {
    const phone = '593967872396';
    if (!activeOrder) {
      return `https://wa.me/${phone}?text=${encodeURIComponent('Hola Visual Corp, necesito consultar el estado de mi pedido publicitario.')}`;
    }
    const message = `Hola Visual Corp Milagro, estoy consultando mi orden *${activeOrder.code}* (${activeOrder.title}). Mi nombre es ${approverName || activeOrder.customerName}. ¿Podrían brindarme información adicional?`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }, [activeOrder, approverName]);

  // WhatsApp Approval Notification Builder
  const whatsappApprovalNotificationUrl = useMemo(() => {
    if (!activeOrder) return '#';
    const phone = '593967872396';
    const msg = `✅ *APROBACIÓN DIGITAL DE ARTE REALIZADA*\n\nHola Visual Corp, acabo de aprobar el boceto digital de la orden *${activeOrder.code}* (${activeOrder.title}).\n\n• *Aprobado por:* ${approverName || activeOrder.proof.approvedBy || activeOrder.customerName}\n• *Fecha y Hora:* ${new Date().toLocaleTimeString('es-EC')} - ${new Date().toLocaleDateString('es-EC')}\n• *Checklist:* Textos, medidas y colores revisados al 100%.\n\nPor favor procedan a la cola de producción e impresión inmediata. ¡Muchas gracias!`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }, [activeOrder, approverName]);

  return (
    <div className="vc-portal-page work-app">
      {/* ====================================================================
          1. HEADER & LOOKUP BAR
      ==================================================================== */}
      <header className="vc-portal-top-bar">
        <div className="vc-portal-container vc-portal-top-bar-inner">
          <div className="vc-portal-brand">
            <Link to="/" className="vc-portal-logo-link">
              <span className="vc-portal-logo-badge">VC</span>
              <div className="vc-portal-brand-text">
                <strong>VISUAL CORP</strong>
                <span>Portal de Seguimiento & Aprobación</span>
              </div>
            </Link>
          </div>

          <div className="vc-portal-top-links">
            <a
              href="https://wa.me/593967872396"
              target="_blank"
              rel="noopener noreferrer"
              className="vc-portal-btn-support"
            >
              <Phone size={15} />
              <span>Soporte Milagro: 096 787 2396</span>
            </a>
          </div>
        </div>
      </header>

      {/* Hero de Búsqueda */}
      <section className="vc-portal-search-hero">
        <div className="vc-portal-container">
          <div className="vc-portal-hero-content">
            <span className="vc-portal-pill-eyebrow">
              <Activity size={14} /> SEGUIMIENTO DE PRODUCCIÓN EN TIEMPO REAL
            </span>
            <h1 className="vc-portal-hero-title">Rastrea tu Orden y Aprueba tu Arte en 1 Clic</h1>
            <p className="vc-portal-hero-subtitle">
              Visual Corp Milagro · Consulta el avance minuto a minuto desde diseño y gran formato hasta corte láser y entrega.
            </p>

            <form onSubmit={handleSearchSubmit} className="vc-portal-search-form">
              <div className="vc-portal-search-input-wrap">
                <Search size={18} className="vc-portal-search-icon" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ingresa tu código de orden o cotización, ej. VC-OT-2026-104"
                  className="vc-portal-search-input"
                  aria-label="Código de orden de trabajo"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="vc-portal-clear-search"
                    aria-label="Limpiar búsqueda"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <button type="submit" className="vc-portal-search-btn">
                <span>Rastrear Orden</span>
                <ArrowRight size={16} />
              </button>
            </form>

            {/* Chips de Selección Rápida */}
            <div className="vc-portal-quick-chips">
              <span className="vc-portal-quick-label">Órdenes de demostración activa:</span>
              <div className="vc-portal-chips-list">
                {SHOWCASE_ORDERS.map((demo) => {
                  const isActive = activeOrder?.code === demo.code;
                  return (
                    <button
                      key={demo.code}
                      type="button"
                      onClick={() => handleSelectQuickOrder(demo.code)}
                      className={`vc-portal-chip ${isActive ? 'is-active' : ''}`}
                    >
                      <strong>{demo.code}</strong>
                      <span>{demo.title.split('+')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====================================================================
          CUERPO PRINCIPAL DEL PORTAL
      ==================================================================== */}
      <main className="vc-portal-main-content">
        <div className="vc-portal-container">
          {!activeOrder ? (
            /* Estado No Encontrado */
            <div className="vc-portal-empty-card">
              <AlertCircle size={44} className="vc-portal-empty-icon" />
              <h2>No encontramos una orden con el código "{searchQuery || activeCode}"</h2>
              <p>
                Por favor verifica el código impreso en tu recibo o cotización de Visual Corp. Recuerda que puedes probar haciendo clic en cualquiera de las órdenes sugeridas arriba.
              </p>
              <div className="vc-portal-empty-actions">
                <button
                  type="button"
                  onClick={() => handleSelectQuickOrder('VC-OT-2026-104')}
                  className="vc-portal-btn-primary"
                >
                  <Sparkles size={16} /> Ver Orden de Ejemplo (Rótulo 3D)
                </button>
                <a
                  href={whatsappSupportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="vc-portal-btn-outline"
                >
                  <MessageSquare size={16} /> Preguntar por WhatsApp
                </a>
              </div>
            </div>
          ) : (
            <>
              {/* Encabezado de la Orden */}
              <div className="vc-portal-order-card vc-portal-order-header-card">
                <div className="vc-portal-order-header-grid">
                  <div className="vc-portal-order-title-group">
                    <div className="vc-portal-badge-row">
                      <span className="vc-portal-code-tag">{activeOrder.code}</span>
                      {activeOrder.isDemo && (
                        <span className="vc-portal-demo-tag">Referencia / Demo operativa</span>
                      )}
                      <span className={`vc-portal-status-badge status-${activeOrder.stageStatus}`}>
                        {activeOrder.stageStatus === 'aprobacion_pendiente' && 'Esperando Aprobación de Arte'}
                        {activeOrder.stageStatus === 'cambios_solicitados' && 'Cambios de Arte en Proceso'}
                        {activeOrder.stageStatus === 'en_proceso' && 'En Proceso de Producción'}
                        {activeOrder.stageStatus === 'completado' && 'Trabajo Terminado'}
                      </span>
                    </div>
                    <h2 className="vc-portal-order-title">{activeOrder.title}</h2>
                    <div className="vc-portal-order-meta">
                      <span>
                        <User size={14} /> Cliente: <strong>{activeOrder.customerName}</strong>
                        {activeOrder.customerCompany ? ` (${activeOrder.customerCompany})` : ''}
                      </span>
                      <span>
                        <Building2 size={14} /> Sucursal: <strong>{activeOrder.branch}</strong>
                      </span>
                      <span>
                        <Calendar size={14} /> Ingreso: {formatDate(activeOrder.createdAt)}
                      </span>
                      <span>
                        <Clock size={14} /> Entrega Estimada: <strong>{formatDate(activeOrder.estimatedDelivery)}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="vc-portal-order-advisor-card">
                    <div className="vc-portal-advisor-avatar">
                      <User size={20} />
                    </div>
                    <div className="vc-portal-advisor-info">
                      <small>Responsable Asignado</small>
                      <strong>{activeOrder.responsibleAdvisor}</strong>
                      <span>Área: {activeOrder.responsibleArea}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Banner de Celebración de Aprobación */}
              {celebrationBanner && (
                <div className="vc-portal-celebration-banner" role="alert">
                  <div className="vc-portal-celebration-icon">
                    <CheckCircle2 size={32} />
                  </div>
                  <div className="vc-portal-celebration-text">
                    <h3>¡Arte Aprobado Exitosamente para Producción Inmediata!</h3>
                    <p>
                      Hemos registrado tu visto bueno con firma digital de <strong>{approverName || activeOrder.proof.approvedBy}</strong> con fecha {new Date().toLocaleTimeString('es-EC')}. La orden se movió a la etapa <strong>4. Impresión / Taller</strong>.
                    </p>
                  </div>
                  <div className="vc-portal-celebration-action">
                    <a
                      href={whatsappApprovalNotificationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="vc-portal-btn-whatsapp-celebrate"
                    >
                      <Share2 size={16} /> Notificar a Visual Corp por WhatsApp
                    </a>
                  </div>
                </div>
              )}

              {/* ====================================================================
                  2. STEPPER DE 6 ETAPAS EN VIVO (VISUAL TRACKER)
              ==================================================================== */}
              <section className="vc-portal-order-card vc-portal-stepper-card">
                <div className="vc-portal-card-header">
                  <div>
                    <span className="vc-portal-eyebrow">LÍNEA DE PRODUCCIÓN INTEGRADA</span>
                    <h3>Progreso de Fabricación & Entrega</h3>
                  </div>
                  <span className="vc-portal-stage-indicator">
                    Etapa {activeOrder.currentStage} de 6: <strong>{activeOrder.stageName}</strong>
                  </span>
                </div>

                <div className="vc-portal-stepper-track">
                  {STAGES_CONFIG.map((stageItem) => {
                    const isCompleted = activeOrder.currentStage > stageItem.step;
                    const isCurrent = activeOrder.currentStage === stageItem.step;
                    const isPending = activeOrder.currentStage < stageItem.step;
                    const StageIcon = stageItem.icon;

                    return (
                      <div
                        key={stageItem.id}
                        className={`vc-portal-step-node ${
                          isCompleted ? 'is-completed' : ''
                        } ${isCurrent ? 'is-current' : ''} ${isPending ? 'is-pending' : ''}`}
                      >
                        <div className="vc-portal-step-marker">
                          {isCompleted ? (
                            <Check size={16} className="vc-portal-check-icon" />
                          ) : (
                            <span>{stageItem.step}</span>
                          )}
                          {isCurrent && <span className="vc-portal-pulse-ring" />}
                        </div>

                        <div className="vc-portal-step-body">
                          <div className="vc-portal-step-icon-row">
                            <StageIcon size={16} />
                            <small>{stageItem.area}</small>
                          </div>
                          <strong className="vc-portal-step-title">{stageItem.title}</strong>
                          <span className="vc-portal-step-subtitle">{stageItem.subtitle}</span>
                          <p className="vc-portal-step-desc">{stageItem.desc}</p>

                          {isCompleted && (
                            <span className="vc-portal-step-status is-done">
                              <CheckCircle2 size={12} /> Completado
                            </span>
                          )}
                          {isCurrent && (
                            <span className="vc-portal-step-status is-active">
                              <Clock size={12} /> En Proceso
                            </span>
                          )}
                          {isPending && (
                            <span className="vc-portal-step-status is-waiting">
                              Pendiente
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* ====================================================================
                  3. DIGITAL PROOFING & SIGN-OFF BOX ("APROBACIÓN EN 1 CLIC")
              ==================================================================== */}
              <section className="vc-portal-order-card vc-portal-proofing-card">
                <div className="vc-portal-card-header">
                  <div>
                    <span className="vc-portal-eyebrow">
                      <FileCheck2 size={15} /> CENTRO TÉCNICO DE PREPRENSA
                    </span>
                    <h3>Aprobación Digital de Arte en 1 Clic</h3>
                  </div>
                  <div className="vc-portal-proof-tags">
                    <span className="vc-portal-spec-badge">Versión {activeOrder.proof.version}</span>
                    <span className="vc-portal-spec-badge">{activeOrder.proof.dimensions}</span>
                    <span className="vc-portal-spec-badge">{activeOrder.proof.materials}</span>
                  </div>
                </div>

                <div className="vc-portal-proofing-layout">
                  {/* Visor Interactivo de Boceto */}
                  <div className="vc-portal-proof-viewer-pane">
                    <div className="vc-portal-viewer-toolbar">
                      <div className="vc-portal-viewer-info">
                        <Eye size={15} />
                        <span>Vista previa técnica para impresión</span>
                      </div>
                      <div className="vc-portal-viewer-controls">
                        <button
                          type="button"
                          onClick={() => setZoomLevel((z) => Math.max(0.7, z - 0.15))}
                          className="vc-portal-ctrl-btn"
                          title="Alejar"
                        >
                          <ZoomOut size={15} />
                        </button>
                        <span className="vc-portal-zoom-val">{Math.round(zoomLevel * 100)}%</span>
                        <button
                          type="button"
                          onClick={() => setZoomLevel((z) => Math.min(1.8, z + 0.15))}
                          className="vc-portal-ctrl-btn"
                          title="Acercar"
                        >
                          <ZoomIn size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setZoomLevel(1)}
                          className="vc-portal-ctrl-btn"
                          title="Restablecer tamaño"
                        >
                          1:1
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAnnotations((prev) => !prev)}
                          className={`vc-portal-ctrl-btn ${showAnnotations ? 'active' : ''}`}
                          title="Alternar cotas de medida"
                        >
                          <SlidersHorizontal size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsFullscreenModal(true)}
                          className="vc-portal-ctrl-btn"
                          title="Pantalla completa"
                        >
                          <Maximize2 size={15} />
                        </button>
                      </div>
                    </div>

                    <div className="vc-portal-art-viewport">
                      <VectorPreviewSimulation
                        type={activeOrder.proof.vectorType}
                        showAnnotations={showAnnotations}
                        zoom={zoomLevel}
                      />
                    </div>

                    <div className="vc-portal-viewer-footer">
                      <span>
                        <Lock size={12} /> Color Profile: {activeOrder.proof.colorProfile}
                      </span>
                      <span>{activeOrder.proof.scaleNote}</span>
                      <span>Subido por: {activeOrder.proof.designer}</span>
                    </div>
                  </div>

                  {/* Panel de Firma y Checklist */}
                  <div className="vc-portal-signoff-pane">
                    {activeOrder.proof.status === 'aprobado' ? (
                      /* Estado: Arte Ya Aprobado */
                      <div className="vc-portal-signoff-completed-box">
                        <div className="vc-portal-approved-badge-banner">
                          <CheckCircle2 size={24} />
                          <div>
                            <h4>Arte Aprobado Oficialmente</h4>
                            <p>
                              Autorizado por: <strong>{activeOrder.proof.approvedBy}</strong>
                            </p>
                            <small>
                              Fecha de visto bueno: {formatDate(activeOrder.proof.approvedAt || activeOrder.updatedAt)}
                            </small>
                          </div>
                        </div>

                        <div className="vc-portal-approved-checklist-summary">
                          <h5>Checklist de Conformidad Registrado:</h5>
                          <ul>
                            <li>
                              <Check size={14} className="icon-check" /> Ortografía, teléfonos y textos verificados
                            </li>
                            <li>
                              <Check size={14} className="icon-check" /> Medidas y proporciones confirmadas
                            </li>
                            <li>
                              <Check size={14} className="icon-check" /> Colores corporativos y disposición aprobados
                            </li>
                          </ul>
                        </div>

                        {activeOrder.proof.feedback && (
                          <div className="vc-portal-feedback-note">
                            <strong>Nota del cliente:</strong>
                            <p>"{activeOrder.proof.feedback}"</p>
                          </div>
                        )}

                        <div className="vc-portal-post-approval-msg">
                          <p>
                            Tu pedido se encuentra actualmente en taller. Nuestro equipo te notificará cuando esté listo para retiro o instalación.
                          </p>
                          <a
                            href={whatsappSupportUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="vc-portal-btn-outline"
                          >
                            <MessageSquare size={15} /> Contactar a taller por WhatsApp
                          </a>
                        </div>
                      </div>
                    ) : (
                      /* Estado: Esperando Aprobación */
                      <div className="vc-portal-signoff-form-box">
                        <div className="vc-portal-signoff-header">
                          <h4>Pre-producción: Validación del Cliente</h4>
                          <p>
                            Antes de enviar a impresión y corte, por favor confirma que todos los datos sean correctos:
                          </p>
                        </div>

                        {/* Checklist Pre-producción */}
                        <div className="vc-portal-checklist-group">
                          <label className={`vc-portal-check-item ${checkSpelling ? 'is-checked' : ''}`}>
                            <input
                              type="checkbox"
                              checked={checkSpelling}
                              onChange={(e) => setCheckSpelling(e.target.checked)}
                            />
                            <div className="vc-portal-check-label">
                              <strong>Ortografía, teléfonos y textos verificados</strong>
                              <small>Nombres, números celulares, direcciones y redes sociales sin errores.</small>
                            </div>
                          </label>

                          <label className={`vc-portal-check-item ${checkDimensions ? 'is-checked' : ''}`}>
                            <input
                              type="checkbox"
                              checked={checkDimensions}
                              onChange={(e) => setCheckDimensions(e.target.checked)}
                            />
                            <div className="vc-portal-check-label">
                              <strong>Medidas y proporciones confirmadas</strong>
                              <small>Dimensiones exactas ({activeOrder.proof.dimensions}) para encaje en tu espacio.</small>
                            </div>
                          </label>

                          <label className={`vc-portal-check-item ${checkColors ? 'is-checked' : ''}`}>
                            <input
                              type="checkbox"
                              checked={checkColors}
                              onChange={(e) => setCheckColors(e.target.checked)}
                            />
                            <div className="vc-portal-check-label">
                              <strong>Colores corporativos y disposición aprobados</strong>
                              <small>Tonos, orientación horizontal/vertical y posición de elementos conforme a tu marca.</small>
                            </div>
                          </label>

                          <button
                            type="button"
                            onClick={() => {
                              setCheckSpelling(true);
                              setCheckDimensions(true);
                              setCheckColors(true);
                            }}
                            className="vc-portal-check-all-btn"
                          >
                            ✓ Marcar todas las casillas
                          </button>
                        </div>

                        {/* Inputs de Quien Aprueba */}
                        <div className="vc-portal-approver-fields">
                          <label className="vc-portal-field">
                            <span>Nombre de quien aprueba *</span>
                            <input
                              type="text"
                              value={approverName}
                              onChange={(e) => setApproverName(e.target.value)}
                              placeholder="Ej. Ing. Carlos Mendoza (Gerente)"
                              required
                            />
                          </label>

                          <label className="vc-portal-field">
                            <span>Cédula o RUC (opcional para control de entrega)</span>
                            <input
                              type="text"
                              value={approverIdDoc}
                              onChange={(e) => setApproverIdDoc(e.target.value)}
                              placeholder="Ej. 0923456789"
                            />
                          </label>

                          <label className="vc-portal-field">
                            <span>Observaciones o ajustes (opcional si apruebas, obligatorio si solicitas cambios)</span>
                            <textarea
                              rows={3}
                              value={feedbackNotes}
                              onChange={(e) => setFeedbackNotes(e.target.value)}
                              placeholder="Indica detalles de instalación, tono de pintura o corrección puntual que requieras..."
                            />
                          </label>
                        </div>

                        {validationError && (
                          <div className="vc-portal-validation-error" role="alert">
                            <AlertTriangle size={16} />
                            <span>{validationError}</span>
                          </div>
                        )}

                        {/* Botones Primarios de Acción */}
                        <div className="vc-portal-action-buttons">
                          <button
                            type="button"
                            onClick={handleApproveArtwork}
                            className="vc-portal-btn-approve-primary"
                          >
                            <CheckCircle2 size={18} />
                            <span>✅ Aprobar Arte para Producción Inmediata</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleRequestCorrection}
                            className="vc-portal-btn-revision-secondary"
                          >
                            <Edit3 size={16} />
                            <span>✏️ Solicitar Corrección de Diseño</span>
                          </button>
                        </div>

                        <small className="vc-portal-legal-note">
                          * Al autorizar el arte, Visual Corp iniciará el proceso de impresión y fabricación conforme al boceto presentado.
                        </small>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* ====================================================================
                  4. RESUMEN FINANCIERO & FICHA TÉCNICA DE LA ORDEN
              ==================================================================== */}
              <div className="vc-portal-two-col-grid">
                {/* Tabla de Productos / Servicios */}
                <section className="vc-portal-order-card">
                  <div className="vc-portal-card-header">
                    <div>
                      <span className="vc-portal-eyebrow">DETALLE CONTRACTUAL</span>
                      <h3>Ficha Técnica & Ítems de la Orden</h3>
                    </div>
                    <span className="vc-portal-item-count">{activeOrder.items.length} ítems</span>
                  </div>

                  <div className="table-wrap">
                    <table className="vc-portal-table">
                      <thead>
                        <tr>
                          <th>Descripción & Especificación</th>
                          <th>Material</th>
                          <th>Medida</th>
                          <th className="text-right">Cant.</th>
                          <th className="text-right">P. Unit</th>
                          <th className="text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeOrder.items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <strong>{item.name}</strong>
                              <p className="vc-portal-table-desc">{item.description}</p>
                            </td>
                            <td>
                              <span className="vc-portal-material-pill">{item.material}</span>
                            </td>
                            <td>{item.dimensions}</td>
                            <td className="text-right">
                              {item.quantity} {item.unit}
                            </td>
                            <td className="text-right">{formatMoney(item.unitPrice)}</td>
                            <td className="text-right">
                              <strong>{formatMoney(item.total)}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Sucursal y Retiro */}
                  <div className="vc-portal-pickup-info">
                    <MapPin size={18} className="vc-portal-pin-icon" />
                    <div>
                      <strong>Punto de Retiro / Montaje:</strong>
                      <p>{activeOrder.branch}</p>
                      <small>Horario de atención: Lunes a Viernes 08:30 - 18:30 | Sábados 09:00 - 14:00</small>
                    </div>
                  </div>
                </section>

                {/* Resumen Financiero */}
                <section className="vc-portal-order-card vc-portal-financial-card">
                  <div className="vc-portal-card-header">
                    <div>
                      <span className="vc-portal-eyebrow">ESTADO DE CUENTA</span>
                      <h3>Resumen Financiero</h3>
                    </div>
                    <span className={`vc-portal-payment-status status-${activeOrder.financials.paymentStatus}`}>
                      {activeOrder.financials.paymentStatus === 'pagado' && '100% Cancelado'}
                      {activeOrder.financials.paymentStatus === 'abonado' && 'Anticipo Pagado'}
                      {activeOrder.financials.paymentStatus === 'pendiente' && 'Pago Pendiente'}
                    </span>
                  </div>

                  <div className="vc-portal-finance-metrics">
                    <div className="vc-portal-metric-row">
                      <span>Total de la Orden</span>
                      <strong>{formatMoney(activeOrder.financials.total)}</strong>
                    </div>
                    <div className="vc-portal-metric-row text-success">
                      <span>Anticipo Abonado</span>
                      <strong>{formatMoney(activeOrder.financials.paid)}</strong>
                    </div>
                    <div className="vc-portal-metric-divider" />
                    <div className="vc-portal-metric-row vc-portal-metric-balance">
                      <span>Saldo Pendiente</span>
                      <strong className={activeOrder.financials.balance > 0 ? 'text-warn' : 'text-success'}>
                        {formatMoney(activeOrder.financials.balance)}
                      </strong>
                    </div>
                  </div>

                  <div className="vc-portal-payment-info-box">
                    <p>
                      {activeOrder.financials.balance > 0
                        ? `El saldo de ${formatMoney(activeOrder.financials.balance)} puede cancelarse al momento del retiro o culminación de instalación en efectivo, transferencia o tarjeta.`
                        : 'Esta orden se encuentra completamente cancelada. No registras ningún saldo pendiente.'}
                    </p>
                    <small>Método registrado: {activeOrder.financials.method || 'Efectivo / Transferencia'}</small>
                  </div>

                  <div className="vc-portal-contact-advisor-box">
                    <a
                      href={whatsappSupportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="vc-portal-btn-whatsapp-full"
                    >
                      <MessageSquare size={16} /> Contactar a mi Asesor por WhatsApp
                    </a>
                  </div>
                </section>
              </div>

              {/* ====================================================================
                  5. HISTORIAL DE ACTIVIDAD & CHATTER DE LA ORDEN
              ==================================================================== */}
              <section className="vc-portal-order-card vc-portal-chatter-card">
                <div className="vc-portal-card-header">
                  <div>
                    <span className="vc-portal-eyebrow">AUDITORÍA & MENSAJES</span>
                    <h3>Historial de la Orden & Comunicaciones</h3>
                  </div>
                  <span className="vc-portal-chatter-count">
                    {activeOrder.chatter.length} registros
                  </span>
                </div>

                <div className="vc-portal-chatter-timeline">
                  {activeOrder.chatter.map((event) => {
                    return (
                      <div key={event.id} className={`vc-portal-timeline-item type-${event.type}`}>
                        <div className="vc-portal-timeline-bullet">
                          {event.type === 'approval' && <Check size={14} />}
                          {event.type === 'revision' && <Edit3 size={14} />}
                          {event.type === 'designer' && <Scissors size={14} />}
                          {event.type === 'system' && <Activity size={14} />}
                          {event.type === 'client_message' && <MessageSquare size={14} />}
                        </div>

                        <div className="vc-portal-timeline-content">
                          <div className="vc-portal-timeline-header">
                            <strong>{event.author}</strong>
                            <span className="vc-portal-role-tag">{event.role}</span>
                            <span className="vc-portal-time-stamp">
                              {new Date(event.timestamp).toLocaleTimeString('es-EC', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}{' '}
                              · {formatDate(event.timestamp)}
                            </span>
                          </div>
                          <p className="vc-portal-timeline-text">{event.content}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Formulario para Enviar Pregunta o Mensaje al Chatter */}
                <form onSubmit={handleSendChatMessage} className="vc-portal-chatter-input-form">
                  <div className="vc-portal-chatter-input-row">
                    <input
                      type="text"
                      value={newChatterMessage}
                      onChange={(e) => setNewChatterMessage(e.target.value)}
                      placeholder="¿Tienes alguna duda o requerimiento especial sobre tu orden? Escribe aquí..."
                      className="vc-portal-chat-input"
                    />
                    <button
                      type="submit"
                      disabled={!newChatterMessage.trim()}
                      className="vc-portal-chat-send-btn"
                    >
                      <Send size={15} />
                      <span>Enviar</span>
                    </button>
                  </div>
                </form>
              </section>
            </>
          )}
        </div>
      </main>

      {/* ====================================================================
          MODAL DE PANTALLA COMPLETA PARA INSPECCIÓN TÉCNICA
      ==================================================================== */}
      {isFullscreenModal && activeOrder && (
        <div className="vc-portal-fullscreen-modal" role="dialog" aria-modal="true">
          <div className="vc-portal-modal-header">
            <div className="vc-portal-modal-title">
              <Eye size={18} />
              <strong>{activeOrder.proof.title}</strong>
              <span className="vc-portal-spec-badge">Escala Ampliada</span>
            </div>
            <button
              type="button"
              onClick={() => setIsFullscreenModal(false)}
              className="vc-portal-modal-close-btn"
              aria-label="Cerrar vista completa"
            >
              <X size={20} />
            </button>
          </div>

          <div className="vc-portal-modal-canvas-wrap">
            <VectorPreviewSimulation
              type={activeOrder.proof.vectorType}
              showAnnotations={true}
              zoom={1.3}
            />
          </div>

          <div className="vc-portal-modal-footer">
            <span>
              Presiona <strong>ESC</strong> o la <strong>X</strong> superior para volver al portal.
            </span>
            <button
              type="button"
              onClick={() => setIsFullscreenModal(false)}
              className="vc-portal-btn-primary"
            >
              Listo, volver a la orden
            </button>
          </div>
        </div>
      )}

      {/* Footer del Portal */}
      <footer className="vc-portal-footer">
        <div className="vc-portal-container vc-portal-footer-inner">
          <p>© {new Date().getFullYear()} Visual Corp · Milagro, Guayas, Ecuador. Todos los derechos reservados.</p>
          <div className="vc-portal-footer-links">
            <Link to="/">Inicio</Link>
            <Link to="/servicios">Servicios</Link>
            <Link to="/contacto">Contacto</Link>
            <Link to="/cotizador">Cotizador en Línea</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
