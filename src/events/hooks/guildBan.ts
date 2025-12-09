/**
 * Hooks tipados para eventos de baneos en el servidor.
 * Permite registrar listeners para altas y bajas de bans con una API uniforme.
 */
import type { ResolveEventParams } from "seyfert";

import { createEventHook } from "@/events/hooks/createEventHook";

export type GuildBanAddArgs = ResolveEventParams<"guildBanAdd">;
export type GuildBanAddListener = (
  ...args: GuildBanAddArgs
) => Promise<void> | void;

const guildBanAddHook = createEventHook<GuildBanAddArgs>();

export const onGuildBanAdd = guildBanAddHook.on;
export const onceGuildBanAdd = guildBanAddHook.once;
export const offGuildBanAdd = guildBanAddHook.off;
export const emitGuildBanAdd = guildBanAddHook.emit;
export const clearGuildBanAddListeners = guildBanAddHook.clear;

export type GuildBanRemoveArgs = ResolveEventParams<"guildBanRemove">;
export type GuildBanRemoveListener = (
  ...args: GuildBanRemoveArgs
) => Promise<void> | void;

const guildBanRemoveHook = createEventHook<GuildBanRemoveArgs>();

export const onGuildBanRemove = guildBanRemoveHook.on;
export const onceGuildBanRemove = guildBanRemoveHook.once;
export const offGuildBanRemove = guildBanRemoveHook.off;
export const emitGuildBanRemove = guildBanRemoveHook.emit;
export const clearGuildBanRemoveListeners = guildBanRemoveHook.clear;
