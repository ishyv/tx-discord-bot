/**
 * Motivación: registrar el comando "moderation / ban" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import type { GuildCommandContext } from "seyfert";
import {
  Command,
  createStringOption,
  createUserOption,
  Declare,
  Embed,
  InteractionGuildMember,
  Options,
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import { MessageFlags } from "seyfert/lib/types";
import { registerCase } from "@/modules/moderation/service";
import { isSnowflake } from "@/utils/snowflake";

const options = {
  user: createUserOption({
    description: "User to ban",
    required: true,
  }),
  reason: createStringOption({
    description: "Reason for the ban",
    required: true,
  }),
};

@Declare({
  name: "ban",
  description: "Ban a user from the server",
  defaultMemberPermissions: ["BanMembers"],
  botPermissions: ["BanMembers"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@Options(options)
export default class BanCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    const { user, reason } = ctx.options;
    const GuildLogger = await ctx.getGuildLogger();

    if (!ctx.guildId || !isSnowflake(ctx.guildId) || !isSnowflake(user.id)) {
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content: "❌ Invalid IDs. Try again.",
      });
    }

    if (ctx.author.id === user.id)
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content: "❌ You cannot ban yourself.",
      });

    const targetMember =
      user instanceof InteractionGuildMember ? user : undefined;

    if (!targetMember)
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content: "❌ Could not find the member to ban in the server.",
      });

    if (!(await targetMember.moderatable()))
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content:
          "❌ You cannot ban a user with a role equal to or higher than yours.",
      });

    const text = `${reason} | Banned by ${ctx.author.username}`;

    await ctx.client.bans.create(ctx.guildId, user.id, {}, text);

    const successEmbed = new Embed({
      title: "User banned correctly",
      description: `
        The user **${ctx.options.user.username}** was successfully banned.

        **Reason:** ${reason}
      `,
      color: EmbedColors.Green,
      footer: {
        text: `Banned by ${ctx.author.username}`,
        icon_url: ctx.author.avatarURL(),
      },
    });

    await ctx.write({
      flags: MessageFlags.Ephemeral,
      embeds: [successEmbed],
    });

    await registerCase(user.id, ctx.guildId!, "BAN", reason);

    await GuildLogger.banSanctionLog({
      title: "User banned",
      color: EmbedColors.Red,
      thumbnail: await user.avatarURL(),
      fields: [
        {
          name: "User",
          value: `${user.username} (${user.id})`,
          inline: true,
        },
        { name: "Reason", value: reason, inline: false },
      ],
      footer: {
        text: `${ctx.author.username} (${ctx.author.id})`,
        iconUrl: ctx.author.avatarURL(),
      },
    });
  }
}
