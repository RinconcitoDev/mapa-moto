// Adelgaza los GeoJSON exportados de overpass-turbo para que el celu cargue y
// parsee menos datos. Uso:  node scripts/slim-geojson.mjs
//
// - Conserva solo las propiedades que usa el popup (KEEP).
// - Redondea coordenadas a 5 decimales (~1 m de precisión, de sobra para un POI).
// - Convierte polígonos (peajes mapeados como área) a un punto (centro del bbox),
//   porque las capas son de tipo "circle" y solo necesitan un punto.
//
// Es idempotente: se puede correr varias veces sobre los mismos archivos.
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = ['estaciones', 'peajes', 'radares'];
const KEEP = ['name', 'nombre', 'brand', 'operator', 'maxspeed', 'direction', 'telepase', 'payment:telepase'];
const round = (n) => Math.round(n * 1e5) / 1e5;

function toPoint(geometry) {
  if (geometry.type === 'Point') return { type: 'Point', coordinates: geometry.coordinates.map(round) };
  const coords = geometry.coordinates.flat(Infinity);
  const xs = coords.filter((_, i) => i % 2 === 0);
  const ys = coords.filter((_, i) => i % 2 === 1);
  const center = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  return { type: 'Point', coordinates: center.map(round) };
}

for (const name of FILES) {
  const path = new URL(`../public/${name}.geojson`, import.meta.url);
  const raw = readFileSync(path, 'utf8');
  const data = JSON.parse(raw);
  const features = data.features.map((f) => ({
    type: 'Feature',
    properties: Object.fromEntries(KEEP.filter((k) => f.properties[k] != null).map((k) => [k, f.properties[k]])),
    geometry: toPoint(f.geometry),
  }));
  // Mantenemos la atribución de OSM: la licencia ODbL la exige.
  const out = JSON.stringify({ type: 'FeatureCollection', copyright: data.copyright, features });
  writeFileSync(path, out);
  console.log(`${name}: ${(raw.length / 1024).toFixed(0)} KB -> ${(out.length / 1024).toFixed(0)} KB`);
}
