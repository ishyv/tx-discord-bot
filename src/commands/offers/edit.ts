/**
 * Motivación: registrar el comando "offers / edit" dentro de la categoría offers para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert y el prefab embedDesigner para editar ofertas de forma interactiva.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import { Declare, SubCommand, type GuildCommandContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import type { OfferDetails } from "@/modules/offers";
import { editOfferContent, getActiveOffer } from "@/modules/offers";
import {
  type EmbedFieldDefinition,
  startEmbedDesigner,
} from "@/modules/prefabs/embedDesigner";

@Declare({
  name: "editar",
  description: "Editar tu oferta activa (vuelve a revisión)",
})
export default class OfferEditCommand extends SubCommand {
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
        content:
          "No tienes ofertas activas para editar. Usa `/oferta crear` para enviar una nueva.",
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

    // Pre-populate with existing offer data
    const labelsString = offer.details.labels?.join(", ") ?? "";

    await startEmbedDesigner(ctx, {
      userId: ctx.author.id,
      content:
        "Edita la información de tu oferta usando el menú y confirma para reenviarla a revisión.",
      initial: {
        title: offer.details.title,
        description: offer.details.description,
        footer: "Oferta de trabajo (se enviará a revisión)",
        fields: fieldDefs.map((field) => ({
          key: field.key,
          label: field.label,
          value:
            field.key === "requirements"
              ? offer.details.requirements ?? ""
              : field.key === "workMode"
                ? offer.details.workMode ?? ""
                : field.key === "salary"
                  ? offer.details.salary ?? ""
                  : field.key === "contact"
                    ? offer.details.contact ?? ""
                    : field.key === "labels"
                      ? labelsString
                      : field.key === "location"
                        ? offer.details.location ?? ""
                        : "",
          inline: field.inline,
        })),
      },
      fields: fieldDefs,
      onSubmit: async ({ data, embed }) => {
        try {
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

          const updated = await editOfferContent(ctx.client, offer, details, embed);

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
        } catch (error) {
          const message = error instanceof Error ? error.message : "Error desconocido editando la oferta.";
          await ctx.followup?.({
            content: `No se pudo editar la oferta: ${message}`,
            flags: MessageFlags.Ephemeral,
          });
        }
      },
    });
  }
}
