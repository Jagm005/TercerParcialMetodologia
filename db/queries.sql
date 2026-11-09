-- =====================================================================
--  Pokédex · Consultas SQL de referencia
--  Puedes ejecutarlas en pgAdmin, psql o el SQL Editor de Neon.
--  Cada bloque indica qué endpoint de la API hace lo mismo.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. SELECT básico                         GET /api/pokemon
-- ---------------------------------------------------------------------
SELECT id, name, description, image_url
FROM pokemon
ORDER BY id;


-- ---------------------------------------------------------------------
-- 2. WHERE: buscar uno                     GET /api/pokemon/25  |  /api/pokemon/pikachu
-- ---------------------------------------------------------------------
SELECT * FROM pokemon WHERE id = 25;
SELECT * FROM pokemon WHERE name = 'pikachu';


-- ---------------------------------------------------------------------
-- 3. ILIKE: búsqueda parcial sin mayúsculas   GET /api/pokemon?name=char
-- ---------------------------------------------------------------------
SELECT id, name FROM pokemon WHERE name ILIKE '%char%';


-- ---------------------------------------------------------------------
-- 4. JOIN: Pokémon con sus tipos           (columna "types" de la API)
-- ---------------------------------------------------------------------
SELECT p.id, p.name, t.name AS type, pt.slot
FROM pokemon p
JOIN pokemon_types pt ON pt.pokemon_id = p.id
JOIN types t          ON t.id = pt.type_id
ORDER BY p.id, pt.slot;


-- ---------------------------------------------------------------------
-- 5. Agrupar en una fila: string_agg / array_agg
-- ---------------------------------------------------------------------
SELECT p.id, p.name, string_agg(t.name, ' / ' ORDER BY pt.slot) AS types
FROM pokemon p
JOIN pokemon_types pt ON pt.pokemon_id = p.id
JOIN types t          ON t.id = pt.type_id
GROUP BY p.id, p.name
ORDER BY p.id;


-- ---------------------------------------------------------------------
-- 6. EXISTS: filtrar por tipo              GET /api/pokemon?type=fire
-- ---------------------------------------------------------------------
SELECT p.id, p.name
FROM pokemon p
WHERE EXISTS (
  SELECT 1 FROM pokemon_types pt JOIN types t ON t.id = pt.type_id
  WHERE pt.pokemon_id = p.id AND t.name = 'fire'
);


-- ---------------------------------------------------------------------
-- 7. ORDER BY + LIMIT/OFFSET: paginación   GET /api/pokemon?sort=name&order=desc&limit=10&offset=20
-- ---------------------------------------------------------------------
SELECT id, name FROM pokemon
ORDER BY name DESC
LIMIT 10 OFFSET 20;


-- ---------------------------------------------------------------------
-- 8. LEFT JOIN + COUNT + GROUP BY          GET /api/types
-- ---------------------------------------------------------------------
SELECT t.name, COUNT(pt.pokemon_id) AS total
FROM types t
LEFT JOIN pokemon_types pt ON pt.type_id = t.id
GROUP BY t.name
ORDER BY total DESC;


-- ---------------------------------------------------------------------
-- 9. HAVING: Pokémon con doble tipo        GET /api/stats (dualType)
-- ---------------------------------------------------------------------
SELECT pokemon_id, COUNT(*) AS cantidad_tipos
FROM pokemon_types
GROUP BY pokemon_id
HAVING COUNT(*) = 2;


-- ---------------------------------------------------------------------
-- 10. Self JOIN: evoluciones con nombres   GET /api/evolutions
-- ---------------------------------------------------------------------
SELECT f.name AS desde, t.name AS hacia, e.trigger, e.min_level, e.item
FROM evolutions e
JOIN pokemon f ON f.id = e.from_pokemon_id
JOIN pokemon t ON t.id = e.to_pokemon_id
ORDER BY e.from_pokemon_id;


-- ---------------------------------------------------------------------
-- 11. CTE recursiva: toda la línea evolutiva a partir de un Pokémon
--     (Charmander -> Charmeleon -> Charizard)
-- ---------------------------------------------------------------------
WITH RECURSIVE linea(id, etapa) AS (
  SELECT 4, 1                                   -- empieza en Charmander (#4)
  UNION ALL
  SELECT e.to_pokemon_id, l.etapa + 1
  FROM evolutions e JOIN linea l ON e.from_pokemon_id = l.id
)
SELECT l.etapa, p.id, p.name
FROM linea l JOIN pokemon p ON p.id = l.id
ORDER BY l.etapa;


-- ---------------------------------------------------------------------
-- 12. INSERT                                POST /api/types  y  POST /api/pokemon
-- ---------------------------------------------------------------------
INSERT INTO types (name) VALUES ('cosmic') RETURNING id, name;

-- Un Pokémon nuevo + sus tipos, todo en una TRANSACCIÓN (o se guarda todo o nada)
BEGIN;
  INSERT INTO pokemon (id, name, description, image_url, evolution_chain_id)
  VALUES (152, 'chikorita', 'Una hoja crece en su cabeza.', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/152.png', 152);

  INSERT INTO pokemon_types (pokemon_id, type_id, slot)
  SELECT 152, id, 1 FROM types WHERE name = 'grass';
COMMIT;


-- ---------------------------------------------------------------------
-- 13. UPSERT: insertar o actualizar si ya existe (ON CONFLICT)
-- ---------------------------------------------------------------------
INSERT INTO types (name) VALUES ('fire')
ON CONFLICT (name) DO NOTHING;

INSERT INTO pokemon (id, name, description, image_url, evolution_chain_id)
VALUES (152, 'chikorita', 'Descripción actualizada.', 'https://example.com/152.png', 152)
ON CONFLICT (id) DO UPDATE
SET description = EXCLUDED.description;


-- ---------------------------------------------------------------------
-- 14. UPDATE                                PUT / PATCH /api/pokemon/152
-- ---------------------------------------------------------------------
UPDATE pokemon
SET description = 'Le gusta tomar el sol.'
WHERE id = 152
RETURNING id, name, description;

-- Renombrar un tipo                        PUT /api/types/cosmic
UPDATE types SET name = 'astral' WHERE name = 'cosmic';

-- Cambiar condición de una evolución        PATCH /api/evolutions/4/5
UPDATE evolutions SET min_level = 18 WHERE from_pokemon_id = 4 AND to_pokemon_id = 5;


-- ---------------------------------------------------------------------
-- 15. DELETE                                DELETE /api/pokemon/152
-- ---------------------------------------------------------------------
-- ON DELETE CASCADE borra también sus filas en pokemon_types y evolutions
DELETE FROM pokemon WHERE id = 152 RETURNING id, name;

DELETE FROM types WHERE name = 'astral';


-- ---------------------------------------------------------------------
-- 16. Deshacer cambios con ROLLBACK (prueba sin miedo)
-- ---------------------------------------------------------------------
BEGIN;
  DELETE FROM pokemon WHERE id = 25;              -- adiós Pikachu...
  SELECT COUNT(*) FROM pokemon;                   -- 150
ROLLBACK;                                         -- ...y vuelve
SELECT name FROM pokemon WHERE id = 25;           -- pikachu
