/**
 * Motivación: exponer un punto de entrada único para la capa de datos del bot.
 *
 * Idea/concepto: reexporta modelos, repositorios y utilidades para simplificar las importaciones.
 *
 * Alcance: fachada de la capa de persistencia; no agrega lógica adicional.
 */
// Mongo backend wiring lives here using the native driver and Zod schemas.

export * from "./normalizers";
export * from "./mongo";
export * as DbSchemas from "./schemas/user";
export * as GuildSchemas from "./schemas/guild";
export * as OfferSchemas from "./schemas/offers";
export * as TopSchemas from "./schemas/tops";

export * as MongoUsersRepo from "./repositories/users";
export * as MongoOffersRepo from "./repositories/offers";
export * as MongoTopsRepo from "./repositories/tops";
