import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import {
  buildInitialQuoteItemFromUrl,
  buildStorefrontQuoteUrl,
  clearStorefrontCatalogState,
  consolidateStorefrontQuantityTiers,
  formatPublicQuantityTiers,
  getStorefrontProductGroup,
  getStorefrontSortOrder,
  reconcileStorefrontSelection,
  resolveQuoteSourceChannel,
  withStorefrontSortOrder,
} from '../src/public-site/storefrontCatalog.ts';

const root = path.dirname(fileURLToPath(import.meta.url));
const priority4Migration = fs.readFileSync(
  path.join(root, '../supabase/migrations/20261127141609_priority4_public_catalog_tiers_and_intake.sql'),
  'utf8',
);

test('the 29 published catalog categories map to the seven storefront families', () => {
  const mappings = [
    ['Souvenirs', 'Promocionales'], ['Impresiones', 'Gran formato'], ['Precios Imprenta', 'Imprenta'],
    ['Displays importados', 'Displays y eventos'], ['Extras', 'Otros productos'], ['DTF A3 Colores', 'Textil'],
    ['DTF A4 Colores', 'Textil'], ['Polo Bordado', 'Textil'], ['Sublimacion A3', 'Textil'],
    ['Sublimacion A4', 'Textil'], ['Sustratos rígidos', 'Rótulos y materiales'], ['Campana Camisetas', 'Textil'],
    ['Almohadas Blanco', 'Textil'], ['Combos Credenciales', 'Imprenta'], ['Credenciales PVC', 'Imprenta'],
    ['Fundas Camiseta', 'Promocionales'], ['Campana Promo', 'Promocionales'], ['Body Recien Nacido', 'Textil'],
    ['Campana Lonas', 'Gran formato'], ['Imprenta', 'Imprenta'], ['Taller y Gran Formato', 'Gran formato'],
    ['Bolso Cambrella', 'Promocionales'], ['Boutique Manija Baja Densidad', 'Promocionales'],
    ['Mochila Tela Rodeo', 'Promocionales'], ['Souvenirs y Personalizados', 'Promocionales'],
    ['Productos de taller', 'Otros productos'], ['Radiografia Alta Densidad', 'Imprenta'],
    ['Ropa y Textiles', 'Textil'], ['Fundas Promocionales', 'Promocionales'],
  ];

  for (const [category, expectedGroup] of mappings) {
    assert.equal(getStorefrontProductGroup({ name: category, category }), expectedGroup, category);
  }
  assert.equal(mappings.length, 29);
});

test('sort state reads valid URL values and defaults safely', () => {
  assert.equal(getStorefrontSortOrder(new URLSearchParams()), 'relevance');
  assert.equal(getStorefrontSortOrder(new URLSearchParams('orden=az')), 'az');
  assert.equal(getStorefrontSortOrder(new URLSearchParams('orden=za')), 'za');
  assert.equal(getStorefrontSortOrder(new URLSearchParams('orden=unsupported')), 'relevance');
});

test('sort updates preserve search, family, detail and unrelated URL state', () => {
  const current = new URLSearchParams('buscar=vinil&familia=Gran+formato&producto=vinil&campaign=noviembre');
  const sorted = withStorefrontSortOrder(current, 'za');
  assert.equal(sorted.get('buscar'), 'vinil');
  assert.equal(sorted.get('familia'), 'Gran formato');
  assert.equal(sorted.get('producto'), 'vinil');
  assert.equal(sorted.get('campaign'), 'noviembre');
  assert.equal(sorted.get('orden'), 'za');

  const cleared = clearStorefrontCatalogState(sorted);
  assert.equal(cleared.has('buscar'), false);
  assert.equal(cleared.has('familia'), false);
  assert.equal(cleared.has('orden'), false);
  assert.equal(cleared.get('producto'), 'vinil');
  assert.equal(cleared.get('campaign'), 'noviembre');
});

test('saved selections normalize quantity-tier source IDs and report unpublished IDs', () => {
  const products = [{
    id: 'tiered-product', name: 'Tarjetas', slug: 'tarjetas', category: 'Imprenta',
    sourceIds: ['tier-1', 'tier-2'], quantityTiers: ['100', '500'],
  }];
  const reconciled = reconcileStorefrontSelection(
    products,
    ['tier-1', 'tier-2', 'tier-1', 'unpublished-id'],
    { 'tier-1': '100', 'tier-2': '500', 'unpublished-id': '500' },
  );

  assert.deepEqual(reconciled.ids, ['tiered-product']);
  assert.deepEqual(reconciled.quantityTiers, { 'tiered-product': '500' });
  assert.equal(reconciled.removedCount, 1);
});

test('single-product quote handoff carries the visible label, SKU, family and selected quantity', () => {
  const item = { id: 'vinil-01', name: 'Vinil adhesivo', slug: 'vinil-adhesivo', sku: 'SV018', category: 'Impresiones' };
  const url = buildStorefrontQuoteUrl([item], { 'vinil-01': '10 m²' }, { 'vinil-01': 'Vinil adhesivo mate · Código SV018' }, 'Varios productos de la tienda');
  const params = new URLSearchParams(url.split('?')[1]);

  assert.equal(params.get('servicio'), 'gran-formato');
  assert.deepEqual(params.getAll('producto'), ['Vinil adhesivo mate · Código SV018']);
  assert.deepEqual(params.getAll('sku'), ['SV018']);
  assert.deepEqual(params.getAll('familia'), ['gran-formato']);
  assert.equal(params.get('cantidad'), '10 m²');
});

test('multi-product quote handoff keeps each product, SKU, family and quantity aligned', () => {
  const items = [
    { id: 'vinil-01', name: 'Vinil adhesivo', slug: 'vinil-adhesivo', sku: 'SV018', category: 'Impresiones' },
    { id: 'polo-01', name: 'Polo bordado', slug: 'polo-bordado', sku: 'PF013', category: 'Polo Bordado' },
  ];
  const url = buildStorefrontQuoteUrl(items, { 'vinil-01': '10 m²', 'polo-01': '12' }, { 'vinil-01': 'Vinil adhesivo', 'polo-01': 'Polo bordado' }, 'Varios productos de la tienda');
  const params = new URLSearchParams(url.split('?')[1]);

  assert.equal(params.get('servicio'), 'Varios productos de la tienda');
  assert.deepEqual(params.getAll('producto'), ['Vinil adhesivo', 'Polo bordado']);
  assert.deepEqual(params.getAll('sku'), ['SV018', 'PF013']);
  assert.deepEqual(params.getAll('familia'), ['gran-formato', 'textil']);
  assert.deepEqual(params.getAll('cantidad'), ['10 m²', '12']);
});

test('public storefront consolidates safe quantity_tiers without reading internal price_scales', () => {
  const rows = [
    {
      id: 'cam-algodon',
      sku: 'CAM-01',
      name: 'Camiseta algodón',
      slug: 'camiseta-algodon',
      description: 'Camiseta estampada',
      category: 'Campana Camisetas',
      calc_type: 'scale',
      sort_order: 2,
      quantity_tiers: [
        { min_qty: 12, max_qty: 24 },
        { min_qty: 25, max_qty: 49 },
        { min_qty: 50, max_qty: 99 },
      ],
    },
    {
      id: 'legacy-tier-1',
      sku: 'TAR-100',
      name: '100',
      slug: 'tarjetas-100',
      description: 'Tarjetas de presentación couché.',
      category: 'Imprenta',
      category_id: 'imprenta',
      calc_type: 'scale',
      sort_order: 5,
    },
    {
      id: 'legacy-tier-2',
      sku: 'TAR-500',
      name: '500',
      slug: 'tarjetas-500',
      description: 'Tarjetas de presentación couché.',
      category: 'Imprenta',
      category_id: 'imprenta',
      calc_type: 'scale',
      sort_order: 6,
    },
  ];

  const consolidated = consolidateStorefrontQuantityTiers(rows);
  assert.equal(consolidated.length, 2);
  assert.deepEqual(consolidated[0].quantityTiers, ['12 - 24', '25 - 49', '50 - 99']);
  assert.equal(consolidated[1].name, 'Tarjetas de presentación couché');
  assert.deepEqual(consolidated[1].quantityTiers, ['100', '500']);
  assert.deepEqual(
    formatPublicQuantityTiers([{ min_qty: 1, max_qty: 1 }, { min_qty: 10, max_qty: 5 }, { min_qty: 12, max_qty: 24 }]),
    ['1', '12 - 24'],
  );
});

test('quote configurator preserves SKU and sourceChannel even without remote catalog match', () => {
  const storefrontParams = new URLSearchParams('producto=Jarro+sublimado&sku=JAR-2026&familia=textil&cantidad=24+-+49');
  assert.equal(resolveQuoteSourceChannel(storefrontParams), 'storefront');
  assert.equal(resolveQuoteSourceChannel(new URLSearchParams()), 'quote_page');

  const item = buildInitialQuoteItemFromUrl({
    service: '',
    project: storefrontParams.get('producto') || '',
    sku: storefrontParams.get('sku') || '',
    quantityRange: storefrontParams.get('cantidad') || '',
  });

  assert.equal(item.sku, 'JAR-2026');
  assert.equal(item.project, 'Jarro sublimado');
  assert.equal(item.quantity, 24);
  assert.equal(item.quantityRange, '24 - 49');
  assert.equal(item.service, '');
});

test('public_catalog_products exposes safe quantity_tiers, hides price_scales, and hardens public_requests', async () => {
  const db = new PGlite();
  try {
    const orgId = '10000000-0000-0000-0000-000000000001';
    await db.exec(`
      create role anon;
      create role authenticated;
      create table public.organizations (
        id uuid primary key,
        slug text unique not null
      );
      create table public.catalog_products (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null,
        sku text,
        name text not null,
        slug text not null,
        description text not null default '',
        product_type text,
        category_id text,
        subcategory_id text,
        subcategory text,
        calc_type text,
        currency text default 'USD',
        is_featured boolean not null default false,
        is_published boolean not null default true,
        sort_order integer not null default 0,
        image_url text,
        images text[] default '{}',
        features text[] default '{}',
        product_kind text default 'catalog',
        custom_options jsonb default '{}'::jsonb,
        price_scales jsonb default '[]'::jsonb
      );
      create table public.website_product_overrides (
        organization_id uuid not null,
        product_id uuid not null,
        display_name text,
        display_description text,
        display_category text,
        display_image_url text,
        display_images text[],
        display_features text[],
        sort_order integer,
        is_published boolean default true
      );
      create table public.public_requests (
        id uuid primary key default gen_random_uuid(),
        request_type text not null default 'contact',
        name text not null,
        phone text not null default '',
        email text not null default '',
        company text not null default '',
        service text not null default '',
        message text not null default '',
        quote_data jsonb not null default '{}'::jsonb,
        status text not null default 'new',
        assigned_to uuid,
        created_by uuid
      );
      alter table public.organizations enable row level security;
      alter table public.catalog_products enable row level security;
      alter table public.website_product_overrides enable row level security;
      alter table public.public_requests enable row level security;
      create policy organizations_public_catalog_read on public.organizations for select to anon using (slug = 'visual-corp');
      create policy catalog_anon_read on public.catalog_products for select to anon using (is_published);
      create policy overrides_anon_read on public.website_product_overrides for select to anon using (true);
      create policy requests_anon_add on public.public_requests for insert to anon with check (status = 'new');
      grant select (id, slug) on public.organizations to anon;
      grant select (id, organization_id, sku, name, slug, description, product_type, category_id, subcategory_id, subcategory, calc_type, currency, is_featured, is_published, sort_order, image_url, images, features, product_kind, custom_options, price_scales) on public.catalog_products to anon;
      grant select on public.website_product_overrides to anon;

      insert into public.organizations (id, slug) values ('${orgId}', 'visual-corp');
      insert into public.catalog_products (
        organization_id, sku, name, slug, description, category_id, subcategory, calc_type, is_published, sort_order, custom_options, price_scales
      ) values (
        '${orgId}',
        'CAM-99',
        'Camiseta corporativa',
        'camiseta-corporativa',
        'Camiseta sublimada con rangos',
        'textil',
        'Campana Camisetas',
        'scale',
        true,
        1,
        '{"quantity_pricing":{"legacy_ids":["a","b"],"internal_margin":0.45}}'::jsonb,
        '[{"qty":12,"max_qty":24,"price":11.5,"cost":6.2},{"qty":25,"max_qty":50,"price":9.8,"cost":5.5}]'::jsonb
      ), (
        '${orgId}',
        'ROT-01',
        'Rótulo acrílico',
        'rotulo-acrilico',
        'Sin escala pública',
        'rotulos',
        'Sustratos rígidos',
        'area',
        true,
        2,
        '{}'::jsonb,
        '[{"qty":1,"max_qty":5,"price":45.0}]'::jsonb
      );
    `);

    await db.exec(priority4Migration);
    await db.exec('set role anon');

    const safeResult = await db.query(`
      select id, sku, name, slug, description, type, category_id, category, calc_type, featured, sort_order, image, images, features, quantity_tiers
      from public.public_catalog_products
      order by sort_order
    `);
    assert.equal(safeResult.rows.length, 2);
    assert.deepEqual(safeResult.rows[0].quantity_tiers, [
      { min_qty: 12, max_qty: 24 },
      { min_qty: 25, max_qty: 50 },
    ]);
    assert.equal(JSON.stringify(safeResult.rows[0].quantity_tiers).includes('price'), false);
    assert.equal(JSON.stringify(safeResult.rows[0].quantity_tiers).includes('cost'), false);
    assert.deepEqual(safeResult.rows[1].quantity_tiers, []);

    await assert.rejects(
      db.query('select price_scales from public.public_catalog_products'),
      /price_scales|does not exist/i,
    );
    await assert.rejects(
      db.query('select custom_options from public.public_catalog_products'),
      /custom_options|does not exist/i,
    );

    await db.query(
      `insert into public.public_requests (request_type, name, phone, email, service, message, quote_data)
       values ('quote', 'Cliente Prueba', '0991234567', 'cliente@visualcorp.test', 'Textil', 'Cotización storefront', '{"sourceChannel":"storefront"}'::jsonb)`,
    );
    await assert.rejects(
      db.query(`insert into public.public_requests (request_type, name, phone) values ('contact', '   ', '0991234567')`),
      /public_requests_name_not_blank_check/i,
    );

    await db.exec('reset role');
  } finally {
    await db.close();
  }
});
