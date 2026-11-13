import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MapPin, X } from 'lucide-react';
import { parseCoordinatesInput, type GeoCoordinates, type InstallationWorkOrder } from '../../lib/geospatialProximity';
import './workshop-location-editor.css';

interface LocationEditorModalProps {
  isOpen: boolean;
  isPickingLocation?: boolean;
  job: InstallationWorkOrder | null;
  pickedCoordinates?: GeoCoordinates | null;
  onClose: () => void;
  onRequestMapPick?: () => void;
  onSaveLocation: (jobId: string, data: { address: string; lat: number; lng: number; mapsUrl: string }) => Promise<void>;
}

function acceptedGoogleMapsUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isFullMap = ['google.com', 'www.google.com'].includes(host) && url.pathname.startsWith('/maps/');
    const isShortMap = host === 'maps.app.goo.gl' || (host === 'goo.gl' && url.pathname.startsWith('/maps/'));
    return url.protocol === 'https:' && (isFullMap || isShortMap) ? url.toString() : '';
  } catch {
    return '';
  }
}

export function LocationEditorModal(props: LocationEditorModalProps) {
  const { isOpen, job } = props;
  if (!isOpen || !job) return null;
  return <LocationEditorDialog key={job.id} {...props} job={job} />;
}

function LocationEditorDialog({ job, pickedCoordinates, isPickingLocation = false, onClose, onRequestMapPick, onSaveLocation }: LocationEditorModalProps & { job: InstallationWorkOrder }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [address, setAddress] = useState(job.address === 'Dirección pendiente' ? '' : job.address || '');
  const [latitude, setLatitude] = useState(() => pickedCoordinates?.lat ?? job.lat ?? '');
  const [longitude, setLongitude] = useState(() => pickedCoordinates?.lng ?? job.lng ?? '');
  const [mapsUrlInput, setMapsUrlInput] = useState(pickedCoordinates ? '' : ('mapsUrl' in job && typeof job.mapsUrl === 'string' ? job.mapsUrl : ''));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isPickingLocation) {
      if (dialog.open) dialog.close();
    } else if (!dialog.open) dialog.showModal();
  }, [isPickingLocation]);

  useEffect(() => () => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  }, []);

  useEffect(() => {
    if (!pickedCoordinates) return;
    setLatitude(String(pickedCoordinates.lat));
    setLongitude(String(pickedCoordinates.lng));
    setMapsUrlInput('');
  }, [pickedCoordinates?.lat, pickedCoordinates?.lng]);

  const handleMapsChange = (value: string) => {
    setMapsUrlInput(value);
    setError('');
    const parsed = parseCoordinatesInput(value);
    if (parsed) {
      setLatitude(String(parsed.lat));
      setLongitude(String(parsed.lng));
    } else if (value.trim()) {
      setLatitude('');
      setLongitude('');
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || latitude === '' || longitude === '') {
      setError('Selecciona un punto en el mapa o ingresa latitud y longitud.');
      return;
    }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) {
      setError('Las coordenadas deben estar dentro del rango válido y señalar una ubicación real.');
      return;
    }
    const mapsUrl = acceptedGoogleMapsUrl(mapsUrlInput);
    if (mapsUrlInput.trim() && !mapsUrl && !parseCoordinatesInput(mapsUrlInput)) {
      setError('Usa un enlace HTTPS de Google Maps o pega coordenadas en formato latitud, longitud.');
      return;
    }

    setSaving(true);
    try {
      await onSaveLocation(job.id, { address: address.trim(), lat, lng, mapsUrl });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la ubicación. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="ws-location-dialog"
      aria-labelledby="ws-location-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <header className="ws-location-head">
        <div className="ws-location-icon"><MapPin size={18} aria-hidden="true" /></div>
        <div><span>INSTALACIÓN</span><h2 id="ws-location-title">Ubicación del trabajo</h2><p>{job.code} · {job.title}</p></div>
        <button className="ws-location-close" type="button" onClick={onClose} aria-label="Cerrar ubicación"><X size={18} /></button>
      </header>

      <form className="ws-location-form" onSubmit={(event) => void save(event)}>
        <label className="ws-location-field">
          <span>Dirección o referencia <b aria-hidden="true">*</b></span>
          <input autoFocus required maxLength={300} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Calle, sector y referencia para encontrar el lugar" />
        </label>
        <label className="ws-location-field">
          <span>Enlace de Google Maps o coordenadas</span>
          <input value={mapsUrlInput} onChange={(event) => handleMapsChange(event.target.value)} placeholder="https://maps.app.goo.gl/... o -2.1343, -79.5938" />
          <small>Las coordenadas detectadas se pueden revisar antes de guardarlas.</small>
        </label>

        <div className="ws-location-coordinates">
          <label className="ws-location-field"><span>Latitud <b aria-hidden="true">*</b></span><input required inputMode="decimal" value={latitude} onChange={(event) => { setLatitude(event.target.value); setMapsUrlInput(''); }} placeholder="-2.1343" /></label>
          <label className="ws-location-field"><span>Longitud <b aria-hidden="true">*</b></span><input required inputMode="decimal" value={longitude} onChange={(event) => { setLongitude(event.target.value); setMapsUrlInput(''); }} placeholder="-79.5938" /></label>
        </div>

        {onRequestMapPick && <button className="ws-location-pick" type="button" disabled={saving} onClick={onRequestMapPick}><MapPin size={15} /> Seleccionar punto directamente en el mapa</button>}
        {error && <p className="ws-location-error" role="alert">{error}</p>}
        <footer className="ws-location-actions">
          <button type="button" className="button button-outline" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="button button-dark" disabled={saving}>{saving ? 'Guardando…' : 'Guardar ubicación'}</button>
        </footer>
      </form>
    </dialog>
  );
}
