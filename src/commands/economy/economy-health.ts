/**
 * Economy Health Command (Phase 3e).
 *
 * Purpose: Show sector balances, daily/work config, and recent audit activity.
 * Permission: mod or admin.
 */

import { Command, Declare, Embed, type CommandContext } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { EmbedColors } from "seyfert/lib/common";
import { MessageFlags } from "seyfert/lib/types";
import { checkEconomyPermission, EconomyPermissionLevel } from "@/modules/economy/permissions";
import { guildEconomyService, economyAuditRepo } from "@/modules/economy";

const HOURS_24_MS = 24 * 60 * 60 * 1000;

const OPERATION_ORDER = [
  "currency_adjust",
  "currency_transfer",
  "item_purchase",
  "item_sell",
  "item_grant",
  "item_remove",
  "daily_claim",
  "work_claim",
  "config_update",
  "rollback",
];

@HelpDoc({
  command: "economy-health",
  category: HelpCategory.Economy,
  description: "Show economy health summary: sector balances, config, and recent audit activity",
  usage: "/economy-health",
  permissions: ["KickMembers"],
})
@Declare({
  name: "economy-health",
  description:
    "Show economy health summary (balances, config, and recent activity)",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageGuild"],
})
export default class EconomyHealthCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const hasMod = await checkEconomyPermission(
      ctx.member,
      EconomyPermissionLevel.MOD,
    );
    if (!hasMod) {
      await ctx.write({
        content: "You need mod or admin permission to view economy health.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const configResult = await guildEconomyService.getConfig(guildId);
    if (configResult.isErr()) {
      await ctx.write({
        content: "Failed to load economy config.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const config = configResult.unwrap();

    const since = new Date(Date.now() - HOURS_24_MS);
    const summaryResult = await economyAuditRepo.summarizeRecent(
      guildId,
      since,
    );
    if (summaryResult.isErr()) {
      await ctx.write({
        content: "Failed to load audit summary.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const summary = summaryResult.unwrap();

    const sectorLines = (["global", "works", "trade", "tax"] as const)
      .map((s) => `${s}: **${config.sectors[s].toLocaleString()}**`)
      .join("\n");

    const dailySummary =
      `Amount: **${config.daily.dailyReward}** ${config.daily.dailyCurrencyId}\n` +
      `Cooldown: **${config.daily.dailyCooldownHours}h**\n` +
      `Fee: **${((config.daily.dailyFeeRate ?? 0) * 100).toFixed(2)}%**\n` +
      `Streak bonus: **+${config.daily.dailyStreakBonus}** per day (cap ${config.daily.dailyStreakCap})`;

    const workSummary =
      `Base: **${config.work.workRewardBase}** ${config.work.workCurrencyId}\n` +
      `Cooldown: **${config.work.workCooldownMinutes}m**\n` +
      `Daily cap: **${config.work.workDailyCap}**\n` +
      `Pays from: **${config.work.workPaysFromSector}**\n` +
      `Failure chance: **${((config.work.workFailureChance ?? 0) * 100).toFixed(1)}%**`;

    const countsLines = OPERATION_ORDER.filter(
      (op) => summary.counts[op] != null,
    )
      .map((op) => `${op}: **${summary.counts[op].toLocaleString()}**`)
      .join("\n");

    const netLines = Object.entries(summary.netByCurrency).length
      ? Object.entries(summary.netByCurrency)
          .map(
            ([currencyId, net]) =>
              `${currencyId}: **${net >= 0 ? "+" : ""}${net.toLocaleString()}**`,
          )
          .join("\n")
      : "No currency deltas in last 24h.";

    const embed = new Embed()
      .setColor(EmbedColors.Blue)
      .setTitle("Economy health (last 24h)")
      .setDescription(
        `Snapshot since ${since.toISOString().slice(0, 16).replace("T", " ")} UTC`,
      )
      .addFields(
        { name: "Sector balances", value: sectorLines, inline: false },
        { name: "Daily config", value: dailySummary, inline: true },
        { name: "Work config", value: workSummary, inline: true },
        {
          name: "Audit counts (24h)",
          value: countsLines.length ? countsLines : "No recent audit activity.",
          inline: false,
        },
        { name: "Net flow by currency (24h)", value: netLines, inline: false },
      );

    await ctx.write({ embeds: [embed] });
  }
}
