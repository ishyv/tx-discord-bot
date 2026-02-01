/**
 * Warn Clear Command.
 *
 * Purpose: Clear all warnings for a user.
 */
import { clearWarns, listWarns } from "@/db/repositories";
import type { GuildCommandContext } from "seyfert";
import { createUserOption, Declare, Embed, Options, SubCommand } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { UIColors } from "@/modules/ui/design-system";
import { BindDisabled, Features } from "@/modules/features";
import { logModerationAction } from "@/utils/moderationLogger";

const options = {
  user: createUserOption({
    description: "User whose warnings will be cleared",
    required: true,
  }),
};

@Declare({
  name: "clear",
  description: "Clear all warnings from a user",
  defaultMemberPermissions: ["KickMembers"],
})
@Options(options)
@BindDisabled(Features.Warns)
export default class ClearWarnCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        flags: MessageFlags.Ephemeral,
        content: "This command only works in a server.",
      });
      return;
    }

    const { user } = ctx.options;

    const warnsResult = await listWarns(user.id);
    if (warnsResult.isErr()) {
      await ctx.write({
        flags: MessageFlags.Ephemeral,
        content: "Could not read user warnings.",
      });
      return;
    }
    const warns = warnsResult.unwrap();
    if (warns.length === 0) {
      await ctx.write({
        flags: MessageFlags.Ephemeral,
        content: "No warnings recorded for this user.",
      });
      return;
    }

    const cleared = await clearWarns(user.id);
    if (cleared.isErr()) {
      await ctx.write({
        flags: MessageFlags.Ephemeral,
        content: "Could not clear user warnings.",
      });
      return;
    }

    const embed = new Embed({
      title: "Warnings Cleared",
      description: `Removed ${warns.length} warnings from user **${user.username}**.`,
      color: UIColors.success,
      footer: {
        text: `Action executed by ${ctx.author.username}`,
        icon_url: ctx.author.avatarURL() || undefined,
      },
    });

    await ctx.write({
      flags: MessageFlags.Ephemeral,
      embeds: [embed],
    });

    await logModerationAction(ctx.client, guildId, {
      title: "Warnings Cleared",
      description: `Cleared ${warns.length} warnings from <@${user.id}>`,
      fields: [
        { name: "Moderator", value: `<@${ctx.author.id}>`, inline: true },
      ],
      actorId: ctx.author.id,
    });
  }
}
