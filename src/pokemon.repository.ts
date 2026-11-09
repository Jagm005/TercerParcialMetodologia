import { pool } from "./db";

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
      chain: row.chain,
      evolvesFrom: row.evolves_from,
      evolvesTo: row.evolves_to,
    },
  };
}

export async function findAll(filters: { type?: string; name?: string }): Promise<Pokemon[]> {
  const where: string[] = [];
  const params: string[] = [];

  if (filters.type) {
    params.push(filters.type.toLowerCase());
    where.push(`EXISTS (
      SELECT 1 FROM pokemon_types pt JOIN types t ON t.id = pt.type_id
      WHERE pt.pokemon_id = p.id AND t.name = $${params.length})`);
  }
  if (filters.name) {
    params.push(`%${filters.name}%`);
    where.push(`p.name ILIKE $${params.length}`);
  }

  const sql = `${BASE_QUERY} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.id`;
  const { rows } = await pool.query(sql, params);
  return rows.map(toPokemon);
}

/** Busca por número de Pokédex ("25") o por nombre ("pikachu"). */
export async function findOne(idOrName: string): Promise<Pokemon | null> {
  const isNumber = /^\d+$/.test(idOrName);
  const sql = `${BASE_QUERY} WHERE ${isNumber ? "p.id = $1" : "p.name = LOWER($1)"}`;
  const { rows } = await pool.query(sql, [isNumber ? Number(idOrName) : idOrName]);
  return rows[0] ? toPokemon(rows[0]) : null;
}

export async function findTypes(): Promise<{ name: string; total: number }[]> {
  const { rows } = await pool.query(`
    SELECT t.name, COUNT(pt.pokemon_id)::int AS total
    FROM types t LEFT JOIN pokemon_types pt ON pt.type_id = t.id
    GROUP BY t.name ORDER BY t.name
  `);
  return rows;
}
