import test from 'node:test';
import assert from 'node:assert/strict';
import { isInventoryItemSkuConflict, isRecoverableInventoryItem, isValidInventoryReference, nextInventorySku } from '../src/lib/inventorySku.mjs';

test('continues from the highest SKU loaded from the current database state', () => {
  assert.equal(nextInventorySku('VC-INV-TAL-', ['VC-INV-TAL-001', 'VC-INV-TAL-011'], []), 'VC-INV-TAL-012');
});

test('skips a variant SKU that would collide with the new base variant', () => {
  assert.equal(nextInventorySku('VC-INV-TAL-', ['VC-INV-TAL-011'], ['VC-INV-TAL-012-01']), 'VC-INV-TAL-013');
});

test('ignores unrelated and differently shaped codes', () => {
  assert.equal(nextInventorySku('VC-INV-TAL-', ['VC-INV-IMP-040', 'VC-INV-TAL-ABC'], []), 'VC-INV-TAL-001');
});

test('identifies only the inventory item SKU unique violation for automatic retry', () => {
  assert.equal(isInventoryItemSkuConflict({ code: '23505', constraint: 'inventory_items_organization_id_sku_key' }), true);
  assert.equal(isInventoryItemSkuConflict({ code: '23505', constraint: 'inventory_categories_organization_id_code_key' }), false);
  assert.equal(isInventoryItemSkuConflict({ code: '23514', message: 'inventory_items_organization_id_sku_key' }), false);
});

test('recovers only a recent incomplete row owned by the same user, area and brand', () => {
  const now = Date.parse('2026-10-31T20:00:00Z');
  const row = {
    area_id: 'taller-id',
    created_at: '2026-10-31T19:50:00Z',
    created_by: 'esteban-id',
    custom_fields: { brand_scope: 'visual' },
    sku: 'VC-INV-TAL-011',
  };
  const context = { userId: 'esteban-id', areaId: 'taller-id', brandScope: 'visual', now };
  assert.equal(isRecoverableInventoryItem(row, context), true);
  assert.equal(isRecoverableInventoryItem(row, { ...context, userId: 'someone-else' }), false);
  assert.equal(isRecoverableInventoryItem(row, { ...context, areaId: 'laser-id' }), false);
  assert.equal(isRecoverableInventoryItem(row, { ...context, brandScope: 'giga' }), false);
  assert.equal(isRecoverableInventoryItem(row, { ...context, requestedSku: 'VC-INV-TAL-012' }), false);
  assert.equal(isRecoverableInventoryItem({ ...row, created_at: '2026-10-29T19:50:00Z' }, context), false);
});

test('accepts the public and private reference image formats already allowed by the database', () => {
  assert.equal(isValidInventoryReference('/inventory-reference-library/images/muriatol.webp'), true);
  assert.equal(isValidInventoryReference('inventory-reference-images://org/item/photo.webp'), true);
  assert.equal(isValidInventoryReference('/inventory/VC-INV-TAL-011.webp'), true);
  assert.equal(isValidInventoryReference('https://example.com/product.webp'), true);
  assert.equal(isValidInventoryReference('javascript:alert(1)'), false);
});
