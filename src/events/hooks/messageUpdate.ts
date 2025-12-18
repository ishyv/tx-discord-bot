/**
 * Motivación: centralizar el hook del evento "message Update" para tener un punto único de suscripción y emisión.
 *
 * Idea/concepto: envuelve la utilería createEventHook para exponer on/once/off/emit/clear tipados.
 *
 * Alcance: administra listeners del evento; no aplica reglas de negocio asociadas al mismo.
 */
import type { ResolveEventParams } from "seyfert";

import { createEventHook } from "@/events/hooks/createEventHook";

export type MessageUpdateArgs = ResolveEventParams<"messageUpdate">;
export type MessageUpdateListener = (
  ...args: MessageUpdateArgs
) => Promise<void> | void;

const updateHook = createEventHook<MessageUpdateArgs>({
  name: "messageUpdate",
});

export const onMessageUpdate = updateHook.on;
export const onceMessageUpdate = updateHook.once;
export const offMessageUpdate = updateHook.off;
export const emitMessageUpdate = updateHook.emit;
export const clearMessageUpdateListeners = updateHook.clear;
