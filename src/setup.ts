import { readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { pool } from "./db";
import { seedPokemon, TOTAL } from "./seed";

/**
 * Crea la base de datos indicada en DATABASE_URL si todavía no existe.
 * En servicios en la nube (Neon, Supabase...) la base ya existe, así que
 * primero se prueba la conexión y solo se intenta crearla si falta.
 */
async function ensureDatabase() {
  try {
    await pool.query("SELECT 1");
    return; // la base ya existe
  } catch (err: any) {
    if (err.code !== "3D000") throw err; // 3D000 = la base de datos no existe
  }

  const url = new URL(process.env.DATABASE_URL!);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  url.pathname = "/postgres"; // base de datos que siempre existe

  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (!rowCount) {
      console.log(`Creando la base de datos "${dbName}"...`);
      await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    }
  } finally {
    await admin.end();
  }
}

/** Crea las tablas que falten y las llena si están vacías. */
export async function setupDatabase() {
  await ensureDatabase();

  const schema = readFileSync(join(__dirname, "..", "db", "schema.sql"), "utf8");
  await pool.query(schema);

  const { rows } = await pool.query("SELECT COUNT(*)::int AS total FROM pokemon");
  // Solo si está vacía: así no se pisan los cambios hechos con POST/PUT/DELETE.
  if (rows[0].total === 0) {
    console.log(`Las tablas están vacías, cargando los ${TOTAL} Pokémon (solo la primera vez)...`);
    await seedPokemon();
  }
}
