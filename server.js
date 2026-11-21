// Server sólo para DESARROLLO en la PC. En el celu la app corre como PWA
// (GitHub Pages + archivo .pmtiles local), no hace falta este server.
import express from "express";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PMTILES = path.join(__dirname, "zona-mapa.pmtiles");
const PORT = process.env.PORT || 3000;

const app = express();

// Sin CORS: la app y los datos están en el mismo origen, no hace falta abrirlo a "*".
app.use(express.static(path.join(__dirname, "public")));

// express.static/sendFile ya soportan peticiones Range, que es lo que usa PMTiles.
app.get("/mapa.pmtiles", (req, res) => {
  if (!existsSync(PMTILES)) return res.status(404).end();
  res.sendFile(PMTILES);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Moto Map listo en: http://localhost:${PORT}`);
});
