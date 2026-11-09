import { NextFunction, Request, RequestHandler, Response } from "express";

/** Error con código HTTP (400, 404, 409...) y mensaje para el cliente. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Permite usar async/await en las rutas y enviar los errores al manejador central. */
export const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

// Mensajes para las restricciones UNIQUE de PostgreSQL (error 23505)
const UNIQUE_MESSAGES: Record<string, string> = {
  pokemon_pkey: "Ya existe un Pokémon con ese número de Pokédex",
  pokemon_name_key: "Ya existe un Pokémon con ese nombre",
  types_name_key: "Ya existe un tipo con ese nombre",
  evolutions_pkey: "Esa evolución ya existe",
  ux_evolutions_to: "Ese Pokémon ya evoluciona desde otro (solo puede tener una pre-evolución)",
};

/** Traduce errores de validación y de PostgreSQL a respuestas HTTP claras. */
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El cuerpo de la petición no es un JSON válido" });
  }
  switch (err.code) {
    case "23505": // unique_violation
      return res.status(409).json({ error: UNIQUE_MESSAGES[err.constraint] ?? "Registro duplicado" });
    case "23503": // foreign_key_violation
      return res.status(400).json({ error: "Se hace referencia a un registro que no existe" });
    case "23514": // check_violation
    case "22P02": // invalid_text_representation
    case "22001": // string_data_right_truncation
      return res.status(400).json({ error: "Datos inválidos: " + err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
}
