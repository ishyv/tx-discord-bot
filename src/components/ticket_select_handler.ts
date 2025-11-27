/**
 * Motivación: encapsular el handler de componente "ticket select handler" para enrutar customId al sistema de UI sin duplicar filtros ni wiring.
 *
 * Idea/concepto: extiende las primitivas de Seyfert para componentes y delega en el registro de UI la resolución del callback adecuado.
 *
 * Alcance: filtra y despacha interacciones de este tipo; no define la lógica interna de cada componente ni su contenido visual.
 */
import { ComponentCommand, type ComponentContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";

import {
  buildTicketModal,
  getTicketCategory,
  TICKET_SELECT_CUSTOM_ID,
} from "@/systems/tickets";
import { assertFeatureEnabled, Features } from "@/modules/features";

export default class TicketSelectHandler extends ComponentCommand {
  componentType = "StringSelect" as const;
  customId = TICKET_SELECT_CUSTOM_ID;

  async run(ctx: ComponentContext<"StringSelect">) {
    const allowed = await assertFeatureEnabled(
      ctx as any,
      Features.Tickets,
      "El sistema de tickets está deshabilitado actualmente.",
    );
    if (!allowed) return;

    const selection = ctx.interaction.values?.[0];
    if (!selection) {
      await ctx.write({
        content: "Selecciona una opción válida para continuar.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const category = getTicketCategory(selection);
    if (!category) {
      await ctx.write({
        content: "La opción seleccionada ya no está disponible.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modal = buildTicketModal(category);
    await ctx.interaction.modal(modal);
  }
}
