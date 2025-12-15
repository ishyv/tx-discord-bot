/**
 * Autorole: API pública de persistencia/servicios del sistema.
 *
 * Este barrel exporta repos, cache-service, service y presets para que el resto del bot
 * importe desde un solo lugar (`@/db/repositories`).
 */
export * from "./autorole.repo";
export * from "./autorole.cache-service";
export * from "./autorole.service";
export * from "./autorole.presets";
