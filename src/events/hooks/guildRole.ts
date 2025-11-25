/**
 * Motivación: centralizar el hook del evento "guild Role" para tener un punto único de suscripción y emisión.
 *
 * Idea/concepto: envuelve la utilería createEventHook para exponer on/once/off/emit/clear tipados.
 *
 * Alcance: administra listeners del evento; no aplica reglas de negocio asociadas al mismo.
 */
import type { ResolveEventParams } from "seyfert";

import { createEventHook } from "@/events/hooks/createEventHook";

export type GuildRoleDeleteArgs = ResolveEventParams<"guildRoleDelete">;
export type GuildRoleDeleteListener = (
  ...args: GuildRoleDeleteArgs
) => Promise<void> | void;

const roleDeleteHook = createEventHook<GuildRoleDeleteArgs>();

export const onGuildRoleDelete = roleDeleteHook.on;
export const onceGuildRoleDelete = roleDeleteHook.once;
export const offGuildRoleDelete = roleDeleteHook.off;
export const emitGuildRoleDelete = roleDeleteHook.emit;
export const clearGuildRoleDeleteListeners = roleDeleteHook.clear;

