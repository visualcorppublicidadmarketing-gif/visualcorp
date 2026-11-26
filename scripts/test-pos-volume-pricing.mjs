import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'vite';

const source = JSON.parse(await readFile(new URL('../src/data/estebanicoSupabaseCatalog.snapshot.json', import.meta.url), 'utf8'));
const migration = await readFile(new URL('../supabase/migrations/20261126175205_consolidate_catalog_quantity_ranges.sql', import.meta.url), 'utf8');
const stems = ['dtf-a3-colores', 'dtf-a4-colores', 'polo-bordado', 'sublimacion-a3', 'sublimacion-a4', 'almohadas-blanco', 'body-recien-nacido', 'bolso-cambrella', 'mochila-tela-rodeo'];
const rows = source.products.filter((item) => stems.some((stem) => item.id.startsWith(`prod-${stem}-`)));

test('catalog consolidation preserves every price and the POS uses the correct inclusive whole-line bracket', async () => {
  const db = new PGlite();
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    await db.exec(`
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $fn$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $fn$;
      create schema app_private;
      create function app_private.has_visualcorp_access(p_org uuid, p_module text, p_action text, p_branch uuid default null)
        returns boolean language sql stable as $fn$
          select auth.uid()='20000000-0000-4000-8000-000000000002'::uuid
            and p_org='10000000-0000-4000-8000-000000000001'::uuid
            and p_module='catalog_admin' and p_action in ('edit','edit_prices')
        $fn$;
      create table organizations(id uuid primary key, slug text);
      insert into organizations values('10000000-0000-4000-8000-000000000001','visual-corp');
      create table organization_memberships(organization_id uuid, user_id uuid, role text, active boolean, created_at timestamptz);
      insert into organization_memberships values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','owner',true,now());
      create table catalog_products(id text primary key, organization_id uuid, name text, slug text unique,
        price numeric, price_inst numeric, price_corp numeric, price_scales jsonb, custom_options jsonb,
        is_published boolean, calc_type text, product_type text, product_kind text, sku text, currency text,
        updated_at timestamptz);
      create table catalog_inventory_links(catalog_product_id text);
      create table catalog_material_recipes(catalog_product_id text);
      create table catalog_product_workflow_routes(catalog_product_id text);
      create table catalog_product_area_routes(catalog_product_id text);
    `);
    for (const [index, row] of rows.entries()) {
      await db.query(`insert into catalog_products values($1,'10000000-0000-4000-8000-000000000001',$2,$3,$4,$5,$6,$7,$8,true,'scale','service','catalog',$9,'USD',now())`,
        [row.id, row.name, row.slug, row.price, row.installPrice, row.corporatePrice, JSON.stringify(row.priceScales), '{}', `OLD-${index}`]);
    }
    await db.exec(migration);
    await db.exec(migration);
    const published = (await db.query('select * from catalog_products where is_published')).rows;
    assert.equal(published.length, stems.length);
    assert.equal((await db.query('select count(*)::int as count from catalog_products')).rows[0].count, rows.length);
    for (const item of published) {
      const metadata = item.custom_options.quantity_pricing;
      const ranges = item.price_scales.filter((scale) => scale.qty != null);
      assert.equal(metadata.legacy_skus.length, ranges.length);
      for (const range of ranges) {
        const suffix = range.qty === range.max_qty ? String(range.qty) : `${range.qty}-${range.max_qty}`;
        const old = rows.find((row) => row.id === `prod-${item.slug}-${suffix}`);
        assert.deepEqual(range.option_prices, old.priceScales);
        assert.equal(range.pvp, old.price);
      }
    }

    const { calculatePOSLine } = await vite.ssrLoadModule('/src/lib/posPricing.ts');
    const dtf = published.find((item) => item.slug === 'dtf-a3-colores');
    const product = {
      mode: 'quantity', price: Number(dtf.price), priceBasis: 'unit', customOptions: dtf.custom_options,
      tiers: dtf.price_scales.filter((scale) => scale.qty != null).map((scale) => ({
        min_qty: scale.qty, max_qty: scale.max_qty, unit_price: scale.pvp, option_prices: scale.option_prices,
      })),
    };
    const option = 'PVP (S - M - L - XL)';
    const calc = (quantity, optionChoice = option, customUnitPrice) =>
      calculatePOSLine({ product, mode: 'quantity', quantity, tier: 'pvp', optionChoice, customUnitPrice });
    for (const [count, price] of [[1, 18], [2, 12], [4, 12], [5, 11], [100, 8.5], [101, 8], [200, 8], [201, 7.5], [1000, 7]]) {
      assert.equal(calc(count).baseUnitPrice, price);
      assert.equal(calc(count).total, count * price);
    }
    assert.equal(calc(101, 'PVP (XXL - XXXL)').baseUnitPrice, 9);
    assert.equal(calc(1001), null);
    assert.equal(calc(1.5), null);
    assert.equal(calc(1001, option, 6).total, 6006);
    assert.equal(calc(3, 'Talla inexistente'), null);
  } finally {
    await vite.close();
    await db.close();
  }
});
