import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  X,
  Send,
  MessageSquare,
  Clock,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  FolderOpen,
  Image as ImageIcon,
  ExternalLink,
  Copy,
  Tag,
  Activity,
  User,
  Plus,
  Check,
  CheckCheck,
  PhoneCall,
  Share2,
  DollarSign,
  Package,
  Layers,
  ShieldCheck,
  Search,
  Filter,
  FileText,
  SlidersHorizontal,
  ChevronRight,
  Trash2,
  Eye,
  Info,
  Building2,
  FileCheck2,
  Printer,
  Truck
} from 'lucide-react';
import { useWorkspace, formatMoney, formatDate } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import './ChatterDrawer360.css';

/* --------------------------------------------------------------------------
   Types & Interfaces
   -------------------------------------------------------------------------- */
export type ChatterRecordType = 'customer' | 'job' | 'quote' | 'sale' | 'inventory';

export interface ChatterDrawer360Props {
  open: boolean;
  onClose: () => void;
  recordType: ChatterRecordType;
  recordId: string;
  recordTitle: string;
  recordSubtitle?: string;
  recordPhone?: string;
  recordStage?: string;
  metadata?: Record<string, any>;
}

export type ChatterEventType =
  | 'note'
  | 'activity'
  | 'activity_done'
  | 'stage_change'
  | 'whatsapp'
  | 'call'
  | 'file'
  | 'sale'
  | 'system';

export interface ChatterEvent {
  id: string;
  recordType: ChatterRecordType;
  recordId: string;
  recordTitle?: string;
  type: ChatterEventType;
  author: string;
  authorRole?: string;
  createdAt: string; // ISO Date string
  title?: string;
  content: string;
  tags?: string[];
  metadata?: Record<string, any>;
  isSystem?: boolean;
  isDemo?: boolean;
}

export interface ScheduledActivity {
  id: string;
  recordType: ChatterRecordType;
  recordId: string;
  recordTitle?: string;
  title: string;
  activityType: 'call' | 'proof_review' | 'quote_followup' | 'production' | 'installation' | 'payment_collection' | 'general';
  dueDate: string; // YYYY-MM-DD
  priority: 'Alta' | 'Media' | 'Baja';
  assignee: string;
  assignedBy?: string;
  notes?: string;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
}

interface ChatterStoragePayload {
  items: ChatterEvent[];
  activities: ScheduledActivity[];
}

const CHATTER_STORAGE_KEY = 'vc-enterprise-chatter-v1';
const VAULT_STORAGE_KEY = 'vc-enterprise-vault-v1';
const PORTAL_STORAGE_KEY = 'vc-enterprise-portal-orders-v1';

/* --------------------------------------------------------------------------
   Helpers & Phone Normalizer (Milagro / Ecuador)
   -------------------------------------------------------------------------- */
function normalizeEcuadorPhone(rawPhone?: string): string {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('593')) return digits;
  if (digits.startsWith('0')) return `593${digits.slice(1)}`;
  if (digits.length === 9) return `593${digits}`;
  return digits;
}

function buildWhatsAppMessage(
  recordType: ChatterRecordType,
  recordTitle: string,
  recordId: string
): string {
  switch (recordType) {
    case 'customer':
      return `¡Hola ${recordTitle}! Te saludamos de Visual Corp (Milagro). Te escribimos para dar seguimiento a tus proyectos de diseño y publicidad.`;
    case 'job':
      return `¡Hola ${recordTitle}! Te escribimos de Visual Corp respecto a tu Orden de Trabajo #${recordId}. Queremos coordinar el avance de tu producción.`;
    case 'quote':
      return `¡Hola ${recordTitle}! Te compartimos la cotización #${recordId} de Visual Corp. ¿Deseas aprobarla para iniciar el proceso de diseño y producción?`;
    case 'sale':
      return `¡Hola ${recordTitle}! Te compartimos el detalle de tu compra #${recordId} con Visual Corp. Muchas gracias por confiar en nosotros.`;
    case 'inventory':
      return `Aviso interno de Bodega Visual Corp: Consulta sobre existencia o reposición de ${recordTitle} (SKU/Ref: ${recordId}).`;
    default:
      return `Hola ${recordTitle}, te escribimos de Visual Corp respecto a la ficha #${recordId}.`;
  }
}

function getRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return formatDate(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return formatDate(isoString);
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 1) return 'Hace un momento';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    return formatDate(isoString);
  } catch {
    return formatDate(isoString);
  }
}

function extractMentions(text: string): string[] {
  const matches = text.match(/@[\w\u00C0-\u017F]+/g);
  return matches ? Array.from(new Set(matches)) : [];
}

/* --------------------------------------------------------------------------
   ChatterTimelinePanel (Standalone or Inside Drawer)
   -------------------------------------------------------------------------- */
export function ChatterTimelinePanel({
  recordType,
  recordId,
  recordTitle,
  recordPhone,
  recordStage,
  recordSubtitle,
  metadata
}: Omit<ChatterDrawer360Props, 'open' | 'onClose'>) {
  const { data, flash } = useWorkspace();
  const { user } = useAuth();

  // Local storage state
  const [storedChatter, setStoredChatter] = useState<ChatterStoragePayload>(() => {
    try {
      const raw = localStorage.getItem(CHATTER_STORAGE_KEY);
      if (!raw) return { items: [], activities: [] };
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return { items: parsed, activities: [] };
      }
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
        activities: Array.isArray(parsed.activities) ? parsed.activities : []
      };
    } catch {
      return { items: [], activities: [] };
    }
  });

  // Sync back to localStorage
  const saveChatterPayload = useCallback((next: ChatterStoragePayload) => {
    setStoredChatter(next);
    try {
      localStorage.setItem(CHATTER_STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.warn('Error al guardar en vc-enterprise-chatter-v1', e);
    }
  }, []);

  // Composer Tabs State
  const [composerTab, setComposerTab] = useState<'note' | 'activity' | 'client'>('note');

  // Tab 1: Internal Note
  const [noteText, setNoteText] = useState('');
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Tab 2: Activity Form
  const [activityType, setActivityType] = useState<ScheduledActivity['activityType']>('call');
  const [activityTitle, setActivityTitle] = useState('');
  const [activityDueDate, setActivityDueDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [activityPriority, setActivityPriority] = useState<'Alta' | 'Media' | 'Baja'>('Media');
  const [activityAssignee, setActivityAssignee] = useState('Diseño Gráfico (Pre-prensa)');
  const [activityNotes, setActivityNotes] = useState('');

  // Tab 3: Client Interaction Form
  const [clientChannel, setClientChannel] = useState<'WhatsApp' | 'Llamada telefónica' | 'Visita en local' | 'Correo'>('WhatsApp');
  const [clientNote, setClientNote] = useState('');
  const [openWhatsAppOnSubmit, setOpenWhatsAppOnSubmit] = useState(true);

  // Filter and Search
  const [activeFilter, setActiveFilter] = useState<'all' | 'note' | 'activity' | 'stage' | 'file' | 'sale'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState(false);

  // Team mentions quick pills
  const TEAM_MENTIONS = [
    '@Diseño',
    '@Impresión',
    '@Taller',
    '@Ventas',
    '@Instalación',
    '@Urgente',
    '@Cobranzas'
  ];

  const handleInsertMention = (tag: string) => {
    setNoteText((prev) => (prev ? `${prev} ${tag} ` : `${tag} `));
    if (noteTextareaRef.current) {
      noteTextareaRef.current.focus();
    }
  };

  /* --------------------------------------------------------------------------
     Live Merged Events Engine
     -------------------------------------------------------------------------- */
  const liveEvents = useMemo(() => {
    const list: ChatterEvent[] = [];
    const normalizedRecordTitle = recordTitle ? recordTitle.toLowerCase().trim() : '';
    const normalizedRecordId = recordId ? recordId.toLowerCase().trim() : '';
    const phoneDigits = normalizeEcuadorPhone(recordPhone);

    // 1. Live Sales (data.sales)
    if (Array.isArray(data?.sales)) {
      data.sales.forEach((sale: any) => {
        const saleId = String(sale.id || '').toLowerCase();
        const saleCode = String(sale.code || '').toLowerCase();
        const saleCustomer = String(sale.customer || '').toLowerCase();
        const saleCustomerId = String(sale.customerId || sale.customer_id || '').toLowerCase();

        let matches = false;
        if (recordType === 'sale' && (saleId === normalizedRecordId || saleCode === normalizedRecordId)) {
          matches = true;
        } else if (recordType === 'customer' && (
          (saleCustomerId && saleCustomerId === normalizedRecordId) ||
          (saleCustomer && normalizedRecordTitle && saleCustomer.includes(normalizedRecordTitle))
        )) {
          matches = true;
        } else if (recordType === 'job' && (saleId === normalizedRecordId || saleCode === normalizedRecordId)) {
          matches = true;
        }

        if (matches) {
          list.push({
            id: `live-sale-${sale.id}`,
            recordType,
            recordId,
            recordTitle,
            type: 'sale',
            author: sale.actor || 'Punto de Venta Visual Corp',
            authorRole: 'Facturación y POS',
            createdAt: sale.date || sale.createdAt || new Date().toISOString(),
            title: `Comprobante de Venta #${sale.code || sale.id}`,
            content: `${sale.description || 'Venta registrada en sucursal'} (${sale.method || 'Pago registrado'}).`,
            metadata: {
              total: sale.total,
              paid: sale.paid,
              balance: sale.balance,
              status: sale.status
            }
          });
        }
      });
    }

    // 2. Live Quotes (data.quotes)
    if (Array.isArray(data?.quotes)) {
      data.quotes.forEach((quote: any) => {
        const quoteId = String(quote.id || '').toLowerCase();
        const quoteCustomer = String(quote.customer || quote.name || '').toLowerCase();
        const quotePhone = normalizeEcuadorPhone(quote.phone);

        let matches = false;
        if (recordType === 'quote' && quoteId === normalizedRecordId) {
          matches = true;
        } else if (recordType === 'customer' && (
          (quoteCustomer && normalizedRecordTitle && quoteCustomer.includes(normalizedRecordTitle)) ||
          (phoneDigits && quotePhone && phoneDigits === quotePhone)
        )) {
          matches = true;
        } else if (recordType === 'job' && (quoteId === normalizedRecordId || String(quote.jobId || '').toLowerCase() === normalizedRecordId)) {
          matches = true;
        }

        if (matches) {
          list.push({
            id: `live-quote-${quote.id}`,
            recordType,
            recordId,
            recordTitle,
            type: 'stage_change',
            author: quote.advisor || quote.adviser || 'Cotizador Visual Corp',
            authorRole: 'Asesor Comercial',
            createdAt: quote.createdAt || quote.date || new Date().toISOString(),
            title: `Cotización: ${quote.project || quote.service || quote.productName || 'Presupuesto'}`,
            content: `Estado: ${quote.status || 'En evaluación'} · Importe total estimado: ${formatMoney(quote.total || quote.pricePreview?.normal || 0)}.`
          });
        }
      });
    }

    // 3. Live Inventory Movements (data.inventoryMovements)
    if (Array.isArray(data?.inventoryMovements)) {
      data.inventoryMovements.forEach((mov: any) => {
        const itemId = String(mov.itemId || mov.variantId || '').toLowerCase();
        const ref = String(mov.reference || '').toLowerCase();
        const reason = String(mov.reason || '').toLowerCase();
        const itemName = String(mov.itemName || '').toLowerCase();

        let matches = false;
        if (recordType === 'inventory' && (itemId === normalizedRecordId || (itemName && normalizedRecordTitle && itemName.includes(normalizedRecordTitle)))) {
          matches = true;
        } else if (recordType === 'job' && (ref === normalizedRecordId || reason.includes(normalizedRecordId))) {
          matches = true;
        }

        if (matches) {
          list.push({
            id: `live-mov-${mov.id}`,
            recordType,
            recordId,
            recordTitle,
            type: 'system',
            author: mov.actor || 'Bodega General Visual Corp',
            authorRole: 'Control de Materiales',
            createdAt: mov.createdAt || new Date().toISOString(),
            title: `Movimiento de Inventario: ${mov.type || 'Consumo'}`,
            content: `${mov.itemName || 'Material'} (${mov.quantityDelta > 0 ? '+' : ''}${mov.quantityDelta} ${mov.unit || 'uds'}) · Motivo: ${mov.reason || 'Producción de taller'}.`
          });
        }
      });
    }

    // 4. Live Files from Vault (vc-enterprise-vault-v1)
    try {
      const vaultRaw = localStorage.getItem(VAULT_STORAGE_KEY);
      if (vaultRaw) {
        const vaultFiles = JSON.parse(vaultRaw);
        if (Array.isArray(vaultFiles)) {
          vaultFiles.forEach((file: any) => {
            const fRecordId = String(file.recordId || file.jobId || file.customerId || '').toLowerCase();
            const fCustomer = String(file.customerName || file.client || '').toLowerCase();
            const tags = Array.isArray(file.tags) ? file.tags.map((t: any) => String(t).toLowerCase()) : [];

            let matches = false;
            if (fRecordId === normalizedRecordId) matches = true;
            else if (tags.includes(normalizedRecordId) || (normalizedRecordTitle && tags.includes(normalizedRecordTitle))) matches = true;
            else if (recordType === 'customer' && fCustomer && normalizedRecordTitle && fCustomer.includes(normalizedRecordTitle)) matches = true;

            if (matches) {
              list.push({
                id: `live-vault-${file.id || file.name}`,
                recordType,
                recordId,
                recordTitle,
                type: 'file',
                author: file.uploadedBy || 'Vault Gráfico Visual Corp',
                authorRole: 'Pre-prensa / Artes',
                createdAt: file.uploadedAt || file.createdAt || new Date().toISOString(),
                title: `Arte en Vault: ${file.name || file.fileName || 'Archivo digital'}`,
                content: `Categoría: ${file.category || 'Arte gráfico'} · Tamaño: ${file.sizeFormatted || 'Digital'} · Estado: ${file.approvalStatus || 'En custodia'}.`
              });
            }
          });
        }
      }
    } catch {
      // Safe fallback
    }

    // 5. Live Portal Orders (vc-enterprise-portal-orders-v1)
    try {
      const portalRaw = localStorage.getItem(PORTAL_STORAGE_KEY);
      if (portalRaw) {
        const portalOrders = JSON.parse(portalRaw);
        if (Array.isArray(portalOrders)) {
          portalOrders.forEach((order: any) => {
            const orderId = String(order.id || order.jobId || order.code || '').toLowerCase();
            const orderCustomer = String(order.customer || '').toLowerCase();

            let matches = false;
            if (orderId === normalizedRecordId) matches = true;
            else if (recordType === 'customer' && orderCustomer && normalizedRecordTitle && orderCustomer.includes(normalizedRecordTitle)) matches = true;

            if (matches) {
              list.push({
                id: `live-portal-${order.id}`,
                recordType,
                recordId,
                recordTitle,
                type: 'stage_change',
                author: 'Portal Público de Seguimiento',
                authorRole: 'Sistema Web Visual Corp',
                createdAt: order.updatedAt || order.createdAt || new Date().toISOString(),
                title: `Actualización de Portal: ${order.stage || order.status || 'En producción'}`,
                content: `El cliente visualizó el estado público el ${formatDate(order.lastViewAt || order.updatedAt)}.`
              });
            }
          });
        }
      }
    } catch {
      // Safe fallback
    }

    return list;
  }, [data, recordId, recordTitle, recordType, recordPhone]);

  // Combine stored items + live events, matching this record
  const matchingStoredItems = useMemo(() => {
    return storedChatter.items.filter(
      (item) => item.recordId === recordId || (item.recordTitle && recordTitle && item.recordTitle.toLowerCase() === recordTitle.toLowerCase())
    );
  }, [storedChatter.items, recordId, recordTitle]);

  // If completely empty, generate initial baseline demo/reference items (marked as Referencia / Demo operativa)
  const initialDemoItems = useMemo<ChatterEvent[]>(() => {
    if (matchingStoredItems.length > 0 || liveEvents.length > 0) return [];
    
    return [
      {
        id: `demo-init-${recordId}`,
        recordType,
        recordId,
        recordTitle,
        type: 'system',
        author: 'Sistema Visual Corp',
        authorRole: 'Auditoría ERP',
        createdAt: new Date(Date.now() - 3600 * 1000 * 48).toISOString(),
        title: 'Apertura de Expediente 360°',
        content: `Registro creado exitosamente en el sistema operativo de Visual Corp (Milagro, Guayas). Etapa inicial: ${recordStage || 'Activo'}.`,
        isDemo: true
      },
      {
        id: `demo-note-${recordId}`,
        recordType,
        recordId,
        recordTitle,
        type: 'note',
        author: user?.email || 'esteban@visualcorp.ec',
        authorRole: 'Dirección / Operaciones',
        createdAt: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
        title: 'Verificación de Requerimientos',
        content: 'Se verificaron las especificaciones técnicas iniciales y el canal de contacto preferente. @Diseño @Taller coordinar revisión previa a impresión.',
        tags: ['@Diseño', '@Taller'],
        isDemo: true
      }
    ];
  }, [matchingStoredItems.length, liveEvents.length, recordId, recordType, recordTitle, recordStage, user?.email]);

  // All chronological items
  const allTimelineItems = useMemo(() => {
    const combined = [...matchingStoredItems, ...liveEvents, ...initialDemoItems];
    return combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [matchingStoredItems, liveEvents, initialDemoItems]);

  // Filtered timeline items
  const filteredTimelineItems = useMemo(() => {
    return allTimelineItems.filter((item) => {
      // Filter tab
      if (activeFilter === 'note' && item.type !== 'note') return false;
      if (activeFilter === 'activity' && item.type !== 'activity' && item.type !== 'activity_done') return false;
      if (activeFilter === 'stage' && item.type !== 'stage_change') return false;
      if (activeFilter === 'file' && item.type !== 'file') return false;
      if (activeFilter === 'sale' && item.type !== 'sale') return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchTitle = (item.title || '').toLowerCase().includes(query);
        const matchContent = (item.content || '').toLowerCase().includes(query);
        const matchAuthor = (item.author || '').toLowerCase().includes(query);
        const matchTags = (item.tags || []).some((t) => t.toLowerCase().includes(query));
        if (!matchTitle && !matchContent && !matchAuthor && !matchTags) return false;
      }

      return true;
    });
  }, [allTimelineItems, activeFilter, searchQuery]);

  // Counts for filter pills
  const filterCounts = useMemo(() => {
    return {
      all: allTimelineItems.length,
      note: allTimelineItems.filter((i) => i.type === 'note').length,
      activity: allTimelineItems.filter((i) => i.type === 'activity' || i.type === 'activity_done').length,
      stage: allTimelineItems.filter((i) => i.type === 'stage_change').length,
      file: allTimelineItems.filter((i) => i.type === 'file').length,
      sale: allTimelineItems.filter((i) => i.type === 'sale').length
    };
  }, [allTimelineItems]);

  // Pending scheduled activities for this record
  const pendingActivities = useMemo(() => {
    return storedChatter.activities.filter(
      (a) => (a.recordId === recordId || a.recordTitle === recordTitle) && a.status === 'pending'
    );
  }, [storedChatter.activities, recordId, recordTitle]);

  /* --------------------------------------------------------------------------
     Executive KPIs Calculation
     -------------------------------------------------------------------------- */
  const executiveKPIs = useMemo(() => {
    if (metadata && metadata.kpis) {
      return metadata.kpis;
    }

    const today = new Date().toISOString().split('T')[0];

    switch (recordType) {
      case 'customer': {
        const customerSales = (data?.sales || []).filter((s: any) =>
          String(s.customer || '').toLowerCase().includes(recordTitle.toLowerCase()) ||
          String(s.customerId || '').toLowerCase() === recordId.toLowerCase()
        );
        const totalPurchased = customerSales.reduce((acc: number, s: any) => acc + (Number(s.total) || 0), 0);
        const totalPending = customerSales.reduce((acc: number, s: any) => acc + (Number(s.balance) || 0), 0);
        const vaultCount = filterCounts.file;

        return [
          { label: 'Facturación Total', value: formatMoney(totalPurchased), tone: 'default' },
          { label: 'Saldo Pendiente', value: formatMoney(totalPending), tone: totalPending > 0 ? 'warn' : 'success' },
          { label: 'Artes en Vault', value: `${vaultCount} ${vaultCount === 1 ? 'archivo' : 'archivos'}`, tone: 'default' }
        ];
      }
      case 'job': {
        const matchingSale = (data?.sales || []).find((s: any) => s.id === recordId || s.code === recordId);
        const totalVal = metadata?.total ?? matchingSale?.total ?? 0;
        const balVal = metadata?.balance ?? matchingSale?.balance ?? 0;
        const vaultCount = filterCounts.file;

        return [
          { label: 'Valor Orden (OT)', value: totalVal > 0 ? formatMoney(totalVal) : 'Por cotizar', tone: 'default' },
          { label: 'Saldo por Cobrar', value: balVal > 0 ? formatMoney(balVal) : '$0.00 al día', tone: balVal > 0 ? 'danger' : 'success' },
          { label: 'Artes Gráficos', value: `${vaultCount} en Pre-prensa`, tone: 'default' }
        ];
      }
      case 'quote': {
        const matchingQuote = (data?.quotes || []).find((q: any) => q.id === recordId);
        const totalVal = metadata?.total ?? matchingQuote?.total ?? (matchingQuote?.pricePreview?.normal || 0);
        const validUntil = metadata?.validity || '15 días hábiles';
        const vaultCount = filterCounts.file;

        return [
          { label: 'Presupuesto Estimado', value: totalVal > 0 ? formatMoney(totalVal) : 'Borrador', tone: 'default' },
          { label: 'Vigencia Oferta', value: validUntil, tone: 'default' },
          { label: 'Pruebas Adjuntas', value: `${vaultCount} diseños`, tone: 'default' }
        ];
      }
      case 'sale': {
        const matchingSale = (data?.sales || []).find((s: any) => s.id === recordId || s.code === recordId);
        const total = matchingSale?.total ?? metadata?.total ?? 0;
        const paid = matchingSale?.paid ?? metadata?.paid ?? 0;
        const balance = matchingSale?.balance ?? metadata?.balance ?? 0;

        return [
          { label: 'Total Venta', value: formatMoney(total), tone: 'default' },
          { label: 'Abonado / Pagado', value: formatMoney(paid), tone: 'success' },
          { label: 'Saldo Pendiente', value: formatMoney(balance), tone: balance > 0 ? 'danger' : 'success' }
        ];
      }
      case 'inventory': {
        const item = (data?.inventory || []).find((i: any) => i.id === recordId || i.sku === recordId);
        const currentQty = item?.quantity ?? metadata?.quantity ?? 0;
        const reservedQty = item?.reservedQuantity ?? 0;
        const unit = item?.unit || 'uds';

        return [
          { label: 'Stock en Bodega', value: `${currentQty} ${unit}`, tone: currentQty <= (item?.minimum || 5) ? 'warn' : 'default' },
          { label: 'Comprometido OT', value: `${reservedQty} ${unit}`, tone: 'default' },
          { label: 'Movimientos', value: `${filterCounts.all} registros`, tone: 'default' }
        ];
      }
      default:
        return [
          { label: 'Estado Actual', value: recordStage || 'Activo', tone: 'default' },
          { label: 'Actividades', value: `${pendingActivities.length} pendientes`, tone: 'default' },
          { label: 'Historial', value: `${filterCounts.all} eventos`, tone: 'default' }
        ];
    }
  }, [recordType, recordTitle, recordId, metadata, data?.sales, data?.quotes, data?.inventory, filterCounts.file, filterCounts.all, pendingActivities.length, recordStage]);

  /* --------------------------------------------------------------------------
     Quick Action Handlers
     -------------------------------------------------------------------------- */
  const handleOpenWhatsApp = () => {
    const phone = normalizeEcuadorPhone(recordPhone);
    const text = buildWhatsAppMessage(recordType, recordTitle, recordId);
    
    // Log WhatsApp launch to timeline
    const auditItem: ChatterEvent = {
      id: `wa-${Date.now()}`,
      recordType,
      recordId,
      recordTitle,
      type: 'whatsapp',
      author: user?.email || 'Equipo Visual Corp',
      authorRole: 'Atención al Cliente',
      createdAt: new Date().toISOString(),
      title: `Mensaje WhatsApp Directo: ${recordTitle}`,
      content: `Mensaje enviado al número ${recordPhone || 'registrado'}: "${text}"`
    };

    saveChatterPayload({
      ...storedChatter,
      items: [auditItem, ...storedChatter.items]
    });

    if (phone) {
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      flash?.('Abriendo WhatsApp Web / App con el cliente...');
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      flash?.('Abriendo WhatsApp para seleccionar contacto...');
    }
  };

  const handleCopyPortalLink = () => {
    const url = `${window.location.origin}/seguimiento/${encodeURIComponent(recordId)}`;
    navigator.clipboard?.writeText(url);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2400);
    flash?.('¡Enlace del portal público copiado al portapapeles!');
  };

  /* --------------------------------------------------------------------------
     Composer Form Submissions
     -------------------------------------------------------------------------- */
  // 1. Submit Internal Note
  const handleSubmitNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;

    const detectedMentions = extractMentions(noteText);
    const newNote: ChatterEvent = {
      id: `note-${Date.now()}`,
      recordType,
      recordId,
      recordTitle,
      type: 'note',
      author: user?.email || 'Equipo Visual Corp',
      authorRole: 'Colaborador Interno',
      createdAt: new Date().toISOString(),
      content: noteText.trim(),
      tags: detectedMentions
    };

    saveChatterPayload({
      ...storedChatter,
      items: [newNote, ...storedChatter.items]
    });

    setNoteText('');
    flash?.('Nota interna publicada y visible para el equipo.');
  };

  // 2. Submit Scheduled Activity
  const handleSubmitActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityTitle.trim()) return;

    const newActivity: ScheduledActivity = {
      id: `act-${Date.now()}`,
      recordType,
      recordId,
      recordTitle,
      title: activityTitle.trim(),
      activityType,
      dueDate: activityDueDate,
      priority: activityPriority,
      assignee: activityAssignee,
      assignedBy: user?.email || 'Equipo Visual Corp',
      notes: activityNotes.trim() || undefined,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const timelineLog: ChatterEvent = {
      id: `log-act-${Date.now()}`,
      recordType,
      recordId,
      recordTitle,
      type: 'activity',
      author: user?.email || 'Equipo Visual Corp',
      authorRole: 'Planificación Operativa',
      createdAt: new Date().toISOString(),
      title: `Actividad programada: ${activityTitle.trim()}`,
      content: `Asignado a: ${activityAssignee} · Vence: ${formatDate(activityDueDate)} · Prioridad: ${activityPriority}.${activityNotes ? ` Detalle: ${activityNotes}` : ''}`
    };

    saveChatterPayload({
      items: [timelineLog, ...storedChatter.items],
      activities: [newActivity, ...storedChatter.activities]
    });

    setActivityTitle('');
    setActivityNotes('');
    flash?.('Actividad agendada con éxito.');
  };

  // 3. Submit Client Interaction
  const handleSubmitClientInteraction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientNote.trim()) return;

    const phone = normalizeEcuadorPhone(recordPhone);
    const newEvent: ChatterEvent = {
      id: `client-${Date.now()}`,
      recordType,
      recordId,
      recordTitle,
      type: clientChannel === 'WhatsApp' ? 'whatsapp' : clientChannel === 'Llamada telefónica' ? 'call' : 'note',
      author: user?.email || 'Equipo Visual Corp',
      authorRole: 'Atención al Cliente',
      createdAt: new Date().toISOString(),
      title: `Interacción por ${clientChannel} con ${recordTitle}`,
      content: clientNote.trim()
    };

    saveChatterPayload({
      ...storedChatter,
      items: [newEvent, ...storedChatter.items]
    });

    if (openWhatsAppOnSubmit && clientChannel === 'WhatsApp') {
      const url = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(clientNote.trim())}`
        : `https://wa.me/?text=${encodeURIComponent(clientNote.trim())}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    setClientNote('');
    flash?.('Interacción con cliente guardada en el expediente.');
  };

  // Mark Activity Done
  const handleCompleteActivity = (act: ScheduledActivity) => {
    const updatedActivities = storedChatter.activities.map((a) =>
      a.id === act.id ? { ...a, status: 'completed' as const, completedAt: new Date().toISOString() } : a
    );

    const completionLog: ChatterEvent = {
      id: `act-done-${Date.now()}`,
      recordType,
      recordId,
      recordTitle,
      type: 'activity_done',
      author: user?.email || 'Equipo Visual Corp',
      authorRole: 'Taller y Gestión',
      createdAt: new Date().toISOString(),
      title: `Actividad completada: ${act.title}`,
      content: `Marcada como resuelta por ${user?.email || 'Equipo Visual Corp'} asignada a ${act.assignee}.`
    };

    saveChatterPayload({
      items: [completionLog, ...storedChatter.items],
      activities: updatedActivities
    });

    flash?.('Actividad completada y archivada en el Chatter.');
  };

  // Delete manual note
  const handleDeleteNote = (noteId: string) => {
    if (!window.confirm('¿Deseas eliminar esta nota interna del historial?')) return;
    saveChatterPayload({
      ...storedChatter,
      items: storedChatter.items.filter((i) => i.id !== noteId)
    });
    flash?.('Nota eliminada del historial.');
  };

  // Copy note content
  const handleCopyContent = (text: string) => {
    navigator.clipboard?.writeText(text);
    flash?.('Texto copiado al portapapeles');
  };

  /* --------------------------------------------------------------------------
     Record Badge Helper
     -------------------------------------------------------------------------- */
  const recordTypeConfig = useMemo(() => {
    switch (recordType) {
      case 'customer':
        return { label: 'CLIENTE 360°', icon: User, className: 'vc-chatter-type-customer' };
      case 'job':
        return { label: 'ORDEN DE TRABAJO', icon: FileCheck2, className: 'vc-chatter-type-job' };
      case 'quote':
        return { label: 'COTIZACIÓN', icon: FileText, className: 'vc-chatter-type-quote' };
      case 'sale':
        return { label: 'VENTA / FACTURA', icon: DollarSign, className: 'vc-chatter-type-sale' };
      case 'inventory':
        return { label: 'ARTÍCULO DE BODEGA', icon: Package, className: 'vc-chatter-type-inventory' };
      default:
        return { label: 'EXPEDIENTE 360°', icon: Building2, className: 'vc-chatter-type-customer' };
    }
  }, [recordType]);

  const TypeIcon = recordTypeConfig.icon;

  return (
    <div className="vc-chatter-timeline-container">
      {/* 1. 360° Executive Header & Quick KPIs */}
      <section className="vc-chatter-header-card">
        <div className="vc-chatter-header-main">
          <div className="vc-chatter-title-wrap">
            <div className="vc-chatter-badge-row">
              <span className={`vc-chatter-type-pill ${recordTypeConfig.className}`}>
                <TypeIcon size={12} />
                {recordTypeConfig.label}
              </span>
              {recordStage && (
                <span className="vc-chatter-stage-badge">
                  <span className="vc-chatter-stage-dot" />
                  {recordStage}
                </span>
              )}
            </div>
            <h2 className="vc-chatter-title">{recordTitle || 'Expediente Sin Título'}</h2>
            {recordSubtitle && <p className="vc-chatter-subtitle">{recordSubtitle}</p>}
          </div>
        </div>

        {/* 3 Quick KPIs */}
        <div className="vc-chatter-kpis-grid">
          {executiveKPIs.map((kpi: any, idx: number) => (
            <div key={idx} className="vc-chatter-kpi-card">
              <span className="vc-chatter-kpi-label">{kpi.label}</span>
              <span className={`vc-chatter-kpi-value ${kpi.tone ? `is-${kpi.tone}` : ''}`}>
                {kpi.value}
              </span>
            </div>
          ))}
        </div>

        {/* Quick Action Bar */}
        <div className="vc-chatter-action-bar">
          <button
            type="button"
            className="vc-chatter-action-btn is-whatsapp"
            onClick={handleOpenWhatsApp}
            title="Abrir chat de WhatsApp con plantilla personalizada"
          >
            <PhoneCall size={14} />
            <span>WhatsApp Directo</span>
          </button>

          <Link
            to={`/seguimiento/${encodeURIComponent(recordId)}`}
            className="vc-chatter-action-btn is-portal"
            title="Abrir portal público de seguimiento en vivo"
          >
            <ExternalLink size={14} />
            <span>Portal de Seguimiento</span>
          </Link>

          <button
            type="button"
            className="vc-chatter-action-btn"
            onClick={handleCopyPortalLink}
            title="Copiar enlace directo del portal para el cliente"
          >
            {copiedId ? <CheckCheck size={14} color="#10b981" /> : <Copy size={14} />}
            <span>{copiedId ? '¡Copiado!' : 'Copiar Enlace'}</span>
          </button>

          <Link
            to="/operaciones/archivos"
            className="vc-chatter-action-btn"
            title="Consultar artes y archivos en el Vault gráfico"
          >
            <FolderOpen size={14} />
            <span>Ver en Vault</span>
          </Link>
        </div>
      </section>

      {/* 2. Composer Box (Odoo Chatter Style) */}
      <section className="vc-chatter-composer">
        <div className="vc-chatter-composer-tabs">
          <button
            type="button"
            className={`vc-chatter-composer-tab ${composerTab === 'note' ? 'is-active' : ''}`}
            onClick={() => setComposerTab('note')}
          >
            <MessageSquare size={14} />
            <span>Nota interna (@equipo)</span>
          </button>

          <button
            type="button"
            className={`vc-chatter-composer-tab ${composerTab === 'activity' ? 'is-active' : ''}`}
            onClick={() => setComposerTab('activity')}
          >
            <Calendar size={14} />
            <span>Agendar actividad / recordatorio</span>
          </button>

          <button
            type="button"
            className={`vc-chatter-composer-tab ${composerTab === 'client' ? 'is-active' : ''}`}
            onClick={() => setComposerTab('client')}
          >
            <PhoneCall size={14} />
            <span>Registrar interacción con cliente</span>
          </button>
        </div>

        <div className="vc-chatter-composer-body">
          {/* TAB 1: Internal Note */}
          {composerTab === 'note' && (
            <form onSubmit={handleSubmitNote} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="vc-chatter-mention-row">
                <span className="vc-chatter-mention-label">Menciones rápidas:</span>
                {TEAM_MENTIONS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="vc-chatter-mention-pill"
                    onClick={() => handleInsertMention(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <textarea
                ref={noteTextareaRef}
                className="vc-chatter-textarea"
                rows={3}
                placeholder="Escribe una nota interna para taller, diseño o ventas (ej: @Diseño revisar bleed de 3mm y curvas)..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />

              <div className="vc-chatter-composer-footer">
                <span className="vc-chatter-author-indicator">
                  <User size={13} />
                  <span>Publicando como: <b>{user?.email || 'Equipo Visual Corp'}</b></span>
                </span>

                <button
                  type="submit"
                  className="vc-chatter-btn-submit"
                  disabled={!noteText.trim()}
                >
                  <Send size={14} />
                  <span>Publicar nota interna</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: Schedule Activity */}
          {composerTab === 'activity' && (
            <form onSubmit={handleSubmitActivity} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="vc-chatter-form-row">
                <div className="vc-chatter-form-field">
                  <label className="vc-chatter-form-label">Tipo de Actividad</label>
                  <select
                    className="vc-chatter-select"
                    value={activityType}
                    onChange={(e) => setActivityType(e.target.value as any)}
                  >
                    <option value="call">📞 Llamada telefónica con cliente</option>
                    <option value="proof_review">🎨 Revisión y firma de arte digital</option>
                    <option value="quote_followup">📋 Seguimiento a cotización enviada</option>
                    <option value="production">🖨️ Impresión / Fabricación en taller</option>
                    <option value="installation">🔧 Instalación en sitio / Montaje</option>
                    <option value="payment_collection">💵 Cobro de saldo / Entrega</option>
                    <option value="general">📌 Tarea general / Reabastecimiento</option>
                  </select>
                </div>

                <div className="vc-chatter-form-field">
                  <label className="vc-chatter-form-label">Fecha de Vencimiento</label>
                  <input
                    type="date"
                    className="vc-chatter-input"
                    value={activityDueDate}
                    onChange={(e) => setActivityDueDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="vc-chatter-form-field">
                <label className="vc-chatter-form-label">Resumen de la Tarea</label>
                <input
                  type="text"
                  className="vc-chatter-input"
                  placeholder="Ej: Confirmar aprobación de medidas y acabado con el cliente"
                  value={activityTitle}
                  onChange={(e) => setActivityTitle(e.target.value)}
                  required
                />
              </div>

              <div className="vc-chatter-form-row">
                <div className="vc-chatter-form-field">
                  <label className="vc-chatter-form-label">Asignado a</label>
                  <select
                    className="vc-chatter-select"
                    value={activityAssignee}
                    onChange={(e) => setActivityAssignee(e.target.value)}
                  >
                    <option value="Esteban Calderón (Director)">Esteban Calderón (Director)</option>
                    <option value="Diseño Gráfico (Pre-prensa)">Diseño Gráfico (Pre-prensa)</option>
                    <option value="Taller y Producción (Milagro)">Taller y Producción (Milagro)</option>
                    <option value="Ventas y Atención al Cliente">Ventas y Atención al Cliente</option>
                    <option value="Instalaciones y Montaje">Instalaciones y Montaje</option>
                    <option value="Administración y Cobranzas">Administración y Cobranzas</option>
                    {user?.email && <option value={user.email}>{user.email} (Yo)</option>}
                  </select>
                </div>

                <div className="vc-chatter-form-field">
                  <label className="vc-chatter-form-label">Prioridad</label>
                  <div className="vc-chatter-priority-group">
                    {(['Baja', 'Media', 'Alta'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`vc-chatter-priority-btn ${activityPriority === p ? `is-active priority-${p.toLowerCase()}` : ''}`}
                        onClick={() => setActivityPriority(p)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="vc-chatter-form-field">
                <label className="vc-chatter-form-label">Detalles / Instrucciones (Opcional)</label>
                <textarea
                  className="vc-chatter-textarea"
                  rows={2}
                  placeholder="Notas adicionales para el responsable..."
                  value={activityNotes}
                  onChange={(e) => setActivityNotes(e.target.value)}
                />
              </div>

              <div className="vc-chatter-composer-footer">
                <span className="vc-chatter-author-indicator">
                  <Clock size={13} />
                  <span>Se registrará en el calendario y la timeline del expediente.</span>
                </span>

                <button
                  type="submit"
                  className="vc-chatter-btn-submit"
                  disabled={!activityTitle.trim()}
                >
                  <Calendar size={14} />
                  <span>Agendar actividad</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: Client Interaction */}
          {composerTab === 'client' && (
            <form onSubmit={handleSubmitClientInteraction} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="vc-chatter-form-row">
                <div className="vc-chatter-form-field">
                  <label className="vc-chatter-form-label">Canal de Contacto</label>
                  <select
                    className="vc-chatter-select"
                    value={clientChannel}
                    onChange={(e) => setClientChannel(e.target.value as any)}
                  >
                    <option value="WhatsApp">💬 WhatsApp</option>
                    <option value="Llamada telefónica">📞 Llamada telefónica</option>
                    <option value="Visita en local">🏪 Visita en local (Milagro)</option>
                    <option value="Correo">✉️ Correo electrónico</option>
                  </select>
                </div>

                <div className="vc-chatter-form-field">
                  <label className="vc-chatter-form-label">Teléfono / Destino</label>
                  <input
                    type="text"
                    className="vc-chatter-input"
                    value={recordPhone || 'Sin teléfono especificado'}
                    readOnly
                  />
                </div>
              </div>

              <div className="vc-chatter-form-field">
                <label className="vc-chatter-form-label">Acuerdos o Mensaje Tratado</label>
                <textarea
                  className="vc-chatter-textarea"
                  rows={3}
                  placeholder="El cliente aprobó la muestra en físico, solicita entrega el viernes por la mañana..."
                  value={clientNote}
                  onChange={(e) => setClientNote(e.target.value)}
                  required
                />
              </div>

              {clientChannel === 'WhatsApp' && (
                <label className="vc-chatter-checkbox-row">
                  <input
                    type="checkbox"
                    checked={openWhatsAppOnSubmit}
                    onChange={(e) => setOpenWhatsAppOnSubmit(e.target.checked)}
                  />
                  <span>Abrir WhatsApp Web / App automáticamente con este mensaje al guardar</span>
                </label>
              )}

              <div className="vc-chatter-composer-footer">
                <span className="vc-chatter-author-indicator">
                  <User size={13} />
                  <span>Contacto registrado para <b>{recordTitle}</b></span>
                </span>

                <button
                  type="submit"
                  className="vc-chatter-btn-submit"
                  disabled={!clientNote.trim()}
                >
                  <Send size={14} />
                  <span>Guardar interacción con cliente</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* 3. Pending Scheduled Activities Strip */}
      {pendingActivities.length > 0 && (
        <section className="vc-chatter-activities-strip">
          <div className="vc-chatter-activities-title-row">
            <h3 className="vc-chatter-activities-title">
              <Clock size={15} />
              <span>Actividades Pendientes</span>
            </h3>
            <span className="vc-chatter-activities-count">{pendingActivities.length} por resolver</span>
          </div>

          <div className="vc-chatter-activity-list">
            {pendingActivities.map((act) => {
              const todayStr = new Date().toISOString().split('T')[0];
              const isOverdue = act.dueDate < todayStr;
              const isToday = act.dueDate === todayStr;

              return (
                <div
                  key={act.id}
                  className={`vc-chatter-activity-card ${isOverdue ? 'is-overdue' : ''}`}
                >
                  <div className="vc-chatter-activity-main">
                    <div className="vc-chatter-activity-headline">
                      <span className="vc-chatter-activity-name">{act.title}</span>
                      <span
                        className={`vc-chatter-activity-due ${
                          isOverdue ? 'is-overdue' : isToday ? 'is-today' : 'is-upcoming'
                        }`}
                      >
                        {isOverdue ? `⚠️ Vencida (${act.dueDate})` : isToday ? '📅 Para Hoy' : `🗓️ ${formatDate(act.dueDate)}`}
                      </span>
                    </div>

                    <div className="vc-chatter-activity-meta">
                      <span>Asignado: <b>{act.assignee}</b></span>
                      <span>· Prioridad: <b>{act.priority}</b></span>
                      {act.notes && <span>· <i>"{act.notes}"</i></span>}
                    </div>
                  </div>

                  <div className="vc-chatter-activity-actions">
                    <button
                      type="button"
                      className="vc-chatter-btn-complete"
                      onClick={() => handleCompleteActivity(act)}
                      title="Marcar como realizada y archivar en el Chatter"
                    >
                      <Check size={14} />
                      <span>Completada</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. Unified Chronological Timeline (Chatter Feed) */}
      <section className="vc-chatter-timeline-section">
        <div className="vc-chatter-feed-controls">
          <div className="vc-chatter-filter-pills">
            <button
              type="button"
              className={`vc-chatter-filter-pill ${activeFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => setActiveFilter('all')}
            >
              Todo ({filterCounts.all})
            </button>
            <button
              type="button"
              className={`vc-chatter-filter-pill ${activeFilter === 'note' ? 'is-active' : ''}`}
              onClick={() => setActiveFilter('note')}
            >
              Notas ({filterCounts.note})
            </button>
            <button
              type="button"
              className={`vc-chatter-filter-pill ${activeFilter === 'activity' ? 'is-active' : ''}`}
              onClick={() => setActiveFilter('activity')}
            >
              Actividades ({filterCounts.activity})
            </button>
            <button
              type="button"
              className={`vc-chatter-filter-pill ${activeFilter === 'stage' ? 'is-active' : ''}`}
              onClick={() => setActiveFilter('stage')}
            >
              Estados ({filterCounts.stage})
            </button>
            <button
              type="button"
              className={`vc-chatter-filter-pill ${activeFilter === 'file' ? 'is-active' : ''}`}
              onClick={() => setActiveFilter('file')}
            >
              Vault ({filterCounts.file})
            </button>
            <button
              type="button"
              className={`vc-chatter-filter-pill ${activeFilter === 'sale' ? 'is-active' : ''}`}
              onClick={() => setActiveFilter('sale')}
            >
              Ventas ({filterCounts.sale})
            </button>
          </div>

          <div className="vc-chatter-search-wrap">
            <Search size={14} className="vc-chatter-search-icon" />
            <input
              type="text"
              className="vc-chatter-search-input"
              placeholder="Buscar en el historial..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Vertical Rail Stream */}
        {filteredTimelineItems.length === 0 ? (
          <div className="vc-chatter-empty-state">
            <div className="vc-chatter-empty-icon">
              <MessageSquare size={22} />
            </div>
            <h4 className="vc-chatter-empty-title">Sin eventos en este filtro</h4>
            <p className="vc-chatter-empty-text">
              Publica una nota interna o agenda una actividad con el formulario superior para iniciar el historial.
            </p>
          </div>
        ) : (
          <div className="vc-chatter-rail-wrap">
            {filteredTimelineItems.map((event) => {
              // Icon Node setup
              let NodeIcon = MessageSquare;
              let nodeClass = 'node-note';
              let badgeText = 'NOTA INTERNA';

              switch (event.type) {
                case 'note':
                  NodeIcon = MessageSquare;
                  nodeClass = 'node-note';
                  badgeText = 'NOTA INTERNA';
                  break;
                case 'activity':
                  NodeIcon = Clock;
                  nodeClass = 'node-activity';
                  badgeText = 'RECORDATORIO';
                  break;
                case 'activity_done':
                  NodeIcon = CheckCircle2;
                  nodeClass = 'node-activity_done';
                  badgeText = 'ACTIVIDAD REALIZADA';
                  break;
                case 'whatsapp':
                  NodeIcon = PhoneCall;
                  nodeClass = 'node-whatsapp';
                  badgeText = 'WHATSAPP';
                  break;
                case 'call':
                  NodeIcon = PhoneCall;
                  nodeClass = 'node-call';
                  badgeText = 'LLAMADA';
                  break;
                case 'stage_change':
                  NodeIcon = RefreshCw;
                  nodeClass = 'node-stage_change';
                  badgeText = 'CAMBIO DE ETAPA';
                  break;
                case 'file':
                  NodeIcon = FolderOpen;
                  nodeClass = 'node-file';
                  badgeText = 'ARCHIVO / ARTE';
                  break;
                case 'sale':
                  NodeIcon = DollarSign;
                  nodeClass = 'node-sale';
                  badgeText = 'COMPROBANTE';
                  break;
                case 'system':
                  NodeIcon = ShieldCheck;
                  nodeClass = 'node-system';
                  badgeText = 'SISTEMA ERP';
                  break;
              }

              return (
                <div key={event.id} className="vc-chatter-event-item">
                  <div className={`vc-chatter-event-icon-node ${nodeClass}`}>
                    <NodeIcon size={14} />
                  </div>

                  <article className="vc-chatter-event-card">
                    <header className="vc-chatter-event-card-header">
                      <div className="vc-chatter-event-author-info">
                        <span className="vc-chatter-event-author-name">{event.author}</span>
                        {event.authorRole && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--vc-chatter-ink-muted)' }}>
                            ({event.authorRole})
                          </span>
                        )}
                        <span className="vc-chatter-event-badge">{badgeText}</span>
                        {event.isDemo && (
                          <span className="vc-chatter-event-badge is-demo">
                            📌 Referencia / Demo operativa
                          </span>
                        )}
                      </div>

                      <div className="vc-chatter-event-meta-actions">
                        <span
                          className="vc-chatter-event-time"
                          title={formatDate(event.createdAt)}
                        >
                          {getRelativeTime(event.createdAt)}
                        </span>

                        <button
                          type="button"
                          className="vc-chatter-icon-btn"
                          style={{ width: '26px', height: '26px' }}
                          onClick={() => handleCopyContent(event.content)}
                          title="Copiar texto"
                        >
                          <Copy size={13} />
                        </button>

                        {event.id.startsWith('note-') && (
                          <button
                            type="button"
                            className="vc-chatter-icon-btn"
                            style={{ width: '26px', height: '26px', color: 'var(--vc-chatter-danger)' }}
                            onClick={() => handleDeleteNote(event.id)}
                            title="Eliminar esta nota"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </header>

                    {event.title && (
                      <h4 className="vc-chatter-event-title">{event.title}</h4>
                    )}

                    <div className="vc-chatter-event-content">
                      {event.content.split(' ').map((word, wordIdx) => {
                        if (word.startsWith('@')) {
                          return (
                            <span key={wordIdx} className="vc-chatter-mention-tag">
                              {word}{' '}
                            </span>
                          );
                        }
                        return `${word} `;
                      })}
                    </div>

                    {/* Financial details pills for sales */}
                    {event.metadata && typeof event.metadata.total !== 'undefined' && (
                      <div className="vc-chatter-event-metrics-row">
                        <span className="vc-chatter-event-metric-pill">
                          Total: <b>{formatMoney(event.metadata.total)}</b>
                        </span>
                        {typeof event.metadata.paid !== 'undefined' && (
                          <span className="vc-chatter-event-metric-pill">
                            Abonado: <b>{formatMoney(event.metadata.paid)}</b>
                          </span>
                        )}
                        {typeof event.metadata.balance !== 'undefined' && (
                          <span className="vc-chatter-event-metric-pill">
                            Saldo: <b>{formatMoney(event.metadata.balance)}</b>
                          </span>
                        )}
                      </div>
                    )}
                  </article>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/* --------------------------------------------------------------------------
   ChatterDrawer360 (Slide-over Drawer Shell)
   -------------------------------------------------------------------------- */
export function ChatterDrawer360({
  open,
  onClose,
  recordType,
  recordId,
  recordTitle,
  recordSubtitle,
  recordPhone,
  recordStage,
  metadata
}: ChatterDrawer360Props) {
  // ESC key listener to dismiss drawer
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="vc-chatter-drawer-root"
      role="dialog"
      aria-modal="true"
      aria-label={`Expediente 360 y Chatter de ${recordTitle}`}
    >
      <div
        className="vc-chatter-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className="vc-chatter-drawer-panel">
        <header className="vc-chatter-drawer-topbar">
          <div className="vc-chatter-drawer-topbar-info">
            <span className="vc-chatter-drawer-label">
              <Sparkles size={13} />
              <span>EXPEDIENTE 360° · VISUAL CORP</span>
            </span>
            <span className="vc-chatter-drawer-id">
              REF / ID: {recordId}
            </span>
          </div>

          <div className="vc-chatter-drawer-topbar-actions">
            <button
              type="button"
              className="vc-chatter-icon-btn"
              onClick={onClose}
              title="Cerrar panel (Esc)"
              aria-label="Cerrar panel lateral"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <div className="vc-chatter-drawer-content">
          <ChatterTimelinePanel
            recordType={recordType}
            recordId={recordId}
            recordTitle={recordTitle}
            recordSubtitle={recordSubtitle}
            recordPhone={recordPhone}
            recordStage={recordStage}
            metadata={metadata}
          />
        </div>
      </aside>
    </div>,
    document.body
  );
}

export default ChatterDrawer360;
