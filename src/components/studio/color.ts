export function clamp(value, min = 0, max = 255) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((value) => Math.round(clamp(value)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '').trim();
  const value = clean.length === 3 ? clean.split('').map((char) => char + char).join('') : clean;
  if (!/^[0-9a-f]{6}$/i.test(value)) return { r: 255, g: 91, b: 31 };
  return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) };
}

export function rgbToHsb({ r, g, b }) {
  const red = clamp(r) / 255; const green = clamp(g) / 255; const blue = clamp(b) / 255;
  const max = Math.max(red, green, blue); const min = Math.min(red, green, blue); const delta = max - min;
  let hue = 0;
  if (delta) hue = max === red ? 60 * (((green - blue) / delta) % 6) : max === green ? 60 * ((blue - red) / delta + 2) : 60 * ((red - green) / delta + 4);
  if (hue < 0) hue += 360;
  return { h: Math.round(hue), s: Math.round(max ? (delta / max) * 100 : 0), b: Math.round(max * 100) };
}

export function rgbToCmyk({ r, g, b }) {
  const red = clamp(r) / 255; const green = clamp(g) / 255; const blue = clamp(b) / 255; const k = 1 - Math.max(red, green, blue);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  return { c: Math.round(((1 - red - k) / (1 - k)) * 100), m: Math.round(((1 - green - k) / (1 - k)) * 100), y: Math.round(((1 - blue - k) / (1 - k)) * 100), k: Math.round(k * 100) };
}

export function colorFormats(hex) {
  const rgb = hexToRgb(hex);
  const hsb = rgbToHsb(rgb);
  const cmyk = rgbToCmyk(rgb);
  return { hex: rgbToHex(rgb), rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`, hsb: `hsb(${hsb.h}°, ${hsb.s}%, ${hsb.b}%)`, cmyk: `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)` };
}
