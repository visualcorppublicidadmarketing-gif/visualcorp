import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { routePatternMatches, validateAdminRouteIntegrity } from './validate-admin-routes.mjs';

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
