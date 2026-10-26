const MANUAL_ACCESS_ROLES = new Set([
  'admin',
  'manager',
  'advisor',
  'warehouse',
  'production',
  'marketing',
  'website_admin',
]);

export async function checkManualAccess({ cookieHeader, supabaseUrl, publishableKey, fetcher = fetch }) {
  const token = cookieHeader
    ?.split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('vc-manual-session='))
    ?.slice('vc-manual-session='.length);

  if (!token) return { allowed: false, status: 401 };
  if (!supabaseUrl || !publishableKey) return { allowed: false, status: 503 };

  try {
    const response = await fetcher(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/get_my_visualcorp_access`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${decodeURIComponent(token)}`,
        'content-type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(3500),
    });

    if (!response.ok) {
      return { allowed: false, status: response.status === 401 ? 401 : response.status === 403 ? 403 : 503 };
    }

    const access = await response.json();
    const roles = Array.isArray(access?.roles) ? access.roles.map((profile) => profile?.role) : [];
    const allowed = roles.some((role) => MANUAL_ACCESS_ROLES.has(role));
    return { allowed, status: allowed ? 200 : 403 };
  } catch {
    return { allowed: false, status: 503 };
  }
}
