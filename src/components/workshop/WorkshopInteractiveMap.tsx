import React, { useEffect, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  Popup as MapLibrePopup,
  NavigationControl,
  AttributionControl,
  LngLatBounds,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import {
  Box,
  Compass,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  Navigation,
  RotateCcw,
  Sparkles,
  Truck,
} from 'lucide-react';
import {
  type InstallationWorkOrder,
  type ProximityCluster,
  type ProximityPair,
  MILAGRO_CENTER,
  formatDistance,
} from '../../lib/geospatialProximity';
import {
  buildHalosFeatureCollection,
  buildConnectionLinesFeatureCollection,
  registerProximityLayers,
  enable3DBuildings,
  toggle3DCameraView,
} from '../../lib/maplibreGeospatial';
import './workshop-map.css';

// Registrar el worker de MapLibre empaquetado por Vite a nivel de módulo
setWorkerUrl(workerUrl);

export type OpenFreeMapStyleKey = 'liberty' | 'positron' | 'bright' | 'dark';

export const OPENFREEMAP_STYLES: Record<OpenFreeMapStyleKey, { url: string; label: string }> = {
  liberty: {
    url: 'https://tiles.openfreemap.org/styles/liberty',
    label: 'Liberty (Detallado)',
  },
  positron: {
    url: 'https://tiles.openfreemap.org/styles/positron',
    label: 'Positron (Dashboard)',
  },
  bright: {
    url: 'https://tiles.openfreemap.org/styles/bright',
    label: 'Bright (Contraste)',
  },
  dark: {
    url: 'https://tiles.openfreemap.org/styles/dark',
    label: 'Dark (Noche)',
  },
};

interface WorkshopInteractiveMapProps {
  jobs: InstallationWorkOrder[];
  clusters: ProximityCluster[];
  proximityPairs: ProximityPair[];
  selectedJobId?: string | null;
  onSelectJob?: (job: InstallationWorkOrder) => void;
  onLocationPick?: (coords: { lat: number; lng: number }) => void;
  pickingMode?: boolean;
  className?: string;
}

export const WorkshopInteractiveMap: React.FC<WorkshopInteractiveMapProps> = ({
  jobs,
  clusters,
  proximityPairs,
  selectedJobId,
  onSelectJob,
  onLocationPick,
  pickingMode = false,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const pickMarkerRef = useRef<MapLibreMarker | null>(null);

  const [activeStyle, setActiveStyle] = useState<OpenFreeMapStyleKey>('positron');
  const [is3DMode, setIs3DMode] = useState(false);
  const [showHalos, setShowHalos] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 1. Inicialización de MapLibre GL JS con OpenFreeMap (Compatible con React 19)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: OPENFREEMAP_STYLES[activeStyle].url,
      center: [MILAGRO_CENTER.lng, MILAGRO_CENTER.lat], // MapLibre usa [lng, lat]
      zoom: 14.3,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    });

    // Control de navegación interactiva (zoom, brújula y pitch)
    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      registerProximityLayers(map);
      updateDataSources();
    });

    // Modo Click-to-Pin para georreferenciación
    map.on('click', (e) => {
      if (!pickingMode || !onLocationPick) return;
      const { lng, lat } = e.lngLat;
      onLocationPick({ lat, lng });

      if (pickMarkerRef.current) {
        pickMarkerRef.current.setLngLat([lng, lat]);
      } else {
        const el = document.createElement('div');
        el.className = 'vc-pin-wrapper';
        el.innerHTML = `
          <div class="vc-pin-head is-selected" style="background:#0284c7; border-color:#bae6fd;">
            🎯
          </div>
          <div class="vc-pin-tip" style="border-top-color:#0284c7;"></div>
        `;
        pickMarkerRef.current = new MapLibreMarker({ element: el, draggable: true })
          .setLngLat([lng, lat])
          .addTo(map);

        pickMarkerRef.current.on('dragend', () => {
          const pos = pickMarkerRef.current?.getLngLat();
          if (pos) onLocationPick({ lat: pos.lat, lng: pos.lng });
        });
      }
    });

    mapRef.current = map;

    // Invalida tamaño para asegurar cálculo correcto en renderizado inicial
    setTimeout(() => {
      map.resize();
    }, 250);

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (pickMarkerRef.current) {
        pickMarkerRef.current.remove();
        pickMarkerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. Función para actualizar fuentes GeoJSON (Halos y Líneas de Proximidad)
  const updateDataSources = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    // Capa de Halos (500m)
    const halosSource = map.getSource('proximity-halos') as GeoJSONSource | undefined;
    if (halosSource) {
      halosSource.setData(
        showHalos ? buildHalosFeatureCollection(jobs, 500) : { type: 'FeatureCollection', features: [] }
      );
    }

    // Capa de Líneas Conectoras (<500m)
    const linesSource = map.getSource('proximity-lines') as GeoJSONSource | undefined;
    if (linesSource) {
      linesSource.setData(
        showLines ? buildConnectionLinesFeatureCollection(proximityPairs) : { type: 'FeatureCollection', features: [] }
      );
    }
  };

  // 3. Renderizado de Marcadores DOM personalizados y actualización GeoJSON
  useEffect(() => {
    updateDataSources();

    const map = mapRef.current;
    if (!map) return;

    // Limpiar marcadores DOM previos
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const bounds = new LngLatBounds();
    let hasCoords = false;

    jobs.forEach((job) => {
      if (!Number.isFinite(job.lat) || !Number.isFinite(job.lng) || (job.lat === 0 && job.lng === 0)) return;

      hasCoords = true;
      bounds.extend([job.lng, job.lat]);

      const isSelected = selectedJobId === job.id;
      const isUrgent = job.priority === 'urgente';
      const inCluster = clusters.some((c) => c.jobs.some((j) => j.id === job.id));
      const isCompleted = job.status === 'completed';

      let stateClass = '';
      if (isSelected) stateClass = 'is-selected';
      else if (isUrgent) stateClass = 'is-urgent';
      else if (inCluster) stateClass = 'is-cluster';
      else if (isCompleted) stateClass = 'is-completed';

      const shortCode = job.code.replace(/^(?:OT-|COT-)/i, '').slice(-4);

      // Elemento DOM interactivo
      const el = document.createElement('div');
      el.className = 'vc-map-custom-pin';
      el.innerHTML = `
        <div class="vc-pin-wrapper">
          <div class="vc-pin-head ${stateClass}">
            ${(isUrgent || inCluster) && !isCompleted ? `
              <div class="vc-pin-ping">
                <div class="vc-pin-ping-ring"></div>
                <div class="vc-pin-ping-dot"></div>
              </div>
            ` : ''}
            <span>${shortCode}</span>
          </div>
          <div class="vc-pin-tip"></div>
        </div>
      `;

      // Popup informativo enriquecido con WhatsApp
      const tagBg = isUrgent ? '#dc2626' : inCluster ? '#d97706' : '#2563eb';
      const tagLabel = isUrgent ? '🚨 URGENTE' : inCluster ? '⚡ EN CLUSTER' : 'INSTALACIÓN';

      const whatsappUrl = job.clientPhone
        ? `https://wa.me/${job.clientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
            `Hola ${job.clientName}, te saluda el taller de Visual Corp para coordinar la instalación de tu trabajo ${job.code} en ${job.address}.`
          )}`
        : '';

      const popupHtml = `
        <div class="vc-map-popup-card">
          <div class="vc-map-popup-header">
            <span class="vc-map-popup-code">${job.code}</span>
            <span class="vc-map-popup-tag" style="background:${tagBg}; color:#fff;">${tagLabel}</span>
          </div>
          <h4 class="vc-map-popup-title">${job.title}</h4>
          <p class="vc-map-popup-client">👤 <b>${job.clientName}</b> ${job.clientPhone ? `· 📞 ${job.clientPhone}` : ''}</p>
          <div class="vc-map-popup-address">
            <span>📍</span>
            <span>${job.address || 'Ubicación sin dirección detallada'}</span>
          </div>
          ${job.scheduledDate ? `<div style="font-size:11px; color:#38bdf8; margin-bottom:8px;">📅 Fecha: <b>${job.scheduledDate}</b></div>` : ''}
          <div class="vc-map-popup-actions">
            ${whatsappUrl ? `
              <a href="${whatsappUrl}" target="_blank" rel="noreferrer" class="vc-map-popup-btn is-whatsapp">
                WhatsApp
              </a>
            ` : ''}
            <button type="button" class="vc-map-popup-btn is-primary" id="btn-select-${job.id}">
              Ver en cartelera
            </button>
          </div>
        </div>
      `;

      const popup = new MapLibrePopup({
        offset: [0, -36],
        closeButton: true,
        closeOnClick: false,
      }).setHTML(popupHtml);

      const marker = new MapLibreMarker({ element: el, anchor: 'bottom' })
        .setLngLat([job.lng, job.lat])
        .setPopup(popup)
        .addTo(map);

      el.addEventListener('click', () => {
        onSelectJob?.(job);
      });

      popup.on('open', () => {
        const btn = document.getElementById(`btn-select-${job.id}`);
        if (btn) {
          btn.onclick = () => {
            onSelectJob?.(job);
            popup.remove();
          };
        }
      });

      markersRef.current.push(marker);
    });

    // Encuadrar todos los puntos en el primer render
    if (hasCoords && !pickingMode && !selectedJobId) {
      map.fitBounds(bounds, { padding: 50, maxZoom: 16 });
    }
  }, [jobs, clusters, proximityPairs, selectedJobId, showHalos, showLines, pickingMode, onSelectJob]);

  // 4. Enfocar trabajo seleccionado en el mapa
  useEffect(() => {
    if (!selectedJobId || !mapRef.current) return;
    const target = jobs.find((j) => j.id === selectedJobId);
    if (target && Number.isFinite(target.lat) && Number.isFinite(target.lng)) {
      mapRef.current.flyTo({
        center: [target.lng, target.lat],
        zoom: 16,
        duration: 900,
        essential: true,
      });
    }
  }, [selectedJobId, jobs]);

  // Cambio dinámico de estilo OpenFreeMap
  const handleStyleChange = (styleKey: OpenFreeMapStyleKey) => {
    if (styleKey === activeStyle || !mapRef.current) return;
    setActiveStyle(styleKey);

    const map = mapRef.current;
    map.once('style.load', () => {
      registerProximityLayers(map);
      updateDataSources();
      if (is3DMode) {
        enable3DBuildings(map);
      }
    });

    map.setStyle(OPENFREEMAP_STYLES[styleKey].url);
  };

  // Alternancia de vista 3D / 2D
  const handleToggle3D = () => {
    if (!mapRef.current) return;
    const nextState = !is3DMode;
    setIs3DMode(nextState);
    toggle3DCameraView(mapRef.current, nextState);
    if (nextState) {
      enable3DBuildings(mapRef.current);
    }
  };

  // Recentrar en Milagro
  const handleRecenter = () => {
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [MILAGRO_CENTER.lng, MILAGRO_CENTER.lat],
        zoom: 14.3,
        pitch: is3DMode ? 52 : 0,
        bearing: 0,
        duration: 800,
      });
    }
  };

  // Pantalla completa
  const handleToggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
    setTimeout(() => {
      mapRef.current?.resize();
    }, 250);
  };

  const validJobsCount = jobs.filter((j) => Number.isFinite(j.lat) && Number.isFinite(j.lng)).length;

  return (
    <div className={`vc-workshop-map-container ${isFullscreen ? 'is-fullscreen' : ''} ${className}`}>
      {/* Barra superior de control OpenFreeMap */}
      <div className="vc-map-top-bar">
        <div className="vc-map-badge-group">
          <span className="vc-map-info-pill">
            <Truck size={13} style={{ color: '#38bdf8' }} />
            <span>OpenFreeMap · {validJobsCount} instalaciones</span>
          </span>

          {proximityPairs.length > 0 && (
            <span className="vc-map-info-pill is-cluster">
              <Sparkles size={13} />
              <span>{proximityPairs.length} {proximityPairs.length === 1 ? 'par cercano' : 'pares'} (&lt;500m)</span>
            </span>
          )}
        </div>

        <div className="vc-map-toolbar-actions">
          {/* Selector de Estilo Vectorial OpenFreeMap */}
          {(Object.keys(OPENFREEMAP_STYLES) as OpenFreeMapStyleKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`vc-map-action-btn ${activeStyle === key ? 'is-active' : ''}`}
              title={`Cambiar a estilo ${OPENFREEMAP_STYLES[key].label}`}
              onClick={() => handleStyleChange(key)}
            >
              <span>{key.toUpperCase()}</span>
            </button>
          ))}

          {/* Botón 3D / Isométrico */}
          <button
            type="button"
            className={`vc-map-action-btn ${is3DMode ? 'is-active' : ''}`}
            title="Activar vista isométrica 3D"
            onClick={handleToggle3D}
          >
            <Box size={13} />
            <span>3D {is3DMode ? 'ON' : 'OFF'}</span>
          </button>

          {/* Toggle Halos 500m */}
          <button
            type="button"
            className={`vc-map-action-btn ${showHalos ? 'is-active' : ''}`}
            title="Activar o desactivar círculos de 500m"
            onClick={() => {
              setShowHalos((p) => !p);
            }}
          >
            <span>Halos</span>
          </button>

          {/* Recentrar en Milagro */}
          <button
            type="button"
            className="vc-map-action-btn"
            title="Recentrar en Milagro"
            onClick={handleRecenter}
          >
            <Navigation size={13} />
            <span>Milagro</span>
          </button>

          {/* Pantalla completa */}
          <button
            type="button"
            className="vc-map-action-btn"
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            onClick={handleToggleFullscreen}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Banner de Modo "Click-to-Pin" */}
      {pickingMode && (
        <div className="vc-map-picking-banner">
          <MapPin size={15} />
          <span>Haz clic en el mapa vectorial para fijar las coordenadas exactas</span>
        </div>
      )}

      {/* Contenedor del Canvas WebGL de MapLibre */}
      <div ref={containerRef} className="vc-workshop-map-canvas" />
    </div>
  );
};
