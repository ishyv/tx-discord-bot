import type { ResolveEventParams } from "seyfert";

import { createEventHook } from "@/events/hooks/createEventHook";

export type MessageUpdateArgs = ResolveEventParams<"messageUpdate">;
export type MessageUpdateListener = (
  ...args: MessageUpdateArgs
) => Promise<void> | void;

const updateHook = createEventHook<MessageUpdateArgs>();

export const onMessageUpdate = updateHook.on;
export const onceMessageUpdate = updateHook.once;
export const offMessageUpdate = updateHook.off;
export const emitMessageUpdate = updateHook.emit;
export const clearMessageUpdateListeners = updateHook.clear;
