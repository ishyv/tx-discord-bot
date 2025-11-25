/**
 * Motivación: centralizar el hook del evento "voice State" para tener un punto único de suscripción y emisión.
 *
 * Idea/concepto: envuelve la utilería createEventHook para exponer on/once/off/emit/clear tipados.
 *
 * Alcance: administra listeners del evento; no aplica reglas de negocio asociadas al mismo.
 */
import type { ResolveEventParams } from "seyfert";

import { createEventHook } from "@/events/hooks/createEventHook";

export type VoiceStateUpdateArgs = ResolveEventParams<"voiceStateUpdate">;
export type VoiceStateUpdateListener = (
  ...args: VoiceStateUpdateArgs
) => Promise<void> | void;

const voiceStateHook = createEventHook<VoiceStateUpdateArgs>();

export const onVoiceStateUpdate = voiceStateHook.on;
export const onceVoiceStateUpdate = voiceStateHook.once;
export const offVoiceStateUpdate = voiceStateHook.off;
export const emitVoiceStateUpdate = voiceStateHook.emit;
export const clearVoiceStateUpdateListeners = voiceStateHook.clear;
