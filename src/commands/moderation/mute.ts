/**
 * Mute Command.
 *
 * Purpose: Register the "moderation/mute" command to offer the action consistently.
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
import { parse, isValid } from "@/utils/ms";
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
      color: UIColors.success,
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
      color: UIColors.warning,
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
