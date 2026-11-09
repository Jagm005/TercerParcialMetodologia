import { Router } from "express";
import * as evolutions from "./evolutions.repository";
import { asyncHandler, HttpError } from "./http";
import * as pokemon from "./pokemon.repository";
import { getStats } from "./stats.repository";
import * as types from "./types.repository";
import { evolutionBody, listQuery, parseId, pokemonBody, typeBody } from "./validate";

export const router = Router();

/* ================= Pokémon ================= */

// GET /api/pokemon?type=fire&name=char&sort=name&order=desc&limit=20&offset=0
router.get(
  "/pokemon",
  asyncHandler(async (req, res) => {
    const q = listQuery(req.query);
    const { total, results } = await pokemon.findAll(q);
    res.json({ total, count: results.length, limit: q.limit ?? null, offset: q.offset, results });
  })
);

// GET /api/pokemon/25  ó  /api/pokemon/pikachu
router.get(
  "/pokemon/:idOrName",
  asyncHandler(async (req, res) => {
    const p = await pokemon.findOne(req.params.idOrName);
    if (!p) throw new HttpError(404, "Pokémon no encontrado");
    res.json(p);
  })
);

// POST /api/pokemon  { pokedexNumber, name, description, image, types: [...] }
router.post(
  "/pokemon",
  asyncHandler(async (req, res) => {
    const created = await pokemon.createPokemon(pokemonBody(req.body, "full", true));
    res.status(201).location(`/api/pokemon/${created.pokedexNumber}`).json(created);
  })
);

// PUT /api/pokemon/25  -> reemplaza todos los campos
router.put(
  "/pokemon/:id",
  asyncHandler(async (req, res) => {
    res.json(await pokemon.updatePokemon(parseId(req.params.id), pokemonBody(req.body, "full")));
  })
);

// PATCH /api/pokemon/25  -> actualiza solo los campos enviados
router.patch(
  "/pokemon/:id",
  asyncHandler(async (req, res) => {
    res.json(await pokemon.updatePokemon(parseId(req.params.id), pokemonBody(req.body, "partial")));
  })
);

// DELETE /api/pokemon/25
router.delete(
  "/pokemon/:id",
  asyncHandler(async (req, res) => {
    res.json({ deleted: await pokemon.deletePokemon(parseId(req.params.id)) });
  })
);

/* ================= Tipos ================= */

router.get(
  "/types",
  asyncHandler(async (_req, res) => {
    res.json(await types.findTypes());
  })
);

router.get(
  "/types/:name",
  asyncHandler(async (req, res) => {
    res.json(await types.findType(req.params.name.toLowerCase()));
  })
);

// POST /api/types  { name }
router.post(
  "/types",
  asyncHandler(async (req, res) => {
    const created = await types.createType(typeBody(req.body));
    res.status(201).location(`/api/types/${created.name}`).json(created);
  })
);

// PUT y PATCH /api/types/fire  { name: "fuego" }  -> renombrar
const renameType = asyncHandler(async (req, res) => {
  res.json(await types.renameType(req.params.name.toLowerCase(), typeBody(req.body)));
});
router.put("/types/:name", renameType);
router.patch("/types/:name", renameType);

// DELETE /api/types/fire   (?force=true si hay Pokémon con ese tipo)
router.delete(
  "/types/:name",
  asyncHandler(async (req, res) => {
    res.json({ deleted: await types.deleteType(req.params.name.toLowerCase(), req.query.force === "true") });
  })
);

/* ================= Evoluciones ================= */

router.get(
  "/evolutions",
  asyncHandler(async (_req, res) => {
    const list = await evolutions.findAllEvolutions();
    res.json({ count: list.length, results: list });
  })
);

router.get(
  "/evolutions/:from/:to",
  asyncHandler(async (req, res) => {
    res.json(await evolutions.findEvolution(parseId(req.params.from, "from"), parseId(req.params.to, "to")));
  })
);

// POST /api/evolutions  { from, to, trigger, minLevel, item }
router.post(
  "/evolutions",
  asyncHandler(async (req, res) => {
    const created = await evolutions.createEvolution(evolutionBody(req.body, "full", true));
    res
      .status(201)
      .location(`/api/evolutions/${created.from.pokedexNumber}/${created.to.pokedexNumber}`)
      .json(created);
  })
);

router.put(
  "/evolutions/:from/:to",
  asyncHandler(async (req, res) => {
    const [from, to] = [parseId(req.params.from, "from"), parseId(req.params.to, "to")];
    res.json(await evolutions.updateEvolution(from, to, evolutionBody(req.body, "full")));
  })
);

router.patch(
  "/evolutions/:from/:to",
  asyncHandler(async (req, res) => {
    const [from, to] = [parseId(req.params.from, "from"), parseId(req.params.to, "to")];
    res.json(await evolutions.updateEvolution(from, to, evolutionBody(req.body, "partial")));
  })
);

router.delete(
  "/evolutions/:from/:to",
  asyncHandler(async (req, res) => {
    const [from, to] = [parseId(req.params.from, "from"), parseId(req.params.to, "to")];
    res.json({ deleted: await evolutions.deleteEvolution(from, to) });
  })
);

/* ================= Estadísticas ================= */

router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    res.json(await getStats());
  })
);
