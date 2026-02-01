/**
 * Motivación: registrar el comando "offers / create" dentro de la categoría offers para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import { Declare, SubCommand, type GuildCommandContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { assertNoActiveOffer, createOfferForReview } from "@/modules/offers";
import { startEmbedDesigner } from "@/modules/prefabs/embedDesigner";
import {
  OFFER_FIELD_DEFINITIONS,
  ensureGuildContext,
  parseOfferDetails,
  buildDesignerFields,
} from "./shared";
import { Cooldown, CooldownType } from "@/modules/cooldown";

@Declare({
  name: "crear",
  description: "Crear una nueva oferta y enviarla a revisión",
})
@Cooldown({
  type: CooldownType.User,
  interval: 60000, // 60 seconds - prevent offer spam
  uses: { default: 1 },
})
export default class OfferCreateCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const guildId = await ensureGuildContext(ctx);
    if (!guildId) return;

    const existingResult = await assertNoActiveOffer(guildId, ctx.author.id);
    if (existingResult.isErr()) {
      await ctx.write({
        content: "Error verificando ofertas activas.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (existingResult.unwrap()) {
      await ctx.write({
        content:
          "Ya tienes una oferta activa en revisión o con cambios pendientes. Usa `/oferta editar` o `/oferta retirar` antes de crear una nueva.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await startEmbedDesigner(ctx, {
      userId: ctx.author.id,
      content:
        "Completa la información de tu oferta usando el menú y confirma para enviarla a revisión.",
      initial: {
        title: "Título del puesto",
        description: "Describe el rol, responsabilidades y contexto.",
        footer: "Oferta de trabajo (se enviará a revisión)",
        fields: buildDesignerFields(),
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

        const result = await createOfferForReview(ctx.client, {
          guildId,
          authorId: ctx.author.id,
          details,
          authorTag: ctx.author.username,
          authorAvatar: ctx.author.avatarURL(),
          userEmbed: embed,
        });

        if (result.isErr()) {
          const error = result.error;
          const message =
            error instanceof Error
              ? error.message
              : "Error desconocido creando la oferta.";

          await ctx.followup?.({
            content:
              message === "OFFERS_REVIEW_CHANNEL_MISSING"
                ? "No hay un canal de revisión configurado."
                : message === "ACTIVE_OFFER_EXISTS"
                  ? "Ya tienes una oferta activa en revisión o con cambios pendientes."
                  : `No se pudo crear la oferta: ${message}`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await ctx.followup?.({
          content: "Oferta enviada al canal de revisión.",
          flags: MessageFlags.Ephemeral,
        });
      },
    });
  }
}
