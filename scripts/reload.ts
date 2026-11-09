/** Opcional: vuelve a descargar los 151 Pokémon y reemplaza los datos guardados. */
import { pool } from "../src/db";
import { seedPokemon } from "../src/seed";
import { setupDatabase } from "../src/setup";

setupDatabase()
  .then(seedPokemon)
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
