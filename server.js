import express from "express";
import path from 'path';
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Configuración de CORS reforzada para PMTiles y GeoJSON
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Range, Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/fonts', express.static(path.join(__dirname, 'fonts')));

app.get('/mapa.pmtiles', (req, res) => {
  res.sendFile(path.join(__dirname, 'zona-mapa.pmtiles'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Moto Map listo en: http://localhost:${PORT}`);
});
