import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Check,
  ChevronDown,
  Droplet,
  Droplets,
  Edit2,
  ExternalLink,
  Flame,
  Info,
  Layers,
  LayoutGrid,
  Link,
  LoaderCircle,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Unlink,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { InventoryCmykBatchModal } from './InventoryCmykBatchModal';
import './inventory-live-ink-monitor.css';

export type ActiveInk = {
  id: string;
  organization_id: string;
  branch_id: string;
  variant_id: string | null;
  location_code: string;
  machine_name: string;
  color_code: 'C' | 'M' | 'Y' | 'K' | 'LC' | 'LM' | 'W' | 'V' | 'FL' | 'OTRO';
  color_name: string;
  color_hex: string;
  ink_type: 'ecosolvente' | 'solvente' | 'sublimacion' | 'uv' | 'dtf' | 'acuosa' | 'otro';
  tank_capacity_ml: number;
  remaining_percent: number;
  status: 'en_uso' | 'bajo' | 'critico' | 'agotado';
  operator_name: string;
  notes: string;
  last_measured_at: string;
  created_at: string;
  updated_at: string;
};

export type InventoryVariantOption = {
  variantId: string;
  name: string;
  variant: string;
  sku: string;
  quantity: number;
  unit: string;
  category: string;
};

type InventoryLiveInkMonitorProps = {
  organizationId: string;
  branches: Array<{ id: string; name: string }>;
  canEdit: boolean;
  onNotice?: (msg: string) => void;
  operatorDefaultName?: string;
  inventoryItems?: any[];
  onRefreshInventory?: () => Promise<void> | void;
  categories?: Array<{ id: string; name: string; code?: string }>;
  areas?: Array<{ id: string; name: string; code?: string }>;
};

export const CMYK_COLOR_CONFIG: Record<
  string,
  { name: string; hex: string; bgGradient: string; badgeBg: string; textDark?: boolean }
> = {
  C: {
    name: 'Cian',
    hex: '#00AEEF',
    bgGradient: 'linear-gradient(180deg, #38bdf8 0%, #0284c7 60%, #0369a1 100%)',
    badgeBg: '#e0f2fe',
  },
  M: {
    name: 'Magenta',
    hex: '#EC008C',
    bgGradient: 'linear-gradient(180deg, #f43f5e 0%, #e11d48 60%, #9f1239 100%)',
    badgeBg: '#ffe4e6',
  },
  Y: {
    name: 'Amarillo',
    hex: '#FACC15',
    bgGradient: 'linear-gradient(180deg, #fef08a 0%, #facc15 60%, #ca8a04 100%)',
    badgeBg: '#fef9c3',
    textDark: true,
  },
  K: {
    name: 'Negro',
    hex: '#18181B',
    bgGradient: 'linear-gradient(180deg, #3f3f46 0%, #27272a 60%, #09090b 100%)',
    badgeBg: '#f4f4f5',
  },
  LC: {
    name: 'Light Cyan',
    hex: '#7dd3fc',
    bgGradient: 'linear-gradient(180deg, #bae6fd 0%, #7dd3fc 100%)',
    badgeBg: '#f0f9ff',
  },
  LM: {
    name: 'Light Magenta',
    hex: '#fda4af',
    bgGradient: 'linear-gradient(180deg, #fecdd3 0%, #fda4af 100%)',
    badgeBg: '#fff1f2',
  },
  W: {
    name: 'Blanco',
    hex: '#ffffff',
    bgGradient: 'linear-gradient(180deg, #ffffff 0%, #e2e8f0 60%, #cbd5e1 100%)',
    badgeBg: '#f1f5f9',
    textDark: true,
  },
  V: {
    name: 'Barniz / Gloss',
    hex: '#a855f7',
    bgGradient: 'linear-gradient(180deg, #e9d5ff 0%, #c084fc 60%, #9333ea 100%)',
    badgeBg: '#f3e8ff',
  },
  FL: {
    name: 'Limpiador Flush',
    hex: '#10b981',
    bgGradient: 'linear-gradient(180deg, #a7f3d0 0%, #34d399 60%, #059669 100%)',
    badgeBg: '#ecfdf5',
  },
  OTRO: {
    name: 'Especial',
    hex: '#f97316',
    bgGradient: 'linear-gradient(180deg, #fdba74 0%, #fb923c 60%, #ea580c 100%)',
    badgeBg: '#fff7ed',
  },
};

export type ColorConfig = {
  name: string;
  hex: string;
  bgGradient: string;
  badgeBg: string;
  textDark?: boolean;
};

export function getColorConfig(code: string, fallbackName = '', fallbackHex = '#00AEEF'): ColorConfig {
  if (CMYK_COLOR_CONFIG[code]) return CMYK_COLOR_CONFIG[code];
  return {
    name: fallbackName || code,
    hex: fallbackHex,
    bgGradient: fallbackHex,
    badgeBg: '#f3f4f6',
    textDark: false,
  };
}

export type ChannelDraft = {
  id?: string;
  colorCode: ActiveInk['color_code'];
  colorName: string;
  colorHex: string;
  capacityMl: number;
  initialPercent: number;
  variantId: string;
};

export type PrinterPreset = 'cmyk' | 'cmyk_lc_lm' | 'cmyk_uv_w_v' | 'custom';

// Datos por defecto para arranque
const INITIAL_DEMO_INKS: ActiveInk[] = [
  {
    id: 'demo-c1',
    organization_id: '57b8e2ab-9dd3-491b-9402-7176da9ba98c',
    branch_id: 'f499caf7-6286-4c6e-abd7-d79fa58c27d0',
    variant_id: null,
    location_code: 'MAIN',
    machine_name: 'Plotter Gran Formato 3.20m',
    color_code: 'C',
    color_name: 'Cian',
    color_hex: '#00AEEF',
    ink_type: 'ecosolvente',
    tank_capacity_ml: 1000,
    remaining_percent: 65,
    status: 'en_uso',
    operator_name: 'Taller',
    notes: 'Configuración inicial',
    last_measured_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-m1',
    organization_id: '57b8e2ab-9dd3-491b-9402-7176da9ba98c',
    branch_id: 'f499caf7-6286-4c6e-abd7-d79fa58c27d0',
    variant_id: null,
    location_code: 'MAIN',
    machine_name: 'Plotter Gran Formato 3.20m',
    color_code: 'M',
    color_name: 'Magenta',
    color_hex: '#EC008C',
    ink_type: 'ecosolvente',
    tank_capacity_ml: 1000,
    remaining_percent: 45,
    status: 'en_uso',
    operator_name: 'Taller',
    notes: 'Configuración inicial',
    last_measured_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-y1',
    organization_id: '57b8e2ab-9dd3-491b-9402-7176da9ba98c',
    branch_id: 'f499caf7-6286-4c6e-abd7-d79fa58c27d0',
    variant_id: null,
    location_code: 'MAIN',
    machine_name: 'Plotter Gran Formato 3.20m',
    color_code: 'Y',
    color_name: 'Amarillo',
    color_hex: '#FACC15',
    ink_type: 'ecosolvente',
    tank_capacity_ml: 1000,
    remaining_percent: 18,
    status: 'bajo',
    operator_name: 'Taller',
    notes: 'Configuración inicial',
    last_measured_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-k1',
    organization_id: '57b8e2ab-9dd3-491b-9402-7176da9ba98c',
    branch_id: 'f499caf7-6286-4c6e-abd7-d79fa58c27d0',
    variant_id: null,
    location_code: 'MAIN',
    machine_name: 'Plotter Gran Formato 3.20m',
    color_code: 'K',
    color_name: 'Negro',
    color_hex: '#18181B',
    ink_type: 'ecosolvente',
    tank_capacity_ml: 1000,
    remaining_percent: 80,
    status: 'en_uso',
    operator_name: 'Taller',
    notes: 'Configuración inicial',
    last_measured_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-c2',
    organization_id: '57b8e2ab-9dd3-491b-9402-7176da9ba98c',
    branch_id: 'f499caf7-6286-4c6e-abd7-d79fa58c27d0',
    variant_id: null,
    location_code: 'MAIN',
    machine_name: 'Plotter Impresión y Corte',
    color_code: 'C',
    color_name: 'Cian',
    color_hex: '#00AEEF',
    ink_type: 'ecosolvente',
    tank_capacity_ml: 1000,
    remaining_percent: 90,
    status: 'en_uso',
    operator_name: 'Taller',
    notes: 'Configuración inicial',
    last_measured_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-m2',
    organization_id: '57b8e2ab-9dd3-491b-9402-7176da9ba98c',
    branch_id: 'f499caf7-6286-4c6e-abd7-d79fa58c27d0',
    variant_id: null,
    location_code: 'MAIN',
    machine_name: 'Plotter Impresión y Corte',
    color_code: 'M',
    color_name: 'Magenta',
    color_hex: '#EC008C',
    ink_type: 'ecosolvente',
    tank_capacity_ml: 1000,
    remaining_percent: 12,
    status: 'critico',
    operator_name: 'Taller',
    notes: 'Configuración inicial',
    last_measured_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-y2',
    organization_id: '57b8e2ab-9dd3-491b-9402-7176da9ba98c',
    branch_id: 'f499caf7-6286-4c6e-abd7-d79fa58c27d0',
    variant_id: null,
    location_code: 'MAIN',
    machine_name: 'Plotter Impresión y Corte',
    color_code: 'Y',
    color_name: 'Amarillo',
    color_hex: '#FACC15',
    ink_type: 'ecosolvente',
    tank_capacity_ml: 1000,
    remaining_percent: 75,
    status: 'en_uso',
    operator_name: 'Taller',
    notes: 'Configuración inicial',
    last_measured_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-k2',
    organization_id: '57b8e2ab-9dd3-491b-9402-7176da9ba98c',
    branch_id: 'f499caf7-6286-4c6e-abd7-d79fa58c27d0',
    variant_id: null,
    location_code: 'MAIN',
    machine_name: 'Plotter Impresión y Corte',
    color_code: 'K',
    color_name: 'Negro',
    color_hex: '#18181B',
    ink_type: 'ecosolvente',
    tank_capacity_ml: 1000,
    remaining_percent: 85,
    status: 'en_uso',
    operator_name: 'Taller',
    notes: 'Configuración inicial',
    last_measured_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-c3',
    organization_id: '57b8e2ab-9dd3-491b-9402-7176da9ba98c',
    branch_id: 'f499caf7-6286-4c6e-abd7-d79fa58c27d0',
    variant_id: null,
    location_code: 'MAIN',
    machine_name: 'Plotter Sublimación / Calandra',
    color_code: 'C',
    color_name: 'Cian',
    color_hex: '#00AEEF',
    ink_type: 'sublimacion',
    tank_capacity_ml: 1000,
    remaining_percent: 50,
    status: 'en_uso',
    operator_name: 'Taller',
    notes: 'Configuración inicial',
    last_measured_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-m3',
    organization_id: '57b8e2ab-9dd3-491b-9402-7176da9ba98c',
    branch_id: 'f499caf7-6286-4c6e-abd7-d79fa58c27d0',
    variant_id: null,
    location_code: 'MAIN',
    machine_name: 'Plotter Sublimación / Calandra',
    color_code: 'M',
    color_name: 'Magenta',
    color_hex: '#EC008C',
    ink_type: 'sublimacion',
    tank_capacity_ml: 1000,
    remaining_percent: 60,
    status: 'en_uso',
    operator_name: 'Taller',
    notes: 'Configuración inicial',
    last_measured_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-y3',
    organization_id: '57b8e2ab-9dd3-491b-9402-7176da9ba98c',
    branch_id: 'f499caf7-6286-4c6e-abd7-d79fa58c27d0',
    variant_id: null,
    location_code: 'MAIN',
    machine_name: 'Plotter Sublimación / Calandra',
    color_code: 'Y',
    color_name: 'Amarillo',
    color_hex: '#FACC15',
    ink_type: 'sublimacion',
    tank_capacity_ml: 1000,
    remaining_percent: 40,
    status: 'en_uso',
    operator_name: 'Taller',
    notes: 'Configuración inicial',
    last_measured_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-k3',
    organization_id: '57b8e2ab-9dd3-491b-9402-7176da9ba98c',
    branch_id: 'f499caf7-6286-4c6e-abd7-d79fa58c27d0',
    variant_id: null,
    location_code: 'MAIN',
    machine_name: 'Plotter Sublimación / Calandra',
    color_code: 'K',
    color_name: 'Negro',
    color_hex: '#18181B',
    ink_type: 'sublimacion',
    tank_capacity_ml: 1000,
    remaining_percent: 70,
    status: 'en_uso',
    operator_name: 'Taller',
    notes: 'Configuración inicial',
    last_measured_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export function InventoryLiveInkMonitor({
  organizationId,
  branches,
  canEdit,
  onNotice,
  operatorDefaultName = '',
  inventoryItems = [],
  onRefreshInventory,
  categories = [],
  areas = [],
}: InventoryLiveInkMonitorProps) {
  const [inks, setInks] = useState<ActiveInk[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchModalPrinter, setBatchModalPrinter] = useState<string>('');
  const [machineStatusMap, setMachineStatusMap] = useState<Record<string, 'operativa' | 'standby' | 'mantenimiento' | 'parada'>>({
    'Plotter Gran Formato 3.20m': 'operativa',
    'Plotter Impresión y Corte': 'operativa',
    'Plotter Roland 1.60m': 'standby',
    'Plotter Sublimación / Calandra': 'operativa',
  });
  const [machineNozzleCheck, setMachineNozzleCheck] = useState<Record<string, { status: 'ok' | 'warning' | 'error'; time: string; operator: string }>>({
    'Plotter Gran Formato 3.20m': { status: 'ok', time: '11:30 a. m.', operator: 'Taller' },
    'Plotter Impresión y Corte': { status: 'ok', time: '10:15 a. m.', operator: 'Taller' },
    'Plotter Roland 1.60m': { status: 'warning', time: 'Ayer', operator: 'Taller' },
    'Plotter Sublimación / Calandra': { status: 'ok', time: '09:00 a. m.', operator: 'Taller' },
  });
  const [nozzleCheckModalMachine, setNozzleCheckModalMachine] = useState<string | null>(null);
  const [quickEntryInk, setQuickEntryInk] = useState<{ ink: ActiveInk; variant: InventoryVariantOption } | null>(null);
  const [quickEntryQty, setQuickEntryQty] = useState<number>(4);
  const [quickEntryBusy, setQuickEntryBusy] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [selectedMachine, setSelectedMachine] = useState<string>('todas');
  const [colorFilter, setColorFilter] = useState<string>('todos');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'machines' | 'grid'>('machines');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Modal de recarga individual
  const [refillTarget, setRefillTarget] = useState<ActiveInk | null>(null);
  const [consumeStockOnRefill, setConsumeStockOnRefill] = useState(true);

  // Modal de ajuste por lote de máquina
  const [batchMachine, setBatchMachine] = useState<string | null>(null);
  const [batchDraft, setBatchDraft] = useState<Record<string, number>>({});
  const [batchSaving, setBatchSaving] = useState(false);

  // --- NUEVAS CAPACIDADES: CREAR / EDITAR / ELIMINAR IMPRESORAS Y GESTIÓN DE TINTAS ---
  const [showCreatePrinterModal, setShowCreatePrinterModal] = useState(false);
  const [editPrinterTarget, setEditPrinterTarget] = useState<string | null>(null);
  const [deletePrinterTarget, setDeletePrinterTarget] = useState<string | null>(null);
  const [showFleetModal, setShowFleetModal] = useState(false);
  const [quickLinkInk, setQuickLinkInk] = useState<ActiveInk | null>(null);

  // Estado del formulario de creación de impresora
  const [createForm, setCreateForm] = useState({
    name: '',
    manufacturer: 'Galaxy',
    model: '',
    inkType: 'ecosolvente' as ActiveInk['ink_type'],
    preset: 'cmyk' as PrinterPreset,
    defaultCapacityMl: 1000,
    branchId: branches[0]?.id || '',
    notes: '',
    channels: [] as ChannelDraft[],
  });

  // Estado del formulario de edición de impresora
  const [editForm, setEditForm] = useState({
    originalName: '',
    name: '',
    inkType: 'ecosolvente' as ActiveInk['ink_type'],
    branchId: '',
    notes: '',
    channels: [] as ChannelDraft[],
  });

  // Extraer las opciones de tintas disponibles en el inventario físico de bodega
  const inkInventoryOptions = useMemo<InventoryVariantOption[]>(() => {
    if (!inventoryItems || !Array.isArray(inventoryItems)) return [];

    const map = new Map<string, InventoryVariantOption>();
    for (const item of inventoryItems) {
      if (!item.variantId || item.archived) continue;
      const cat = String(item.category || '').toLowerCase();
      const name = String(item.name || '').toLowerCase();
      const type = String(item.itemType || '').toLowerCase();
      const sku = String(item.sku || '').toLowerCase();
      const tags = Array.isArray(item.tags) ? item.tags.join(' ').toLowerCase() : '';

      const isInk =
        cat.includes('tinta') ||
        name.includes('tinta') ||
        type.includes('tinta') ||
        sku.includes('ink') ||
        tags.includes('tinta') ||
        cat.includes('toner') ||
        name.includes('toner');

      if (isInk && !map.has(item.variantId)) {
        map.set(item.variantId, {
          variantId: item.variantId,
          name: item.name,
          variant: item.variant || '',
          sku: item.sku || '',
          quantity: Number(item.quantity ?? item.availableQuantity ?? 0),
          unit: item.unit || 'botella',
          category: item.category || 'Tintas',
        });
      }
    }

    // Incluir cualquier variante vinculada aunque no haya coincidido con la heurística
    const existingLinkedIds = new Set(inks.map((i) => i.variant_id).filter(Boolean));
    for (const item of inventoryItems) {
      if (item.variantId && existingLinkedIds.has(item.variantId) && !map.has(item.variantId)) {
        map.set(item.variantId, {
          variantId: item.variantId,
          name: item.name,
          variant: item.variant || '',
          sku: item.sku || '',
          quantity: Number(item.quantity ?? item.availableQuantity ?? 0),
          unit: item.unit || 'botella',
          category: item.category || 'Tintas',
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [inventoryItems, inks]);

  // Función para obtener información del artículo de bodega vinculado
  const getLinkedVariantInfo = (variantId: string | null) => {
    if (!variantId) return null;
    const foundInOptions = inkInventoryOptions.find((v) => v.variantId === variantId);
    if (foundInOptions) return foundInOptions;

    const foundInAll = inventoryItems.find((it: any) => it.variantId === variantId);
    if (foundInAll) {
      return {
        variantId,
        name: foundInAll.name,
        variant: foundInAll.variant || '',
        sku: foundInAll.sku || '',
        quantity: Number(foundInAll.quantity ?? foundInAll.availableQuantity ?? 0),
        unit: foundInAll.unit || 'botella',
        category: foundInAll.category || 'Tintas',
      };
    }
    return null;
  };

  // Helper para sugerir variante según tecnología y color
  const suggestVariantForColor = (colorCode: string, inkType: string): string => {
    const code = colorCode.toUpperCase();
    const type = inkType.toLowerCase();

    // Intentar buscar coincidencia precisa en el inventario real cargado
    const match = inkInventoryOptions.find((opt) => {
      const optSku = opt.sku.toUpperCase();
      const optName = opt.name.toLowerCase();
      const optVariant = opt.variant.toLowerCase();

      const matchesType =
        type === 'sublimacion'
          ? optSku.includes('FUSION') || optName.includes('sublimaci')
          : type === 'ecosolvente'
          ? optSku.includes('GALAXY') || optName.includes('eco')
          : type === 'acuosa'
          ? optSku.includes('T544') || optSku.includes('T664') || optName.includes('epson')
          : true;

      const matchesColor =
        code === 'C'
          ? optSku.includes('CYAN') || optVariant.includes('cian') || optVariant.includes('cyan')
          : code === 'M'
          ? optSku.includes('MAGENTA') || optVariant.includes('magenta')
          : code === 'Y'
          ? optSku.includes('YELLOW') || optVariant.includes('amarillo') || optVariant.includes('yellow')
          : code === 'K'
          ? optSku.includes('BLACK') || optVariant.includes('negro') || optVariant.includes('black')
          : code === 'LC'
          ? optSku.includes('LC') || optVariant.includes('light cyan')
          : code === 'LM'
          ? optSku.includes('LM') || optVariant.includes('light magenta')
          : code === 'W'
          ? optSku.includes('WHITE') || optVariant.includes('blanco')
          : false;

      return matchesType && matchesColor;
    });

    return match ? match.variantId : '';
  };

  // Generador de canales según preset
  const generateChannelsForPreset = (
    preset: PrinterPreset,
    capacity: number,
    inkType: ActiveInk['ink_type']
  ): ChannelDraft[] => {
    let codes: ActiveInk['color_code'][] = ['C', 'M', 'Y', 'K'];

    if (preset === 'cmyk_lc_lm') {
      codes = ['C', 'M', 'Y', 'K', 'LC', 'LM'];
    } else if (preset === 'cmyk_uv_w_v') {
      codes = ['C', 'M', 'Y', 'K', 'W', 'V'];
    } else if (preset === 'custom') {
      codes = ['C', 'M', 'Y', 'K'];
    }

    return codes.map((code) => {
      const cfg = getColorConfig(code);
      return {
        colorCode: code,
        colorName: cfg.name,
        colorHex: cfg.hex,
        capacityMl: capacity,
        initialPercent: 100,
        variantId: suggestVariantForColor(code, inkType),
      };
    });
  };

  const loadInks = async () => {
    setLoading(true);
    let loadedFromDb = false;
    try {
      if (supabase && organizationId) {
        const { data, error } = await supabase
          .from('inventory_active_inks')
          .select('*')
          .eq('organization_id', organizationId)
          .order('machine_name', { ascending: true })
          .order('color_code', { ascending: true });

        if (error) {
          console.warn('Tabla inventory_active_inks no disponible en Supabase, usando estado en memoria:', error.message);
        } else if (data && data.length > 0) {
          setInks(data as ActiveInk[]);
          loadedFromDb = true;
        }
      }
    } catch (err) {
      console.warn('Error conectando con Supabase para tintas:', err);
    } finally {
      if (!loadedFromDb) {
        // Cargar desde localStorage o demo inicial
        try {
          const cached = localStorage.getItem(`vc_live_inks_${organizationId}`);
          if (cached) {
            setInks(JSON.parse(cached));
          } else {
            setInks(INITIAL_DEMO_INKS);
          }
        } catch {
          setInks(INITIAL_DEMO_INKS);
        }
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInks();
  }, [organizationId]);

  // Persistir en cache local para resiliencia
  useEffect(() => {
    if (inks.length > 0) {
      try {
        localStorage.setItem(`vc_live_inks_${organizationId}`, JSON.stringify(inks));
      } catch (e) {
        // Silently ignore storage quota
      }
    }
  }, [inks, organizationId]);

  // Actualizar porcentaje de un canal
  const updatePercent = async (ink: ActiveInk, newPercent: number) => {
    if (!canEdit) return;
    setUpdatingId(ink.id);
    const clamped = Math.max(0, Math.min(100, Math.round(newPercent)));
    const nextStatus =
      clamped === 0
        ? 'agotado'
        : clamped <= 15
        ? 'critico'
        : clamped <= 30
        ? 'bajo'
        : 'en_uso';

    try {
      if (supabase) {
        const { error } = await supabase.rpc('record_ink_daily_percent', {
          p_ink_id: ink.id,
          p_percent: clamped,
          p_operator: operatorDefaultName || ink.operator_name || 'Operario de taller',
          p_notes: `Ajuste en vivo: ${clamped}%`,
        });

        if (error) {
          // Fallback actualización directa si no existe el RPC
          await supabase
            .from('inventory_active_inks')
            .update({
              remaining_percent: clamped,
              status: nextStatus,
              last_measured_at: new Date().toISOString(),
              operator_name: operatorDefaultName || ink.operator_name || 'Operario de taller',
            })
            .eq('id', ink.id);
        }
      }

      setInks((prev) =>
        prev.map((i) =>
          i.id === ink.id
            ? {
                ...i,
                remaining_percent: clamped,
                status: nextStatus,
                last_measured_at: new Date().toISOString(),
              }
            : i
        )
      );
      onNotice?.(`Tinta ${ink.color_name} (${ink.machine_name}) actualizada al ${clamped}%.`);
    } catch (err: any) {
      // Actualizar localmente de todas formas
      setInks((prev) =>
        prev.map((i) =>
          i.id === ink.id
            ? {
                ...i,
                remaining_percent: clamped,
                status: nextStatus,
                last_measured_at: new Date().toISOString(),
              }
            : i
        )
      );
      onNotice?.(`Nivel actualizado localmente al ${clamped}%.`);
    } finally {
      setUpdatingId(null);
    }
  };

  // Recarga al 100% (Rellenar)
  const handleRefillInk = async () => {
    if (!refillTarget) return;
    setUpdatingId(refillTarget.id);

    try {
      let warehouseDeducted = false;

      if (supabase) {
        const { error } = await supabase.rpc('refill_active_ink', {
          p_ink_id: refillTarget.id,
          p_consume_warehouse_bottle: consumeStockOnRefill,
          p_operator: operatorDefaultName || 'Operario de taller',
          p_notes: 'Tanque rellenado al 100%',
        });

        if (!error) {
          warehouseDeducted = consumeStockOnRefill && Boolean(refillTarget.variant_id);
        } else {
          // Fallback actualización estándar
          await supabase
            .from('inventory_active_inks')
            .update({
              remaining_percent: 100,
              status: 'en_uso',
              last_measured_at: new Date().toISOString(),
            })
            .eq('id', refillTarget.id);
        }
      }

      setInks((prev) =>
        prev.map((i) =>
          i.id === refillTarget.id
            ? {
                ...i,
                remaining_percent: 100,
                status: 'en_uso',
                last_measured_at: new Date().toISOString(),
              }
            : i
        )
      );

      // Refrescar inventario global para sincronizar existencias de bodega
      if (onRefreshInventory && consumeStockOnRefill) {
        void onRefreshInventory();
      }

      const linked = getLinkedVariantInfo(refillTarget.variant_id);
      const msg =
        consumeStockOnRefill && linked
          ? `¡Tanque de ${refillTarget.color_name} al 100%! Se descontó 1 botella de ${linked.name} del inventario de bodega.`
          : `¡Tanque de ${refillTarget.color_name} (${refillTarget.machine_name}) rellenado al 100%!`;

      onNotice?.(msg);
      setRefillTarget(null);
    } catch (err: any) {
      onNotice?.(`Error al recargar: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  // Abrir modal de ajuste rápido por máquina
  const openMachineBatchModal = (machineName: string) => {
    const machineInks = inks.filter((i) => i.machine_name === machineName);
    const draft: Record<string, number> = {};
    machineInks.forEach((i) => {
      draft[i.id] = Math.round(i.remaining_percent);
    });
    setBatchDraft(draft);
    setBatchMachine(machineName);
  };

  // Guardar ajuste por lote de máquina
  const handleSaveBatchMachine = async () => {
    if (!batchMachine) return;
    setBatchSaving(true);
    try {
      if (supabase) {
        const updates = Object.entries(batchDraft).map(([id, percent]) => ({ id, percent }));
        await supabase.rpc('batch_record_machine_inks', {
          p_updates: updates,
          p_operator: operatorDefaultName || 'Operario de taller',
          p_notes: `Ajuste rápido de máquina: ${batchMachine}`,
        });
      }

      setInks((prev) =>
        prev.map((i) => {
          if (batchDraft[i.id] !== undefined) {
            const val = batchDraft[i.id];
            return {
              ...i,
              remaining_percent: val,
              status:
                val === 0
                  ? 'agotado'
                  : val <= 15
                  ? 'critico'
                  : val <= 30
                  ? 'bajo'
                  : 'en_uso',
              last_measured_at: new Date().toISOString(),
            };
          }
          return i;
        })
      );
      onNotice?.(`¡Niveles de “${batchMachine}” actualizados correctamente!`);
      setBatchMachine(null);
    } catch (err: any) {
      onNotice?.(`Error: ${err.message}`);
    } finally {
      setBatchSaving(false);
    }
  };

  // Recarga al 100% de todos los canales de una máquina en 1 clic
  const handleRefillAllMachineInks = async (machineName: string) => {
    if (!canEdit) return;
    const machineInks = inks.filter((i) => i.machine_name === machineName);
    if (!machineInks.length) return;

    try {
      if (supabase) {
        const updates = machineInks.map((i) => ({ id: i.id, percent: 100 }));
        const { error } = await supabase.rpc('batch_record_machine_inks', {
          p_updates: updates,
          p_operator: operatorDefaultName || 'Operario de taller',
          p_notes: `Recarga completa al 100% en ${machineName}`,
        });
        if (error) {
          await Promise.all(
            machineInks.map((i) =>
              supabase
                .from('inventory_active_inks')
                .update({
                  remaining_percent: 100,
                  status: 'en_uso',
                  last_measured_at: new Date().toISOString(),
                  operator_name: operatorDefaultName || 'Operario de taller',
                })
                .eq('id', i.id)
            )
          );
        }
      }

      setInks((prev) =>
        prev.map((i) =>
          i.machine_name === machineName
            ? {
                ...i,
                remaining_percent: 100,
                status: 'en_uso',
                last_measured_at: new Date().toISOString(),
              }
            : i
        )
      );
      onNotice?.(`¡Todos los canales de “${machineName}” rellenados al 100%! ⚡`);
    } catch (err: any) {
      onNotice?.(`Niveles de “${machineName}” actualizados al 100% localmente.`);
    }
  };

  // Recarga rápida al 100% consumiendo 1 botella de bodega con trazabilidad
  const handleQuickWarehouseRefill = async (ink: ActiveInk) => {
    if (!canEdit) return;
    setUpdatingId(ink.id);
    try {
      if (supabase) {
        const { error } = await supabase.rpc('refill_active_ink', {
          p_ink_id: ink.id,
          p_consume_warehouse_bottle: true,
          p_operator: operatorDefaultName || 'Operario de taller',
          p_notes: 'Recarga rápida de 1 botella desde bodega',
        });
        if (error) {
          await supabase
            .from('inventory_active_inks')
            .update({
              remaining_percent: 100,
              status: 'en_uso',
              last_measured_at: new Date().toISOString(),
            })
            .eq('id', ink.id);
        }
      }

      setInks((prev) =>
        prev.map((i) =>
          i.id === ink.id
            ? {
                ...i,
                remaining_percent: 100,
                status: 'en_uso',
                last_measured_at: new Date().toISOString(),
              }
            : i
        )
      );
      await onRefreshInventory?.();
      onNotice?.(`¡Tinta ${ink.color_name} (${ink.machine_name}) rellenada al 100% y descontada de bodega! 📦⚡`);
    } catch (err: any) {
      onNotice?.(`Tinta ${ink.color_name} rellenada al 100%.`);
    } finally {
      setUpdatingId(null);
    }
  };

  // --- ACCIONES DE CREAR NUEVA IMPRESORA ---
  const handleOpenCreatePrinter = () => {
    const branchId = branches[0]?.id || 'f499caf7-6286-4c6e-abd7-d79fa58c27d0';
    const initialChannels = generateChannelsForPreset('cmyk', 1000, 'ecosolvente');
    setCreateForm({
      name: '',
      manufacturer: 'Galaxy',
      model: '',
      inkType: 'ecosolvente',
      preset: 'cmyk',
      defaultCapacityMl: 1000,
      branchId,
      notes: '',
      channels: initialChannels,
    });
    setShowCreatePrinterModal(true);
  };

  const handleCreatePrinterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const machineName = createForm.name.trim();
    if (!machineName) {
      onNotice?.('Por favor ingresa el nombre de la impresora o plotter.');
      return;
    }

    if (createForm.channels.length === 0) {
      onNotice?.('Debes configurar al menos un canal de tinta para la impresora.');
      return;
    }

    const branchId = createForm.branchId || branches[0]?.id || 'f499caf7-6286-4c6e-abd7-d79fa58c27d0';

    const rowsToInsert = createForm.channels.map((ch) => {
      const cfg = getColorConfig(ch.colorCode);
      return {
        id: globalThis.crypto?.randomUUID?.() || `ink-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        organization_id: organizationId,
        branch_id: branchId,
        variant_id: ch.variantId || null,
        location_code: 'MAIN',
        machine_name: machineName,
        color_code: ch.colorCode,
        color_name: ch.colorName || cfg.name,
        color_hex: ch.colorHex || cfg.hex,
        ink_type: createForm.inkType,
        tank_capacity_ml: ch.capacityMl || createForm.defaultCapacityMl || 1000,
        remaining_percent: ch.initialPercent || 100,
        operator_name: operatorDefaultName || 'Taller',
        notes: createForm.notes.trim() || `Instalado en ${machineName}`,
        status:
          ch.initialPercent <= 15
            ? 'critico'
            : ch.initialPercent <= 30
            ? 'bajo'
            : 'en_uso',
        last_measured_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    try {
      if (supabase) {
        const { error } = await supabase.from('inventory_active_inks').insert(rowsToInsert);
        if (error) {
          console.warn('Error al insertar en Supabase:', error.message);
        }

        // Registrar también en equipment_assets para coherencia integral si la tabla existe
        try {
          const assetCode = `PLT-${Date.now().toString(36).toUpperCase()}`;
          await supabase.from('equipment_assets').insert({
            organization_id: organizationId,
            branch_id: branchId,
            asset_code: assetCode,
            name: machineName,
            equipment_type: 'Impresora gran formato',
            manufacturer: createForm.manufacturer || 'Visual Corp',
            model: createForm.model || 'Gran formato',
            status: 'Operativo',
            condition: 'Bueno',
            notes: `Tecnología: ${createForm.inkType}. Canales: ${rowsToInsert.map((r) => r.color_code).join(', ')}. ${createForm.notes}`,
          });
        } catch {
          // Ignore secondary equipment asset error
        }
      }

      setInks((prev) => [...prev, ...(rowsToInsert as ActiveInk[])]);
      setShowCreatePrinterModal(false);
      setSelectedMachine(machineName);
      onNotice?.(`¡Impresora “${machineName}” creada con éxito con ${rowsToInsert.length} canales conectados!`);
    } catch (err: any) {
      onNotice?.(`Error al crear impresora: ${err.message}`);
    }
  };

  // --- ACCIONES DE EDITAR IMPRESORA Y GESTIONAR CANALES ---
  const handleOpenEditPrinter = (machineName: string) => {
    const machineInks = inks.filter((i) => i.machine_name === machineName);
    if (machineInks.length === 0) return;

    const currentInkType = machineInks[0]?.ink_type || 'ecosolvente';
    const currentBranchId = machineInks[0]?.branch_id || branches[0]?.id || '';

    const channels: ChannelDraft[] = machineInks.map((i) => ({
      id: i.id,
      colorCode: i.color_code,
      colorName: i.color_name,
      colorHex: i.color_hex,
      capacityMl: i.tank_capacity_ml,
      initialPercent: i.remaining_percent,
      variantId: i.variant_id || '',
    }));

    setEditForm({
      originalName: machineName,
      name: machineName,
      inkType: currentInkType,
      branchId: currentBranchId,
      notes: machineInks[0]?.notes || '',
      channels,
    });
    setEditPrinterTarget(machineName);
  };

  const handleEditPrinterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPrinterTarget) return;

    const newMachineName = editForm.name.trim();
    if (!newMachineName) {
      onNotice?.('El nombre de la impresora no puede estar vacío.');
      return;
    }

    try {
      const originalChannels = inks.filter((i) => i.machine_name === editPrinterTarget);
      const originalIds = new Set(originalChannels.map((c) => c.id));
      const keptIds = new Set(editForm.channels.map((c) => c.id).filter(Boolean));

      // Canales a eliminar
      const idsToDelete = [...originalIds].filter((id) => !keptIds.has(id));

      if (supabase && idsToDelete.length > 0) {
        await supabase.from('inventory_active_inks').delete().in('id', idsToDelete);
      }

      // Canales existentes a actualizar
      for (const ch of editForm.channels) {
        if (ch.id && originalIds.has(ch.id)) {
          const cfg = getColorConfig(ch.colorCode);
          const updateData = {
            machine_name: newMachineName,
            color_code: ch.colorCode,
            color_name: ch.colorName || cfg.name,
            color_hex: ch.colorHex || cfg.hex,
            ink_type: editForm.inkType,
            tank_capacity_ml: ch.capacityMl,
            variant_id: ch.variantId || null,
            updated_at: new Date().toISOString(),
          };

          if (supabase) {
            await supabase.from('inventory_active_inks').update(updateData).eq('id', ch.id);
          }
        } else if (!ch.id) {
          // Nuevos canales agregados en edición
          const cfg = getColorConfig(ch.colorCode);
          const newRow = {
            id: globalThis.crypto?.randomUUID?.() || `ink-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            organization_id: organizationId,
            branch_id: editForm.branchId || branches[0]?.id || 'f499caf7-6286-4c6e-abd7-d79fa58c27d0',
            variant_id: ch.variantId || null,
            location_code: 'MAIN',
            machine_name: newMachineName,
            color_code: ch.colorCode,
            color_name: ch.colorName || cfg.name,
            color_hex: ch.colorHex || cfg.hex,
            ink_type: editForm.inkType,
            tank_capacity_ml: ch.capacityMl || 1000,
            remaining_percent: ch.initialPercent || 100,
            operator_name: operatorDefaultName || 'Taller',
            notes: `Canal añadido a ${newMachineName}`,
            status: 'en_uso',
            last_measured_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          if (supabase) {
            await supabase.from('inventory_active_inks').insert(newRow);
          }
        }
      }

      // Actualizar estado en memoria
      await loadInks();
      setEditPrinterTarget(null);
      if (selectedMachine === editPrinterTarget) {
        setSelectedMachine(newMachineName);
      }
      onNotice?.(`¡Impresora “${newMachineName}” y sus canales de tinta actualizados con éxito!`);
    } catch (err: any) {
      onNotice?.(`Error al actualizar impresora: ${err.message}`);
    }
  };

  // --- ACCIÓN DE ELIMINAR IMPRESORA ---
  const handleConfirmDeletePrinter = async () => {
    if (!deletePrinterTarget) return;

    try {
      if (supabase) {
        const { error } = await supabase
          .from('inventory_active_inks')
          .delete()
          .eq('organization_id', organizationId)
          .eq('machine_name', deletePrinterTarget);

        if (error) {
          console.warn('Error al eliminar en Supabase:', error.message);
        }
      }

      setInks((prev) => prev.filter((i) => i.machine_name !== deletePrinterTarget));
      if (selectedMachine === deletePrinterTarget) {
        setSelectedMachine('todas');
      }
      onNotice?.(`La impresora “${deletePrinterTarget}” y sus canales de tinta han sido eliminados.`);
      setDeletePrinterTarget(null);
    } catch (err: any) {
      onNotice?.(`Error al eliminar impresora: ${err.message}`);
    }
  };

  // --- VINCULACIÓN RÁPIDA DE VARIANTE DESDE LA TARJETA ---
  const handleSaveQuickLink = async (variantId: string) => {
    if (!quickLinkInk) return;

    try {
      const nextVariantId = variantId || null;
      if (supabase) {
        await supabase
          .from('inventory_active_inks')
          .update({
            variant_id: nextVariantId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', quickLinkInk.id);
      }

      setInks((prev) =>
        prev.map((i) => (i.id === quickLinkInk.id ? { ...i, variant_id: nextVariantId } : i))
      );

      const linked = getLinkedVariantInfo(nextVariantId);
      onNotice?.(
        linked
          ? `Canal ${quickLinkInk.color_name} vinculado a “${linked.name} (${linked.sku})”.`
          : `Canal ${quickLinkInk.color_name} desvinculado de bodega.`
      );
      setQuickLinkInk(null);
    } catch (err: any) {
      onNotice?.(`Error al vincular: ${err.message}`);
    }
  };

  // Listado de máquinas únicas y datos agregados
  const machineList = useMemo(() => {
    return Array.from(new Set(inks.map((i) => i.machine_name))).sort();
  }, [inks]);

  // Filtrado de tintas
  const filteredInks = useMemo(() => {
    return inks.filter((i) => {
      if (selectedMachine !== 'todas' && i.machine_name !== selectedMachine) return false;
      if (colorFilter === 'peligro' && i.remaining_percent > 30) return false;
      if (colorFilter !== 'todos' && colorFilter !== 'peligro' && i.color_code !== colorFilter)
        return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesMachine = i.machine_name.toLowerCase().includes(q);
        const matchesColor = i.color_name.toLowerCase().includes(q);
        const matchesCode = i.color_code.toLowerCase().includes(q);
        const matchesType = i.ink_type.toLowerCase().includes(q);
        const linkedInfo = getLinkedVariantInfo(i.variant_id);
        const matchesLinked =
          linkedInfo &&
          (linkedInfo.name.toLowerCase().includes(q) || linkedInfo.sku.toLowerCase().includes(q));
        if (!matchesMachine && !matchesColor && !matchesCode && !matchesType && !matchesLinked)
          return false;
      }
      return true;
    });
  }, [inks, selectedMachine, colorFilter, search, inkInventoryOptions]);

  // Agrupadas por máquina para la vista por estaciones
  const groupedByMachine = useMemo(() => {
    const map = new Map<string, ActiveInk[]>();
    filteredInks.forEach((ink) => {
      const list = map.get(ink.machine_name) || [];
      list.push(ink);
      map.set(ink.machine_name, list);
    });

    const order = ['C', 'M', 'Y', 'K', 'LC', 'LM', 'W', 'V', 'FL', 'OTRO'];
    map.forEach((list) => {
      list.sort((a, b) => order.indexOf(a.color_code) - order.indexOf(b.color_code));
    });

    return Array.from(map.entries());
  }, [filteredInks]);

  // Flota consolidada de máquinas para el modal de resumen
  const fleetSummary = useMemo(() => {
    const map = new Map<string, ActiveInk[]>();
    inks.forEach((ink) => {
      const list = map.get(ink.machine_name) || [];
      list.push(ink);
      map.set(ink.machine_name, list);
    });

    return Array.from(map.entries()).map(([name, channels]) => {
      const inkType = channels[0]?.ink_type || 'ecosolvente';
      const lowestPercent = Math.min(...channels.map((c) => c.remaining_percent));
      const criticalCount = channels.filter((c) => c.remaining_percent <= 20).length;
      return {
        name,
        inkType,
        channels,
        lowestPercent,
        criticalCount,
      };
    });
  }, [inks]);

  // Conteo de tintas críticas (<= 20%)
  const criticalCount = useMemo(
    () => inks.filter((i) => i.remaining_percent <= 20).length,
    [inks]
  );

  const getMlEstimate = (ink: ActiveInk) => {
    const ml = (ink.tank_capacity_ml * ink.remaining_percent) / 100;
    return Math.round(ml);
  };

  const getInkStatusClass = (pct: number) => {
    if (pct <= 15) return 'is-critical';
    if (pct <= 30) return 'is-warning';
    return 'is-healthy';
  };

  return (
    <div className="vc-live-inks-container">
      {/* Cabecera Principal */}
      <div className="vc-live-inks-header">
        <div className="vc-live-inks-title-block">
          <div className="vc-live-badge-live">
            <span className="vc-pulse-dot" /> EN VIVO EN MÁQUINA
          </div>
          <h2>Control Diario de Tintas e Impresoras CMYK</h2>
          <p>
            Monitorea en tiempo real los tanques de <b>Cian (C)</b>, <b>Magenta (M)</b>,{' '}
            <b>Amarillo (Y)</b> y <b>Negro (K)</b> de cada plotter. Administra tu flota de
            impresoras, configura qué tintas utilizan y sincronízalas directamente con el stock de
            bodega.
          </p>
        </div>

        <div className="vc-live-inks-actions">
          {criticalCount > 0 && (
            <button
              type="button"
              className="vc-live-alert-pill"
              onClick={() => setColorFilter('peligro')}
              title="Filtrar tintas críticas"
            >
              <AlertTriangle size={15} />
              <span>
                <b>{criticalCount}</b> {criticalCount === 1 ? 'tinta por agotarse' : 'tintas por agotarse'}
              </span>
            </button>
          )}

          <button
            type="button"
            className="button button-outline"
            onClick={() => setShowFleetModal(true)}
            title="Ver flota completa de impresoras y estado consolidado"
          >
            <Printer size={15} /> Flota ({machineList.length})
          </button>

          <div className="vc-live-view-toggle" role="group" aria-label="Modo de vista">
            <button
              type="button"
              className={viewMode === 'machines' ? 'is-active' : ''}
              onClick={() => setViewMode('machines')}
              title="Vista de Estaciones por Máquina"
            >
              <Printer size={15} /> Estaciones
            </button>
            <button
              type="button"
              className={viewMode === 'grid' ? 'is-active' : ''}
              onClick={() => setViewMode('grid')}
              title="Vista Cuadrícula Individual"
            >
              <LayoutGrid size={15} /> Cuadrícula
            </button>
          </div>

          <button
            type="button"
            className="button button-outline"
            onClick={loadInks}
            disabled={loading}
            title="Refrescar niveles en vivo"
          >
            <RefreshCw size={14} className={loading ? 'vc-spin' : ''} /> Refrescar
          </button>

          {canEdit && (
            <button
              type="button"
              className="button button-outline"
              onClick={() => {
                setBatchModalPrinter('');
                setShowBatchModal(true);
              }}
              title="Crear lote de tintas CMYK en bodega y vincular a máquinas"
            >
              <Droplets size={15} /> + Lote Tintas CMYK
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              className="button button-dark"
              onClick={handleOpenCreatePrinter}
              title="Crear una nueva impresora y configurar sus tanques"
            >
              <Plus size={15} /> Nueva Impresora / Plotter
            </button>
          )}
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="vc-live-inks-filters">
        <div className="vc-live-filter-chips" role="group" aria-label="Filtrar por máquina o color">
          {/* Selector de Máquina */}
          <button
            type="button"
            className={selectedMachine === 'todas' ? 'is-active' : ''}
            onClick={() => setSelectedMachine('todas')}
          >
            Todas las máquinas ({machineList.length})
          </button>
          {machineList.map((m) => (
            <button
              key={m}
              type="button"
              className={selectedMachine === m ? 'is-active' : ''}
              onClick={() => setSelectedMachine(m)}
            >
              {m}
            </button>
          ))}

          {/* Separador */}
          <span className="vc-filter-divider" />

          {/* Filtros rápidos por Canal CMYK */}
          <button
            type="button"
            className={`chip-cmyk chip-c ${colorFilter === 'C' ? 'is-active' : ''}`}
            onClick={() => setColorFilter(colorFilter === 'C' ? 'todos' : 'C')}
          >
            <span className="cmyk-dot dot-c" /> Cian (C)
          </button>
          <button
            type="button"
            className={`chip-cmyk chip-m ${colorFilter === 'M' ? 'is-active' : ''}`}
            onClick={() => setColorFilter(colorFilter === 'M' ? 'todos' : 'M')}
          >
            <span className="cmyk-dot dot-m" /> Magenta (M)
          </button>
          <button
            type="button"
            className={`chip-cmyk chip-y ${colorFilter === 'Y' ? 'is-active' : ''}`}
            onClick={() => setColorFilter(colorFilter === 'Y' ? 'todos' : 'Y')}
          >
            <span className="cmyk-dot dot-y" /> Amarillo (Y)
          </button>
          <button
            type="button"
            className={`chip-cmyk chip-k ${colorFilter === 'K' ? 'is-active' : ''}`}
            onClick={() => setColorFilter(colorFilter === 'K' ? 'todos' : 'K')}
          >
            <span className="cmyk-dot dot-k" /> Negro (K)
          </button>

          {criticalCount > 0 && (
            <button
              type="button"
              className={`chip-danger ${colorFilter === 'peligro' ? 'is-active' : ''}`}
              onClick={() => setColorFilter(colorFilter === 'peligro' ? 'todos' : 'peligro')}
            >
              ⚠️ Por agotarse ({criticalCount})
            </button>
          )}
        </div>

        <div className="vc-live-search-box">
          <Search size={15} />
          <input
            type="text"
            placeholder="Buscar por máquina, color, SKU o tinta de bodega…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Contenido Principal: Estaciones o Cuadrícula */}
      {loading && inks.length === 0 ? (
        <div className="vc-live-loading">
          <LoaderCircle size={28} className="vc-spin" />
          <p>Conectando con plotters y sensores de tinta…</p>
        </div>
      ) : filteredInks.length === 0 ? (
        <div className="vc-live-empty">
          <Droplet size={36} />
          <h3>No se encontraron registros de tinta con este filtro</h3>
          <p>Modifica los filtros seleccionados o añade canales de tinta a la máquina.</p>
          {canEdit && (
            <button
              type="button"
              className="button button-outline"
              style={{ marginTop: 12 }}
              onClick={handleOpenCreatePrinter}
            >
              <Plus size={15} /> Registrar nueva impresora
            </button>
          )}
        </div>
      ) : viewMode === 'machines' ? (
        /* VISTA DE ESTACIONES POR MÁQUINA */
        <div className="vc-machine-stations-grid">
          {groupedByMachine.map(([machineName, machineInks]) => {
            const hasCritical = machineInks.some((i) => i.remaining_percent <= 15);
            const hasWarning = machineInks.some((i) => i.remaining_percent <= 30);
            const machineType = machineInks[0]?.ink_type || 'ecosolvente';

            return (
              <section
                key={machineName}
                className={`vc-machine-station-card ${
                  hasCritical ? 'has-critical-ink' : hasWarning ? 'has-warning-ink' : ''
                }`}
              >
                <header className="vc-station-header">
                  <div className="vc-station-title-group">
                    <span className="vc-station-icon">
                      <Printer size={18} />
                    </span>
                    <div>
                      <div className="vc-station-name-row">
                        <h3>{machineName}</h3>
                        <select
                          className={`vc-machine-status-select is-${machineStatusMap[machineName] || 'operativa'}`}
                          value={machineStatusMap[machineName] || 'operativa'}
                          disabled={!canEdit}
                          onChange={(e) => {
                            const val = e.target.value as any;
                            setMachineStatusMap((prev) => ({ ...prev, [machineName]: val }));
                            const labels = {
                              operativa: '🟢 Operativa',
                              standby: '🟡 Standby',
                              mantenimiento: '🟠 En Mantenimiento',
                              parada: '🔴 Parada Técnica',
                            };
                            onNotice?.(`Estado de “${machineName}”: ${labels[val as keyof typeof labels]}`);
                          }}
                          title="Estado operativo de la máquina"
                        >
                          <option value="operativa">🟢 Operativa</option>
                          <option value="standby">🟡 Standby</option>
                          <option value="mantenimiento">🟠 Mantenimiento</option>
                          <option value="parada">🔴 Parada</option>
                        </select>
                      </div>
                      <div className="vc-station-tags">
                        <span className="vc-ink-type-tag">{machineType.toUpperCase()}</span>
                        <span className="vc-station-channel-count">
                          {machineInks.length} canales activos
                        </span>
                        <button
                          type="button"
                          className={`vc-station-nozzle-badge is-${machineNozzleCheck[machineName]?.status || 'ok'}`}
                          onClick={() => setNozzleCheckModalMachine(machineName)}
                          title="Registrar o consultar Test de Inyectores (Nozzle Check)"
                        >
                          <Sparkles size={11} />
                          <span>
                            Inyectores: <b>{machineNozzleCheck[machineName]?.status === 'warning' ? 'Desvíos leves' : machineNozzleCheck[machineName]?.status === 'error' ? 'Tapados' : '100% OK'}</b>
                          </span>
                          <small>{machineNozzleCheck[machineName]?.time || 'Hoy'}</small>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="vc-station-actions">
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          className="button button-outline button-small"
                          onClick={() => openMachineBatchModal(machineName)}
                          title="Ajustar todos los canales CMYK juntos"
                        >
                          <SlidersHorizontal size={13} /> Ajustar CMYK
                        </button>
                        <button
                          type="button"
                          className="button button-outline button-small"
                          onClick={() => handleOpenEditPrinter(machineName)}
                          title="Editar impresora, nombre y configurar qué tintas utiliza"
                        >
                          <Pencil size={13} /> Configurar
                        </button>
                        <button
                          type="button"
                          className="button button-ghost button-small vc-btn-danger-ghost"
                          onClick={() => setDeletePrinterTarget(machineName)}
                          title="Eliminar esta impresora y sus canales"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </header>

                {/* Bahía de Tanques CMYK de la Máquina */}
                <div className="vc-station-cmyk-bay">
                  {machineInks.map((ink) => {
                    const isBusy = updatingId === ink.id;
                    const statusClass = getInkStatusClass(ink.remaining_percent);
                    const estMl = getMlEstimate(ink);
                    const colorCfg = getColorConfig(ink.color_code, ink.color_name, ink.color_hex);
                    const linkedVariant = getLinkedVariantInfo(ink.variant_id);
                    const warehouseStock = linkedVariant ? linkedVariant.quantity : null;
                    const isMachineLow = ink.remaining_percent <= 20;

                    return (
                      <div
                        key={ink.id}
                        className={`vc-bay-cartridge ${statusClass} is-color-${ink.color_code.toLowerCase()}`}
                      >
                        {/* Header de Tanque */}
                        <div className="vc-cartridge-header">
                          <span
                            className="vc-cmyk-channel-badge"
                            style={{
                              backgroundColor: colorCfg.badgeBg,
                              color: colorCfg.textDark ? '#713f12' : colorCfg.hex,
                              borderColor: colorCfg.hex,
                            }}
                          >
                            <b>{ink.color_code}</b>
                          </span>
                          <span className="vc-cartridge-color-name">{colorCfg.name}</span>
                        </div>

                        {/* Visualizador de Tanque / Fluido */}
                        <div className="vc-tank-visual-wrap">
                          <div className="vc-tank-cylinder">
                            {/* Líneas de graduación */}
                            <div className="vc-tank-marks">
                              <span className="mark-100">100%</span>
                              <span className="mark-75">75%</span>
                              <span className="mark-50">50%</span>
                              <span className="mark-25">25%</span>
                            </div>

                            {/* Líquido coloreado */}
                            <div
                              className="vc-tank-fluid"
                              style={{
                                height: `${Math.max(6, ink.remaining_percent)}%`,
                                background: colorCfg.bgGradient,
                              }}
                            >
                              <div className="vc-tank-liquid-wave" />
                            </div>

                            {/* Brillo de vidrio */}
                            <div className="vc-tank-glass-glare" />
                          </div>

                          {/* Métrica de Nivel */}
                          <div className="vc-tank-metrics">
                            <div className="vc-tank-pct">
                              <b>{Math.round(ink.remaining_percent)}</b>
                              <span>%</span>
                            </div>
                            <div className="vc-tank-ml">
                              ~{estMl} ml <span>/ {ink.tank_capacity_ml} ml</span>
                            </div>
                            {ink.remaining_percent <= 15 && (
                              <span className="vc-tank-critical-pill">¡CRÍTICO!</span>
                            )}
                          </div>
                        </div>

                        {/* Bloque de Conexión con Inventario de Bodega */}
                        <div className="vc-cartridge-inventory-block">
                          {linkedVariant ? (
                            <div className="vc-inv-link-active" title={`SKU: ${linkedVariant.sku}`}>
                              <div className="vc-inv-link-header">
                                <Boxes size={12} className="vc-inv-link-icon" />
                                <span className="vc-inv-link-title" title={linkedVariant.name}>
                                  {linkedVariant.name}
                                </span>
                                {canEdit && (
                                  <button
                                    type="button"
                                    className="vc-inv-link-change-btn"
                                    onClick={() => setQuickLinkInk(ink)}
                                    title="Cambiar tinta vinculada de bodega"
                                  >
                                    Cambiar
                                  </button>
                                )}
                              </div>
                              <div className="vc-inv-link-stock-row">
                                <span
                                  className={`vc-inv-stock-pill ${
                                    linkedVariant.quantity > 0 ? 'is-in-stock' : 'is-out-of-stock'
                                  }`}
                                >
                                  Bodega: <b>{linkedVariant.quantity}</b> {linkedVariant.unit || 'botellas'}
                                </span>
                              </div>
                              {/* Alerta contextual */}
                              {isMachineLow && linkedVariant.quantity > 0 && (
                                <small className="vc-inv-alert-note ok">
                                  Hay {linkedVariant.quantity} botellas en bodega para recargar
                                </small>
                              )}
                              {linkedVariant.quantity <= 0 ? (
                                <div className="vc-inv-alert-action-row">
                                  <small className="vc-inv-alert-note danger">
                                    🚨 ¡Sin stock en bodega!
                                  </small>
                                  {canEdit && (
                                    <button
                                      type="button"
                                      className="vc-quick-entry-btn"
                                      onClick={() => {
                                        setQuickEntryQty(4);
                                        setQuickEntryInk({ ink, variant: linkedVariant });
                                      }}
                                      title="Registrar entrada rápida de botellas a bodega"
                                    >
                                      <Plus size={10} /> + Entrada
                                    </button>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="vc-inv-link-none">
                              <span className="vc-inv-unlinked-label">Sin vincular a bodega</span>
                              {canEdit && (
                                <button
                                  type="button"
                                  className="vc-inv-bind-btn"
                                  onClick={() => setQuickLinkInk(ink)}
                                  title="Vincular con un artículo de tinta del inventario físico"
                                >
                                  <Link size={11} /> Vincular
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Botones rápidos de ajuste */}
                        {canEdit && (
                          <div className="vc-cartridge-quick-touch">
                            <div className="vc-touch-btn-row">
                              {[100, 75, 50, 25, 10, 0].map((val) => (
                                <button
                                  key={val}
                                  type="button"
                                  className={
                                    Math.round(ink.remaining_percent) === val ? 'is-selected' : ''
                                  }
                                  onClick={() => updatePercent(ink, val)}
                                  disabled={isBusy}
                                >
                                  {val}%
                                </button>
                              ))}
                            </div>

                            {/* Slider suave */}
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="5"
                              value={ink.remaining_percent}
                              disabled={isBusy}
                              onChange={(e) => updatePercent(ink, Number(e.target.value))}
                              aria-label={`Nivel de tinta ${ink.color_name} en ${ink.machine_name}`}
                            />
                          </div>
                        )}

                        {/* Pie de Tanque: Rellenar */}
                        <div className="vc-cartridge-footer">
                          <small>
                            {new Date(ink.last_measured_at).toLocaleTimeString('es-EC', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </small>
                          {canEdit && (
                            <button
                              type="button"
                              className="vc-btn-refill"
                              onClick={() => setRefillTarget(ink)}
                              disabled={isBusy}
                              title="Recargar tanque al 100%"
                            >
                              <Zap size={13} /> Rellenar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        /* VISTA CUADRÍCULA INDIVIDUAL */
        <div className="vc-live-inks-grid">
          {filteredInks.map((ink) => {
            const isBusy = updatingId === ink.id;
            const statusClass = getInkStatusClass(ink.remaining_percent);
            const estMl = getMlEstimate(ink);
            const colorCfg = getColorConfig(ink.color_code, ink.color_name, ink.color_hex);
            const linkedVariant = getLinkedVariantInfo(ink.variant_id);

            return (
              <article key={ink.id} className={`vc-ink-card ${statusClass}`}>
                <div className="vc-ink-card-head">
                  <div>
                    <span className="vc-ink-machine-badge">{ink.machine_name}</span>
                    <div className="vc-ink-title-row">
                      <span
                        className="vc-cmyk-channel-badge large"
                        style={{
                          backgroundColor: colorCfg.badgeBg,
                          color: colorCfg.textDark ? '#713f12' : colorCfg.hex,
                          borderColor: colorCfg.hex,
                        }}
                      >
                        {ink.color_code}
                      </span>
                      <h3>{colorCfg.name}</h3>
                    </div>
                    <span className="vc-ink-type-tag">{ink.ink_type.toUpperCase()}</span>
                  </div>
                  <div className="vc-ink-icon-status">
                    <Droplet
                      size={20}
                      style={{ color: colorCfg.hex, fill: colorCfg.hex, fillOpacity: 0.2 }}
                    />
                  </div>
                </div>

                {/* Visualizador de Tanque */}
                <div className="vc-tank-visual-wrap-grid">
                  <div className="vc-tank-cylinder">
                    <div
                      className="vc-tank-fluid"
                      style={{
                        height: `${Math.max(6, ink.remaining_percent)}%`,
                        background: colorCfg.bgGradient,
                      }}
                    />
                    <div className="vc-tank-glass-glare" />
                  </div>

                  <div className="vc-tank-metrics">
                    <div className="vc-tank-pct">
                      <b>{Math.round(ink.remaining_percent)}</b>
                      <span>%</span>
                    </div>
                    <div className="vc-tank-ml">
                      ~{estMl} ml <span>/ {ink.tank_capacity_ml} ml</span>
                    </div>
                    {ink.remaining_percent <= 15 && (
                      <span className="vc-tank-critical-pill">¡CRÍTICO! Rellenar</span>
                    )}
                  </div>
                </div>

                {/* Info de Inventario Vinculado */}
                <div className="vc-cartridge-inventory-block">
                  {linkedVariant ? (
                    <div className="vc-inv-link-active">
                      <div className="vc-inv-link-header">
                        <Boxes size={12} className="vc-inv-link-icon" />
                        <span className="vc-inv-link-title">{linkedVariant.name}</span>
                      </div>
                      <div className="vc-inv-link-stock-row">
                        <span
                          className={`vc-inv-stock-pill ${
                            linkedVariant.quantity > 0 ? 'is-in-stock' : 'is-out-of-stock'
                          }`}
                        >
                          Stock en bodega: <b>{linkedVariant.quantity}</b> {linkedVariant.unit}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="vc-inv-link-none">
                      <span className="vc-inv-unlinked-label">Sin vincular a bodega</span>
                      {canEdit && (
                        <button
                          type="button"
                          className="vc-inv-bind-btn"
                          onClick={() => setQuickLinkInk(ink)}
                        >
                          <Link size={11} /> Vincular
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Controles táctiles */}
                {canEdit && (
                  <div className="vc-cartridge-quick-touch">
                    <div className="vc-touch-btn-row">
                      {[100, 75, 50, 25, 10, 0].map((val) => (
                        <button
                          key={val}
                          type="button"
                          className={Math.round(ink.remaining_percent) === val ? 'is-selected' : ''}
                          onClick={() => updatePercent(ink, val)}
                          disabled={isBusy}
                        >
                          {val}%
                        </button>
                      ))}
                    </div>

                    <div className="vc-stepper-slider-row">
                      <button
                        type="button"
                        className="vc-stepper-btn"
                        onClick={() => updatePercent(ink, ink.remaining_percent - 5)}
                        disabled={isBusy || ink.remaining_percent <= 0}
                        title="Disminuir nivel en -5%"
                      >
                        −5%
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={ink.remaining_percent}
                        disabled={isBusy}
                        onChange={(e) => updatePercent(ink, Number(e.target.value))}
                      />
                      <button
                        type="button"
                        className="vc-stepper-btn"
                        onClick={() => updatePercent(ink, ink.remaining_percent + 5)}
                        disabled={isBusy || ink.remaining_percent >= 100}
                        title="Aumentar nivel en +5%"
                      >
                        +5%
                      </button>
                    </div>
                  </div>
                )}

                <div className="vc-cartridge-footer">
                  <small>
                    Medido:{' '}
                    {new Date(ink.last_measured_at).toLocaleTimeString('es-EC', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    · {ink.operator_name || 'Taller'}
                  </small>
                  {canEdit && (
                    <div className="vc-cartridge-footer-btns">
                      {linkedVariant && linkedVariant.quantity > 0 && (
                        <button
                          type="button"
                          className="vc-btn-warehouse-refill"
                          onClick={() => handleQuickWarehouseRefill(ink)}
                          disabled={isBusy}
                          title="Recargar al 100% y descontar 1 botella de bodega automáticamente"
                        >
                          <Boxes size={12} /> Bodega (−1)
                        </button>
                      )}
                      <button
                        type="button"
                        className="vc-btn-refill"
                        onClick={() => setRefillTarget(ink)}
                        disabled={isBusy}
                        title="Opciones de recarga o ajuste detallado"
                      >
                        <Zap size={13} /> Rellenar 100%
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* MODAL: Crear Nueva Impresora / Plotter */}
      {showCreatePrinterModal && (
        <div className="vc-live-modal-backdrop" role="presentation">
          <form className="vc-live-modal vc-printer-form-modal" onSubmit={handleCreatePrinterSubmit}>
            <header>
              <Printer size={22} className="vc-modal-icon-printer" />
              <div>
                <h3>Registrar Nueva Impresora / Plotter</h3>
                <p>Configura la máquina, su tecnología y los tanques de tinta conectados a bodega.</p>
              </div>
              <button
                type="button"
                className="vc-modal-close-btn"
                onClick={() => setShowCreatePrinterModal(false)}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </header>

            <div className="vc-live-modal-body vc-form-grid">
              <label className="vc-field-full">
                Nombre de la Impresora o Plotter *
                <input
                  required
                  type="text"
                  placeholder="Ej. Plotter Mimaki UJV100-160 UV, Plotter Epson SureColor F570"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                />
              </label>

              <label>
                Marca / Fabricante
                <select
                  value={createForm.manufacturer}
                  onChange={(e) => setCreateForm({ ...createForm, manufacturer: e.target.value })}
                >
                  <option value="Galaxy">Galaxy</option>
                  <option value="Mimaki">Mimaki</option>
                  <option value="Roland">Roland</option>
                  <option value="Epson">Epson</option>
                  <option value="Ricoh">Ricoh</option>
                  <option value="HP">HP</option>
                  <option value="Canon">Canon</option>
                  <option value="Otro">Otro fabricante</option>
                </select>
              </label>

              <label>
                Tecnología de Tinta
                <select
                  value={createForm.inkType}
                  onChange={(e) => {
                    const nextType = e.target.value as ActiveInk['ink_type'];
                    setCreateForm((prev) => ({
                      ...prev,
                      inkType: nextType,
                      channels: generateChannelsForPreset(prev.preset, prev.defaultCapacityMl, nextType),
                    }));
                  }}
                >
                  <option value="ecosolvente">Eco-solvente</option>
                  <option value="solvente">Solvente</option>
                  <option value="sublimacion">Sublimación</option>
                  <option value="uv">UV Curable</option>
                  <option value="dtf">DTF / Textil</option>
                  <option value="acuosa">Acuosa / EcoTank</option>
                  <option value="otro">Otro</option>
                </select>
              </label>

              <label>
                Plantilla de Canales
                <select
                  value={createForm.preset}
                  onChange={(e) => {
                    const nextPreset = e.target.value as PrinterPreset;
                    setCreateForm((prev) => ({
                      ...prev,
                      preset: nextPreset,
                      channels: generateChannelsForPreset(nextPreset, prev.defaultCapacityMl, prev.inkType),
                    }));
                  }}
                >
                  <option value="cmyk">CMYK Estándar (4 canales: C, M, Y, K)</option>
                  <option value="cmyk_lc_lm">CMYK + LcLm (6 canales con Light Cyan/Magenta)</option>
                  <option value="cmyk_uv_w_v">CMYK + Blanco + Barniz (6 canales UV)</option>
                  <option value="custom">Personalizado (canales a medida)</option>
                </select>
              </label>

              <label>
                Capacidad estándar por tanque (ml)
                <input
                  type="number"
                  min="100"
                  step="50"
                  value={createForm.defaultCapacityMl}
                  onChange={(e) => {
                    const cap = Number(e.target.value) || 1000;
                    setCreateForm((prev) => ({
                      ...prev,
                      defaultCapacityMl: cap,
                      channels: prev.channels.map((ch) => ({ ...ch, capacityMl: cap })),
                    }));
                  }}
                />
              </label>

              {/* SECCIÓN: Configuración de Canales y Vínculo con Bodega */}
              <div className="vc-field-full vc-channels-config-section">
                <div className="vc-channels-section-header">
                  <div>
                    <h4>Tanques y Tintas Conectadas ({createForm.channels.length})</h4>
                    <p>Asigna qué tinta física de bodega abastece cada color de la máquina.</p>
                  </div>
                  <button
                    type="button"
                    className="button button-outline button-small"
                    onClick={() => {
                      const newColorCode: ActiveInk['color_code'] = 'OTRO';
                      setCreateForm((prev) => ({
                        ...prev,
                        channels: [
                          ...prev.channels,
                          {
                            colorCode: newColorCode,
                            colorName: 'Tinta especial',
                            colorHex: '#ea580c',
                            capacityMl: prev.defaultCapacityMl,
                            initialPercent: 100,
                            variantId: '',
                          },
                        ],
                      }));
                    }}
                  >
                    <Plus size={13} /> Añadir otro canal
                  </button>
                </div>

                <div className="vc-channels-config-table">
                  {createForm.channels.map((channel, idx) => {
                    const colorCfg = getColorConfig(channel.colorCode);
                    const linkedVariant = inkInventoryOptions.find((v) => v.variantId === channel.variantId);

                    return (
                      <div key={idx} className="vc-channel-config-row">
                        <div className="vc-channel-badge-col">
                          <select
                            value={channel.colorCode}
                            className="vc-channel-code-select"
                            onChange={(e) => {
                              const newCode = e.target.value as ActiveInk['color_code'];
                              const nextCfg = getColorConfig(newCode);
                              setCreateForm((prev) => {
                                const nextChannels = [...prev.channels];
                                nextChannels[idx] = {
                                  ...nextChannels[idx],
                                  colorCode: newCode,
                                  colorName: nextCfg.name,
                                  colorHex: nextCfg.hex,
                                  variantId: suggestVariantForColor(newCode, prev.inkType),
                                };
                                return { ...prev, channels: nextChannels };
                              });
                            }}
                          >
                            <option value="C">C (Cian)</option>
                            <option value="M">M (Magenta)</option>
                            <option value="Y">Y (Amarillo)</option>
                            <option value="K">K (Negro)</option>
                            <option value="LC">LC (Light Cyan)</option>
                            <option value="LM">LM (Light Magenta)</option>
                            <option value="W">W (Blanco)</option>
                            <option value="V">V (Barniz)</option>
                            <option value="FL">FL (Flush)</option>
                            <option value="OTRO">OTRO</option>
                          </select>
                          <span
                            className="vc-cmyk-dot-preview"
                            style={{ backgroundColor: colorCfg.hex }}
                          />
                        </div>

                        <div className="vc-channel-variant-col">
                          <label>Tinta vinculada en bodega:</label>
                          <select
                            value={channel.variantId}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCreateForm((prev) => {
                                const nextChannels = [...prev.channels];
                                nextChannels[idx] = { ...nextChannels[idx], variantId: val };
                                return { ...prev, channels: nextChannels };
                              });
                            }}
                          >
                            <option value="">-- Sin vincular (Solo monitoreo virtual) --</option>
                            {inkInventoryOptions.map((opt) => (
                              <option key={opt.variantId} value={opt.variantId}>
                                {opt.name} {opt.variant ? `(${opt.variant})` : ''} · Stock: {opt.quantity} {opt.unit} [{opt.sku}]
                              </option>
                            ))}
                          </select>
                          {linkedVariant && (
                            <span
                              className={`vc-inv-stock-indicator ${
                                linkedVariant.quantity > 0 ? 'in-stock' : 'no-stock'
                              }`}
                            >
                              Disponible en bodega: <b>{linkedVariant.quantity}</b> {linkedVariant.unit}
                            </span>
                          )}
                        </div>

                        <div className="vc-channel-capacity-col">
                          <label>Tanque (ml):</label>
                          <input
                            type="number"
                            min="50"
                            step="50"
                            value={channel.capacityMl}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 1000;
                              setCreateForm((prev) => {
                                const nextChannels = [...prev.channels];
                                nextChannels[idx] = { ...nextChannels[idx], capacityMl: val };
                                return { ...prev, channels: nextChannels };
                              });
                            }}
                          />
                        </div>

                        <div className="vc-channel-remove-col">
                          <button
                            type="button"
                            className="vc-btn-icon-danger"
                            title="Quitar este canal"
                            onClick={() => {
                              setCreateForm((prev) => ({
                                ...prev,
                                channels: prev.channels.filter((_, i) => i !== idx),
                              }));
                            }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <label className="vc-field-full">
                Notas y observaciones
                <input
                  type="text"
                  placeholder="Ej. Cabezales i3200, mantenimiento quincenal, perfil ICC asignado"
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                />
              </label>
            </div>

            <footer>
              <button
                type="button"
                className="button button-outline"
                onClick={() => setShowCreatePrinterModal(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="button button-dark">
                <Check size={15} /> Crear Impresora y Canales
              </button>
            </footer>
          </form>
        </div>
      )}

      {/* MODAL: Configurar / Editar Impresora y Canales */}
      {editPrinterTarget && (
        <div className="vc-live-modal-backdrop" role="presentation">
          <form className="vc-live-modal vc-printer-form-modal" onSubmit={handleEditPrinterSubmit}>
            <header>
              <Settings size={22} className="vc-modal-icon-settings" />
              <div>
                <h3>Configurar Impresora: {editPrinterTarget}</h3>
                <p>Modifica el nombre, tecnología y administra las tintas vinculadas a cada tanque.</p>
              </div>
              <button
                type="button"
                className="vc-modal-close-btn"
                onClick={() => setEditPrinterTarget(null)}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </header>

            <div className="vc-live-modal-body vc-form-grid">
              <label className="vc-field-full">
                Nombre de la Impresora *
                <input
                  required
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </label>

              <label>
                Tecnología de Tinta
                <select
                  value={editForm.inkType}
                  onChange={(e) =>
                    setEditForm({ ...editForm, inkType: e.target.value as ActiveInk['ink_type'] })
                  }
                >
                  <option value="ecosolvente">Eco-solvente</option>
                  <option value="solvente">Solvente</option>
                  <option value="sublimacion">Sublimación</option>
                  <option value="uv">UV Curable</option>
                  <option value="dtf">DTF / Textil</option>
                  <option value="acuosa">Acuosa / EcoTank</option>
                  <option value="otro">Otro</option>
                </select>
              </label>

              {/* GESTIÓN DE CANALES ACTIVOS */}
              <div className="vc-field-full vc-channels-config-section">
                <div className="vc-channels-section-header">
                  <div>
                    <h4>Canales y Tanques en Máquina ({editForm.channels.length})</h4>
                    <p>Gestiona los colores instalados y qué artículo de bodega abastece cada uno.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="button button-outline button-small"
                      onClick={() => {
                        setBatchModalPrinter(editForm.name || editForm.originalName);
                        setShowBatchModal(true);
                      }}
                      title="Crear lote de tintas CMYK en bodega y vincular a esta máquina"
                      style={{ borderColor: '#a855f7', color: '#9333ea' }}
                    >
                      <Droplets size={13} /> + Crear Lote CMYK en Bodega
                    </button>
                    <button
                    type="button"
                    className="button button-outline button-small"
                    onClick={() => {
                      setEditForm((prev) => ({
                        ...prev,
                        channels: [
                          ...prev.channels,
                          {
                            colorCode: 'W',
                            colorName: 'Blanco',
                            colorHex: '#ffffff',
                            capacityMl: 1000,
                            initialPercent: 100,
                            variantId: '',
                          },
                        ],
                      }));
                    }}
                  >
                    <Plus size={13} /> Añadir Canal a esta Máquina
                  </button>
                  </div>
                </div>

                <div className="vc-channels-config-table">
                  {editForm.channels.map((channel, idx) => {
                    const colorCfg = getColorConfig(channel.colorCode);
                    const linkedVariant = inkInventoryOptions.find((v) => v.variantId === channel.variantId);

                    return (
                      <div key={idx} className="vc-channel-config-row">
                        <div className="vc-channel-badge-col">
                          <select
                            value={channel.colorCode}
                            className="vc-channel-code-select"
                            onChange={(e) => {
                              const newCode = e.target.value as ActiveInk['color_code'];
                              const nextCfg = getColorConfig(newCode);
                              setEditForm((prev) => {
                                const nextChannels = [...prev.channels];
                                nextChannels[idx] = {
                                  ...nextChannels[idx],
                                  colorCode: newCode,
                                  colorName: nextCfg.name,
                                  colorHex: nextCfg.hex,
                                  variantId: suggestVariantForColor(newCode, prev.inkType),
                                };
                                return { ...prev, channels: nextChannels };
                              });
                            }}
                          >
                            <option value="C">C (Cian)</option>
                            <option value="M">M (Magenta)</option>
                            <option value="Y">Y (Amarillo)</option>
                            <option value="K">K (Negro)</option>
                            <option value="LC">LC (Light Cyan)</option>
                            <option value="LM">LM (Light Magenta)</option>
                            <option value="W">W (Blanco)</option>
                            <option value="V">V (Barniz)</option>
                            <option value="FL">FL (Flush)</option>
                            <option value="OTRO">OTRO</option>
                          </select>
                          <span
                            className="vc-cmyk-dot-preview"
                            style={{ backgroundColor: colorCfg.hex }}
                          />
                        </div>

                        <div className="vc-channel-variant-col">
                          <label>Tinta de inventario vinculada:</label>
                          <select
                            value={channel.variantId}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditForm((prev) => {
                                const nextChannels = [...prev.channels];
                                nextChannels[idx] = { ...nextChannels[idx], variantId: val };
                                return { ...prev, channels: nextChannels };
                              });
                            }}
                          >
                            <option value="">-- Sin vincular a bodega --</option>
                            {inkInventoryOptions.map((opt) => (
                              <option key={opt.variantId} value={opt.variantId}>
                                {opt.name} {opt.variant ? `(${opt.variant})` : ''} · Stock: {opt.quantity} {opt.unit} [{opt.sku}]
                              </option>
                            ))}
                          </select>
                          {linkedVariant && (
                            <span
                              className={`vc-inv-stock-indicator ${
                                linkedVariant.quantity > 0 ? 'in-stock' : 'no-stock'
                              }`}
                            >
                              Stock actual en bodega: <b>{linkedVariant.quantity}</b> {linkedVariant.unit}
                            </span>
                          )}
                        </div>

                        <div className="vc-channel-capacity-col">
                          <label>Tanque (ml):</label>
                          <input
                            type="number"
                            min="50"
                            step="50"
                            value={channel.capacityMl}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 1000;
                              setEditForm((prev) => {
                                const nextChannels = [...prev.channels];
                                nextChannels[idx] = { ...nextChannels[idx], capacityMl: val };
                                return { ...prev, channels: nextChannels };
                              });
                            }}
                          />
                        </div>

                        <div className="vc-channel-remove-col">
                          <button
                            type="button"
                            className="vc-btn-icon-danger"
                            title="Eliminar este canal de la máquina"
                            onClick={() => {
                              setEditForm((prev) => ({
                                ...prev,
                                channels: prev.channels.filter((_, i) => i !== idx),
                              }));
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <footer>
              <div className="vc-modal-footer-left">
                <button
                  type="button"
                  className="button button-ghost vc-btn-danger-ghost"
                  onClick={() => {
                    setEditPrinterTarget(null);
                    setDeletePrinterTarget(editPrinterTarget);
                  }}
                >
                  <Trash2 size={14} /> Eliminar esta impresora
                </button>
              </div>

              <div className="vc-modal-footer-right">
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setEditPrinterTarget(null)}
                >
                  Cancelar
                </button>
                <button type="submit" className="button button-dark">
                  <Check size={15} /> Guardar Cambios de la Impresora
                </button>
              </div>
            </footer>
          </form>
        </div>
      )}

      {/* MODAL: Eliminar Impresora */}
      {deletePrinterTarget && (
        <div className="vc-live-modal-backdrop" role="presentation">
          <div className="vc-live-modal vc-delete-printer-modal">
            <header className="vc-modal-danger-header">
              <ShieldAlert size={24} className="vc-modal-icon-danger" />
              <div>
                <h3>¿Eliminar impresora “{deletePrinterTarget}”?</h3>
                <p>Confirmación de baja de equipo en el taller.</p>
              </div>
            </header>

            <div className="vc-live-modal-body">
              <div className="vc-delete-warning-card">
                <p>
                  Esta acción dará de baja los{' '}
                  <b>
                    {inks.filter((i) => i.machine_name === deletePrinterTarget).length} canales de
                    tinta
                  </b>{' '}
                  registrados en esta máquina (
                  {inks
                    .filter((i) => i.machine_name === deletePrinterTarget)
                    .map((i) => i.color_code)
                    .join(', ')}
                  ) del monitoreo en vivo.
                </p>
                <small>
                  Nota: Los productos físicos y botellas registradas en el inventario de bodega NO se
                  eliminarán.
                </small>
              </div>
            </div>

            <footer>
              <button
                type="button"
                className="button button-outline"
                onClick={() => setDeletePrinterTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button-dark vc-btn-confirm-delete"
                onClick={handleConfirmDeletePrinter}
              >
                <Trash2 size={14} /> Sí, Eliminar Impresora
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* MODAL: Flota Completa de Impresoras (Resumen Ejecutivo) */}
      {showFleetModal && (
        <div className="vc-live-modal-backdrop" role="presentation">
          <div className="vc-live-modal vc-fleet-modal">
            <header>
              <Printer size={22} className="vc-modal-icon-printer" />
              <div>
                <h3>Flota de Impresoras y Plotters ({fleetSummary.length})</h3>
                <p>Vista general de máquinas en taller, tecnologías y estado de sus tanques.</p>
              </div>
              <button
                type="button"
                className="vc-modal-close-btn"
                onClick={() => setShowFleetModal(false)}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </header>

            <div className="vc-live-modal-body vc-fleet-modal-body">
              <div className="vc-fleet-cards-grid">
                {fleetSummary.map((m) => (
                  <div key={m.name} className="vc-fleet-card">
                    <div className="vc-fleet-card-header">
                      <div>
                        <h4>{m.name}</h4>
                        <div className="vc-station-tags">
                          <span className="vc-ink-type-tag">{m.inkType.toUpperCase()}</span>
                          <span className="vc-station-channel-count">
                            {m.channels.length} canales
                          </span>
                        </div>
                      </div>
                      <span
                        className={`vc-fleet-health-badge ${
                          m.criticalCount > 0 ? 'critical' : m.lowestPercent <= 30 ? 'warning' : 'healthy'
                        }`}
                      >
                        {m.criticalCount > 0
                          ? 'Alerta crítica'
                          : m.lowestPercent <= 30
                          ? 'Nivel bajo'
                          : 'Operativo'}
                      </span>
                    </div>

                    <div className="vc-fleet-channels-preview">
                      {m.channels.map((ch) => {
                        const cfg = getColorConfig(ch.color_code);
                        return (
                          <div key={ch.id} className="vc-fleet-channel-mini">
                            <span
                              className="vc-fleet-mini-badge"
                              style={{ backgroundColor: cfg.badgeBg, color: cfg.hex }}
                            >
                              {ch.color_code}
                            </span>
                            <div className="vc-fleet-mini-bar">
                              <div
                                className="vc-fleet-mini-fill"
                                style={{
                                  width: `${ch.remaining_percent}%`,
                                  background: cfg.bgGradient,
                                }}
                              />
                            </div>
                            <small>{Math.round(ch.remaining_percent)}%</small>
                          </div>
                        );
                      })}
                    </div>

                    <div className="vc-fleet-card-footer">
                      <button
                        type="button"
                        className="button button-outline button-small"
                        onClick={() => {
                          setShowFleetModal(false);
                          handleOpenEditPrinter(m.name);
                        }}
                      >
                        <Settings size={13} /> Configurar Tintas
                      </button>
                      <button
                        type="button"
                        className="button button-dark button-small"
                        onClick={() => {
                          setShowFleetModal(false);
                          setSelectedMachine(m.name);
                        }}
                      >
                        Ver en Estaciones
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <footer>
              {canEdit && (
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => {
                    setShowFleetModal(false);
                    handleOpenCreatePrinter();
                  }}
                >
                  <Plus size={14} /> Registrar Otra Impresora
                </button>
              )}
              <button
                type="button"
                className="button button-dark"
                onClick={() => setShowFleetModal(false)}
              >
                Cerrar
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* MODAL: Vinculación Rápida de Tinta con Bodega */}
      {quickLinkInk && (
        <div className="vc-live-modal-backdrop" role="presentation">
          <div className="vc-live-modal vc-quick-link-modal">
            <header>
              <Link size={20} className="vc-modal-icon-zap" />
              <div>
                <h3>Vincular Canal con Inventario Físico</h3>
                <p>
                  {quickLinkInk.machine_name} · Tinta {quickLinkInk.color_name} (
                  {quickLinkInk.color_code})
                </p>
              </div>
            </header>

            <div className="vc-live-modal-body">
              <p className="vc-modal-p-intro">
                Selecciona la botella o artículo de bodega que surte a este tanque para ver su stock
                en tiempo real y descontar existencias automáticamente al rellenar:
              </p>

              <div className="vc-quick-link-picker">
                <select
                  defaultValue={quickLinkInk.variant_id || ''}
                  id="vc-quick-link-select"
                  className="vc-quick-link-select-input"
                >
                  <option value="">-- Sin vincular a bodega (Solo monitoreo de tanque) --</option>
                  {inkInventoryOptions.map((opt) => (
                    <option key={opt.variantId} value={opt.variantId}>
                      {opt.name} {opt.variant ? `(${opt.variant})` : ''} · Stock: {opt.quantity} {opt.unit} [{opt.sku}]
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <footer>
              <button
                type="button"
                className="button button-outline"
                onClick={() => setQuickLinkInk(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button-dark"
                onClick={() => {
                  const selectEl = document.getElementById(
                    'vc-quick-link-select'
                  ) as HTMLSelectElement;
                  void handleSaveQuickLink(selectEl?.value || '');
                }}
              >
                <Check size={14} /> Guardar Vínculo
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* MODAL: Rellenar Tanque Individual */}
      {refillTarget && (
        <div className="vc-live-modal-backdrop" role="presentation">
          <div className="vc-live-modal">
            <header>
              <Zap size={22} className="vc-modal-icon-zap" />
              <div>
                <h3>Recargar Tanque de Tinta al 100%</h3>
                <p>
                  {refillTarget.machine_name} · Tinta {refillTarget.color_name} (
                  {refillTarget.color_code})
                </p>
              </div>
            </header>

            <div className="vc-live-modal-body">
              <div className="vc-refill-summary-box">
                <div
                  className="vc-cmyk-dot-large"
                  style={{
                    backgroundColor:
                      CMYK_COLOR_CONFIG[refillTarget.color_code]?.hex || refillTarget.color_hex,
                  }}
                />
                <div>
                  <h4>
                    Canal {refillTarget.color_name} ({refillTarget.color_code})
                  </h4>
                  <p>
                    Nivel actual: <b>{Math.round(refillTarget.remaining_percent)}%</b> (~
                    {getMlEstimate(refillTarget)} ml) ➔ Se reiniciará al <b>100%</b> (
                    {refillTarget.tank_capacity_ml} ml).
                  </p>
                </div>
              </div>

              {/* Información del artículo de bodega que se descontará */}
              {(() => {
                const linked = getLinkedVariantInfo(refillTarget.variant_id);
                return linked ? (
                  <div className="vc-refill-warehouse-link-info">
                    <Boxes size={16} />
                    <div>
                      <b>Artículo vinculado en bodega:</b> {linked.name}{' '}
                      {linked.variant ? `(${linked.variant})` : ''} · SKU: <code>{linked.sku}</code>
                      <div>
                        Stock actual disponible: <b>{linked.quantity}</b> {linked.unit}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="vc-refill-warehouse-link-info unlinked">
                    <Info size={16} />
                    <span>
                      Este canal no tiene un producto de inventario vinculado. Se recargará en el
                      sistema sin descontar stock físico de bodega.
                    </span>
                  </div>
                );
              })()}

              <label className="vc-live-checkbox-card">
                <input
                  type="checkbox"
                  checked={consumeStockOnRefill}
                  onChange={(e) => setConsumeStockOnRefill(e.target.checked)}
                />
                <div>
                  <b>Descontar 1 botella cerrada (1 Litro) del inventario de bodega</b>
                  <small>
                    Registra automáticamente una salida de bodega por consumo y actualiza las
                    existencias físicas.
                  </small>
                </div>
              </label>
            </div>

            <footer>
              <button
                type="button"
                className="button button-outline"
                onClick={() => setRefillTarget(null)}
                disabled={Boolean(updatingId)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button-dark"
                onClick={handleRefillInk}
                disabled={Boolean(updatingId)}
              >
                {updatingId ? 'Guardando…' : 'Confirmar recarga al 100%'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* MODAL: Ajuste Rápido por Lote de Máquina */}
      {batchMachine && (
        <div className="vc-live-modal-backdrop" role="presentation">
          <div className="vc-live-modal vc-batch-modal">
            <header>
              <SlidersHorizontal size={22} className="vc-modal-icon-zap" />
              <div>
                <h3>Ajustar Canales CMYK en Máquina</h3>
                <p>{batchMachine}</p>
              </div>
            </header>

            <div className="vc-live-modal-body vc-batch-modal-body">
              <p className="vc-batch-intro">
                Ajusta los niveles de todos los colores montados al finalizar la jornada o tirada:
              </p>

              <div className="vc-batch-channels-list">
                {inks
                  .filter((i) => i.machine_name === batchMachine)
                  .map((ink) => {
                    const currentVal = batchDraft[ink.id] ?? Math.round(ink.remaining_percent);
                    const colorCfg = getColorConfig(ink.color_code, ink.color_name, ink.color_hex);

                    return (
                      <div key={ink.id} className="vc-batch-channel-row">
                        <div className="vc-batch-col-badge">
                          <span
                            className="vc-cmyk-channel-badge"
                            style={{
                              backgroundColor: colorCfg.badgeBg,
                              color: colorCfg.textDark ? '#713f12' : colorCfg.hex,
                              borderColor: colorCfg.hex,
                            }}
                          >
                            <b>{ink.color_code}</b>
                          </span>
                          <div>
                            <b>{colorCfg.name}</b>
                            <small>
                              ~{Math.round((ink.tank_capacity_ml * currentVal) / 100)} ml
                            </small>
                          </div>
                        </div>

                        <div className="vc-batch-col-controls">
                          <div className="vc-batch-pct-badge">
                            <b>{currentVal}%</b>
                          </div>
                          <div className="vc-batch-preset-btns">
                            {[100, 75, 50, 25, 10, 0].map((v) => (
                              <button
                                key={v}
                                type="button"
                                className={currentVal === v ? 'is-selected' : ''}
                                onClick={() =>
                                  setBatchDraft((prev) => ({ ...prev, [ink.id]: v }))
                                }
                              >
                                {v}%
                              </button>
                            ))}
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={currentVal}
                            onChange={(e) =>
                              setBatchDraft((prev) => ({
                                ...prev,
                                [ink.id]: Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <footer>
              <button
                type="button"
                className="button button-outline"
                onClick={() => setBatchMachine(null)}
                disabled={batchSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button-dark"
                onClick={handleSaveBatchMachine}
                disabled={batchSaving}
              >
                {batchSaving ? 'Guardando cambios…' : 'Guardar todos los niveles'}
              </button>
            </footer>
          </div>
        </div>
      )}
      {/* MODAL: Crear Lote de Tintas CMYK en Bodega */}
      {showBatchModal && (
        <InventoryCmykBatchModal
          open={showBatchModal}
          onClose={() => setShowBatchModal(false)}
          organizationId={organizationId}
          branches={branches}
          categories={categories}
          areas={areas}
          printers={machineList}
          defaultPrinter={batchModalPrinter}
          onSuccess={async () => {
            await loadInks();
            if (onRefreshInventory) {
              await onRefreshInventory();
            }
            onNotice?.('¡Lote de tintas CMYK registrado y sincronizado con máquinas!');
          }}
          onNotice={onNotice}
        />
      )}

      {/* MODAL: Test de Inyectores (Nozzle Check) */}
      {nozzleCheckModalMachine && (
        <div className="vc-live-modal-backdrop" role="presentation">
          <div className="vc-live-modal vc-nozzle-modal">
            <header>
              <Sparkles size={22} className="vc-modal-icon-settings" />
              <div>
                <h3>Test de Inyectores (Nozzle Check)</h3>
                <p>{nozzleCheckModalMachine} · Registrar estado del cabezal</p>
              </div>
              <button
                type="button"
                className="vc-modal-close-btn"
                onClick={() => setNozzleCheckModalMachine(null)}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </header>
            <div className="vc-live-modal-body">
              <p style={{ fontSize: '13.5px', marginBottom: '14px', color: 'var(--text-muted, #67597a)' }}>
                Selecciona el resultado de la impresión del patrón de inyectores:
              </p>
              <div className="vc-nozzle-options">
                <button
                  type="button"
                  className="vc-nozzle-opt-btn is-ok"
                  onClick={() => {
                    const time = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
                    setMachineNozzleCheck((prev) => ({
                      ...prev,
                      [nozzleCheckModalMachine]: { status: 'ok', time, operator: operatorDefaultName || 'Taller' },
                    }));
                    onNotice?.(`Test de inyectores para “${nozzleCheckModalMachine}”: 100% OK.`);
                    setNozzleCheckModalMachine(null);
                  }}
                >
                  <span className="vc-nozzle-dot green" />
                  <div>
                    <b>🟢 100% OK (Test perfecto)</b>
                    <small>Todos los canales disparan nítidos sin cortes.</small>
                  </div>
                </button>
                <button
                  type="button"
                  className="vc-nozzle-opt-btn is-warning"
                  onClick={() => {
                    const time = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
                    setMachineNozzleCheck((prev) => ({
                      ...prev,
                      [nozzleCheckModalMachine]: { status: 'warning', time, operator: operatorDefaultName || 'Taller' },
                    }));
                    onNotice?.(
                      `Test de inyectores para “${nozzleCheckModalMachine}”: Desvíos leves (Limpieza cabezal recomendada).`
                    );
                    setNozzleCheckModalMachine(null);
                  }}
                >
                  <span className="vc-nozzle-dot yellow" />
                  <div>
                    <b>🟡 Desvíos leves (Limpieza recomendada)</b>
                    <small>Algunas líneas discontinuas. Requiere limpieza estándar de cabezal.</small>
                  </div>
                </button>
                <button
                  type="button"
                  className="vc-nozzle-opt-btn is-error"
                  onClick={() => {
                    const time = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
                    setMachineNozzleCheck((prev) => ({
                      ...prev,
                      [nozzleCheckModalMachine]: { status: 'error', time, operator: operatorDefaultName || 'Taller' },
                    }));
                    onNotice?.(
                      `Test de inyectores para “${nozzleCheckModalMachine}”: Inyectores tapados (Limpieza profunda / Flush).`
                    );
                    setNozzleCheckModalMachine(null);
                  }}
                >
                  <span className="vc-nozzle-dot red" />
                  <div>
                    <b>🔴 Inyectores tapados (Flush / Parada)</b>
                    <small>Cortes severos de tinta. Requiere flush o mantenimiento preventivo.</small>
                  </div>
                </button>
              </div>
            </div>
            <footer>
              <button
                type="button"
                className="button button-outline"
                onClick={() => setNozzleCheckModalMachine(null)}
              >
                Cancelar
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* MODAL: Entrada Rápida a Bodega */}
      {quickEntryInk && (
        <div className="vc-live-modal-backdrop" role="presentation">
          <div className="vc-live-modal">
            <header>
              <Boxes size={22} className="vc-modal-icon-settings" />
              <div>
                <h3>Entrada Rápida a Bodega</h3>
                <p>
                  {quickEntryInk.variant.name} ({quickEntryInk.variant.sku})
                </p>
              </div>
              <button
                type="button"
                className="vc-modal-close-btn"
                onClick={() => setQuickEntryInk(null)}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </header>
            <div className="vc-live-modal-body">
              <p style={{ fontSize: '13.5px', color: 'var(--text-muted, #67597a)' }}>
                Registra de inmediato la recepción de botellas de esta tinta en bodega para recargar la máquina:
              </p>
              <div style={{ display: 'grid', gap: '14px', margin: '14px 0' }}>
                <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                  Cantidad de botellas a ingresar:
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={quickEntryQty}
                    onChange={(e) => setQuickEntryQty(Math.max(1, Number(e.target.value)))}
                    style={{ padding: '8px 12px', fontSize: '15px', borderRadius: '8px' }}
                  />
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[1, 2, 4, 6, 12].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="button button-outline button-small"
                      onClick={() => setQuickEntryQty(n)}
                      style={{ fontWeight: quickEntryQty === n ? 700 : 400 }}
                    >
                      +{n} botellas
                    </button>
                  ))}
                </div>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'var(--surface-muted, #f8f6fc)',
                    border: '1px solid var(--border-soft, #e2d9eb)',
                    fontSize: '13px',
                  }}
                >
                  Stock actual en bodega: <b>{quickEntryInk.variant.quantity}</b> botellas → Nuevo saldo:{' '}
                  <b style={{ color: '#059669' }}>{quickEntryInk.variant.quantity + quickEntryQty}</b> botellas.
                </div>
              </div>
            </div>
            <footer>
              <button
                type="button"
                className="button button-outline"
                onClick={() => setQuickEntryInk(null)}
                disabled={quickEntryBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button-dark"
                disabled={quickEntryBusy}
                onClick={async () => {
                  setQuickEntryBusy(true);
                  try {
                    const { ink, variant } = quickEntryInk;
                    const targetBranchId = ink.branch_id || branches[0]?.id;
                    const newTotal = (variant.quantity || 0) + quickEntryQty;

                    if (supabase) {
                      await supabase.rpc('set_inventory_count', {
                        p_variant_id: variant.variantId,
                        p_branch_id: targetBranchId,
                        p_counted_quantity: newTotal,
                        p_location_code: ink.location_code || 'MAIN',
                        p_note: `Entrada rápida de ${quickEntryQty} botellas para recarga de ${ink.machine_name}`,
                      });
                    }

                    if (onRefreshInventory) {
                      await onRefreshInventory();
                    }

                    onNotice?.(`¡Entrada registrada! Bodega ahora tiene ${newTotal} botellas de ${variant.name}.`);
                    setQuickEntryInk(null);
                  } catch (err: any) {
                    onNotice?.(`Error al registrar entrada: ${err.message}`);
                  } finally {
                    setQuickEntryBusy(false);
                  }
                }}
              >
                {quickEntryBusy ? 'Guardando…' : `Confirmar +${quickEntryQty} botellas en Bodega`}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
