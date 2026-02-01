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
import { UIColors } from "@/modules/ui/design-system";
import type { Warn } from "@/db/schemas/user";
import { generateWarnId } from "@/utils/warnId";
import { addWarn, listWarns } from "@/db/repositories";
import { registerCase } from "@/modules/moderation/service";
import { BindDisabled, Features } from "@/modules/features";
import { logModerationAction } from "@/utils/moderationLogger";
import { isSnowflake } from "@/utils/snowflake";

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

@Declare({
  name: "add",
  description: "Add a warning to a user",
  defaultMemberPermissions: ["KickMembers"],
})
@Options(options)
@BindDisabled(Features.Warns)
export default class AddWarnCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.editOrReply({
        content: "This command only works in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!isSnowflake(guildId) || !isSnowflake(ctx.options.user.id)) {
      await ctx.editOrReply({
        content: "Invalid IDs. Try again.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

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

    await registerCase(user.id, guildId, "WARN", finalReason);

    await logModerationAction(ctx.client, guildId, {
      title: "Warning Applied",
      description: `A warning was added to <@${user.id}>`,
      fields: [
        { name: "Warn ID", value: warnId.toUpperCase(), inline: true },
        { name: "Moderator", value: `<@${ctx.author.id}>`, inline: true },
        { name: "Reason", value: finalReason },
      ],
      actorId: ctx.author.id,
    });
  }
}
