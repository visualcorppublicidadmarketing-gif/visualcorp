import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHaversineDistance,
  detectProximityPairs,
  clusterJobsByProximity,
  parseCoordinatesInput,
  formatDistance,
} from '../src/lib/geospatialProximity.ts';
import {
  createGeoJsonCircle,
  buildHalosFeatureCollection,
  buildConnectionLinesFeatureCollection,
} from '../src/lib/maplibreGeospatial.ts';

test('calculateHaversineDistance computes accurate distance between Milagro landmarks', () => {
  // Parque Central (-2.1343, -79.5938) y Av. 17 de Septiembre y Colón (-2.1328, -79.5912)
  const dist = calculateHaversineDistance(
    { lat: -2.1343, lng: -79.5938 },
    { lat: -2.1328, lng: -79.5912 }
  );
  // La distancia real es de aprox. 334 metros
  assert.ok(dist >= 300 && dist <= 380, `Distance should be ~334m, got ${dist}`);
});

test('calculateHaversineDistance returns 0 for identical points', () => {
  const dist = calculateHaversineDistance(
    { lat: -2.1343, lng: -79.5938 },
    { lat: -2.1343, lng: -79.5938 }
  );
  assert.equal(dist, 0);
});

test('detectProximityPairs detects jobs within 500m threshold', () => {
  const jobs = [
    {
      id: 'job-1',
      code: 'OT-101',
      title: 'Lona',
      clientName: 'Cliente A',
      address: 'Centro 1',
      scheduledDate: '2026-11-12',
      status: 'ready',
      requiresInstallation: true,
      lat: -2.1343,
      lng: -79.5938,
    },
    {
      id: 'job-2',
      code: 'OT-102',
      title: 'Letrero',
      clientName: 'Cliente B',
      address: 'Centro 2 (a ~180m)',
      scheduledDate: '2026-11-12',
      status: 'ready',
      requiresInstallation: true,
      lat: -2.1350,
      lng: -79.5925,
    },
    {
      id: 'job-3',
      code: 'OT-103',
      title: 'Valla',
      clientName: 'Cliente C',
      address: 'Lejos (~2.5km)',
      scheduledDate: '2026-11-12',
      status: 'ready',
      requiresInstallation: true,
      lat: -2.1550,
      lng: -79.6100,
    },
  ];

  const pairs = detectProximityPairs(jobs, 500);
  assert.equal(pairs.length, 1, 'Debe detectar exactamente 1 par cercano');
  assert.equal(pairs[0].jobA.code, 'OT-101');
  assert.equal(pairs[0].jobB.code, 'OT-102');
  assert.ok(pairs[0].distanceMeters <= 250);
  assert.equal(pairs[0].sameDay, true);
});

test('clusterJobsByProximity groups connected nearby jobs', () => {
  const jobs = [
    {
      id: 'job-1',
      code: 'OT-101',
      title: 'A',
      clientName: 'A',
      address: 'A',
      scheduledDate: '2026-11-12',
      status: 'ready',
      requiresInstallation: true,
      lat: -2.1340,
      lng: -79.5930,
    },
    {
      id: 'job-2',
      code: 'OT-102',
      title: 'B',
      clientName: 'B',
      address: 'B',
      scheduledDate: '2026-11-12',
      status: 'ready',
      requiresInstallation: true,
      lat: -2.1345,
      lng: -79.5935,
    },
  ];

  const clusters = clusterJobsByProximity(jobs, 300);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].count, 2);
  assert.equal(clusters[0].jobs.length, 2);
});

test('parseCoordinatesInput parses decimal coordinates and Google Maps URLs', () => {
  const parsedDirect = parseCoordinatesInput('-2.1343, -79.5938');
  assert.ok(parsedDirect);
  assert.equal(parsedDirect.lat, -2.1343);
  assert.equal(parsedDirect.lng, -79.5938);

  const parsedUrl = parseCoordinatesInput('https://www.google.com/maps/@-2.1343000,-79.5938000,16z');
  assert.ok(parsedUrl);
  assert.equal(parsedUrl.lat, -2.1343);
  assert.equal(parsedUrl.lng, -79.5938);
});

test('formatDistance formats meters and blocks correctly', () => {
  assert.equal(formatDistance(180), '180 m (~2 cuadras)');
  assert.equal(formatDistance(100), '100 m (~1 cuadra)');
  assert.equal(formatDistance(1500), '1.5 km');
});

test('createGeoJsonCircle generates a valid closed polygon with 64 vertices', () => {
  const circle = createGeoJsonCircle(-79.5938, -2.1343, 500, 64, { name: 'Milagro Central' });
  assert.equal(circle.type, 'Feature');
  assert.equal(circle.geometry.type, 'Polygon');
  assert.equal(circle.geometry.coordinates.length, 1);
  // 64 steps means 65 coordinates because the first and last point are identical (closed polygon)
  assert.equal(circle.geometry.coordinates[0].length, 65);
  const first = circle.geometry.coordinates[0][0];
  const last = circle.geometry.coordinates[0][64];
  assert.ok(Math.abs(first[0] - last[0]) < 1e-6);
  assert.ok(Math.abs(first[1] - last[1]) < 1e-6);
  assert.equal(circle.properties.radiusMeters, 500);
  assert.equal(circle.properties.name, 'Milagro Central');
});

test('buildHalosFeatureCollection and buildConnectionLinesFeatureCollection produce valid GeoJSON', () => {
  const jobs = [
    {
      id: 'job-1',
      code: 'OT-101',
      title: 'Lona',
      clientName: 'Cliente A',
      address: 'Centro 1',
      scheduledDate: '2026-11-12',
      status: 'ready',
      priority: 'urgente',
      requiresInstallation: true,
      lat: -2.1343,
      lng: -79.5938,
    },
    {
      id: 'job-2',
      code: 'OT-102',
      title: 'Letrero',
      clientName: 'Cliente B',
      address: 'Centro 2',
      scheduledDate: '2026-11-12',
      status: 'ready',
      priority: 'normal',
      requiresInstallation: true,
      lat: -2.1350,
      lng: -79.5925,
    },
  ];

  const halos = buildHalosFeatureCollection(jobs, 500);
  assert.equal(halos.type, 'FeatureCollection');
  assert.equal(halos.features.length, 2);
  assert.equal(halos.features[0].properties.color, '#ef4444'); // Urgente es rojo
  assert.equal(halos.features[1].properties.color, '#d97706'); // Normal es ámbar

  const pairs = detectProximityPairs(jobs, 500);
  const lines = buildConnectionLinesFeatureCollection(pairs);
  assert.equal(lines.type, 'FeatureCollection');
  assert.equal(lines.features.length, 1);
  assert.equal(lines.features[0].geometry.type, 'LineString');
  assert.equal(lines.features[0].geometry.coordinates.length, 2);
});
