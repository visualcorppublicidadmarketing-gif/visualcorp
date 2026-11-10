import { checkManualAccess } from '../../src/auth/manualAccessGuard.js';

const privateHeaders = {
  'cache-control': 'private, no-store, max-age=0, must-revalidate',
  'content-type': 'application/json; charset=utf-8',
  'vary': 'Authorization',
  'x-content-type-options': 'nosniff',
};

export function createLearningContentHandler({ env, fetcher = fetch, loadResource }) {
  return async function handleLearningContent(request) {
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Método no permitido.' }), {
        status: 405,
        headers: { ...privateHeaders, allow: 'GET' },
      });
    }

    const access = await checkManualAccess({
      authorization: request.headers.get('authorization') || '',
      supabaseUrl: env.VITE_SUPABASE_URL,
      publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY,
      fetcher,
    });
    if (!access.allowed) {
      const message = access.status === 401
        ? 'Inicia sesión para consultar el material interno.'
        : access.status === 403
          ? 'Tu perfil no tiene acceso a este material.'
          : 'No pudimos verificar el acceso ahora. Inténtalo nuevamente.';
      return new Response(JSON.stringify({ error: message }), {
        status: access.status,
        headers: privateHeaders,
      });
    }

    const resource = new URL(request.url).searchParams.get('resource') || 'library';
    if (!['library', 'pantone', 'quiz'].includes(resource)) {
      return new Response(JSON.stringify({ error: 'Este recurso no está disponible.' }), {
        status: 404,
        headers: privateHeaders,
      });
    }

    try {
      const payload = await loadResource(resource);
      return new Response(JSON.stringify(payload), { status: 200, headers: privateHeaders });
    } catch {
      return new Response(JSON.stringify({ error: 'No pudimos cargar el material de aprendizaje.' }), {
        status: 503,
        headers: privateHeaders,
      });
    }
  };
}
