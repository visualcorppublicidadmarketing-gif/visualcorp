import type {
  DesignLayer,
  LayerBlendMode,
  LayerClipShape,
  PrintArea,
  ProductAppearance,
  ProductBase,
  SceneBackground,
  SurfaceWarpMode,
} from './types';
import { getMugWrapSettings } from './mug-wrap';

export function loadCanvasImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo leer una de las imágenes del diseño.'));
    image.src = src;
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return [21, 38, 74];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function blendModeToCompositeOp(mode?: LayerBlendMode): GlobalCompositeOperation {
  if (mode === 'multiply') return 'multiply';
  if (mode === 'screen') return 'screen';
  return 'source-over';
}

export function drawSceneBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: SceneBackground,
  bgImage?: HTMLImageElement | null,
  drawTransparencyGrid = false,
) {
  context.save();
  if (background.kind === 'transparent') {
    context.clearRect(0, 0, width, height);
    if (drawTransparencyGrid) {
      const cell = Math.max(12, Math.round(width / 28));
      for (let y = 0; y < height; y += cell) {
        for (let x = 0; x < width; x += cell) {
          context.fillStyle = ((Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0) ? '#2a2b36' : '#1f2029';
          context.fillRect(x, y, cell, cell);
        }
      }
    }
    context.restore();
    return;
  }

  if (background.kind === 'solid') {
    context.fillStyle = background.color;
    context.fillRect(0, 0, width, height);
    context.restore();
    return;
  }

  if (background.kind === 'studio-light') {
    const grad = context.createRadialGradient(width * 0.5, height * 0.36, width * 0.08, width * 0.5, height * 0.5, Math.max(width, height) * 0.78);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, background.color || '#f4f2f8');
    grad.addColorStop(1, background.color2 || '#dcd7e8');
    context.fillStyle = grad;
    context.fillRect(0, 0, width, height);
    context.restore();
    return;
  }

  if (background.kind === 'studio-dark') {
    const grad = context.createRadialGradient(width * 0.5, height * 0.32, width * 0.06, width * 0.5, height * 0.52, Math.max(width, height) * 0.78);
    grad.addColorStop(0, background.color || '#333648');
    grad.addColorStop(0.62, '#1c1d28');
    grad.addColorStop(1, background.color2 || '#10111a');
    context.fillStyle = grad;
    context.fillRect(0, 0, width, height);
    context.restore();
    return;
  }

  if (background.kind === 'image' && bgImage && bgImage.naturalWidth > 0) {
    const imgRatio = bgImage.naturalWidth / bgImage.naturalHeight;
    const targetRatio = width / Math.max(1, height);
    let sx = 0;
    let sy = 0;
    let sw = bgImage.naturalWidth;
    let sh = bgImage.naturalHeight;
    if (imgRatio > targetRatio) {
      sw = bgImage.naturalHeight * targetRatio;
      sx = (bgImage.naturalWidth - sw) / 2;
    } else {
      sh = bgImage.naturalWidth / targetRatio;
      sy = (bgImage.naturalHeight - sh) / 2;
    }
    context.drawImage(bgImage, sx, sy, sw, sh, 0, 0, width, height);
    context.restore();
    return;
  }

  // gradient fallback
  const rad = ((background.angle ?? 135) * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  const halfDiag = Math.hypot(width, height) / 2;
  const dx = Math.cos(rad) * halfDiag;
  const dy = Math.sin(rad) * halfDiag;
  const grad = context.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  grad.addColorStop(0, background.color || '#1b1133');
  grad.addColorStop(1, background.color2 || '#8a0f5c');
  context.fillStyle = grad;
  context.fillRect(0, 0, width, height);
  context.restore();
}

type PreparedProductEntry = {
  canvas: HTMLCanvasElement;
  touchedAt: number;
};

const productCanvasCache = new Map<string, PreparedProductEntry>();

function pruneProductCache() {
  if (productCanvasCache.size <= 10) return;
  const entries = [...productCanvasCache.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt);
  for (let i = 0; i < entries.length - 8; i += 1) {
    productCanvasCache.delete(entries[i][0]);
  }
}

/**
 * Extracts studio white backdrop (via edge flood-fill when opaque white)
 * and optionally applies luminance-preserving product color tinting.
 */
export function buildProcessedProductCanvas(
  sourceImage: HTMLImageElement,
  srcKey: string,
  appearance: ProductAppearance,
  extractBackdrop: boolean,
  maxDimension = 960,
): HTMLCanvasElement {
  const needsRecolor = appearance.mode === 'custom';
  const cacheKey = `${srcKey}|${needsRecolor ? appearance.color : 'orig'}|${extractBackdrop ? 'cut' : 'full'}|${maxDimension}`;
  const cached = productCanvasCache.get(cacheKey);
  if (cached) {
    cached.touchedAt = Date.now();
    return cached.canvas;
  }

  const natW = Math.max(1, sourceImage.naturalWidth);
  const natH = Math.max(1, sourceImage.naturalHeight);
  const scale = Math.min(1, maxDimension / Math.max(natW, natH));
  const w = Math.max(1, Math.round(natW * scale));
  const h = Math.max(1, Math.round(natH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.drawImage(sourceImage, 0, 0, w, h);

  if (!needsRecolor && !extractBackdrop) {
    productCanvasCache.set(cacheKey, { canvas, touchedAt: Date.now() });
    pruneProductCache();
    return canvas;
  }

  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(0, 0, w, h);
  } catch {
    return canvas;
  }

  const data = imgData.data;
  const total = w * h;

  // Check if corners already have transparency
  const cornerIdx = [0, w - 1, (h - 1) * w, total - 1];
  const alreadyTransparent = cornerIdx.some((i) => data[i * 4 + 3] < 220);

  const isBg = new Uint8Array(total);
  const isNearWhite = (idx: number) => {
    const p = idx * 4;
    if (data[p + 3] < 24) return true;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    return minC > 228 && (maxC - minC) < 24;
  };

  if (!alreadyTransparent) {
    const whiteCorners = cornerIdx.filter((i) => isNearWhite(i)).length;
    if (whiteCorners >= 2) {
      const queue = new Int32Array(total);
      let head = 0;
      let tail = 0;
      const trySeed = (idx: number) => {
        if (!isBg[idx] && isNearWhite(idx)) {
          isBg[idx] = 1;
          queue[tail++] = idx;
        }
      };
      for (let x = 0; x < w; x += 1) {
        trySeed(x);
        trySeed((h - 1) * w + x);
      }
      for (let y = 0; y < h; y += 1) {
        trySeed(y * w);
        trySeed(y * w + (w - 1));
      }
      while (head < tail) {
        const cur = queue[head++];
        const cx = cur % w;
        const cy = (cur - cx) / w;
        if (cx > 0) trySeed(cur - 1);
        if (cx < w - 1) trySeed(cur + 1);
        if (cy > 0) trySeed(cur - w);
        if (cy < h - 1) trySeed(cur + w);
      }
    }
  } else {
    for (let i = 0; i < total; i += 1) {
      if (data[i * 4 + 3] < 16) isBg[i] = 1;
    }
  }

  // If extracting backdrop, soften 1-pixel fringe and make background transparent
  if (extractBackdrop) {
    for (let i = 0; i < total; i += 1) {
      if (isBg[i]) {
        data[i * 4 + 3] = 0;
      } else {
        const cx = i % w;
        const cy = (i - cx) / w;
        const touchesBg =
          (cx > 0 && isBg[i - 1]) ||
          (cx < w - 1 && isBg[i + 1]) ||
          (cy > 0 && isBg[i - w]) ||
          (cy < h - 1 && isBg[i + w]);
        if (touchesBg) {
          const p = i * 4;
          const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
          if (lum > 205) {
            data[p + 3] = Math.round(data[p + 3] * clamp((255 - lum) / 50, 0.08, 1));
          }
        }
      }
    }
  }

  if (needsRecolor) {
    // Compute luminance histogram of foreground pixels to preserve folds/speculars accurately
    const hist = new Uint32Array(256);
    let fgCount = 0;
    for (let i = 0; i < total; i += 1) {
      if (isBg[i] || data[i * 4 + 3] < 30) continue;
      const p = i * 4;
      const lum = Math.min(255, Math.round(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]));
      hist[lum] += 1;
      fgCount += 1;
    }

    let pLow = 18;
    let pHigh = 210;
    if (fgCount > 100) {
      let acc = 0;
      for (let v = 0; v < 256; v += 1) {
        acc += hist[v];
        if (acc >= fgCount * 0.06) {
          pLow = v;
          break;
        }
      }
      acc = 0;
      for (let v = 0; v < 256; v += 1) {
        acc += hist[v];
        if (acc >= fgCount * 0.94) {
          pHigh = v;
          break;
        }
      }
    }
    const range = Math.max(36, pHigh - pLow);
    const [tr, tg, tb] = hexToRgb(appearance.color);
    const targetLum = (0.299 * tr + 0.587 * tg + 0.114 * tb) / 255;

    for (let i = 0; i < total; i += 1) {
      if (isBg[i] || data[i * 4 + 3] < 20) continue;
      const p = i * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const norm = clamp((lum - pLow) / range, 0, 1.35);

      // Gentle S-curve shading so folds look crisp on both dark and light target colors
      const shadowFloor = targetLum > 0.72 ? 0.56 : targetLum < 0.22 ? 0.24 : 0.36;
      const shade = shadowFloor + (1 - shadowFloor) * Math.pow(clamp(norm, 0, 1), 0.88);
      const specular = norm > 0.92 ? clamp((norm - 0.92) / 0.43, 0, 1) * 0.62 : 0;

      data[p] = clamp(Math.round(tr * shade + (255 - tr * shade) * specular), 0, 255);
      data[p + 1] = clamp(Math.round(tg * shade + (255 - tg * shade) * specular), 0, 255);
      data[p + 2] = clamp(Math.round(tb * shade + (255 - tb * shade) * specular), 0, 255);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  productCanvasCache.set(cacheKey, { canvas, touchedAt: Date.now() });
  pruneProductCache();
  return canvas;
}

function wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const paragraphs = value.split(/\n/);
  const lines: string[] = [];

  paragraphs.forEach((paragraph) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      return;
    }
    let line = '';
    words.forEach((word) => {
      const nextLine = line ? `${line} ${word}` : word;
      if (line && context.measureText(nextLine).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = nextLine;
      }
    });
    if (line) lines.push(line);
  });

  return lines;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function applyClipPath(
  ctx: CanvasRenderingContext2D,
  clipShape: LayerClipShape | undefined,
  w: number,
  h: number,
) {
  if (!clipShape || clipShape === 'none') return;
  if (clipShape === 'circle') {
    const r = Math.min(w, h) / 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
  } else if (clipShape === 'pill') {
    drawRoundedRectPath(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) / 2);
    ctx.clip();
  } else if (clipShape === 'rounded') {
    drawRoundedRectPath(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.16);
    ctx.clip();
  }
}

function drawStarPath(ctx: CanvasRenderingContext2D, outerR: number, innerR: number, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawCurvedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  radius: number,
  curveDegrees: number,
  strokeWidth: number,
  strokeColor: string,
  letterSpacing: number,
) {
  const chars = [...text];
  if (!chars.length) return;
  const isRainbow = curveDegrees >= 0;
  const effectiveRadius = Math.max(24, radius);
  const widths = chars.map((ch) => ctx.measureText(ch).width + letterSpacing);
  const totalWidth = widths.reduce((sum, item) => sum + item, 0);
  const totalAngle = totalWidth / effectiveRadius;

  ctx.save();
  if (isRainbow) {
    // Top arch: circle center below text, left-to-right clockwise from -totalAngle/2 to +totalAngle/2
    ctx.translate(0, effectiveRadius);
    let angleCursor = -totalAngle / 2;
    chars.forEach((ch, idx) => {
      const cw = widths[idx];
      const charAngle = angleCursor + (cw / 2) / effectiveRadius;
      ctx.save();
      ctx.rotate(charAngle);
      ctx.translate(0, -effectiveRadius);
      if (strokeWidth > 0) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(ch, 0, 0);
      }
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      angleCursor += cw / effectiveRadius;
    });
  } else {
    // Bottom smile arch: circle center above text, left-to-right counter-clockwise from +totalAngle/2 to -totalAngle/2, upright
    ctx.translate(0, -effectiveRadius);
    let angleCursor = totalAngle / 2;
    chars.forEach((ch, idx) => {
      const cw = widths[idx];
      const charAngle = angleCursor - (cw / 2) / effectiveRadius;
      ctx.save();
      ctx.rotate(charAngle);
      ctx.translate(0, effectiveRadius);
      if (strokeWidth > 0) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(ch, 0, 0);
      }
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      angleCursor -= cw / effectiveRadius;
    });
  }
  ctx.restore();
}

function drawSpacedTextLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  y: number,
  maxWidth: number,
  letterSpacing: number,
  strokeWidth: number,
  strokeColor: string,
) {
  if (!letterSpacing) {
    if (strokeWidth > 0) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineJoin = 'round';
      ctx.strokeText(line, 0, y, maxWidth);
    }
    ctx.fillText(line, 0, y, maxWidth);
    return;
  }

  const chars = [...line];
  const total = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) + letterSpacing * Math.max(0, chars.length - 1);
  let cursor = -total / 2;
  chars.forEach((ch) => {
    const cw = ctx.measureText(ch).width;
    const cx = cursor + cw / 2;
    if (strokeWidth > 0) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineJoin = 'round';
      ctx.strokeText(ch, cx, y);
    }
    ctx.fillText(ch, cx, y);
    cursor += cw + letterSpacing;
  });
}

export async function drawDesignLayers(
  context: CanvasRenderingContext2D,
  layers: DesignLayer[],
  width: number,
  height: number,
  printArea: PrintArea,
) {
  const imageSources = [...new Set(layers.filter((layer) => layer.visible && layer.kind === 'image' && layer.src).map((layer) => layer.src!))];
  const images = await Promise.all(imageSources.map(async (src) => [src, await loadCanvasImage(src)] as const));
  const imageBySource = new Map(images);

  context.save();
  context.beginPath();
  context.rect(
    (printArea.x / 100) * width,
    (printArea.y / 100) * height,
    (printArea.width / 100) * width,
    (printArea.height / 100) * height,
  );
  context.clip();

  layers.forEach((layer) => {
    if (!layer.visible) return;
    const centerX = (layer.x / 100) * width;
    const centerY = (layer.y / 100) * height;
    const elementWidth = (layer.size / 100) * width * (layer.scaleX ?? 1);
    const aspectScaleY = layer.scaleY ?? 1;
    const strokeWidthPx = (layer.strokeWidth ?? 0) * (width / 640);
    const strokeColor = layer.strokeColor || '#000000';

    context.save();
    context.translate(centerX, centerY);
    context.rotate((layer.rotation * Math.PI) / 180);
    context.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
    context.globalAlpha = clamp(layer.opacity, 0, 100) / 100;
    context.globalCompositeOperation = blendModeToCompositeOp(layer.blendMode);

    if (layer.kind === 'image' && layer.src) {
      const image = imageBySource.get(layer.src);
      if (image) {
        const imageHeight = elementWidth * (image.naturalHeight / Math.max(1, image.naturalWidth)) * aspectScaleY;
        context.save();
        applyClipPath(context, layer.clipShape, elementWidth, imageHeight);
        context.drawImage(image, -elementWidth / 2, -imageHeight / 2, elementWidth, imageHeight);
        context.restore();
      }
    } else if (layer.kind === 'text') {
      const fontSize = Math.max(14, elementWidth * 0.25);
      const weight = layer.fontWeight === 'normal' ? '500' : '800';
      context.fillStyle = layer.color;
      context.font = `${weight} ${fontSize}px "${layer.fontFamily || 'DM Sans'}", Arial, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      if (layer.textShadow) {
        context.shadowColor = 'rgba(0, 0, 0, 0.48)';
        context.shadowBlur = Math.max(4, fontSize * 0.24);
        context.shadowOffsetY = Math.max(1, fontSize * 0.07);
      }
      const spacing = (layer.letterSpacing ?? 0) * (width / 640);
      const textCurve = layer.textCurve ?? 0;
      const rawText = layer.text || '';

      if (Math.abs(textCurve) >= 4 && !rawText.includes('\n')) {
        const radius = Math.max(elementWidth * 0.35, elementWidth * (110 / Math.max(12, Math.abs(textCurve))) * 0.42);
        drawCurvedText(context, rawText, radius, textCurve, strokeWidthPx, strokeColor, spacing);
      } else {
        const lines = wrapText(context, rawText, elementWidth * 0.96);
        const lineHeight = fontSize * 1.18;
        lines.forEach((line, index) => {
          const ly = (index - (lines.length - 1) / 2) * lineHeight;
          drawSpacedTextLine(context, line, ly, elementWidth, spacing, strokeWidthPx, strokeColor);
        });
      }
    } else {
      context.fillStyle = layer.color;
      context.strokeStyle = strokeColor;
      context.lineWidth = strokeWidthPx;
      context.lineJoin = 'round';
      const defaultAspect =
        layer.kind === 'circle' || layer.kind === 'star'
          ? 1
          : layer.kind === 'triangle'
            ? 0.86
            : layer.kind === 'line'
              ? 0.08
              : 0.56;
      const elementHeight = Math.max(4, elementWidth * defaultAspect * aspectScaleY);

      if (layer.kind === 'circle') {
        context.beginPath();
        context.ellipse(0, 0, elementWidth / 2, elementHeight / 2, 0, 0, Math.PI * 2);
        context.fill();
        if (strokeWidthPx > 0) context.stroke();
      } else if (layer.kind === 'triangle') {
        context.beginPath();
        context.moveTo(0, -elementHeight / 2);
        context.lineTo(elementWidth / 2, elementHeight / 2);
        context.lineTo(-elementWidth / 2, elementHeight / 2);
        context.closePath();
        context.fill();
        if (strokeWidthPx > 0) context.stroke();
      } else if (layer.kind === 'star') {
        drawStarPath(context, elementWidth / 2, elementWidth * 0.22, 5);
        context.fill();
        if (strokeWidthPx > 0) context.stroke();
      } else if (layer.kind === 'badge') {
        drawRoundedRectPath(context, -elementWidth / 2, -elementHeight / 2, elementWidth, elementHeight, elementHeight / 2);
        context.fill();
        if (strokeWidthPx > 0) context.stroke();
      } else if (layer.kind === 'line') {
        drawRoundedRectPath(context, -elementWidth / 2, -elementHeight / 2, elementWidth, elementHeight, elementHeight / 2);
        context.fill();
      } else {
        const radius = clamp((layer.cornerRadius ?? 10) * (width / 640), 0, Math.min(elementWidth, elementHeight) / 2);
        drawRoundedRectPath(context, -elementWidth / 2, -elementHeight / 2, elementWidth, elementHeight, radius);
        context.fill();
        if (strokeWidthPx > 0) context.stroke();
      }
    }

    context.restore();
  });

  context.restore();
}

/**
 * Draws an unwarped print-area canvas onto the mockup canvas with shape adaptation
 * (cylindrical mug/bottle wrap, spherical cap dome, or subtle perspective tilt).
 */
export function drawWarpedArtworkCanvas(
  context: CanvasRenderingContext2D,
  artCanvas: HTMLCanvasElement,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  warpMode: SurfaceWarpMode,
  warpStrength: number,
) {
  const strength = clamp(warpStrength, 0, 100) / 100;
  if (warpMode === 'flat' || strength < 0.02) {
    context.drawImage(artCanvas, destX, destY, destW, destH);
    return;
  }

  const slices = 64;
  const srcW = artCanvas.width;
  const srcH = artCanvas.height;

  context.save();
  if (warpMode === 'cylinder') {
    const maxAngle = 0.35 + strength * 0.88; // radians half-span
    const sinMax = Math.sin(maxAngle);
    const bowY = destH * 0.11 * strength;

    for (let i = 0; i < slices; i += 1) {
      const t0 = (i / slices) * 2 - 1;
      const t1 = ((i + 1) / slices) * 2 - 1;
      const tm = (t0 + t1) / 2;

      const x0 = destX + destW * 0.5 * (1 + Math.sin(t0 * maxAngle) / sinMax);
      const x1 = destX + destW * 0.5 * (1 + Math.sin(t1 * maxAngle) / sinMax);
      const sliceW = Math.max(0.8, x1 - x0 + 0.65);

      const cosM = Math.cos(tm * maxAngle);
      const yOffset = (1 - cosM) * bowY;
      const sx = (i / slices) * srcW;
      const sw = srcW / slices;

      context.drawImage(artCanvas, sx, 0, sw, srcH, x0, destY + yOffset, sliceW, destH);

      // Subtle cylindrical edge shading so art settles onto curved mug/bottle
      const shadeAlpha = (1 - cosM) * 0.34 * strength;
      if (shadeAlpha > 0.01) {
        context.save();
        context.globalCompositeOperation = 'source-atop';
        context.fillStyle = `rgba(8, 12, 24, ${shadeAlpha.toFixed(3)})`;
        context.fillRect(x0, destY + yOffset, sliceW, destH);
        context.restore();
      }
    }
  } else if (warpMode === 'dome') {
    const maxAngle = 0.28 + strength * 0.72;
    const sinMax = Math.sin(maxAngle);
    const archY = destH * 0.14 * strength;

    for (let i = 0; i < slices; i += 1) {
      const t0 = (i / slices) * 2 - 1;
      const t1 = ((i + 1) / slices) * 2 - 1;
      const tm = (t0 + t1) / 2;

      const x0 = destX + destW * 0.5 * (1 + Math.sin(t0 * maxAngle) / sinMax);
      const x1 = destX + destW * 0.5 * (1 + Math.sin(t1 * maxAngle) / sinMax);
      const sliceW = Math.max(0.8, x1 - x0 + 0.65);

      const cosM = Math.cos(tm * maxAngle);
      const dy = -(cosM - Math.cos(maxAngle)) * archY;
      const sliceH = destH * (0.9 + 0.1 * cosM);
      const sx = (i / slices) * srcW;
      const sw = srcW / slices;

      context.drawImage(artCanvas, sx, 0, sw, srcH, x0, destY + dy + (destH - sliceH) * 0.5, sliceW, sliceH);
    }
  } else if (warpMode === 'perspective') {
    // Horizontal strips tapering slightly toward top for angled A-frames / stands
    const taper = 0.14 * strength;
    for (let i = 0; i < slices; i += 1) {
      const ty = i / slices;
      const scaleW = (1 - taper) + taper * ty;
      const rowW = destW * scaleW;
      const rowX = destX + (destW - rowW) * 0.5;
      const rowY = destY + ty * destH;
      const rowH = destH / slices + 0.65;
      const sy = ty * srcH;
      const sh = srcH / slices;
      context.drawImage(artCanvas, 0, sy, srcW, sh, rowX, rowY, rowW, rowH);
    }
  }
  context.restore();
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo preparar el lienzo para exportar.');
  return { canvas, context };
}

export async function createArtworkCanvas(product: ProductBase, layers: DesignLayer[], width = 1024) {
  const sourceHeight = Math.max(1, Math.round(width / product.ratio));
  const cropX = Math.round((product.printArea.x / 100) * width);
  const cropY = Math.round((product.printArea.y / 100) * sourceHeight);
  const cropWidth = Math.max(1, Math.round((product.printArea.width / 100) * width));
  const cropHeight = Math.max(1, Math.round((product.printArea.height / 100) * sourceHeight));
  const { canvas, context } = createCanvas(cropWidth, cropHeight);
  context.translate(-cropX, -cropY);
  await drawDesignLayers(context, layers, width, sourceHeight, product.printArea);
  return canvas;
}

/** Builds the transparent, unwrapped print file used by the 3D surface material. */
export async function createSurfaceArtworkCanvas(product: ProductBase, layers: DesignLayer[], width = 1024) {
  const area = product.printArea;
  const aspectRatio = Math.max(
    0.25,
    product.surfaceProfile?.aspectRatio || (area.width * product.ratio) / Math.max(1, area.height),
  );
  const exportWidth = Math.max(1, Math.min(width, Math.floor(Math.sqrt(24_000_000 * aspectRatio))));
  const height = Math.max(1, Math.round(exportWidth / aspectRatio));
  const { canvas, context } = createCanvas(exportWidth, height);
  const surfaceLayers = layers.map((layer) => ({
    ...layer,
    x: ((layer.x - area.x) / Math.max(1, area.width)) * 100,
    y: ((layer.y - area.y) / Math.max(1, area.height)) * 100,
    size: (layer.size / Math.max(1, area.width)) * 100,
  }));
  await drawDesignLayers(context, surfaceLayers, exportWidth, height, { x: 0, y: 0, width: 100, height: 100 });
  const keepOutAreas = product.surfaceProfile?.keepOutAreas || [];
  if (keepOutAreas.length > 0) {
    context.save();
    context.globalCompositeOperation = 'destination-out';
    keepOutAreas.forEach((safeArea) => {
      context.fillRect(
        (safeArea.x / 100) * exportWidth,
        (safeArea.y / 100) * height,
        (safeArea.width / 100) * exportWidth,
        (safeArea.height / 100) * height,
      );
    });
    context.restore();
  }
  return canvas;
}

/** Renders the same cylindrical UV artwork as a clean front or back 2D mug view. */
export async function createMugSidePreviewCanvas(
  product: ProductBase,
  layers: DesignLayer[],
  width: number,
  side: 'front' | 'back',
  warpStrength = 100,
  showGuides = true,
) {
  const canvasWidth = Math.max(1, Math.round(width));
  const canvasHeight = Math.max(1, Math.round(canvasWidth / product.ratio));
  const { canvas, context } = createCanvas(canvasWidth, canvasHeight);
  const artwork = await createSurfaceArtworkCanvas(product, layers, Math.max(1024, canvasWidth * 2));
  const wrap = getMugWrapSettings(product, warpStrength);
  const bodyWidth = canvasWidth * 0.48;
  const bodyHeight = canvasHeight * 0.64;
  const bodyX = (canvasWidth - bodyWidth) / 2;
  const bodyY = canvasHeight * 0.18;
  const centerX = canvasWidth / 2;
  const bodyBottom = bodyY + bodyHeight;
  const handleSide = side === 'front' ? 1 : -1;
  const handleStartX = centerX + handleSide * bodyWidth * 0.43;
  const handleOuterX = centerX + handleSide * bodyWidth * 0.91;
  const handleTop = bodyY + bodyHeight * 0.25;
  const handleBottom = bodyY + bodyHeight * 0.76;

  // Soft contact shadow under the mug.
  context.save();
  context.fillStyle = 'rgba(28, 30, 40, 0.13)';
  context.filter = `blur(${Math.max(2, canvasWidth * 0.012)}px)`;
  context.beginPath();
  context.ellipse(centerX, bodyBottom + canvasHeight * 0.028, bodyWidth * 0.56, bodyHeight * 0.035, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();

  // Ceramic handle sits behind the cup body and changes sides with the view.
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const drawHandle = () => {
    context.beginPath();
    context.moveTo(handleStartX, handleTop);
    context.bezierCurveTo(
      centerX + handleSide * bodyWidth * 0.72, handleTop,
      handleOuterX, bodyY + bodyHeight * 0.29,
      handleOuterX, bodyY + bodyHeight * 0.5,
    );
    context.bezierCurveTo(
      handleOuterX, bodyY + bodyHeight * 0.71,
      centerX + handleSide * bodyWidth * 0.72, handleBottom,
      handleStartX, handleBottom,
    );
    context.stroke();
  };
  context.strokeStyle = 'rgba(76, 80, 93, 0.2)';
  context.lineWidth = bodyWidth * 0.19;
  context.shadowColor = 'rgba(20, 23, 31, 0.2)';
  context.shadowBlur = canvasWidth * 0.018;
  context.shadowOffsetY = canvasHeight * 0.006;
  drawHandle();
  context.shadowColor = 'transparent';
  context.lineWidth = bodyWidth * 0.155;
  const handleGradient = context.createLinearGradient(centerX - bodyWidth * 0.9, 0, centerX + bodyWidth * 0.9, 0);
  handleGradient.addColorStop(0, '#c9cbd1');
  handleGradient.addColorStop(0.48, '#ffffff');
  handleGradient.addColorStop(1, '#d9dbe0');
  context.strokeStyle = handleGradient;
  drawHandle();
  context.restore();

  const bodyPath = () => {
    const radius = bodyWidth * 0.075;
    context.beginPath();
    context.moveTo(bodyX + radius, bodyY);
    context.lineTo(bodyX + bodyWidth - radius, bodyY);
    context.quadraticCurveTo(bodyX + bodyWidth, bodyY, bodyX + bodyWidth, bodyY + radius);
    context.lineTo(bodyX + bodyWidth, bodyBottom - radius * 1.45);
    context.quadraticCurveTo(bodyX + bodyWidth, bodyBottom, bodyX + bodyWidth - radius * 1.55, bodyBottom);
    context.lineTo(bodyX + radius * 1.55, bodyBottom);
    context.quadraticCurveTo(bodyX, bodyBottom, bodyX, bodyBottom - radius * 1.45);
    context.lineTo(bodyX, bodyY + radius);
    context.quadraticCurveTo(bodyX, bodyY, bodyX + radius, bodyY);
    context.closePath();
  };

  bodyPath();
  const ceramicGradient = context.createLinearGradient(bodyX, 0, bodyX + bodyWidth, 0);
  ceramicGradient.addColorStop(0, '#d1d2d7');
  ceramicGradient.addColorStop(0.12, '#f0f0f2');
  ceramicGradient.addColorStop(0.48, '#ffffff');
  ceramicGradient.addColorStop(0.86, '#efeff2');
  ceramicGradient.addColorStop(1, '#c9cbd1');
  context.fillStyle = ceramicGradient;
  context.shadowColor = 'rgba(22, 25, 35, 0.18)';
  context.shadowBlur = canvasWidth * 0.024;
  context.shadowOffsetY = canvasHeight * 0.008;
  context.fill();
  context.shadowColor = 'transparent';
  context.save();
  bodyPath();
  context.clip();

  const printableTop = bodyY + ((0.475 - wrap.yMax) / 0.945) * bodyHeight;
  const printableHeight = ((wrap.yMax - wrap.yMin) / 0.945) * bodyHeight;
  const columns = Math.max(320, Math.ceil(bodyWidth));
  const stripWidth = bodyWidth / columns + 0.75;
  const sourceStripWidth = artwork.width / columns + 1;
  const normalizedAngle = (angle: number) => {
    let result = angle;
    while (result > Math.PI) result -= Math.PI * 2;
    while (result < -Math.PI) result += Math.PI * 2;
    return result;
  };
  const uForScreenX = (screenX: number) => {
    const viewAngle = Math.asin(Math.max(-1, Math.min(1, screenX)));
    const theta = normalizedAngle(side === 'front' ? viewAngle : Math.PI + viewAngle);
    return { theta, u: (theta - wrap.thetaStart) / wrap.thetaSpan };
  };

  for (let column = 0; column < columns; column += 1) {
    const xNorm = ((column + 0.5) / columns) * 2 - 1;
    const { theta, u } = uForScreenX(xNorm);
    if (u < 0 || u > 1) continue;
    const sourceX = Math.min(artwork.width - 1, Math.max(0, Math.floor(u * artwork.width)));
    const destinationX = bodyX + (column / columns) * bodyWidth;
    context.drawImage(
      artwork,
      sourceX,
      0,
      Math.min(sourceStripWidth, artwork.width - sourceX),
      artwork.height,
      destinationX,
      printableTop,
      stripWidth,
      printableHeight,
    );

    // Cylinder form darkens toward its silhouette, matching the 3D mockup.
    const shade = side === 'front'
      ? (1 - Math.max(0, Math.cos(theta))) * 0.32
      : 0.1 + (1 - Math.abs(Math.cos(theta))) * 0.18;
    if (shade > 0.015) {
      context.fillStyle = `rgba(12, 17, 30, ${shade.toFixed(3)})`;
      context.fillRect(destinationX, bodyY, stripWidth, bodyHeight);
    }
  }

  if (showGuides) {
    context.strokeStyle = '#4de1ff';
    context.lineWidth = Math.max(1.5, canvasWidth / 480);
    context.setLineDash([canvasWidth * 0.012, canvasWidth * 0.008]);
    for (const y of [printableTop, printableTop + printableHeight]) {
      context.beginPath();
      let drawing = false;
      for (let column = 0; column <= columns; column += 1) {
        const xNorm = (column / columns) * 2 - 1;
        const { u } = uForScreenX(xNorm);
        if (u >= 0 && u <= 1) {
          const x = bodyX + (column / columns) * bodyWidth;
          if (!drawing) context.moveTo(x, y);
          else context.lineTo(x, y);
          drawing = true;
        } else {
          drawing = false;
        }
      }
      context.stroke();
    }

    if (side === 'back') {
      for (const theta of [wrap.thetaStart, wrap.thetaEnd]) {
        const screenX = -Math.sin(theta);
        const x = centerX + screenX * bodyWidth / 2;
        context.beginPath();
        context.moveTo(x, printableTop);
        context.lineTo(x, printableTop + printableHeight);
        context.stroke();
      }
    }
  }
  context.restore();

  // Glazed lip and unprinted foot remain part of the white porcelain.
  context.save();
  context.fillStyle = 'rgba(170, 174, 184, 0.28)';
  context.beginPath();
  context.ellipse(centerX, bodyY + bodyWidth * 0.025, bodyWidth * 0.485, bodyWidth * 0.094, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#f4f4f6';
  context.beginPath();
  context.ellipse(centerX, bodyY + bodyWidth * 0.014, bodyWidth * 0.466, bodyWidth * 0.073, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = 'rgba(127, 132, 145, 0.38)';
  context.lineWidth = Math.max(1, canvasWidth / 700);
  context.beginPath();
  context.ellipse(centerX, bodyY + bodyWidth * 0.026, bodyWidth * 0.472, bodyWidth * 0.078, 0, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = 'rgba(161, 164, 173, 0.32)';
  context.beginPath();
  context.ellipse(centerX, bodyBottom - bodyWidth * 0.012, bodyWidth * 0.42, bodyWidth * 0.035, 0, 0, Math.PI);
  context.stroke();
  context.restore();

  bodyPath();
  context.strokeStyle = 'rgba(161, 164, 174, 0.34)';
  context.lineWidth = Math.max(1, canvasWidth / 520);
  context.stroke();
  return canvas;
}

export async function createFrontalMockupCanvas(
  product: ProductBase,
  layers: DesignLayer[],
  width = 1024,
  appearance?: ProductAppearance,
) {
  const height = Math.max(1, Math.round(width / product.ratio));
  const { canvas, context } = createCanvas(width, height);
  const baseImage = await loadCanvasImage(product.image);
  const activeAppearance: ProductAppearance = appearance || {
    mode: 'original',
    color: product.defaultColor,
    accentColor: product.defaultAccentColor,
    finish: product.defaultFinish,
    warpMode: product.defaultWarp,
    warpStrength: product.defaultWarpStrength,
  };
  const processedProduct = buildProcessedProductCanvas(
    baseImage,
    product.image,
    activeAppearance,
    false,
    Math.min(width, 1600),
  );
  context.drawImage(processedProduct, 0, 0, width, height);

  const artCanvas = await createArtworkCanvas(product, layers, Math.min(width, 1600));
  drawWarpedArtworkCanvas(
    context,
    artCanvas,
    (product.printArea.x / 100) * width,
    (product.printArea.y / 100) * height,
    (product.printArea.width / 100) * width,
    (product.printArea.height / 100) * height,
    activeAppearance.warpMode,
    activeAppearance.warpStrength,
  );
  return canvas;
}

export async function createMockupCanvas(
  product: ProductBase,
  layers: DesignLayer[],
  width = 2400,
  appearance?: ProductAppearance,
  background?: SceneBackground,
) {
  const height = Math.max(1, Math.round(width / product.ratio));
  const { canvas, context } = createCanvas(width, height);
  const activeBg: SceneBackground = background || { kind: 'solid', color: '#ffffff', color2: '#ffffff', angle: 180 };
  const bgImage = activeBg.kind === 'image' && activeBg.imageSrc ? await loadCanvasImage(activeBg.imageSrc) : null;

  drawSceneBackground(context, width, height, activeBg, bgImage, false);

  if (product.image) {
    const baseImage = await loadCanvasImage(product.image);
    const extractBackdrop = activeBg.kind !== 'solid' || activeBg.color.toLowerCase() !== '#ffffff';
    const activeAppearance: ProductAppearance = appearance || {
      mode: 'original',
      color: product.defaultColor,
      accentColor: product.defaultAccentColor,
      finish: product.defaultFinish,
      warpMode: product.defaultWarp,
      warpStrength: product.defaultWarpStrength,
    };
    const processedProduct = buildProcessedProductCanvas(
      baseImage,
      product.image,
      activeAppearance,
      extractBackdrop,
      Math.min(width, 2000),
    );
    context.drawImage(processedProduct, 0, 0, width, height);
  }

  const artCanvas = await createArtworkCanvas(product, layers, Math.min(width, 2048));
  const destX = (product.printArea.x / 100) * width;
  const destY = (product.printArea.y / 100) * height;
  const destW = (product.printArea.width / 100) * width;
  const destH = (product.printArea.height / 100) * height;

  const warpMode = appearance?.warpMode ?? product.defaultWarp;
  const warpStrength = appearance?.warpStrength ?? product.defaultWarpStrength;
  drawWarpedArtworkCanvas(context, artCanvas, destX, destY, destW, destH, warpMode, warpStrength);

  return canvas;
}

export function downloadCanvas(canvas: HTMLCanvasElement, fileName: string) {
  return new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('No se pudo codificar el PNG.'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, 'image/png');
  });
}
