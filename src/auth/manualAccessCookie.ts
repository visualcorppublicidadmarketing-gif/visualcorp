const COOKIE_NAME = 'vc-manual-session';
const COOKIE_PATH = '/manual-aprendizaje/fuente';
const COOKIE_MAX_AGE_SECONDS = 120;
const INTERNAL_ROLES = new Set(['admin', 'manager', 'advisor', 'warehouse', 'production', 'marketing', 'website_admin']);

function clearManualAccessCookie() {
  document.cookie = `${COOKIE_NAME}=; Path=${COOKIE_PATH}; Max-Age=0; SameSite=Strict; Secure`;
}

export function syncManualAccessCookie(session: any, roles: string[]) {
  if (typeof document === 'undefined') return;
  const hasAllowedRole = roles.some((role) => INTERNAL_ROLES.has(role));
  const expiresIn = Number(session?.expires_at) - Math.floor(Date.now() / 1000);
  if (!session?.access_token || !hasAllowedRole || expiresIn <= 0) {
    clearManualAccessCookie();
    return;
  }

  const maxAge = Math.min(COOKIE_MAX_AGE_SECONDS, expiresIn);
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(session.access_token)}; Path=${COOKIE_PATH}; Max-Age=${maxAge}; SameSite=Strict${secure}`;
}
