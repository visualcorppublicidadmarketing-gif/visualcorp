const GOOGLE_MAPS_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'maps.app.goo.gl',
  'goo.gl',
]);

export function isGoogleMapsUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (GOOGLE_MAPS_HOSTS.has(url.hostname) || url.hostname.endsWith('.google.com'));
  } catch {
    return false;
  }
}

export function extractGoogleMapsCoordinates(value) {
  if (!isGoogleMapsUrl(value)) return null;
  const patterns = [
    /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
    /[?&](?:q|query|ll)=(-?\d{1,3}(?:\.\d+)?)(?:%2C|,)(-?\d{1,3}(?:\.\d+)?)/i,
  ];
  for (const pattern of patterns) {
    const match = String(value).match(pattern);
    if (match) return { lat: Number(match[1]), lng: Number(match[2]) };
  }
  return null;
}

export function getGoogleMapsOpenUrl(mapsUrl, address = '') {
  if (isGoogleMapsUrl(mapsUrl)) return mapsUrl;
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';
}

export function getGoogleMapsEmbedUrl(mapsUrl, address = '') {
  const coordinates = extractGoogleMapsCoordinates(mapsUrl);
  const query = coordinates ? `${coordinates.lat},${coordinates.lng}` : address.trim();
  return query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed` : '';
}
