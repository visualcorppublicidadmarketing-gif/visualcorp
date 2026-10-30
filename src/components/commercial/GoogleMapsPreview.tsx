import React from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import './commercial-components.css';

function safeMapsUrl(value: string) { try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'google.com' || url.hostname.endsWith('.google.com') || url.hostname === 'maps.app.goo.gl' || url.hostname === 'goo.gl') ? url : null; } catch { return null; } }
function queryFromUrl(url: URL | null) {
  if (!url) return '';
  const params = url.searchParams; const direct = params.get('q') || params.get('query') || params.get('destination');
  if (direct) return direct;
  const coord = url.href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) || url.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  return coord ? `${coord[1]},${coord[2]}` : '';
}
export function GoogleMapsPreview({ url = '', address = '', coordinates = '' }: { url?: string; address?: string; coordinates?: string }) {
  const parsed = safeMapsUrl(url.trim());
  const query = queryFromUrl(parsed) || coordinates || address.trim();
  if (!query && !url.trim()) return null;
  return <section className="commercial-map-preview" aria-label="Vista previa de ubicación">
    {query ? <iframe title={`Mapa: ${address || query}`} src={`https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade"/> : <div className="commercial-map-fallback"><MapPin size={18}/><span>Google Maps oculta el destino en este enlace corto. Ábrelo para ver la ubicación.</span></div>}
    {parsed && <a href={parsed.href} target="_blank" rel="noreferrer"><MapPin size={14}/> Abrir en Google Maps <ExternalLink size={13}/></a>}
  </section>;
}
