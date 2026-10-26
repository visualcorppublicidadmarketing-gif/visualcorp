import assert from 'node:assert/strict';
import test from 'node:test';
import { checkManualAccess } from '../src/auth/manualAccessGuard.js';

const base = { supabaseUrl: 'https://example.supabase.co', publishableKey: 'public-key' };

test('blocks requests without the short-lived manual session cookie', async () => {
  const result = await checkManualAccess({ ...base, cookieHeader: '' });
  assert.deepEqual(result, { allowed: false, status: 401 });
});

test('allows only profiles with an internal operations or website role', async () => {
  const result = await checkManualAccess({
    ...base,
    cookieHeader: 'other=value; vc-manual-session=access-token',
    fetcher: async (_url, options) => {
      assert.equal(options.headers.authorization, 'Bearer access-token');
      assert.equal(options.headers.apikey, base.publishableKey);
      return Response.json({ roles: [{ role: 'advisor' }] });
    },
  });
  assert.deepEqual(result, { allowed: true, status: 200 });
});

test('denies authenticated profiles outside the manual roles', async () => {
  const result = await checkManualAccess({
    ...base,
    cookieHeader: 'vc-manual-session=access-token',
    fetcher: async () => Response.json({ roles: [{ role: 'customer' }] }),
  });
  assert.deepEqual(result, { allowed: false, status: 403 });
});

test('fails closed when Supabase cannot verify the current profile', async () => {
  const result = await checkManualAccess({
    ...base,
    cookieHeader: 'vc-manual-session=access-token',
    fetcher: async () => { throw new Error('unavailable'); },
  });
  assert.deepEqual(result, { allowed: false, status: 503 });
});
