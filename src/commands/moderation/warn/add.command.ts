/**
 * Warn Add Command.
 *
 * Purpose: Add a warning to a user.
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
import type { Warn } from "@/db/schemas/user";
import { generateWarnId } from "@/utils/warnId";
import { addWarn, listWarns } from "@/db/repositories";
import { registerCase } from "@/modules/moderation/service";
import { safeModerationRun } from "@/modules/moderation/executeSanction";
import { BindDisabled, Features } from "@/modules/features";

const options = {
  user: createUserOption({
    description: "User to warn",
    required: true,
  }),
  reason: createStringOption({
    description: "Reason for the warning",
    required: false,
  }),
};

@HelpDoc({
  command: "warn add",
  category: HelpCategory.Moderation,
  description: "Add a warning to a user with an optional reason",
  usage: "/warn add <user> [reason]",
  permissions: ["KickMembers"],
})
@Declare({
  name: "add",
  description: "Add a warning to a user",
  defaultMemberPermissions: ["KickMembers"],
})
@Options(options)
@BindDisabled(Features.Warns)
export default class AddWarnCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    await safeModerationRun(ctx, () => this.execute(ctx));
  }

  private async execute(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;

    const { user, reason } = ctx.options;
    const warnsResult = await listWarns(user.id);
    if (warnsResult.isErr()) {
      await ctx.editOrReply({
        content: "Could not read user warnings.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const existingWarns = warnsResult.unwrap();
    const existingIds = new Set(existingWarns.map((warn) => warn.warn_id));

    let warnId = generateWarnId();
    while (existingIds.has(warnId)) {
      warnId = generateWarnId();
    }

    const finalReason = reason || "No reason specified";

    const warn: Warn = {
      reason: finalReason,
      warn_id: warnId,
      moderator: ctx.author.id,
      timestamp: new Date().toISOString(),
    };

    const addResult = await addWarn(user.id, warn);
    if (addResult.isErr()) {
      await ctx.editOrReply({
        content: "Could not register the warning.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const successEmbed = new Embed({
      title: "Warning Applied",
      description: [
        `A warning was added to user **${user.username}**.`,
        "",
        `**Reason:** ${finalReason}`,
        `**Warn ID:** ${warnId.toUpperCase()}`,
      ].join("\n"),
      color: UIColors.success,
      footer: {
        text: `Warning applied by ${ctx.author.username}`,
        icon_url: ctx.author.avatarURL() || undefined,
      },
    });

    await ctx.editOrReply({
      embeds: [successEmbed],
      flags: MessageFlags.Ephemeral,
    });

    try {
      await registerCase(user.id, guildId, "WARN", finalReason);
    } catch {
      ctx.client.logger?.warn?.("[warn add] registerCase failed", { guildId });
    }

    try {
      const logger = await ctx.getGuildLogger();
      await logger.moderationLog({
        title: "Warning Applied",
        description: `A warning was added to <@${user.id}>`,
        fields: [
          { name: "Warn ID", value: warnId.toUpperCase(), inline: true },
          { name: "Moderator", value: `<@${ctx.author.id}>`, inline: true },
          { name: "Reason", value: finalReason },
        ],
        actorId: ctx.author.id,
      }, "generalLogs");
    } catch {
      ctx.client.logger?.warn?.("[warn add] channel log failed", { guildId });
    }
  }
}
