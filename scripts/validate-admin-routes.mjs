import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) return '';
  const end = source.indexOf(endMarker, start + startMarker.length);
  return source.slice(start, end < 0 ? source.length : end);
}

function quotedValues(source) {
  return [...source.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

export function parseNavigation(source) {
  const block = sectionBetween(
    source,
    'export const workspaceNavigation',
    'export const workspaceNavGroups',
  );
  const items = [];

  for (const match of block.matchAll(/\{([^{}]*)\}/gs)) {
    const objectText = match[1];
    const to = objectText.match(/\bto:\s*['"]([^'"]+)['"]/);
    const module = objectText.match(/\bmodule:\s*['"]([^'"]+)['"]/);
    if (!to) continue;
    const aliasesBlock = objectText.match(/\baliases:\s*\[([^\]]*)\]/);
    const anyOfBlock = objectText.match(/\banyOf:\s*\[([^\]]*)\]/);
    items.push({
      to: to[1],
      module: module?.[1] || '',
      aliases: aliasesBlock ? quotedValues(aliasesBlock[1]) : [],
      anyOf: anyOfBlock ? quotedValues(anyOfBlock[1]) : [],
    });
  }

  const groupsBlock = sectionBetween(
    source,
    'export const workspaceNavGroups',
    'export const permissionByPath',
  );
  const groups = [...groupsBlock.matchAll(/\bpaths:\s*\[([^\]]*)\]/gs)]
    .flatMap((match) => quotedValues(match[1]));

  const permissionsBlock = sectionBetween(
    source,
    'export const permissionByPath',
    'export const legacyPanelPaths',
  );
  const explicitPermissions = [...permissionsBlock.matchAll(/\[\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\]/g)]
    .map((match) => ({ path: match[1], module: match[2] }));

  return { items, groups, explicitPermissions };
}

function parseRoutes(source) {
  const routes = [...source.matchAll(/<Route\b[^>]*\bpath="([^"]+)"/g)].map((match) => match[1]);
  const protectedRouteEntries = [
    ...source.matchAll(/<Route\b[^>]*\bpath="([^"]+)"\s+element=\{\s*<ProtectedPage\b[^>]*\barea="([^"]+)"/gs),
  ].map((match) => ({ path: match[1], area: match[2] }));
  const protectedRoutes = protectedRouteEntries.map((entry) => entry.path);
  return { routes, protectedRoutes, protectedRouteEntries };
}

const OPERATIONS_AREA_MODULES = new Set([
  'dashboard',
  'sales',
  'quotes',
  'crm',
  'finance',
  'cash',
  'workshop',
  'inventory',
  'inventory_costs',
  'purchases',
  'marketing',
  'personnel',
]);

const AREA_MODULE_MAP = {
  website: new Set(['website']),
  catalog: new Set(['catalog_admin']),
  team: new Set(['team']),
  backup: new Set(['backup']),
  team_schedule: new Set(['team_schedule']),
  operations: OPERATIONS_AREA_MODULES,
};

function isAreaCompatibleWithModule(area, moduleKey) {
  const allowedModules = AREA_MODULE_MAP[area];
  if (allowedModules) return allowedModules.has(moduleKey);
  return area === moduleKey;
}

function routeSpecificityScore(pattern) {
  if (pattern.endsWith('/*')) return 1;
  if (pattern.includes('/:')) return 2;
  return 3;
}

function findMatchingProtectedRoute(protectedRouteEntries, path) {
  const matches = protectedRouteEntries.filter((entry) => routePatternMatches(entry.path, path));
  if (!matches.length) return null;
  matches.sort((a, b) => routeSpecificityScore(b.path) - routeSpecificityScore(a.path) || b.path.length - a.path.length);
  return matches[0];
}

export function canViewParsedNavigationItem(item, items, hasPermission) {
  if (item.to === '/panel') {
    return hasPermission('dashboard', 'view')
      || items.some((link) => link.to !== '/panel' && canViewParsedNavigationItem(link, items, hasPermission));
  }
  return item.anyOf?.length
    ? item.anyOf.some((module) => hasPermission(module, 'view'))
    : hasPermission(item.module, 'view');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function routePatternMatches(pattern, path) {
  if (pattern === '*') return true;

  const wildcard = pattern.endsWith('/*');
  const base = wildcard ? pattern.slice(0, -2) : pattern;
  const segments = base.split('/');
  const expression = segments.map((segment) => {
    if (segment.startsWith(':')) return '[^/]+';
    return escapeRegExp(segment);
  }).join('/');
  const suffix = wildcard ? '(?:/.*)?' : '';
  return new RegExp(`^${expression}${suffix}/?$`).test(path);
}

export function validateAdminRouteIntegrity({ appSource, navigationSource }) {
  const { items, groups, explicitPermissions } = parseNavigation(navigationSource);
  const { routes, protectedRoutes, protectedRouteEntries } = parseRoutes(appSource);
  const errors = [];

  if (!items.length) errors.push('No se pudo leer workspaceNavigation.');
  if (!routes.length) errors.push('No se encontraron rutas declaradas en App.tsx.');
  if (!protectedRoutes.length) errors.push('No se encontraron rutas protegidas en App.tsx.');

  const menuPaths = new Set();
  const permissionModules = new Map();
  for (const item of items) {
    if (!item.module) errors.push(`La ruta de menú ${item.to} no declara module.`);
    for (const path of [item.to, ...item.aliases]) {
      if (menuPaths.has(path)) errors.push(`La ruta de menú ${path} está repetida.`);
      menuPaths.add(path);
      if (item.module) permissionModules.set(path, item.module);
      if (!routes.some((route) => route !== '*' && routePatternMatches(route, path))) {
        errors.push(`La ruta de menú ${path} no coincide con ninguna ruta de App.tsx.`);
      }
    }
  }

  for (const path of groups) {
    if (!items.some((item) => item.to === path)) {
      errors.push(`El grupo de navegación incluye ${path}, pero no existe como destino canónico del menú.`);
    }
  }

  for (const route of protectedRoutes) {
    if (!menuPathsHasMatch(menuPaths, route)) {
      errors.push(`La ruta protegida ${route} no tiene una entrada equivalente en el índice de navegación/permisos.`);
    }
  }

  for (const { path, module } of explicitPermissions) {
    const existingModule = permissionModules.get(path);
    if (existingModule && existingModule !== module) {
      errors.push(`La ruta ${path} declara módulos de permiso distintos (${existingModule} y ${module}).`);
    } else if (!existingModule) {
      permissionModules.set(path, module);
    }
    if (!routes.some((route) => route !== '*' && routePatternMatches(route, path))) {
      errors.push(`La ruta de permiso heredado ${path} no coincide con ninguna ruta de App.tsx.`);
    }
  }

  const matchedByProtectedRoute = new Map();
  for (const [path, moduleKey] of permissionModules.entries()) {
    const routeEntry = findMatchingProtectedRoute(protectedRouteEntries, path);
    if (!routeEntry) continue;
    if (!matchedByProtectedRoute.has(routeEntry)) {
      matchedByProtectedRoute.set(routeEntry, []);
    }
    matchedByProtectedRoute.get(routeEntry).push({ path, moduleKey });
    if (!isAreaCompatibleWithModule(routeEntry.area, moduleKey)) {
      errors.push(
        `La ruta protegida ${routeEntry.path} usa area="${routeEntry.area}", pero navigation.ts asigna el módulo "${moduleKey}" a ${path}.`,
      );
    }
  }

  for (const routeEntry of protectedRouteEntries) {
    const matched = matchedByProtectedRoute.get(routeEntry) || [];
    if (matched.length === 0) {
      const hasAnyMenuMatch = menuPathsHasMatch(menuPaths, routeEntry.path);
      if (hasAnyMenuMatch) {
        errors.push(`La ruta protegida ${routeEntry.path} (area="${routeEntry.area}") no quedó asociada a ningún módulo compatible.`);
      }
    }
  }

  return {
    errors,
    routeCount: routes.length,
    protectedRouteCount: protectedRoutes.length,
    menuPathCount: menuPaths.size,
  };
}

function menuPathsHasMatch(menuPaths, routePattern) {
  return [...menuPaths].some((path) => routePatternMatches(routePattern, path));
}

function main() {
  const appSource = readFileSync(fileURLToPath(new URL('../src/App.tsx', import.meta.url)), 'utf8');
  const navigationSource = readFileSync(fileURLToPath(new URL('../src/app/navigation.ts', import.meta.url)), 'utf8');
  const result = validateAdminRouteIntegrity({ appSource, navigationSource });

  if (result.errors.length) {
    console.error('La validación de rutas del panel encontró inconsistencias:');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Rutas del panel coherentes: ${result.routeCount} rutas, ${result.protectedRouteCount} protegidas y ${result.menuPathCount} destinos con permisos.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
