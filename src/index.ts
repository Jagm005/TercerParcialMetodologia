import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import { findAll, findOne, findTypes } from "./pokemon.repository";
import { setupDatabase } from "./setup";

const app = express();
app.use(express.json());

// CORS: permite que el frontend (Vercel o local) consuma la API.
// CORS_ORIGIN puede limitarlo a un dominio, ej. https://mi-pokedex.vercel.app
const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Raíz: información básica de la API
app.get("/", (_req, res) => {
  res.json({
    name: "Pokédex API (Gen 1)",
    endpoints: ["/api/pokemon", "/api/pokemon/:idOrName", "/api/pokemon?type=fire&name=char", "/api/types"],
  });
});

// GET /api/pokemon?type=fire&name=char
app.get("/api/pokemon", async (req, res, next) => {
  try {
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const name = typeof req.query.name === "string" ? req.query.name : undefined;
    const pokemon = await findAll({ type, name });
    res.json({ count: pokemon.length, results: pokemon });
  } catch (err) {
    next(err);
  }
});

// GET /api/pokemon/25  ó  /api/pokemon/pikachu
app.get("/api/pokemon/:idOrName", async (req, res, next) => {
  try {
    const pokemon = await findOne(req.params.idOrName);
    if (!pokemon) return res.status(404).json({ error: "Pokémon no encontrado" });
    res.json(pokemon);
  } catch (err) {
    next(err);
  }
});

// GET /api/types
app.get("/api/types", async (_req, res, next) => {
  try {
    res.json(await findTypes());
  } catch (err) {
    next(err);
  }
});

app.use((_req, res) => res.status(404).json({ error: "Ruta no encontrada" }));

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});

const port = Number(process.env.PORT) || 3000;

setupDatabase()
  .then(() => {
    app.listen(port, () => console.log(`Pokédex API en http://localhost:${port}/api/pokemon`));
  })
  .catch((err) => {
    console.error("No se pudo preparar la base de datos:", err.message);
    process.exit(1);
  });
