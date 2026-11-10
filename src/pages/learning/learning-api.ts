import type { LearningLibrary, LearningQuestion, PantoneColor } from './learning-types';

type LearningResource = 'library' | 'pantone' | 'quiz';

export async function fetchLearningResource<T = LearningLibrary | PantoneColor[] | LearningQuestion[]>(resource: LearningResource, accessToken?: string | null): Promise<T> {
  if (!accessToken) throw new Error('Inicia sesión para consultar el material interno.');
  const response = await fetch(`/api/learning-content?resource=${encodeURIComponent(resource)}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
    cache: 'no-store',
  });
  let payload: unknown;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : 'No pudimos cargar el material de aprendizaje.';
    throw new Error(message);
  }
  return payload as T;
}
