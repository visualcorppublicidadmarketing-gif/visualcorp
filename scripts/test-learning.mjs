import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { createLearningContentHandler } from '../server/learning/learning-content-handler.js';
import { learningAreas, learningChecklists, learningGuides, learningPractices } from '../server/learning/learning-content.ts';
import { calculateArea, estimateVisibility, nextRovingTabIndex, normalizeSearch, progressPercent, resolveLearningRoute } from '../src/pages/learning/learning-utils.js';

const base = { supabaseUrl: 'https://example.supabase.co', publishableKey: 'publishable-key' };

test('maps the library, areas, guides, practices and invalid paths', () => {
  assert.deepEqual(resolveLearningRoute('/operaciones/manual-aprendizaje', '/operaciones/manual-aprendizaje'), { type: 'home' });
  assert.deepEqual(resolveLearningRoute('/operaciones/manual-aprendizaje/areas/diseno-produccion', '/operaciones/manual-aprendizaje'), { type: 'area', id: 'diseno-produccion' });
  assert.deepEqual(resolveLearningRoute('/admin/manual-aprendizaje/guias/induccion/', '/admin/manual-aprendizaje'), { type: 'guide', id: 'induccion' });
  assert.deepEqual(resolveLearningRoute('/operaciones/manual-aprendizaje/practicas/pantone', '/operaciones/manual-aprendizaje'), { type: 'practice', id: 'pantone' });
  assert.deepEqual(resolveLearningRoute('/operaciones/manual-aprendizaje/not-real', '/operaciones/manual-aprendizaje'), { type: 'not-found' });
});

test('normalizes Spanish accents while searching', () => {
  assert.equal(normalizeSearch('  Diseño y producción '), 'diseno y produccion');
  assert.equal(normalizeSearch('Corte Láser CO₂'), 'corte laser co₂');
});

test('calculates area and rejects invalid dimensions', () => {
  assert.deepEqual(calculateArea(1.2, 0.8, 3), { perPiece: 0.96, total: 2.88, quantity: 3 });
  assert.equal(calculateArea(1, 0, 1), null);
  assert.equal(calculateArea('bad', 2, 1), null);
});

test('keeps visual-distance values orientative', () => {
  assert.deepEqual(estimateVisibility(10), { suggested: 30, limit: 45 });
  assert.equal(estimateVisibility(0), null);
});

test('bounds checklist progress and wraps roving tab focus with arrow keys', () => {
  assert.equal(progressPercent(2, 5), 40);
  assert.equal(progressPercent(8, 5), 100);
  assert.equal(progressPercent(1, 0), 0);
  assert.equal(nextRovingTabIndex(0, 'ArrowLeft', 4), 3);
  assert.equal(nextRovingTabIndex(3, 'ArrowRight', 4), 0);
  assert.equal(nextRovingTabIndex(2, 'Home', 4), 0);
  assert.equal(nextRovingTabIndex(0, 'End', 4), 3);
  assert.equal(nextRovingTabIndex(1, 'ArrowDown', 4), null);
  assert.equal(nextRovingTabIndex(0, 'ArrowRight', 0), null);
});

test('loads the Pantone server catalog with Node ESM JSON import attributes', async () => {
  const { default: colors } = await import('../server/learning/pantone-catalog.js');
  assert.equal(colors.length, 728);
  assert.ok(colors.every((color) => /^#[0-9A-F]{6}$/i.test(color.hex) && color.name && color.pantone));
});

test('does not return protected content before the Supabase role check', async () => {
  let loads = 0;
  const handler = createLearningContentHandler({ env: { VITE_SUPABASE_URL: base.supabaseUrl, VITE_SUPABASE_PUBLISHABLE_KEY: base.publishableKey }, loadResource: async () => { loads += 1; return { private: true }; } });
  const response = await handler(new Request('https://suite.example/api/learning-content?resource=library'));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Inicia sesión para consultar el material interno.' });
  assert.equal(loads, 0);
});

test('returns the authorized library without allowing shared cache storage', async () => {
  const payload = { areas: [{ id: 'inicio' }], guides: [{ id: 'induccion' }], practices: [] };
  const handler = createLearningContentHandler({
    env: { VITE_SUPABASE_URL: base.supabaseUrl, VITE_SUPABASE_PUBLISHABLE_KEY: base.publishableKey },
    fetcher: async (url, options) => {
      assert.equal(url, `${base.supabaseUrl}/rest/v1/rpc/get_my_visualcorp_access`);
      assert.equal(options.headers.authorization, 'Bearer staff-token');
      return Response.json({ roles: [{ role: 'advisor' }] });
    },
    loadResource: async (resource) => resource === 'library' ? payload : null,
  });
  const response = await handler(new Request('https://suite.example/api/learning-content', { headers: { authorization: 'Bearer staff-token' } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0, must-revalidate');
  assert.equal(response.headers.get('vary'), 'Authorization');
  assert.deepEqual(await response.json(), payload);
});

test('denies an authenticated profile without an allowed internal role', async () => {
  let loads = 0;
  const handler = createLearningContentHandler({
    env: { VITE_SUPABASE_URL: base.supabaseUrl, VITE_SUPABASE_PUBLISHABLE_KEY: base.publishableKey },
    fetcher: async () => Response.json({ roles: [{ role: 'customer' }] }),
    loadResource: async () => { loads += 1; return {}; },
  });
  const response = await handler(new Request('https://suite.example/api/learning-content', { headers: { authorization: 'Bearer customer-token' } }));
  assert.equal(response.status, 403);
  assert.equal(loads, 0);
});

test('allows the organization owner consistently with the protected UI routes', async () => {
  const handler = createLearningContentHandler({
    env: { VITE_SUPABASE_URL: base.supabaseUrl, VITE_SUPABASE_PUBLISHABLE_KEY: base.publishableKey },
    fetcher: async () => Response.json({ roles: [{ role: 'owner' }] }),
    loadResource: async () => ({ areas: [] }),
  });
  const response = await handler(new Request('https://suite.example/api/learning-content', { headers: { authorization: 'Bearer owner-token' } }));
  assert.equal(response.status, 200);
});

test('only accepts known resources and GET requests', async () => {
  let loads = 0;
  const handler = createLearningContentHandler({
    env: { VITE_SUPABASE_URL: base.supabaseUrl, VITE_SUPABASE_PUBLISHABLE_KEY: base.publishableKey },
    fetcher: async () => Response.json({ roles: [{ role: 'admin' }] }),
    loadResource: async () => { loads += 1; return {}; },
  });
  const unknown = await handler(new Request('https://suite.example/api/learning-content?resource=filesystem', { headers: { authorization: 'Bearer admin-token' } }));
  assert.equal(unknown.status, 404);
  const post = await handler(new Request('https://suite.example/api/learning-content', { method: 'POST', headers: { authorization: 'Bearer admin-token' } }));
  assert.equal(post.status, 405);
  assert.equal(loads, 0);
});

test('does not place lesson, quiz or catalog entries in public Vite chunks after build', async (context) => {
  let files;
  try { files = await readdir(new URL('../dist/assets/', import.meta.url)); } catch { context.skip('Ejecuta el build antes de comprobar los chunks del navegador.'); return; }
  const chunks = await Promise.all(files.filter((name) => name.endsWith('.js')).map((name) => readFile(new URL(`../dist/assets/${name}`, import.meta.url), 'utf8')));
  const bundle = chunks.join('\n');
  assert.doesNotMatch(bundle, /Una bienvenida común/);
  assert.doesNotMatch(bundle, /¿Qué describe mejor un archivo vectorial\?/);
  assert.doesNotMatch(bundle, /Pantone 100 C/);
  assert.doesNotMatch(bundle, /Confirmar objetivo, medidas y cantidad/);
  assert.doesNotMatch(bundle, /Galaxy CO₂ 60W/);
  assert.doesNotMatch(bundle, /7 mm exactos/);
  assert.doesNotMatch(bundle, /vn foto recuerdo/);
  assert.doesNotMatch(bundle, /FlexiPRINT → Hosonsoft/);
});

test('all 9 guides expose structured blocks and existing local workshop imagery', async () => {
  assert.equal(learningGuides.length, 9);
  assert.equal(learningAreas.length, 6);
  assert.equal(learningPractices.length, 6);
  assert.equal(learningChecklists.length, 4);

  const guideIds = new Set(learningGuides.map((g) => g.id));
  const areaIds = new Set(learningAreas.map((a) => a.id));
  for (const area of learningAreas) {
    if (area.coverImage) await access(new URL(`../public${area.coverImage}`, import.meta.url));
    for (const id of area.guideIds) assert.equal(guideIds.has(id), true, `Missing guide ${id}`);
  }

  for (const guide of learningGuides) {
    assert.equal(areaIds.has(guide.areaId), true, `Unknown area ${guide.areaId}`);
    if (guide.coverImage) await access(new URL(`../public${guide.coverImage}`, import.meta.url));
    const totalBlocks = guide.sections.reduce((sum, s) => sum + (s.blocks?.length || 0), 0);
    assert.ok(totalBlocks >= 3, `Guide ${guide.id} should include structured visual blocks`);
    for (const section of guide.sections) {
      for (const block of section.blocks || []) {
        if (block.type === 'media') {
          await access(new URL(`../public${block.src}`, import.meta.url));
        }
      }
    }
  }
});

test('all ASCII block icon identifiers in guides are mapped in LearningBlockRenderer', async () => {
  const renderer = await readFile(new URL('../src/pages/learning/LearningBlockRenderer.tsx', import.meta.url), 'utf8');
  const mapBlock = renderer.match(/const ICON_MAP[\s\S]*?\};/);
  assert.ok(mapBlock, 'ICON_MAP should exist in LearningBlockRenderer.tsx');
  const mappedKeys = new Set([...mapBlock[0].matchAll(/^\s*([a-z0-9]+):/gm)].map((m) => m[1].toLowerCase()));

  for (const guide of learningGuides) {
    for (const section of guide.sections) {
      for (const block of section.blocks || []) {
        const candidates = [];
        if ('items' in block && Array.isArray(block.items)) {
          for (const item of block.items) {
            if (typeof item?.icon === 'string') candidates.push(item.icon);
          }
        }
        if ('left' in block && block.left?.icon) candidates.push(block.left.icon);
        if ('right' in block && block.right?.icon) candidates.push(block.right.icon);
        for (const icon of candidates) {
          if (/^[a-z0-9_-]+$/i.test(icon)) {
            assert.equal(mappedKeys.has(icon.toLowerCase()), true, `Unmapped ASCII icon "${icon}" in guide ${guide.id}`);
          }
        }
      }
    }
  }
});
