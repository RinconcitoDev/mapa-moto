# MotoDash-Offline 🏍️📍

Un tablero de instrumentos y mapa táctico diseñado para viajes en moto, optimizado para uso offline y visualización de datos críticos en ruta.

## ✨ Características
- **Mapa Vectorial Local:** Basado en archivos `PMTiles` para ahorro de datos y velocidad.
- **Radares y Seguridad:** Visualización de radares con sentido cardinal (N, S, E, O) y límites de velocidad.
- **Modo Regla:** Cálculo de distancias directas sobre el mapa.
- **Historial de Tramos:** Registro de velocidad máxima, promedio y distancia por tramo con persistencia en `localStorage`.
- **Puntos de Interés (POI):** Filtro inteligente para viajeros:
    - 🏥 Hospitales y Farmacias
    - 👮 Comisarías
    - 🛠️ Talleres mecánicos y repuestos
    - 🏕️ Campings y Miradores
- **Estadísticas en Vivo:** Velocidad máxima y promedio en tiempo real mediante GPS.
- **Pantalla siempre encendida** mientras hay un tramo en curso (Wake Lock).

## 📱 Instalar en el celu (sin Termux)
La app es una **PWA**: se publica en GitHub Pages (HTTPS, que el GPS exige) y se instala como app.
El mapa `.pmtiles` **nunca se sube**: se elige desde el teléfono y queda en el almacenamiento
privado del navegador (OPFS). Después de la primera vez funciona sin internet.

1. Copiá tu `zona-mapa.pmtiles` al celu (cable USB, Drive, etc. — por ejemplo a `Descargas`).
2. Abrí en Chrome `https://<usuario>.github.io/mapa-moto/`.
3. Menú ⋮ → **Instalar app** (o "Agregar a pantalla principal").
4. Abrila desde el ícono → **Elegir archivo** → tu `.pmtiles`. Se copia una sola vez.
5. Aceptá el permiso de ubicación. Listo: ya podés borrar el `.pmtiles` de Descargas.

Para cambiar de mapa más adelante: botón 🗺️.

### Privacidad
- Sin CDNs, sin analytics, sin APIs externas: todo (MapLibre, fuentes, datos) se sirve desde la propia app.
- Una CSP (`default-src 'self'`) impide que la página se conecte a cualquier otro dominio.
- El historial de tramos y el mapa quedan sólo en el teléfono.

## 🛠️ Desarrollo en la PC
```bash
pnpm install
# opcional: poné zona-mapa.pmtiles en la raíz para no tener que elegirlo
pnpm start            # http://localhost:3000
```
Datos de OSM: después de exportar de overpass-turbo, adelgazalos con
`node scripts/slim-geojson.mjs` (deja sólo las propiedades que usa la app).

Al cambiar archivos de `public/`, subí `VERSION` en `public/sw.js` para que los
celulares instalados descarguen la versión nueva.

---
Desarrollado para motociclistas que buscan simplicidad y datos útiles sin distracciones.
