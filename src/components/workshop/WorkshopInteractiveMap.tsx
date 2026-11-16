import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  NavigationControl,
  Popup as MapLibrePopup,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Box, Layers, MapPin, Maximize2, Minimize2, Navigation, Sparkles, Truck, X } from 'lucide-react';
import {
  type GeoCoordinates,
  type InstallationWorkOrder,
  type ProximityCluster,
  type ProximityPair,
  MILAGRO_CENTER,
  clusterJobsByProximity,
  detectProximityPairs,
  hasGeoCoordinates,
} from '../../lib/geospatialProximity';
import {
  buildConnectionLinesFeatureCollection,
  buildHalosFeatureCollection,
  enable3DBuildings,
  registerProximityLayers,
  toggle3DCameraView,
} from '../../lib/maplibreGeospatial';
import {
  DEFAULT_WORKSHOP_SPECIAL_PINS,
  type WorkshopSpecialPin,
  type WorkshopSpecialPinKey,
} from '../../lib/workshopSpecialMapPins';
import './workshop-map.css';

setWorkerUrl(workerUrl);

export type OpenFreeMapStyleKey = 'liberty' | 'positron' | 'bright' | 'dark';

export const OPENFREEMAP_STYLES: Record<OpenFreeMapStyleKey, { url: string; label: string }> = {
  liberty: { url: 'https://tiles.openfreemap.org/styles/liberty', label: 'Liberty' },
  positron: { url: 'https://tiles.openfreemap.org/styles/positron', label: 'Positron' },
  bright: { url: 'https://tiles.openfreemap.org/styles/bright', label: 'Bright' },
  dark: { url: 'https://tiles.openfreemap.org/styles/dark', label: 'Oscuro' },
};

export interface WorkshopInteractiveMapProps {
  jobs: readonly InstallationWorkOrder[];
  clusters?: readonly ProximityCluster[];
  proximityPairs?: readonly ProximityPair[];
  selectedJobId?: string | null;
  onSelectJob?: (job: InstallationWorkOrder) => void;
  onEditLocation?: (job: InstallationWorkOrder) => void;
  onViewDetail?: (jobId: string) => void;
  onLocationPick?: (coords: GeoCoordinates) => void;
  onCancelLocationPick?: () => void;
  specialPins?: readonly WorkshopSpecialPin[];
  specialPinsReady?: boolean;
  canEditSpecialPins?: boolean;
  onMoveSpecialPin?: (key: WorkshopSpecialPinKey, coords: GeoCoordinates) => Promise<void>;
  pickingMode?: boolean;
  initialCenter?: GeoCoordinates;
  initialZoom?: number;
  proximityThresholdMeters?: number;
  className?: string;
}

type MapData = {
  jobs: readonly InstallationWorkOrder[];
  clusters: readonly ProximityCluster[];
  pairs: readonly ProximityPair[];
  specialPins: readonly WorkshopSpecialPin[];
  canEditSpecialPins: boolean;
  onMoveSpecialPin?: (key: WorkshopSpecialPinKey, coords: GeoCoordinates) => Promise<void>;
  showHalos: boolean;
  showLines: boolean;
  is3DMode: boolean;
  pickingMode: boolean;
  onLocationPick?: (coords: GeoCoordinates) => void;
  onSelectJob?: (job: InstallationWorkOrder) => void;
  onEditLocation?: (job: InstallationWorkOrder) => void;
  onViewDetail?: (jobId: string) => void;
};

function appendText(parent: HTMLElement, tag: 'div' | 'span' | 'h3' | 'p', className: string, value: string) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  parent.append(element);
  return element;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function makePopup(
  job: InstallationWorkOrder,
  onSelectJob?: (job: InstallationWorkOrder) => void,
  onEditLocation?: (job: InstallationWorkOrder) => void,
  onViewDetail?: (jobId: string) => void,
) {
  const content = document.createElement('div');
  content.className = 'vc-map-popup-card';
  const header = document.createElement('div');
  header.className = 'vc-map-popup-header';
  appendText(header, 'span', 'vc-map-popup-code', job.code);
  const state = appendText(header, 'span', 'vc-map-popup-tag', job.status.replaceAll('_', ' '));
  state.dataset.status = job.status;
  content.append(header);
  appendText(content, 'h3', 'vc-map-popup-title', job.title);
  appendText(content, 'p', 'vc-map-popup-client', job.clientName || 'Cliente pendiente');
  appendText(content, 'div', 'vc-map-popup-address', job.address || 'Ubicación sin dirección detallada');
  const date = job.executionDate || job.scheduledDate;
  if (date) appendText(content, 'div', 'vc-map-popup-date', `Fecha registrada: ${date}`);

  const actions = document.createElement('div');
  actions.className = 'vc-map-popup-actions';

  if (onViewDetail) {
    const detailButton = document.createElement('button');
    detailButton.type = 'button';
    detailButton.className = 'vc-map-popup-btn is-detail';
    detailButton.textContent = 'Ver ficha';
    detailButton.addEventListener('click', () => onViewDetail(job.id));
    actions.append(detailButton);
  }

  if (onSelectJob) {
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'vc-map-popup-btn is-primary';
    openButton.textContent = 'Seleccionar';
    openButton.addEventListener('click', () => onSelectJob(job));
    actions.append(openButton);
  }

  if (onEditLocation) {
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'vc-map-popup-btn is-edit';
    editButton.textContent = 'Editar ubicación';
    editButton.addEventListener('click', () => onEditLocation(job));
    actions.append(editButton);
  }

  if (actions.children.length > 0) {
    content.append(actions);
  }
  return content;
}

function makeSpecialPinPopup(pin: WorkshopSpecialPin, canEdit: boolean) {
  const content = document.createElement('div');
  content.className = 'vc-map-popup-card vc-map-popup-location-card';
  const header = document.createElement('div');
  header.className = 'vc-map-popup-header';
  appendText(header, 'span', 'vc-map-popup-code', 'SEDE');
  appendText(header, 'span', `vc-map-popup-location-state${pin.verified ? ' is-verified' : ''}`, pin.verified ? 'Confirmada' : 'Referencia');
  content.append(header);
  appendText(content, 'h3', 'vc-map-popup-title', pin.name);
  appendText(content, 'div', 'vc-map-popup-address', pin.address || 'Milagro, Guayas');
  appendText(
    content,
    'p',
    'vc-map-popup-location-hint',
    canEdit
      ? 'Arrastra este marcador para ajustar su posición. Se guarda al soltarlo.'
      : 'Solo el propietario puede mover este marcador.',
  );
  return content;
}

function markerStateClass(job: InstallationWorkOrder, selected: boolean, clustered: boolean) {
  if (selected) return 'is-selected';
  if (job.priority === 'urgente') return 'is-urgent';
  if (clustered) return 'is-cluster';
  if (job.status === 'completed') return 'is-completed';
  return '';
}

export function WorkshopInteractiveMap({
  jobs,
  clusters,
  proximityPairs,
  selectedJobId = null,
  onSelectJob,
  onEditLocation,
  onViewDetail,
  onLocationPick,
  onCancelLocationPick,
  specialPins = DEFAULT_WORKSHOP_SPECIAL_PINS,
  specialPinsReady = true,
  canEditSpecialPins = false,
  onMoveSpecialPin,
  pickingMode = false,
  initialCenter = MILAGRO_CENTER,
  initialZoom = 14.3,
  proximityThresholdMeters = 500,
  className = '',
}: WorkshopInteractiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const specialMarkersRef = useRef<Map<WorkshopSpecialPinKey, MapLibreMarker>>(new Map());
  const pickMarkerRef = useRef<MapLibreMarker | null>(null);
  const hasFitInitialBoundsRef = useRef(false);
  const [activeStyle, setActiveStyle] = useState<OpenFreeMapStyleKey>('positron');
  const [is3DMode, setIs3DMode] = useState(false);
  const [showHalos, setShowHalos] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [specialPinFeedback, setSpecialPinFeedback] = useState('');

  const derivedPairs = useMemo(
    () => proximityPairs || detectProximityPairs([...jobs], proximityThresholdMeters),
    [jobs, proximityPairs, proximityThresholdMeters],
  );
  const derivedClusters = useMemo(
    () => clusters || clusterJobsByProximity([...jobs], proximityThresholdMeters),
    [jobs, clusters, proximityThresholdMeters],
  );
  const dataRef = useRef<MapData>({
    jobs, clusters: derivedClusters, pairs: derivedPairs, showHalos, showLines, is3DMode,
    pickingMode, onLocationPick, onSelectJob, onEditLocation, onViewDetail,
    specialPins, canEditSpecialPins, onMoveSpecialPin,
  });
  dataRef.current = {
    jobs, clusters: derivedClusters, pairs: derivedPairs, showHalos, showLines, is3DMode,
    pickingMode, onLocationPick, onSelectJob, onEditLocation, onViewDetail,
    specialPins, canEditSpecialPins, onMoveSpecialPin,
  };

  const updateDataSources = () => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const current = dataRef.current;
    const halos = map.getSource('proximity-halos') as GeoJSONSource | undefined;
    halos?.setData(current.showHalos
      ? buildHalosFeatureCollection([...current.jobs].filter(hasGeoCoordinates), proximityThresholdMeters)
      : { type: 'FeatureCollection', features: [] });
    const lines = map.getSource('proximity-lines') as GeoJSONSource | undefined;
    lines?.setData(current.showLines
      ? buildConnectionLinesFeatureCollection([...current.pairs])
      : { type: 'FeatureCollection', features: [] });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return undefined;
    const map = new MapLibreMap({
      container,
      style: OPENFREEMAP_STYLES[activeStyle].url,
      center: [initialCenter.lng, initialCenter.lat],
      zoom: initialZoom,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    });
    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => {
      registerProximityLayers(map);
      updateDataSources();
      requestAnimationFrame(() => map.resize());
    });
    map.on('style.load', () => {
      registerProximityLayers(map);
      updateDataSources();
      if (dataRef.current.is3DMode) enable3DBuildings(map);
    });
    map.on('click', (event) => {
      const current = dataRef.current;
      if (!current.pickingMode || !current.onLocationPick) return;
      const point = { lat: event.lngLat.lat, lng: event.lngLat.lng };
      current.onLocationPick(point);
      if (pickMarkerRef.current) {
        pickMarkerRef.current.setLngLat([point.lng, point.lat]);
        return;
      }
      const pin = document.createElement('span');
      pin.className = 'vc-map-pick-pin';
      pin.setAttribute('aria-hidden', 'true');
      pin.textContent = '•';
      pickMarkerRef.current = new MapLibreMarker({ element: pin, draggable: true })
        .setLngLat([point.lng, point.lat]).addTo(map);
      pickMarkerRef.current.on('dragend', () => {
        const currentPosition = pickMarkerRef.current?.getLngLat();
        if (currentPosition) dataRef.current.onLocationPick?.({ lat: currentPosition.lat, lng: currentPosition.lng });
      });
    });
    mapRef.current = map;
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => map.resize());
    observer?.observe(container);
    return () => {
      observer?.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      specialMarkersRef.current.forEach((marker) => marker.remove());
      specialMarkersRef.current.clear();
      pickMarkerRef.current?.remove();
      pickMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      hasFitInitialBoundsRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (pickingMode) return;
    pickMarkerRef.current?.remove();
    pickMarkerRef.current = null;
  }, [pickingMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const currentJobs = jobs.filter(hasGeoCoordinates);
    updateDataSources();
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    specialMarkersRef.current.forEach((marker) => marker.remove());
    specialMarkersRef.current.clear();
    const bounds = new LngLatBounds();

    currentJobs.forEach((job) => {
      bounds.extend([job.lng, job.lat]);
      const clustered = derivedClusters.some((cluster) => cluster.jobs.some((item) => item.id === job.id));
      const selected = selectedJobId === job.id;
      const stateClass = markerStateClass(job, selected, clustered);
      const shortCode = job.code.replace(/^(?:OT-|COT-)/i, '').slice(-4) || 'OT';
      const markerButton = document.createElement('button');
      markerButton.type = 'button';
      markerButton.className = 'vc-map-custom-pin vc-map-marker-button';
      markerButton.setAttribute('aria-label', `${job.code}: ${job.title}. ${job.address || 'Ubicación de instalación'}`);
      const wrapper = document.createElement('span');
      wrapper.className = 'vc-pin-wrapper';
      wrapper.setAttribute('aria-hidden', 'true');
      const head = document.createElement('span');
      head.className = `vc-pin-head ${stateClass}`.trim();
      head.textContent = shortCode;
      const tip = document.createElement('span');
      tip.className = 'vc-pin-tip';
      wrapper.append(head, tip);
      markerButton.append(wrapper);
      markerButton.addEventListener('click', (event) => {
        event.stopPropagation();
        dataRef.current.onSelectJob?.(job);
      });
      const popup = new MapLibrePopup({ offset: [0, -36], closeButton: true, closeOnClick: false })
        .setDOMContent(makePopup(job, onSelectJob, onEditLocation, onViewDetail));
      const marker = new MapLibreMarker({ element: markerButton, anchor: 'bottom' })
        .setLngLat([job.lng, job.lat]).setPopup(popup).addTo(map);
      markersRef.current.push(marker);
    });

    const canDragSpecialPins = canEditSpecialPins && Boolean(onMoveSpecialPin) && !pickingMode;
    specialPins.forEach((pin) => {
      bounds.extend([pin.lng, pin.lat]);
      const marker = new MapLibreMarker({
        color: pin.key === 'visual-corp' ? '#8d2c86' : '#0f766e',
        draggable: canDragSpecialPins,
      })
        .setLngLat([pin.lng, pin.lat])
        .setPopup(new MapLibrePopup({ offset: 24, closeButton: true, closeOnClick: true })
          .setDOMContent(makeSpecialPinPopup(pin, canDragSpecialPins)))
        .addTo(map);
      marker.getElement().setAttribute(
        'aria-label',
        `${pin.name}, ${pin.address}. ${canDragSpecialPins ? 'Arrastra para ajustar la ubicación.' : 'Solo el propietario puede mover este marcador.'}`,
      );
      if (canDragSpecialPins) {
        marker.on('dragstart', () => setSpecialPinFeedback(`Guardando la nueva ubicación de ${pin.name} al soltar…`));
        marker.on('dragend', () => {
          const position = marker.getLngLat();
          const savePin = dataRef.current.onMoveSpecialPin;
          if (!savePin) {
            marker.setLngLat([pin.lng, pin.lat]);
            setSpecialPinFeedback('No se pudo guardar. Vuelve a intentarlo cuando haya conexión.');
            return;
          }
          marker.setDraggable(false);
          void savePin(pin.key, { lat: position.lat, lng: position.lng })
            .then(() => setSpecialPinFeedback(`${pin.name}: ubicación guardada.`))
            .catch(() => {
              marker.setLngLat([pin.lng, pin.lat]);
              marker.setDraggable(true);
              setSpecialPinFeedback(`No se guardó la ubicación de ${pin.name}. Revisa la conexión y vuelve a intentarlo.`);
            });
        });
      }
      specialMarkersRef.current.set(pin.key, marker);
    });

    if ((currentJobs.length > 0 || specialPins.length > 0)
      && specialPinsReady
      && !hasFitInitialBoundsRef.current
      && !selectedJobId
      && !pickingMode) {
      map.fitBounds(bounds, { padding: 64, maxZoom: 16, duration: 0 });
      hasFitInitialBoundsRef.current = true;
    }
  }, [jobs, derivedClusters, derivedPairs, selectedJobId, showHalos, showLines, pickingMode, onSelectJob, onEditLocation, onViewDetail, proximityThresholdMeters, specialPins, specialPinsReady, canEditSpecialPins, onMoveSpecialPin]);

  // Vuelo controlado con soporte estricto de prefers-reduced-motion
  useEffect(() => {
    if (!selectedJobId || !mapRef.current) return;
    const target = jobs.find((job) => job.id === selectedJobId);
    if (target && hasGeoCoordinates(target)) {
      if (prefersReducedMotion()) {
        mapRef.current.jumpTo({ center: [target.lng, target.lat], zoom: 16 });
      } else {
        mapRef.current.flyTo({ center: [target.lng, target.lat], zoom: 16, duration: 650, essential: false });
      }
    }
  }, [selectedJobId, jobs]);

  useEffect(() => {
    const resizeFrame = requestAnimationFrame(() => mapRef.current?.resize());
    if (!isFullscreen) return () => cancelAnimationFrame(resizeFrame);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(resizeFrame);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullscreen]);

  const handleStyleChange = (styleKey: OpenFreeMapStyleKey) => {
    if (styleKey === activeStyle || !mapRef.current) return;
    setActiveStyle(styleKey);
    mapRef.current.setStyle(OPENFREEMAP_STYLES[styleKey].url);
  };

  const handleToggle3D = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !is3DMode;
    setIs3DMode(next);
    toggle3DCameraView(map, next);
    if (next) enable3DBuildings(map);
  };

  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;
    if (prefersReducedMotion()) {
      map.jumpTo({
        center: [initialCenter.lng, initialCenter.lat],
        zoom: initialZoom,
        pitch: is3DMode ? 52 : 0,
        bearing: 0,
      });
    } else {
      map.flyTo({
        center: [initialCenter.lng, initialCenter.lat],
        zoom: initialZoom,
        pitch: is3DMode ? 52 : 0,
        bearing: 0,
        duration: 650,
      });
    }
  };

  const validJobs = jobs.filter(hasGeoCoordinates);
  const installationJobs = jobs.filter((job) => job.requiresInstallation);
  const unmappedCount = installationJobs.filter((job) => !hasGeoCoordinates(job)).length;
  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId), [jobs, selectedJobId]);
  const focusSpecialPin = (pin: WorkshopSpecialPin) => {
    const map = mapRef.current;
    if (!map) return;
    const camera = { center: [pin.lng, pin.lat] as [number, number], zoom: 16 };
    if (prefersReducedMotion()) map.jumpTo(camera);
    else map.flyTo({ ...camera, duration: 500, essential: false });
  };

  return (
    <section
      className={`vc-workshop-map-container ${isFullscreen ? 'is-fullscreen' : ''} ${className}`.trim()}
      aria-label="Mapa interactivo de instalaciones de taller"
    >
      <div className="vc-map-top-bar">
        <div className="vc-map-badge-group" aria-live="polite">
          <span className="vc-map-info-pill">
            <Truck size={14} aria-hidden="true" />
            <span>{validJobs.length} {validJobs.length === 1 ? 'pin en mapa' : 'pines en mapa'}</span>
          </span>
          {specialPins.length > 0 && (
            <span className="vc-map-info-pill is-location">
              <MapPin size={14} aria-hidden="true" />
              <span>
                {specialPins.length} sedes fijas · {canEditSpecialPins
                  ? (pickingMode ? 'ajuste pausado' : 'puedes moverlas')
                  : 'solo lectura'}
              </span>
            </span>
          )}
          {unmappedCount > 0 && (
            <span className="vc-map-info-pill is-warning">
              <MapPin size={14} aria-hidden="true" />
              <span>{unmappedCount} {unmappedCount === 1 ? 'sin pin' : 'sin pin'}</span>
            </span>
          )}
          {derivedPairs.length > 0 && (
            <span className="vc-map-info-pill is-cluster">
              <Sparkles size={14} aria-hidden="true" />
              <span>{derivedPairs.length} {derivedPairs.length === 1 ? 'cercano' : 'cercanos'} (&lt;{proximityThresholdMeters}m)</span>
            </span>
          )}
        </div>
        <div className="vc-map-toolbar-actions" role="group" aria-label="Controles del mapa">
          <div className="vc-map-style-tools" role="group" aria-label="Estilo del mapa">
            {(Object.keys(OPENFREEMAP_STYLES) as OpenFreeMapStyleKey[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`vc-map-action-btn ${activeStyle === key ? 'is-active' : ''}`}
                aria-pressed={activeStyle === key}
                title={`Usar estilo ${OPENFREEMAP_STYLES[key].label}`}
                onClick={() => handleStyleChange(key)}
              >
                <span>{OPENFREEMAP_STYLES[key].label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`vc-map-action-btn ${is3DMode ? 'is-active' : ''}`}
            aria-pressed={is3DMode}
            title="Cambiar perspectiva 2D o 3D"
            onClick={handleToggle3D}
          >
            <Box size={14} aria-hidden="true" />
            <span>3D</span>
          </button>
          <button
            type="button"
            className={`vc-map-action-btn ${showHalos ? 'is-active' : ''}`}
            aria-pressed={showHalos}
            title="Mostrar u ocultar halos de proximidad"
            onClick={() => setShowHalos((value) => !value)}
          >
            <MapPin size={14} aria-hidden="true" />
            <span>Radios</span>
          </button>
          <button
            type="button"
            className={`vc-map-action-btn ${showLines ? 'is-active' : ''}`}
            aria-pressed={showLines}
            title="Mostrar u ocultar líneas de cercanía"
            onClick={() => setShowLines((value) => !value)}
          >
            <Layers size={14} aria-hidden="true" />
            <span>Líneas</span>
          </button>
          <button
            type="button"
            className="vc-map-action-btn"
            title="Volver a centrar en Milagro"
            onClick={handleRecenter}
          >
            <Navigation size={14} aria-hidden="true" />
            <span>Recentrar</span>
          </button>
          <button
            type="button"
            className="vc-map-action-btn"
            aria-pressed={isFullscreen}
            aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Abrir mapa en pantalla completa'}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            onClick={() => setIsFullscreen((value) => !value)}
          >
            {isFullscreen ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {pickingMode && onLocationPick && (
        <div className="vc-map-picking-banner">
          <MapPin size={15} aria-hidden="true" />
          <span>Haz clic en el mapa para marcar la ubicación de montaje. Arrastra el pin para ajustar.</span>
          {onCancelLocationPick && (
            <button className="vc-map-picking-cancel" type="button" onClick={onCancelLocationPick}>
              Cancelar
            </button>
          )}
        </div>
      )}

      <div ref={containerRef} className="vc-workshop-map-canvas" aria-label="Mapa interactivo de instalaciones" />

      {specialPinFeedback && (
        <div className="vc-map-special-pin-feedback" role="status" aria-live="polite">
          {specialPinFeedback}
        </div>
      )}

      {validJobs.length === 0 && specialPins.length === 0 && (
        <div className="vc-map-empty-overlay" role="status">
          <MapPin size={17} aria-hidden="true" />
          <span>{installationJobs.length ? 'No hay pines guardados para las instalaciones del filtro seleccionado.' : 'No hay instalaciones en este rango o filtro.'}</span>
        </div>
      )}

      {selectedJob && (
        <aside className="vc-map-selected-job-card" aria-label="Trabajo seleccionado en el mapa">
          <div className="vc-map-selected-job-info">
            <span className="vc-map-selected-job-code">{selectedJob.code}</span>
            <strong className="vc-map-selected-job-title">{selectedJob.title}</strong>
            <span className="vc-map-selected-job-meta">
              {selectedJob.clientName} · {selectedJob.address || 'Sin dirección específica'}
            </span>
          </div>
          <div className="vc-map-selected-job-actions">
            {onViewDetail && (
              <button
                type="button"
                className="vc-map-selected-job-btn is-primary"
                onClick={() => onViewDetail(selectedJob.id)}
              >
                Ver ficha
              </button>
            )}
            {onEditLocation && (
              <button
                type="button"
                className="vc-map-selected-job-btn is-edit"
                onClick={() => onEditLocation(selectedJob)}
              >
                Editar ubicación
              </button>
            )}
            {onSelectJob && (
              <button
                type="button"
                className="vc-map-selected-job-btn is-close"
                onClick={() => onSelectJob({ ...selectedJob, id: '' } as unknown as InstallationWorkOrder)}
                title="Cerrar detalle"
                aria-label="Cerrar detalle"
              >
                <X size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        </aside>
      )}

      <ul className="vc-map-accessible-list" aria-label="Lista accesible de ubicaciones en el mapa">
        {specialPins.map((pin) => (
          <li key={`special-${pin.key}`}>
            <div className="vc-map-acc-item">
              <button type="button" className="vc-map-acc-title-btn" onClick={() => focusSpecialPin(pin)}>
                {pin.name} · {pin.address} · {pin.verified ? 'Ubicación confirmada' : 'Referencia por confirmar'}
              </button>
            </div>
          </li>
        ))}
        {validJobs.map((job) => (
          <li key={job.id}>
            <div className="vc-map-acc-item">
              <button type="button" className="vc-map-acc-title-btn" onClick={() => onSelectJob?.(job)}>
                {job.code} · {job.title} · {job.address || 'Ubicación guardada'}
              </button>
              <div className="vc-map-acc-actions">
                {onViewDetail && (
                  <button type="button" className="vc-map-acc-action-btn" onClick={() => onViewDetail(job.id)}>
                    Ver ficha
                  </button>
                )}
                {onEditLocation && (
                  <button type="button" className="vc-map-acc-action-btn" onClick={() => onEditLocation(job)}>
                    Editar ubicación
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
