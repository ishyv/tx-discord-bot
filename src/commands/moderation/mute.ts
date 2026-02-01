/**
 * Motivación: registrar el comando "moderation / mute" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
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
import { isValid, parse } from "@/utils/ms";
import { registerCase } from "@/modules/moderation/service";
import { isSnowflake } from "@/utils/snowflake";

const options = {
  user: createUserOption({
    description: "User to mute",
    required: true,
  }),
  time: createStringOption({
    description: "How long do you want the mute to last? (e.g. 10min)",
    required: true,
  }),
  reason: createStringOption({
    description: "Reason for the mute",
    required: false,
  }),
};

@Declare({
  name: "mute",
  description: "Mute a user (timeout)",
  defaultMemberPermissions: ["MuteMembers"],
  botPermissions: ["MuteMembers"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@Options(options)
export default class MuteCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    const { user, time, reason = "No reason specified" } = ctx.options;
    const GuildLogger = await ctx.getGuildLogger();

    if (!ctx.guildId || !isSnowflake(ctx.guildId) || !isSnowflake(user.id)) {
      return ctx.write({
        content: "❌ Invalid IDs. Try again.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!isValid(time))
      return await ctx.write({
        content:
          "❌ Invalid time format.\nValid examples: `10min`, `1h`, `3d`, `2m`, `5s`.",
        flags: MessageFlags.Ephemeral,
      });

    if (ctx.author.id === user.id)
      return ctx.write({
        content: "❌ You cannot mute yourself.",
        flags: MessageFlags.Ephemeral,
      });

    const targetMember =
      user instanceof InteractionGuildMember ? user : undefined;

    if (!targetMember)
      return ctx.write({
        content:
          "❌ Could not find the member to mute in the server.",
        flags: MessageFlags.Ephemeral,
      });

    if (!(await targetMember.moderatable()))
      return ctx.write({
        content:
          "❌ You cannot mute a user with a role equal to or higher than yours.",
        flags: MessageFlags.Ephemeral,
      });

    const text = `${reason} | Muted by ${ctx.author.username}`;

    const milliseconds = parse(time) || 0;
    await targetMember.timeout(milliseconds, text);

    const successEmbed = new Embed({
      title: "🔇 User muted correctly",
      description: `
        The user **${ctx.options.user.username}** was successfully muted.

        **Reason:** ${reason}  
        **Duration:** ${time}
      `,
      color: EmbedColors.Green,
      footer: {
        text: `Muted by ${ctx.author.username}`,
        icon_url: ctx.author.avatarURL(),
      },
    });

    await ctx.write({
      flags: MessageFlags.Ephemeral,
      embeds: [successEmbed],
    });

    await registerCase(user.id, ctx.guildId!, "TIMEOUT", reason);

    await GuildLogger.banSanctionLog({
      title: "User muted",
      color: EmbedColors.Orange,
      thumbnail: await user.avatarURL(),
      fields: [
        {
          name: "User",
          value: `${user.username} (${user.id})`,
          inline: true,
        },
        { name: "Reason", value: reason, inline: false },
        { name: "Duration", value: time, inline: true },
      ],
      footer: {
        text: `${ctx.author.username} (${ctx.author.id})`,
        iconUrl: ctx.author.avatarURL(),
      },
    });
  }
}
