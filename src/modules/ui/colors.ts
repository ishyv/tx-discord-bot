/**
 * Motivación: ofrecer primitivas de interfaz (colors) para manejar el registro y ejecución de componentes interactivos.
 *
 * Idea/concepto: mantiene un sistema de señales/sesiones y augmentations para que los handlers de Seyfert resuelvan customIds.
 *
 * Alcance: organiza la infraestructura de UI; no define el contenido de cada componente ni sus reglas de negocio.
 */
/** Shared UI color palette for severity and ticket statuses. */
export const Colors = {
  critical: "#E02424", // Critical / Blocker
  high: "#FF7A00", // High / Needs attention
  medium: "#F59E0B", // Medium / Warning
  low: "#10B981", // Low / Notice
  info: "#2563EB", // Info / Normal
  debug: "#6B7280", // Debug / Verbose
  neutral: "#7C3AED", // Neutral / Default
} as const;

export type ColorKey = keyof typeof Colors;
