/**
 * Pure TypeScript ISO/IEC 18004 QR Code Matrix Generator (Byte mode, Versions 1-10)
 * + Styled Vector SVG builder for print-ready exports (0 external dependencies).
 */

export type QrEccLevel = 'M' | 'H';
export type QrDotStyle = 'square' | 'rounded' | 'dots';

type VersionSpec = {
  version: number;
  size: number;
  // [ecCodewordsPerBlock, group1Blocks, group1DataCW, group2Blocks, group2DataCW]
  M: [number, number, number, number, number];
  H: [number, number, number, number, number];
  alignment: number[];
};

const VERSION_SPECS: VersionSpec[] = [
  { version: 1, size: 21, M: [10, 1, 16, 0, 0], H: [17, 1, 9, 0, 0], alignment: [] },
  { version: 2, size: 25, M: [16, 1, 28, 0, 0], H: [28, 1, 16, 0, 0], alignment: [6, 18] },
  { version: 3, size: 29, M: [26, 1, 44, 0, 0], H: [22, 2, 13, 0, 0], alignment: [6, 22] },
  { version: 4, size: 33, M: [18, 2, 32, 0, 0], H: [16, 4, 9, 0, 0], alignment: [6, 26] },
  { version: 5, size: 37, M: [24, 2, 43, 0, 0], H: [22, 2, 11, 2, 12], alignment: [6, 30] },
  { version: 6, size: 41, M: [16, 4, 27, 0, 0], H: [28, 4, 15, 0, 0], alignment: [6, 34] },
  { version: 7, size: 45, M: [18, 4, 31, 0, 0], H: [26, 4, 13, 1, 14], alignment: [6, 22, 38] },
  { version: 8, size: 49, M: [22, 2, 38, 2, 39], H: [26, 4, 14, 2, 15], alignment: [6, 24, 42] },
  { version: 9, size: 53, M: [22, 3, 36, 2, 37], H: [24, 4, 12, 4, 13], alignment: [6, 26, 46] },
  { version: 10, size: 57, M: [26, 4, 43, 1, 44], H: [28, 6, 15, 2, 16], alignment: [6, 28, 50] },
];

// GF(256) with primitive polynomial 0x11d
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly: Uint8Array = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const rem = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecCount - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

function encodeBits(bytes: Uint8Array, totalDataCW: number, version: number): Uint8Array {
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };

  // Mode indicator: Byte (0100)
  pushBits(0b0100, 4);
  // Character count indicator (8 bits for V1-V9, 16 bits for V10+)
  pushBits(bytes.length, version >= 10 ? 16 : 8);
  for (const b of bytes) pushBits(b, 8);

  const maxBits = totalDataCW * 8;
  const terminatorLen = Math.min(4, maxBits - bits.length);
  pushBits(0, terminatorLen);
  while (bits.length % 8 !== 0) bits.push(0);

  const out = new Uint8Array(totalDataCW);
  let byteIdx = 0;
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    out[byteIdx++] = v;
  }

  let padToggle = true;
  while (byteIdx < totalDataCW) {
    out[byteIdx++] = padToggle ? 0xec : 0x11;
    padToggle = !padToggle;
  }
  return out;
}

function formatBits(ecc: QrEccLevel, mask: number): number {
  // Format indicator: M=00, H=10
  const eccBits = ecc === 'M' ? 0b00 : 0b10;
  const data = (eccBits << 3) | mask;
  let rem = data << 10;
  const poly = 0b10100110111;
  for (let i = 14; i >= 10; i--) {
    if ((rem >>> i) & 1) rem ^= poly << (i - 10);
  }
  return ((data << 10) | rem) ^ 0b101010000010010;
}

function versionBits(version: number): number {
  let rem = version << 12;
  const poly = 0b1111100100101;
  for (let i = 17; i >= 12; i--) {
    if ((rem >>> i) & 1) rem ^= poly << (i - 12);
  }
  return (version << 12) | rem;
}

function maskBit(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return false;
  }
}

function scorePenalty(grid: Uint8Array, size: number): number {
  let score = 0;
  const at = (r: number, c: number) => grid[r * size + c];

  // Rule 1: adjacent modules in row/col
  for (let r = 0; r < size; r++) {
    let run = 1;
    for (let c = 1; c < size; c++) {
      if (at(r, c) === at(r, c - 1)) {
        run++;
        if (run === 5) score += 3;
        else if (run > 5) score += 1;
      } else run = 1;
    }
  }
  for (let c = 0; c < size; c++) {
    let run = 1;
    for (let r = 1; r < size; r++) {
      if (at(r, c) === at(r - 1, c)) {
        run++;
        if (run === 5) score += 3;
        else if (run > 5) score += 1;
      } else run = 1;
    }
  }

  // Rule 2: 2x2 blocks
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = at(r, c);
      if (v === at(r, c + 1) && v === at(r + 1, c) && v === at(r + 1, c + 1)) score += 3;
    }
  }

  // Rule 4: balance of dark modules
  let dark = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i]) dark++;
  const pct = (dark * 100) / grid.length;
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;

  return score;
}

export type QrMatrix = {
  size: number;
  version: number;
  ecc: QrEccLevel;
  modules: Uint8Array; // 0 = light, 1 = dark
};

export function encodeQrMatrix(text: string, preferredEcc: QrEccLevel = 'H'): QrMatrix {
  const bytes = new TextEncoder().encode(text.trim() || 'https://visualcorp-suite.vercel.app');

  const pickSpec = (ecc: QrEccLevel): VersionSpec | null => {
    for (const spec of VERSION_SPECS) {
      const [, g1b, g1d, g2b, g2d] = spec[ecc];
      const totalDataCW = g1b * g1d + g2b * g2d;
      const headerBits = 4 + (spec.version >= 10 ? 16 : 8);
      const maxBytes = Math.floor((totalDataCW * 8 - headerBits) / 8);
      if (bytes.length <= maxBytes) return spec;
    }
    return null;
  };

  let ecc: QrEccLevel = preferredEcc;
  let spec = pickSpec(ecc);
  if (!spec && ecc === 'H') {
    ecc = 'M';
    spec = pickSpec('M');
  }
  if (!spec) {
    // Truncate cleanly to V10 M capacity if extremely long text
    spec = VERSION_SPECS[VERSION_SPECS.length - 1];
    ecc = 'M';
  }

  const [ecPerBlock, g1b, g1d, g2b, g2d] = spec[ecc];
  const totalDataCW = g1b * g1d + g2b * g2d;
  const maxBytes = Math.floor((totalDataCW * 8 - (4 + (spec.version >= 10 ? 16 : 8))) / 8);
  const clampedBytes = bytes.length > maxBytes ? bytes.slice(0, maxBytes) : bytes;

  const dataCW = encodeBits(clampedBytes, totalDataCW, spec.version);

  // Split into blocks and compute Reed-Solomon EC codewords
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < g1b; i++) {
    const block = dataCW.slice(offset, offset + g1d);
    offset += g1d;
    dataBlocks.push(block);
    ecBlocks.push(rsRemainder(block, ecPerBlock));
  }
  for (let i = 0; i < g2b; i++) {
    const block = dataCW.slice(offset, offset + g2d);
    offset += g2d;
    dataBlocks.push(block);
    ecBlocks.push(rsRemainder(block, ecPerBlock));
  }

  // Interleave data codewords + EC codewords
  const interleaved: number[] = [];
  const maxDataLen = Math.max(g1d, g2d);
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) interleaved.push(block[i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const ec of ecBlocks) interleaved.push(ec[i]);
  }

  const size = spec.size;
  const isFunction = new Uint8Array(size * size);
  const base = new Uint8Array(size * size);

  const setFunc = (r: number, c: number, dark: boolean) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    isFunction[r * size + c] = 1;
    base[r * size + c] = dark ? 1 : 0;
  };

  // Finder patterns + separators
  const drawFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inCenter = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        setFunc(r, c, inOuter && (inBorder || inCenter));
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const align = spec.alignment;
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      const cr = align[i];
      const cc = align[j];
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setFunc(cr + dr, cc + dc, dist !== 1);
        }
      }
    }
  }

  // Dark module & reserve format areas
  setFunc(size - 8, 8, true);
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      isFunction[8 * size + i] = 1;
      isFunction[i * size + 8] = 1;
    }
  }
  for (let i = size - 8; i < size; i++) {
    isFunction[8 * size + i] = 1;
    isFunction[i * size + 8] = 1;
  }

  // Version info for V7+
  if (spec.version >= 7) {
    const vBits = versionBits(spec.version);
    for (let i = 0; i < 18; i++) {
      const dark = Boolean((vBits >>> i) & 1);
      const a = Math.floor(i / 3);
      const b = size - 11 + (i % 3);
      setFunc(a, b, dark);
      setFunc(b, a, dark);
    }
  }

  // Place data bits in zigzag columns
  let bitIndex = 0;
  const totalBits = interleaved.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (let dx = 0; dx < 2; dx++) {
        const c = right - dx;
        if (isFunction[r * size + c]) continue;
        let dark = false;
        if (bitIndex < totalBits) {
          dark = Boolean((interleaved[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1);
          bitIndex++;
        }
        base[r * size + c] = dark ? 1 : 0;
      }
    }
  }

  // Evaluate all 8 masks and pick the lowest penalty
  let bestGrid = base;
  let bestScore = Infinity;

  for (let mask = 0; mask < 8; mask++) {
    const candidate = new Uint8Array(base);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!isFunction[r * size + c] && maskBit(mask, r, c)) {
          candidate[r * size + c] ^= 1;
        }
      }
    }
    // Write format info
    const fBits = formatBits(ecc, mask);
    for (let i = 0; i < 6; i++) candidate[8 * size + i] = (fBits >>> (14 - i)) & 1;
    candidate[8 * size + 7] = (fBits >>> 8) & 1;
    candidate[8 * size + 8] = (fBits >>> 7) & 1;
    candidate[7 * size + 8] = (fBits >>> 6) & 1;
    for (let i = 0; i < 6; i++) candidate[(5 - i) * size + 8] = (fBits >>> (5 - i)) & 1;
    for (let i = 0; i < 8; i++) candidate[8 * size + (size - 1 - i)] = (fBits >>> i) & 1;
    for (let i = 0; i < 7; i++) candidate[(size - 1 - i) * size + 8] = (fBits >>> (14 - i)) & 1;

    const penalty = scorePenalty(candidate, size);
    if (penalty < bestScore) {
      bestScore = penalty;
      bestGrid = candidate;
    }
  }

  return { size, version: spec.version, ecc, modules: bestGrid };
}

export type StyledQrOptions = {
  text: string;
  dotStyle: QrDotStyle;
  fgColor: string;
  fgColorEnd?: string;
  bgColor: string;
  logoDataUrl?: string | null;
  marginModules?: number;
};

function isFinderCell(r: number, c: number, size: number) {
  return (
    (r < 7 && c < 7) ||
    (r < 7 && c >= size - 7) ||
    (r >= size - 7 && c < 7)
  );
}

export function buildStyledQrSvg(options: StyledQrOptions): { svg: string; matrix: QrMatrix } {
  const ecc: QrEccLevel = options.logoDataUrl ? 'H' : 'M';
  const matrix = encodeQrMatrix(options.text, ecc);
  const { size, modules } = matrix;
  const margin = options.marginModules ?? 4;
  const total = size + margin * 2;
  const cell = 10;
  const viewSize = total * cell;

  const hasGradient = Boolean(options.fgColorEnd && options.fgColorEnd !== options.fgColor);
  const fillRef = hasGradient ? 'url(#vc-qr-grad)' : options.fgColor;

  // Clear center box when logo is present (~20% of matrix width, safe under ECC H)
  const logoSpan = options.logoDataUrl ? Math.max(5, Math.floor(size * 0.22)) | 1 : 0;
  const logoStart = Math.floor((size - logoSpan) / 2);
  const logoEnd = logoStart + logoSpan - 1;

  const shapes: string[] = [];

  // Styled Finder Eyes (3 corners)
  const finderCorners = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];
  const outerR = options.dotStyle === 'square' ? 0 : options.dotStyle === 'rounded' ? 14 : 22;
  const innerR = options.dotStyle === 'square' ? 0 : options.dotStyle === 'rounded' ? 7 : 15;

  for (const [fr, fc] of finderCorners) {
    const x = (fc + margin) * cell;
    const y = (fr + margin) * cell;
    shapes.push(
      `<rect x="${x + 5}" y="${y + 5}" width="${6 * cell}" height="${6 * cell}" rx="${outerR}" fill="none" stroke="${fillRef}" stroke-width="${cell}"/>`,
    );
    shapes.push(
      `<rect x="${x + 2 * cell}" y="${y + 2 * cell}" width="${3 * cell}" height="${3 * cell}" rx="${innerR}" fill="${fillRef}"/>`,
    );
  }

  // Data modules
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!modules[r * size + c]) continue;
      if (isFinderCell(r, c, size)) continue;
      if (logoSpan > 0 && r >= logoStart && r <= logoEnd && c >= logoStart && c <= logoEnd) continue;

      const x = (c + margin) * cell;
      const y = (r + margin) * cell;
      if (options.dotStyle === 'dots') {
        shapes.push(`<circle cx="${x + cell / 2}" cy="${y + cell / 2}" r="${(cell * 0.43).toFixed(1)}" fill="${fillRef}"/>`);
      } else if (options.dotStyle === 'rounded') {
        shapes.push(`<rect x="${x + 0.6}" y="${y + 0.6}" width="${cell - 1.2}" height="${cell - 1.2}" rx="3" fill="${fillRef}"/>`);
      } else {
        shapes.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fillRef}"/>`);
      }
    }
  }

  let logoMarkup = '';
  if (options.logoDataUrl && logoSpan > 0) {
    const boxX = (logoStart + margin) * cell;
    const boxY = (logoStart + margin) * cell;
    const boxSize = logoSpan * cell;
    const pad = cell * 0.65;
    logoMarkup = `
      <rect x="${boxX - pad * 0.4}" y="${boxY - pad * 0.4}" width="${boxSize + pad * 0.8}" height="${boxSize + pad * 0.8}" rx="${Math.round(boxSize * 0.22)}" fill="${options.bgColor}"/>
      <image href="${options.logoDataUrl}" x="${boxX + pad * 0.5}" y="${boxY + pad * 0.5}" width="${boxSize - pad}" height="${boxSize - pad}" preserveAspectRatio="xMidYMid meet"/>
    `;
  }

  const defs = hasGradient
    ? `<defs><linearGradient id="vc-qr-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${options.fgColor}"/><stop offset="100%" stop-color="${options.fgColorEnd}"/></linearGradient></defs>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" width="${viewSize}" height="${viewSize}" shape-rendering="geometricPrecision">${defs}<rect width="${viewSize}" height="${viewSize}" fill="${options.bgColor}" rx="28"/>${shapes.join('')}${logoMarkup}</svg>`;
  return { svg, matrix };
}
