/**
 * Kick Command.
 *
 * Purpose: Register the "moderation/kick" command to offer the action consistently.
 * Uses the Seyfert command framework with typed options.
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
import { MessageFlags } from "seyfert/lib/types";
import { UIColors } from "@/modules/ui/design-system";
import { registerCase } from "@/modules/moderation/service";
import { isSnowflake } from "@/utils/snowflake";

const options = {
  user: createUserOption({
    description: "User to kick",
    required: true,
  }),
  reason: createStringOption({
    description: "Reason for the kick",
    required: false,
  }),
};

@Declare({
  name: "kick",
  description: "Kick a user from the server",
  defaultMemberPermissions: ["KickMembers"],
  botPermissions: ["KickMembers"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@Options(options)
export default class KickCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    const { user, reason = "No reason specified" } = ctx.options;
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
        content: "❌ You cannot kick yourself.",
      });

    const targetMember =
      user instanceof InteractionGuildMember ? user : undefined;

    if (!targetMember)
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content:
          "❌ Could not find the member to kick in the server.",
      });

    if (!(await targetMember.moderatable()))
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content:
          "❌ You cannot kick a user with a role equal to or higher than yours.",
      });

    const text = `${reason} | Kicked by ${ctx.author.username}`;

    await targetMember.kick(text);

    const successEmbed = new Embed({
      title: "User kicked correctly",
      description: `
        The user **${ctx.options.user.username}** was successfully kicked.

        **Reason:** ${reason}
      `,
      color: UIColors.success,
      footer: {
        text: `Kicked by ${ctx.author.username}`,
        icon_url: ctx.author.avatarURL(),
      },
    });

    await ctx.write({
      flags: MessageFlags.Ephemeral,
      embeds: [successEmbed],
    });

    await registerCase(user.id, ctx.guildId!, "KICK", reason);

    await GuildLogger.banSanctionLog({
      title: "User kicked",
      color: UIColors.warning,
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
