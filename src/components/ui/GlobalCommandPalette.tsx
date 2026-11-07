import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Box,
  Building2,
  Check,
  Clock,
  Copy,
  CornerDownLeft,
  ExternalLink,
  FileText,
  FolderOpen,
  Layers,
  MessageSquare,
  Moon,
  Plus,
  Printer,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Sun,
  User,
  X,
  Zap,
} from 'lucide-react';
import { useWorkspace, formatMoney } from '../../app/workspace';
import { ChatterDrawer360 } from './ChatterDrawer360';
import './global-command-palette.css';

/* --------------------------------------------------------------------------
   Types & Interfaces
   -------------------------------------------------------------------------- */

export type CommandCategory =
  | 'todos'
  | 'modulos'
  | 'acciones'
  | 'clientes'
  | 'cotizaciones'
  | 'inventario';

export interface CommandItem {
  id: string;
  category: 'modulos' | 'acciones' | 'clientes' | 'cotizaciones' | 'inventario';
  title: string;
  subtitle?: string;
  keywords?: string[];
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
  isReference?: boolean;
  shortcut?: string;
  onSelect: () => void;
  extraInfo?: {
    path?: string;
    phone?: string;
    ruc?: string;
    email?: string;
    total?: number;
    formattedTotal?: string;
    status?: string;
    stock?: number;
    unit?: string;
    sku?: string;
    branch?: string;
    area?: string;
    customerData?: any;
  };
}

export interface GlobalCommandPaletteProps {
  /** Permite control externo de apertura */
  isOpen?: boolean;
  /** Callback invocado al cerrar el diálogo */
  onClose?: () => void;
  /** Si debe renderizar un botón disparador inline en el layout */
  triggerButton?: boolean;
  /** Clases CSS adicionales para el botón disparador */
  triggerClassName?: string;
}

/* --------------------------------------------------------------------------
   Helper Hook Seguro para Workspace Context
   -------------------------------------------------------------------------- */
function useSafeWorkspace() {
  try {
    return useWorkspace();
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------------------
   Datos de Referencia / Demo Operativa (Milagro, Ecuador)
   (Cumplimiento Regla 2: no inventar precios sin confirmar, marcar claramente)
   -------------------------------------------------------------------------- */
const DEMO_CUSTOMERS = [
  {
    id: 'demo-cust-1',
    name: 'Comercial La Ganga — Sucursal Milagro',
    documentReference: '0992837465001',
    phone: '0967872396',
    email: 'compras@laganga.com.ec',
    notes: 'Cliente corporativo de rótulos acrílicos y viniles de vitrina.',
    isReference: true,
  },
  {
    id: 'demo-cust-2',
    name: 'Farmacias Cruz Azul (Centro Milagro)',
    documentReference: '0991823746001',
    phone: '0997078212',
    email: 'marketing@cruzazulmilagro.ec',
    notes: 'Campañas mensuales de microperforado y banners promocionales.',
    isReference: true,
  },
  {
    id: 'demo-cust-3',
    name: 'Dra. Elena Salazar — Clínica Odontológica',
    documentReference: '0928374651',
    phone: '0981234567',
    email: 'contacto@clinicasalazar.com',
    notes: 'Señalética interna en acrílico dorado y tarjetas mate.',
    isReference: true,
  },
  {
    id: 'demo-cust-4',
    name: 'Restaurante El Rincón Manabita',
    documentReference: '0993049581001',
    phone: '0968123456',
    email: 'gerencia@rinconmanabita.ec',
    notes: 'Menús acrílicos, cajas luminosas LED y uniformes sublimados.',
    isReference: true,
  },
];

const DEMO_QUOTES = [
  {
    id: 'demo-quote-1',
    code: 'COT-2026-089',
    customer: 'Comercial La Ganga — Sucursal Milagro',
    total: 385.5,
    status: 'Aprobada',
    date: '2026-11-06',
    isReference: true,
  },
  {
    id: 'demo-quote-2',
    code: 'COT-2026-092',
    customer: 'Farmacias Cruz Azul (Centro Milagro)',
    total: 142.0,
    status: 'En Producción',
    date: '2026-11-07',
    isReference: true,
  },
  {
    id: 'demo-quote-3',
    code: 'COT-2026-095',
    customer: 'Dra. Elena Salazar — Odontología',
    total: 89.0,
    status: 'Borrador',
    date: '2026-11-07',
    isReference: true,
  },
  {
    id: 'demo-quote-4',
    code: 'COT-2026-098',
    customer: 'Restaurante El Rincón Manabita',
    total: 620.0,
    status: 'Facturada',
    date: '2026-11-05',
    isReference: true,
  },
];

const DEMO_INVENTORY = [
  {
    id: 'demo-inv-1',
    sku: 'VC-INV-IMP-007',
    name: 'Rollo Lona Banner 13oz Brillante 3.20m × 50m',
    category: 'Lonas',
    unit: 'metro',
    quantity: 45,
    branch: 'Visual Corp',
    area: 'Impresión Gran Formato',
    isReference: true,
  },
  {
    id: 'demo-inv-2',
    sku: 'VC-INV-TRO-001',
    name: 'Rollo Vinil Adhesivo Blanco Brillante Arlon 1.52m',
    category: 'Viniles',
    unit: 'metro',
    quantity: 32,
    branch: 'Visual Corp',
    area: 'Troquelado',
    isReference: true,
  },
  {
    id: 'demo-inv-3',
    sku: 'VC-INV-IMP-009',
    name: 'Tinta Eco-Solvente Mimaki Cyan (Botella 1 Litro)',
    category: 'Tintas',
    unit: 'litro',
    quantity: 6,
    branch: 'Visual Corp',
    area: 'Impresión',
    isReference: true,
  },
  {
    id: 'demo-inv-4',
    sku: 'VC-INV-LAS-002',
    name: 'Plancha Acrílico Cristal 3mm 1.22m × 2.44m',
    category: 'Plásticos',
    unit: 'hoja',
    quantity: 8,
    branch: 'Gigaprint',
    area: 'Corte Láser',
    isReference: true,
  },
];

/* --------------------------------------------------------------------------
   Componente Principal: GlobalCommandPalette
   -------------------------------------------------------------------------- */
export function GlobalCommandPalette({
  isOpen: externalIsOpen,
  onClose: externalOnClose,
  triggerButton = false,
  triggerClassName = '',
}: GlobalCommandPaletteProps) {
  const navigate = useNavigate();
  const workspace = useSafeWorkspace();

  // Estado interno de apertura
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = externalIsOpen !== undefined;
  const open = isControlled ? externalIsOpen : internalOpen;

  // Entrada de búsqueda, categoría y navegación por teclado
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CommandCategory>('todos');
  const [activeIndex, setActiveIndex] = useState(0);

  // Sucursal activa y Tema (Light / Dark)
  const [branch, setBranch] = useState<'Visual Corp' | 'Gigaprint'>(() => {
    try {
      return (localStorage.getItem('visualcorp_current_branch') as any) || 'Visual Corp';
    } catch {
      return 'Visual Corp';
    }
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const docTheme = document.documentElement.getAttribute('data-theme');
      if (docTheme === 'dark' || docTheme === 'light') return docTheme;
      const saved = localStorage.getItem('vc-suite-theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  // Mensaje flotante de confirmación rápida (toast dentro de la paleta)
  const [notification, setNotification] = useState<string | null>(null);
  const notificationTimerRef = useRef<number | null>(null);

  // Drawer de Chatter 360° integrado
  const [chatterCustomer, setChatterCustomer] = useState<{
    id: string;
    name: string;
    phone?: string;
    documentReference?: string;
  } | null>(null);

  // Copia exitosa
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Referencias para focus y scroll
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Función para mostrar feedback temporal
  const showFeedback = useCallback((msg: string) => {
    if (notificationTimerRef.current !== null) {
      window.clearTimeout(notificationTimerRef.current);
    }
    setNotification(msg);
    notificationTimerRef.current = window.setTimeout(() => {
      setNotification(null);
      notificationTimerRef.current = null;
    }, 2800);
  }, []);

  // Cierre seguro
  const handleClose = useCallback(() => {
    if (isControlled) {
      externalOnClose?.();
    } else {
      setInternalOpen(false);
    }
  }, [isControlled, externalOnClose]);

  // Manejo de atajo global Ctrl+K / Cmd+K
  useEffect(() => {
    const onGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (isControlled) {
          if (open) {
            externalOnClose?.();
          } else {
            // Si el padre controla isOpen pero no provee toggle, invocamos onClose como señal
            externalOnClose?.();
          }
        } else {
          setInternalOpen((curr) => !curr);
        }
      }
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [isControlled, open, externalOnClose]);

  // Al abrir la paleta: resetear query, índice y dar autofocus
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedCategory('todos');
      setActiveIndex(0);
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 40);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  // Sincronizar cambios de tema desde el documento
  useEffect(() => {
    const handleThemeEvent = (e: Event) => {
      const customDetail = (e as CustomEvent).detail;
      if (customDetail === 'dark' || customDetail === 'light') {
        setTheme(customDetail);
      } else {
        const docTheme = document.documentElement.getAttribute('data-theme');
        if (docTheme === 'dark' || docTheme === 'light') setTheme(docTheme);
      }
    };
    window.addEventListener('theme_change', handleThemeEvent);
    return () => window.removeEventListener('theme_change', handleThemeEvent);
  }, []);

  // Sincronizar cambios de sucursal
  useEffect(() => {
    const handleBranchEvent = (e: Event) => {
      const customDetail = (e as CustomEvent).detail;
      if (customDetail === 'Visual Corp' || customDetail === 'Gigaprint') {
        setBranch(customDetail);
      }
    };
    window.addEventListener('visualcorp_branch_changed', handleBranchEvent);
    return () => window.removeEventListener('visualcorp_branch_changed', handleBranchEvent);
  }, []);

  /* --------------------------------------------------------------------------
     Acciones Rápidas del Sistema
     -------------------------------------------------------------------------- */

  const switchBranch = useCallback(() => {
    const nextBranch = branch === 'Visual Corp' ? 'Gigaprint' : 'Visual Corp';
    setBranch(nextBranch);
    try {
      localStorage.setItem('visualcorp_current_branch', nextBranch);
      window.dispatchEvent(new CustomEvent('visualcorp_branch_changed', { detail: nextBranch }));
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'visualcorp_current_branch',
          newValue: nextBranch,
        })
      );
    } catch {
      // Ignorar restricciones en navegación privada
    }
    showFeedback(`Sucursal activa: ${nextBranch}`);
  }, [branch, showFeedback]);

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    try {
      document.documentElement.setAttribute('data-theme', nextTheme);
      document.body.setAttribute('data-theme', nextTheme);
      localStorage.setItem('vc-suite-theme', nextTheme);
      window.dispatchEvent(new CustomEvent('theme_change', { detail: nextTheme }));
    } catch {
      // Ignorar
    }
    showFeedback(`Modo ${nextTheme === 'dark' ? 'Oscuro' : 'Claro'} activado`);
  }, [theme, showFeedback]);

  const copyToClipboard = useCallback((text: string, id: string, msg = 'Copiado al portapapeles') => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
      showFeedback(msg);
    }
  }, [showFeedback]);

  /* --------------------------------------------------------------------------
     Construcción del Índice de Comandos y Datos
     -------------------------------------------------------------------------- */

  // 1. Clientes reales o de demostración
  const customersList = useMemo(() => {
    let rawList: any[] = [];
    try {
      const saved = localStorage.getItem('visualcorp_customers');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) rawList = parsed;
      }
    } catch {}

    if (rawList.length === 0 && workspace?.data?.customers?.length) {
      rawList = workspace.data.customers;
    }

    if (rawList.length === 0) {
      return DEMO_CUSTOMERS;
    }

    return rawList.map((c: any) => ({
      id: c.id || `cust-${c.documentReference || c.phone || Math.random()}`,
      name: c.name || c.full_name || 'Cliente sin nombre',
      documentReference: c.documentReference || c.document_reference || c.ruc || c.cedula || '',
      phone: c.phone || '',
      email: c.email || '',
      notes: c.notes || '',
      isReference: Boolean(c.isReference),
    }));
  }, [workspace?.data?.customers]);

  // 2. Cotizaciones recientes o de demostración
  const quotesList = useMemo(() => {
    let rawList: any[] = [];
    try {
      const saved = localStorage.getItem('visualcorp_operations_quotes_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) rawList = parsed;
      }
    } catch {}

    if (rawList.length === 0 && workspace?.data?.quotes?.length) {
      rawList = workspace.data.quotes;
    }

    if (rawList.length === 0) {
      return DEMO_QUOTES;
    }

    return rawList.map((q: any) => ({
      id: q.id || q.code || `quote-${Math.random()}`,
      code: q.code || q.quoteCode || `COT-${q.id?.slice(0, 6) || '2026'}`,
      customer: q.customer || q.customerName || q.client || 'Cliente General',
      total: Number(q.total) || 0,
      status: q.status || 'Borrador',
      date: q.date || q.createdAt || '2026-11-07',
      isReference: Boolean(q.isReference),
    }));
  }, [workspace?.data?.quotes]);

  // 3. Rollos e Insumos de Inventario
  const inventoryList = useMemo(() => {
    let rawList: any[] = [];
    try {
      const saved = localStorage.getItem('visualcorp_inventory_items');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) rawList = parsed;
      }
    } catch {}

    if (rawList.length === 0 && workspace?.data?.inventory?.length) {
      rawList = workspace.data.inventory;
    }

    if (rawList.length === 0) {
      return DEMO_INVENTORY;
    }

    return rawList.map((i: any) => ({
      id: i.id || i.sku || `inv-${Math.random()}`,
      sku: i.sku || i.variantSku || 'VC-INV-000',
      name: i.name || 'Insumo sin nombre',
      category: i.category || 'General',
      unit: i.unit || 'unidad',
      quantity: Number(i.availableQuantity ?? i.quantity) || 0,
      branch: i.branch || 'Visual Corp',
      area: i.area || 'Taller',
      isReference: Boolean(i.starterCatalog || i.isReference),
    }));
  }, [workspace?.data?.inventory]);

  // Todos los elementos indexados
  const allItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];

    /* --- MÓDULOS Y PÁGINAS --- */
    items.push(
      {
        id: 'mod-cotizador',
        category: 'modulos',
        title: 'Cotizador POS & Gran Formato',
        subtitle: 'Calculadora de lonas, viniles, rótulos, letras 3D y servicios',
        keywords: ['cotizar', 'lona', 'vinil', 'acrilico', 'metro', 'calculadora', 'precio'],
        icon: FileText,
        badge: 'Cotizador',
        shortcut: '/cotizador',
        onSelect: () => {
          navigate('/operaciones/cotizador');
          handleClose();
        },
        extraInfo: { path: '/operaciones/cotizador' },
      },
      {
        id: 'mod-pos',
        category: 'modulos',
        title: 'Punto de Venta (POS Mostrador)',
        subtitle: 'Cobros rápidos, facturas SRI, arqueo de caja y terminal',
        keywords: ['caja', 'cobro', 'ticket', 'efectivo', 'mostrador', 'factura'],
        icon: ShoppingCart,
        badge: 'POS',
        shortcut: '/pos',
        onSelect: () => {
          navigate('/pos');
          handleClose();
        },
        extraInfo: { path: '/pos' },
      },
      {
        id: 'mod-inventario',
        category: 'modulos',
        title: 'Inventario en Vivo & Rollos',
        subtitle: 'Bobinas de lona, vinil, tintas CMYK, planchas de acrílico y mermas',
        keywords: ['stock', 'rollo', 'tinta', 'cmyk', 'mimaki', 'plotter', 'metros', 'bodega'],
        icon: Layers,
        badge: 'Inventario',
        shortcut: '/inventario',
        onSelect: () => {
          navigate('/operaciones/inventario');
          handleClose();
        },
        extraInfo: { path: '/operaciones/inventario' },
      },
      {
        id: 'mod-flujos',
        category: 'modulos',
        title: 'Coordinación de Trabajos y Taller',
        subtitle: 'Tablero de producción, etapas de impresión, corte láser y acabados',
        keywords: ['kanban', 'produccion', 'ordenes', 'taller', 'maquinas', 'tiempos'],
        icon: Sparkles,
        badge: 'Taller',
        shortcut: '/flujos',
        onSelect: () => {
          navigate('/operaciones/flujos');
          handleClose();
        },
        extraInfo: { path: '/operaciones/flujos' },
      },
      {
        id: 'mod-automatizaciones',
        category: 'modulos',
        title: 'Motor Autopilot & Reglas',
        subtitle: 'Disparadores inteligentes, notificaciones automáticas y alertas',
        keywords: ['autopilot', 'reglas', 'notificaciones', 'bot', 'cron'],
        icon: Zap,
        badge: 'Autopilot',
        shortcut: '/automatizaciones',
        onSelect: () => {
          navigate('/operaciones/automatizaciones');
          handleClose();
        },
        extraInfo: { path: '/operaciones/automatizaciones' },
      },
      {
        id: 'mod-archivos',
        category: 'modulos',
        title: 'Visual Corp Vault DAM',
        subtitle: 'Biblioteca centralizada de artes, logotipos vectoriales y fotos HD',
        keywords: ['dam', 'vault', 'artes', 'vectores', 'pdf', 'archivos', 'logos'],
        icon: FolderOpen,
        badge: 'DAM',
        shortcut: '/archivos',
        onSelect: () => {
          navigate('/operaciones/archivos');
          handleClose();
        },
        extraInfo: { path: '/operaciones/archivos' },
      },
      {
        id: 'mod-finanzas',
        category: 'modulos',
        title: 'Finanzas y Cajas',
        subtitle: 'Control de ventas confirmadas, abonos, cuentas por cobrar y bancos',
        keywords: ['dinero', 'bancos', 'cajas', 'cobranza', 'utilidad', 'arqueo'],
        icon: ShieldCheck,
        badge: 'Finanzas',
        shortcut: '/finanzas',
        onSelect: () => {
          navigate('/operaciones/finanzas');
          handleClose();
        },
        extraInfo: { path: '/operaciones/finanzas' },
      },
      {
        id: 'mod-clientes',
        category: 'modulos',
        title: 'Directorio de Clientes 360°',
        subtitle: 'Cartera de clientes, historial de pedidos, RUC y WhatsApp',
        keywords: ['crm', 'contactos', 'empresas', 'ruc', 'directorio', 'telefono'],
        icon: User,
        badge: 'CRM',
        shortcut: '/clientes',
        onSelect: () => {
          navigate('/operaciones/clientes');
          handleClose();
        },
        extraInfo: { path: '/operaciones/clientes' },
      },
      {
        id: 'mod-equipos',
        category: 'modulos',
        title: 'Maquinaria, Plotters & Láser',
        subtitle: 'Ficha técnica de plotters Mimaki, cortadora láser CO2 y laminadora',
        keywords: ['plotter', 'mimaki', 'laser', 'mantenimiento', 'cabezales', 'maquinaria'],
        icon: Printer,
        badge: 'Equipos',
        shortcut: '/equipos',
        onSelect: () => {
          navigate('/operaciones/equipos');
          handleClose();
        },
        extraInfo: { path: '/operaciones/equipos' },
      },
      {
        id: 'mod-tienda',
        category: 'modulos',
        title: 'Catálogo y Tienda Pública',
        subtitle: 'Vista del catálogo abierto para clientes finales y cotizaciones web',
        keywords: ['tienda', 'store', 'publico', 'catalogo', 'productos'],
        icon: ExternalLink,
        badge: 'Web',
        shortcut: '/tienda',
        onSelect: () => {
          navigate('/tienda');
          handleClose();
        },
        extraInfo: { path: '/tienda' },
      },
      {
        id: 'mod-seguimiento',
        category: 'modulos',
        title: 'Portal del Cliente & Tracking',
        subtitle: 'Seguimiento público en línea de órdenes de trabajo por código',
        keywords: ['tracking', 'portal', 'seguimiento', 'cliente', 'estado'],
        icon: Clock,
        badge: 'Portal',
        shortcut: '/seguimiento',
        onSelect: () => {
          navigate('/seguimiento');
          handleClose();
        },
        extraInfo: { path: '/seguimiento' },
      }
    );

    /* --- ACCIONES RÁPIDAS --- */
    items.push(
      {
        id: 'act-nueva-cotizacion',
        category: 'acciones',
        title: 'Nueva Cotización',
        subtitle: 'Iniciar cálculo de trabajo comercial en el cotizador',
        keywords: ['crear', 'nueva', 'cotizacion', 'presupuesto'],
        icon: Plus,
        badge: 'Acción',
        shortcut: 'COT',
        onSelect: () => {
          navigate('/operaciones/cotizador');
          handleClose();
        },
      },
      {
        id: 'act-nueva-venta',
        category: 'acciones',
        title: 'Nueva Venta POS',
        subtitle: 'Abrir mostrador para cobrar venta rápida o servicio express',
        keywords: ['vender', 'pos', 'cobrar', 'facturar'],
        icon: ShoppingCart,
        badge: 'Acción',
        shortcut: 'POS',
        onSelect: () => {
          navigate('/pos');
          handleClose();
        },
      },
      {
        id: 'act-cambiar-sucursal',
        category: 'acciones',
        title: `Cambiar Sucursal (${branch === 'Visual Corp' ? 'Visual Corp ➔ Gigaprint' : 'Gigaprint ➔ Visual Corp'})`,
        subtitle: `Conmuta entre la matriz Visual Corp y sucursal hermana Gigaprint`,
        keywords: ['sucursal', 'sede', 'tienda', 'gigaprint', 'visual corp', 'matriz'],
        icon: Building2,
        badge: branch,
        shortcut: 'SUC',
        onSelect: () => {
          switchBranch();
        },
      },
      {
        id: 'act-alternar-tema',
        category: 'acciones',
        title: `Alternar Modo Claro / Oscuro (Actual: ${theme === 'dark' ? 'Oscuro' : 'Claro'})`,
        subtitle: 'Cambia la apariencia de la suite entre alto contraste claro y oscuro',
        keywords: ['tema', 'dark', 'light', 'oscuro', 'claro', 'noche', 'contraste'],
        icon: theme === 'dark' ? Sun : Moon,
        badge: theme === 'dark' ? 'Modo Oscuro' : 'Modo Claro',
        shortcut: 'TEMA',
        onSelect: () => {
          toggleTheme();
        },
      },
      {
        id: 'act-abrir-vault',
        category: 'acciones',
        title: 'Abrir Vault DAM',
        subtitle: 'Acceso directo al gestor de activos digitales y artes de marca',
        keywords: ['vault', 'dam', 'artes', 'logos', 'diseno'],
        icon: FolderOpen,
        badge: 'DAM',
        shortcut: 'DAM',
        onSelect: () => {
          navigate('/operaciones/archivos');
          handleClose();
        },
      },
      {
        id: 'act-ajustar-tintas',
        category: 'acciones',
        title: 'Ajustar Tintas CMYK en Plotter',
        subtitle: 'Monitoreo de niveles Cyan, Magenta, Yellow y Black en taller',
        keywords: ['tintas', 'cmyk', 'mimaki', 'plotter', 'niveles', 'impresion'],
        icon: Sparkles,
        badge: 'Plotter',
        shortcut: 'CMYK',
        onSelect: () => {
          navigate('/operaciones/inventario');
          handleClose();
        },
      },
      {
        id: 'act-whatsapp-soporte',
        category: 'acciones',
        title: 'Llamar / Escribir a Soporte Visual Corp Milagro',
        subtitle: 'Canal oficial WhatsApp: 0967872396 (Atención rápida)',
        keywords: ['whatsapp', 'soporte', 'contacto', 'milagro', 'ayuda'],
        icon: Send,
        badge: 'WhatsApp',
        onSelect: () => {
          window.open('https://wa.me/593967872396?text=Hola%20Visual%20Corp%2C%20requiero%20asistencia.', '_blank');
          handleClose();
        },
      }
    );

    /* --- CLIENTES EN VIVO --- */
    customersList.forEach((c) => {
      items.push({
        id: `cli-${c.id}`,
        category: 'clientes',
        title: c.name,
        subtitle: [c.documentReference ? `RUC/CI: ${c.documentReference}` : '', c.phone ? `Telf: ${c.phone}` : '', c.notes]
          .filter(Boolean)
          .join(' · '),
        keywords: [c.name, c.documentReference, c.phone, c.email].filter(Boolean),
        icon: User,
        badge: c.isReference ? 'Demo operativa' : 'Cliente',
        isReference: c.isReference,
        onSelect: () => {
          setChatterCustomer(c);
        },
        extraInfo: {
          ruc: c.documentReference,
          phone: c.phone,
          email: c.email,
          customerData: c,
        },
      });
    });

    /* --- COTIZACIONES RECIENTES --- */
    quotesList.forEach((q) => {
      const formatted = formatMoney(q.total);
      items.push({
        id: `cot-${q.id}`,
        category: 'cotizaciones',
        title: `${q.code} — ${q.customer}`,
        subtitle: `Total: ${formatted} · Estado: ${q.status} · Fecha: ${q.date}`,
        keywords: [q.code, q.customer, q.status, String(q.total)],
        icon: FileText,
        badge: q.status,
        isReference: q.isReference,
        shortcut: formatted,
        onSelect: () => {
          navigate('/operaciones/cotizador');
          handleClose();
        },
        extraInfo: {
          formattedTotal: formatted,
          total: q.total,
          status: q.status,
        },
      });
    });

    /* --- ROLLOS E INSUMOS --- */
    inventoryList.forEach((item) => {
      items.push({
        id: `inv-${item.id}`,
        category: 'inventario',
        title: item.name,
        subtitle: `SKU: ${item.sku} · Stock: ${item.quantity} ${item.unit} · Sucursal: ${item.branch} · Área: ${item.area}`,
        keywords: [item.name, item.sku, item.category, item.area, item.branch],
        icon: Layers,
        badge: `${item.quantity} ${item.unit}`,
        isReference: item.isReference,
        shortcut: item.sku,
        onSelect: () => {
          navigate('/operaciones/inventario');
          handleClose();
        },
        extraInfo: {
          sku: item.sku,
          stock: item.quantity,
          unit: item.unit,
          branch: item.branch,
          area: item.area,
        },
      });
    });

    return items;
  }, [
    navigate,
    handleClose,
    branch,
    switchBranch,
    theme,
    toggleTheme,
    customersList,
    quotesList,
    inventoryList,
  ]);

  /* --------------------------------------------------------------------------
     Filtrado en Tiempo Real (categoría + texto de búsqueda)
     -------------------------------------------------------------------------- */
  const filteredItems = useMemo(() => {
    let result = allItems;

    // Filtro por pestaña seleccionada
    if (selectedCategory !== 'todos') {
      result = result.filter((item) => item.category === selectedCategory);
    }

    // Filtro por término ingresado
    const term = query.trim().toLocaleLowerCase('es');
    if (!term) return result;

    const tokens = term.split(/\s+/).filter(Boolean);

    return result.filter((item) => {
      const searchTarget = [
        item.title,
        item.subtitle || '',
        item.badge || '',
        item.shortcut || '',
        ...(item.keywords || []),
      ]
        .join(' ')
        .toLocaleLowerCase('es');

      return tokens.every((token) => searchTarget.includes(token));
    });
  }, [allItems, selectedCategory, query]);

  // Asegurar que activeIndex siempre esté dentro de los límites
  useEffect(() => {
    setActiveIndex(0);
  }, [selectedCategory, query]);

  // Mantener el elemento seleccionado visible al desplazarse con flechas
  useEffect(() => {
    if (activeIndex >= 0 && itemRefs.current.has(activeIndex)) {
      const el = itemRefs.current.get(activeIndex);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  /* --------------------------------------------------------------------------
     Manejo de Teclado Dentro del Diálogo
     -------------------------------------------------------------------------- */
  const categoriesList: CommandCategory[] = [
    'todos',
    'modulos',
    'acciones',
    'clientes',
    'cotizaciones',
    'inventario',
  ];

  const handleInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (filteredItems.length === 0 ? 0 : (prev + 1) % filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        filteredItems.length === 0 ? 0 : (prev - 1 + filteredItems.length) % filteredItems.length
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = filteredItems[activeIndex];
      if (current) {
        current.onSelect();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      const currentIndex = categoriesList.indexOf(selectedCategory);
      const nextIndex = (currentIndex + dir + categoriesList.length) % categoriesList.length;
      setSelectedCategory(categoriesList[nextIndex]);
      setActiveIndex(0);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  };

  /* --------------------------------------------------------------------------
     Helpers de Categorías y Conteos
     -------------------------------------------------------------------------- */
  const categoryCounts = useMemo(() => {
    const counts: Record<CommandCategory, number> = {
      todos: allItems.length,
      modulos: allItems.filter((i) => i.category === 'modulos').length,
      acciones: allItems.filter((i) => i.category === 'acciones').length,
      clientes: allItems.filter((i) => i.category === 'clientes').length,
      cotizaciones: allItems.filter((i) => i.category === 'cotizaciones').length,
      inventario: allItems.filter((i) => i.category === 'inventario').length,
    };
    return counts;
  }, [allItems]);

  const categoryLabels: Record<CommandCategory, string> = {
    todos: 'Todos',
    modulos: 'Módulos',
    acciones: 'Acciones',
    clientes: 'Clientes',
    cotizaciones: 'Cotizaciones',
    inventario: 'Inventario',
  };

  // Agrupamiento por categoría en la vista 'todos'
  const groupedSections = useMemo(() => {
    if (selectedCategory !== 'todos') {
      return [{ category: selectedCategory, label: categoryLabels[selectedCategory], items: filteredItems }];
    }

    const groups: Array<{ category: CommandCategory; label: string; items: CommandItem[] }> = [];
    const order: CommandCategory[] = ['acciones', 'modulos', 'clientes', 'cotizaciones', 'inventario'];

    order.forEach((cat) => {
      const catItems = filteredItems.filter((item) => item.category === cat);
      if (catItems.length > 0) {
        groups.push({ category: cat, label: categoryLabels[cat], items: catItems });
      }
    });

    return groups;
  }, [selectedCategory, filteredItems, categoryLabels]);

  /* --------------------------------------------------------------------------
     Render Principal
     -------------------------------------------------------------------------- */
  return (
    <>
      {/* Botón disparador inline opcional */}
      {triggerButton && (
        <button
          type="button"
          className={`vc-palette-trigger ${triggerClassName}`}
          onClick={() => (isControlled ? externalOnClose?.() : setInternalOpen(true))}
          aria-label="Buscar en Visual Corp Suite"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <Search size={15} className="vc-palette-trigger-search-icon" />
          <span className="vc-palette-trigger-text">Buscar comandos, clientes o stock…</span>
          <kbd className="vc-palette-trigger-kbd">⌘K / Ctrl+K</kbd>
        </button>
      )}

      {/* Diálogo Modal con createPortal */}
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={`vc-palette-overlay theme-${theme}`}
            data-theme={theme}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) handleClose();
            }}
            role="presentation"
          >
            <div
              className="vc-palette-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Paleta global de comandos de Visual Corp Suite"
            >
              {/* Barra Superior con Search Input y Estado */}
              <header className="vc-palette-header">
                <div className="vc-palette-input-wrap">
                  <Search size={20} className="vc-palette-search-icon" aria-hidden="true" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActiveIndex(0);
                    }}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Escribe para buscar módulos, acciones, clientes o rollos…"
                    className="vc-palette-input"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="vc-palette-results-list"
                    aria-activedescendant={
                      filteredItems[activeIndex] ? `vc-option-${filteredItems[activeIndex].id}` : undefined
                    }
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                  />
                  {query && (
                    <button
                      type="button"
                      className="vc-palette-clear-btn"
                      onClick={() => {
                        setQuery('');
                        inputRef.current?.focus();
                      }}
                      aria-label="Limpiar búsqueda"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                {/* Badges de Sucursal Activa y Modo de Tema */}
                <div className="vc-palette-header-meta">
                  <button
                    type="button"
                    className="vc-palette-branch-badge"
                    onClick={switchBranch}
                    title="Clic para cambiar de sucursal (Visual Corp ↔ Gigaprint)"
                  >
                    <Building2 size={13} />
                    <span>{branch}</span>
                  </button>

                  <button
                    type="button"
                    className="vc-palette-theme-badge"
                    onClick={toggleTheme}
                    title="Clic para alternar tema claro / oscuro"
                  >
                    {theme === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
                    <span>{theme === 'dark' ? 'Oscuro' : 'Claro'}</span>
                  </button>

                  <button
                    type="button"
                    className="vc-palette-close-btn"
                    onClick={handleClose}
                    aria-label="Cerrar paleta de comandos"
                  >
                    <X size={17} />
                  </button>
                </div>
              </header>

              {/* Notificación flotante / Toast en la paleta */}
              {notification && (
                <div className="vc-palette-toast" role="status" aria-live="polite">
                  <Activity size={14} className="vc-palette-toast-icon" />
                  <span>{notification}</span>
                </div>
              )}

              {/* Píldoras de Filtrado Rápido */}
              <div className="vc-palette-tabs-bar" role="tablist" aria-label="Filtrar por categoría">
                {categoriesList.map((cat) => {
                  const isSelected = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      className={`vc-palette-tab ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedCategory(cat);
                        setActiveIndex(0);
                        inputRef.current?.focus();
                      }}
                    >
                      <span>{categoryLabels[cat]}</span>
                      <span className="vc-palette-tab-count">{categoryCounts[cat]}</span>
                    </button>
                  );
                })}
              </div>

              {/* Lista de Resultados */}
              <div
                ref={resultsContainerRef}
                id="vc-palette-results-list"
                className="vc-palette-results"
                role="listbox"
                aria-label="Resultados de búsqueda"
              >
                {filteredItems.length === 0 ? (
                  <div className="vc-palette-empty">
                    <Search size={32} className="vc-palette-empty-icon" />
                    <h4>Sin coincidencias para “{query}”</h4>
                    <p>
                      No se encontraron elementos en la categoría actual. Prueba buscando por término
                      general como <i>lona</i>, <i>vinil</i>, <i>cotización</i> o <i>cliente</i>.
                    </p>
                    <button
                      type="button"
                      className="vc-palette-empty-reset"
                      onClick={() => {
                        setQuery('');
                        setSelectedCategory('todos');
                        inputRef.current?.focus();
                      }}
                    >
                      Restablecer filtros
                    </button>
                  </div>
                ) : (
                  groupedSections.map((section) => (
                    <div key={section.category} className="vc-palette-section">
                      <div className="vc-palette-section-title">
                        <span>{section.label}</span>
                        <span className="vc-palette-section-count">{section.items.length}</span>
                      </div>

                      <div className="vc-palette-section-items">
                        {section.items.map((item) => {
                          const overallIndex = filteredItems.indexOf(item);
                          const isActive = overallIndex === activeIndex;
                          const IconComp = item.icon;

                          return (
                            <button
                              key={item.id}
                              id={`vc-option-${item.id}`}
                              ref={(el) => {
                                if (el) itemRefs.current.set(overallIndex, el);
                                else itemRefs.current.delete(overallIndex);
                              }}
                              type="button"
                              role="option"
                              aria-selected={isActive}
                              className={`vc-palette-item ${isActive ? 'active' : ''}`}
                              onMouseEnter={() => setActiveIndex(overallIndex)}
                              onClick={() => item.onSelect()}
                            >
                              <div className={`vc-palette-item-icon vc-palette-icon-${item.category}`}>
                                <IconComp size={17} />
                              </div>

                              <div className="vc-palette-item-content">
                                <div className="vc-palette-item-header">
                                  <span className="vc-palette-item-title">{item.title}</span>
                                  {item.badge && (
                                    <span
                                      className={`vc-palette-item-badge ${
                                        item.isReference ? 'is-reference' : ''
                                      }`}
                                    >
                                      {item.isReference ? 'Demo operativa' : item.badge}
                                    </span>
                                  )}
                                </div>

                                {item.subtitle && (
                                  <span className="vc-palette-item-subtitle">{item.subtitle}</span>
                                )}
                              </div>

                              {/* Acciones Secundarias Rápidas para Clientes */}
                              {item.category === 'clientes' && item.extraInfo?.customerData && (
                                <div
                                  className="vc-palette-item-actions"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {item.extraInfo.phone && (
                                    <a
                                      href={`https://wa.me/593${item.extraInfo.phone.replace(
                                        /\D/g,
                                        ''
                                      )}?text=Hola%20${encodeURIComponent(
                                        item.extraInfo.customerData.name
                                      )}%2C%20le%20escribimos%20de%20Visual%20Corp%20Milagro.`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="vc-palette-action-btn whatsapp"
                                      title="Abrir chat de WhatsApp"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleClose();
                                      }}
                                    >
                                      <Send size={13} />
                                    </a>
                                  )}

                                  <button
                                    type="button"
                                    className="vc-palette-action-btn chatter"
                                    title="Abrir Chatter 360°"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setChatterCustomer(item.extraInfo?.customerData);
                                    }}
                                  >
                                    <MessageSquare size={13} />
                                  </button>

                                  {item.extraInfo.ruc && (
                                    <button
                                      type="button"
                                      className="vc-palette-action-btn copy"
                                      title="Copiar RUC / Cédula"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(
                                          item.extraInfo?.ruc || '',
                                          item.id,
                                          `RUC copiado: ${item.extraInfo?.ruc}`
                                        );
                                      }}
                                    >
                                      {copiedId === item.id ? (
                                        <Check size={13} className="success" />
                                      ) : (
                                        <Copy size={13} />
                                      )}
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Tecla de confirmación al estar resaltado */}
                              {isActive && (
                                <div className="vc-palette-item-enter">
                                  <span>Ejecutar</span>
                                  <CornerDownLeft size={13} />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Pie de Página con Atajos de Teclado y Firma */}
              <footer className="vc-palette-footer">
                <div className="vc-palette-shortcuts">
                  <span className="vc-palette-shortcut">
                    <kbd>↑</kbd>
                    <kbd>↓</kbd>
                    <span>Navegar</span>
                  </span>
                  <span className="vc-palette-shortcut">
                    <kbd>↵</kbd>
                    <span>Seleccionar</span>
                  </span>
                  <span className="vc-palette-shortcut">
                    <kbd>Tab</kbd>
                    <span>Categoría</span>
                  </span>
                  <span className="vc-palette-shortcut">
                    <kbd>Esc</kbd>
                    <span>Salir</span>
                  </span>
                </div>

                <div className="vc-palette-brand-tag">
                  <span className="vc-palette-brand-dot" />
                  <span>Visual Corp Suite · Milagro, EC</span>
                </div>
              </footer>
            </div>
          </div>,
          document.body
        )}

      {/* Drawer de Chatter 360° si se selecciona un cliente */}
      {chatterCustomer && (
        <ChatterDrawer360
          open={Boolean(chatterCustomer)}
          onClose={() => setChatterCustomer(null)}
          recordType="customer"
          recordId={chatterCustomer.id}
          recordTitle={chatterCustomer.name}
          recordSubtitle={chatterCustomer.documentReference || chatterCustomer.phone || 'Cliente Visual Corp'}
          recordPhone={chatterCustomer.phone}
        />
      )}
    </>
  );
}

export default GlobalCommandPalette;
