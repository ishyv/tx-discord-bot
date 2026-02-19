/**
 * Warn List Command.
 *
 * Purpose: List all warnings for a user.
 */
import type { Guild, GuildCommandContext } from "seyfert";
import { createUserOption, Declare, Embed, Options, SubCommand } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { UIColors } from "@/modules/ui/design-system";
import type { Warn } from "@/db/schemas/user";
import { getMemberName } from "@/utils/guild";
import { listWarns } from "@/db/repositories";
import { BindDisabled, Features } from "@/modules/features";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { safeModerationRun } from "@/modules/moderation/executeSanction";

const options = {
  user: createUserOption({
    description: "User to view warnings for",
    required: true,
  }),
};

@HelpDoc({
  command: "warn list",
  category: HelpCategory.Moderation,
  description: "View all active warnings for a user",
  usage: "/warn list <user>",
  permissions: ["ViewAuditLog"],
})
@Declare({
  name: "list",
  description: "View all warnings for a user",
  defaultMemberPermissions: ["ViewAuditLog"],
})
@Options(options)
@BindDisabled(Features.Warns)
export default class ListWarnCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    await safeModerationRun(ctx, () => this.execute(ctx));
  }

  private async execute(ctx: GuildCommandContext<typeof options>) {
    const { user } = ctx.options;

    const guild = await ctx.guild();
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
        content: "The user has no warnings to view.",
      });
      return;
    }

    const warnsText = await this.formatWarns(warns, guild);

    const embed = new Embed({
      title: "Warning List",
      description: `**${user.username}** has ${warns.length} warnings.\n\n${warnsText}`,
      color: UIColors.info,
    });

    await ctx.editOrReply({
      flags: MessageFlags.Ephemeral,
      embeds: [embed],
    });
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
          `**Warn ID**: \`${warnId}\``,
          `**Reason:** ${warn.reason}`,
          `**Moderator:** ${moderator}`,
          `**Date:** ${date}`,
        ].join("\n");
      }),
    );

    return warnEntries.join("\n\n");
  }
}
