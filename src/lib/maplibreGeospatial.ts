/**
 * maplibreGeospatial.ts
 * Utilidades geoespaciales y capas vectoriales GeoJSON para OpenFreeMap + MapLibre GL JS en Visual Corp Suite.
 */

import type { Feature, FeatureCollection, Polygon, LineString } from 'geojson';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { InstallationWorkOrder, ProximityPair } from './geospatialProximity';

const EARTH_RADIUS_METERS = 6371000;

/**
 * Genera un Feature GeoJSON Polygon con un círculo geodésico exacto.
 * @param centerLng Longitud en grados [-180, 180]
 * @param centerLat Latitud en grados [-90, 90]
 * @param radiusMeters Radio en metros (ej. 500m)
 * @param steps Cantidad de vértices para suavidad visual (64 recomendado)
 * @param properties Propiedades asociadas al polígono
 */
export function createGeoJsonCircle(
  centerLng: number,
  centerLat: number,
  radiusMeters: number,
  steps = 64,
  properties: Record<string, unknown> = {}
): Feature<Polygon> {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const latRad = toRad(centerLat);
  const lngRad = toRad(centerLng);
  const angularDist = radiusMeters / EARTH_RADIUS_METERS;

  const coordinates: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    const bearing = (i * 2 * Math.PI) / steps;

    const pLat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDist) +
      Math.cos(latRad) * Math.sin(angularDist) * Math.cos(bearing)
    );

    const pLng =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDist) * Math.cos(latRad),
        Math.cos(angularDist) - Math.sin(latRad) * Math.sin(pLat)
      );

    const normLng = ((toDeg(pLng) + 540) % 360) - 180;
    coordinates.push([normLng, toDeg(pLat)]);
  }

  return {
    type: 'Feature',
    properties: {
      radiusMeters,
      ...properties,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
  };
}

/**
 * Construye una colección de polígonos de halo (500m) para las órdenes de instalación.
 */
export function buildHalosFeatureCollection(
  jobs: InstallationWorkOrder[],
  radiusMeters = 500
): FeatureCollection<Polygon> {
  const features = jobs
    .filter((j) => typeof j.lat === 'number' && typeof j.lng === 'number' && (j.lat !== 0 || j.lng !== 0))
    .map((job) =>
      createGeoJsonCircle(job.lng, job.lat, radiusMeters, 64, {
        jobId: job.id,
        code: job.code,
        status: job.status,
        color: job.priority === 'urgente' ? '#ef4444' : '#d97706',
      })
    );

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Genera Feature GeoJSON LineString entre dos puntos para órdenes conectadas (<500m).
 */
export function buildConnectionLinesFeatureCollection(
  pairs: ProximityPair[]
): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = pairs.map((pair, index) => ({
    type: 'Feature',
    properties: {
      id: `pair-${pair.jobA.id}-${pair.jobB.id}`,
      index,
      distanceMeters: pair.distanceMeters,
      sameDay: pair.sameDay,
      priorityLevel: pair.priorityLevel,
      color: pair.sameDay ? '#f59e0b' : '#6366f1',
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        [pair.jobA.lng, pair.jobA.lat],
        [pair.jobB.lng, pair.jobB.lat],
      ],
    },
  }));

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Registra fuentes GeoJSON y capas visuales para halos y líneas en MapLibre.
 */
export function registerProximityLayers(map: MapLibreMap) {
  // 1. Fuente y capas para Halos (500m)
  if (!map.getSource('proximity-halos')) {
    map.addSource('proximity-halos', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    // Relleno semitransparente
    map.addLayer({
      id: 'proximity-halos-fill',
      type: 'fill',
      source: 'proximity-halos',
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#d97706'],
        'fill-opacity': 0.14,
      },
    });

    // Borde delimitador discontinuo
    map.addLayer({
      id: 'proximity-halos-stroke',
      type: 'line',
      source: 'proximity-halos',
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#d97706'],
        'line-width': 1.8,
        'line-dasharray': [3, 2],
        'line-opacity': 0.8,
      },
    });
  }

  // 2. Fuente y capas para Líneas de Conexión (<500m)
  if (!map.getSource('proximity-lines')) {
    map.addSource('proximity-lines', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    map.addLayer({
      id: 'proximity-connection-lines',
      type: 'line',
      source: 'proximity-lines',
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': [
          'case',
          ['boolean', ['get', 'sameDay'], false],
          '#f59e0b',
          '#6366f1',
        ],
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 2,
          16, 4,
        ],
        'line-dasharray': [2, 2],
        'line-opacity': 0.85,
      },
    });
  }
}

/**
 * Habilita extrusión 3D sobre edificios de OpenFreeMap si están disponibles en la capa vectorial.
 */
export function enable3DBuildings(map: MapLibreMap) {
  if (map.getLayer('3d-buildings')) return;

  const style = map.getStyle();
  if (!style) return;
  const sources = style.sources || {};

  // Localizar dinámicamente la fuente de teselas vectoriales (ej. 'openmaptiles')
  let vectorSourceName = 'openmaptiles';
  for (const [key, src] of Object.entries(sources)) {
    if (src.type === 'vector') {
      vectorSourceName = key;
      break;
    }
  }

  const layers = style.layers || [];
  let labelLayerId: string | undefined;
  for (const layer of layers) {
    if (layer.type === 'symbol' && layer.layout && 'text-field' in layer.layout) {
      labelLayerId = layer.id;
      break;
    }
  }

  // Comprobar si existe la capa de edificios en la fuente
  try {
    map.addLayer(
      {
        id: '3d-buildings',
        source: vectorSourceName,
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': [
            'interpolate',
            ['linear'],
            ['get', 'render_height'],
            0, '#334155',
            20, '#1e293b',
            50, '#0f172a',
          ],
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            14, 0,
            14.5, ['coalesce', ['get', 'render_height'], 8],
          ],
          'fill-extrusion-base': [
            'interpolate',
            ['linear'],
            ['zoom'],
            14, 0,
            14.5, ['coalesce', ['get', 'render_min_height'], 0],
          ],
          'fill-extrusion-opacity': 0.7,
        },
      },
      labelLayerId
    );
  } catch {
    // Si la fuente no define 'building', se omite silenciosamente
  }
}

/**
 * Anima la cámara entre vista 2D cenital y 3D isométrica inclinada.
 */
export function toggle3DCameraView(map: MapLibreMap, enable3D: boolean) {
  if (enable3D) {
    map.easeTo({
      pitch: 52,
      bearing: -15,
      duration: 1000,
    });
  } else {
    map.easeTo({
      pitch: 0,
      bearing: 0,
      duration: 800,
    });
  }
}
