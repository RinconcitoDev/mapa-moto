// ===================================================================
//  Moto Map — lógica principal
//  Todo corre en el celu: el mapa se lee de un archivo .pmtiles guardado
//  en el almacenamiento privado del navegador (OPFS). Nada sale a internet.
// ===================================================================

const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// Base relativa: funciona igual en localhost:3000/ y en usuario.github.io/mapa-moto/
const BASE = new URL('./', location.href).href;
const MAP_FILE = 'mapa.pmtiles';
const MIN_STEP_M = 10; // no guardamos puntos del recorrido a menos de 10 m del anterior

let map;
let userPos = [-60.63, -32.94];
let followUser = true;
let modoRegla = false;
let puntosRegla = [];
let tripActive = false;
let tripMaxSpeed = 0;
let tripSpeedSum = 0;
let tripSpeedCount = 0;
let tripPath = [];
let tripStartTime = "";
let historyVisible = true;
let markersHistory = [];
let poisVisibles = false;
let wakeLock = null;
let history = loadHistory();

function loadHistory() {
  try { return JSON.parse(localStorage.getItem('motoHistory') || '[]'); }
  catch { return []; }
}

// Los datos de OSM (nombres, operadores) se insertan en HTML: hay que escaparlos.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Distancia Haversine en metros, sin crear objetos (se llama en cada fix de GPS)
function distanciaMetros([lon1, lat1], [lon2, lat2]) {
  const R = 6371008.8;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function calcularDistanciaNativa(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += distanciaMetros(coords[i - 1], coords[i]);
  return (total / 1000).toFixed(2);
}

const round5 = n => Math.round(n * 1e5) / 1e5;

// -------------------------------------------------------------------
//  1. ARCHIVO DEL MAPA (OPFS)
// -------------------------------------------------------------------
async function leerMapaGuardado() {
  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(MAP_FILE);
    const file = await handle.getFile();
    return file.size > 0 ? file : null;
  } catch {
    return null;
  }
}

// Copia el archivo elegido al almacenamiento privado de la app, en streaming
// (no lo carga entero en RAM). Si el navegador no soporta escritura en OPFS,
// devolvemos el File original: funciona, pero habrá que elegirlo cada vez.
async function guardarMapa(file, onProgress) {
  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(MAP_FILE, { create: true });
    const writable = await handle.createWritable();
    let copiado = 0;
    const progreso = new TransformStream({
      transform(chunk, controller) {
        copiado += chunk.byteLength;
        onProgress(copiado / file.size);
        controller.enqueue(chunk);
      }
    });
    await file.stream().pipeThrough(progreso).pipeTo(writable);
    // Pide que el navegador no borre los datos si falta espacio
    if (navigator.storage.persist) await navigator.storage.persist();
    return await handle.getFile();
  } catch (err) {
    console.warn('No se pudo guardar en OPFS, se usa el archivo sólo en esta sesión', err);
    return file;
  }
}

function pedirMapa() {
  return new Promise(resolve => {
    const overlay = document.getElementById('map-setup');
    const input = document.getElementById('map-input');
    const estado = document.getElementById('map-setup-status');
    overlay.hidden = false;
    document.getElementById('map-setup-cancel').hidden = !map; // sin mapa no hay a dónde volver
    input.value = '';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      input.disabled = true;
      const guardado = await guardarMapa(file, p => {
        estado.textContent = `Copiando mapa… ${Math.round(p * 100)}%`;
      });
      estado.textContent = '';
      input.disabled = false;
      overlay.hidden = true;
      resolve(guardado);
    };
  });
}

function registrarArchivo(file) {
  const instancia = new pmtiles.PMTiles(new pmtiles.FileSource(file));
  protocol.add(instancia);
  return "pmtiles://" + file.name;
}

async function resolverBasemap() {
  const guardado = await leerMapaGuardado();
  if (guardado) return registrarArchivo(guardado);

  // Modo desarrollo: si el server local sirve mapa.pmtiles, lo usamos directo.
  try {
    const r = await fetch(BASE + MAP_FILE, { method: 'HEAD' });
    if (r.ok && !(r.headers.get('content-type') || '').includes('text/html')) {
      return "pmtiles://" + BASE + MAP_FILE;
    }
  } catch { /* sin server local: seguimos */ }

  return registrarArchivo(await pedirMapa());
}

// -------------------------------------------------------------------
//  2. ESTILO DEL MAPA
// -------------------------------------------------------------------
function crearEstilo(basemapUrl) {
  return {
    version: 8,
    glyphs: BASE + "fonts/{fontstack}/{range}.pbf",
    sources: {
      "basemap": { type: "vector", url: basemapUrl },
      "nafta-local": { type: "geojson", data: BASE + "estaciones.geojson" },
      "peajes-local": { type: "geojson", data: BASE + "peajes.geojson" },
      "radares-local": { type: "geojson", data: BASE + "radares.geojson" },
      "ruta-manual": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      "recorrido-actual": { type: "geojson", data: { type: "FeatureCollection", features: [] } }
    },
    layers: [
      { id: "fondo", type: "background", paint: { "background-color": "#080808" } },
      { id: "zonas-verdes", type: "fill", source: "basemap", "source-layer": "land", filter: ["match", ["get", "kind"], ["park", "forest", "nature_reserve", "grass"], true, false], paint: { "fill-color": "#145a29", "fill-opacity": 0.8 } },
      { id: "agua-poligonos", type: "fill", source: "basemap", "source-layer": "water_polygons", paint: { "fill-color": "#005579" } },
      { id: "agua-lineas", type: "line", source: "basemap", "source-layer": "water_lines", paint: { "line-color": "#005579", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 14, 3] } },
      {
        id: "nombres-rios", type: "symbol", source: "basemap", "source-layer": "water_lines_labels", minzoom: 6,
        layout: {
          "text-field": ["get", "name"], "text-font": ["Open-Sans-Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 14, 14],
          "symbol-placement": "line", "text-max-angle": 45, "symbol-spacing": 300
        },
        paint: { "text-color": "#75c4ff", "text-halo-color": "#080808", "text-halo-width": 1.5 }
      },
      {
        id: "nombres-lagunas", type: "symbol", source: "basemap", "source-layer": "water_polygons_labels", minzoom: 13,
        layout: {
          "text-field": ["get", "name"], "text-font": ["Open-Sans-Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 13, 11, 14, 14], "symbol-placement": "point"
        },
        paint: { "text-color": "#75c4ff", "text-halo-color": "#080808", "text-halo-width": 1.5 }
      },
      {
        id: "vias-lineas", type: "line", source: "basemap", "source-layer": "streets", paint: {
          "line-color": ["match", ["get", "kind"], "motorway", "#ff9e17", "trunk", "#fbd060", "primary", "#fbd060", "secondary", "#cac6cd", "tertiary", "#a1a6ad", "track", "#ab8f68", "path", "#d1c4b2", "#999"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, ["match", ["get", "kind"], "motorway", 3, "trunk", 2.5, "primary", 2, "secondary", 1.5, "track", 0.3, 0.5], 15, ["match", ["get", "kind"], "motorway", 10, "trunk", 8, "primary", 7, "secondary", 5, "tertiary", 4, "track", 2, 1.5]]
        }
      },
      { id: "ruta-linea", type: "line", source: "ruta-manual", paint: { "line-color": "#f1c40f", "line-width": 5, "line-dasharray": [2, 1] } },
      { id: "recorrido-actual", type: "line", source: "recorrido-actual", paint: { "line-color": "#007cff", "line-width": 4 } },
      { id: "peajes-circulo", type: "circle", source: "peajes-local", paint: { "circle-color": "#e74c3c", "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 11, 6, 14, 12], "circle-stroke-width": 1, "circle-stroke-color": "#fff" } },
      { id: "nafta-circulo", type: "circle", source: "nafta-local", paint: { "circle-color": "#27ae60", "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 11, 6, 14, 12], "circle-stroke-width": 1, "circle-stroke-color": "#fff" } },
      { id: "nombres-calles", type: "symbol", source: "basemap", "source-layer": "street_labels", minzoom: 13, layout: { "text-field": ["get", "name"], "text-font": ["Open-Sans-Regular"], "text-size": ["match", ["get", "kind"], "motorway", 18, "trunk", 16, 12], "symbol-placement": "line" }, paint: { "text-color": "#fff", "text-halo-color": "#000", "text-halo-width": 1 } },
      { id: "nombres-lugares", type: "symbol", source: "basemap", "source-layer": "place_labels", filter: ["in", ["get", "kind"], ["literal", ["city", "town", "village", "hamlet"]]], layout: { "text-field": ["get", "name"], "text-font": ["Open-Sans-Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 6, 13, 10, 18, 14, 26], "text-padding": 20, "symbol-sort-key": ["match", ["get", "kind"], "city", 1, "town", 2, "village", 3, 4] }, paint: { "text-color": "#fff", "text-halo-color": "#000", "text-halo-width": 3 } },
      { id: "peajes-letra", type: "symbol", source: "peajes-local", minzoom: 12, layout: { "text-field": "$", "text-font": ["Open-Sans-Regular"], "text-size": 13 }, paint: { "text-color": "#fff" } },
      { id: "nafta-letra", type: "symbol", source: "nafta-local", minzoom: 12, layout: { "text-field": "N", "text-font": ["Open-Sans-Regular"], "text-size": 13 }, paint: { "text-color": "#fff" } },
      {
        id: "radares-circulo", type: "circle", source: "radares-local",
        paint: {
          "circle-color": "#f1c40f",
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 12],
          "circle-stroke-width": 3, "circle-stroke-color": "#000"
        }
      },
      // "!" en vez del emoji ⚠️: Open Sans no tiene emojis, el glifo no existía.
      { id: "radares-texto", type: "symbol", source: "radares-local", minzoom: 11, layout: { "text-field": "!", "text-font": ["Open-Sans-Regular"], "text-size": 14 }, paint: { "text-color": "#000" } },
      {
        id: "pois-viaje", type: "symbol", source: "basemap", "source-layer": "pois", minzoom: 12,
        layout: {
          "visibility": "none",
          "text-field": ["get", "name"], "text-font": ["Open-Sans-Regular"], "text-size": 11,
          "text-offset": [0, 1.5], "text-anchor": "top"
        },
        paint: { "text-color": "#ffffff", "text-halo-color": "#000000", "text-halo-width": 1 },
        filter: [
          "any",
          ["in", ["get", "amenity"], ["literal", ["hospital", "police", "pharmacy", "clinic"]]],
          ["in", ["get", "shop"], ["literal", ["motorcycle", "car_repair", "car_parts"]]],
          ["in", ["get", "tourism"], ["literal", ["viewpoint", "attraction", "camp_site", "picnic_site"]]],
          ["in", ["get", "highway"], ["literal", ["rest_area"]]]
        ]
      }
    ]
  };
}

// -------------------------------------------------------------------
//  3. MAPA + GPS
// -------------------------------------------------------------------
function iniciarMapa(basemapUrl) {
  map = new maplibregl.Map({
    container: 'map',
    style: crearEstilo(basemapUrl),
    center: userPos,
    zoom: 10,
    attributionControl: { compact: true, customAttribution: '© OpenStreetMap' }
  });

  const geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    trackUserLocation: true,
    showUserHeading: true,
    showUserLocation: true
  });

  map.addControl(geolocate);
  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  geolocate.on('trackuserlocationstart', () => { followUser = true; });
  geolocate.on('trackuserlocationend', () => { followUser = false; });
  geolocate.on('geolocate', onPosicion);

  map.on('load', () => geolocate.trigger());
  map.on('click', onClickMapa);
}

function onPosicion(e) {
  const { longitude, latitude, speed } = e.coords;
  userPos = [longitude, latitude];
  const kmh = speed ? Math.round(speed * 3.6) : 0;

  document.getElementById('max-display').textContent = `${kmh} km/h`;

  if (tripActive) {
    const ultimo = tripPath[tripPath.length - 1];
    if (!ultimo || distanciaMetros(ultimo, userPos) >= MIN_STEP_M) {
      tripPath.push([round5(longitude), round5(latitude)]);
      map.getSource('recorrido-actual')?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: tripPath } });
    }
    if (kmh > tripMaxSpeed) tripMaxSpeed = kmh;
    if (kmh > 5) { tripSpeedSum += kmh; tripSpeedCount++; }

    const avg = tripSpeedCount ? Math.round(tripSpeedSum / tripSpeedCount) : 0;
    document.getElementById('avg-display').textContent = `P: ${avg} | M: ${tripMaxSpeed}`;
  }

  document.getElementById('coords-display').textContent = `LAT: ${latitude.toFixed(4)} | LON: ${longitude.toFixed(4)}`;
  // El GeolocateControl ya centra el mapa cuando está en modo seguimiento.
}

// -------------------------------------------------------------------
//  4. CLICK: REGLA Y POPUPS
// -------------------------------------------------------------------
function onClickMapa(e) {
  if (modoRegla) {
    puntosRegla.push([e.lngLat.lng, e.lngLat.lat]);
    map.getSource('ruta-manual').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: puntosRegla } });
    if (puntosRegla.length > 1) {
      const info = document.getElementById('distancia-info');
      info.style.display = 'block';
      info.textContent = `${calcularDistanciaNativa(puntosRegla)} km`;
    }
    return;
  }

  const features = map.queryRenderedFeatures(e.point, {
    layers: ['nafta-circulo', 'peajes-circulo', 'radares-circulo', 'pois-viaje']
  });
  if (!features.length) return;

  const p = features[0].properties;
  const layerId = features[0].layer.id;
  let titulo = "";
  let contenido = "";

  if (layerId === 'pois-viaje') {
    const tipo = p.amenity || p.shop || p.tourism || "Lugar de interés";
    titulo = `📍 ${tipo.replace(/_/g, ' ')}`;
    contenido = `<div style="margin-top:5px;">${escapeHtml(p.name || "Sin nombre registrado")}</div>`;
  } else if (layerId === 'radares-circulo') {
    titulo = "📷 CONTROL DE VELOCIDAD";
    const velBase = p.maxspeed ? p.maxspeed.toString().replace(" km/h", "") : "??";
    const direccionTexto = gradosACardinal(p.direction);
    const sentido = direccionTexto ? `<br><b>Sentido:</b> ${escapeHtml(direccionTexto)}` : "";
    contenido = `
      <div class="radar-popup">
        <div class="radar-velocidad">${escapeHtml(velBase)}</div>
        <div class="radar-label">Máxima Permitida</div>
        <hr>
        <div class="radar-detalle"><b>Ente:</b> ${escapeHtml(p.operator || "Control Vial")}${sentido}</div>
      </div>`;
  } else {
    const isNafta = layerId.includes('nafta');
    titulo = p.name || p.nombre || p.brand || (isNafta ? "⛽ Estación" : "🛣️ Peaje");
    if (p.operator && p.operator !== titulo) {
      contenido += `<div style="color:#666; font-size:12px; margin-bottom:4px;">${escapeHtml(p.operator)}</div>`;
    }
    if (p.telepase === 'yes' || p['payment:telepase'] === 'yes') {
      contenido += `<div style="color:#27ae60; font-weight:bold; font-size:11px; margin-top:5px;">✅ ADMITE TELEPASE</div>`;
    }
    contenido = `<div style="margin-top:5px;">${contenido || 'Sin datos adicionales'}</div>`;
  }

  new maplibregl.Popup({ offset: [0, -10] })
    .setLngLat(e.lngLat)
    .setHTML(`
      <div class="popup">
        <strong class="popup-titulo">${escapeHtml(titulo)}</strong>
        ${contenido}
      </div>`)
    .addTo(map);
}

function gradosACardinal(grados) {
  if (grados === undefined || grados === null || grados === "") return "";
  const g = parseFloat(grados);
  if (isNaN(g)) return grados; // ya viene como texto ("N", "forward"...)
  const direcciones = ["N ⬆️", "NE ↗️", "E ➡️", "SE ↘️", "S ⬇️", "SO ↙️", "O ⬅️", "NO ↖️"];
  // 8 porciones de 45°; el +22.5 centra cada porción (N = 337.5° a 22.5°)
  return `${direcciones[Math.floor(((g + 22.5) % 360) / 45)]} (${g}°)`;
}

// -------------------------------------------------------------------
//  5. HISTORIAL DE TRAMOS
// -------------------------------------------------------------------
function guardarHistorial() {
  try { localStorage.setItem('motoHistory', JSON.stringify(history)); }
  catch (err) { alert('No hay espacio para guardar el historial. Borrá tramos viejos.'); }
}

function updateHistoryUI() {
  const list = document.getElementById('trip-list');
  markersHistory.forEach(m => m.remove());
  markersHistory = [];

  document.getElementById('history-panel').style.display = history.length ? 'block' : 'none';

  list.innerHTML = history.slice(0, 10).map((t, index) => `
    <div class="trip-card" data-index="${index}">
      <div style="display:flex; justify-content:space-between; align-items: center;">
        <strong style="font-size: 13px;">⏱️ ${escapeHtml(t.startTime)} a ${escapeHtml(t.endTime)}</strong>
        <button class="delete-btn" data-index="${index}">🗑️</button>
      </div>
      <div style="color:#00ff00; margin-top:5px; font-weight: bold; font-size:12px;">
        MÁX: ${escapeHtml(t.max)} km/h | PROM: ${escapeHtml(t.avg)}
      </div>
      ${t.distancia ? `<div style="color:#fff; font-size:11px; margin-top:2px;">Distancia: ${escapeHtml(t.distancia)} km</div>` : ''}
    </div>`).join('');
}

// Un solo listener para toda la lista (delegación de eventos)
document.getElementById('trip-list').addEventListener('click', (e) => {
  const borrar = e.target.closest('.delete-btn');
  if (borrar) return eliminarTramo(Number(borrar.dataset.index));
  const card = e.target.closest('.trip-card');
  if (card) seleccionarTramo(Number(card.dataset.index));
});

function seleccionarTramo(index) {
  const t = history[index];
  if (!t?.path || t.path.length < 2) return;

  markersHistory.forEach(m => m.remove());
  const inicio = t.path[0];
  const fin = t.path[t.path.length - 1];
  markersHistory = [
    new maplibregl.Marker({ color: '#27ae60', scale: 0.8 }).setLngLat(inicio)
      .setPopup(new maplibregl.Popup().setHTML(`<b>Salida:</b> ${escapeHtml(t.startTime)}`)).addTo(map),
    new maplibregl.Marker({ color: '#e74c3c', scale: 0.8 }).setLngLat(fin)
      .setPopup(new maplibregl.Popup().setHTML(`<b>Llegada:</b> ${escapeHtml(t.endTime)}`)).addTo(map)
  ];

  map.getSource('recorrido-actual')?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: t.path } });

  const bounds = t.path.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(inicio, inicio));
  map.fitBounds(bounds, { padding: 50, duration: 1500 });
}

function eliminarTramo(index) {
  if (!confirm("¿Eliminar tramo?")) return;
  history.splice(index, 1);
  guardarHistorial();
  map.getSource('recorrido-actual')?.setData({ type: 'FeatureCollection', features: [] });
  updateHistoryUI();
}

// -------------------------------------------------------------------
//  6. PANTALLA ENCENDIDA DURANTE EL TRAMO (Screen Wake Lock API)
// -------------------------------------------------------------------
async function mantenerPantalla(encendida) {
  try {
    if (encendida && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else { await wakeLock?.release(); wakeLock = null; }
  } catch { /* p.ej. batería baja: el sistema lo rechaza, no es grave */ }
}
// El sistema suelta el wake lock al minimizar; lo pedimos de nuevo al volver.
document.addEventListener('visibilitychange', () => {
  if (tripActive && document.visibilityState === 'visible') mantenerPantalla(true);
});

// -------------------------------------------------------------------
//  7. BOTONES
// -------------------------------------------------------------------
document.getElementById('trip-btn').addEventListener('click', () => {
  tripActive = !tripActive;
  const btn = document.getElementById('trip-btn');

  if (tripActive) {
    tripMaxSpeed = 0; tripSpeedSum = 0; tripSpeedCount = 0;
    tripPath = [[round5(userPos[0]), round5(userPos[1])]];
    tripStartTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    btn.style.background = "#00ff00"; btn.textContent = "⏹️";
    mantenerPantalla(true);
    return;
  }

  mantenerPantalla(false);
  if (tripPath.length > 1) {
    history.unshift({
      max: tripMaxSpeed,
      avg: tripSpeedCount ? Math.round(tripSpeedSum / tripSpeedCount) : 0,
      startTime: tripStartTime,
      endTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      distancia: calcularDistanciaNativa(tripPath),
      path: tripPath
    });
    guardarHistorial();
    updateHistoryUI();
  }
  map.getSource('recorrido-actual')?.setData({ type: 'FeatureCollection', features: [] });
  document.getElementById('avg-display').textContent = '';
  btn.style.background = "#222"; btn.textContent = "🏁";
});

document.getElementById('rule-btn').addEventListener('click', () => {
  modoRegla = !modoRegla;
  puntosRegla = [];
  map.getSource('ruta-manual')?.setData({ type: 'FeatureCollection', features: [] });
  document.getElementById('distancia-info').style.display = 'none';
  document.getElementById('rule-btn').textContent = modoRegla ? '❌' : '📏';
});

document.getElementById('history-header').addEventListener('click', () => {
  historyVisible = !historyVisible;
  document.getElementById('trip-list').classList.toggle('hidden-list', !historyVisible);
  document.getElementById('toggle-icon').textContent = historyVisible ? '▼' : '▲';
});

document.getElementById('poi-btn').addEventListener('click', () => {
  poisVisibles = !poisVisibles;
  map.setLayoutProperty('pois-viaje', 'visibility', poisVisibles ? 'visible' : 'none');
  document.getElementById('poi-btn').classList.toggle('btn-active', poisVisibles);
});

// Reemplazar el mapa (p.ej. bajaste una zona más grande)
document.getElementById('map-btn').addEventListener('click', async () => {
  const file = await pedirMapa();
  // diff:false fuerza a recargar las fuentes aunque la URL sea la misma
  map.setStyle(crearEstilo(registrarArchivo(file)), { diff: false });
  poisVisibles = false;
  document.getElementById('poi-btn').classList.remove('btn-active');
});
document.getElementById('map-setup-cancel').addEventListener('click', () => {
  if (map) document.getElementById('map-setup').hidden = true;
});

// -------------------------------------------------------------------
//  8. ARRANQUE
// -------------------------------------------------------------------
updateHistoryUI();
resolverBasemap().then(iniciarMapa);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW no registrado', err));
}
