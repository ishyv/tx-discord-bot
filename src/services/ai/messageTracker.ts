/**
 * Motivacion: detectar si un mensaje del bot fue generado por IA.
 *
 * Idea/concepto: los mensajes generados por IA incluyen un marcador fijo en el contenido.
 * Luego basta con verificar si el contenido contiene `AI_GENERATED_MESSAGE`.
 *
 * Alcance: utilidades puras (sin IO ni persistencia).
 */
import { AI_GENERATED_MESSAGE } from "@/constants/ai";

export const AI_GENERATED_MESSAGE_SUFFIX = `\n\n${AI_GENERATED_MESSAGE}`;

export function markAIMessage(content: string): string {
  const base = typeof content === "string" ? content.trimEnd() : "";
  if (!base) return AI_GENERATED_MESSAGE;
  if (base.includes(AI_GENERATED_MESSAGE)) return base;
  return `${base}${AI_GENERATED_MESSAGE_SUFFIX}`;
}

export function isAIMessage(content: string | null | undefined): boolean {
  if (typeof content !== "string" || !content) return false;
  return content.includes(AI_GENERATED_MESSAGE);
}

export function stripAIMessageMarker(content: string): string {
  if (!content) return "";

  const escapedMarker = escapeRegExp(AI_GENERATED_MESSAGE);
  const markerAsOwnLineAtEnd = new RegExp(
    `\\n\\s*\\n\\s*${escapedMarker}\\s*$`,
  );
  const markerOnly = new RegExp(`^\\s*${escapedMarker}\\s*$`);

  return content
    .replace(markerAsOwnLineAtEnd, "")
    .replace(markerOnly, "")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
