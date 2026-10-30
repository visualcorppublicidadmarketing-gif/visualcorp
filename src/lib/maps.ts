const GOOGLE_MAPS_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'maps.app.goo.gl',
  'goo.gl',
]);

export function normalizeGoogleMapsUrl(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  let candidate = '';
  if (input.startsWith('//')) candidate = `https:${input}`;
  else if (/^https?:\/\//i.test(input)) candidate = input;
  else if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^[^/?#\s]+:\d+(?:[/?#]|$)/.test(input)) return '';
  else candidate = `https://${input}`;
  try {
    const url = new URL(candidate);
    const allowedHost = GOOGLE_MAPS_HOSTS.has(url.hostname) || url.hostname.endsWith('.google.com');
    if (!['http:', 'https:'].includes(url.protocol) || !allowedHost) return '';
    url.protocol = 'https:';
    return url.href;
  } catch {
    return '';
  }
}

export function isGoogleMapsUrl(value) {
  return Boolean(normalizeGoogleMapsUrl(value));
}

export function extractGoogleMapsCoordinates(value) {
  const normalized = normalizeGoogleMapsUrl(value);
  if (!normalized) return null;
  const patterns = [
    /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
    /[?&](?:q|query|ll)=(-?\d{1,3}(?:\.\d+)?)(?:%2C|,)(-?\d{1,3}(?:\.\d+)?)/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return { lat: Number(match[1]), lng: Number(match[2]) };
  }
  return null;
}

export function getGoogleMapsOpenUrl(mapsUrl, address = '') {
  const normalized = normalizeGoogleMapsUrl(mapsUrl);
  if (normalized) return normalized;
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';
}

export function getGoogleMapsEmbedUrl(mapsUrl, address = '') {
  const coordinates = extractGoogleMapsCoordinates(mapsUrl);
  const query = coordinates ? `${coordinates.lat},${coordinates.lng}` : address.trim();
  return query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed` : '';
}
