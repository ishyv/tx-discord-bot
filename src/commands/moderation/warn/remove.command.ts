/**
 * Warn Remove Command.
 *
 * Purpose: Remove a specific warning from a user.
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
import { MessageFlags } from "seyfert/lib/types";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { UIColors } from "@/modules/ui/design-system";
import { isValidWarnId } from "@/utils/warnId";
import { listWarns, removeWarn } from "@/db/repositories";
import { BindDisabled, Features } from "@/modules/features";
import { safeModerationRun } from "@/modules/moderation/executeSanction";

const options = {
  user: createUserOption({
    description: "User to remove warning from",
    required: true,
  }),
  warn_id: createStringOption({
    description: "Warning ID (e.g. pyebt)",
    required: true,
  }),
};

@HelpDoc({
  command: "warn remove",
  category: HelpCategory.Moderation,
  description: "Remove a specific warning from a user by warning ID",
  usage: "/warn remove <user> <warn_id>",
  permissions: ["KickMembers"],
})
@Declare({
  name: "remove",
  description: "Remove a warning from a user",
  defaultMemberPermissions: ["KickMembers"],
})
@Options(options)
@BindDisabled(Features.Warns)
export default class RemoveWarnCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    await safeModerationRun(ctx, () => this.execute(ctx));
  }

  private async execute(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;

    const { user, warn_id } = ctx.options;
    const warnId = warn_id.toLowerCase();

    if (!isValidWarnId(warnId)) {
      await ctx.editOrReply({
        flags: MessageFlags.Ephemeral,
        content:
          "Invalid warn ID. It must be 5 alphanumeric characters (e.g. pyebt).",
      });
      return;
    }

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
        content: "The user has no warnings to remove.",
      });
      return;
    }

    const exists = warns.some((warn) => warn.warn_id === warnId);
    if (!exists) {
      await ctx.editOrReply({
        flags: MessageFlags.Ephemeral,
        content: `No warning found with ID ${warnId.toUpperCase()}.`,
      });
      return;
    }

    const removeResult = await removeWarn(user.id, warnId);
    if (removeResult.isErr()) {
      const message = removeResult.error?.message ?? "Unknown error";
      await ctx.editOrReply({
        flags: MessageFlags.Ephemeral,
        content: `Error removing warning: ${message}`,
      });
      return;
    }

    const successEmbed = new Embed({
      title: "Warning Removed",
      description: `Removed warning **${warnId.toUpperCase()}** from user **${user.username}**.`,
      color: UIColors.success,
      footer: {
        text: `Warning removed by ${ctx.author.username}`,
        icon_url: ctx.author.avatarURL() || undefined,
      },
    });

    await ctx.editOrReply({
      flags: MessageFlags.Ephemeral,
      embeds: [successEmbed],
    });

    try {
      const logger = await ctx.getGuildLogger();
      await logger.moderationLog({
        title: "Warning Removed",
        description: `Warning ${warnId.toUpperCase()} removed from <@${user.id}>`,
        fields: [
          { name: "Moderator", value: `<@${ctx.author.id}>`, inline: true },
          { name: "Warn ID", value: warnId.toUpperCase(), inline: true },
        ],
        actorId: ctx.author.id,
      }, "generalLogs");
    } catch {
      ctx.client.logger?.warn?.("[warn remove] channel log failed", { guildId });
    }
  }
}
