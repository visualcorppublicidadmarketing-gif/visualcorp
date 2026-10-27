/**
 * Canonical display index for the permission keys persisted in Supabase.
 * Keep these keys stable: renaming a label must not rename a database key.
 */
export const permissionModules = [
  ['dashboard', 'Panel principal'],
  ['website', 'Sitio y contenido'],
  ['crm', 'Clientes y CRM'],
  ['sales', 'Ventas y POS'],
  ['quotes', 'Cotizaciones'],
  ['inventory', 'Inventario'],
  ['inventory_costs', 'Costos de inventario'],
  ['purchases', 'Compras'],
  ['workshop', 'Taller y producción'],
  ['marketing', 'Marketing'],
  ['team', 'Equipo y accesos'],
  ['catalog_admin', 'Catálogo y tarifas'],
  ['backup', 'Respaldo'],
  ['cash', 'Caja'],
  ['finance', 'Finanzas'],
  ['personnel', 'Personal'],
] as const;

export const specialPermissionActions = [
  { module: 'team', action: 'manage_members', label: 'Asignar perfiles y activar o pausar accesos' },
  { module: 'team', action: 'manage_profiles', label: 'Crear y configurar perfiles' },
  { module: 'inventory_costs', action: 'view_costs', label: 'Ver costos y márgenes' },
  { module: 'inventory_costs', action: 'edit_costs', label: 'Editar costos' },
  { module: 'catalog_admin', action: 'edit_prices', label: 'Cambiar precios y tarifas' },
  { module: 'purchases', action: 'approve_purchase', label: 'Aprobar órdenes de compra' },
  { module: 'purchases', action: 'cancel_purchase', label: 'Cancelar órdenes de compra' },
  { module: 'purchases', action: 'receive_purchase', label: 'Registrar recepción de compras' },
  { module: 'sales', action: 'settle_refund', label: 'Completar reembolsos' },
  { module: 'website', action: 'publish_content', label: 'Publicar cambios en la web' },
  { module: 'cash', action: 'manage_cash', label: 'Registrar movimientos y gestionar caja' },
  { module: 'finance', action: 'manage_finance', label: 'Administrar egresos, presupuestos y pagos' },
  { module: 'personnel', action: 'view_compensation', label: 'Consultar remuneración e historial de pagos del personal' },
  { module: 'personnel', action: 'edit_compensation', label: 'Registrar cambios de remuneración del personal' },
] as const;

export const legacyRoleNames: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Admin',
  manager: 'Gerencia',
  advisor: 'Asesoras',
  warehouse: 'Inventario',
  production: 'Taller',
  marketing: 'Marketing',
  website_admin: 'Admin página web',
};
