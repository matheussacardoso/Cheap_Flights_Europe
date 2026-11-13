// Generates public/maps/europe.json: the country shapes the trip map draws.
// Run from frontend/ with `npm run build:map` after upgrading world-atlas.
//
// Keeps only the countries around Ryanair's network (Europe, North Africa, Middle East),
// tags each with its ISO 3166-1 alpha-2 code and a label point, and rounds coordinates
// to 2 decimals (about 1 km), which is plenty at this zoom level.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoArea, geoBounds, geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';
import countries from 'i18n-iso-countries';

const require = createRequire(import.meta.url);
const topology = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json')));
const OUTPUT = new URL('../public/maps/europe.json', import.meta.url);

// Longitude/latitude window around the network (Canaries to Lapland, Azores to Jordan).
const WINDOW = { west: -32, east: 50, south: 18, north: 75 };

function intersectsWindow(geometry) {
  const [[west, south], [east, north]] = geoBounds(geometry);
  const latitudes = south <= WINDOW.north && north >= WINDOW.south;
  // west > east means the shape crosses the antimeridian (Russia): treat as intersecting.
  const longitudes = west > east || (west <= WINDOW.east && east >= WINDOW.west);
  return latitudes && longitudes;
}

function polygons(geometry) {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

/** Label at the centroid of the largest polygon, so overseas territories don't pull it away. */
function labelPoint(geometry) {
  const largest = polygons(geometry)
    .map((coordinates) => ({ type: 'Polygon', coordinates }))
    .reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
  return round(geoCentroid(largest));
}

function round([lon, lat]) {
  return [Math.round(lon * 100) / 100, Math.round(lat * 100) / 100];
}

function roundRing(ring) {
  const out = [];
  for (const point of ring.map(round)) {
    const last = out[out.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) out.push(point);
  }
  return out;
}

/** Drops the pieces of land outside the window (overseas territories, Alaska, Siberia's far east). */
function inWindow(geometry) {
  const coordinates = polygons(geometry).filter((coordinates) =>
    intersectsWindow({ type: 'Polygon', coordinates }),
  );
  return { type: 'MultiPolygon', coordinates };
}

function simplify(geometry) {
  const kept = polygons(geometry)
    .map((polygon) => polygon.map(roundRing).filter((ring) => ring.length >= 4))
    .filter((polygon) => polygon.length);
  return { type: 'MultiPolygon', coordinates: kept };
}

const features = feature(topology, topology.objects.countries)
  .features.filter((f) => f.geometry)
  .map((f) => ({ ...f, geometry: inWindow(f.geometry) }))
  .filter((f) => f.geometry.coordinates.length)
  .map((f) => ({
    type: 'Feature',
    properties: {
      code: countries.numericToAlpha2(f.id) ?? null,
      label: labelPoint(f.geometry),
    },
    geometry: simplify(f.geometry),
  }))
  .filter((f) => f.geometry.coordinates.length);

mkdirSync(new URL('.', OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`Wrote ${features.length} countries to ${OUTPUT.pathname}`);
