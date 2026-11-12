import { useMemo } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import { getGoogleMapsOpenUrl, normalizeGoogleMapsUrl, extractGoogleMapsCoordinates } from '../lib/maps';
import { GoogleMapsPreview } from './commercial/GoogleMapsPreview';
import './google-maps-location-fields.css';

export interface LocationDraft {
  address: string;
  mapsUrl: string;
  latitude: string;
  longitude: string;
}

interface GoogleMapsLocationFieldsProps {
  idPrefix: string;
  location: LocationDraft;
  onChange: (location: LocationDraft) => void;
  addressLabel?: string;
  mapSearchContext?: string;
  disabled?: boolean;
}

function coordinateString(latitude: string, longitude: string) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return latitude.trim() && longitude.trim() && Number.isFinite(lat) && Number.isFinite(lng)
    ? `${lat},${lng}`
    : '';
}

export function GoogleMapsLocationFields({
  idPrefix,
  location,
  onChange,
  addressLabel = 'Dirección',
  mapSearchContext = '',
  disabled = false,
}: GoogleMapsLocationFieldsProps) {
  const coordinates = coordinateString(location.latitude, location.longitude);
  const addressQuery = [location.address, mapSearchContext].filter(Boolean).join(', ');
  const openUrl = useMemo(
    () => getGoogleMapsOpenUrl(location.mapsUrl, coordinates || addressQuery),
    [coordinates, addressQuery, location.mapsUrl],
  );
  const mapsUrlIsValid = !location.mapsUrl.trim() || Boolean(normalizeGoogleMapsUrl(location.mapsUrl));

  const updateMapsUrl = (mapsUrl: string) => {
    const point = extractGoogleMapsCoordinates(mapsUrl);
    onChange({
      ...location,
      mapsUrl,
      latitude: point ? String(point.lat) : '',
      longitude: point ? String(point.lng) : '',
    });
  };

  return (
    <section className="vc-location-fields" aria-label="Ubicación en Google Maps">
      <label>
        <span>{addressLabel}</span>
        <input
          type="text"
          maxLength={300}
          autoComplete="street-address"
          placeholder="Calle, número, ciudad o sector"
          value={location.address}
          disabled={disabled}
          onChange={(event) => onChange({ ...location, address: event.target.value })}
        />
      </label>

      <div className="vc-location-map-row">
        <label>
          <span>Enlace o pin de Google Maps</span>
          <input
            id={`${idPrefix}-maps-url`}
            type="text"
            inputMode="url"
            maxLength={800}
            placeholder="Pega el enlace compartido desde Google Maps"
            value={location.mapsUrl}
            disabled={disabled}
            aria-invalid={!mapsUrlIsValid}
            onChange={(event) => updateMapsUrl(event.target.value)}
          />
        </label>
        {openUrl && (
          <a className="vc-location-open-link" href={openUrl} target="_blank" rel="noreferrer">
            <MapPin size={14} aria-hidden="true" />
            <span>Abrir mapa</span>
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        )}
      </div>

      {!mapsUrlIsValid ? (
        <p className="vc-location-help is-error" role="alert">
          Usa un enlace de Google Maps, como maps.app.goo.gl o maps.google.com.
        </p>
      ) : (
        <p className="vc-location-help">
          Abre Google Maps, elige el punto y usa <b>Compartir → Copiar enlace</b>. Pégalo aquí para guardar el pin.
        </p>
      )}

      <details className="vc-location-coordinates-details">
        <summary>{coordinates ? `Pin guardado · ${coordinates}` : 'Ingresar coordenadas manualmente (opcional)'}</summary>
        <div className="vc-location-coordinates">
          <label>
            <span>Latitud</span>
            <input
              type="number"
              min={-90}
              max={90}
              step="any"
              value={location.latitude}
              disabled={disabled}
              onChange={(event) => onChange({ ...location, latitude: event.target.value })}
            />
          </label>
          <label>
            <span>Longitud</span>
            <input
              type="number"
              min={-180}
              max={180}
              step="any"
              value={location.longitude}
              disabled={disabled}
              onChange={(event) => onChange({ ...location, longitude: event.target.value })}
            />
          </label>
        </div>
      </details>

      {(location.address.trim() || location.mapsUrl.trim() || coordinates) && (
        <GoogleMapsPreview
          url={normalizeGoogleMapsUrl(location.mapsUrl)}
          address={addressQuery}
          coordinates={coordinates}
        />
      )}
    </section>
  );
}
