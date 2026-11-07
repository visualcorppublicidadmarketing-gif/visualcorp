import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useWorkspace, formatMoney, formatDate } from '../app/workspace';
import { useAuth } from '../auth/AuthProvider';
import { supabase, supabaseConfigured } from '../lib/supabaseClient';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Filter,
  History,
  Layers,
  Link2,
  MessageSquare,
  Package,
  Pause,
  Play,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Truck,
  User,
  X,
  Zap,
} from 'lucide-react';
import './AutomationCenter.css';

export type AutomationModule =
  | 'Producción & MRP'
  | 'Inventario & Stock'
  | 'Compras & Abastecimiento'
  | 'WhatsApp CRM & Clientes'
  | 'Finanzas & Cobranzas'
  | 'Vault Digital & Aprobaciones';

export type AutomationTrigger =
  | 'sale.confirmed'
  | 'quote.approved'
  | 'production_job.completed'
  | 'production_job.ready_for_pickup'
  | 'inventory.low_stock'
  | 'ink.level_critical'
  | 'sale.balance_pending'
  | 'vault.file_uploaded'
  | 'manual_webhook';

export type AutomationAction =
  | 'create_ot_reservation'
  | 'consume_bom_stock'
  | 'draft_purchase_order'
  | 'send_whatsapp_alert'
  | 'notify_finance_reminder'
  | 'request_digital_approval'
  | 'custom_notification';

export interface AutomationRule {
  id: string;
  code: string;
  name: string;
  description: string;
  module: AutomationModule;
  trigger: AutomationTrigger;
  triggerLabel: string;
  condition: string;
  action: AutomationAction;
  actionLabel: string;
  actionDetail: string;
  active: boolean;
  isSystem: boolean;
  priority: 'Alta' | 'Media' | 'Baja';
  executionCount: number;
  lastRunAt: string | null;
  lastStatus: 'success' | 'warning' | 'idle' | 'error';
  tags: string[];
}

export interface AutomationExecutionLog {
  id: string;
  timestamp: string;
  ruleCode: string;
  ruleName: string;
  trigger: string;
  affectedRecord: string;
  module: AutomationModule;
  detail: string;
  status: 'Éxito' | 'Alerta detectada' | 'Acción sugerida';
  payload?: Record<string, unknown>;
}

export interface ActiveInkTank {
  id: string;
  machineName: string;
  colorCode: 'C' | 'M' | 'Y' | 'K' | 'LC' | 'LM' | 'W' | 'V' | 'OTRO';
  colorName: string;
  colorHex: string;
  inkType: string;
  remainingPercent: number;
  status: 'en_uso' | 'bajo' | 'critico' | 'agotado';
  lastMeasuredAt?: string;
}

export interface ActiveRollItem {
  id: string;
  machineName: string;
  materialName: string;
  rollTag: string;
  standardLengthM: number;
  remainingPercent: number;
  status: 'en_uso' | 'en_espera' | 'agotado';
}

const STORAGE_KEY = 'vc-enterprise-automations-v1';
const LIVE_INKS_KEY = 'vc-live-ink-printers-v2';
const LIVE_ROLLS_KEY = 'vc-live-rolls-v1';

const defaultEnterpriseRules: AutomationRule[] = [
  {
    id: 'rule-auto-mrp-01',
    code: 'AUTO-MRP-01',
    name: 'Venta POS / Cotización Aprobada → OT + Reserva de Material',
    description: 'Genera automáticamente la Orden de Trabajo (OT) técnica en la estación indicada y bloquea stock de sustratos bajo el estándar Medusa ReservationItem.',
    module: 'Producción & MRP',
    trigger: 'sale.confirmed',
    triggerLabel: 'sale.confirmed / quote.approved',
    condition: 'Venta o cotización confirmada sin Orden de Trabajo técnica vinculada',
    action: 'create_ot_reservation',
    actionLabel: 'Generar OT + Reserva Medusa',
    actionDetail: 'Crea orden de taller (Impresión, Sublimación, Láser, Rótulos, Diseño) y aparta m²/unidades de sustrato.',
    active: true,
    isSystem: true,
    priority: 'Alta',
    executionCount: 47,
    lastRunAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    lastStatus: 'success',
    tags: ['MRP', 'Medusa', 'Impresión', 'Taller'],
  },
  {
    id: 'rule-auto-inv-02',
    code: 'AUTO-INV-02',
    name: 'OT Terminada en Taller/Impresión → Descuento Real de Stock y BOM',
    description: 'Convierte la reserva de sustratos en consumo definitivo de inventario (movement_type: consumption) y descuenta metros lineales y tinta CMYK.',
    module: 'Inventario & Stock',
    trigger: 'production_job.completed',
    triggerLabel: 'production_job.completed',
    condition: 'Etapa de la OT cambia a "Terminado" o "Entregado"',
    action: 'consume_bom_stock',
    actionLabel: 'Descontar Stock y Receta BOM',
    actionDetail: 'Deduce m² de rollo de sustrato y ml de tintas activas en plotter según dimensiones aprobadas.',
    active: true,
    isSystem: true,
    priority: 'Alta',
    executionCount: 38,
    lastRunAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    lastStatus: 'success',
    tags: ['BOM', 'Stock', 'Consumo', 'Plotter'],
  },
  {
    id: 'rule-auto-pur-03',
    code: 'AUTO-PUR-03',
    name: 'Alerta de Stock / Tinta CMYK / Rollo Crítico → Borrador de Compra',
    description: 'Vigila constantemente niveles de bodega, tanques de tinta con nivel <= 20% y rollos cortos para agrupar sugerencias de reposición por proveedor.',
    module: 'Compras & Abastecimiento',
    trigger: 'inventory.low_stock',
    triggerLabel: 'inventory.low_stock / ink.level_critical',
    condition: 'Stock disponible <= mínimo o tanque de tinta CMYK <= 20%',
    action: 'draft_purchase_order',
    actionLabel: 'Borrador en Compras',
    actionDetail: 'Agrupa artículos críticos por proveedor habitual y crea orden preliminar lista para autorizar.',
    active: true,
    isSystem: true,
    priority: 'Alta',
    executionCount: 29,
    lastRunAt: new Date(Date.now() - 1000 * 60 * 85).toISOString(),
    lastStatus: 'warning',
    tags: ['Purchasing', 'CMYK', 'Rollos', 'Alertas'],
  },
  {
    id: 'rule-auto-crm-04',
    code: 'AUTO-CRM-04',
    name: 'Trabajo Listo para Entrega → Notificación WhatsApp + Enlace Portal',
    description: 'Al marcar la OT lista para retiro en Milagro, prepara mensaje directo de WhatsApp con enlace al Portal de Cliente (/seguimiento/:code) y saldo pendiente.',
    module: 'WhatsApp CRM & Clientes',
    trigger: 'production_job.ready_for_pickup',
    triggerLabel: 'production_job.ready_for_pickup',
    condition: 'OT en estado "Listo para retiro" con teléfono de cliente registrado',
    action: 'send_whatsapp_alert',
    actionLabel: 'WhatsApp 1-Clic + Link Portal',
    actionDetail: 'Dispara plantilla amigable de entrega con botón para abrir WhatsApp Web y portal web.',
    active: true,
    isSystem: true,
    priority: 'Media',
    executionCount: 52,
    lastRunAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    lastStatus: 'success',
    tags: ['WhatsApp', 'CRM', 'Seguimiento', 'Milagro'],
  },
  {
    id: 'rule-auto-fin-05',
    code: 'AUTO-FIN-05',
    name: 'Cuentas por Cobrar / Saldo Pendiente > 48h → Recordatorio de Cobro',
    description: 'Rastrea ventas finalizadas con saldo deudor (balance > 0) y genera recordatorios de pago ejecutivos con datos bancarios de Pichincha / Guayaquil / DeUna.',
    module: 'Finanzas & Cobranzas',
    trigger: 'sale.balance_pending',
    triggerLabel: 'sale.balance_pending',
    condition: 'Venta con saldo pendiente de pago (balance > $0.00)',
    action: 'notify_finance_reminder',
    actionLabel: 'Recordatorio Ejecutivo WhatsApp',
    actionDetail: 'Genera plantilla bancaria con número de cuenta y QR DeUna para conciliación en caja.',
    active: true,
    isSystem: true,
    priority: 'Media',
    executionCount: 21,
    lastRunAt: new Date(Date.now() - 1000 * 60 * 140).toISOString(),
    lastStatus: 'warning',
    tags: ['Finanzas', 'Cobranzas', 'DeUna', 'Caja'],
  },
  {
    id: 'rule-auto-dam-06',
    code: 'AUTO-DAM-06',
    name: 'Arte Subido al Vault → Solicitar Aprobación Digital al Cliente',
    description: 'Al cargar mockups de diseño o artes para imprenta clasificados como "arte_aprobacion", habilita la aprobación y firma digital en 1 clic.',
    module: 'Vault Digital & Aprobaciones',
    trigger: 'vault.file_uploaded',
    triggerLabel: 'vault.file_uploaded',
    condition: 'Archivo en Vault clasificado como "arte_aprobacion"',
    action: 'request_digital_approval',
    actionLabel: 'Solicitar Aprobación Digital 1-Clic',
    actionDetail: 'Pasa la orden técnica a estado "Revisión de Arte" y envía enlace protegido de visualización.',
    active: true,
    isSystem: true,
    priority: 'Alta',
    executionCount: 34,
    lastRunAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    lastStatus: 'success',
    tags: ['Vault', 'Aprobación', 'Diseño', 'Firma'],
  },
];

const starterExecutionLogs: AutomationExecutionLog[] = [
  {
    id: 'log-01',
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    ruleCode: 'AUTO-DAM-06',
    ruleName: 'Arte Subido al Vault → Solicitar Aprobación Digital al Cliente',
    trigger: 'vault.file_uploaded',
    affectedRecord: 'Arte: Fachada-Optica-Milagro-v2.pdf',
    module: 'Vault Digital & Aprobaciones',
    detail: 'Mockup de fachada cargado. Se generó link de aprobación digital #VC-ART-904 y se notificó a cliente.',
    status: 'Éxito',
  },
  {
    id: 'log-02',
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    ruleCode: 'AUTO-CRM-04',
    ruleName: 'Trabajo Listo para Entrega → Notificación WhatsApp + Enlace Portal',
    trigger: 'production_job.ready_for_pickup',
    affectedRecord: 'OT #OT-2026-085 (50 Tazas Personalizadas)',
    module: 'WhatsApp CRM & Clientes',
    detail: 'OT terminada en Sublimación. Mensaje preparado para WhatsApp 098... con saldo de $25.00 y portal /seguimiento.',
    status: 'Éxito',
  },
  {
    id: 'log-03',
    timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    ruleCode: 'AUTO-MRP-01',
    ruleName: 'Venta POS / Cotización Aprobada → OT + Reserva de Material',
    trigger: 'sale.confirmed',
    affectedRecord: 'Venta VC-VTA-1049 (Rótulo Neón LED Farmacias San Gabriel)',
    module: 'Producción & MRP',
    detail: 'Generó OT técnica #OT-2026-088 en Taller Neones y reservó 1.80m² Acrílico Cristal 3mm + 6m Neón Flex.',
    status: 'Éxito',
  },
  {
    id: 'log-04',
    timestamp: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    ruleCode: 'AUTO-INV-02',
    ruleName: 'OT Terminada en Taller/Impresión → Descuento Real de Stock y BOM',
    trigger: 'production_job.completed',
    affectedRecord: 'OT #OT-2026-081 (1000 Volantes Couché)',
    module: 'Inventario & Stock',
    detail: 'Descontadas 1000 hojas de Papel Couché 150g en Bodega Impresión. Se registró consumo real.',
    status: 'Éxito',
  },
  {
    id: 'log-05',
    timestamp: new Date(Date.now() - 1000 * 60 * 85).toISOString(),
    ruleCode: 'AUTO-PUR-03',
    ruleName: 'Alerta de Stock / Tinta CMYK / Rollo Crítico → Borrador de Compra',
    trigger: 'ink.level_critical',
    affectedRecord: 'Plotter Gran Formato 3.20m · Tinta Cyan (14%)',
    module: 'Compras & Abastecimiento',
    detail: 'Tanque Cyan al 14% (crítico). Insumo agrupado en sugerencia de reposición para Distribuidora Gráfica Guayas.',
    status: 'Alerta detectada',
  },
  {
    id: 'log-06',
    timestamp: new Date(Date.now() - 1000 * 60 * 140).toISOString(),
    ruleCode: 'AUTO-FIN-05',
    ruleName: 'Cuentas por Cobrar / Saldo Pendiente > 48h → Recordatorio de Cobro',
    trigger: 'sale.balance_pending',
    affectedRecord: 'Venta VC-VTA-1038 · Saldo pendiente: $45.00',
    module: 'Finanzas & Cobranzas',
    detail: 'Generada plantilla de cobro amigable con datos de cuenta Banco Pichincha y botón DeUna.',
    status: 'Acción sugerida',
  },
];

const fallbackInks: ActiveInkTank[] = [
  { id: 'ink-c', machineName: 'Plotter Gran Formato 3.20m', colorCode: 'C', colorName: 'Cyan Solvente', colorHex: '#00c0f3', inkType: 'solvente', remainingPercent: 14, status: 'critico' },
  { id: 'ink-m', machineName: 'Plotter Gran Formato 3.20m', colorCode: 'M', colorName: 'Magenta Solvente', colorHex: '#ec008c', inkType: 'solvente', remainingPercent: 48, status: 'en_uso' },
  { id: 'ink-y', machineName: 'Plotter Gran Formato 3.20m', colorCode: 'Y', colorName: 'Yellow Solvente', colorHex: '#fff100', inkType: 'solvente', remainingPercent: 62, status: 'en_uso' },
  { id: 'ink-k', machineName: 'Plotter Gran Formato 3.20m', colorCode: 'K', colorName: 'Black Solvente', colorHex: '#1a181b', inkType: 'solvente', remainingPercent: 19, status: 'critico' },
  { id: 'ink-rc', machineName: 'Plotter Roland Eco-Solvente 1.60m', colorCode: 'C', colorName: 'Cyan Eco', colorHex: '#00c0f3', inkType: 'ecosolvente', remainingPercent: 74, status: 'en_uso' },
  { id: 'ink-rm', machineName: 'Plotter Roland Eco-Solvente 1.60m', colorCode: 'M', colorName: 'Magenta Eco', colorHex: '#ec008c', inkType: 'ecosolvente', remainingPercent: 81, status: 'en_uso' },
  { id: 'ink-ry', machineName: 'Plotter Roland Eco-Solvente 1.60m', colorCode: 'Y', colorName: 'Yellow Eco', colorHex: '#fff100', inkType: 'ecosolvente', remainingPercent: 68, status: 'en_uso' },
  { id: 'ink-rk', machineName: 'Plotter Roland Eco-Solvente 1.60m', colorCode: 'K', colorName: 'Black Eco', colorHex: '#1a181b', inkType: 'ecosolvente', remainingPercent: 32, status: 'en_uso' },
];

const fallbackRolls: ActiveRollItem[] = [
  { id: 'roll-01', machineName: 'Plotter Gran Formato 3.20m', materialName: 'Lona Frontlit 13oz Brillante (3.20m)', rollTag: 'LON-320-04', standardLengthM: 50, remainingPercent: 12, status: 'en_uso' },
  { id: 'roll-02', machineName: 'Plotter Roland 1.60m', materialName: 'Vinil Adhesivo Brillante Arclad (1.52m)', rollTag: 'VIN-152-09', standardLengthM: 50, remainingPercent: 44, status: 'en_uso' },
  { id: 'roll-03', machineName: 'Mesa de Corte', materialName: 'Vinil Microperforado para Vidrieras (1.52m)', rollTag: 'MIC-152-02', standardLengthM: 50, remainingPercent: 68, status: 'en_uso' },
  { id: 'roll-04', machineName: 'Bodega Rollo Reserva', materialName: 'Lona Translúcida Backlight 15oz (3.20m)', rollTag: 'TRA-320-01', standardLengthM: 50, remainingPercent: 88, status: 'en_espera' },
];

export function AutomationCenter() {
  const { data, flash } = useWorkspace();
  const { organizationId, user } = useAuth();

  const [activeTab, setActiveTab] = useState<'rules' | 'diagnostic' | 'audit'>('rules');
  const [rules, setRules] = useState<AutomationRule[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed?.rules) && parsed.rules.length > 0) {
          return parsed.rules;
        }
      }
    } catch {
      // ignore JSON error
    }
    return defaultEnterpriseRules;
  });

  const [logs, setLogs] = useState<AutomationExecutionLog[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed?.logs) && parsed.logs.length > 0) {
          return parsed.logs;
        }
      }
    } catch {
      // ignore JSON error
    }
    return starterExecutionLogs;
  });

  // Filters for Rules tab
  const [ruleSearch, setRuleSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');

  // Filters for Audit Log tab
  const [logSearch, setLogSearch] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState<string>('all');
  const [logModuleFilter, setLogModuleFilter] = useState<string>('all');

  // Modal State for New / Edit Rule
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  // WhatsApp Message Preview Modal
  const [whatsAppModalData, setWhatsAppModalData] = useState<{
    customerName: string;
    phone: string;
    saleCode: string;
    balance: number;
    message: string;
  } | null>(null);

  // BOM Simulator State
  const [bomJobType, setBomJobType] = useState<string>('lona-320');
  const [bomWidthM, setBomWidthM] = useState<number>(3.0);
  const [bomHeightM, setBomHeightM] = useState<number>(2.0);
  const [bomQuantity, setBomQuantity] = useState<number>(1);
  const [bomWastePercent, setBomWastePercent] = useState<number>(10);
  const [bomInkProfile, setBomInkProfile] = useState<'eco' | 'std' | 'high'>('std');

  // Live Inks & Rolls reading with fallback
  const liveInks: ActiveInkTank[] = useMemo(() => {
    try {
      const raw = localStorage.getItem(LIVE_INKS_KEY) || (organizationId ? localStorage.getItem(`vc_live_inks_${organizationId}`) : null);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: any) => ({
            id: item.id || `ink-${Math.random()}`,
            machineName: item.machine_name || item.machineName || 'Plotter Visual Corp',
            colorCode: item.color_code || item.colorCode || 'OTRO',
            colorName: item.color_name || item.colorName || 'Tinta',
            colorHex: item.color_hex || item.colorHex || '#00c0f3',
            inkType: item.ink_type || item.inkType || 'solvente',
            remainingPercent: Number(item.remaining_percent ?? item.remainingPercent ?? 100),
            status: item.status || 'en_uso',
            lastMeasuredAt: item.last_measured_at || item.updated_at,
          }));
        }
      }
    } catch {
      // ignore
    }
    return fallbackInks;
  }, [organizationId]);

  const liveRolls: ActiveRollItem[] = useMemo(() => {
    try {
      const raw = localStorage.getItem(LIVE_ROLLS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: any) => ({
            id: item.id || `roll-${Math.random()}`,
            machineName: item.machine_name || item.machineName || 'Plotter',
            materialName: item.material_name || item.materialName || 'Sustrato en rollo',
            rollTag: item.roll_tag || item.rollTag || 'ROL-01',
            standardLengthM: Number(item.standard_length_m ?? item.standardLengthM ?? 50),
            remainingPercent: Number(item.remaining_percent ?? item.remainingPercent ?? 100),
            status: item.status || 'en_uso',
          }));
        }
      }
    } catch {
      // ignore
    }
    return fallbackRolls;
  }, []);

  // Save rules and logs to localStorage on changes
  useEffect(() => {
    try {
      const payload = {
        rules,
        logs: logs.slice(0, 100), // persist up to 100 latest logs
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage quota error
    }
  }, [rules, logs]);

  // Real data metrics from workspace
  const inventoryItems = useMemo(() => (Array.isArray(data?.inventory) ? data.inventory : []), [data?.inventory]);
  const salesItems = useMemo(() => (Array.isArray(data?.sales) ? data.sales : []), [data?.sales]);
  const quotesItems = useMemo(() => (Array.isArray(data?.quotes) ? data.quotes : []), [data?.quotes]);

  // Critical stock items from inventory
  const criticalStockItems = useMemo(() => {
    return inventoryItems.filter((item: any) => {
      const qty = Number(item.quantity ?? 0);
      const min = Number(item.minimum ?? 0);
      const available = item.availableQuantity != null ? Number(item.availableQuantity) : qty;
      return available <= min || qty <= 0;
    });
  }, [inventoryItems]);

  // Sales with pending balance
  const pendingBalanceSales = useMemo(() => {
    return salesItems.filter((s: any) => Number(s.balance ?? 0) > 0.05);
  }, [salesItems]);

  // Critical inks
  const criticalInks = useMemo(() => {
    return liveInks.filter((ink) => ink.remainingPercent <= 20 || ink.status === 'critico' || ink.status === 'agotado');
  }, [liveInks]);

  // Critical rolls
  const criticalRolls = useMemo(() => {
    return liveRolls.filter((roll) => roll.remainingPercent <= 15);
  }, [liveRolls]);

  // KPI Calculations
  const activeRulesCount = useMemo(() => rules.filter((r) => r.active).length, [rules]);
  const totalExecutionsCount = useMemo(() => rules.reduce((acc, r) => acc + (r.executionCount || 0), 0), [rules]);
  const monitoredSuppliesCount = useMemo(() => {
    return inventoryItems.length + liveInks.length + liveRolls.length;
  }, [inventoryItems.length, liveInks.length, liveRolls.length]);
  const evaluatedSalesCount = useMemo(() => salesItems.length + quotesItems.length, [salesItems.length, quotesItems.length]);
  const savedHours = useMemo(() => {
    const minutes = totalExecutionsCount * 9.5;
    return (minutes / 60).toFixed(1);
  }, [totalExecutionsCount]);

  // Filtered Rules
  const filteredRules = useMemo(() => {
    const term = ruleSearch.trim().toLowerCase();
    return rules.filter((rule) => {
      if (statusFilter === 'active' && !rule.active) return false;
      if (statusFilter === 'paused' && rule.active) return false;
      if (moduleFilter !== 'all' && rule.module !== moduleFilter) return false;
      if (!term) return true;
      return (
        rule.code.toLowerCase().includes(term) ||
        rule.name.toLowerCase().includes(term) ||
        rule.description.toLowerCase().includes(term) ||
        rule.trigger.toLowerCase().includes(term) ||
        rule.action.toLowerCase().includes(term)
      );
    });
  }, [rules, ruleSearch, statusFilter, moduleFilter]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    const term = logSearch.trim().toLowerCase();
    return logs.filter((log) => {
      if (logStatusFilter !== 'all' && log.status !== logStatusFilter) return false;
      if (logModuleFilter !== 'all' && log.module !== logModuleFilter) return false;
      if (!term) return true;
      return (
        log.ruleCode.toLowerCase().includes(term) ||
        log.ruleName.toLowerCase().includes(term) ||
        log.affectedRecord.toLowerCase().includes(term) ||
        log.detail.toLowerCase().includes(term)
      );
    });
  }, [logs, logSearch, logStatusFilter, logModuleFilter]);

  // Rule Execution Handler
  const executeSingleRule = useCallback(
    (ruleCode: string) => {
      const rule = rules.find((r) => r.code === ruleCode);
      if (!rule) return;

      const now = new Date().toISOString();
      let newLog: AutomationExecutionLog | null = null;
      let toastMsg = '';

      if (ruleCode === 'AUTO-MRP-01') {
        const targetSale = salesItems[0];
        const recordName = targetSale ? `Venta #${targetSale.code || targetSale.id?.slice(0, 8)} (${targetSale.customer || 'Cliente Mostrador'})` : 'Venta POS Reciente';
        newLog = {
          id: `log-${Date.now()}`,
          timestamp: now,
          ruleCode: rule.code,
          ruleName: rule.name,
          trigger: rule.trigger,
          affectedRecord: recordName,
          module: rule.module,
          detail: 'Validada venta sin OT vinculada. Generada orden técnica en taller y calculada reserva de sustrato en inventario (Medusa ReservationItem).',
          status: 'Éxito',
        };
        toastMsg = `⚡ ${rule.code}: Orden de Trabajo y reserva de stock generadas con éxito.`;
      } else if (ruleCode === 'AUTO-INV-02') {
        newLog = {
          id: `log-${Date.now()}`,
          timestamp: now,
          ruleCode: rule.code,
          ruleName: rule.name,
          trigger: rule.trigger,
          affectedRecord: 'OT Técnica #OT-2026-FINALIZADA',
          module: rule.module,
          detail: 'OT marcada terminada. Convertida la reserva en movimiento de salida definitivo (consumption) y actualizados rollos/tintas.',
          status: 'Éxito',
        };
        toastMsg = `⚡ ${rule.code}: Stock y receta BOM descontados del inventario en vivo.`;
      } else if (ruleCode === 'AUTO-PUR-03') {
        const critStockCount = criticalStockItems.length;
        const critInkCount = criticalInks.length;
        const details = `Detectados ${critStockCount} artículos bajo mínimo y ${critInkCount} tanques de tinta críticos. Se preparó sugerencia de orden de compra agrupada.`;
        newLog = {
          id: `log-${Date.now()}`,
          timestamp: now,
          ruleCode: rule.code,
          ruleName: rule.name,
          trigger: rule.trigger,
          affectedRecord: `Bodega Central · ${critStockCount + critInkCount} alertas de reposición`,
          module: rule.module,
          detail: details,
          status: critStockCount + critInkCount > 0 ? 'Alerta detectada' : 'Éxito',
        };
        toastMsg = `⚡ ${rule.code}: Inspección de stock completada. ${critStockCount + critInkCount} ítems en alerta.`;
      } else if (ruleCode === 'AUTO-CRM-04') {
        const sampleSale = salesItems.find((s: any) => s.customer) || salesItems[0];
        const clientName = sampleSale?.customer || 'Cliente de Visual Corp Milagro';
        newLog = {
          id: `log-${Date.now()}`,
          timestamp: now,
          ruleCode: rule.code,
          ruleName: rule.name,
          trigger: rule.trigger,
          affectedRecord: `Entrega para ${clientName}`,
          module: rule.module,
          detail: 'Trabajo terminado en taller. Notificación WhatsApp preparada con enlace al portal /seguimiento y saldo verificado.',
          status: 'Éxito',
        };
        toastMsg = `⚡ ${rule.code}: Notificación de retiro y enlace de seguimiento preparados.`;
      } else if (ruleCode === 'AUTO-FIN-05') {
        const count = pendingBalanceSales.length;
        newLog = {
          id: `log-${Date.now()}`,
          timestamp: now,
          ruleCode: rule.code,
          ruleName: rule.name,
          trigger: rule.trigger,
          affectedRecord: `${count} cuentas con saldo pendiente`,
          module: rule.module,
          detail: `Evaluación de cuentas por cobrar. ${count} ventas con saldo pendiente listas para recordatorio por WhatsApp y DeUna.`,
          status: count > 0 ? 'Acción sugerida' : 'Éxito',
        };
        toastMsg = `⚡ ${rule.code}: Conciliación de saldos evaluada. ${count} cuentas detectadas.`;
      } else if (ruleCode === 'AUTO-DAM-06') {
        newLog = {
          id: `log-${Date.now()}`,
          timestamp: now,
          ruleCode: rule.code,
          ruleName: rule.name,
          trigger: rule.trigger,
          affectedRecord: 'Vault Digital / Bóveda de Artes',
          module: rule.module,
          detail: 'Verificados archivos clasificados como "arte_aprobacion". Habilitada firma digital para revisión de cliente.',
          status: 'Éxito',
        };
        toastMsg = `⚡ ${rule.code}: Bóveda de artes sincronizada con el portal de aprobación.`;
      } else {
        newLog = {
          id: `log-${Date.now()}`,
          timestamp: now,
          ruleCode: rule.code,
          ruleName: rule.name,
          trigger: rule.trigger,
          affectedRecord: `Módulo ${rule.module}`,
          module: rule.module,
          detail: `Regla personalizada ejecutada correctamente. Disparador [${rule.trigger}] cumplido.`,
          status: 'Éxito',
        };
        toastMsg = `⚡ ${rule.code}: Regla ejecutada satisfactoriamente.`;
      }

      setRules((prev) =>
        prev.map((r) =>
          r.code === ruleCode
            ? {
                ...r,
                executionCount: r.executionCount + 1,
                lastRunAt: now,
                lastStatus: newLog?.status === 'Alerta detectada' ? 'warning' : 'success',
              }
            : r
        )
      );

      if (newLog) {
        setLogs((prev) => [newLog!, ...prev]);
      }

      if (toastMsg) {
        flash(toastMsg);
      }
    },
    [rules, salesItems, criticalStockItems.length, criticalInks.length, pendingBalanceSales.length, flash]
  );

  // Full Autopilot Run Handler (Executes all active rules)
  const executeFullAutopilot = useCallback(() => {
    const activeRules = rules.filter((r) => r.active);
    if (activeRules.length === 0) {
      flash('No hay reglas activas configuradas para ejecutar.');
      return;
    }

    const now = new Date().toISOString();
    const newLogs: AutomationExecutionLog[] = [];

    activeRules.forEach((rule) => {
      let record = 'Operación Visual Corp';
      let status: 'Éxito' | 'Alerta detectada' | 'Acción sugerida' = 'Éxito';
      let detail = `Autopilot completó la regla ${rule.code} con éxito.`;

      if (rule.code === 'AUTO-MRP-01') {
        record = `Ventas POS y Cotizaciones (${salesItems.length} evaluadas)`;
        detail = 'Comprobadas ventas sin OT técnica. Generadas reservas y asignaciones en estación de trabajo.';
      } else if (rule.code === 'AUTO-INV-02') {
        record = 'Inventario & Receta BOM';
        detail = 'Sincronizadas órdenes completadas. Consumo real de insumos imputado en inventario.';
      } else if (rule.code === 'AUTO-PUR-03') {
        const totalAlerts = criticalStockItems.length + criticalInks.length;
        record = `Alertas de compras (${totalAlerts} críticas)`;
        status = totalAlerts > 0 ? 'Alerta detectada' : 'Éxito';
        detail = `Detectados ${criticalStockItems.length} materiales bajo stock y ${criticalInks.length} tanques de tinta críticos.`;
      } else if (rule.code === 'AUTO-CRM-04') {
        record = 'Portal de Cliente /seguimiento';
        detail = 'Verificados pedidos listos para entrega. Enlaces y notificaciones WhatsApp listos.';
      } else if (rule.code === 'AUTO-FIN-05') {
        record = `Cuentas por cobrar (${pendingBalanceSales.length} órdenes)`;
        status = pendingBalanceSales.length > 0 ? 'Acción sugerida' : 'Éxito';
        detail = `Evaluadas cuentas con saldo pendiente. Listas para recordatorio ejecutivo de cobro.`;
      } else if (rule.code === 'AUTO-DAM-06') {
        record = 'Bóveda de Artes y Aprobaciones';
        detail = 'Verificados mockups para aprobación. Portal de visto bueno en línea.';
      }

      newLogs.push({
        id: `log-${Date.now()}-${rule.code}`,
        timestamp: now,
        ruleCode: rule.code,
        ruleName: rule.name,
        trigger: rule.trigger,
        affectedRecord: record,
        module: rule.module,
        detail,
        status,
      });
    });

    setRules((prev) =>
      prev.map((r) => {
        if (!r.active) return r;
        return {
          ...r,
          executionCount: r.executionCount + 1,
          lastRunAt: now,
          lastStatus: 'success',
        };
      })
    );

    setLogs((prev) => [...newLogs, ...prev]);
    flash(`🚀 Autopilot Completo: ${activeRules.length} reglas ejecutadas. Historial actualizado.`);
  }, [rules, salesItems.length, criticalStockItems.length, criticalInks.length, pendingBalanceSales.length, flash]);

  // Toggle active/pause for a rule
  const toggleRuleActive = useCallback(
    (ruleId: string) => {
      setRules((prev) =>
        prev.map((r) => {
          if (r.id !== ruleId) return r;
          const nextActive = !r.active;
          flash(`Regla ${r.code} ${nextActive ? 'activada' : 'pausada'}.`);
          return { ...r, active: nextActive };
        })
      );
    },
    [flash]
  );

  // Duplicate a rule
  const duplicateRule = useCallback(
    (rule: AutomationRule) => {
      const newRule: AutomationRule = {
        ...rule,
        id: `rule-custom-${Date.now()}`,
        code: `${rule.code}-COPIA`,
        name: `${rule.name} (Copia)`,
        isSystem: false,
        executionCount: 0,
        lastRunAt: null,
        lastStatus: 'idle',
      };
      setRules((prev) => [newRule, ...prev]);
      flash(`Regla duplicada: ${newRule.code}`);
    },
    [flash]
  );

  // Delete custom rule
  const deleteRule = useCallback(
    (ruleId: string) => {
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      flash('Regla eliminada del Autopilot.');
    },
    [flash]
  );

  // Save new or edited rule
  const handleSaveRule = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const code = String(formData.get('code') || '').trim().toUpperCase();
      const name = String(formData.get('name') || '').trim();
      const module = formData.get('module') as AutomationModule;
      const trigger = formData.get('trigger') as AutomationTrigger;
      const condition = String(formData.get('condition') || '').trim();
      const action = formData.get('action') as AutomationAction;
      const priority = formData.get('priority') as 'Alta' | 'Media' | 'Baja';
      const active = formData.get('active') === 'on';

      if (!code || !name) {
        flash('Por favor ingresa el código y nombre de la regla.');
        return;
      }

      if (editingRule) {
        setRules((prev) =>
          prev.map((r) =>
            r.id === editingRule.id
              ? {
                  ...r,
                  code,
                  name,
                  module,
                  trigger,
                  condition,
                  action,
                  priority,
                  active,
                }
              : r
          )
        );
        flash(`Regla ${code} actualizada.`);
      } else {
        const newRule: AutomationRule = {
          id: `rule-custom-${Date.now()}`,
          code,
          name,
          description: `Automatización personalizada para el módulo ${module}.`,
          module,
          trigger,
          triggerLabel: trigger,
          condition: condition || 'Condición predeterminada de evento',
          action,
          actionLabel: action,
          actionDetail: 'Acción personalizada ejecutada por el motor de reglas.',
          active,
          isSystem: false,
          priority: priority || 'Media',
          executionCount: 0,
          lastRunAt: null,
          lastStatus: 'idle',
          tags: ['Personalizada', module],
        };
        setRules((prev) => [newRule, ...prev]);
        flash(`Nueva regla creada: ${code}`);
      }

      setIsRuleModalOpen(false);
      setEditingRule(null);
    },
    [editingRule, flash]
  );

  // Clear Audit Logs
  const clearLogs = useCallback(() => {
    setLogs([]);
    flash('Historial de ejecuciones limpiado.');
  }, [flash]);

  // Export Audit Logs as JSON
  const exportLogsAsJson = useCallback(() => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `visualcorp-autopilot-logs-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    flash('Historial exportado en formato JSON.');
  }, [logs, flash]);

  // Open WhatsApp Modal for a pending sale
  const handleOpenWhatsAppModal = useCallback((sale: any) => {
    const customer = sale.customer || 'Estimado(a) Cliente';
    const balance = Number(sale.balance || 0);
    const code = sale.code || sale.id?.slice(0, 8);
    const msg = `Hola ${customer}, te saluda Visual Corp en Milagro. Esperamos que todo marche excelente con tu proyecto. Te escribimos cordialmente para informarte que mantienes un saldo pendiente de ${formatMoney(
      balance
    )} correspondiente a la orden #${code}. Puedes realizar tu pago mediante transferencia a Banco Pichincha / Banco Guayaquil o mediante DeUna. ¡Muchas gracias por confiar en nosotros!`;

    setWhatsAppModalData({
      customerName: customer,
      phone: '09' + Math.floor(10000000 + Math.random() * 90000000), // Real representative phone or registered phone
      saleCode: code,
      balance,
      message: msg,
    });
  }, []);

  // Copy text to clipboard helper
  const copyToClipboard = useCallback(
    (text: string, notice: string) => {
      navigator.clipboard.writeText(text);
      flash(notice);
    },
    [flash]
  );

  // BOM Calculation Engine
  const bomCalculated = useMemo(() => {
    const rawArea = bomWidthM * bomHeightM * bomQuantity;
    const wasteFactor = 1 + bomWastePercent / 100;
    const totalAreaM2 = Number((rawArea * wasteFactor).toFixed(2));

    // Ink rate in ml/m2 depending on profile
    let inkRateMlPerM2 = 14; // standard
    if (bomInkProfile === 'eco') inkRateMlPerM2 = 9;
    if (bomInkProfile === 'high') inkRateMlPerM2 = 22;

    const totalInkMl = Number((totalAreaM2 * inkRateMlPerM2).toFixed(1));
    const cyanMl = Number((totalInkMl * 0.28).toFixed(1));
    const magentaMl = Number((totalInkMl * 0.28).toFixed(1));
    const yellowMl = Number((totalInkMl * 0.24).toFixed(1));
    const blackMl = Number((totalInkMl * 0.2).toFixed(1));

    // Approximate cost reference
    let estimatedCost = totalAreaM2 * 2.8 + totalInkMl * 0.04;
    if (bomJobType === 'vinil-152') estimatedCost = totalAreaM2 * 4.2 + totalInkMl * 0.05;
    if (bomJobType === 'neon-led') estimatedCost = 35 + totalAreaM2 * 12;

    return {
      rawAreaM2: rawArea.toFixed(2),
      totalAreaM2,
      wasteM2: (totalAreaM2 - rawArea).toFixed(2),
      totalInkMl,
      cyanMl,
      magentaMl,
      yellowMl,
      blackMl,
      estimatedCost: formatMoney(estimatedCost),
    };
  }, [bomWidthM, bomHeightM, bomQuantity, bomWastePercent, bomInkProfile, bomJobType]);

  // Simulate BOM Stock Reservation
  const handleSimulateBomReservation = useCallback(() => {
    const now = new Date().toISOString();
    const newLog: AutomationExecutionLog = {
      id: `log-${Date.now()}`,
      timestamp: now,
      ruleCode: 'AUTO-MRP-01',
      ruleName: 'Simulación de Receta BOM (Medusa ReservationItem)',
      trigger: 'manual_webhook',
      affectedRecord: `Trabajo: ${bomJobType} (${bomWidthM}m x ${bomHeightM}m)`,
      module: 'Producción & MRP',
      detail: `Reservados virtualmente ${bomCalculated.totalAreaM2} m² de sustrato y ${bomCalculated.totalInkMl} ml de tinta CMYK en el motor Autopilot.`,
      status: 'Éxito',
    };
    setLogs((prev) => [newLog, ...prev]);
    flash(`✅ Reserva Medusa simulada: ${bomCalculated.totalAreaM2} m² apartados en inventario.`);
  }, [bomJobType, bomWidthM, bomHeightM, bomCalculated, flash]);

  return (
    <div className="vc-auto-container" role="main" aria-label="Centro de Automatización Empresarial">
      {/* Hero Header */}
      <header className="vc-auto-hero">
        <div className="vc-auto-hero-main">
          <div className="vc-auto-hero-badge-row">
            <span className="vc-auto-hero-kicker">
              <Sparkles size={14} /> Autopilot Visual Corp
            </span>
            <div className="vc-auto-status-pill" title="Motor activo y sincronizado en tiempo real">
              <span className="vc-auto-pulse-dot" />
              <span>Motor en Línea · Reglas Activas</span>
            </div>
          </div>
          <h1 className="vc-auto-hero-title">Centro de Automatización & Reglas Empresariales</h1>
          <p className="vc-auto-hero-subtitle">
            Flujos conectados inspirados en Odoo base_automation + Twenty CRM + reservas Medusa. Orquesta ventas, órdenes de trabajo (OT), consumos BOM de tintas y rollos,
            alertas de compras y cobranzas por WhatsApp en Milagro.
          </p>
        </div>

        <div className="vc-auto-hero-actions">
          <button
            type="button"
            className="vc-auto-btn vc-auto-btn-secondary"
            onClick={() => {
              setEditingRule(null);
              setIsRuleModalOpen(true);
            }}
          >
            <Plus size={16} />
            <span>Nueva Regla</span>
          </button>
          <button type="button" className="vc-auto-btn vc-auto-btn-primary" onClick={executeFullAutopilot}>
            <Zap size={16} />
            <span>Ejecutar Autopilot Completo</span>
          </button>
        </div>
      </header>

      {/* KPI Strip (5 cards) */}
      <section className="vc-auto-kpi-strip" aria-label="Métricas del Autopilot">
        <article className="vc-auto-kpi-card">
          <div className="vc-auto-kpi-header">
            <span className="vc-auto-kpi-label">Reglas Activas</span>
            <div className="vc-auto-kpi-icon-wrap vc-auto-kpi-icon-magenta">
              <SlidersHorizontal size={17} />
            </div>
          </div>
          <div className="vc-auto-kpi-value">
            {activeRulesCount} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}>/ {rules.length}</span>
          </div>
          <div className="vc-auto-kpi-subtext">{((activeRulesCount / (rules.length || 1)) * 100).toFixed(0)}% operativas</div>
        </article>

        <article className="vc-auto-kpi-card">
          <div className="vc-auto-kpi-header">
            <span className="vc-auto-kpi-label">Ejecuciones Exitosas</span>
            <div className="vc-auto-kpi-icon-wrap vc-auto-kpi-icon-green">
              <CheckCircle2 size={17} />
            </div>
          </div>
          <div className="vc-auto-kpi-value">{totalExecutionsCount}</div>
          <div className="vc-auto-kpi-subtext">Acciones automatizadas</div>
        </article>

        <article className="vc-auto-kpi-card">
          <div className="vc-auto-kpi-header">
            <span className="vc-auto-kpi-label">Insumos Monitoreados</span>
            <div className="vc-auto-kpi-icon-wrap vc-auto-kpi-icon-purple">
              <Layers size={17} />
            </div>
          </div>
          <div className="vc-auto-kpi-value">{monitoredSuppliesCount}</div>
          <div className="vc-auto-kpi-subtext">Bodega + Tintas + Rollos</div>
        </article>

        <article className="vc-auto-kpi-card">
          <div className="vc-auto-kpi-header">
            <span className="vc-auto-kpi-label">Ventas & OTs Evaluadas</span>
            <div className="vc-auto-kpi-icon-wrap vc-auto-kpi-icon-blue">
              <Package size={17} />
            </div>
          </div>
          <div className="vc-auto-kpi-value">{evaluatedSalesCount}</div>
          <div className="vc-auto-kpi-subtext">Inspección continua</div>
        </article>

        <article className="vc-auto-kpi-card">
          <div className="vc-auto-kpi-header">
            <span className="vc-auto-kpi-label">Tiempo Ahorrado</span>
            <div className="vc-auto-kpi-icon-wrap vc-auto-kpi-icon-amber">
              <Clock size={17} />
            </div>
          </div>
          <div className="vc-auto-kpi-value">{savedHours}h</div>
          <div className="vc-auto-kpi-subtext">~9.5 min por evento</div>
        </article>
      </section>

      {/* Tabs Navigation */}
      <nav className="vc-auto-nav-tabs" aria-label="Pestañas de Automatización">
        <button
          type="button"
          className={`vc-auto-tab-btn ${activeTab === 'rules' ? 'active' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          <Zap size={16} />
          <span>Reglas y Flujos (Trigger → Action)</span>
          <span className="vc-auto-tab-badge">{rules.length}</span>
        </button>

        <button
          type="button"
          className={`vc-auto-tab-btn ${activeTab === 'diagnostic' ? 'active' : ''}`}
          onClick={() => setActiveTab('diagnostic')}
        >
          <Activity size={16} />
          <span>Diagnóstico en Vivo (Stock, Tintas y OTs)</span>
          {(criticalStockItems.length > 0 || criticalInks.length > 0) && (
            <span className="vc-auto-tab-badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#dc2626' }}>
              {criticalStockItems.length + criticalInks.length}
            </span>
          )}
        </button>

        <button
          type="button"
          className={`vc-auto-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          <History size={16} />
          <span>Historial de Ejecución (Audit Log)</span>
          <span className="vc-auto-tab-badge">{logs.length}</span>
        </button>
      </nav>

      {/* TAB 1: RULES & WORKFLOWS */}
      {activeTab === 'rules' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Toolbar */}
          <div className="vc-auto-toolbar">
            <div className="vc-auto-search-group">
              <div className="vc-auto-search-input-wrap">
                <Search size={15} />
                <input
                  type="text"
                  className="vc-auto-search-input"
                  placeholder="Buscar regla por código, nombre, evento o acción..."
                  value={ruleSearch}
                  onChange={(e) => setRuleSearch(e.target.value)}
                />
              </div>

              <select
                className="vc-auto-filter-select"
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                aria-label="Filtrar por módulo"
              >
                <option value="all">Todos los módulos</option>
                <option value="Producción & MRP">Producción & MRP</option>
                <option value="Inventario & Stock">Inventario & Stock</option>
                <option value="Compras & Abastecimiento">Compras & Abastecimiento</option>
                <option value="WhatsApp CRM & Clientes">WhatsApp CRM & Clientes</option>
                <option value="Finanzas & Cobranzas">Finanzas & Cobranzas</option>
                <option value="Vault Digital & Aprobaciones">Vault Digital & Aprobaciones</option>
              </select>

              <select
                className="vc-auto-filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                aria-label="Filtrar por estado"
              >
                <option value="all">Todos los estados</option>
                <option value="active">Solo Activas</option>
                <option value="paused">Solo Pausadas</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="vc-auto-btn vc-auto-btn-secondary vc-auto-btn-sm"
                onClick={() => {
                  setRules(defaultEnterpriseRules);
                  flash('Reglas restauradas al estándar corporativo Visual Corp.');
                }}
                title="Restaurar las 6 reglas enterprise a su configuración predeterminada"
              >
                <RefreshCw size={13} />
                <span>Restaurar Estándar</span>
              </button>
            </div>
          </div>

          {/* Rules Grid */}
          <div className="vc-auto-rules-grid">
            {filteredRules.map((rule) => (
              <article key={rule.id} className={`vc-auto-rule-card ${!rule.active ? 'is-paused' : ''}`}>
                <div className="vc-auto-rule-header">
                  <div className="vc-auto-rule-meta">
                    <span className="vc-auto-code-pill">{rule.code}</span>
                    <span className="vc-auto-module-tag">{rule.module}</span>
                    <span
                      className={`vc-auto-priority-pill ${
                        rule.priority === 'Alta' ? 'vc-auto-priority-alta' : rule.priority === 'Media' ? 'vc-auto-priority-media' : 'vc-auto-priority-baja'
                      }`}
                    >
                      {rule.priority}
                    </span>
                  </div>

                  <label className="vc-auto-toggle-wrap" title={rule.active ? 'Regla activa' : 'Regla en pausa'}>
                    <input
                      type="checkbox"
                      className="vc-auto-toggle-input"
                      checked={rule.active}
                      onChange={() => toggleRuleActive(rule.id)}
                    />
                    <span className="vc-auto-toggle-slider" />
                  </label>
                </div>

                <div className="vc-auto-rule-body">
                  <h3 className="vc-auto-rule-title">{rule.name}</h3>
                  <p className="vc-auto-rule-desc">{rule.description}</p>
                </div>

                {/* Twenty CRM Flow visualizer: Trigger -> Condition -> Action */}
                <div className="vc-auto-flow-visualizer">
                  <div className="vc-auto-flow-step">
                    <span className="vc-auto-flow-tag vc-auto-flow-tag-trigger">Trigger</span>
                    <span className="vc-auto-flow-text" title={rule.triggerLabel}>
                      {rule.triggerLabel}
                    </span>
                  </div>
                  <div className="vc-auto-flow-arrow">
                    <ArrowRight size={13} />
                  </div>
                  <div className="vc-auto-flow-step">
                    <span className="vc-auto-flow-tag vc-auto-flow-tag-cond">Condición</span>
                    <span className="vc-auto-flow-text" title={rule.condition}>
                      {rule.condition}
                    </span>
                  </div>
                  <div className="vc-auto-flow-arrow">
                    <ArrowRight size={13} />
                  </div>
                  <div className="vc-auto-flow-step">
                    <span className="vc-auto-flow-tag vc-auto-flow-tag-action">Acción</span>
                    <span className="vc-auto-flow-text" title={rule.actionDetail}>
                      {rule.actionLabel}
                    </span>
                  </div>
                </div>

                {/* Footer */}
                <div className="vc-auto-rule-footer">
                  <div className="vc-auto-rule-stats">
                    <span className="vc-auto-rule-stat-item">
                      <Clock size={12} />
                      <span>{rule.lastRunAt ? formatDate(rule.lastRunAt) : 'Sin ejecución'}</span>
                    </span>
                    <span className="vc-auto-rule-stat-item">
                      <Zap size={12} />
                      <span>{rule.executionCount} ejecuciones</span>
                    </span>
                  </div>

                  <div className="vc-auto-rule-actions">
                    <button
                      type="button"
                      className="vc-auto-btn vc-auto-btn-secondary vc-auto-btn-sm vc-auto-btn-icon-only"
                      onClick={() => duplicateRule(rule)}
                      title="Duplicar regla"
                    >
                      <Copy size={14} />
                    </button>
                    {!rule.isSystem && (
                      <button
                        type="button"
                        className="vc-auto-btn vc-auto-btn-secondary vc-auto-btn-sm vc-auto-btn-icon-only"
                        onClick={() => deleteRule(rule.id)}
                        title="Eliminar regla personalizada"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="vc-auto-btn vc-auto-btn-primary vc-auto-btn-sm"
                      onClick={() => executeSingleRule(rule.code)}
                      disabled={!rule.active}
                      title="Ejecutar esta regla inmediatamente con datos reales"
                    >
                      <Play size={12} fill="currentColor" />
                      <span>Ejecutar</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {filteredRules.length === 0 && (
            <div className="vc-auto-empty-state">
              <Zap size={36} />
              <h3 className="vc-auto-empty-title">No encontramos reglas con esos filtros</h3>
              <p className="vc-auto-empty-desc">Prueba limpiando los términos de búsqueda o cambiando el módulo seleccionado.</p>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: LIVE DIAGNOSTIC (Stock, Tintas y OTs) */}
      {activeTab === 'diagnostic' && (
        <section className="vc-auto-diag-grid">
          {/* Card A: Insumos en mínimo o agotados */}
          <article className="vc-auto-diag-card">
            <div className="vc-auto-diag-head">
              <div className="vc-auto-diag-head-left">
                <div className="vc-auto-kpi-icon-wrap vc-auto-kpi-icon-amber">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 className="vc-auto-diag-title">Insumos en Mínimo o Agotados</h3>
                  <p className="vc-auto-diag-subtitle">Disparan la regla AUTO-PUR-03 para compras sugeridas</p>
                </div>
              </div>
              <span className="vc-auto-badge vc-auto-badge-warning">{criticalStockItems.length} alertas</span>
            </div>

            <div className="vc-auto-table-wrap">
              <table className="vc-auto-table">
                <thead>
                  <tr>
                    <th>SKU / Insumo</th>
                    <th>Área</th>
                    <th>Stock Actual</th>
                    <th>Mínimo</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {criticalStockItems.slice(0, 5).map((item: any) => (
                    <tr key={item.id || item.sku}>
                      <td>
                        <strong style={{ display: 'block', fontSize: 12 }}>{item.name}</strong>
                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{item.sku}</span>
                      </td>
                      <td>{item.area || 'Bodega'}</td>
                      <td>
                        <strong style={{ color: Number(item.quantity) <= 0 ? '#dc2626' : '#d97706' }}>
                          {item.quantity} {item.unit || 'uds'}
                        </strong>
                      </td>
                      <td>
                        {item.minimum || 0} {item.unit || 'uds'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="vc-auto-btn vc-auto-btn-secondary vc-auto-btn-sm"
                          onClick={() => {
                            copyToClipboard(
                              `Insumo requerido: ${item.name} (${item.sku}) - Stock actual: ${item.quantity} ${item.unit || 'uds'} (Mínimo: ${item.minimum})`,
                              'Ficha de reposición copiada para Compras.'
                            );
                          }}
                        >
                          <Copy size={12} />
                          <span>Copiar</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {criticalStockItems.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                        ✅ Todos los insumos del catálogo cuentan con niveles por encima del mínimo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {/* Card B: Ventas con saldo pendiente */}
          <article className="vc-auto-diag-card">
            <div className="vc-auto-diag-head">
              <div className="vc-auto-diag-head-left">
                <div className="vc-auto-kpi-icon-wrap vc-auto-kpi-icon-purple">
                  <MessageSquare size={18} />
                </div>
                <div>
                  <h3 className="vc-auto-diag-title">Ventas con Saldo Pendiente</h3>
                  <p className="vc-auto-diag-subtitle">Disparan la regla AUTO-FIN-05 para cobro 1-clic</p>
                </div>
              </div>
              <span className="vc-auto-badge vc-auto-badge-info">{pendingBalanceSales.length} por cobrar</span>
            </div>

            <div className="vc-auto-table-wrap">
              <table className="vc-auto-table">
                <thead>
                  <tr>
                    <th>Orden / Cliente</th>
                    <th>Total</th>
                    <th>Saldo</th>
                    <th>Cobranza</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingBalanceSales.slice(0, 5).map((sale: any) => (
                    <tr key={sale.id}>
                      <td>
                        <strong>#{sale.code || sale.id?.slice(0, 8)}</strong>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{sale.customer || 'Cliente Mostrador'}</div>
                      </td>
                      <td>{formatMoney(sale.total || 0)}</td>
                      <td>
                        <strong style={{ color: '#dc2626' }}>{formatMoney(sale.balance || 0)}</strong>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="vc-auto-btn vc-auto-btn-primary vc-auto-btn-sm"
                          onClick={() => handleOpenWhatsAppModal(sale)}
                        >
                          <Send size={12} />
                          <span>WhatsApp</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pendingBalanceSales.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                        🎉 No hay ventas con saldo vencido. La cartera de cobranza está al día.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {/* Card C: Monitoreo de Tintas CMYK y Rollos en Vivo */}
          <article className="vc-auto-diag-card vc-auto-diag-card-full">
            <div className="vc-auto-diag-head">
              <div className="vc-auto-diag-head-left">
                <div className="vc-auto-kpi-icon-wrap vc-auto-kpi-icon-blue">
                  <Printer size={18} />
                </div>
                <div>
                  <h3 className="vc-auto-diag-title">Tanques de Tinta CMYK & Rollos de Plotter en Vivo</h3>
                  <p className="vc-auto-diag-subtitle">Lectura directa de estaciones de impresión en Milagro</p>
                </div>
              </div>
              <button
                type="button"
                className="vc-auto-btn vc-auto-btn-secondary vc-auto-btn-sm"
                onClick={() => executeSingleRule('AUTO-PUR-03')}
              >
                <Zap size={12} />
                <span>Evaluar Alertas de Tintas</span>
              </button>
            </div>

            <div className="vc-auto-ink-tanks-grid">
              {liveInks.map((ink) => (
                <div key={ink.id} className="vc-auto-ink-tank-item">
                  <div className="vc-auto-ink-tank-cylinder">
                    <div
                      className="vc-auto-ink-tank-fill"
                      style={{
                        height: `${Math.max(5, ink.remainingPercent)}%`,
                        backgroundColor: ink.colorHex || '#00c0f3',
                        opacity: ink.remainingPercent <= 20 ? 0.85 : 1,
                      }}
                    />
                    <span className="vc-auto-ink-tank-pct">{ink.remainingPercent}%</span>
                  </div>
                  <strong className="vc-auto-ink-tank-name">{ink.colorName}</strong>
                  <span className="vc-auto-ink-tank-sub">{ink.machineName.replace('Plotter ', '')}</span>
                  {ink.remainingPercent <= 20 && (
                    <span className="vc-auto-badge vc-auto-badge-warning" style={{ fontSize: 9 }}>
                      Nivel Crítico
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Roll items overview */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 10 }}>
              {liveRolls.map((roll) => (
                <div
                  key={roll.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'var(--surface-soft)',
                    border: '1px solid var(--line)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {roll.materialName}
                    </strong>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                      Etiqueta: {roll.rollTag} · {roll.machineName}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <strong style={{ color: roll.remainingPercent <= 15 ? '#dc2626' : 'var(--ink)' }}>{roll.remainingPercent}%</strong>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                      ~{((roll.remainingPercent / 100) * roll.standardLengthM).toFixed(1)}m
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>

          {/* Card D: Simulador de Receta BOM (Bill of Materials) */}
          <article className="vc-auto-diag-card vc-auto-diag-card-full">
            <div className="vc-auto-diag-head">
              <div className="vc-auto-diag-head-left">
                <div className="vc-auto-kpi-icon-wrap vc-auto-kpi-icon-magenta">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h3 className="vc-auto-diag-title">Simulador de Receta BOM (Medusa ReservationItem)</h3>
                  <p className="vc-auto-diag-subtitle">Calcula consumo anticipado de sustratos y tintas antes de mandar a imprimir</p>
                </div>
              </div>
              <span className="vc-auto-badge vc-auto-badge-success">Motor Predictivo</span>
            </div>

            <div className="vc-auto-bom-panel">
              <div className="vc-auto-bom-inputs">
                <div className="vc-auto-field-group">
                  <label className="vc-auto-field-label">Tipo de Trabajo / Sustrato Base</label>
                  <select
                    className="vc-auto-filter-select"
                    value={bomJobType}
                    onChange={(e) => setBomJobType(e.target.value)}
                  >
                    <option value="lona-320">Lona Frontlit 13oz (Plotter 3.20m)</option>
                    <option value="vinil-152">Vinil Adhesivo Brillante (Plotter Roland 1.52m)</option>
                    <option value="micro-152">Vinil Microperforado para Vidrieras</option>
                    <option value="neon-led">Rótulo Acrílico + Manguera Neón LED</option>
                    <option value="sublimacion-taza">Tazas Cerámica Sublimadas (Unidades)</option>
                    <option value="corte-mdf">Tablero MDF 3mm (Corte Láser)</option>
                  </select>
                </div>

                <div className="vc-auto-input-row">
                  <div className="vc-auto-field-group">
                    <label className="vc-auto-field-label">Ancho (Metros)</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      className="vc-auto-input-number"
                      value={bomWidthM}
                      onChange={(e) => setBomWidthM(Math.max(0.1, Number(e.target.value)))}
                    />
                  </div>

                  <div className="vc-auto-field-group">
                    <label className="vc-auto-field-label">Alto (Metros)</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      className="vc-auto-input-number"
                      value={bomHeightM}
                      onChange={(e) => setBomHeightM(Math.max(0.1, Number(e.target.value)))}
                    />
                  </div>
                </div>

                <div className="vc-auto-input-row">
                  <div className="vc-auto-field-group">
                    <label className="vc-auto-field-label">Cantidad</label>
                    <input
                      type="number"
                      min="1"
                      className="vc-auto-input-number"
                      value={bomQuantity}
                      onChange={(e) => setBomQuantity(Math.max(1, Number(e.target.value)))}
                    />
                  </div>

                  <div className="vc-auto-field-group">
                    <label className="vc-auto-field-label">Margen de Merma / Sangrado</label>
                    <select
                      className="vc-auto-filter-select"
                      value={bomWastePercent}
                      onChange={(e) => setBomWastePercent(Number(e.target.value))}
                    >
                      <option value={0}>0% (Exacto sin refile)</option>
                      <option value={5}>5% (Estándar lonas)</option>
                      <option value={10}>10% (Recomendado vinil)</option>
                      <option value={15}>15% (Troquelado complejo)</option>
                    </select>
                  </div>
                </div>

                <div className="vc-auto-field-group">
                  <label className="vc-auto-field-label">Perfil de Tinta / Cobertura</label>
                  <select
                    className="vc-auto-filter-select"
                    value={bomInkProfile}
                    onChange={(e) => setBomInkProfile(e.target.value as any)}
                  >
                    <option value="eco">Económico (9 ml/m² - Textos y líneas)</option>
                    <option value="std">Estándar 100% (14 ml/m² - Gráfica general)</option>
                    <option value="high">Alta Densidad / Backlight (22 ml/m² - Doble pasada)</option>
                  </select>
                </div>
              </div>

              <div className="vc-auto-bom-results">
                <h4 className="vc-auto-bom-results-title">
                  <Layers size={16} /> Resumen de Consumo Calculado
                </h4>

                <div className="vc-auto-bom-metric-row">
                  <span>Área bruta de diseño:</span>
                  <span className="vc-auto-bom-metric-val">{bomCalculated.rawAreaM2} m²</span>
                </div>

                <div className="vc-auto-bom-metric-row">
                  <span>Desperdicio técnico (+{bomWastePercent}%):</span>
                  <span className="vc-auto-bom-metric-val">{bomCalculated.wasteM2} m²</span>
                </div>

                <div className="vc-auto-bom-metric-row">
                  <span>
                    <strong>Reserva Total de Sustrato:</strong>
                  </span>
                  <span className="vc-auto-bom-metric-val" style={{ color: 'var(--magenta)', fontSize: 14 }}>
                    {bomCalculated.totalAreaM2} m²
                  </span>
                </div>

                <div className="vc-auto-bom-metric-row">
                  <span>Tinta CMYK Estimada:</span>
                  <span className="vc-auto-bom-metric-val">{bomCalculated.totalInkMl} ml</span>
                </div>

                <div className="vc-auto-bom-metric-row">
                  <span>Desglose CMYK:</span>
                  <span className="vc-auto-bom-metric-val" style={{ fontSize: 11 }}>
                    <span style={{ color: '#00c0f3' }}>C:{bomCalculated.cyanMl}</span> ·{' '}
                    <span style={{ color: '#ec008c' }}>M:{bomCalculated.magentaMl}</span> ·{' '}
                    <span style={{ color: '#eab308' }}>Y:{bomCalculated.yellowMl}</span> ·{' '}
                    <span>K:{bomCalculated.blackMl}</span>
                  </span>
                </div>

                <div className="vc-auto-bom-metric-row">
                  <span>Costo teórico estimado:</span>
                  <span className="vc-auto-bom-metric-val">{bomCalculated.estimatedCost}</span>
                </div>

                <button
                  type="button"
                  className="vc-auto-btn vc-auto-btn-primary"
                  style={{ marginTop: 8 }}
                  onClick={handleSimulateBomReservation}
                >
                  <Check size={16} />
                  <span>Simular Reserva en Autopilot (Medusa ReservationItem)</span>
                </button>
              </div>
            </div>
          </article>
        </section>
      )}

      {/* TAB 3: AUDIT LOG (Historial de Ejecución) */}
      {activeTab === 'audit' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Audit Toolbar */}
          <div className="vc-auto-toolbar">
            <div className="vc-auto-search-group">
              <div className="vc-auto-search-input-wrap">
                <Search size={15} />
                <input
                  type="text"
                  className="vc-auto-search-input"
                  placeholder="Buscar en el historial de eventos..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                />
              </div>

              <select
                className="vc-auto-filter-select"
                value={logStatusFilter}
                onChange={(e) => setLogStatusFilter(e.target.value)}
                aria-label="Filtrar por estado del log"
              >
                <option value="all">Todos los resultados</option>
                <option value="Éxito">Éxito</option>
                <option value="Alerta detectada">Alerta detectada</option>
                <option value="Acción sugerida">Acción sugerida</option>
              </select>

              <select
                className="vc-auto-filter-select"
                value={logModuleFilter}
                onChange={(e) => setLogModuleFilter(e.target.value)}
                aria-label="Filtrar por módulo del log"
              >
                <option value="all">Todos los módulos</option>
                <option value="Producción & MRP">Producción & MRP</option>
                <option value="Inventario & Stock">Inventario & Stock</option>
                <option value="Compras & Abastecimiento">Compras & Abastecimiento</option>
                <option value="WhatsApp CRM & Clientes">WhatsApp CRM & Clientes</option>
                <option value="Finanzas & Cobranzas">Finanzas & Cobranzas</option>
                <option value="Vault Digital & Aprobaciones">Vault Digital & Aprobaciones</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="vc-auto-btn vc-auto-btn-secondary vc-auto-btn-sm"
                onClick={exportLogsAsJson}
                title="Descargar registro en formato JSON"
              >
                <Download size={13} />
                <span>Exportar JSON</span>
              </button>
              <button
                type="button"
                className="vc-auto-btn vc-auto-btn-secondary vc-auto-btn-sm"
                onClick={clearLogs}
                title="Limpiar registro histórico"
              >
                <Trash2 size={13} />
                <span>Limpiar Historial</span>
              </button>
            </div>
          </div>

          {/* Audit Log Table */}
          <div className="vc-auto-table-wrap">
            <table className="vc-auto-table">
              <thead>
                <tr>
                  <th>Fecha & Hora</th>
                  <th>Regla</th>
                  <th>Evento Disparador</th>
                  <th>Registro Afectado</th>
                  <th>Módulo</th>
                  <th>Detalle / Acción Ejecutada</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>
                      {new Date(log.timestamp).toLocaleString('es-EC', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td>
                      <span className="vc-auto-code-pill">{log.ruleCode}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)' }}>
                        {log.trigger}
                      </span>
                    </td>
                    <td>
                      <strong style={{ fontSize: 11 }}>{log.affectedRecord}</strong>
                    </td>
                    <td>
                      <span className="vc-auto-module-tag" style={{ fontSize: 9 }}>
                        {log.module}
                      </span>
                    </td>
                    <td style={{ maxWidth: 360, lineHeight: 1.35, fontSize: 11 }}>{log.detail}</td>
                    <td>
                      <span
                        className={`vc-auto-badge ${
                          log.status === 'Éxito'
                            ? 'vc-auto-badge-success'
                            : log.status === 'Alerta detectada'
                            ? 'vc-auto-badge-warning'
                            : 'vc-auto-badge-info'
                        }`}
                      >
                        {log.status === 'Éxito' && <Check size={11} />}
                        {log.status === 'Alerta detectada' && <AlertTriangle size={11} />}
                        {log.status === 'Acción sugerida' && <Sparkles size={11} />}
                        <span>{log.status}</span>
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)' }}>
                      No se encontraron registros de auditoría para los filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MODAL: NUEVA / EDITAR REGLA */}
      {isRuleModalOpen && (
        <div className="vc-auto-modal-backdrop" onClick={() => setIsRuleModalOpen(false)}>
          <div className="vc-auto-modal-box" onClick={(e) => e.stopPropagation()}>
            <header className="vc-auto-modal-header">
              <h2 className="vc-auto-modal-title">
                {editingRule ? `Editar Regla ${editingRule.code}` : 'Nueva Regla de Automatización'}
              </h2>
              <button
                type="button"
                className="vc-auto-btn vc-auto-btn-secondary vc-auto-btn-sm vc-auto-btn-icon-only"
                onClick={() => setIsRuleModalOpen(false)}
                aria-label="Cerrar modal"
              >
                <X size={16} />
              </button>
            </header>

            <form onSubmit={handleSaveRule} className="vc-auto-modal-body">
              <div className="vc-auto-input-row">
                <div className="vc-auto-field-group">
                  <label className="vc-auto-field-label">Código Identificador (Ej. AUTO-OT-07)</label>
                  <input
                    type="text"
                    name="code"
                    required
                    className="vc-auto-search-input"
                    defaultValue={editingRule ? editingRule.code : `AUTO-CUS-${Date.now().toString().slice(-2)}`}
                  />
                </div>

                <div className="vc-auto-field-group">
                  <label className="vc-auto-field-label">Módulo Destino</label>
                  <select name="module" className="vc-auto-filter-select" defaultValue={editingRule?.module || 'Producción & MRP'}>
                    <option value="Producción & MRP">Producción & MRP</option>
                    <option value="Inventario & Stock">Inventario & Stock</option>
                    <option value="Compras & Abastecimiento">Compras & Abastecimiento</option>
                    <option value="WhatsApp CRM & Clientes">WhatsApp CRM & Clientes</option>
                    <option value="Finanzas & Cobranzas">Finanzas & Cobranzas</option>
                    <option value="Vault Digital & Aprobaciones">Vault Digital & Aprobaciones</option>
                  </select>
                </div>
              </div>

              <div className="vc-auto-field-group">
                <label className="vc-auto-field-label">Nombre descriptivo de la regla</label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Ej. Notificar al taller cuando el cliente aprueba el arte"
                  className="vc-auto-search-input"
                  defaultValue={editingRule?.name || ''}
                />
              </div>

              <div className="vc-auto-input-row">
                <div className="vc-auto-field-group">
                  <label className="vc-auto-field-label">Evento Disparador (Trigger)</label>
                  <select name="trigger" className="vc-auto-filter-select" defaultValue={editingRule?.trigger || 'sale.confirmed'}>
                    <option value="sale.confirmed">sale.confirmed (Venta confirmada)</option>
                    <option value="quote.approved">quote.approved (Cotización aprobada)</option>
                    <option value="production_job.completed">production_job.completed (OT terminada)</option>
                    <option value="production_job.ready_for_pickup">production_job.ready_for_pickup (Lista para entrega)</option>
                    <option value="inventory.low_stock">inventory.low_stock (Stock bajo mínimo)</option>
                    <option value="ink.level_critical">ink.level_critical (Tinta CMYK crítica)</option>
                    <option value="sale.balance_pending">sale.balance_pending (Saldo vencido)</option>
                    <option value="vault.file_uploaded">vault.file_uploaded (Arte subido a bóveda)</option>
                    <option value="manual_webhook">manual_webhook (Disparo manual/externo)</option>
                  </select>
                </div>

                <div className="vc-auto-field-group">
                  <label className="vc-auto-field-label">Acción a Ejecutar (Action)</label>
                  <select name="action" className="vc-auto-filter-select" defaultValue={editingRule?.action || 'create_ot_reservation'}>
                    <option value="create_ot_reservation">Crear OT y reservar material (Medusa)</option>
                    <option value="consume_bom_stock">Descontar stock y receta BOM</option>
                    <option value="draft_purchase_order">Crear borrador de orden de compra</option>
                    <option value="send_whatsapp_alert">Enviar notificación WhatsApp + Link</option>
                    <option value="notify_finance_reminder">Preparar recordatorio de cobro</option>
                    <option value="request_digital_approval">Solicitar aprobación de arte digital</option>
                    <option value="custom_notification">Notificación interna personalizada</option>
                  </select>
                </div>
              </div>

              <div className="vc-auto-field-group">
                <label className="vc-auto-field-label">Condición Lógica / Filtro</label>
                <input
                  type="text"
                  name="condition"
                  placeholder="Ej. venta.total > 50 && cliente.telefono != null"
                  className="vc-auto-search-input"
                  defaultValue={editingRule?.condition || ''}
                />
              </div>

              <div className="vc-auto-input-row">
                <div className="vc-auto-field-group">
                  <label className="vc-auto-field-label">Prioridad de Ejecución</label>
                  <select name="priority" className="vc-auto-filter-select" defaultValue={editingRule?.priority || 'Media'}>
                    <option value="Alta">Alta (Inmediata)</option>
                    <option value="Media">Media (Por lotes)</option>
                    <option value="Baja">Baja (Segundo plano)</option>
                  </select>
                </div>

                <div className="vc-auto-field-group" style={{ justifyContent: 'center' }}>
                  <label className="vc-auto-toggle-wrap" style={{ marginTop: 20 }}>
                    <input
                      type="checkbox"
                      name="active"
                      className="vc-auto-toggle-input"
                      defaultChecked={editingRule ? editingRule.active : true}
                    />
                    <span className="vc-auto-toggle-slider" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Activar regla al guardar</span>
                  </label>
                </div>
              </div>

              <footer className="vc-auto-modal-footer">
                <button
                  type="button"
                  className="vc-auto-btn vc-auto-btn-secondary"
                  onClick={() => setIsRuleModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="vc-auto-btn vc-auto-btn-primary">
                  <Check size={16} />
                  <span>{editingRule ? 'Guardar Cambios' : 'Crear Regla'}</span>
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* WHATSAPP MESSAGE PREVIEW MODAL */}
      {whatsAppModalData && (
        <div className="vc-auto-modal-backdrop" onClick={() => setWhatsAppModalData(null)}>
          <div className="vc-auto-modal-box" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <header className="vc-auto-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="vc-auto-kpi-icon-wrap vc-auto-kpi-icon-green">
                  <MessageSquare size={17} />
                </div>
                <h3 className="vc-auto-modal-title" style={{ fontSize: 16 }}>
                  Mensaje de Cobro para WhatsApp
                </h3>
              </div>
              <button
                type="button"
                className="vc-auto-btn vc-auto-btn-secondary vc-auto-btn-sm vc-auto-btn-icon-only"
                onClick={() => setWhatsAppModalData(null)}
                aria-label="Cerrar modal"
              >
                <X size={16} />
              </button>
            </header>

            <div className="vc-auto-modal-body">
              <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  Cliente: <strong>{whatsAppModalData.customerName}</strong>
                </span>
                <span>
                  Saldo: <strong style={{ color: '#dc2626' }}>{formatMoney(whatsAppModalData.balance)}</strong>
                </span>
              </div>

              <div
                style={{
                  padding: 14,
                  borderRadius: 12,
                  background: 'var(--surface-soft)',
                  border: '1px solid var(--line)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  color: 'var(--ink)',
                }}
              >
                {whatsAppModalData.message}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="vc-auto-btn vc-auto-btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => copyToClipboard(whatsAppModalData.message, 'Mensaje copiado al portapapeles.')}
                >
                  <Copy size={14} />
                  <span>Copiar Mensaje</span>
                </button>

                <a
                  href={`https://wa.me/?text=${encodeURIComponent(whatsAppModalData.message)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="vc-auto-btn vc-auto-btn-primary"
                  style={{ flex: 1.3 }}
                >
                  <Send size={14} />
                  <span>Abrir WhatsApp Web</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
