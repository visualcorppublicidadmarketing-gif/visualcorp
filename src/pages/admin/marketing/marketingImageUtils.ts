const MAX_IMAGE_EDGE = 2200;
const WEBP_SOURCE_TYPES = new Set([
  'image/avif',
  'image/bmp',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export type PreparedMarketingImage = {
  file: File;
  width: number | null;
  height: number | null;
  optimized: boolean;
};

function canvasToWebp(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84));
}

/** Shrinks supported raster images in the browser while retaining the original when WebP is larger. */
export async function prepareMarketingImage(source: File): Promise<PreparedMarketingImage> {
  if (!WEBP_SOURCE_TYPES.has(source.type)) {
    return { file: source, width: null, height: null, optimized: false };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    return { file: source, width: null, height: null, optimized: false };
  }

  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(originalWidth, originalHeight));
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    bitmap.close();
    return { file: source, width: originalWidth, height: originalHeight, optimized: false };
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvasToWebp(canvas);
  if (!blob || blob.type !== 'image/webp' || blob.size >= source.size) {
    return { file: source, width: originalWidth, height: originalHeight, optimized: false };
  }

  const stem = source.name.replace(/\.[^.]+$/, '') || 'imagen-publicacion';
  const file = new File([blob], `${stem}.webp`, { type: 'image/webp', lastModified: source.lastModified || Date.now() });
  return { file, width, height, optimized: true };
}

export function formatMarketingFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${bytes} B`;
}
