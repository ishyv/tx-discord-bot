/**
 * Motivación: registrar el comando "moderation / warn / clear" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import { clearWarns, listWarns } from "@/db/repositories";
import type { GuildCommandContext } from "seyfert";
import { createUserOption, Declare, Embed, Options, SubCommand } from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import { BindDisabled, Features } from "@/modules/features";
import { logModerationAction } from "@/utils/moderationLogger";

const options = {
  user: createUserOption({
    description: "Usuario cuyos warns se limpiaran",
    required: true,
  }),
};

@Declare({
  name: "clear",
  description: "Eliminar todos los warns de un usuario",
  defaultMemberPermissions: ["KickMembers"],
})
@Options(options)
@BindDisabled(Features.Warns)
export default class ClearWarnCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({ content: "Este comando solo funciona dentro de un servidor." });
      return;
    }

    const { user } = ctx.options;

    const warnsResult = await listWarns(user.id);
    if (warnsResult.isErr()) {
      await ctx.write({ content: "No se pudieron leer los warns del usuario." });
      return;
    }
    const warns = warnsResult.unwrap();
    if (warns.length === 0) {
      await ctx.write({
        content: "No hay warns registrados para este usuario.",
      });
      return;
    }

    const cleared = await clearWarns(user.id);
    if (cleared.isErr()) {
      await ctx.write({ content: "No se pudo limpiar los warns del usuario." });
      return;
    }

    const embed = new Embed({
      title: "Warns eliminados",
      description: `Se eliminaron ${warns.length} warns del usuario **${user.username}**.`,
      color: EmbedColors.Green,
      footer: {
        text: `Accion ejecutada por ${ctx.author.username}`,
        icon_url: ctx.author.avatarURL() || undefined,
      },
    });

    await ctx.write({ embeds: [embed] });

    await logModerationAction(ctx.client, guildId, {
      title: "Warns eliminados",
      description: `Se limpiaron ${warns.length} warns de <@${user.id}>`,
      fields: [{ name: "Moderador", value: `<@${ctx.author.id}>`, inline: true }],
      actorId: ctx.author.id,
    });
  }
}
