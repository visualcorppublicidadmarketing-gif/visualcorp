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
  ['team_schedule', 'Horarios y turnos'],
] as const;

export const standardPermissionActions = ['view', 'edit', 'delete_records'] as const;

export const deleteRecordPermissionAction = 'delete_records' as const;

export const specialPermissionActions = [
  { module: 'marketing', action: 'approve_content', label: 'Aprobar contenido y solicitar cambios (requiere ver y editar Marketing)' },
  { module: 'team', action: 'manage_members', label: 'Asignar perfiles y activar o pausar accesos' },
  { module: 'team', action: 'manage_profiles', label: 'Crear y configurar perfiles' },
  { module: 'team', action: 'manage_suggestions', label: 'Revisar y actualizar el estado de sugerencias internas' },
  { module: 'inventory_costs', action: 'view_costs', label: 'Ver costos y márgenes' },
  { module: 'inventory_costs', action: 'edit_costs', label: 'Editar costos' },
  { module: 'catalog_admin', action: 'edit_prices', label: 'Cambiar precios y tarifas' },
  { module: 'purchases', action: 'approve_purchase', label: 'Aprobar órdenes de compra' },
  { module: 'purchases', action: 'cancel_purchase', label: 'Cancelar órdenes de compra' },
  { module: 'purchases', action: 'receive_purchase', label: 'Registrar recepción de compras' },
  { module: 'sales', action: 'settle_refund', label: 'Completar reembolsos (requiere ver Ventas, ver Caja y editar Caja)' },
  { module: 'website', action: 'publish_content', label: 'Publicar cambios en la web' },
  { module: 'cash', action: 'manage_cash', label: 'Registrar movimientos y gestionar caja' },
  { module: 'finance', action: 'manage_finance', label: 'Administrar egresos, presupuestos y pagos' },
  { module: 'personnel', action: 'view_compensation', label: 'Consultar remuneración e historial de pagos del personal' },
  { module: 'personnel', action: 'edit_compensation', label: 'Registrar cambios de remuneración del personal' },
] as const;

export type PermissionModuleKey = (typeof permissionModules)[number][0];

export type StandardPermissionActionKey = (typeof standardPermissionActions)[number];

type SpecialPermissionKey<T = (typeof specialPermissionActions)[number]> = T extends {
  module: infer Module extends string;
  action: infer Action extends string;
} ? `${Module}.${Action}` : never;

export type PermissionKey = `${PermissionModuleKey}.${StandardPermissionActionKey}` | SpecialPermissionKey;

export type BaseRoleKey =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'advisor'
  | 'warehouse'
  | 'production'
  | 'marketing'
  | 'website_admin';

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

export const assignableBaseRoles: Array<{ value: Exclude<BaseRoleKey, 'owner'>; label: string; ownerOnly?: boolean }> = [
  { value: 'advisor', label: 'Asesoría / Caja operativa' },
  { value: 'production', label: 'Taller y producción' },
  { value: 'warehouse', label: 'Inventario y bodega' },
  { value: 'marketing', label: 'Marketing y contenido' },
  { value: 'manager', label: 'Gerencia / Supervisión' },
  { value: 'admin', label: 'Admin general (solo propietario)', ownerOnly: true },
  { value: 'website_admin', label: 'Admin página web (solo propietario)', ownerOnly: true },
];

export function canActorManageBaseRole(actorRoles: readonly string[], targetBaseRole: string): boolean {
  if (!targetBaseRole || targetBaseRole === 'owner') return false;
  if (actorRoles.includes('owner')) return true;
  if (targetBaseRole === 'admin' || targetBaseRole === 'website_admin') return false;
  if (actorRoles.includes('admin') || actorRoles.includes('manager')) {
    return ['manager', 'advisor', 'warehouse', 'production', 'marketing'].includes(targetBaseRole);
  }
  return actorRoles.includes(targetBaseRole);
}

/**
 * Ordered prerequisite matrix: enabling a dependent permission automatically
 * turns on every prerequisite in this list; disabling a prerequisite revokes
 * every permission that depends on it.
 */
export const permissionDependencies: Partial<Record<PermissionKey, PermissionKey[]>> = {
  'marketing.approve_content': ['marketing.view', 'marketing.edit'],
  'team.manage_members': ['team.view'],
  'team.manage_profiles': ['team.view'],
  'team.manage_suggestions': ['team.view'],
  'inventory_costs.view_costs': ['inventory_costs.view'],
  'inventory_costs.edit_costs': ['inventory_costs.view', 'inventory_costs.edit', 'inventory_costs.view_costs'],
  'catalog_admin.edit_prices': ['catalog_admin.view', 'catalog_admin.edit'],
  'purchases.approve_purchase': ['purchases.view'],
  'purchases.cancel_purchase': ['purchases.view'],
  'purchases.receive_purchase': ['purchases.view'],
  'sales.settle_refund': ['sales.view', 'cash.view', 'cash.edit'],
  'website.publish_content': ['website.view', 'website.edit'],
  'cash.manage_cash': ['cash.view'],
  'finance.manage_finance': ['finance.view'],
  'personnel.view_compensation': ['personnel.view'],
  'personnel.edit_compensation': ['personnel.view', 'personnel.edit', 'personnel.view_compensation'],
};

const specialActionsByModule = specialPermissionActions.reduce<Record<string, PermissionKey[]>>((acc, item) => {
  const fullKey = `${item.module}.${item.action}` as PermissionKey;
  acc[item.module] = [...(acc[item.module] || []), fullKey];
  return acc;
}, {});

export function applyPermissionMatrixChange(
  current: Record<string, boolean>,
  key: string,
  enabled: boolean,
): Record<string, boolean> {
  const next: Record<string, boolean> = { ...current, [key]: enabled };
  const [moduleKey, actionKey] = key.split('.');

  if (moduleKey === 'personnel' && actionKey === 'delete_records') {
    next[key] = false;
    return next;
  }

  if (enabled) {
    if (actionKey === 'edit' || actionKey === 'delete_records') {
      next[`${moduleKey}.view`] = true;
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const [permKey, deps] of Object.entries(permissionDependencies) as Array<[PermissionKey, PermissionKey[]]>) {
        if (!next[permKey] || !deps?.length) continue;
        for (const dep of deps) {
          if (!next[dep]) {
            next[dep] = true;
            changed = true;
          }
          const [depMod, depAct] = dep.split('.');
          if ((depAct === 'edit' || depAct === 'delete_records') && !next[`${depMod}.view`]) {
            next[`${depMod}.view`] = true;
            changed = true;
          }
        }
      }
    }
    return next;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [mod] of permissionModules) {
      if (!next[`${mod}.view`]) {
        if (next[`${mod}.edit`]) {
          next[`${mod}.edit`] = false;
          changed = true;
        }
        if (next[`${mod}.delete_records`]) {
          next[`${mod}.delete_records`] = false;
          changed = true;
        }
        for (const specialKey of specialActionsByModule[mod] || []) {
          if (next[specialKey]) {
            next[specialKey] = false;
            changed = true;
          }
        }
      }
    }
    for (const [permKey, deps] of Object.entries(permissionDependencies) as Array<[PermissionKey, PermissionKey[]]>) {
      if (!next[permKey] || !deps?.length) continue;
      if (deps.some((dep) => !next[dep])) {
        next[permKey] = false;
        changed = true;
      }
    }
  }

  return next;
}
