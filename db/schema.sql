-- Esquema de la Pokédex (primeros 151 Pokémon).
-- Se ejecuta automáticamente al arrancar la API; IF NOT EXISTS evita borrar datos.

-- Pokémon: el id es el número en la Pokédex nacional (1..151)
CREATE TABLE IF NOT EXISTS pokemon (
  id                 INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 151),
  name               VARCHAR(50)  NOT NULL UNIQUE,
  description        TEXT         NOT NULL,
  image_url          TEXT         NOT NULL,
  evolution_chain_id INTEGER      NOT NULL
);

-- Catálogo de tipos (fire, water, grass...)
CREATE TABLE IF NOT EXISTS types (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(20) NOT NULL UNIQUE
);

-- Relación N:M Pokémon <-> tipo. slot 1 = tipo principal, 2 = secundario
CREATE TABLE IF NOT EXISTS pokemon_types (
  pokemon_id INTEGER  NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
  type_id    INTEGER  NOT NULL REFERENCES types(id)   ON DELETE CASCADE,
  slot       SMALLINT NOT NULL CHECK (slot IN (1, 2)),
  PRIMARY KEY (pokemon_id, type_id)
);

-- Evoluciones: "from" evoluciona a "to"
CREATE TABLE IF NOT EXISTS evolutions (
  from_pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
  to_pokemon_id   INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
  trigger         VARCHAR(30),   -- level-up, use-item, trade
  min_level       INTEGER,
  item            VARCHAR(50),
  PRIMARY KEY (from_pokemon_id, to_pokemon_id)
);

CREATE INDEX IF NOT EXISTS idx_pokemon_chain ON pokemon(evolution_chain_id);
CREATE INDEX IF NOT EXISTS idx_pokemon_types_type ON pokemon_types(type_id);
