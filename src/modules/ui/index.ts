/**
 * Motivación: ofrecer primitivas de interfaz (index) para manejar el registro y ejecución de componentes interactivos.
 *
 * Idea/concepto: mantiene un sistema de señales/sesiones y augmentations para que los handlers de Seyfert resuelvan customIds.
 *
 * Alcance: organiza la infraestructura de UI; no define el contenido de cada componente ni sus reglas de negocio.
 */
export * from "./ui";
export * from "./signals";
export * from "./sessions";
export { Button } from "seyfert";
