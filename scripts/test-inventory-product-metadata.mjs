import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inventoryBaseUnitSuggestions,
  inventoryCategoryCode,
  inventorySpecificationSuggestions,
  inventoryTagSuggestions,
  inventoryTypeSuggestions,
  inventoryVariantSpecificationValues,
  normalizeInventoryCategoryName,
  normalizeInventoryProductMetadata,
} from '../src/lib/inventoryProductMetadata.mjs';

test('normalizes editable product fields while leaving identity fields outside the payload', () => {
  assert.deepEqual(normalizeInventoryProductMetadata({
    name: '  Alucobond Negro  ',
    category: ' Materiales ',
    variant: ' Negro 3 mm ',
    minimum: '2.5',
  }), {
    name: 'Alucobond Negro',
    category: 'Materiales',
    categoryCode: 'CAT-MATERIALES',
    variant: 'Negro 3 mm',
    minimum: 2.5,
  });
});

test('matches category labels regardless of case and accents, and creates safe category codes', () => {
  assert.equal(normalizeInventoryCategoryName('  Láser   y  tintas '), 'laser y tintas');
  assert.equal(inventoryCategoryCode('Sublimación / Tintas'), 'CAT-SUBLIMACION-TINTAS');
  assert.equal(inventoryCategoryCode('   '), '');
});

test('rejects an empty product name and invalid minimum quantity', () => {
  assert.throws(() => normalizeInventoryProductMetadata({ name: ' ', category: '', variant: '', minimum: '0' }), /nombre del producto/i);
  assert.throws(() => normalizeInventoryProductMetadata({ name: 'Producto', category: '', variant: '', minimum: '' }), /mínimo/i);
  assert.throws(() => normalizeInventoryProductMetadata({ name: 'Producto', category: '', variant: '', minimum: '-1' }), /mínimo/i);
  assert.throws(() => normalizeInventoryProductMetadata({ name: 'Producto', category: '', variant: '', minimum: '1e20' }), /mínimo/i);
});

test('offers useful inventory types and a sensible Alucobond classification without assigning it automatically', () => {
  const types = inventoryTypeSuggestions([]);
  const tags = inventoryTagSuggestions([]);
  assert.ok(types.includes('Material'));
  assert.ok(types.includes('Sustrato de impresión'));
  assert.ok(tags.includes('alucobond'));
  assert.ok(tags.includes('panel compuesto de aluminio'));
});

test('keeps custom unit, finish, color, material and base-unit values in organization suggestions after reload', () => {
  const savedItems = [{
    unit: 'plancha',
    variantAttributes: { purchase_unit: 'Bidón', finish: 'Satinado', color: 'Azul marino', material: 'ACM 3 mm' },
    customFields: { purchase_unit: 'Bidón', finish: 'Satín' },
  }];
  assert.ok(inventorySpecificationSuggestions(savedItems, 'purchase_unit').includes('Bidón'));
  assert.ok(inventorySpecificationSuggestions(savedItems, 'finish').includes('Satinado'));
  assert.ok(inventorySpecificationSuggestions(savedItems, 'color').includes('Azul marino'));
  assert.ok(inventorySpecificationSuggestions(savedItems, 'material').includes('ACM 3 mm'));
  assert.ok(inventoryBaseUnitSuggestions(savedItems).includes('plancha'));
  assert.equal(inventorySpecificationSuggestions(savedItems, 'purchase_unit').filter((value) => value.toLowerCase() === 'bidón').length, 1);
});

test('uses item-level specifications as an editor fallback without replacing variant-specific values', () => {
  assert.deepEqual(inventoryVariantSpecificationValues(
    { finish: 'Mate', width_cm: 107 },
    { finish: 'Brillante', color: 'Azul', purchase_unit: 'Caja', width_cm: 127 },
  ), {
    finish: 'Mate',
    width_cm: 107,
    color: 'Azul',
    purchase_unit: 'Caja',
  });
});
