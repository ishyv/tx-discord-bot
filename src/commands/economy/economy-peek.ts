/**
 * Economy Peek Command (Phase 10c).
 *
 * Purpose: View a user's economy data for moderation review.
 * Permission: KickMembers or ManageGuild (mod/admin).
 * Safety: No private moderation notes exposed.
 */

import {
  Command,
  Declare,
  Embed,
  createUserOption,
  Options,
  type CommandContext,
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import { MessageFlags } from "seyfert/lib/types";
import { economyModerationService, getRemainingFreezeHours } from "@/modules/economy/moderation";

@Declare({
  name: "economy-peek",
  description: "View user economy data for moderation (mod only)",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["KickMembers"],
})
@Options({
  user: createUserOption({
    description: "User to peek",
    required: true,
  }),
})
export default class EconomyPeekCommand extends Command {
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
    };

    const targetId = options.user.id;

    await ctx.write({
      content: `⏳ Loading economy data for <@${targetId}>...`,
      flags: MessageFlags.Ephemeral,
    });

    const result = await economyModerationService.peek(targetId);

    if (result.isErr()) {
      await ctx.editResponse({
        content: `❌ Failed to load data: ${result.error.message}`,
      });
      return;
    }

    const peek = result.unwrap();

    // Check freeze status
    const frozenCheck = await economyModerationService.isFrozen(targetId);
    const frozen = frozenCheck.isOk() && frozenCheck.unwrap().frozen;
    const remainingHours = frozen ? getRemainingFreezeHours(await economyModerationService.isFrozen(targetId).then(r => r.isOk() ? { expiresAt: r.unwrap().expiresAt } : null) as any) : null;

    // Build status display
    const statusEmoji = peek.flags.isFrozen ? "🧊" : peek.account.status === "ok" ? "✅" : "⛔";
    const statusText = peek.flags.isFrozen
      ? frozen && remainingHours
        ? `Frozen (${remainingHours}h remaining)`
        : "Frozen (indefinite)"
      : peek.account.status;

    // Format balances
    const balanceLines = Object.entries(peek.balances)
      .map(([currency, data]) => {
        if (typeof data === "number") {
          return `${currency}: ${data.toLocaleString()}`;
        }
        if (typeof data === "object" && data !== null) {
          const hand = (data as any).hand ?? 0;
          const bank = (data as any).bank ?? 0;
          return `${currency}: ${hand.toLocaleString()} (hand) / ${bank.toLocaleString()} (bank)`;
        }
        return `${currency}: ${String(data)}`;
      })
      .slice(0, 5); // Limit to 5 currencies

    // Format recent audit
    const auditLines = peek.recentAudit.slice(0, 5).map((entry) => {
      const date = entry.timestamp.toISOString().slice(0, 10);
      return `${date}: ${entry.operationType}`;
    });

    const embed = new Embed()
      .setColor(peek.flags.isFrozen ? EmbedColors.Orange : EmbedColors.Blue)
      .setTitle(`${statusEmoji} Economy Profile`)
      .setDescription(`<@${targetId}>`)
      .addFields(
        {
          name: "Account Status",
          value: statusText,
          inline: true,
        },
        {
          name: "Last Activity",
          value: `${peek.flags.daysSinceActivity} days ago`,
          inline: true,
        },
        {
          name: "Flags",
          value: [
            peek.flags.isOptedOut ? "🔕 Opted out of voting" : null,
            peek.flags.hasActiveCooldowns ? "⏰ Active cooldowns" : null,
          ]
            .filter(Boolean)
            .join("\n") || "None",
          inline: false,
        },
        {
          name: "Balances",
          value: balanceLines.join("\n") || "No balances",
          inline: false,
        },
        {
          name: `Recent Activity (${peek.recentAudit.length} shown)`,
          value: auditLines.join("\n") || "No recent activity",
          inline: false,
        },
      )
      .setFooter({
        text: `Account created: ${peek.account.createdAt.toISOString().slice(0, 10)}`,
      })
      .setTimestamp();

    await ctx.editResponse({
      content: null,
      embeds: [embed],
    });
  }
}
