/**
 * Economy Freeze Command (Phase 10c).
 *
 * Purpose: Freeze a user's economy account for a specified duration.
 * Permission: KickMembers or ManageGuild (mod/admin).
 */

import {
  Command,
  Declare,
  Embed,
  createUserOption,
  createIntegerOption,
  createStringOption,
  Options,
  type CommandContext,
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import { MessageFlags } from "seyfert/lib/types";
import { economyModerationService, formatFreezeDuration } from "@/modules/economy/moderation";
import { MAX_FREEZE_HOURS } from "@/modules/economy/moderation";
import { HelpDoc, HelpCategory } from "@/modules/help";

@HelpDoc({
  command: "economy-freeze",
  category: HelpCategory.Economy,
  description: "Freeze a user's economy account for a specified duration (mod only)",
  usage: "/economy-freeze <user> [hours] [reason]",
  permissions: ["KickMembers"],
})
@Declare({
  name: "economy-freeze",
  description: "Freeze a user's economy account (mod only)",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["KickMembers"],
})
@Options({
  user: createUserOption({
    description: "User to freeze",
    required: true,
  }),
  reason: createStringOption({
    description: "Reason for freeze",
    required: true,
    max_length: 500,
  }),
  hours: createIntegerOption({
    description: `Duration in hours (1-${MAX_FREEZE_HOURS}, omit for indefinite)`,
    required: false,
    min_value: 1,
    max_value: MAX_FREEZE_HOURS,
  }),
})
export default class EconomyFreezeCommand extends Command {
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
      hours?: number;
      reason: string;
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

    // Check self-freeze
    if (targetId === moderatorId) {
      await ctx.write({
        content: "❌ You cannot freeze your own account.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.write({
      content: `⏳ Freezing <@${targetId}>...`,
      flags: MessageFlags.Ephemeral,
    });

    const result = await economyModerationService.freeze({
      userId: targetId,
      hours: options.hours ?? null,
      reason: options.reason,
      moderatorId,
      guildId,
    });

    if (result.isErr()) {
      await ctx.editResponse({
        content: `❌ Failed to freeze: ${result.error.message}`,
      });
      return;
    }

    const freezeResult = result.unwrap();
    const duration = formatFreezeDuration(options.hours ?? null);

    const embed = new Embed()
      .setColor(EmbedColors.Orange)
      .setTitle("🧊 Account Frozen")
      .setDescription(`<@${targetId}>'s economy account has been frozen.`)
      .addFields(
        {
          name: "Duration",
          value: duration,
          inline: true,
        },
        {
          name: "Status",
          value: freezeResult.newStatus === "banned" ? "🚫 Banned" : "⛔ Blocked",
          inline: true,
        },
        {
          name: "Reason",
          value: options.reason,
          inline: false,
        },
      )
      .setFooter({
        text: `Correlation: ${freezeResult.correlationId.slice(0, 16)}...`,
      })
      .setTimestamp();

    await ctx.editResponse({
      content: null,
      embeds: [embed],
    });
  }
}
