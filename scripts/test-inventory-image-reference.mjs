import assert from 'node:assert/strict';
import test from 'node:test';
import { INVENTORY_REFERENCE_PREFIX, inventoryReferenceObjectPath, normalizeInventoryImagePath } from '../src/lib/inventoryImageReference.mjs';
import { isValidInventoryReference } from '../src/lib/inventorySku.mjs';

const organizationId = '57b8e2ab-9dd3-491b-9402-7176da9ba98c';
const itemId = 'f91e6c4d-6140-4fbd-86ea-002a30f98c51';

test('normalizes a newly uploaded private object key before storing the cover reference', () => {
  const objectKey = `${organizationId}/${itemId}/photo.webp`;
  const normalized = normalizeInventoryImagePath(objectKey, organizationId, itemId);

  assert.equal(normalized, `${INVENTORY_REFERENCE_PREFIX}${objectKey}`);
  assert.equal(inventoryReferenceObjectPath(normalized), objectKey);
  assert.equal(isValidInventoryReference(normalized), true);
});

test('normalizes signed private URLs while preserving public library references', () => {
  const signedUrl = `https://example.supabase.co/storage/v1/object/sign/inventory-reference-images/${organizationId}/${itemId}/photo.webp?token=temporary`;

  assert.equal(normalizeInventoryImagePath(signedUrl, organizationId, itemId), `${INVENTORY_REFERENCE_PREFIX}${organizationId}/${itemId}/photo.webp`);
  assert.equal(normalizeInventoryImagePath('/inventory-reference-library/images/muriatol.webp', organizationId, itemId), '/inventory-reference-library/images/muriatol.webp');
});

test('leaves unknown temporary preview URLs detectable by the existing reference validator', () => {
  assert.equal(normalizeInventoryImagePath('blob:https://visualcorp-suite.vercel.app/preview', organizationId, itemId), 'blob:https://visualcorp-suite.vercel.app/preview');
});
