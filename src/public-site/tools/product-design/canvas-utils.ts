import type { DesignLayer, PrintArea, ProductBase } from './types';

export function loadCanvasImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo leer una de las imágenes del diseño.'));
    image.src = src;
  });
}

function wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
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
  return lines;
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
  context.rect((printArea.x / 100) * width, (printArea.y / 100) * height, (printArea.width / 100) * width, (printArea.height / 100) * height);
  context.clip();

  layers.forEach((layer) => {
    if (!layer.visible) return;
    const centerX = (layer.x / 100) * width;
    const centerY = (layer.y / 100) * height;
    const elementWidth = (layer.size / 100) * width;
    context.save();
    context.translate(centerX, centerY);
    context.rotate((layer.rotation * Math.PI) / 180);
    context.globalAlpha = layer.opacity / 100;

    if (layer.kind === 'image' && layer.src) {
      const image = imageBySource.get(layer.src);
      if (image) {
        const imageHeight = elementWidth * image.naturalHeight / Math.max(1, image.naturalWidth);
        context.drawImage(image, -elementWidth / 2, -imageHeight / 2, elementWidth, imageHeight);
      }
    } else if (layer.kind === 'text') {
      const fontSize = Math.max(18, elementWidth * 0.28);
      context.fillStyle = layer.color;
      context.font = `700 ${fontSize}px "${layer.fontFamily || 'DM Sans'}", Arial, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const lines = wrapText(context, layer.text || '', elementWidth * 0.94);
      const lineHeight = fontSize * 1.18;
      lines.forEach((line, index) => context.fillText(line, 0, (index - (lines.length - 1) / 2) * lineHeight, elementWidth));
    } else {
      context.fillStyle = layer.color;
      const elementHeight = elementWidth * (layer.kind === 'circle' ? 1 : 0.56);
      if (layer.kind === 'circle') {
        context.beginPath();
        context.arc(0, 0, elementWidth / 2, 0, Math.PI * 2);
        context.fill();
      } else if (layer.kind === 'triangle') {
        context.beginPath();
        context.moveTo(0, -elementHeight / 2);
        context.lineTo(elementWidth / 2, elementHeight / 2);
        context.lineTo(-elementWidth / 2, elementHeight / 2);
        context.closePath();
        context.fill();
      } else {
        context.fillRect(-elementWidth / 2, -elementHeight / 2, elementWidth, elementHeight);
      }
    }

    context.restore();
  });

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

export async function createMockupCanvas(product: ProductBase, layers: DesignLayer[], width = 2400) {
  const height = Math.max(1, Math.round(width / product.ratio));
  const { canvas, context } = createCanvas(width, height);
  const baseImage = await loadCanvasImage(product.image);
  context.drawImage(baseImage, 0, 0, width, height);
  await drawDesignLayers(context, layers, width, height, product.printArea);
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
