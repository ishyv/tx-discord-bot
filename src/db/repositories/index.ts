/**
 * Repositorios de base de datos (MongoDB).
 *
 * Este directorio centraliza el acceso a datos y es el único lugar donde deberíamos
 * hablar “Mongo” (colecciones, queries, upserts, etc.). El resto del bot consume
 * funciones con nombres claros y tipos estables.
 *
 * Alcance:
 * - CRUD + helpers pequeños de persistencia/normalización.
 * - Validación y defaults vía schemas (Zod) cuando aplica.
 * - No implementa reglas de negocio (eso vive en `modules/*` o `services/*`).
 */
export * from "./users";
export * from "./guilds";
export * from "./autorole";
export * from "./offers";
export * from "./tops";
