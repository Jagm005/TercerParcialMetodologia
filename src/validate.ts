import { HttpError } from "./http";

/** "full" = POST/PUT (todos los campos obligatorios). "partial" = PATCH (al menos uno). */
export type Mode = "full" | "partial";

const bad = (msg: string) => new HttpError(400, msg);

function asObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw bad("Envía un objeto JSON en el cuerpo (Content-Type: application/json)");
  }
  return body as Record<string, unknown>;
}

export function parseId(value: unknown, field = "id"): number {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1) {
    throw bad(`"${field}" debe ser un número entero positivo`);
  }
  return n;
}

function str(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw bad(`"${field}" debe ser un texto no vacío`);
  if (value.trim().length > max) throw bad(`"${field}" admite como máximo ${max} caracteres`);
  return value.trim();
}

function optionalStr(value: unknown, field: string, max: number): string | null {
  return value === null ? null : str(value, field, max);
}

function typeName(value: unknown, field = "name"): string {
  const name = str(value, field, 20).toLowerCase();
  if (!/^[a-z-]+$/.test(name)) throw bad(`"${field}" solo admite letras minúsculas y guiones (ej. "fire")`);
  return name;
}

/* ---------- Pokémon ---------- */

export interface PokemonInput {
  pokedexNumber?: number;
  name?: string;
  description?: string;
  image?: string;
  types?: string[];
}

export function pokemonBody(raw: unknown, mode: Mode, withNumber = false): PokemonInput {
  const body = asObject(raw);
  const out: PokemonInput = {};

  if (withNumber) out.pokedexNumber = parseId(body.pokedexNumber, "pokedexNumber");

  if (body.name !== undefined) out.name = str(body.name, "name", 50).toLowerCase();
  if (body.description !== undefined) out.description = str(body.description, "description", 1000);
  if (body.image !== undefined) {
    out.image = str(body.image, "image", 500);
    if (!/^https?:\/\//.test(out.image)) throw bad(`"image" debe ser una URL http(s)`);
  }
  if (body.types !== undefined) {
    if (!Array.isArray(body.types) || body.types.length < 1 || body.types.length > 2) {
      throw bad(`"types" debe ser una lista con 1 o 2 tipos, ej. ["fire", "flying"]`);
    }
    out.types = body.types.map((t) => typeName(t, "types"));
    if (out.types[0] === out.types[1]) throw bad(`"types" no puede repetir el mismo tipo`);
  }

  const fields = ["name", "description", "image", "types"] as const;
  if (mode === "full") {
    const missing = fields.filter((f) => out[f] === undefined);
    if (missing.length) throw bad(`Faltan campos obligatorios: ${missing.join(", ")}`);
  } else if (!fields.some((f) => out[f] !== undefined)) {
    throw bad(`Envía al menos un campo para actualizar: ${fields.join(", ")}`);
  }
  return out;
}

/* ---------- Tipos ---------- */

export function typeBody(raw: unknown): string {
  return typeName(asObject(raw).name);
}

/* ---------- Evoluciones ---------- */

export interface EvolutionInput {
  from?: number;
  to?: number;
  trigger?: string | null;
  minLevel?: number | null;
  item?: string | null;
}

export function evolutionBody(raw: unknown, mode: Mode, withIds = false): EvolutionInput {
  const body = asObject(raw);
  const out: EvolutionInput = {};

  if (withIds) {
    out.from = parseId(body.from, "from");
    out.to = parseId(body.to, "to");
    if (out.from === out.to) throw bad("Un Pokémon no puede evolucionar en sí mismo");
  }
  if (body.trigger !== undefined) out.trigger = optionalStr(body.trigger, "trigger", 30);
  if (body.item !== undefined) out.item = optionalStr(body.item, "item", 50);
  if (body.minLevel !== undefined) {
    const lvl = body.minLevel;
    if (lvl !== null && (typeof lvl !== "number" || !Number.isInteger(lvl) || lvl < 1 || lvl > 100)) {
      throw bad(`"minLevel" debe ser un entero entre 1 y 100, o null`);
    }
    out.minLevel = lvl as number | null;
  }

  const fields = ["trigger", "minLevel", "item"] as const;
  if (mode === "full") {
    // PUT/POST: los campos que no se envían quedan en null
    for (const f of fields) if (out[f] === undefined) out[f] = null;
  } else if (!fields.some((f) => out[f] !== undefined)) {
    throw bad(`Envía al menos un campo para actualizar: ${fields.join(", ")}`);
  }
  return out;
}

/* ---------- Listado ---------- */

export function listQuery(q: Record<string, unknown>) {
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const out = {
    type: s(q.type)?.toLowerCase(),
    name: s(q.name),
    sort: (s(q.sort) ?? "id") as "id" | "name",
    order: (s(q.order) ?? "asc") as "asc" | "desc",
    limit: undefined as number | undefined,
    offset: 0,
  };
  if (!["id", "name"].includes(out.sort)) throw bad(`"sort" solo admite "id" o "name"`);
  if (!["asc", "desc"].includes(out.order)) throw bad(`"order" solo admite "asc" o "desc"`);
  if (q.limit !== undefined) {
    out.limit = parseId(q.limit, "limit");
    if (out.limit > 200) throw bad(`"limit" admite como máximo 200`);
  }
  if (q.offset !== undefined) {
    if (typeof q.offset !== "string" || !/^\d+$/.test(q.offset)) throw bad(`"offset" debe ser un entero >= 0`);
    out.offset = Number(q.offset);
  }
  return out;
}
