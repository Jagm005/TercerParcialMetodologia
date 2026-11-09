import { pool, withTransaction } from "./db";
import { HttpError } from "./http";

/** SELECT con LEFT JOIN + COUNT + GROUP BY: cuántos Pokémon tiene cada tipo. */
export async function findTypes(): Promise<{ name: string; total: number }[]> {
  const { rows } = await pool.query(`
    SELECT t.name, COUNT(pt.pokemon_id)::int AS total
    FROM types t LEFT JOIN pokemon_types pt ON pt.type_id = t.id
    GROUP BY t.name ORDER BY t.name
  `);
  return rows;
}

export async function findType(name: string) {
  const { rows } = await pool.query(
    `SELECT t.name,
            COALESCE(json_agg(json_build_object('pokedexNumber', p.id, 'name', p.name, 'image', p.image_url)
                     ORDER BY p.id) FILTER (WHERE p.id IS NOT NULL), '[]'::json) AS pokemon
     FROM types t
     LEFT JOIN pokemon_types pt ON pt.type_id = t.id
     LEFT JOIN pokemon p ON p.id = pt.pokemon_id
     WHERE t.name = $1
     GROUP BY t.name`,
    [name]
  );
  if (!rows[0]) throw new HttpError(404, "Tipo no encontrado");
  return { name: rows[0].name, total: rows[0].pokemon.length, pokemon: rows[0].pokemon };
}

export async function createType(name: string) {
  const { rows } = await pool.query("INSERT INTO types (name) VALUES ($1) RETURNING name", [name]);
  return { name: rows[0].name, total: 0 };
}

export async function renameType(current: string, next: string) {
  const { rowCount } = await pool.query("UPDATE types SET name = $2 WHERE name = $1", [current, next]);
  if (!rowCount) throw new HttpError(404, "Tipo no encontrado");
  return findType(next);
}

/** Si el tipo está en uso pide ?force=true; entonces lo quita de todos los Pokémon. */
export async function deleteType(name: string, force: boolean) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT t.id, COUNT(pt.pokemon_id)::int AS used
       FROM types t LEFT JOIN pokemon_types pt ON pt.type_id = t.id
       WHERE t.name = $1 GROUP BY t.id`,
      [name]
    );
    if (!rows[0]) throw new HttpError(404, "Tipo no encontrado");
    if (rows[0].used && !force) {
      throw new HttpError(
        409,
        `El tipo "${name}" lo usan ${rows[0].used} Pokémon. Usa ?force=true para quitárselo a todos y borrarlo`
      );
    }

    await client.query("DELETE FROM types WHERE id = $1", [rows[0].id]); // CASCADE en pokemon_types
    // Si un Pokémon perdió su tipo principal, el secundario pasa a ser el principal
    await client.query(`
      UPDATE pokemon_types pt SET slot = 1
      WHERE slot = 2
        AND NOT EXISTS (SELECT 1 FROM pokemon_types o WHERE o.pokemon_id = pt.pokemon_id AND o.slot = 1)
    `);
    return { name, removedFromPokemon: rows[0].used as number };
  });
}
