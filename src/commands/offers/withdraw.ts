/**
 * Motivación: registrar el comando "offers / withdraw" dentro de la categoría offers para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import { Declare, SubCommand, type GuildCommandContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { withdrawOffer, getActiveOffer } from "@/modules/offers";
import { ensureGuildContext } from "./shared";

@Declare({
  name: "retirar",
  description: "Retirar tu oferta activa",
})
export default class OfferWithdrawCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const guildId = await ensureGuildContext(ctx);
    if (!guildId) return;

    const offerResult = await getActiveOffer(guildId, ctx.author.id);
    if (offerResult.isErr()) {
      await ctx.write({
        content: "Error buscando ofertas activas.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const offer = offerResult.unwrap();
    if (!offer) {
      await ctx.write({
        content: "No tienes una oferta activa para retirar.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const updatedResult = await withdrawOffer(ctx.client, offer, ctx.author.id);
    if (updatedResult.isErr()) {
      await ctx.write({
        content: "Error al retirar la oferta.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const updated = updatedResult.unwrap();
    if (!updated) {
      await ctx.write({
        content: "No se pudo retirar la oferta. Intenta nuevamente.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.write({
      content: "Tu oferta fue retirada y ya no aparecerá en revisión.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
