/**
 * Motivación: registrar el comando "offers / create" dentro de la categoría offers para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import { Declare, SubCommand, type GuildCommandContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import type { OfferDetails } from "@/modules/offers";
import { assertNoActiveOffer, createOfferForReview } from "@/modules/offers";
import {
  type EmbedFieldDefinition,
  startEmbedDesigner,
} from "@/modules/prefabs/embedDesigner";

@Declare({
  name: "crear",
  description: "Crear una nueva oferta y enviarla a revisión",
})
export default class OfferCreateCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    if (!ctx.guildId) {
      await ctx.write({
        content: "Este comando solo funciona dentro de un servidor.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const existingResult = await assertNoActiveOffer(ctx.guildId, ctx.author.id);
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

    const fieldDefs: EmbedFieldDefinition[] = [
      { key: "requirements", label: "Requisitos", placeholder: "Tecnologías, experiencia, stack" },
      { key: "workMode", label: "Modalidad", placeholder: "Remoto, híbrido, presencial" },
      { key: "salary", label: "Rango salarial", placeholder: "Ej: USD 2000-3000" },
      { key: "contact", label: "Contacto", placeholder: "DM, email, formulario" },
      { key: "labels", label: "Etiquetas", placeholder: "#junior #backend #devops" },
      { key: "location", label: "Ubicación / zona horaria", placeholder: "Argentina (GMT-3)" },
    ];

    await startEmbedDesigner(ctx, {
      userId: ctx.author.id,
      content:
        "Completa la información de tu oferta usando el menú y confirma para enviarla a revisión.",
      initial: {
        title: "Título del puesto",
        description: "Describe el rol, responsabilidades y contexto.",
        footer: "Oferta de trabajo (se enviará a revisión)",
        fields: fieldDefs.map((field) => ({
          key: field.key,
          label: field.label,
          value: "",
          inline: field.inline,
        })),
      },
      fields: fieldDefs,
      onSubmit: async ({ data, embed }) => {
        const title = data.title.trim();
        const description = data.description.trim();
        if (!title || description.length < 8) {
          await ctx.followup?.({
            content: "Necesitas un título y una descripción de al menos 8 caracteres.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const get = (key: string): string | null =>
          data.fields.find((f) => f.key === key)?.value?.trim() || null;

        const details: OfferDetails = {
          title,
          description,
          requirements: get("requirements"),
          workMode: get("workMode"),
          salary: get("salary"),
          contact: get("contact"),
          labels:
            (get("labels") ?? "")
              .split(/[, ]+/)
              .map((entry) => entry.trim())
              .filter(Boolean) ?? [],

          location: get("location"),
        };

        const result = await createOfferForReview(ctx.client, {
          guildId: ctx.guildId!,
          authorId: ctx.author.id,
          details,
          authorTag: ctx.author.username,
          authorAvatar: ctx.author.avatarURL(),
          userEmbed: embed,
        });

        if (result.isErr()) {
          const error = result.error;
          const message = error instanceof Error ? error.message : "Error desconocido creando la oferta.";

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
