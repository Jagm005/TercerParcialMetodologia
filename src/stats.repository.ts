import { pool } from "./db";

/** Consultas de agregación: COUNT, COUNT(DISTINCT), GROUP BY, HAVING, subconsultas. */
export async function getStats() {
  const { rows: totals } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM pokemon)::int                             AS pokemon,
      (SELECT COUNT(*) FROM types)::int                               AS types,
      (SELECT COUNT(*) FROM evolutions)::int                          AS evolutions,
      (SELECT COUNT(DISTINCT evolution_chain_id) FROM pokemon)::int   AS families,
      (SELECT COUNT(*) FROM (
         SELECT pokemon_id FROM pokemon_types GROUP BY pokemon_id HAVING COUNT(*) = 2
       ) dual)::int                                                   AS dual_type,
      (SELECT COUNT(*) FROM pokemon p
        WHERE NOT EXISTS (SELECT 1 FROM evolutions e
                          WHERE e.from_pokemon_id = p.id OR e.to_pokemon_id = p.id))::int AS without_evolutions
  `);

  const { rows: byType } = await pool.query(`
    SELECT t.name, COUNT(pt.pokemon_id)::int AS total
    FROM types t LEFT JOIN pokemon_types pt ON pt.type_id = t.id
    GROUP BY t.name
    ORDER BY total DESC, t.name
  `);

  // Familias con 3 o más miembros
  const { rows: bigFamilies } = await pool.query(`
    SELECT COUNT(*)::int AS members,
           array_agg(name ORDER BY id) AS pokemon
    FROM pokemon
    GROUP BY evolution_chain_id
    HAVING COUNT(*) >= 3
    ORDER BY members DESC, MIN(id)
  `);

  const t = totals[0];
  return {
    totals: {
      pokemon: t.pokemon,
      types: t.types,
      evolutions: t.evolutions,
      families: t.families,
      dualType: t.dual_type,
      withoutEvolutions: t.without_evolutions,
    },
    byType,
    bigFamilies,
  };
}
