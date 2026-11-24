import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createPOSSaleAssetRecoveryStore } from '../src/lib/posSaleAssetRecovery.ts';

const migration = await readFile(new URL('../supabase/migrations/20261122050812_pos_durable_checkout_recovery.sql', import.meta.url), 'utf8');
const checkout = await readFile(new URL('../src/pages/pos/CheckoutWorkspace.tsx', import.meta.url), 'utf8');
const paymentRecovery = await readFile(new URL('../src/lib/posPayments.ts', import.meta.url), 'utf8');
const database = new PGlite();

await database.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create schema app_private;
  create table public.recovery_fixture_events(kind text not null, sale_id uuid, detail text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create function app_private.confirm_pos_sale_with_workflows(
    text, text, uuid, jsonb, numeric, text, boolean, jsonb, jsonb, jsonb, jsonb
  ) returns jsonb language plpgsql security definer set search_path = '' as $$
  begin
    insert into public.recovery_fixture_events(kind, detail) values ('sale', $1);
    return jsonb_build_object('sale_id', '00000000-0000-0000-0000-000000000001', 'sale_code', 'TEST-1');
  end;
  $$;
  create function public.save_pos_sale_client_brief(p_sale uuid, p_brief_html text) returns void
    language plpgsql security definer set search_path = '' as $$
  begin
    insert into public.recovery_fixture_events(kind, sale_id, detail) values ('brief', p_sale, p_brief_html);
  end;
  $$;
  create function public.complete_parked_pos_order(p_parked_order uuid, p_sale uuid) returns void
    language plpgsql security definer set search_path = '' as $$
  begin
    if p_parked_order = '00000000-0000-0000-0000-000000000099'::uuid then
      raise exception 'fixture failure';
    end if;
    insert into public.recovery_fixture_events(kind, sale_id, detail) values ('parked', p_sale, p_parked_order::text);
  end;
  $$;
`);
await database.exec(migration);

const actorId = '00000000-0000-0000-0000-000000000010';
const saleId = '00000000-0000-0000-0000-000000000001';
await database.query(`select set_config('request.jwt.claim.sub', $1, false)`, [actorId]);

function confirmSql({ key, brief = 'Brief de prueba', parked = null }) {
  const parkedValue = parked ? `'${parked}'::uuid` : 'null';
  return `select public.confirm_pos_sale_with_workflows(
    '${key}', 'SUC-1', null, '{}'::jsonb, 0, '', false,
    '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '[]'::jsonb,
    '${brief}', ${parkedValue}
  )`;
}

test('el RPC persiste brief y orden aparcada con la venta confirmada', async () => {
  const result = await database.query(confirmSql({ key: 'sale-success-001', parked: '00000000-0000-0000-0000-000000000020' }));
  assert.equal(result.rows[0].confirm_pos_sale_with_workflows.sale_id, saleId);
  const rows = await database.query(`select kind from public.recovery_fixture_events order by kind`);
  assert.deepEqual(rows.rows.map((row) => row.kind), ['brief', 'parked', 'sale']);
});

test('un fallo al cerrar la orden aparcada revierte la venta y el brief', async () => {
  await assert.rejects(database.query(confirmSql({ key: 'sale-rollback-001', parked: '00000000-0000-0000-0000-000000000099' })));
  const result = await database.query(`select count(*)::int as count from public.recovery_fixture_events`);
  assert.equal(result.rows[0].count, 3);
});

test('rechaza un brief sobredimensionado antes de confirmar la venta', async () => {
  await assert.rejects(database.query(confirmSql({ key: 'sale-oversize-001', brief: 'x'.repeat(30001) })));
  const result = await database.query(`select count(*)::int as count from public.recovery_fixture_events`);
  assert.equal(result.rows[0].count, 3);
});

test('el POS conserva la clave y protege el payload exacto del abono', () => {
  assert.match(checkout, /localStorage\.setItem\(pendingSaleStorageKey,pendingSaleKey\.current\)/);
  assert.match(checkout, /sessionStorage\.setItem\(pendingSaleSnapshotStorageKey/);
  assert.match(checkout, /p_client_brief_html:clientBriefHtml/);
  assert.match(checkout, /p_parked_order:activeParkedOrderId\|\|null/);
  assert.match(checkout, /savePendingPOSBalancePayment\(organizationId,user\.id,intent\)/);
  assert.match(checkout, /p_idempotency_key:intent\.idempotencyKey/);
  assert.match(paymentRecovery, /window\.localStorage\.setItem\(storageKey,JSON\.stringify\(payment\)\)/);
  assert.doesNotMatch(checkout, /rpc\('save_pos_sale_client_brief'/);
  assert.doesNotMatch(checkout, /rpc\('complete_parked_pos_order'/);
});

test('tras cerrar la pestaña, el Blob y la clave sobreviven en IndexedDB sin usar localStorage', async () => {
  const rows = new Map();
  const store = createPOSSaleAssetRecoveryStore({
    get: async (scopeKey) => rows.get(scopeKey) || null,
    put: async (record) => { rows.set(record.scopeKey, structuredClone(record)); },
    delete: async (scopeKey) => { rows.delete(scopeKey); },
  });
  const file = new File([new Uint8Array([1, 2, 3, 4])], 'referencia.png', { type: 'image/png', lastModified: 1234 });
  const assets = [
    { id: 'image-1', kind: 'image', title: 'Fachada', description: 'Referencia del sitio', file },
    { id: 'link-1', kind: 'link', title: 'Diseño editable', description: 'Versión aprobada', url: 'https://drive.google.com/example' },
  ];

  await store.save('org-1:user-1', assets, 'sale-idempotency-1');
  const recovered = await store.load('org-1:user-1');
  assert.equal(recovered.assets.length, 2);
  assert.equal(recovered.assets[0].file.name, 'referencia.png');
  assert.equal(recovered.assets[0].file.size, 4);
  assert.equal(recovered.assets[1].url, 'https://drive.google.com/example');
  assert.equal(recovered.idempotencyKey, 'sale-idempotency-1', 'la clave sigue asociada a los adjuntos mientras el resultado del servidor es incierto');
  assert.equal(await store.load('org-2:user-1'), null);

  await store.clear('org-1:user-1');
  assert.equal(await store.load('org-1:user-1'), null);
});

test('la venta confirmada se vincula a adjuntos pendientes por la misma clave', () => {
  assert.match(checkout, /posSaleAssetRecovery\.save\(posSaleAssetScopeKey,saleAssets,pendingSaleKey\.current\)/);
  assert.match(checkout, /posSaleAssetRecovery\.load\(posSaleAssetScopeKey\)/);
  assert.match(checkout, /eq\('idempotency_key',loadedKey\)/);
  assert.match(checkout, /persistCommercialAssets\(\{organizationId,documentId:existingSale\.id,kind:'sale',assets:loadedAssets\}\)/);
  assert.doesNotMatch(checkout, /posSaleAssetRecovery\.save\(posSaleAssetScopeKey,stored\.assets,null\)/, 'una consulta negativa no debe soltar la asociación durable a la clave');
  assert.match(checkout, /if\(assetRecovery\.error\).*setPendingSaleRecoveryError/);
  assert.match(checkout, /if\(saleAssets\.length\)\{flash\('Esta orden tiene adjuntos guardados solo en este navegador/);
  assert.match(checkout, /await posSaleAssetRecovery\.save\(posSaleAssetScopeKey,saleAssets,pendingSaleKey\.current\)/);
  assert.match(checkout, /posSaleAssetRecovery\.clear\(posSaleAssetScopeKey\)/);
  assert.doesNotMatch(checkout, /localStorage\.setItem\([^)]*(?:saleAssets|asset|file|blob|preview)/i);
});

test('al faltar el snapshot, restaura adjuntos visibles y protege el reintento con la misma clave', () => {
  // El snapshot completo sigue en sessionStorage; tras cerrar la pestaña puede desaparecer.
  // IndexedDB conserva solo adjuntos y la clave, así que la orden requiere reconstrucción manual.
  // Es almacenamiento del mismo navegador/perfil, no una copia remota; limpiar datos del navegador puede eliminarlo.
  assert.match(checkout, /setSaleAssets\(loadedAssets\)/);
  assert.match(checkout, /<CommercialAssetsEditor value=\{saleAssets\} onChange=\{handleSaleAssetsChange\}/);
  assert.match(checkout, /if\(!pendingKey\)\{pendingSaleKey\.current=loadedKey/);
  assert.match(checkout, /setIdbRecoveredPendingSaleKey\(loadedKey\)/);
  assert.match(checkout, /idbRecoveredPendingSaleKey\]\)/);
  assert.match(checkout, /setPendingSaleSnapshotMissing\(true\)/);
  assert.match(checkout, /setPendingSaleRecoveryMode\(true\);setPendingSaleRecoveryError\(''\);setPendingSaleSnapshotMissing\(true\)/);
  assert.match(checkout, /setPendingSaleSnapshotReviewed\(true\)/);
  assert.match(checkout, /!pendingSaleSnapshotMissing\|\|pendingSaleSnapshotReviewed/);
  assert.match(checkout, /[Rr]econstruye y coteja cliente, artículos, cantidades, descuentos, pagos y datos del trabajo/);
  assert.match(checkout, /if\(existingSale\)\{clearPendingSaleStorage\(\)/);
  assert.match(checkout, /else\{\s*\/\/ A negative lookup is only a point-in-time observation/);
});
