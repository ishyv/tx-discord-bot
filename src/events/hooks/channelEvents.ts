import type { ResolveEventParams } from "seyfert";

import { createEventHook } from "@/events/hooks/createEventHook";

export type ChannelCreateArgs = ResolveEventParams<"channelCreate">;
export type ChannelDeleteArgs = ResolveEventParams<"channelDelete">;
export type ChannelUpdateArgs = ResolveEventParams<"channelUpdate">;

export type ChannelCreateListener = (
  ...args: ChannelCreateArgs
) => Promise<void> | void;
export type ChannelDeleteListener = (
  ...args: ChannelDeleteArgs
) => Promise<void> | void;
export type ChannelUpdateListener = (
  ...args: ChannelUpdateArgs
) => Promise<void> | void;

const createHook = createEventHook<ChannelCreateArgs>();
export const onChannelCreate = createHook.on;
export const emitChannelCreate = createHook.emit;

const deleteHook = createEventHook<ChannelDeleteArgs>();
export const onChannelDelete = deleteHook.on;
export const emitChannelDelete = deleteHook.emit;

const updateHook = createEventHook<ChannelUpdateArgs>();
export const onChannelUpdate = updateHook.on;
export const emitChannelUpdate = updateHook.emit;
