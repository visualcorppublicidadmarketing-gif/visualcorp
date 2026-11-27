import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  canViewParsedNavigationItem,
  parseNavigation,
  routePatternMatches,
  validateAdminRouteIntegrity,
} from './validate-admin-routes.mjs';

const appSource = readFileSync(fileURLToPath(new URL('../src/App.tsx', import.meta.url)), 'utf8');
const navigationSource = readFileSync(fileURLToPath(new URL('../src/app/navigation.ts', import.meta.url)), 'utf8');

test('the current admin routes, menu destinations and grouped paths agree', () => {
  const result = validateAdminRouteIntegrity({ appSource, navigationSource });
  assert.deepEqual(result.errors, []);
  assert.ok(result.protectedRouteCount > 0);
});

test('route patterns match exact, parameter and wildcard destinations', () => {
  assert.equal(routePatternMatches('/operaciones/finanzas', '/operaciones/finanzas'), true);
  assert.equal(routePatternMatches('/operaciones/trabajos/:area', '/operaciones/trabajos/diseno'), true);
  assert.equal(routePatternMatches('/admin/manual-aprendizaje/*', '/admin/manual-aprendizaje'), true);
  assert.equal(routePatternMatches('/admin/manual-aprendizaje/*', '/admin/manual-aprendizaje/roles'), true);
  assert.equal(routePatternMatches('/admin/manual-aprendizaje/*', '/admin/permisos'), false);
});

test('the validator catches menu targets with no declared route', () => {
  const result = validateAdminRouteIntegrity({
    appSource: '<Route path="/panel" element={<ProtectedPage area="operations"/>}/><Route path="*" element={<RouteNotFound/>}/>',
    navigationSource: `export const workspaceNavigation = [{ to: '/panel', module: 'dashboard' }, { to: '/inventario', module: 'inventory' }];
      export const workspaceNavGroups = [{ paths: ['/panel', '/inventario'] }];
      export const permissionByPath = Object.fromEntries([]);
      export const legacyPanelPaths = new Set([]);`,
  });
  assert.ok(result.errors.some((error) => error.includes('La ruta de menú /inventario no coincide')));
});

test('the validator catches protected routes omitted from the menu index', () => {
  const result = validateAdminRouteIntegrity({
    appSource: '<Route path="/panel" element={<ProtectedPage area="operations"/>}/><Route path="/oculta" element={<ProtectedPage area="operations"/>}/><Route path="*" element={<RouteNotFound/>}/>',
    navigationSource: `export const workspaceNavigation = [{ to: '/panel', module: 'dashboard' }];
      export const workspaceNavGroups = [{ paths: ['/panel'] }];
      export const permissionByPath = Object.fromEntries([]);
      export const legacyPanelPaths = new Set([]);`,
  });
  assert.ok(result.errors.some((error) => error.includes('La ruta protegida /oculta no tiene una entrada')));
});

test('the validator catches stale explicit permission aliases', () => {
  const result = validateAdminRouteIntegrity({
    appSource: '<Route path="/panel" element={<ProtectedPage area="operations"/>}/><Route path="*" element={<RouteNotFound/>}/>',
    navigationSource: `export const workspaceNavigation = [{ to: '/panel', module: 'dashboard' }];
      export const workspaceNavGroups = [{ paths: ['/panel'] }];
      export const permissionByPath = Object.fromEntries([['/admin/viejo', 'website']]);
      export const legacyPanelPaths = new Set([]);`,
  });
  assert.ok(result.errors.some((error) => error.includes('La ruta de permiso heredado /admin/viejo no coincide')));
});

test('the validator requires ProtectedPage area prop to match navigation.ts module', () => {
  const validResult = validateAdminRouteIntegrity({
    appSource: `
      <Route path="/panel" element={<ProtectedPage area="operations"/>}/>
      <Route path="/admin/respaldo" element={<ProtectedPage area="backup"/>}/>
      <Route path="/operaciones/equipo/horarios" element={<ProtectedPage area="team_schedule"/>}/>
      <Route path="/operaciones/cambios" element={<ProtectedPage area="team"/>}/>
      <Route path="/admin/sitio" element={<ProtectedPage area="website"/>}/>
      <Route path="/operaciones/catalogo" element={<ProtectedPage area="catalog"/>}/>
      <Route path="*" element={<RouteNotFound/>}/>
    `,
    navigationSource: `export const workspaceNavigation = [
        { to: '/panel', module: 'dashboard' },
        { to: '/admin/respaldo', module: 'backup' },
        { to: '/operaciones/equipo/horarios', module: 'team_schedule' },
        { to: '/operaciones/cambios', module: 'team' },
        { to: '/admin/sitio', module: 'website' },
        { to: '/operaciones/catalogo', module: 'catalog_admin' },
      ];
      export const workspaceNavGroups = [{ paths: ['/panel'] }];
      export const permissionByPath = Object.fromEntries([]);
      export const legacyPanelPaths = new Set([]);`,
  });
  assert.deepEqual(validResult.errors, []);

  const mismatchBackup = validateAdminRouteIntegrity({
    appSource: '<Route path="/admin/respaldo" element={<ProtectedPage area="website"/>}/><Route path="*" element={<RouteNotFound/>}/>',
    navigationSource: `export const workspaceNavigation = [{ to: '/admin/respaldo', module: 'backup' }];
      export const workspaceNavGroups = [{ paths: ['/admin/respaldo'] }];
      export const permissionByPath = Object.fromEntries([]);
      export const legacyPanelPaths = new Set([]);`,
  });
  assert.ok(mismatchBackup.errors.some((error) => error.includes('area="website"') && error.includes('módulo "backup"')));

  const mismatchSchedule = validateAdminRouteIntegrity({
    appSource: '<Route path="/operaciones/equipo/horarios" element={<ProtectedPage area="team"/>}/><Route path="*" element={<RouteNotFound/>}/>',
    navigationSource: `export const workspaceNavigation = [{ to: '/operaciones/equipo/horarios', module: 'team_schedule' }];
      export const workspaceNavGroups = [{ paths: ['/operaciones/equipo/horarios'] }];
      export const permissionByPath = Object.fromEntries([]);
      export const legacyPanelPaths = new Set([]);`,
  });
  assert.ok(mismatchSchedule.errors.some((error) => error.includes('area="team"') && error.includes('módulo "team_schedule"')));

  const mismatchTeamInOps = validateAdminRouteIntegrity({
    appSource: '<Route path="/operaciones/cambios" element={<ProtectedPage area="operations"/>}/><Route path="*" element={<RouteNotFound/>}/>',
    navigationSource: `export const workspaceNavigation = [{ to: '/operaciones/cambios', module: 'team' }];
      export const workspaceNavGroups = [{ paths: ['/operaciones/cambios'] }];
      export const permissionByPath = Object.fromEntries([]);
      export const legacyPanelPaths = new Set([]);`,
  });
  assert.ok(mismatchTeamInOps.errors.some((error) => error.includes('area="operations"') && error.includes('módulo "team"')));
});

test('canViewNavigationItem enforces module and anyOf visibility matrix per profile', () => {
  assert.match(navigationSource, /export function canViewNavigationItem\(/);
  assert.match(navigationSource, /if \(item\.to === '\/panel'\)/);
  assert.match(navigationSource, /item\.anyOf\s*\?\s*item\.anyOf\.some\(\(module\)\s*=>\s*hasPermission\(module,\s*'view'\)\)/);

  const { items } = parseNavigation(navigationSource);
  const byPath = new Map(items.map((item) => [item.to, item]));
  const canSee = (modules, path) => {
    const allowed = new Set(modules);
    const hasPermission = (mod, action) => action === 'view' && (allowed.has('*') || allowed.has(mod));
    const item = byPath.get(path);
    assert.ok(item, `Missing navigation item for ${path}`);
    return canViewParsedNavigationItem(item, items, hasPermission);
  };

  const profiles = {
    owner: ['*'],
    asesora: ['dashboard', 'crm', 'sales', 'quotes'],
    cajero: ['dashboard', 'sales', 'cash'],
    taller: ['dashboard', 'workshop', 'inventory'],
    inventario: ['dashboard', 'inventory', 'purchases'],
    marketing: ['dashboard', 'marketing', 'website'],
    website_admin: ['dashboard', 'website', 'catalog_admin'],
    finanzas: ['dashboard', 'finance', 'cash'],
    sin_permisos: [],
  };

  for (const item of items) {
    assert.equal(canSee(profiles.owner, item.to), true, `owner must see ${item.to}`);
    assert.equal(canSee(profiles.sin_permisos, item.to), false, `sin_permisos must not see ${item.to}`);
  }

  // Asesora comercial
  assert.equal(canSee(profiles.asesora, '/panel'), true);
  assert.equal(canSee(profiles.asesora, '/operaciones/pos'), true);
  assert.equal(canSee(profiles.asesora, '/operaciones/cotizador'), true);
  assert.equal(canSee(profiles.asesora, '/operaciones/crm'), true);
  assert.equal(canSee(profiles.asesora, '/operaciones/cajas-abiertas'), true);
  assert.equal(canSee(profiles.asesora, '/operaciones/solicitudes-compras'), true);
  assert.equal(canSee(profiles.asesora, '/operaciones/finanzas'), false);
  assert.equal(canSee(profiles.asesora, '/operaciones/compras'), false);
  assert.equal(canSee(profiles.asesora, '/operaciones/trabajos/diseno'), false);
  assert.equal(canSee(profiles.asesora, '/admin/sitio'), false);
  assert.equal(canSee(profiles.asesora, '/operaciones/equipo'), false);
  assert.equal(canSee(profiles.asesora, '/admin/respaldo'), false);

  // Cajero / Recaudación
  assert.equal(canSee(profiles.cajero, '/operaciones/pos'), true);
  assert.equal(canSee(profiles.cajero, '/operaciones/cajas-abiertas'), true);
  assert.equal(canSee(profiles.cajero, '/operaciones/finanzas'), false);
  assert.equal(canSee(profiles.cajero, '/operaciones/inventario'), false);
  assert.equal(canSee(profiles.cajero, '/operaciones/equipo'), false);

  // Taller
  assert.equal(canSee(profiles.taller, '/operaciones/trabajos/diseno'), true);
  assert.equal(canSee(profiles.taller, '/operaciones/kiosk'), true);
  assert.equal(canSee(profiles.taller, '/operaciones/inventario'), true);
  assert.equal(canSee(profiles.taller, '/operaciones/solicitudes-compras'), true);
  assert.equal(canSee(profiles.taller, '/operaciones/pos'), false);
  assert.equal(canSee(profiles.taller, '/operaciones/finanzas'), false);
  assert.equal(canSee(profiles.taller, '/operaciones/compras'), false);

  // Bodega / Inventario
  assert.equal(canSee(profiles.inventario, '/operaciones/inventario'), true);
  assert.equal(canSee(profiles.inventario, '/operaciones/compras'), true);
  assert.equal(canSee(profiles.inventario, '/operaciones/equipos'), true);
  assert.equal(canSee(profiles.inventario, '/operaciones/pos'), false);
  assert.equal(canSee(profiles.inventario, '/operaciones/finanzas'), false);

  // Marketing
  assert.equal(canSee(profiles.marketing, '/operaciones/marketing'), true);
  assert.equal(canSee(profiles.marketing, '/admin/sitio'), true);
  assert.equal(canSee(profiles.marketing, '/operaciones/pos'), false);
  assert.equal(canSee(profiles.marketing, '/operaciones/equipo'), false);

  // Admin página web
  assert.equal(canSee(profiles.website_admin, '/admin/sitio'), true);
  assert.equal(canSee(profiles.website_admin, '/operaciones/catalogo'), true);
  assert.equal(canSee(profiles.website_admin, '/admin/manual-aprendizaje'), true);
  assert.equal(canSee(profiles.website_admin, '/operaciones/pos'), false);
  assert.equal(canSee(profiles.website_admin, '/operaciones/inventario'), false);
  assert.equal(canSee(profiles.website_admin, '/operaciones/equipo'), false);

  // Finanzas + Caja
  assert.equal(canSee(profiles.finanzas, '/operaciones/finanzas'), true);
  assert.equal(canSee(profiles.finanzas, '/operaciones/finanzas/resumen-diario'), true);
  assert.equal(canSee(profiles.finanzas, '/operaciones/cajas-abiertas'), true);
  assert.equal(canSee(profiles.finanzas, '/operaciones/pos'), false);
  assert.equal(canSee(profiles.finanzas, '/admin/respaldo'), false);

  // Panel stays reachable whenever a non-dashboard operational module is granted
  assert.equal(canSee(['finance'], '/panel'), true);
});
