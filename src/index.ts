import "dotenv/config";
import express from "express";
import { errorHandler } from "./http";
import { router } from "./routes";
import { setupDatabase } from "./setup";

const app = express();
app.use(express.json());

// CORS: permite que el frontend (Vercel o local) consuma la API.
// CORS_ORIGIN puede limitarlo a un dominio, ej. https://mi-pokedex.vercel.app
const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Raíz: lista de endpoints
app.get("/", (_req, res) => {
  res.json({
    name: "Pokédex API (Gen 1)",
    endpoints: {
      pokemon: [
        "GET    /api/pokemon?type=&name=&sort=id|name&order=asc|desc&limit=&offset=",
        "GET    /api/pokemon/:idOrName",
        "POST   /api/pokemon",
        "PUT    /api/pokemon/:id",
        "PATCH  /api/pokemon/:id",
        "DELETE /api/pokemon/:id",
      ],
      types: [
        "GET    /api/types",
        "GET    /api/types/:name",
        "POST   /api/types",
        "PUT    /api/types/:name",
        "PATCH  /api/types/:name",
        "DELETE /api/types/:name?force=true",
      ],
      evolutions: [
        "GET    /api/evolutions",
        "GET    /api/evolutions/:from/:to",
        "POST   /api/evolutions",
        "PUT    /api/evolutions/:from/:to",
        "PATCH  /api/evolutions/:from/:to",
        "DELETE /api/evolutions/:from/:to",
      ],
      stats: ["GET    /api/stats"],
    },
  });
});

app.use("/api", router);

app.use((_req, res) => res.status(404).json({ error: "Ruta no encontrada" }));
app.use(errorHandler);

const port = Number(process.env.PORT) || 3000;

setupDatabase()
  .then(() => {
    app.listen(port, () => console.log(`Pokédex API en http://localhost:${port}/api/pokemon`));
  })
  .catch((err) => {
    console.error("No se pudo preparar la base de datos:", err.message);
    process.exit(1);
  });
