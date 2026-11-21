// Service Worker: guarda la app en el celu para que abra sin internet.
// Estrategia "cache first": si el archivo está en caché, NO se toca la red.
// Para publicar una versión nueva, subí VERSION: el navegador detecta que
// sw.js cambió, instala la caché nueva y borra la vieja.
const VERSION = 'v2';
const CACHE = `mapa-moto-${VERSION}`;

const PRECACHE = [
  './',
  'index.html',
  'style.css',
  'map-logic.js',
  'manifest.webmanifest',
  'lib/maplibre-gl.js',
  'lib/maplibre-gl.css',
  'lib/pmtiles.js',
  'estaciones.geojson',
  'peajes.geojson',
  'radares.geojson',
  'icons/icon-192.png',
  'icons/icon-512.png',
  // Rangos de glifos que usa el español (latín básico, latín extendido, puntuación)
  'fonts/Open-Sans-Regular/0-255.pbf',
  'fonts/Open-Sans-Regular/256-511.pbf',
  'fonts/Open-Sans-Regular/8192-8447.pbf',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Sólo GET de nuestro propio origen. El .pmtiles (modo dev con server local)
  // usa peticiones Range: no lo cacheamos, lo maneja el navegador directo.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('.pmtiles')) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Cacheamos en tiempo de ejecución lo que no estaba precacheado (otros glifos)
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
