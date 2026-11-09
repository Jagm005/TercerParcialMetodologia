/**
 * Llena las tablas con los primeros 151 Pokémon usando datos de https://pokeapi.co
 * Solo hace falta una vez: después la API lee todo desde PostgreSQL.
 */
import { pool } from "./db";

const POKEAPI = "https://pokeapi.co/api/v2";
export const TOTAL = 151;

interface ChainNode {
  species: { name: string; url: string };
  evolution_details: {
    trigger: { name: string } | null;
    min_level: number | null;
    item: { name: string } | null;
  }[];
  evolves_to: ChainNode[];
}

interface Edge {
  from: number;
  to: number;
  trigger: string | null;
  minLevel: number | null;
  item: string | null;
}

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as T;
    if (attempt >= 3) throw new Error(`${res.status} al pedir ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

const idFromUrl = (url: string) => Number(url.split("/").filter(Boolean).pop());

/** Ejecuta fn sobre items con un máximo de `limit` peticiones en paralelo. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

function cleanText(text: string) {
  return text.replace(/[\n\f\r­]+/g, " ").replace(/\s+/g, " ").trim();
}

function collectEdges(node: ChainNode, edges: Edge[]) {
  const from = idFromUrl(node.species.url);
  for (const child of node.evolves_to) {
    const to = idFromUrl(child.species.url);
    const d = child.evolution_details[0];
    edges.push({
      from,
      to,
      trigger: d?.trigger?.name ?? null,
      minLevel: d?.min_level ?? null,
      item: d?.item?.name ?? null,
    });
    collectEdges(child, edges);
  }
}

export async function seedPokemon() {
  const ids = Array.from({ length: TOTAL }, (_, i) => i + 1);

  console.log("Descargando datos de PokeAPI...");
  const data = await mapLimit(ids, 10, async (id) => {
    const [poke, species] = await Promise.all([
      getJson<any>(`${POKEAPI}/pokemon/${id}`),
      getJson<any>(`${POKEAPI}/pokemon-species/${id}`),
    ]);

    const entries: any[] = species.flavor_text_entries;
    const entry =
      entries.find((e) => e.language.name === "es") ??
      entries.find((e) => e.language.name === "en");

    return {
      id,
      name: poke.name as string,
      description: cleanText(entry?.flavor_text ?? ""),
      image:
        poke.sprites.other?.["official-artwork"]?.front_default ??
        poke.sprites.front_default,
      chainId: idFromUrl(species.evolution_chain.url),
      types: (poke.types as any[]).map((t) => ({ slot: t.slot, name: t.type.name as string })),
    };
  });

  const chainIds = [...new Set(data.map((p) => p.chainId))];
  const chains = await mapLimit(chainIds, 10, (cid) =>
    getJson<{ chain: ChainNode }>(`${POKEAPI}/evolution-chain/${cid}`)
  );
  const edges: Edge[] = [];
  chains.forEach((c) => collectEdges(c.chain, edges));
  // Solo evoluciones entre Pokémon de la 1ª generación (ej. se descarta Pichu -> Pikachu)
  const gen1Edges = edges.filter((e) => e.from <= TOTAL && e.to <= TOTAL);

  console.log("Guardando en PostgreSQL...");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE evolutions, pokemon_types, types, pokemon RESTART IDENTITY CASCADE");

    for (const p of data) {
      await client.query(
        `INSERT INTO pokemon (id, name, description, image_url, evolution_chain_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [p.id, p.name, p.description, p.image, p.chainId]
      );
      for (const t of p.types) {
        const { rows } = await client.query(
          `INSERT INTO types (name) VALUES ($1)
           ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [t.name]
        );
        await client.query(
          "INSERT INTO pokemon_types (pokemon_id, type_id, slot) VALUES ($1, $2, $3)",
          [p.id, rows[0].id, t.slot]
        );
      }
    }

    for (const e of gen1Edges) {
      await client.query(
        `INSERT INTO evolutions (from_pokemon_id, to_pokemon_id, trigger, min_level, item)
         VALUES ($1, $2, $3, $4, $5)`,
        [e.from, e.to, e.trigger, e.minLevel, e.item]
      );
    }

    await client.query("COMMIT");
    console.log(`Listo: ${data.length} Pokémon y ${gen1Edges.length} evoluciones.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
