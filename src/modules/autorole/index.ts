/**
 * Motivación: aportar utilidades (index) para construir la funcionalidad de autoroles sin duplicar parseo ni validación.
 *
 * Idea/concepto: define tipos, caché y validadores que consumen los sistemas y comandos de autorole.
 *
 * Alcance: piezas de infraestructura; no programan las reglas de asignación en sí mismas.
 */
export * from "./types";
export * from "./parsers";
export * from "./validation";
export * from "./cache";
