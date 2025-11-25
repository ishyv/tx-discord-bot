/**
 * Motivación: centralizar el hook del evento "bot Ready" para tener un punto único de suscripción y emisión.
 *
 * Idea/concepto: envuelve la utilería createEventHook para exponer on/once/off/emit/clear tipados.
 *
 * Alcance: administra listeners del evento; no aplica reglas de negocio asociadas al mismo.
 */
import type { ResolveEventParams } from "seyfert";
import { createEventHook } from "@/events/hooks/createEventHook";

/** Parametros tipados que Seyfert provee al evento `botReady`. */
export type BotReadyArgs = ResolveEventParams<"botReady">;
export type BotReadyListenerArgs = [
  BotReadyArgs[0],
  BotReadyArgs[1],
  BotReadyArgs[2]?,
];
export type BotReadyListener = (
  ...args: BotReadyListenerArgs
) => Promise<void> | void;

export const [
  /**
 * Registra un listener permanente para `botReady`.
 * Devuelve una funcion que permite removerlo facilmente.
 */
  onBotReady,

  /** Registra un listener de unica ejecucion para `botReady`. */
  onceBotReady,

  /** Elimina un listener previamente registrado para `botReady`. */
  offBotReady,

  /** Ejecuta todos los listeners registrados propagando los datos originales del evento. */
  emitBotReady,

  /** Elimina todos los listeners actualmente registrados para `botReady`. */
  clearBotReadyListeners,
] = createEventHook<BotReadyListenerArgs>().make();


