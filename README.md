# Pokédex API (Gen 1)

API REST en **TypeScript + Express** que sirve los primeros 151 Pokémon desde **PostgreSQL**.

## Requisitos
- Node.js 18+
- PostgreSQL

## Instalación

```bash
npm install
```

1. Copia `.env.example` a `.env` y pon tu usuario/contraseña de Postgres.
2. Arranca la API:

```bash
npm run dev
```

Al arrancar, la API prepara todo sola:
- crea la base de datos `pokedex` si no existe,
- crea las tablas que falten (`CREATE TABLE IF NOT EXISTS`, nunca borra datos),
- si las tablas están vacías, descarga los 151 Pokémon de pokeapi.co y los guarda (solo la primera vez, tarda unos segundos).

En los siguientes arranques ya no descarga nada: lee todo desde PostgreSQL.

La interfaz visual está en la carpeta hermana `pokedex-web/` y se despliega aparte en Vercel.

Para volver a descargar y reemplazar los datos manualmente:

```bash
npm run db:reload
```

## Desplegar en Render (gratis)

Arquitectura: **API en Render** · **base de datos en Neon** · **frontend en Vercel**.

1. **Base de datos**: crea un proyecto en [Neon](https://neon.tech) y copia la *connection string*
   (`postgresql://usuario:clave@host/neondb?sslmode=require`).
2. **GitHub**: sube el proyecto a un repositorio (sin `node_modules/`, `dist/` ni `.env`;
   el `.gitignore` ya los excluye).
3. **Render**: en [render.com](https://render.com) → *New* → *Web Service* → conecta el repositorio y llena:

   | Campo              | Valor                          |
   |--------------------|--------------------------------|
   | Root Directory     | `pokedex-api`                  |
   | Runtime / Language | Node                           |
   | Build Command      | `npm ci && npm run build`      |
   | Start Command      | `npm start`                    |
   | Instance Type      | **Free**                       |

4. **Environment Variables**: agrega `DATABASE_URL` con la connection string de Neon.
   Opcional: `CORS_ORIGIN` con el dominio de Vercel.
5. *Deploy Web Service*. En el primer arranque crea las tablas y carga los 151 Pokémon solo.

Tu API quedará en `https://TU-API.onrender.com` (prueba `/api/pokemon/25`).

> El plan gratuito se duerme tras 15 minutos sin visitas; la siguiente petición tarda
> unos 30–60 segundos mientras despierta.

El `Dockerfile` también está incluido por si algún día usas un servicio que despliegue con Docker.
El `README.md` ya trae la cabecera que Hugging Face necesita (`sdk: docker`, `app_port: 7860`).

## Tablas

| Tabla           | Contenido                                                     |
|-----------------|---------------------------------------------------------------|
| `pokemon`       | id (# Pokédex), nombre, descripción, imagen, cadena evolutiva |
| `types`         | catálogo de tipos                                             |
| `pokemon_types` | tipos de cada Pokémon (slot 1 principal, 2 secundario)        |
| `evolutions`    | de quién a quién evoluciona, con nivel / objeto / intercambio |

## Endpoints

| Método | Ruta                          | Descripción                              |
|--------|-------------------------------|------------------------------------------|
| GET    | `/api/pokemon`                | Los 151 Pokémon                          |
| GET    | `/api/pokemon?type=fire`      | Filtrar por tipo                         |
| GET    | `/api/pokemon?name=char`      | Buscar por nombre (parcial)              |
| GET    | `/api/pokemon/25`             | Por número de Pokédex                    |
| GET    | `/api/pokemon/pikachu`        | Por nombre                               |
| GET    | `/api/types`                  | Tipos y cuántos Pokémon tiene cada uno   |

### Ejemplo: `GET /api/pokemon/2`

```json
{
  "pokedexNumber": 2,
  "name": "ivysaur",
  "types": ["grass", "poison"],
  "description": "Este Pokémon tiene un bulbo en el lomo. Dicen que, al absorber nutrientes, el bulbo se transforma en una flor grande.",
  "image": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/2.png",
  "evolutions": {
    "chain": [
      { "pokedexNumber": 1, "name": "bulbasaur", "image": "..." },
      { "pokedexNumber": 2, "name": "ivysaur",   "image": "..." },
      { "pokedexNumber": 3, "name": "venusaur",  "image": "..." }
    ],
    "evolvesFrom": { "id": 1, "name": "bulbasaur", "trigger": "level-up", "minLevel": 16, "item": null },
    "evolvesTo":   [{ "id": 3, "name": "venusaur", "trigger": "level-up", "minLevel": 32, "item": null }]
  }
}
```

## Notas
- Las descripciones están en español (si no existe, en inglés).
- Los tipos son los actuales de PokeAPI (por ejemplo Clefairy es `fairy`).
- Solo se guardan evoluciones entre Pokémon de la 1ª generación (no aparecen Pichu ni Crobat).
