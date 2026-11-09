import { PoolClient } from "pg";
import { pool, withTransaction } from "./db";
import { HttpError } from "./http";
import { EvolutionInput } from "./validate";

const SELECT_EVOLUTIONS = `
  SELECT e.from_pokemon_id, f.name AS from_name, e.to_pokemon_id, t.name AS to_name,
         e.trigger, e.min_level, e.item
  FROM evolutions e
  JOIN pokemon f ON f.id = e.from_pokemon_id
  JOIN pokemon t ON t.id = e.to_pokemon_id
`;

function toEvolution(row: any) {
  return {
    from: { pokedexNumber: row.from_pokemon_id, name: row.from_name },
    to: { pokedexNumber: row.to_pokemon_id, name: row.to_name },
    trigger: row.trigger,
    minLevel: row.min_level,
    item: row.item,
  };
}

/**
 * Recalcula evolution_chain_id: todos los Pokémon conectados por evoluciones
 * comparten cadena (el menor número de la familia). CTE recursiva + UPDATE ... FROM.
 */
export async function recomputeChains(client: PoolClient) {
  await client.query(`
    WITH RECURSIVE
      edges AS (
        SELECT from_pokemon_id AS a, to_pokemon_id AS b FROM evolutions
        UNION
        SELECT to_pokemon_id, from_pokemon_id FROM evolutions
      ),
      reach(start, node) AS (
        SELECT id, id FROM pokemon
        UNION
        SELECT r.start, e.b FROM reach r JOIN edges e ON e.a = r.node
      ),
      families AS (
        SELECT start, MIN(node) AS chain_id FROM reach GROUP BY start
      )
    UPDATE pokemon p
    SET evolution_chain_id = families.chain_id
    FROM families
    WHERE p.id = families.start AND p.evolution_chain_id <> families.chain_id
  `);
}

export async function findAllEvolutions() {
  const { rows } = await pool.query(`${SELECT_EVOLUTIONS} ORDER BY e.from_pokemon_id, e.to_pokemon_id`);
  return rows.map(toEvolution);
}

export async function findEvolution(from: number, to: number) {
  const { rows } = await pool.query(`${SELECT_EVOLUTIONS} WHERE e.from_pokemon_id = $1 AND e.to_pokemon_id = $2`, [
    from,
    to,
  ]);
  if (!rows[0]) throw new HttpError(404, "Evolución no encontrada");
  return toEvolution(rows[0]);
}

export async function createEvolution(input: EvolutionInput) {
  await withTransaction(async (client) => {
    const { rows } = await client.query("SELECT id FROM pokemon WHERE id = ANY($1::int[])", [[input.from, input.to]]);
    for (const id of [input.from, input.to]) {
      if (!rows.some((r) => r.id === id)) throw new HttpError(404, `No existe el Pokémon #${id}`);
    }

    // Evita ciclos (A -> B -> A): ¿"to" ya es antecesor de "from"?
    const { rowCount } = await client.query(
      `WITH RECURSIVE ancestors(id) AS (
         SELECT $1::int
         UNION
         SELECT e.from_pokemon_id FROM evolutions e JOIN ancestors a ON e.to_pokemon_id = a.id
       )
       SELECT 1 FROM ancestors WHERE id = $2`,
      [input.from, input.to]
    );
    if (rowCount) throw new HttpError(409, "Esa evolución crearía un ciclo");

    await client.query(
      `INSERT INTO evolutions (from_pokemon_id, to_pokemon_id, trigger, min_level, item)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.from, input.to, input.trigger, input.minLevel, input.item]
    );
    await recomputeChains(client);
  });
  return findEvolution(input.from!, input.to!);
}

export async function updateEvolution(from: number, to: number, input: EvolutionInput) {
  const columns: Record<string, unknown> = { trigger: input.trigger, min_level: input.minLevel, item: input.item };
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [col, value] of Object.entries(columns)) {
    if (value === undefined) continue;
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  }
  params.push(from, to);
  const { rowCount } = await pool.query(
    `UPDATE evolutions SET ${sets.join(", ")}
     WHERE from_pokemon_id = $${params.length - 1} AND to_pokemon_id = $${params.length}`,
    params
  );
  if (!rowCount) throw new HttpError(404, "Evolución no encontrada");
  return findEvolution(from, to);
}

export async function deleteEvolution(from: number, to: number) {
  return withTransaction(async (client) => {
    const { rowCount } = await client.query(
      "DELETE FROM evolutions WHERE from_pokemon_id = $1 AND to_pokemon_id = $2",
      [from, to]
    );
    if (!rowCount) throw new HttpError(404, "Evolución no encontrada");
    await recomputeChains(client);
    return { from, to };
  });
}
