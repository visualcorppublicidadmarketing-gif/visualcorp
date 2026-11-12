import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Maximize2,
  Minimize2,
  Navigation,
  Layers,
  MapPin,
  Sparkles,
  Truck,
  RotateCcw,
} from 'lucide-react';
import {
  type InstallationWorkOrder,
  type ProximityCluster,
  type ProximityPair,
  MILAGRO_CENTER,
  formatDistance,
} from '../../lib/geospatialProximity';
import './workshop-map.css';

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

type MapTileStyle = 'carto-light' | 'carto-dark' | 'osm';

const TILE_PROVIDERS: Record<MapTileStyle, { url: string; label: string; attribution: string }> = {
  'carto-light': {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    label: 'Carto Claro',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
  },
  'carto-dark': {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    label: 'Carto Oscuro',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
  },
  'osm': {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    label: 'OpenStreetMap',
    attribution: '&copy; OpenStreetMap contributors',
  },
};

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
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const markersGroupRef = useRef<L.LayerGroup>(L.layerGroup());
  const halosGroupRef = useRef<L.LayerGroup>(L.layerGroup());
  const linesGroupRef = useRef<L.LayerGroup>(L.layerGroup());
  const pickMarkerRef = useRef<L.Marker | null>(null);

  const [tileStyle, setTileStyle] = useState<MapTileStyle>('carto-light');
  const [showHalos, setShowHalos] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 1. Inicialización segura para React 19 (montaje único con cleanup estricto)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [MILAGRO_CENTER.lat, MILAGRO_CENTER.lng],
      zoom: 14,
      zoomControl: true,
      attributionControl: false,
    });

    const tileInfo = TILE_PROVIDERS[tileStyle];
    const initialTile = L.tileLayer(tileInfo.url, {
      maxZoom: 19,
      attribution: tileInfo.attribution,
    }).addTo(map);

    tileLayerRef.current = initialTile;

    // Agregar capas en orden (halos abajo, líneas al centro, pines arriba)
    halosGroupRef.current.addTo(map);
    linesGroupRef.current.addTo(map);
    markersGroupRef.current.addTo(map);

    mapRef.current = map;

    // Invalida tamaño para asegurar renderizado correcto al inicio
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. Cambio dinámico de proveedor de mapa (claro, oscuro, OSM)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const tileInfo = TILE_PROVIDERS[tileStyle];
    tileLayerRef.current = L.tileLayer(tileInfo.url, {
      maxZoom: 19,
      attribution: tileInfo.attribution,
    }).addTo(map);
  }, [tileStyle]);

  // 3. Manejo del modo de georreferenciación (Click-to-Pin)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (!pickingMode) return;
      const { lat, lng } = e.latlng;

      if (!pickMarkerRef.current) {
        const pickIcon = L.divIcon({
          className: 'vc-map-custom-pin',
          iconSize: [36, 42],
          iconAnchor: [18, 42],
          html: `
            <div class="vc-pin-wrapper">
              <div class="vc-pin-head is-selected" style="background:#0284c7; border-color:#bae6fd;">
                🎯
              </div>
              <div class="vc-pin-tip" style="border-top-color:#0284c7;"></div>
            </div>
          `,
        });

        pickMarkerRef.current = L.marker([lat, lng], { icon: pickIcon, draggable: true }).addTo(map);
        pickMarkerRef.current.on('dragend', () => {
          const pos = pickMarkerRef.current?.getLatLng();
          if (pos) onLocationPick?.({ lat: pos.lat, lng: pos.lng });
        });
      } else {
        pickMarkerRef.current.setLatLng([lat, lng]);
      }

      onLocationPick?.({ lat, lng });
    };

    if (pickingMode) {
      map.on('click', handleClick);
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.getContainer().style.cursor = '';
      if (pickMarkerRef.current) {
        map.removeLayer(pickMarkerRef.current);
        pickMarkerRef.current = null;
      }
    }

    return () => {
      map.off('click', handleClick);
    };
  }, [pickingMode, onLocationPick]);

  // 4. Renderizado inteligente de Halos, Líneas de Proximidad y Pines
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersGroupRef.current.clearLayers();
    halosGroupRef.current.clearLayers();
    linesGroupRef.current.clearLayers();

    const bounds: L.LatLngTuple[] = [];

    // --- HALOS DE PROXIMIDAD (Círculos de 500m / cluster) ---
    if (showHalos) {
      clusters.forEach((cluster) => {
        const radius = Math.max(350, Math.min(cluster.maxDistanceMeters * 0.8, 600));
        const circle = L.circle([cluster.center.lat, cluster.center.lng], {
          radius,
          color: '#d97706',
          fillColor: '#fbbf24',
          fillOpacity: 0.14,
          weight: 2,
          dashArray: '6, 6',
        });

        circle.bindTooltip(
          `<b>${cluster.label}</b><br><small>${cluster.recommendedAction}</small>`,
          { direction: 'top', className: 'vc-map-tooltip' }
        );

        halosGroupRef.current.addLayer(circle);
      });
    }

    // --- LÍNEAS DE CONEXIÓN ENTRE TRABAJOS CERCANOS ---
    if (showLines && proximityPairs.length > 0) {
      proximityPairs.forEach((pair) => {
        const isCritical = pair.distanceMeters <= 250;
        const color = isCritical ? '#ef4444' : '#f59e0b';

        const line = L.polyline(
          [
            [pair.jobA.lat, pair.jobA.lng],
            [pair.jobB.lat, pair.jobB.lng],
          ],
          {
            color,
            weight: 2.5,
            dashArray: '4, 6',
            opacity: 0.85,
          }
        );

        line.bindTooltip(
          `<b>Proximidad: ${formatDistance(pair.distanceMeters)}</b><br>${pair.jobA.code} ↔ ${pair.jobB.code}<br><small>${pair.sameDay ? '✓ Mismo día' : 'Fechas distintas'}</small>`,
          { sticky: true, className: 'vc-map-tooltip' }
        );

        linesGroupRef.current.addLayer(line);
      });
    }

    // --- MARCADORES / PINES DE CADA TRABAJO ---
    jobs.forEach((job) => {
      if (!Number.isFinite(job.lat) || !Number.isFinite(job.lng) || (job.lat === 0 && job.lng === 0)) return;

      const isSelected = selectedJobId === job.id;
      const isUrgent = job.priority === 'urgente';
      const inCluster = clusters.some((c) => c.jobs.some((j) => j.id === job.id));
      const isCompleted = job.status === 'completed';

      let stateClass = '';
      if (isSelected) stateClass = 'is-selected';
      else if (isUrgent) stateClass = 'is-urgent';
      else if (inCluster) stateClass = 'is-cluster';
      else if (isCompleted) stateClass = 'is-completed';

      // Código corto visible (ej "104" de "OT-2026-104")
      const shortCode = job.code.replace(/^(?:OT-|COT-)/i, '').slice(-4);

      const html = `
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

      const customIcon = L.divIcon({
        className: 'vc-map-custom-pin',
        iconSize: [36, 42],
        iconAnchor: [18, 42],
        popupAnchor: [0, -38],
        html,
      });

      const marker = L.marker([job.lat, job.lng], { icon: customIcon });

      marker.on('click', () => {
        onSelectJob?.(job);
      });

      // Contenido del Popup interactivo
      const tagBg = isUrgent ? '#dc2626' : inCluster ? '#d97706' : '#2563eb';
      const tagLabel = isUrgent ? '🚨 URGENTE' : inCluster ? '⚡ EN CLUSTER' : 'INSTALACIÓN';

      const whatsappUrl = job.clientPhone
        ? `https://wa.me/${job.clientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
            `Hola ${job.clientName}, te saluda el taller de Visual Corp. Nos comunicamos para coordinar la instalación de tu trabajo ${job.code} en ${job.address}.`
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

      marker.bindPopup(popupHtml);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`btn-select-${job.id}`);
        if (btn) {
          btn.onclick = () => {
            onSelectJob?.(job);
            marker.closePopup();
          };
        }
      });

      markersGroupRef.current.addLayer(marker);
      bounds.push([job.lat, job.lng]);
    });

    // Encuadrar todos los pines en pantalla automáticamente si hay al menos uno
    if (bounds.length > 0 && !pickingMode && !selectedJobId) {
      map.fitBounds(bounds, { padding: [45, 45], maxZoom: 16 });
    }
  }, [jobs, clusters, proximityPairs, selectedJobId, showHalos, showLines, pickingMode, onSelectJob]);

  // 5. Enfocar el mapa al cambiar la orden seleccionada
  useEffect(() => {
    if (!selectedJobId || !mapRef.current) return;
    const target = jobs.find((j) => j.id === selectedJobId);
    if (target && Number.isFinite(target.lat) && Number.isFinite(target.lng)) {
      mapRef.current.setView([target.lat, target.lng], 16, { animate: true });
    }
  }, [selectedJobId, jobs]);

  // Manejo de recentrado en Milagro
  const handleRecenter = () => {
    if (mapRef.current) {
      mapRef.current.setView([MILAGRO_CENTER.lat, MILAGRO_CENTER.lng], 14, { animate: true });
    }
  };

  // Toggle de pantalla completa
  const handleToggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
    setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 250);
  };

  const validJobsCount = jobs.filter((j) => Number.isFinite(j.lat) && Number.isFinite(j.lng)).length;

  return (
    <div className={`vc-workshop-map-container ${isFullscreen ? 'is-fullscreen' : ''} ${className}`}>
      {/* Barra superior de control e indicadores */}
      <div className="vc-map-top-bar">
        <div className="vc-map-badge-group">
          <span className="vc-map-info-pill">
            <Truck size={13} style={{ color: '#38bdf8' }} />
            <span>{validJobsCount} instalaciones georreferenciadas</span>
          </span>

          {proximityPairs.length > 0 && (
            <span className="vc-map-info-pill is-cluster">
              <Sparkles size={13} />
              <span>{proximityPairs.length} {proximityPairs.length === 1 ? 'par cercano' : 'pares cercanos'} (~cuadras)</span>
            </span>
          )}
        </div>

        <div className="vc-map-toolbar-actions">
          {/* Selector de capa de mapa */}
          <button
            type="button"
            className="vc-map-action-btn"
            title="Cambiar capa de mapa"
            onClick={() => {
              setTileStyle((curr) => (curr === 'carto-light' ? 'carto-dark' : curr === 'carto-dark' ? 'osm' : 'carto-light'));
            }}
          >
            <Layers size={13} />
            <span>{TILE_PROVIDERS[tileStyle].label}</span>
          </button>

          {/* Toggle de círculos de proximidad */}
          <button
            type="button"
            className={`vc-map-action-btn ${showHalos ? 'is-active' : ''}`}
            title="Activar o desactivar halos de 500m"
            onClick={() => setShowHalos((p) => !p)}
          >
            <span>Halos 500m</span>
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

      {/* Banner de aviso cuando está activo el modo "Click-to-Pin" */}
      {pickingMode && (
        <div className="vc-map-picking-banner">
          <MapPin size={15} />
          <span>Haz clic en el mapa para marcar la ubicación exacta de instalación</span>
        </div>
      )}

      {/* Canvas del mapa de Leaflet */}
      <div ref={containerRef} className="vc-workshop-map-canvas" />
    </div>
  );
};
