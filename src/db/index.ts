/**
 * Motivación: exponer un punto de entrada único para la capa de datos del bot.
 *
 * Idea/concepto: reexporta modelos, repositorios y utilidades para simplificar las importaciones.
 *
 * Alcance: fachada de la capa de persistencia; no agrega lógica adicional.
 */
// Mongo backend wiring lives here. Import this module when you want to switch
// the data layer to MongoDB without touching business logic.

export * from "./client";
export * from "./models/user";
export * from "./models/guild";
export * from "./models/autorole";
export * from "./models/offers";

export * as MongoUsersRepo from "./repositories/users";
export * as MongoGuildsRepo from "./repositories/guilds";
export * as MongoAutoroleRepo from "./repositories/autorole";
export * as MongoOffersRepo from "./repositories/offers";
