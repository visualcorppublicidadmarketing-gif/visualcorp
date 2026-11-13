/**
 * geospatialProximity.ts
 * Motor de inteligencia geoespacial y proximidad para instalaciones de taller en Visual Corp.
 *
 * Calcula distancias ortodrómicas exactas (Fórmula de Haversine), detecta pares y clusters
 * de proximidad en Milagro y zonas aledañas (Guayas), y genera recomendaciones logísticas
 * automáticas para optimizar cuadrillas y rutas de montaje.
 */

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export interface InstallationWorkOrder extends Partial<GeoCoordinates> {
  id: string;
  code: string;                 // ej. "OT-2026-104", "COT-842"
  title: string;                // ej. "Lona translúcida con estructura 3x2m"
  clientName: string;
  clientPhone?: string;
  address: string;
  referenceNotes?: string;
  scheduledDate: string;        // Formato ISO "YYYY-MM-DD"
  executionDate?: string;
  status: string;               // 'waiting' | 'ready' | 'in_progress' | 'quality_check' | 'ready_for_delivery' | 'completed'
  priority?: 'normal' | 'alta' | 'urgente';
  area?: 'taller' | 'diseno' | 'impresion' | 'sublimacion' | 'laser' | 'asesoria';
  technician?: string;
  requiresInstallation: boolean;
  specifications?: Record<string, unknown>;
}

export type LocatedInstallationWorkOrder = InstallationWorkOrder & GeoCoordinates;

export interface ProximityPair {
  jobA: LocatedInstallationWorkOrder;
  jobB: LocatedInstallationWorkOrder;
  distanceMeters: number;
  distanceBlocks: number;       // Estimado en cuadras estándar ecuatorianas (~100m)
  sameDay: boolean;
  priorityLevel: 'critical' | 'warning' | 'info';
  recommendation: string;
}

export interface ProximityCluster {
  id: string;
  date: string;
  center: GeoCoordinates;
  jobs: LocatedInstallationWorkOrder[];
  maxDistanceMeters: number;
  count: number;
  label: string;
  recommendedAction: string;
}

export function hasGeoCoordinates(job: InstallationWorkOrder): job is InstallationWorkOrder & GeoCoordinates {
  return Number.isFinite(job.lat) && Number.isFinite(job.lng)
    && Math.abs(job.lat as number) <= 90
    && Math.abs(job.lng as number) <= 180
    && (job.lat !== 0 || job.lng !== 0);
}

// Radio medio de la Tierra en metros
const EARTH_RADIUS_METERS = 6371000;

// Metros promedio por cuadra urbana en Milagro
const METERS_PER_BLOCK = 100;

/**
 * Puntos de referencia y zonas clave precargadas en Milagro, Guayas, Ecuador.
 * Permite a los técnicos y asesores ubicar con un clic sin necesidad de recordar coordenadas GPS.
 */
export const MILAGRO_LANDMARKS: Array<{ id: string; name: string; zone: string; lat: number; lng: number }> = [
  { id: 'parque-central', name: 'Parque Central / Municipio de Milagro', zone: 'Centro', lat: -2.1343, lng: -79.5938 },
  { id: 'av-17-septiembre', name: 'Av. 17 de Septiembre y Colón', zone: 'Centro - Comercial', lat: -2.1328, lng: -79.5912 },
  { id: 'av-garcia-moreno', name: 'Av. García Moreno y Seminario', zone: 'Centro Sur', lat: -2.1370, lng: -79.5955 },
  { id: 'paseo-shopping', name: 'Paseo Shopping Milagro', zone: 'Norte', lat: -2.1285, lng: -79.6010 },
  { id: 'unemi', name: 'UNEMI - Universidad Estatal de Milagro', zone: 'Oeste', lat: -2.1472, lng: -79.6018 },
  { id: 'mercado-central', name: 'Mercado Central / Av. Amazonas', zone: 'Centro', lat: -2.1332, lng: -79.5975 },
  { id: 'hospital-iess', name: 'Hospital IESS Milagro', zone: 'Este', lat: -2.1388, lng: -79.5895 },
  { id: 'terminal-terrestre', name: 'Terminal Terrestre de Milagro', zone: 'Norte', lat: -2.1250, lng: -79.5910 },
  { id: 'redondel-los-monos', name: 'Redondel de Los Monos / Vía Tura', zone: 'Acceso Sur', lat: -2.1435, lng: -79.5870 },
  { id: 'ciudadela-bellavista', name: 'Cdla. Bellavista / Las Piñas', zone: 'Suroeste', lat: -2.1395, lng: -79.6040 },
  { id: 'via-naranjito', name: 'Vía a Naranjito / Sector Industrial', zone: 'Sureste', lat: -2.1420, lng: -79.5780 },
  { id: 'taller-visualcorp', name: 'Taller Matriz Visual Corp (Milagro)', zone: 'Base Operativa', lat: -2.1350, lng: -79.5925 },
];

/**
 * Coordenadas por defecto (Centro de Milagro, Ecuador).
 */
export const MILAGRO_CENTER: GeoCoordinates = {
  lat: -2.1345,
  lng: -79.5942,
};

/**
 * Calcula la distancia ortodrómica exacta en metros entre dos puntos mediante la fórmula de Haversine.
 */
export function calculateHaversineDistance(pointA: GeoCoordinates, pointB: GeoCoordinates): number {
  if (!pointA || !pointB) return 0;
  if (pointA.lat === pointB.lat && pointA.lng === pointB.lng) return 0;

  const toRad = (angle: number) => (angle * Math.PI) / 180;
  const dLat = toRad(pointB.lat - pointA.lat);
  const dLng = toRad(pointB.lng - pointA.lng);

  const lat1 = toRad(pointA.lat);
  const lat2 = toRad(pointB.lat);

  const sinDLat2 = Math.sin(dLat / 2);
  const sinDLng2 = Math.sin(dLng / 2);

  const a = Math.min(1, Math.max(0,
    sinDLat2 * sinDLat2 +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng2 * sinDLng2,
  ));

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

/**
 * Convierte metros a número aproximado de cuadras urbanas.
 */
export function metersToBlocks(meters: number): number {
  return Math.max(1, Math.round(meters / METERS_PER_BLOCK));
}

/**
 * Formatea una distancia en metros a texto legible en español (ej. "180 m (~2 cuadras)" o "1.4 km").
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    const blocks = metersToBlocks(meters);
    return `${meters} m (~${blocks} ${blocks === 1 ? 'cuadra' : 'cuadras'})`;
  }
  const km = (meters / 1000).toFixed(1);
  return `${km} km`;
}

/**
 * Detecta todos los pares de trabajos de instalación que se encuentran dentro del umbral métrico.
 * Por defecto 500 metros (~4 a 5 cuadras).
 */
export function detectProximityPairs(
  jobs: InstallationWorkOrder[],
  thresholdMeters = 500
): ProximityPair[] {
  const validJobs = jobs.filter(hasGeoCoordinates);
  const pairs: ProximityPair[] = [];

  for (let i = 0; i < validJobs.length; i++) {
    for (let j = i + 1; j < validJobs.length; j++) {
      const jobA = validJobs[i];
      const jobB = validJobs[j];
      const distance = calculateHaversineDistance(jobA, jobB);

      if (distance <= thresholdMeters) {
        const hasBothDates = Boolean(jobA.scheduledDate && jobB.scheduledDate);
        const sameDay = hasBothDates && jobA.scheduledDate === jobB.scheduledDate;
        const blocks = metersToBlocks(distance);

        let priorityLevel: ProximityPair['priorityLevel'] = 'info';
        let recommendation = '';

        if (sameDay) {
          priorityLevel = distance <= 250 ? 'critical' : 'warning';
          recommendation = `Mismo día (${jobA.scheduledDate}) a solo ${formatDistance(distance)}. Asignar la misma cuadrilla de montaje evita 1 viaje de ida y vuelta.`;
        } else if (!hasBothDates) {
          recommendation = `Las ubicaciones están a ${formatDistance(distance)}. Una o ambas fechas están pendientes; confirma la programación antes de agrupar la visita.`;
        } else {
          recommendation = `Están a ${formatDistance(distance)} pero en fechas distintas (${jobA.scheduledDate} y ${jobB.scheduledDate}). Si la producción lo permite, considera coordinar ambas instalaciones el mismo día.`;
        }

        pairs.push({
          jobA,
          jobB,
          distanceMeters: distance,
          distanceBlocks: blocks,
          sameDay,
          priorityLevel,
          recommendation,
        });
      }
    }
  }

  // Ordenar por cercanía (los más cercanos primero)
  return pairs.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/**
 * Agrupa órdenes en clusters espaciales conexos para una fecha o en general.
 */
export function clusterJobsByProximity(
  jobs: InstallationWorkOrder[],
  thresholdMeters = 500
): ProximityCluster[] {
  const validJobs = jobs.filter(hasGeoCoordinates);
  const clusters: ProximityCluster[] = [];
  const visited = new Set<string>();

  // Agrupar por fecha programada
  const jobsByDate = validJobs.reduce<Record<string, LocatedInstallationWorkOrder[]>>((acc, job) => {
    const key = job.scheduledDate || 'sin-fecha';
    (acc[key] = acc[key] || []).push(job);
    return acc;
  }, {});

  for (const [date, dayJobs] of Object.entries(jobsByDate)) {
    for (const job of dayJobs) {
      if (visited.has(job.id)) continue;

      const clusterJobs: LocatedInstallationWorkOrder[] = [];
      const queue: LocatedInstallationWorkOrder[] = [job];
      visited.add(job.id);

      while (queue.length > 0) {
        const current = queue.shift()!;
        clusterJobs.push(current);

        for (const candidate of dayJobs) {
          if (!visited.has(candidate.id)) {
            const dist = calculateHaversineDistance(current, candidate);
            if (dist <= thresholdMeters) {
              visited.add(candidate.id);
              queue.push(candidate);
            }
          }
        }
      }

      if (clusterJobs.length > 1) {
        const avgLat = clusterJobs.reduce((sum, j) => sum + j.lat, 0) / clusterJobs.length;
        const avgLng = clusterJobs.reduce((sum, j) => sum + j.lng, 0) / clusterJobs.length;

        let maxDist = 0;
        for (let i = 0; i < clusterJobs.length; i++) {
          for (let j = i + 1; j < clusterJobs.length; j++) {
            maxDist = Math.max(maxDist, calculateHaversineDistance(clusterJobs[i], clusterJobs[j]));
          }
        }

        const codes = clusterJobs.map((j) => j.code).join(', ');
        clusters.push({
          id: `cluster-${date}-${clusterJobs.map((j) => j.id).join('-').slice(0, 24)}`,
          date,
          center: { lat: avgLat, lng: avgLng },
          jobs: clusterJobs,
          maxDistanceMeters: maxDist,
          count: clusterJobs.length,
          label: date === 'sin-fecha'
            ? `${clusterJobs.length} ubicaciones cercanas · fecha pendiente`
            : `${clusterJobs.length} trabajos cercanos · ${date}`,
          recommendedAction: date === 'sin-fecha'
            ? `Hay ${clusterJobs.length} ubicaciones próximas (${codes}), pero sus fechas están pendientes. Confirma la programación antes de unificar la cuadrilla.`
            : `Asignar la misma cuadrilla a los ${clusterJobs.length} trabajos (${codes}). Radio máximo entre puntos: ${formatDistance(maxDist)}.`,
        });
      }
    }
  }

  return clusters;
}

/**
 * Extrae coordenadas decimales desde textos o URLs de Google Maps pegadas por el usuario.
 */
export function parseCoordinatesInput(input: string): GeoCoordinates | null {
  if (!input) return null;
  const clean = input.trim();

  // Patrón "lat, lng" directo: ej "-2.1343, -79.5938"
  const directMatch = clean.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (directMatch) {
    const lat = Number(directMatch[1]);
    const lng = Number(directMatch[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }

  // Patrón Google Maps URL (@lat,lng o ?q=lat,lng)
  const urlMatch = clean.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/) ||
                   clean.match(/[?&](?:q|query|ll)=(-?\d{1,2}\.\d+)(?:%2C|,)(-?\d{1,3}\.\d+)/i) ||
                   clean.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/);

  if (urlMatch) {
    const lat = Number(urlMatch[1]);
    const lng = Number(urlMatch[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }

  return null;
}
