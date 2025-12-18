/**
 * Centraliza hooks para eventos de miembros del gremio (entradas, salidas y actualizaciones).
 * Expone on/once/off/emit/clear tipados para evitar duplicar wiring en listeners.
 */
import type { ResolveEventParams } from "seyfert";

import { createEventHook } from "@/events/hooks/createEventHook";

export type GuildMemberAddArgs = ResolveEventParams<"guildMemberAdd">;
export type GuildMemberAddListener = (
  ...args: GuildMemberAddArgs
) => Promise<void> | void;

const memberAddHook = createEventHook<GuildMemberAddArgs>({
  name: "guildMemberAdd",
});

export const onGuildMemberAdd = memberAddHook.on;
export const onceGuildMemberAdd = memberAddHook.once;
export const offGuildMemberAdd = memberAddHook.off;
export const emitGuildMemberAdd = memberAddHook.emit;
export const clearGuildMemberAddListeners = memberAddHook.clear;

export type GuildMemberRemoveArgs = ResolveEventParams<"guildMemberRemove">;
export type GuildMemberRemoveListener = (
  ...args: GuildMemberRemoveArgs
) => Promise<void> | void;

const memberRemoveHook = createEventHook<GuildMemberRemoveArgs>({
  name: "guildMemberRemove",
});

export const onGuildMemberRemove = memberRemoveHook.on;
export const onceGuildMemberRemove = memberRemoveHook.once;
export const offGuildMemberRemove = memberRemoveHook.off;
export const emitGuildMemberRemove = memberRemoveHook.emit;
export const clearGuildMemberRemoveListeners = memberRemoveHook.clear;

export type GuildMemberUpdateArgs = ResolveEventParams<"guildMemberUpdate">;
export type GuildMemberUpdateListener = (
  ...args: GuildMemberUpdateArgs
) => Promise<void> | void;

const memberUpdateHook = createEventHook<GuildMemberUpdateArgs>({
  name: "guildMemberUpdate",
});

export const onGuildMemberUpdate = memberUpdateHook.on;
export const onceGuildMemberUpdate = memberUpdateHook.once;
export const offGuildMemberUpdate = memberUpdateHook.off;
export const emitGuildMemberUpdate = memberUpdateHook.emit;
export const clearGuildMemberUpdateListeners = memberUpdateHook.clear;
