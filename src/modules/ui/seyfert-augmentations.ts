/**
 * Motivación: ofrecer primitivas de interfaz (seyfert augmentations) para manejar el registro y ejecución de componentes interactivos.
 *
 * Idea/concepto: mantiene un sistema de señales/sesiones y augmentations para que los handlers de Seyfert resuelvan customIds.
 *
 * Alcance: organiza la infraestructura de UI; no define el contenido de cada componente ni sus reglas de negocio.
 */
import { Button, SelectMenu, type Modal } from "seyfert";
import { makeID, registerSessionCallback } from "@/modules/ui";

// Button.onClick
(Button as any).prototype.onClick = function (
  name: string,
  handler: (ctx: any) => unknown | Promise<unknown>,
) {
  const unique = makeID(name, true);
  registerSessionCallback(unique, async (ctx) => handler(ctx));
  this.setCustomId(unique);
  return this;
};

// Button.opens
(Button as any).prototype.opens = function (
  modal: Modal,
  callback: () => unknown | Promise<unknown> = () => {},
) {
  const unique = makeID("open_modal", false);

  this.setCustomId(unique);

  registerSessionCallback(unique, async (ctx: any) => {
    await ctx.interaction.modal(modal);
    await callback();
  });

  return this;
};

// SelectMenu.onSelect
(SelectMenu as any).prototype.onSelect = function (
  name: string,
  handler: (ctx: any) => unknown | Promise<unknown>,
) {
  const unique = makeID(name, true);
  registerSessionCallback(unique, async (ctx) => handler(ctx));
  this.setCustomId(unique);
  return this;
};

export {};
