/**
 * Motivación: estructurar el módulo offers (index) en piezas reutilizables y autocontenidas.
 *
 * Idea/concepto: agrupa helpers y orquestadores bajo un mismo dominio para evitar acoplamientos dispersos.
 *
 * Alcance: soporte de dominio; no sustituye a los comandos o servicios que consumen el módulo.
 */
export * from "./types";
export * from "./service";
