/**
 * Economy Unfreeze Command (Phase 10c).
 *
 * Purpose: Unfreeze a user's economy account.
 * Permission: KickMembers or ManageGuild (mod/admin).
 */

import {
  Command,
  Declare,
  Embed,
  createUserOption,
  createStringOption,
  Options,
  type CommandContext,
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import { MessageFlags } from "seyfert/lib/types";
import { economyModerationService } from "@/modules/economy/moderation";

@Declare({
  name: "economy-unfreeze",
  description: "Unfreeze a user's economy account (mod only)",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["KickMembers"],
})
@Options({
  user: createUserOption({
    description: "User to unfreeze",
    required: true,
  }),
  reason: createStringOption({
    description: "Reason for unfreeze (optional)",
    required: false,
    max_length: 500,
  }),
})
export default class EconomyUnfreezeCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        content: "❌ This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const options = ctx.options as {
      user: { id: string };
      reason?: string;
    };

    const targetId = options.user.id;
    const moderatorId = ctx.author?.id;

    if (!moderatorId) {
      await ctx.write({
        content: "❌ Could not identify moderator.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if user is actually frozen
    const frozenCheck = await economyModerationService.isFrozen(targetId);
    if (frozenCheck.isErr()) {
      await ctx.write({
        content: `❌ Failed to check freeze status: ${frozenCheck.error.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!frozenCheck.unwrap().frozen) {
      await ctx.write({
        content: `⚠️ <@${targetId}> is not currently frozen.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.write({
      content: `⏳ Unfreezing <@${targetId}>...`,
      flags: MessageFlags.Ephemeral,
    });

    const result = await economyModerationService.unfreeze({
      userId: targetId,
      reason: options.reason,
      moderatorId,
      guildId,
    });

    if (result.isErr()) {
      await ctx.editResponse({
        content: `❌ Failed to unfreeze: ${result.error.message}`,
      });
      return;
    }

    const unfreezeResult = result.unwrap();

    const embed = new Embed()
      .setColor(EmbedColors.Green)
      .setTitle("✅ Account Unfrozen")
      .setDescription(`<@${targetId}>'s economy account has been unfrozen.`)
      .addFields(
        {
          name: "Previous Status",
          value: unfreezeResult.previousStatus,
          inline: true,
        },
        {
          name: "New Status",
          value: "✅ Active",
          inline: true,
        },
        {
          name: "Reason",
          value: options.reason ?? "Moderator action",
          inline: false,
        },
      )
      .setFooter({
        text: `Correlation: ${unfreezeResult.correlationId.slice(0, 16)}...`,
      })
      .setTimestamp();

    await ctx.editResponse({
      content: null,
      embeds: [embed],
    });
  }
}
