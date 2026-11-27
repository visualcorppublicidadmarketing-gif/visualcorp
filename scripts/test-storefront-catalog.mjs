import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStorefrontQuoteUrl,
  clearStorefrontCatalogState,
  getStorefrontProductGroup,
  getStorefrontSortOrder,
  PUBLIC_CATALOG_SELECT_COLUMNS,
  reconcileStorefrontSelection,
  withStorefrontSortOrder,
} from '../src/public-site/storefrontCatalog.ts';

test('public storefront catalog select excludes private pricing and custom_options columns', () => {
  const columns = PUBLIC_CATALOG_SELECT_COLUMNS.split(',').map((column) => column.trim());
  assert.ok(columns.includes('id'));
  assert.ok(columns.includes('name'));
  assert.ok(columns.includes('slug'));
  assert.ok(columns.includes('images'));
  for (const forbidden of ['price', 'price_inst', 'price_corp', 'price_scales', 'custom_options']) {
    assert.equal(columns.includes(forbidden), false, `Forbidden public column ${forbidden}`);
  }
});

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
