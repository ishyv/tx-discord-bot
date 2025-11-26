/**
 * Motivación: concentrar operaciones de acceso a datos de index en una API reutilizable.
 *
 * Idea/concepto: envuelve modelos y consultas en funciones claras para que el resto del código no conozca detalles de persistencia.
 *
 * Alcance: provee CRUD y helpers de datos; no define reglas de negocio ni validaciones complejas.
 */
export * from "./users";
export * from "./guilds";
export * from "./autorole";
export * from "./offers";
