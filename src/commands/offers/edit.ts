/**
 * Motivación: registrar el comando "offers / edit" dentro de la categoría offers para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert y el prefab embedDesigner para editar ofertas de forma interactiva.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import { Declare, SubCommand, type GuildCommandContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { editOfferContent, getActiveOffer } from "@/modules/offers";
import { startEmbedDesigner } from "@/modules/prefabs/embedDesigner";
import {
  OFFER_FIELD_DEFINITIONS,
  ensureGuildContext,
  parseOfferDetails,
  buildDesignerFields,
} from "./shared";

@Declare({
  name: "editar",
  description: "Editar tu oferta activa (vuelve a revisión)",
})
export default class OfferEditCommand extends SubCommand {
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
        content:
          "No tienes ofertas activas para editar. Usa `/oferta crear` para enviar una nueva.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await startEmbedDesigner(ctx, {
      userId: ctx.author.id,
      content:
        "Edita la información de tu oferta usando el menú y confirma para reenviarla a revisión.",
      initial: {
        title: offer.details.title,
        description: offer.details.description,
        footer: "Oferta de trabajo (se enviará a revisión)",
        fields: buildDesignerFields(offer.details),
      },
      fields: OFFER_FIELD_DEFINITIONS,
      onSubmit: async ({ data, embed }) => {
        const { details, error } = parseOfferDetails(data);
        if (!details) {
          await ctx.followup?.({
            content: error ?? "Datos de oferta incompletos.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const updatedResult = await editOfferContent(ctx.client, offer, details, embed);

        if (updatedResult.isErr()) {
          const message = updatedResult.error instanceof Error ? updatedResult.error.message : "Error desconocido editando la oferta.";
          await ctx.followup?.({
            content: `No se pudo editar la oferta: ${message}`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const updated = updatedResult.unwrap();

        if (!updated) {
          await ctx.followup?.({
            content: "No se pudo actualizar la oferta. Intenta nuevamente.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await ctx.followup?.({
          content: "Oferta actualizada. Volvió a estado *Pendiente de revisión*.",
          flags: MessageFlags.Ephemeral,
        });
      },
    });
  }
}
