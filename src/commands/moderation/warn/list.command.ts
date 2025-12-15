/**
 * Motivación: registrar el comando "moderation / warn / list" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import type { Guild, GuildCommandContext } from "seyfert";
import { createUserOption, Declare, Embed, Options, SubCommand } from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import type { Warn } from "@/db/schemas/user";
import { getMemberName } from "@/utils/guild";
import { listWarns } from "@/db/repositories";
import { BindDisabled, Features } from "@/modules/features";

const options = {
  user: createUserOption({
    description: "Usuario a ver sus warns",
    required: true,
  }),
};

@Declare({
  name: "list",
  description: "Ver todos los warns de un usuario",
  defaultMemberPermissions: ["ViewAuditLog"],
})
@Options(options)
@BindDisabled(Features.Warns)
export default class ListWarnCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({ content: "Este comando solo funciona dentro de un servidor." });
      return;
    }

    const { user } = ctx.options;

    const guild = await ctx.guild();
    const warnsResult = await listWarns(user.id);
    if (warnsResult.isErr()) {
      await ctx.write({ content: "No se pudieron leer los warns del usuario." });
      return;
    }
    const warns = warnsResult.unwrap();

    if (warns.length === 0) {
      await ctx.write({ content: "El usuario no tiene warns para ver." });
      return;
    }

    const warnsText = await this.formatWarns(warns, guild);

    const embed = new Embed({
      title: "Lista de warns",
      description: `**${user.username}** tiene ${warns.length} warns.\n\n${warnsText}`,
      color: EmbedColors.Blue,
    });

    await ctx.write({ embeds: [embed] });
  }

  private async formatWarns(
    warns: Warn[],
    guild: Awaited<Guild<"cached" | "api">>,
  ): Promise<string> {
    const warnEntries = await Promise.all(
      warns.map(async (warn) => {
        const moderator = await getMemberName(warn.moderator, guild);
        const date = new Date(warn.timestamp).toLocaleString();
        const warnId = warn.warn_id.toUpperCase();

        return [
          `**ID del warn**: \`${warnId}\``,
          `**Razon:** ${warn.reason}`,
          `**Moderador:** ${moderator}`,
          `**Fecha:** ${date}`,
        ].join("\n");
      }),
    );

    return warnEntries.join("\n\n");
  }
}

