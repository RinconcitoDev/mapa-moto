const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

let userPos = [-60.63, -32.94];
let followUser = true;
let modoRegla = false;
let puntosRegla = [];
let tripActive = false;
let tripMaxSpeed = 0;
let tripSpeeds = [];
let tripStartCoords = null;
let tripStartTime = "";
let historyVisible = true;
let markersHistory = [];
let history = JSON.parse(localStorage.getItem('motoHistory') || '[]');

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    glyphs: window.location.origin + "/fonts/{fontstack}/{range}.pbf",
    sources: {
      "basemap": { type: "vector", url: "pmtiles://" + window.location.origin + "/mapa.pmtiles" },
      "nafta-local": { type: "geojson", data: "/estaciones.geojson" },
      "peajes-local": { type: "geojson", data: "/peajes.geojson" },
      "radares-local": { type: "geojson", data: "/radares.geojson" },
      "ruta-manual": { type: "geojson", data: { type: "FeatureCollection", features: [] } }
    },
    layers: [
      { id: "fondo", type: "background", paint: { "background-color": "#080808" } },
      { id: "zonas-verdes", type: "fill", source: "basemap", "source-layer": "land", filter: ["match", ["get", "kind"], ["park", "forest", "nature_reserve", "grass"], true, false], paint: { "fill-color": "#145a29", "fill-opacity": 0.8 } },
      { id: "agua-poligonos", type: "fill", source: "basemap", "source-layer": "water_polygons", paint: { "fill-color": "#005579" } },
      { id: "agua-lineas", type: "line", source: "basemap", "source-layer": "water_lines", paint: { "line-color": "#005579", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 14, 3] } },
      {
        id: "nombres-rios",
        type: "symbol",
        source: "basemap",
        "source-layer": "water_lines_labels", // Capa correcta según tu lista
        minzoom: 6,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Open-Sans-Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 14, 14],
          "symbol-placement": "line",
          "text-max-angle": 45,
          "symbol-spacing": 300
        },
        paint: {
          "text-color": "#75c4ff",
          "text-halo-color": "#080808",
          "text-halo-width": 1.5
        }
      },
      {
        id: "nombres-lagunas",
        type: "symbol",
        source: "basemap",
        "source-layer": "water_polygons_labels", // Capa correcta según tu lista
        minzoom: 13,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Open-Sans-Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 13, 11, 14, 14],
          "symbol-placement": "point"
        },
        paint: {
          "text-color": "#75c4ff",
          "text-halo-color": "#080808",
          "text-halo-width": 1.5
        }
      },
      {
        id: "vias-lineas", type: "line", source: "basemap", "source-layer": "streets", paint: {
          "line-color": ["match", ["get", "kind"], "motorway", "#ff9e17", "trunk", "#fbd060", "primary", "#fbd060", "secondary", "#cac6cd", "tertiary", "#a1a6ad", "track", "#ab8f68", "path", "#d1c4b2", "#999"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, ["match", ["get", "kind"], "motorway", 3, "trunk", 2.5, "primary", 2, "secondary", 1.5, "track", 0.3, 0.5], 15, ["match", ["get", "kind"], "motorway", 10, "trunk", 8, "primary", 7, "secondary", 5, "tertiary", 4, "track", 2, 1.5]]
        }
      },
      { id: "ruta-linea", type: "line", source: "ruta-manual", paint: { "line-color": "#00ff00", "line-width": 4, "line-dasharray": [2, 1] } },
      { id: "peajes-circulo", type: "circle", source: "peajes-local", paint: { "circle-color": "#e74c3c", "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 11, 6, 14, 12], "circle-stroke-width": 1, "circle-stroke-color": "#fff" } },
      { id: "nafta-circulo", type: "circle", source: "nafta-local", paint: { "circle-color": "#27ae60", "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 11, 6, 14, 12], "circle-stroke-width": 1, "circle-stroke-color": "#fff" } },
      // VOLVEMOS AL FORMATO DE TEXTO QUE TENÍAS (Sin escudos complicados)
      { id: "nombres-calles", type: "symbol", source: "basemap", "source-layer": "street_labels", minzoom: 13, layout: { "text-field": ["get", "name"], "text-font": ["Open-Sans-Regular"], "text-size": ["match", ["get", "kind"], "motorway", 18, "trunk", 16, 12], "symbol-placement": "line" }, paint: { "text-color": "#fff", "text-halo-color": "#000", "text-halo-width": 1 } },
      { id: "nombres-lugares", type: "symbol", source: "basemap", "source-layer": "place_labels", filter: ["in", ["get", "kind"], ["literal", ["city", "town", "village", "hamlet"]]], layout: { "text-field": ["get", "name"], "text-font": ["Open-Sans-Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 6, 13, 10, 18, 14, 26], "text-padding": 20, "symbol-sort-key": ["match", ["get", "kind"], "city", 1, "town", 2, "village", 3, 4] }, paint: { "text-color": "#fff", "text-halo-color": "#000", "text-halo-width": 3 } },
      { id: "peajes-letra", type: "symbol", source: "peajes-local", minzoom: 12, layout: { "text-field": "$", "text-font": ["Open-Sans-Regular"], "text-size": 13 }, paint: { "text-color": "#fff" } },
      { id: "nafta-letra", type: "symbol", source: "nafta-local", minzoom: 12, layout: { "text-field": "N", "text-font": ["Open-Sans-Regular"], "text-size": 13 }, paint: { "text-color": "#fff" } },
      // Capa de Radares - Más llamativa y distinta
      {
        id: "radares-circulo",
        type: "circle",
        source: "radares-local",
        paint: {
          "circle-color": "#f1c40f", // Amarillo vibrante
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 12],
          "circle-stroke-width": 3,
          "circle-stroke-color": "#000" // Borde negro para que resalte
        }
      },
      {
        id: "radares-texto",
        type: "symbol",
        source: "radares-local",
        minzoom: 11,
        layout: {
          "text-field": "⚠️", // Cambiamos la cámara por el triángulo
          "text-font": ["Open-Sans-Regular"],
          "text-size": 12
        }
      },
      {
        id: "pois-viaje",
        type: "symbol",
        source: "basemap",
        "source-layer": "pois",
        minzoom: 12,
        layout: {
          "visibility": "none", // <--- Empieza oculto
          "text-field": ["get", "name"],
          "text-font": ["Open-Sans-Regular"],
          "text-size": 11,
          "text-offset": [0, 1.5],
          "text-anchor": "top",
          // Filtro para mostrar solo lo importante para el viajero
          "icon-image": [
            "match", ["get", "amenity"],
            "hospital", "hospital-icon",
            "police", "police-icon",
            "motorcycle_repair", "repair-icon",
            "pharmacy", "pharmacy-icon",
            "viewpoint", "viewpoint-icon", // viene de 'tourism' generalmente
            ""
          ]
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 1
        },
        // Filtro de categorías útiles
        filter: [
          "any",
          ["in", ["get", "amenity"], ["literal", ["hospital", "police", "pharmacy", "clinic"]]],
          ["in", ["get", "shop"], ["literal", ["motorcycle", "car_repair", "car_parts"]]],
          ["in", ["get", "tourism"], ["literal", ["viewpoint", "attraction", "camp_site", "picnic_site"]]],
          ["in", ["get", "highway"], ["literal", ["rest_area"]]]
        ]
      }
    ]
  },
  center: userPos,
  zoom: 10
});

const marker = new maplibregl.Marker({ color: "#007cff", scale: 1.2 }).setLngLat(userPos).addTo(map);

// --- LÓGICA DE CLIC (Restablecida al 100%) ---
map.on('click', (e) => {
  if (modoRegla) {
    puntosRegla.push([e.lngLat.lng, e.lngLat.lat]);
    map.getSource('ruta-manual').setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: puntosRegla }
    });
    if (puntosRegla.length > 1) {
      document.getElementById('distancia-info').style.display = 'block';
      document.getElementById('distancia-info').innerText = `${calcularDistancia(puntosRegla)} km`;
    }
    return; // Si está la regla, no hacemos lo de abajo
  }

  // Buscamos en todas las capas de puntos a la vez
  // Dentro de map.on('click')
  const features = map.queryRenderedFeatures(e.point, {
    layers: ['nafta-circulo', 'peajes-circulo', 'radares-circulo', 'pois-viaje'] // Añadido pois-viaje
  });

  if (features.length) {
    const p = features[0].properties;
    const layerId = features[0].layer.id;
    let titulo = "";
    let contenido = "";

    // --- 1. LÓGICA PARA PUNTOS DE INTERÉS (POIs) ---
    if (layerId === 'pois-viaje') {
      const tipo = p.amenity || p.shop || p.tourism || "Lugar de interés";
      const nombre = p.name || "Sin nombre registrado";
      titulo = `📍 ${tipo.replace(/_/g, ' ')}`;
      contenido = `<div style="margin-top:5px;">${nombre}</div>`;
    }

    // --- 2. LÓGICA PARA RADARES (Único con círculo de velocidad) ---
    else if (layerId === 'radares-circulo') {
      titulo = "📷 CONTROL DE VELOCIDAD";
      const velBase = p.maxspeed ? p.maxspeed.toString().replace(" km/h", "") : "??";
      const operador = p.operator || p.source || "Control Vial";
      const direccionTexto = gradosACardinal(p.direction);
      const sentido = direccionTexto ? `<br><b>Sentido:</b> ${direccionTexto}` : "";

      contenido = `
        <div style="text-align:center; min-width:150px;">
          <div style="
            border: 5px solid #e74c3c; border-radius: 50%; 
            width: 55px; height: 55px; margin: 10px auto; 
            display: flex; align-items: center; justify-content: center;
            color: #000; font-size: 22px; font-weight: bold;
            background: #fff; box-shadow: 0 0 5px rgba(0,0,0,0.2);">
            ${velBase}
          </div>
          <div style="font-size: 11px; color: #666; text-transform: uppercase;">Máxima Permitida</div>
          <hr style="margin: 10px 0; border: 0; border-top: 1px solid #eee;">
          <div style="font-size: 11px; text-align: left; color: #444;">
            <b>Ente:</b> ${operador}
            ${sentido}
          </div>
        </div>`;
    }

    // --- 3. LÓGICA PARA ESTACIONES Y PEAJES (Sin velocidad) ---
    else {
      const isNafta = layerId.includes('nafta');
      titulo = p.name || p.nombre || (isNafta ? "⛽ Estación" : "🛣️ Peaje");

      if (p.operator && p.operator !== titulo) {
        contenido += `<div style="color:#666; font-size:12px; margin-bottom:4px;">${p.operator}</div>`;
      }

      if (p.telepase === 'yes' || p['payment:telepase'] === 'yes') {
        contenido += `<div style="color:#27ae60; font-weight:bold; font-size:11px; margin-top:5px;">✅ ADMITE TELEPASE</div>`;
      }

      contenido = `<div style="margin-top:5px;">${contenido || 'Sin datos adicionales'}</div>`;
    }

    // --- RENDERIZADO FINAL DEL POPUP ---
    new maplibregl.Popup({ offset: [0, -10] })
      .setLngLat(e.lngLat)
      .setHTML(`
        <div style="color:#000; font-family: 'Segoe UI', sans-serif; padding: 2px;">
          <strong style="font-size:13px; display:block; border-bottom:1px solid #ccc; padding-bottom:5px; text-transform: uppercase;">
            ${titulo}
          </strong>
          ${contenido}
        </div>
      `)
      .addTo(map);
  }
});

// --- EL RESTO DE TUS FUNCIONES (GPS, HISTORIAL, ETC) SIN CAMBIOS ---
navigator.geolocation.watchPosition(pos => {
  const { latitude, longitude, speed } = pos.coords;
  userPos = [longitude, latitude];
  const kmh = speed ? Math.round(speed * 3.6) : 0;
  if (tripActive) {
    if (kmh > tripMaxSpeed) tripMaxSpeed = kmh;
    if (kmh > 5) tripSpeeds.push(kmh);
    const avg = tripSpeeds.length ? (tripSpeeds.reduce((a, b) => a + b, 0) / tripSpeeds.length).toFixed(0) : 0;
    document.getElementById('max-display').innerText = `Máx: ${kmh} km/h`;
    document.getElementById('avg-display').innerText = `P: ${avg} | M: ${tripMaxSpeed}`;
  }
  document.getElementById('coords-display').innerText = `LAT: ${latitude.toFixed(4)} | LON: ${longitude.toFixed(4)}`;
  marker.setLngLat(userPos);
  if (followUser) map.easeTo({ center: userPos, duration: 1000, easing: t => t });
}, null, { enableHighAccuracy: true });

function updateHistoryUI() {
  const list = document.getElementById('trip-list');
  const panel = document.getElementById('history-panel');
  localStorage.setItem('motoHistory', JSON.stringify(history));

  // Limpiamos marcadores previos para que no se acumulen al refrescar la lista
  markersHistory.forEach(m => m.remove());
  markersHistory = [];

  panel.style.display = history.length ? 'block' : 'none';

  list.innerHTML = history.slice(0, 10).map((t, index) => {
    return `
    <div class="trip-card" onclick="seleccionarTramo(${index})" style="cursor:pointer; border-left: 4px solid #444;">
      <div style="display:flex; justify-content:space-between; align-items: center;">
          <strong style="font-size: 13px;">⏱️ ${t.startTime} a ${t.endTime}</strong>
          <button class="delete-btn" onclick="eliminarTramo(${index}, event)">🗑️</button>
      </div>
      <div style="color:#00ff00; margin-top:5px; font-weight: bold; font-size:12px;">
        MÁX: ${t.max} km/h | PROM: ${t.avg}
      </div>
      ${t.distancia ? `<div style="color:#fff; font-size:11px; margin-top:2px;">Distancia: ${t.distancia} km</div>` : ''}
    </div>`;
  }).join('');
}

function seleccionarTramo(index) {
  const t = history[index];
  if (!t.start || !t.end) return;

  // 1. Borramos los pines del tramo anterior
  markersHistory.forEach(m => m.remove());
  markersHistory = [];

  // 2. Creamos los nuevos pines para este tramo
  const mInicio = new maplibregl.Marker({ color: '#27ae60', scale: 0.8 })
    .setLngLat(t.start)
    .setPopup(new maplibregl.Popup().setHTML("Salida"))
    .addTo(map);

  const mFin = new maplibregl.Marker({ color: '#e74c3c', scale: 0.8 })
    .setLngLat(t.end)
    .setPopup(new maplibregl.Popup().setHTML("Llegada"))
    .addTo(map);

  // 3. Los guardamos en el array para poder borrarlos después
  markersHistory.push(mInicio, mFin);

  // 4. Zoom al punto de inicio
  map.flyTo({ center: t.start, zoom: 14 });
}

function eliminarTramo(index, event) {
  event.stopPropagation();
  if (confirm("¿Eliminar tramo?")) {
    history.splice(index, 1);
    updateHistoryUI();
  }
}

document.getElementById('trip-btn').addEventListener('click', () => {
  tripActive = !tripActive;
  const btn = document.getElementById('trip-btn');

  if (tripActive) {
    tripMaxSpeed = 0; tripSpeeds = []; tripStartCoords = [...userPos];
    tripStartTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    btn.style.background = "#00ff00"; btn.innerText = "⏹️";
  } else {
    const tripEndTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const tripEndCoords = [...userPos]; // Guardamos posición final

    // Calculamos la distancia entre inicio y fin usando tu función existente
    const dist = calcularDistancia([tripStartCoords, tripEndCoords]);

    const avg = tripSpeeds.length ? (tripSpeeds.reduce((a, b) => a + b, 0) / tripSpeeds.length).toFixed(0) : 0;

    if (tripMaxSpeed > 0) {
      // Agregamos 'end' y 'distancia' al objeto que se guarda
      history.unshift({
        max: tripMaxSpeed,
        avg: avg,
        startTime: tripStartTime,
        endTime: tripEndTime,
        start: tripStartCoords,
        end: tripEndCoords,
        distancia: dist
      });
      updateHistoryUI();
    }
    btn.style.background = "#222"; btn.innerText = "🏁";
  }
});

document.getElementById('recenter').addEventListener('click', () => {
  followUser = true; map.flyTo({ center: userPos, zoom: 14 });
});

document.getElementById('rule-btn').addEventListener('click', () => {
  modoRegla = !modoRegla;
  document.getElementById('rule-btn').innerText = modoRegla ? '❌' : '📏';
  if (!modoRegla) {
    puntosRegla = [];
    map.getSource('ruta-manual').setData({ type: 'FeatureCollection', features: [] });
    document.getElementById('distancia-info').style.display = 'none';
  }
});

function calcularDistancia(coords) {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i], p2 = coords[i + 1], R = 6371;
    const dLat = (p2[1] - p1[1]) * Math.PI / 180, dLon = (p2[0] - p1[0]) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1[1] * Math.PI / 180) * Math.cos(p2[1] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total.toFixed(2);
}

function gradosACardinal(grados) {
  if (grados === undefined || grados === null || grados === "") return "";

  // Aseguramos que sea un número
  const g = parseFloat(grados);
  if (isNaN(g)) return grados; // Si ya dice "Norte", lo deja como está

  const direcciones = ["N ⬆️", "NE ↗️", "E ➡️", "SE ↘️", "S ⬇️", "SO ↙️", "O ⬅️", "NO ↖️"];

  // Dividimos 360 grados en 8 porciones de 45° cada una
  // El +22.5 es para que el Norte no sea solo 0, sino de 337.5 a 22.5
  const indice = Math.floor(((g + 22.5) % 360) / 45);

  return `${direcciones[indice]} (${g}°)`;
}

// Abrir/Cerrar la lista de tramos al tocar el encabezado
document.getElementById('history-header').addEventListener('click', () => {
  const list = document.getElementById('trip-list');
  historyVisible = !historyVisible;
  list.classList.toggle('hidden-list', !historyVisible);
  document.querySelector('#history-header span').innerText = historyVisible ? '▼' : '▲';
});

let poisVisibles = false;

document.getElementById('poi-btn').addEventListener('click', () => {
  poisVisibles = !poisVisibles;
  const estado = poisVisibles ? 'visible' : 'none';

  map.setLayoutProperty('pois-viaje', 'visibility', estado);
  document.getElementById('poi-btn').classList.toggle('btn-active', poisVisibles);
});

map.on('dragstart', () => { followUser = false; });
updateHistoryUI();
