/**
 * Motivación: centraliza el manejo del evento `inviteCreate` para que las
 * integraciones que reaccionan a nuevas invitaciones usen un único punto de
 * suscripción y emisión. Evita duplicar lógica de wiring en distintos módulos.
 *
 * Idea/concepto: envuelve la utilidad genérica `createEventHook` para generar
 * un hook especializado en invitaciones. Expone las funciones estándar
 * `on/once/off/emit/clear` ya tipadas con los argumentos del evento de Seyfert.
 *
 * Alcance: permite registrar y disparar listeners para la creación de
 * invitaciones dentro del bot. Debe usarse cuando se quiera reaccionar a nuevas
 * invitaciones; no gestiona otros eventos ni aplica restricciones de negocio,
 * solo provee la capa de orquestación del hook.
 */
import type { ResolveEventParams } from "seyfert";

import { createEventHook } from "@/events/hooks/createEventHook";

export type InviteCreateArgs = ResolveEventParams<"inviteCreate">;
export type InviteCreateListener = (
  ...args: InviteCreateArgs
) => Promise<void> | void;

const inviteCreateHook = createEventHook<InviteCreateArgs>();

export const onInviteCreate = inviteCreateHook.on;
export const onceInviteCreate = inviteCreateHook.once;
export const offInviteCreate = inviteCreateHook.off;
export const emitInviteCreate = inviteCreateHook.emit;
export const clearInviteCreateListeners = inviteCreateHook.clear;

export type InviteDeleteArgs = ResolveEventParams<"inviteDelete">;
export type InviteDeleteListener = (
  ...args: InviteDeleteArgs
) => Promise<void> | void;

const inviteDeleteHook = createEventHook<InviteDeleteArgs>();

export const onInviteDelete = inviteDeleteHook.on;
export const onceInviteDelete = inviteDeleteHook.once;
export const offInviteDelete = inviteDeleteHook.off;
export const emitInviteDelete = inviteDeleteHook.emit;
export const clearInviteDeleteListeners = inviteDeleteHook.clear;
