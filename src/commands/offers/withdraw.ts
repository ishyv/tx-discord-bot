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

@Declare({
  name: "retirar",
  description: "Retirar tu oferta activa",
})
export default class OfferWithdrawCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    if (!ctx.guildId) {
      await ctx.write({
        content: "Este comando solo funciona dentro de un servidor.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const offer = await getActiveOffer(ctx.guildId, ctx.author.id);
    if (!offer) {
      await ctx.write({
        content: "No tienes una oferta activa para retirar.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const updated = await withdrawOffer(ctx.client, offer, ctx.author.id);
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
