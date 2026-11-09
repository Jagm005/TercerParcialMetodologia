import "dotenv/config";
import { Pool, PoolClient } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("Falta DATABASE_URL en el archivo .env");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Ejecuta varias consultas como una sola transacción:
 * BEGIN -> consultas -> COMMIT, o ROLLBACK si algo falla (no queda nada a medias).
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
