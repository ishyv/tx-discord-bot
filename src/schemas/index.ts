/**
 * Motivación: definir el contrato de datos index para asegurar que el resto del código consuma estructuras consistentes.
 *
 * Idea/concepto: usa tipos/interfaces para describir campos esperados y su intención en el dominio.
 *
 * Alcance: solo declara formas de datos; no valida en tiempo de ejecución ni persiste información.
 */
export * from "./user";
export * from "./guild";
export * from "./autorole";
export * from "./tops";
