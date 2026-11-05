import test from 'node:test';
import assert from 'node:assert/strict';
import { rankPOSProducts } from '../src/lib/posProductSearch.ts';

const products = [
  { id: 'banner', sku: 'PI001', name: 'Lona brillante 13oz', family: 'Impresión' },
  { id: 'sign', sku: 'SV015', name: 'Señal de seguridad', family: 'Señalética' },
  { id: 'laminate', sku: 'LA001', name: 'Laminado brillante', family: 'Acabados' },
];

test('prioriza el SKU exacto del catálogo sobre coincidencias de texto', () => {
  assert.equal(rankPOSProducts(products, 'PI001', {})[0].id, 'banner');
});

test('acepta palabras parciales en distinto orden y sin tildes', () => {
  assert.deepEqual(rankPOSProducts(products, 'brillante lona', {}).map((item) => item.id), ['banner']);
  assert.deepEqual(rankPOSProducts(products, 'senal seg', {}).map((item) => item.id), ['sign']);
});

test('encuentra el SKU de inventario vinculado y lo prioriza', () => {
  assert.equal(rankPOSProducts(products, 'INV-775', { sign: ['INV-775'] })[0].id, 'sign');
});

test('no devuelve coincidencias parciales de una sola palabra cuando falta otra', () => {
  assert.deepEqual(rankPOSProducts(products, 'lona seguridad', {}), []);
});
