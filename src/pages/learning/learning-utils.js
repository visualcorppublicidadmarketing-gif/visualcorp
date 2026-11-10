export function normalizeSearch(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}

export function resolveLearningRoute(pathname, basePath) {
  const tail = String(pathname || '').replace(basePath, '').replace(/^\/+|\/+$/g, '');
  if (!tail) return { type: 'home' };
  const [collection, id] = tail.split('/');
  if (collection === 'areas' && id) return { type: 'area', id };
  if (collection === 'guias' && id) return { type: 'guide', id };
  if (collection === 'practicas' && id) return { type: 'practice', id };
  return { type: 'not-found' };
}

export function calculateArea(width, height, quantity = 1) {
  const values = [Number(width), Number(height), Number(quantity)];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  const perPiece = values[0] * values[1];
  return { perPiece, total: perPiece * values[2], quantity: values[2] };
}

export function estimateVisibility(letterHeightCm) {
  const height = Number(letterHeightCm);
  if (!Number.isFinite(height) || height <= 0) return null;
  return { suggested: height * 3, limit: height * 4.5 };
}

export function progressPercent(done, total) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.round((Math.min(Math.max(done, 0), total) / total) * 100);
}

export function nextRovingTabIndex(currentIndex, key, itemCount) {
  if (!Number.isInteger(itemCount) || itemCount <= 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return itemCount - 1;
  if (key === 'ArrowRight') return (Math.max(0, currentIndex) + 1) % itemCount;
  if (key === 'ArrowLeft') return (Math.max(0, currentIndex) - 1 + itemCount) % itemCount;
  return null;
}
