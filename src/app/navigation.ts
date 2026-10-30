import {
  BookOpen, Boxes, BriefcaseBusiness, ChartNoAxesCombined,
  ClipboardList, Database, FileText, Globe2, History, Image, LayoutDashboard, Megaphone,
  Newspaper, ShoppingBag, ShoppingCart, Truck, Users, Wallet, Radio, type LucideIcon,
} from 'lucide-react';

export type AppNavLink = {
  to: string;
  label: string;
  icon: LucideIcon;
  module: string;
  end?: boolean;
  anyOf?: string[];
};

export type AppNavGroup = { id: string; label: string; icon: LucideIcon; paths: string[] };

/** One user-facing navigation index for both former panels. */
export const workspaceNavigation: AppNavLink[] = [
  { to: '/panel', label: 'Inicio', icon: LayoutDashboard, module: 'dashboard', end: true },
  { to: '/operaciones/pos', label: 'Punto de venta', icon: ShoppingCart, module: 'sales' },
  { to: '/operaciones/mi-semana', label: 'Mi semana', icon: ChartNoAxesCombined, module: 'sales' },
  { to: '/operaciones/trabajos/asesoria', label: 'Trabajos de asesoría', icon: ClipboardList, module: 'sales', anyOf: ['sales', 'workshop'] },
  { to: '/operaciones/finanzas', label: 'Finanzas', icon: ChartNoAxesCombined, module: 'finance' },
  { to: '/operaciones/cajas-abiertas', label: 'Cajas abiertas', icon: Radio, module: 'sales', anyOf: ['sales', 'cash'] },
  { to: '/operaciones/cotizador', label: 'Cotizador', icon: FileText, module: 'quotes' },
  { to: '/operaciones/crm', label: 'Solicitudes', icon: Users, module: 'crm' },
  { to: '/operaciones/clientes', label: 'Directorio de clientes', icon: Users, module: 'crm' },
  { to: '/operaciones/flujos', label: 'Flujos y producción', icon: ClipboardList, module: 'workshop', anyOf: ['sales', 'inventory', 'workshop', 'quotes', 'purchases'] },
  { to: '/operaciones/coordinacion-trabajos', label: 'Coordinación de trabajos', icon: ClipboardList, module: 'workshop', anyOf: ['sales', 'workshop'] },
  { to: '/operaciones/trabajos/diseno', label: 'Diseño', icon: ClipboardList, module: 'workshop' },
  { to: '/operaciones/trabajos/impresion', label: 'Impresión', icon: ClipboardList, module: 'workshop' },
  { to: '/operaciones/trabajos/sublimacion', label: 'Sublimación', icon: ClipboardList, module: 'workshop' },
  { to: '/operaciones/trabajos/laser', label: 'Corte láser', icon: ClipboardList, module: 'workshop' },
  { to: '/operaciones/trabajos/taller', label: 'Taller', icon: ClipboardList, module: 'workshop' },
  { to: '/operaciones/inventario', label: 'Inventario', icon: Boxes, module: 'inventory' },
  { to: '/operaciones/compras', label: 'Compras', icon: Truck, module: 'purchases' },
  { to: '/operaciones/equipos', label: 'Equipos', icon: BriefcaseBusiness, module: 'inventory' },
  { to: '/operaciones/catalogo', label: 'Catálogo y tarifas', icon: ShoppingBag, module: 'catalog_admin' },
  { to: '/operaciones/marketing', label: 'Marketing', icon: Megaphone, module: 'marketing' },
  { to: '/admin/sitio', label: 'Inicio del sitio', icon: Globe2, module: 'website' },
  { to: '/admin/servicios', label: 'Servicios', icon: BriefcaseBusiness, module: 'website' },
  { to: '/admin/tienda', label: 'Tienda web', icon: ShoppingBag, module: 'website' },
  { to: '/admin/blog', label: 'Blog', icon: BookOpen, module: 'website' },
  { to: '/admin/publicaciones', label: 'Publicaciones', icon: Newspaper, module: 'website' },
  { to: '/admin/portafolio', label: 'Portafolio', icon: Image, module: 'website' },
  { to: '/admin/contacto', label: 'Contacto web', icon: Users, module: 'website' },
  { to: '/operaciones/personal', label: 'Personal', icon: Users, module: 'personnel' },
  { to: '/operaciones/equipo', label: 'Usuarios, perfiles y permisos', icon: Users, module: 'team' },
  { to: '/operaciones/cambios', label: 'Novedades', icon: History, module: 'team' },
  { to: '/admin/respaldo', label: 'Respaldo y migración', icon: Database, module: 'backup' },
];

export const workspaceNavGroups: AppNavGroup[] = [
  { id: 'commercial', label: 'Comercial', icon: BriefcaseBusiness, paths: ['/operaciones/pos', '/operaciones/mi-semana', '/operaciones/trabajos/asesoria', '/operaciones/finanzas', '/operaciones/cajas-abiertas', '/operaciones/cotizador', '/operaciones/crm', '/operaciones/clientes', '/operaciones/catalogo'] },
  { id: 'production', label: 'Producción y abastecimiento', icon: Boxes, paths: ['/operaciones/flujos', '/operaciones/coordinacion-trabajos', '/operaciones/trabajos/diseno', '/operaciones/trabajos/impresion', '/operaciones/trabajos/sublimacion', '/operaciones/trabajos/laser', '/operaciones/trabajos/taller', '/operaciones/inventario', '/operaciones/compras', '/operaciones/equipos'] },
  { id: 'marketing', label: 'Marketing', icon: Megaphone, paths: ['/operaciones/marketing'] },
  { id: 'website', label: 'Sitio y contenido', icon: Globe2, paths: ['/admin/sitio', '/admin/servicios', '/admin/tienda', '/admin/blog', '/admin/publicaciones', '/admin/portafolio', '/admin/contacto'] },
  { id: 'team', label: 'Equipo y sistema', icon: Users, paths: ['/operaciones/personal', '/operaciones/equipo', '/operaciones/cambios', '/admin/respaldo'] },
];

/**
 * Route-to-module index shared by the route guard and sidebar.
 * Existing /admin and /operaciones roots are compatibility aliases to /panel.
 */
export const permissionByPath: Record<string, string> = Object.fromEntries(
  [
    ...workspaceNavigation.map(({ to, module }) => [to, module]),
    ['/admin/solicitudes', 'crm'], ['/admin/marketing', 'marketing'],
    ['/admin/cambios', 'team'], ['/admin/contenido', 'website'], ['/admin/catalogo', 'catalog_admin'],
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
