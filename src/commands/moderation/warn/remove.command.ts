/**
 * Motivación: registrar el comando "moderation / warn / remove" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import type { GuildCommandContext } from "seyfert";
import {
  createStringOption,
  createUserOption,
  Declare,
  Embed,
  Options,
  SubCommand,
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import { isValidWarnId } from "@/utils/warnId";
import { listWarns, removeWarn } from "@/db/repositories";
import { assertFeatureEnabled } from "@/modules/features";
import { logModerationAction } from "@/utils/moderationLogger";

const options = {
  user: createUserOption({
    description: "Usuario al que se le removera el warn",
    required: true,
  }),
  warn_id: createStringOption({
    description: "ID del warn (ej. pyebt)",
    required: true,
  }),
};

@Declare({
  name: "remove",
  description: "Remover un warn a un usuario",
})
@Options(options)
export default class RemoveWarnCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({ content: "Este comando solo funciona dentro de un servidor." });
      return;
    }

    const enabled = await assertFeatureEnabled(
      ctx as any,
      "warns",
      "El sistema de warns está deshabilitado en este servidor.",
    );
    if (!enabled) return;

    const { user, warn_id } = ctx.options;
    const warnId = warn_id.toLowerCase();

    if (!isValidWarnId(warnId)) {
      await ctx.write({
        content:
          "El ID del warn no es valido. Debe tener 5 caracteres alfanumericos sin confusiones (ej. pyebt).",
      });
      return;
    }

    const warns = await listWarns(user.id);

    if (warns.length === 0) {
      await ctx.write({ content: "El usuario no tiene warns para remover." });
      return;
    }

    const exists = warns.some((warn) => warn.warn_id === warnId);
    if (!exists) {
      await ctx.write({
        content: `No se encontro un warn con el ID ${warnId.toUpperCase()}.`,
      });
      return;
    }

    try {
      await removeWarn(user.id, warnId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error desconocido";
      await ctx.write({
        content: `Error al remover el warn: ${message}`,
      });
      return;
    }

    const successEmbed = new Embed({
      title: "Warn eliminado",
      description: `Se removio el warn **${warnId.toUpperCase()}** del usuario **${user.username}**.`,
      color: EmbedColors.Green,
      footer: {
        text: `Warn eliminado por ${ctx.author.username}`,
        icon_url: ctx.author.avatarURL() || undefined,
      },
    });

    await ctx.write({ embeds: [successEmbed] });

    await logModerationAction(ctx.client, guildId, {
      title: "Warn eliminado",
      description: `Warn ${warnId.toUpperCase()} removido de <@${user.id}>`,
      fields: [
        { name: "Moderador", value: `<@${ctx.author.id}>`, inline: true },
        { name: "Warn ID", value: warnId.toUpperCase(), inline: true },
      ],
      actorId: ctx.author.id,
    });
  }
}

