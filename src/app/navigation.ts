import {
  BookOpen, Boxes, BriefcaseBusiness, ChartNoAxesCombined,
  CalendarClock, CalendarDays, ClipboardList, Database, FileText, FolderOpen, Globe2, History, Image, Inbox, LayoutDashboard, Megaphone,
  Newspaper, Palette, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, Target, Truck, Users, Wallet, Radio, Workflow, MapPin, Box, Type, Wrench, type LucideIcon,
} from 'lucide-react';

export type AppNavLink = {
  to: string;
  label: string;
  icon: LucideIcon;
  module: string;
  end?: boolean;
  anyOf?: string[];
  /** Legacy or equivalent entry paths that share the same protected page. */
  aliases?: string[];
};

export type AppNavGroup = { id: string; label: string; icon: LucideIcon; paths: string[] };

export const navigationStyleOptions = [
  {
    id: 'categories',
    label: 'Por categorías',
    description: 'Secciones agrupadas en una barra lateral desplegable.',
  },
  {
    id: 'rail',
    label: 'Rail compacto',
    description: 'Acceso con iconos y paneles emergentes por categoría.',
  },
  {
    id: 'grid',
    label: 'Cuadrícula',
    description: 'Accesos en tarjetas para recorrer varias secciones.',
  },
  {
    id: 'dropdown',
    label: 'Lista desplegable',
    description: 'Busca y abre una sección desde una lista compacta.',
  },
  {
    id: 'adaptive',
    label: 'Adaptable',
    description: 'Barra lateral, rail en tableta y cajón en móvil.',
  },
] as const;

export type NavigationStyle = (typeof navigationStyleOptions)[number]['id'];

export const DEFAULT_NAVIGATION_STYLE: NavigationStyle = 'categories';
export type NavigationDensity = 'comfortable' | 'compact';
export type NavigationWidth = 'narrow' | 'standard' | 'wide';
export type NavigationPreferences = {
  style: NavigationStyle;
  density: NavigationDensity;
  width: NavigationWidth;
};

export const DEFAULT_NAVIGATION_PREFERENCES: NavigationPreferences = {
  style: 'categories',
  density: 'comfortable',
  width: 'standard',
};

const NAVIGATION_STYLE_STORAGE_PREFIX = 'vc-suite-navigation-style:';
const NAVIGATION_DENSITY_STORAGE_PREFIX = 'vc-suite-navigation-density:';
const NAVIGATION_WIDTH_STORAGE_PREFIX = 'vc-suite-navigation-width:';

export function isNavigationStyle(value: unknown): value is NavigationStyle {
  return typeof value === 'string'
    && navigationStyleOptions.some((option) => option.id === value);
}

export function readNavigationStylePreference(userId?: string | null): NavigationStyle {
  if (!userId || typeof window === 'undefined') return DEFAULT_NAVIGATION_STYLE;
  try {
    const stored = window.localStorage.getItem(NAVIGATION_STYLE_STORAGE_PREFIX + userId);
    return isNavigationStyle(stored) ? stored : DEFAULT_NAVIGATION_STYLE;
  } catch {
    return DEFAULT_NAVIGATION_STYLE;
  }
}

export function saveNavigationStylePreference(userId: string | null | undefined, style: NavigationStyle) {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NAVIGATION_STYLE_STORAGE_PREFIX + userId, style);
  } catch {
    // Keep the preference for this session if browser storage is unavailable.
  }
}

export function readNavigationDensityPreference(userId?: string | null): NavigationDensity {
  if (!userId || typeof window === 'undefined') return DEFAULT_NAVIGATION_PREFERENCES.density;
  try {
    return window.localStorage.getItem(NAVIGATION_DENSITY_STORAGE_PREFIX + userId) === 'compact'
      ? 'compact'
      : DEFAULT_NAVIGATION_PREFERENCES.density;
  } catch {
    return DEFAULT_NAVIGATION_PREFERENCES.density;
  }
}

export function readNavigationWidthPreference(userId?: string | null): NavigationWidth {
  if (!userId || typeof window === 'undefined') return DEFAULT_NAVIGATION_PREFERENCES.width;
  try {
    const stored = window.localStorage.getItem(NAVIGATION_WIDTH_STORAGE_PREFIX + userId);
    return stored === 'narrow' || stored === 'wide' ? stored : DEFAULT_NAVIGATION_PREFERENCES.width;
  } catch {
    return DEFAULT_NAVIGATION_PREFERENCES.width;
  }
}

export function readNavigationPreferences(userId?: string | null): NavigationPreferences {
  return {
    style: readNavigationStylePreference(userId),
    density: readNavigationDensityPreference(userId),
    width: readNavigationWidthPreference(userId),
  };
}

export function saveNavigationPreferences(userId: string | null | undefined, preferences: NavigationPreferences) {
  if (!userId || typeof window === 'undefined') return;
  saveNavigationStylePreference(userId, preferences.style);
  try {
    window.localStorage.setItem(NAVIGATION_DENSITY_STORAGE_PREFIX + userId, preferences.density);
    window.localStorage.setItem(NAVIGATION_WIDTH_STORAGE_PREFIX + userId, preferences.width);
  } catch {
    // Keep the preferences in memory if browser storage is unavailable.
  }
}

/** One user-facing navigation index for every navigation style. */
export const workspaceNavigation: AppNavLink[] = [
  { to: '/panel', aliases: ['/admin/presentacion'], label: 'Inicio', icon: LayoutDashboard, module: 'dashboard', end: true },
  // A personal overview is a frequent shortcut, not a sales category.
  { to: '/operaciones/mi-semana', label: 'Mi semana', icon: ChartNoAxesCombined, module: 'sales' },
  { to: '/operaciones/pos', label: 'Punto de venta', icon: ShoppingCart, module: 'sales' },
  { to: '/operaciones/cotizador', label: 'Cotizador', icon: FileText, module: 'quotes' },
  { to: '/operaciones/crm', label: 'Solicitudes', icon: Inbox, module: 'crm' },
  { to: '/operaciones/clientes', label: 'Directorio de clientes', icon: Users, module: 'crm' },
  { to: '/operaciones/trabajos/asesoria', label: 'Trabajos de asesoría', icon: ClipboardList, module: 'sales', anyOf: ['sales', 'workshop'] },
  { to: '/seguimiento', label: 'Portal de aprobación', icon: ShieldCheck, module: 'workshop', anyOf: ['sales', 'workshop', 'quotes', 'crm'] },
  { to: '/operaciones/catalogo', label: 'Catálogo y tarifas', icon: ShoppingBag, module: 'catalog_admin' },
  { to: '/operaciones/servicios', label: 'Catálogo de servicios', icon: BriefcaseBusiness, module: 'catalog_admin' },
  { to: '/operaciones/finanzas', label: 'Finanzas', icon: ChartNoAxesCombined, module: 'finance' },
  { to: '/operaciones/finanzas/resumen-semanal', label: 'Resumen semanal', icon: CalendarDays, module: 'finance' },
  { to: '/operaciones/cajas-abiertas', label: 'Cajas abiertas', icon: Radio, module: 'sales', anyOf: ['sales', 'cash'] },
  { to: '/operaciones/rutas-productos', label: 'Rutas por producto', icon: Workflow, module: 'workshop', anyOf: ['sales', 'workshop'] },
  { to: '/operaciones/herramientas', label: 'Todas las herramientas', icon: Wrench, module: 'workshop' },
  { to: '/operaciones/herramientas/generador-cajas', label: 'Generador de cajas', icon: Box, module: 'workshop' },
  { to: '/operaciones/herramientas/monogramas', label: 'Editor de monogramas', icon: Type, module: 'workshop' },
  { to: '/operaciones/automatizaciones', label: 'Automatizaciones', icon: Sparkles, module: 'workshop', anyOf: ['sales', 'inventory', 'workshop', 'quotes', 'purchases'] },
  { to: '/operaciones/flujos', label: 'Flujos y producción', icon: ClipboardList, module: 'workshop', anyOf: ['sales', 'inventory', 'workshop', 'quotes', 'purchases'] },
  { to: '/operaciones/coordinacion-trabajos', aliases: ['/operaciones/trabajos'], label: 'Coordinación de trabajos', icon: ClipboardList, module: 'workshop', anyOf: ['sales', 'workshop'] },
  { to: '/operaciones/cartelera-taller', label: 'Cartelera y Mapa de Taller', icon: MapPin, module: 'workshop', anyOf: ['sales', 'workshop'] },
  { to: '/operaciones/kiosk', label: 'Terminal de taller (Kiosk)', icon: Radio, module: 'workshop', anyOf: ['sales', 'inventory', 'workshop'] },
  { to: '/operaciones/archivos', label: 'Archivos y artes (Vault)', icon: FolderOpen, module: 'workshop', anyOf: ['sales', 'workshop', 'quotes', 'crm'] },
  { to: '/operaciones/trabajos/diseno', label: 'Diseño', icon: ClipboardList, module: 'workshop' },
  { to: '/operaciones/trabajos/impresion', label: 'Impresión', icon: ClipboardList, module: 'workshop' },
  { to: '/operaciones/trabajos/sublimacion', label: 'Sublimación', icon: ClipboardList, module: 'workshop' },
  { to: '/operaciones/trabajos/laser', label: 'Corte láser', icon: ClipboardList, module: 'workshop' },
  { to: '/operaciones/trabajos/taller', label: 'Taller', icon: ClipboardList, module: 'workshop' },
  { to: '/operaciones/inventario', label: 'Inventario', icon: Boxes, module: 'inventory' },
  { to: '/operaciones/solicitudes-compras', label: 'Solicitudes de materiales', icon: ClipboardList, module: 'purchases', anyOf: ['purchases', 'workshop', 'sales'] },
  { to: '/operaciones/compras', label: 'Compras', icon: Truck, module: 'purchases' },
  { to: '/operaciones/equipos', label: 'Equipos', icon: BriefcaseBusiness, module: 'inventory' },
  { to: '/operaciones/equipo/biblioteca-ui', label: 'Biblioteca de interfaz', icon: Palette, module: 'team' },
  { to: '/operaciones/marketing', label: 'Bandeja y flujo', icon: Megaphone, module: 'marketing' },
  { to: '/operaciones/marketing/calendario', label: 'Calendario editorial', icon: CalendarDays, module: 'marketing' },
  { to: '/operaciones/marketing/campanas', label: 'Campañas y estrategia', icon: Target, module: 'marketing' },
  { to: '/operaciones/marketing/editor', label: 'Editor de diseño', icon: Palette, module: 'marketing' },
  { to: '/admin/sitio', label: 'Inicio del sitio', icon: Globe2, module: 'website' },
  { to: '/admin/servicios', label: 'Servicios', icon: BriefcaseBusiness, module: 'website' },
  { to: '/admin/tienda', label: 'Tienda web', icon: ShoppingBag, module: 'website' },
  { to: '/admin/contenido', label: 'Contenido del sitio', icon: FileText, module: 'website' },
  { to: '/admin/blog', label: 'Blog', icon: BookOpen, module: 'website' },
  { to: '/admin/publicaciones', label: 'Publicaciones', icon: Newspaper, module: 'website' },
  { to: '/admin/portafolio', label: 'Portafolio', icon: Image, module: 'website' },
  { to: '/admin/contacto', label: 'Contacto web', icon: Users, module: 'website' },
  { to: '/operaciones/personal', label: 'Personal', icon: Users, module: 'personnel' },
  { to: '/operaciones/equipo/horarios', label: 'Horarios y turnos', icon: CalendarClock, module: 'team_schedule' },
  { to: '/operaciones/manual-aprendizaje', label: 'Aprendizaje', icon: BookOpen, module: 'dashboard' },
  { to: '/admin/manual-aprendizaje', label: 'Manual de administración web', icon: BookOpen, module: 'website' },
  { to: '/operaciones/equipo', aliases: ['/operaciones/equipo/usuarios'], label: 'Usuarios, perfiles y permisos', icon: ShieldCheck, module: 'team' },
  { to: '/operaciones/cambios', label: 'Novedades', icon: History, module: 'team' },
  { to: '/admin/respaldo', label: 'Respaldo y migración', icon: Database, module: 'backup' },
];

export const workspaceNavGroups: AppNavGroup[] = [
  { id: 'commercial', label: 'Comercial', icon: BriefcaseBusiness, paths: ['/operaciones/pos', '/operaciones/cotizador', '/operaciones/crm', '/operaciones/clientes', '/operaciones/trabajos/asesoria', '/seguimiento', '/operaciones/catalogo', '/operaciones/servicios'] },
  { id: 'finance', label: 'Finanzas', icon: Wallet, paths: ['/operaciones/finanzas', '/operaciones/finanzas/resumen-semanal', '/operaciones/cajas-abiertas'] },
  { id: 'production-planning', label: 'Planificación y coordinación', icon: Workflow, paths: ['/operaciones/rutas-productos', '/operaciones/automatizaciones', '/operaciones/flujos', '/operaciones/coordinacion-trabajos', '/operaciones/cartelera-taller'] },
  { id: 'workshop-areas', label: 'Taller y áreas de trabajo', icon: ClipboardList, paths: ['/operaciones/kiosk', '/operaciones/archivos', '/operaciones/trabajos/diseno', '/operaciones/trabajos/impresion', '/operaciones/trabajos/sublimacion', '/operaciones/trabajos/laser', '/operaciones/trabajos/taller'] },
  { id: 'inventory-purchasing', label: 'Inventario y compras', icon: Boxes, paths: ['/operaciones/inventario', '/operaciones/solicitudes-compras', '/operaciones/compras', '/operaciones/equipos'] },
  { id: 'marketing', label: 'Marketing', icon: Megaphone, paths: ['/operaciones/marketing', '/operaciones/marketing/calendario', '/operaciones/marketing/campanas', '/operaciones/marketing/editor'] },
  { id: 'tools', label: 'Herramientas', icon: Wrench, paths: ['/operaciones/herramientas', '/operaciones/herramientas/generador-cajas', '/operaciones/herramientas/monogramas'] },
  { id: 'website', label: 'Sitio y contenido', icon: Globe2, paths: ['/admin/sitio', '/admin/servicios', '/admin/tienda', '/admin/contenido', '/admin/blog', '/admin/publicaciones', '/admin/portafolio', '/admin/contacto'] },
  { id: 'people', label: 'Personas', icon: Users, paths: ['/operaciones/personal', '/operaciones/equipo/horarios', '/operaciones/manual-aprendizaje'] },
  { id: 'administration', label: 'Administración', icon: ShieldCheck, paths: ['/admin/manual-aprendizaje', '/operaciones/equipo', '/operaciones/equipo/biblioteca-ui', '/operaciones/cambios', '/admin/respaldo'] },
];

/**
 * Route-to-module index shared by the route guard and sidebar.
 * Existing /admin and /operaciones roots are compatibility aliases to /panel.
 */
export const permissionByPath: Record<string, string> = Object.fromEntries(
  [
    ...workspaceNavigation.flatMap(({ to, aliases, module }) => [
      [to, module],
      ...(aliases || []).map((alias) => [alias, module]),
    ]),
    ['/operaciones/herramientas/', 'workshop'], ['/operaciones/herramientas/generador-cajas/', 'workshop'], ['/operaciones/herramientas/monogramas/', 'workshop'],
    ['/admin/solicitudes', 'crm'], ['/admin/marketing', 'marketing'],
    ['/admin/cambios', 'team'], ['/admin/catalogo', 'catalog_admin'],
    ['/admin', 'dashboard'], ['/operaciones', 'dashboard'],
  ],
);

export const legacyPanelPaths = new Set(['/admin', '/operaciones']);

export function canViewNavigationItem(
  item: AppNavLink,
  hasPermission: (module: string, action: string) => boolean,
) {
  if (item.to === '/panel') {
    return hasPermission('dashboard', 'view')
      || workspaceNavigation.some((link) => link.to !== '/panel' && canViewNavigationItem(link, hasPermission));
  }
  return item.anyOf
    ? item.anyOf.some((module) => hasPermission(module, 'view'))
    : hasPermission(item.module, 'view');
}
