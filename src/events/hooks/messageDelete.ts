/**
 * Motivación: centralizar el hook del evento "message Delete" para tener un punto único de suscripción y emisión.
 *
 * Idea/concepto: envuelve la utilería createEventHook para exponer on/once/off/emit/clear tipados.
 *
 * Alcance: administra listeners del evento; no aplica reglas de negocio asociadas al mismo.
 */
import type { ResolveEventParams } from "seyfert";

import { createEventHook } from "@/events/hooks/createEventHook";

export type MessageDeleteArgs = ResolveEventParams<"messageDelete">;
export type MessageDeleteListener = (
  ...args: MessageDeleteArgs
) => Promise<void> | void;

const deleteHook = createEventHook<MessageDeleteArgs>({
  name: "messageDelete",
});

export const onMessageDelete = deleteHook.on;
export const onceMessageDelete = deleteHook.once;
export const offMessageDelete = deleteHook.off;
export const emitMessageDelete = deleteHook.emit;
export const clearMessageDeleteListeners = deleteHook.clear;

export type MessageDeleteBulkArgs = ResolveEventParams<"messageDeleteBulk">;
export type MessageDeleteBulkListener = (
  ...args: MessageDeleteBulkArgs
) => Promise<void> | void;

const bulkHook = createEventHook<MessageDeleteBulkArgs>({
  name: "messageDeleteBulk",
});

export const onMessageDeleteBulk = bulkHook.on;
export const onceMessageDeleteBulk = bulkHook.once;
export const offMessageDeleteBulk = bulkHook.off;
export const emitMessageDeleteBulk = bulkHook.emit;
export const clearMessageDeleteBulkListeners = bulkHook.clear;
