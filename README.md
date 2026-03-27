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

## 🛠️ Instalación y Uso
1. Clona este repositorio.
2. Asegúrate de tener los siguientes archivos en la raíz:
    - `basemap.pmtiles` (Mapa base)
    - `radares.geojson` (Datos de radares)
3. Ejecuta un servidor local (ej: `npx serve` o usando la extensión *Live Server* de VS Code).
4. Accede desde tu móvil mediante la IP local de tu red WiFi.

## 📱 Optimización Móvil
Para un rendimiento óptimo en ruta:
- Usa navegadores que soporten `MapLibre GL JS`.
- **Importante:** El acceso al GPS requiere conexión segura (HTTPS) o configurar el navegador para permitir orígenes inseguros en pruebas locales.

---
Desarrollado para motociclistas que buscan simplicidad y datos útiles sin distracciones.
