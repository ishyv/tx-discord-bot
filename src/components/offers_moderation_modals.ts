/**
 * Motivación: encapsular el handler de componente "offers moderation modals" para enrutar customId al sistema de UI sin duplicar filtros ni wiring.
 *
 * Idea/concepto: extiende las primitivas de Seyfert para componentes y delega en el registro de UI la resolución del callback adecuado.
 *
 * Alcance: filtra y despacha interacciones de este tipo; no define la lógica interna de cada componente ni su contenido visual.
 */
import { ModalCommand, ModalContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { rejectOffer, requestOfferChanges } from "@/modules/offers";

const PREFIX = "offer:";

function getTextInput(ctx: ModalContext, id: string): string | null {
  for (const row of ctx.components ?? []) {
    for (const comp of row.components ?? []) {
      if (comp.customId === id) {
        return comp.value ?? null;
      }
    }
  }
  return null;
}

export default class OfferModerationModals extends ModalCommand {
  filter(ctx: ModalContext) {
    return ctx.customId.startsWith(PREFIX);
  }

  async run(ctx: ModalContext) {
    const [_, action, offerId] = ctx.customId.split(":");
    if (!offerId || !ctx.guildId) return;

    const canModerate =
      ctx.member?.permissions?.has?.(["ManageMessages"]) === true;
    if (!canModerate) {
      await ctx.write({
        content: "Necesitas permisos de ManageMessages para moderar ofertas.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === "reject-modal") {
      const reason = getTextInput(ctx, "reason");
      const result = await rejectOffer(
        ctx.client,
        offerId,
        ctx.author.id,
        reason?.trim() || null,
      );

      await ctx.editOrReply({
        content: result
          ? `Oferta \`${offerId}\` rechazada.`
          : "Esta oferta ya no está en un estado válido para rechazar.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === "changes-modal") {
      const note = getTextInput(ctx, "note")?.trim() ?? "";
      if (!note) {
        await ctx.write({
          content: "Debes indicar qué cambios se requieren.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const result = await requestOfferChanges(
        ctx.client,
        offerId,
        ctx.author.id,
        note,
      );

      await ctx.editOrReply({
        content: result
          ? `Se solicitaron cambios en la oferta \`${offerId}\`.`
          : "La oferta ya no está en estado válido para pedir cambios.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }
}
