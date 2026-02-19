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
import { HelpDoc, HelpCategory } from "@/modules/help";
import { safeModerationRun } from "@/modules/moderation/executeSanction";

const options = {
  user: createUserOption({
    description: "User whose warnings will be cleared",
    required: true,
  }),
};

@HelpDoc({
  command: "warn clear",
  category: HelpCategory.Moderation,
  description: "Clear all warnings from a user",
  usage: "/warn clear <user>",
  permissions: ["KickMembers"],
})
@Declare({
  name: "clear",
  description: "Clear all warnings from a user",
  defaultMemberPermissions: ["KickMembers"],
})
@Options(options)
@BindDisabled(Features.Warns)
export default class ClearWarnCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    await safeModerationRun(ctx, () => this.execute(ctx));
  }

  private async execute(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    const { user } = ctx.options;

    const warnsResult = await listWarns(user.id);
    if (warnsResult.isErr()) {
      await ctx.editOrReply({
        flags: MessageFlags.Ephemeral,
        content: "Could not read user warnings.",
      });
      return;
    }
    const warns = warnsResult.unwrap();
    if (warns.length === 0) {
      await ctx.editOrReply({
        flags: MessageFlags.Ephemeral,
        content: "No warnings recorded for this user.",
      });
      return;
    }

    const cleared = await clearWarns(user.id);
    if (cleared.isErr()) {
      await ctx.editOrReply({
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

    await ctx.editOrReply({
      flags: MessageFlags.Ephemeral,
      embeds: [embed],
    });

    try {
      const logger = await ctx.getGuildLogger();
      await logger.moderationLog({
        title: "Warnings Cleared",
        description: `Cleared ${warns.length} warnings from <@${user.id}>`,
        fields: [
          { name: "Moderator", value: `<@${ctx.author.id}>`, inline: true },
        ],
        actorId: ctx.author.id,
      }, "generalLogs");
    } catch {
      ctx.client.logger?.warn?.("[warn clear] channel log failed", { guildId });
    }
  }
}
