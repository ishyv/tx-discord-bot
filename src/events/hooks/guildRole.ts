/**
 * Motivación: centralizar el hook del evento "guild Role" para tener un punto único de suscripción y emisión.
 *
 * Idea/concepto: envuelve la utilería createEventHook para exponer on/once/off/emit/clear tipados.
 *
 * Alcance: administra listeners del evento; no aplica reglas de negocio asociadas al mismo.
 */
import type { ResolveEventParams } from "seyfert";

import { createEventHook } from "@/events/hooks/createEventHook";

export type GuildRoleCreateArgs = ResolveEventParams<"guildRoleCreate">;
export type GuildRoleCreateListener = (
  ...args: GuildRoleCreateArgs
) => Promise<void> | void;

const roleCreateHook = createEventHook<GuildRoleCreateArgs>({
  name: "guildRoleCreate",
});

export const onGuildRoleCreate = roleCreateHook.on;
export const onceGuildRoleCreate = roleCreateHook.once;
export const offGuildRoleCreate = roleCreateHook.off;
export const emitGuildRoleCreate = roleCreateHook.emit;
export const clearGuildRoleCreateListeners = roleCreateHook.clear;

export type GuildRoleUpdateArgs = ResolveEventParams<"guildRoleUpdate">;
export type GuildRoleUpdateListener = (
  ...args: GuildRoleUpdateArgs
) => Promise<void> | void;

const roleUpdateHook = createEventHook<GuildRoleUpdateArgs>({
  name: "guildRoleUpdate",
});

export const onGuildRoleUpdate = roleUpdateHook.on;
export const onceGuildRoleUpdate = roleUpdateHook.once;
export const offGuildRoleUpdate = roleUpdateHook.off;
export const emitGuildRoleUpdate = roleUpdateHook.emit;
export const clearGuildRoleUpdateListeners = roleUpdateHook.clear;

export type GuildRoleDeleteArgs = ResolveEventParams<"guildRoleDelete">;
export type GuildRoleDeleteListener = (
  ...args: GuildRoleDeleteArgs
) => Promise<void> | void;

const roleDeleteHook = createEventHook<GuildRoleDeleteArgs>({
  name: "guildRoleDelete",
});

export const onGuildRoleDelete = roleDeleteHook.on;
export const onceGuildRoleDelete = roleDeleteHook.once;
export const offGuildRoleDelete = roleDeleteHook.off;
export const emitGuildRoleDelete = roleDeleteHook.emit;
export const clearGuildRoleDeleteListeners = roleDeleteHook.clear;
