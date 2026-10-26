import { next } from '@vercel/functions';
import { checkManualAccess } from './src/auth/manualAccessGuard.js';

export const config = {
  matcher: ['/manual-aprendizaje/fuente/:path*'],
};

export default async function middleware(request: Request) {
  const result = await checkManualAccess({
    cookieHeader: request.headers.get('cookie') || '',
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    publishableKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  });

  if (!result.allowed) {
    const message = result.status === 401 ? 'Inicia sesión para consultar el material interno.' : result.status === 403 ? 'Tu perfil no tiene acceso a este material.' : 'No pudimos verificar el acceso ahora. Inténtalo nuevamente.';
    return new Response(message, {
      status: result.status,
      headers: {
        'cache-control': 'private, no-store, max-age=0, must-revalidate',
        'content-type': 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  const response = next();
  response.headers.set('cache-control', 'private, no-store, max-age=0, must-revalidate');
  response.headers.set('vary', 'Cookie');
  return response;
}
