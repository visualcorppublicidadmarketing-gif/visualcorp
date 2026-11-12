import React, { useState } from 'react';
import {
  X,
  MapPin,
  Compass,
  Check,
  Search,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import {
  type InstallationWorkOrder,
  MILAGRO_LANDMARKS,
  MILAGRO_CENTER,
  parseCoordinatesInput,
} from '../../lib/geospatialProximity';

interface LocationEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: InstallationWorkOrder | null;
  onSaveLocation: (
    jobId: string,
    data: {
      address: string;
      lat: number;
      lng: number;
      referenceNotes: string;
    }
  ) => void;
}

export const LocationEditorModal: React.FC<LocationEditorModalProps> = ({
  isOpen,
  onClose,
  job,
  onSaveLocation,
}) => {
  if (!isOpen || !job) return null;

  const [address, setAddress] = useState(job.address || '');
  const [lat, setLat] = useState(job.lat && Number.isFinite(job.lat) ? String(job.lat) : String(MILAGRO_CENTER.lat));
  const [lng, setLng] = useState(job.lng && Number.isFinite(job.lng) ? String(job.lng) : String(MILAGRO_CENTER.lng));
  const [referenceNotes, setReferenceNotes] = useState(job.referenceNotes || '');
  const [mapsUrlInput, setMapsUrlInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Manejador al pegar enlace de Google Maps o coordenadas directas
  const handleParseMapsInput = (inputVal: string) => {
    setMapsUrlInput(inputVal);
    setErrorMsg('');
    const parsed = parseCoordinatesInput(inputVal);
    if (parsed) {
      setLat(String(parsed.lat));
      setLng(String(parsed.lng));
    }
  };

  // Manejador al seleccionar un punto de referencia de Milagro
  const handleSelectLandmark = (landmark: typeof MILAGRO_LANDMARKS[0]) => {
    setLat(String(landmark.lat));
    setLng(String(landmark.lng));
    if (!address.trim()) {
      setAddress(landmark.name);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const numLat = Number(lat);
    const numLng = Number(lng);

    if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) {
      setErrorMsg('Las coordenadas deben ser números válidos.');
      return;
    }

    if (Math.abs(numLat) > 90 || Math.abs(numLng) > 180) {
      setErrorMsg('Latitud (-90 a 90) o Longitud (-180 a 180) fuera de rango.');
      return;
    }

    onSaveLocation(job.id, {
      address: address.trim(),
      lat: numLat,
      lng: numLng,
      referenceNotes: referenceNotes.trim(),
    });

    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0f172a',
          color: '#f8fafc',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              <MapPin size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>
                Georreferenciar Instalación
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                {job.code} · {job.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'grid', gap: '16px' }}>
          {/* Pegar enlace de Google Maps o Coordenadas rápidas */}
          <div
            style={{
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px dashed rgba(59, 130, 246, 0.4)',
              borderRadius: '10px',
              padding: '12px 14px',
            }}
          >
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#38bdf8', marginBottom: '6px' }}>
              Pegar enlace de Google Maps o Coordenadas GPS
            </label>
            <input
              type="text"
              placeholder="Ej. https://maps.app.goo.gl/... o -2.1343, -79.5938"
              value={mapsUrlInput}
              onChange={(e) => handleParseMapsInput(e.target.value)}
              style={{
                width: '100%',
                background: '#020617',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                padding: '8px 12px',
                color: '#fff',
                fontSize: '12.5px',
                boxSizing: 'border-box',
              }}
            />
            <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
              Detecta automáticamente latitud y longitud desde cualquier enlace de Google Maps o chat de WhatsApp.
            </span>
          </div>

          {/* Dirección en texto */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '6px' }}>
              Dirección de Instalación / Referencia Física
            </label>
            <input
              type="text"
              required
              placeholder="Ej. Av. 17 de Septiembre y Colón, frente a la farmacia"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={{
                width: '100%',
                background: '#020617',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '9px 12px',
                color: '#fff',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Coordenadas Decimales Exactas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                Latitud (GPS)
              </label>
              <input
                type="text"
                required
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                style={{
                  width: '100%',
                  background: '#020617',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  color: '#fff',
                  fontSize: '12.5px',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                Longitud (GPS)
              </label>
              <input
                type="text"
                required
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                style={{
                  width: '100%',
                  background: '#020617',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  color: '#fff',
                  fontSize: '12.5px',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Puntos de Referencia Frecuentes en Milagro */}
          <div>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>
              <Compass size={12} style={{ display: 'inline', marginRight: '4px' }} />
              Zonas y Referencias Frecuentes en Milagro (clic para asignar):
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {MILAGRO_LANDMARKS.slice(0, 8).map((lm) => (
                <button
                  key={lm.id}
                  type="button"
                  onClick={() => handleSelectLandmark(lm)}
                  style={{
                    background: 'rgba(30, 41, 59, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#2563eb';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(30, 41, 59, 0.8)';
                    e.currentTarget.style.color = '#e2e8f0';
                  }}
                >
                  {lm.name.split('/')[0].trim()}
                </button>
              ))}
            </div>
          </div>

          {/* Notas de Cuadrilla e Instalación */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '6px' }}>
              Notas Técnicas para la Cuadrilla (Herramientas, andamio, persona de contacto)
            </label>
            <textarea
              rows={2}
              placeholder="Ej. Llevar escalera de 4 cuerpos y taladro percutor. Contactar a Don Luis al llegar."
              value={referenceNotes}
              onChange={(e) => setReferenceNotes(e.target.value)}
              style={{
                width: '100%',
                background: '#020617',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '8px 12px',
                color: '#fff',
                fontSize: '12.5px',
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </div>

          {errorMsg && (
            <div style={{ background: '#7f1d1d', color: '#fecaca', padding: '8px 12px', borderRadius: '6px', fontSize: '12px' }}>
              {errorMsg}
            </div>
          )}

          {/* Botones de Acción */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#cbd5e1',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              style={{
                background: '#2563eb',
                border: 'none',
                color: '#fff',
                padding: '8px 18px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Check size={16} />
              Guardar Ubicación
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
