import { PoolClient } from "pg";
import { pool, withTransaction } from "./db";
import { recomputeChains } from "./evolutions.repository";
import { HttpError } from "./http";
import { PokemonInput } from "./validate";

export interface EvolutionLink {
  id: number;
  name: string;
  trigger: string | null;
  minLevel: number | null;
  item: string | null;
}

export interface Pokemon {
  pokedexNumber: number;
  name: string;
  types: string[];
  description: string;
  image: string;
  evolutions: {
    chain: { pokedexNumber: number; name: string; image: string }[];
    evolvesFrom: EvolutionLink | null;
    evolvesTo: EvolutionLink[];
  };
}

/* ============ SELECT ============ */

// SELECT con subconsultas: tipos (ARRAY + JOIN), cadena evolutiva y evoluciones (json_agg)
const BASE_QUERY = `
  SELECT
    p.id,
    p.name,
    p.description,
    p.image_url,
    ARRAY(
      SELECT t.name FROM pokemon_types pt
      JOIN types t ON t.id = pt.type_id
      WHERE pt.pokemon_id = p.id
      ORDER BY pt.slot
    ) AS types,
    (
      SELECT json_agg(json_build_object('pokedexNumber', c.id, 'name', c.name, 'image', c.image_url) ORDER BY c.id)
      FROM pokemon c
      WHERE c.evolution_chain_id = p.evolution_chain_id
    ) AS chain,
    (
      SELECT json_build_object('id', f.id, 'name', f.name, 'trigger', e.trigger, 'minLevel', e.min_level, 'item', e.item)
      FROM evolutions e JOIN pokemon f ON f.id = e.from_pokemon_id
      WHERE e.to_pokemon_id = p.id
      LIMIT 1
    ) AS evolves_from,
    COALESCE((
      SELECT json_agg(json_build_object('id', n.id, 'name', n.name, 'trigger', e.trigger, 'minLevel', e.min_level, 'item', e.item) ORDER BY n.id)
      FROM evolutions e JOIN pokemon n ON n.id = e.to_pokemon_id
      WHERE e.from_pokemon_id = p.id
    ), '[]'::json) AS evolves_to
  FROM pokemon p
`;

function toPokemon(row: any): Pokemon {
  return {
    pokedexNumber: row.id,
    name: row.name,
    types: row.types,
    description: row.description,
    image: row.image_url,
    evolutions: {
      chain: row.chain ?? [],
      evolvesFrom: row.evolves_from,
      evolvesTo: row.evolves_to,
    },
  };
}

export interface ListFilters {
  type?: string;
  name?: string;
  sort: "id" | "name";
  order: "asc" | "desc";
  limit?: number;
  offset: number;
}

/** SELECT con WHERE (EXISTS / ILIKE), ORDER BY, LIMIT/OFFSET y COUNT(*) para el total. */
export async function findAll(f: ListFilters) {
  const where: string[] = [];
  const params: unknown[] = [];

  if (f.type) {
    params.push(f.type);
    where.push(`EXISTS (
      SELECT 1 FROM pokemon_types pt JOIN types t ON t.id = pt.type_id
      WHERE pt.pokemon_id = p.id AND t.name = $${params.length})`);
  }
  if (f.name) {
    params.push(`%${f.name}%`);
    where.push(`p.name ILIKE $${params.length}`);
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS total FROM pokemon p ${whereSql}`, params);

  // sort y order vienen de una lista blanca (validate.ts), por eso se pueden interpolar
  let sql = `${BASE_QUERY} ${whereSql} ORDER BY p.${f.sort} ${f.order.toUpperCase()}`;
  const pageParams = [...params];
  if (f.limit !== undefined) {
    pageParams.push(f.limit);
    sql += ` LIMIT $${pageParams.length}`;
  }
  if (f.offset) {
    pageParams.push(f.offset);
    sql += ` OFFSET $${pageParams.length}`;
  }
  const { rows } = await pool.query(sql, pageParams);
  return { total: countRows[0].total as number, results: rows.map(toPokemon) };
}

/** Busca por número de Pokédex ("25") o por nombre ("pikachu"). */
export async function findOne(idOrName: string | number): Promise<Pokemon | null> {
  const isNumber = typeof idOrName === "number" || /^\d+$/.test(idOrName);
  const sql = `${BASE_QUERY} WHERE ${isNumber ? "p.id = $1" : "p.name = LOWER($1)"}`;
  const { rows } = await pool.query(sql, [isNumber ? Number(idOrName) : idOrName]);
  return rows[0] ? toPokemon(rows[0]) : null;
}

async function findOneOrFail(id: number): Promise<Pokemon> {
  const p = await findOne(id);
  if (!p) throw new HttpError(404, "Pokémon no encontrado");
  return p;
}

/* ============ Tipos de un Pokémon (DELETE + INSERT) ============ */

async function setTypes(client: PoolClient, pokemonId: number, types: string[]) {
  const { rows } = await client.query<{ id: number; name: string }>(
    "SELECT id, name FROM types WHERE name = ANY($1::text[])",
    [types]
  );
  const missing = types.filter((t) => !rows.some((r) => r.name === t));
  if (missing.length) {
    throw new HttpError(400, `No existe el tipo: ${missing.join(", ")}. Créalo antes con POST /api/types`);
  }
  await client.query("DELETE FROM pokemon_types WHERE pokemon_id = $1", [pokemonId]);
  for (const [i, name] of types.entries()) {
    const typeId = rows.find((r) => r.name === name)!.id;
    await client.query("INSERT INTO pokemon_types (pokemon_id, type_id, slot) VALUES ($1, $2, $3)", [
      pokemonId,
      typeId,
      i + 1,
    ]);
  }
}

/* ============ INSERT ============ */

export async function createPokemon(input: PokemonInput): Promise<Pokemon> {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO pokemon (id, name, description, image_url, evolution_chain_id)
       VALUES ($1, $2, $3, $4, $1)`,
      [input.pokedexNumber, input.name, input.description, input.image]
    );
    await setTypes(client, input.pokedexNumber!, input.types!);
  });
  return findOneOrFail(input.pokedexNumber!);
}

/* ============ UPDATE ============ */

/** PUT (todos los campos) y PATCH (solo los enviados) usan la misma consulta dinámica. */
export async function updatePokemon(id: number, input: PokemonInput): Promise<Pokemon> {
  await withTransaction(async (client) => {
    const columns: Record<string, unknown> = {
      name: input.name,
      description: input.description,
      image_url: input.image,
    };
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [col, value] of Object.entries(columns)) {
      if (value === undefined) continue;
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    }

    params.push(id);
    const sql = sets.length
      ? `UPDATE pokemon SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING id`
      : `SELECT id FROM pokemon WHERE id = $${params.length} FOR UPDATE`; // solo cambian los tipos
    const { rowCount } = await client.query(sql, params);
    if (!rowCount) throw new HttpError(404, "Pokémon no encontrado");

    if (input.types) await setTypes(client, id, input.types);
  });
  return findOneOrFail(id);
}

/* ============ DELETE ============ */

export async function deletePokemon(id: number) {
  return withTransaction(async (client) => {
    // ON DELETE CASCADE borra también sus filas en pokemon_types y evolutions
    const { rows } = await client.query("DELETE FROM pokemon WHERE id = $1 RETURNING id, name", [id]);
    if (!rows[0]) throw new HttpError(404, "Pokémon no encontrado");
    await recomputeChains(client); // si era un eslabón intermedio, la cadena se parte en dos
    return { pokedexNumber: rows[0].id as number, name: rows[0].name as string };
  });
}
