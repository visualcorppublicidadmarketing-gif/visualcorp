import QRCode from 'qrcode';

export type QrDotStyle = 'square' | 'soft' | 'rounded' | 'dots';
export type QrEccLevel = 'M' | 'H';

export type StyledQrOptions = {
  text: string;
  dotStyle: QrDotStyle;
  colors: string[];
  angle: number;
  bgColor: string;
  logoDataUrl?: string | null;
  logoPercent?: number;
  widthMm?: number;
};

export type QrMatrix = { size: number; version: number; ecc: QrEccLevel };

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] ?? char);
}

export function contrastRatio(foreground: string, background: string) {
  const luminance = (color: string) => {
    const channels = color.match(/[\da-f]{2}/gi)?.slice(0, 3).map((part) => {
      const value = parseInt(part, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }) ?? [0, 0, 0];
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

export function buildStyledQrSvg(options: StyledQrOptions): { svg: string; matrix: QrMatrix } {
  const ecc: QrEccLevel = options.logoDataUrl ? 'H' : 'M';
  const qr = QRCode.create(options.text, { errorCorrectionLevel: ecc });
  const size = qr.modules.size;
  const margin = 4;
  const total = size + margin * 2;
  const cell = 10;
  const viewSize = total * cell;
  const colors = options.colors.length > 1 ? options.colors : [options.colors[0] ?? '#11121a'];
  const defs = colors.length > 1
    ? `<defs><linearGradient id="vc-qr-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${Math.cos(options.angle * Math.PI / 180) * viewSize}" y2="${Math.sin(options.angle * Math.PI / 180) * viewSize}">${colors.map((color, index) => `<stop offset="${index / (colors.length - 1)}" stop-color="${escapeXml(color)}"/>`).join('')}</linearGradient></defs>`
    : '';
  const fill = colors.length > 1 ? 'url(#vc-qr-grad)' : escapeXml(colors[0]);
  const modules: string[] = [];

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!qr.modules.get(row, column)) continue;
      const x = (column + margin) * cell;
      const y = (row + margin) * cell;
      if (qr.modules.reservedBit[row * size + column]) {
        modules.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fill}"/>`);
      } else if (options.dotStyle === 'dots') {
        modules.push(`<circle cx="${x + cell / 2}" cy="${y + cell / 2}" r="4.35" fill="${fill}"/>`);
      } else {
        const radius = options.dotStyle === 'square' ? 0 : options.dotStyle === 'soft' ? 1.4 : 3.6;
        modules.push(`<rect x="${x + 0.4}" y="${y + 0.4}" width="9.2" height="9.2" rx="${radius}" fill="${fill}"/>`);
      }
    }
  }

  let logo = '';
  if (options.logoDataUrl) {
    const span = Math.max(3, Math.floor(size * Math.min(18, Math.max(6, options.logoPercent ?? 14)) / 100));
    const center = Math.floor(size / 2);
    const candidates: Array<[number, number, number]> = [];
    for (let row = 0; row <= size - span; row += 1) {
      for (let column = 0; column <= size - span; column += 1) {
        let reserved = false;
        for (let r = row; r < row + span && !reserved; r += 1) {
          for (let c = column; c < column + span; c += 1) {
            if (qr.modules.reservedBit[r * size + c]) { reserved = true; break; }
          }
        }
        if (!reserved) candidates.push([Math.abs(row + span / 2 - center) + Math.abs(column + span / 2 - center), row, column]);
      }
    }
    candidates.sort((a, b) => a[0] - b[0]);
    const candidate = candidates[0];
    if (candidate) {
      const [, row, column] = candidate;
      const x = (column + margin) * cell;
      const y = (row + margin) * cell;
      const dimension = span * cell;
      logo = `<rect x="${x - 3}" y="${y - 3}" width="${dimension + 6}" height="${dimension + 6}" rx="12" fill="${escapeXml(options.bgColor)}"/><image href="${options.logoDataUrl}" x="${x}" y="${y}" width="${dimension}" height="${dimension}" preserveAspectRatio="xMidYMid meet"/>`;
      for (let r = row; r < row + span; r += 1) for (let c = column; c < column + span; c += 1) qr.modules.data[r * size + c] = 0;
    }
  }

  const physical = options.widthMm && Number.isFinite(options.widthMm) ? ` width="${options.widthMm}mm" height="${options.widthMm}mm"` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}"${physical} shape-rendering="crispEdges">${defs}<rect width="${viewSize}" height="${viewSize}" fill="${escapeXml(options.bgColor)}"/>${modules.join('')}${logo}</svg>`;
  return { svg, matrix: { size, version: qr.version, ecc } };
}
