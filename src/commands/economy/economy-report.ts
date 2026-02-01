/**
 * Economy Report Command (Phase 9f).
 *
 * Purpose: Generate economy telemetry reports with insights and recommendations.
 * Permission: ManageGuild (admin).
 */

import {
  Command,
  Declare,
  Embed,
  createIntegerOption,
  Options,
  type CommandContext,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { UIColors } from "@/modules/ui/design-system";
import { economyReportService } from "@/modules/economy/reports";
import type { EconomyReportWithRecommendations } from "@/modules/economy/reports";

const MAX_REPORT_DAYS = 30;
const DEFAULT_REPORT_DAYS = 7;

@Declare({
  name: "economy-report",
  description: "Generate economy telemetry report with recommendations (admin only)",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageGuild"],
})
@Options({
  days: createIntegerOption({
    description: "Number of days to analyze (1-30, default 7)",
    required: false,
    min_value: 1,
    max_value: MAX_REPORT_DAYS,
  }),
})
export default class EconomyReportCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        content: "❌ This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const days = Math.min(
      Math.max(1, (ctx.options as { days?: number }).days ?? DEFAULT_REPORT_DAYS),
      MAX_REPORT_DAYS,
    );

    // Show loading state
    await ctx.write({
      content: `⏳ Generating economy report for last **${days}** days...`,
      flags: MessageFlags.Ephemeral,
    });

    const reportResult = await economyReportService.generateReport({
      guildId,
      days,
    });

    if (reportResult.isErr()) {
      await ctx.editResponse({
        content: `❌ Failed to generate report: ${reportResult.error.message}`,
      });
      return;
    }

    const data = reportResult.unwrap();
    const embeds = this.buildReportEmbeds(data, days);

    await ctx.editResponse({
      content: null,
      embeds,
    });
  }

  private buildReportEmbeds(
    data: EconomyReportWithRecommendations,
    days: number,
  ): Embed[] {
    const { report, recommendations, overallHealth } = data;
    const embeds: Embed[] = [];

    // Health indicator emoji
    const healthEmoji =
      overallHealth === "healthy" ? "🟢" : overallHealth === "attention" ? "🟡" : "🔴";

    // Main summary embed
    const summaryEmbed = new Embed()
      .setColor(this.getHealthColor(overallHealth))
      .setTitle(`${healthEmoji} Economy Report: Last ${days} Days`)
      .setDescription(
        `Report generated at ${report.generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`,
      );

    // Currency flows section
    if (report.currencyFlows.length > 0) {
      const flowLines = report.currencyFlows.map((flow) => {
        const trendEmoji = flow.netInflation > 0 ? "📈" : flow.netInflation < 0 ? "📉" : "➡️";
        const inflationStr =
          flow.inflationRatePct > 0
            ? `+${flow.inflationRatePct}%`
            : `${flow.inflationRatePct}%`;
        return (
          `**${flow.currencyId}**\n` +
          `${trendEmoji} Net: ${flow.netInflation >= 0 ? "+" : ""}${flow.netInflation.toLocaleString()} (${inflationStr})\n` +
          `├ Minted: ${flow.totalMinted.toLocaleString()}\n` +
          `└ Sunk: ${flow.totalSunk.toLocaleString()}`
        );
      });
      summaryEmbed.addFields({
        name: "💰 Currency Flows",
        value: flowLines.join("\n\n"),
        inline: false,
      });
    } else {
      summaryEmbed.addFields({
        name: "💰 Currency Flows",
        value: "No currency activity recorded in this period.",
        inline: false,
      });
    }

    embeds.push(summaryEmbed);

    // Top sources and sinks embed
    const flowsEmbed = new Embed().setColor(UIColors.info).setTitle("📊 Flow Breakdown");

    if (report.topSources.length > 0) {
      const sourceLines = report.topSources.map(
        (s) => `${s.source}: **${s.amount.toLocaleString()}** (${s.percentage}%)`,
      );
      flowsEmbed.addFields({
        name: "📥 Top Sources (Minting)",
        value: sourceLines.join("\n"),
        inline: true,
      });
    } else {
      flowsEmbed.addFields({
        name: "📥 Top Sources",
        value: "No minting activity",
        inline: true,
      });
    }

    if (report.topSinks.length > 0) {
      const sinkLines = report.topSinks.map(
        (s) => `${s.source}: **${s.amount.toLocaleString()}** (${s.percentage}%)`,
      );
      flowsEmbed.addFields({
        name: "📤 Top Sinks (Burning)",
        value: sinkLines.join("\n"),
        inline: true,
      });
    } else {
      flowsEmbed.addFields({
        name: "📤 Top Sinks",
        value: "No burning activity",
        inline: true,
      });
    }

    // Balance distribution
    if (report.balanceDistribution.length > 0) {
      const distLines = report.balanceDistribution.map((dist) => {
        const concentrationRatio = dist.p50 > 0 ? (dist.p99 / dist.p50).toFixed(0) : "N/A";
        return (
          `**${dist.currencyId}** (${dist.totalHolders} holders)\n` +
          `├ Median: ${dist.p50.toLocaleString()} | Top 10%: ${dist.p90.toLocaleString()}\n` +
          `├ Top 1%: ${dist.p99.toLocaleString()} | Max: ${dist.max.toLocaleString()}\n` +
          `└ Wealth ratio (p99/p50): ${concentrationRatio}x`
        );
      });
      flowsEmbed.addFields({
        name: "📈 Balance Distribution",
        value: distLines.join("\n\n"),
        inline: false,
      });
    }

    embeds.push(flowsEmbed);

    // Recommendations embed (if any non-healthy ones)
    const actionableRecs = recommendations.filter((r) => r.type !== "healthy");
    if (actionableRecs.length > 0) {
      const recsEmbed = new Embed()
        .setColor(UIColors.warning)
        .setTitle("⚠️ Recommendations");

      for (const rec of actionableRecs.slice(0, 3)) {
        // Max 3 recommendations
        const severityEmoji = rec.severity === "critical" ? "🔴" : rec.severity === "warning" ? "🟡" : "🔵";
        const actionLines = rec.suggestedActions.map((a) => `• ${a}`);
        const metricLines = Object.entries(rec.metrics).map(([k, v]) => `${k}: ${v}`);

        recsEmbed.addFields({
          name: `${severityEmoji} ${rec.message}`,
          value: [`**Suggested Actions:**`, ...actionLines, "", `**Metrics:** ${metricLines.join(", ")}`].join(
            "\n",
          ),
          inline: false,
        });
      }

      embeds.push(recsEmbed);
    } else if (recommendations.some((r) => r.type === "healthy")) {
      const healthyEmbed = new Embed()
        .setColor(UIColors.success)
        .setTitle("✅ Economy Health")
        .setDescription("Economy appears balanced with healthy currency flows.");
      embeds.push(healthyEmbed);
    }

    // Balance knobs checklist embed
    const knobsEmbed = new Embed()
      .setColor(0x808080)
      .setTitle("🎛️ Balance Knobs Checklist")
      .setDescription("Use these commands to tune the economy based on report findings:")
      .addFields(
        {
          name: "Daily/Work Rewards",
          value:
            "`/guild-economy` - Adjust dailyReward, workRewardBase\n" +
            "- Lower if inflation is high\n" +
            "- Increase if deflation detected",
          inline: false,
        },
        {
          name: "Tax & Fees",
          value:
            "`/guild-economy` - Configure transferTaxRate, dailyFeeRate\n" +
            "- Enable to create more sinks\n" +
            "- Deposit to works sector",
          inline: false,
        },
        {
          name: "Store Prices",
          value:
            "`/shop restock` - Adjust item prices\n" +
            "- Increase during inflation\n" +
            "- Decrease during deflation",
          inline: false,
        },
        {
          name: "Events",
          value:
            "`/event-start` - Temporary modifiers\n" +
            "- Boost rewards for engagement\n" +
            "- Add bonuses to specific activities",
          inline: false,
        },
      );

    embeds.push(knobsEmbed);

    return embeds;
  }

  private getHealthColor(health: "healthy" | "attention" | "critical"): number {
    switch (health) {
      case "healthy":
        return UIColors.success;
      case "attention":
        return UIColors.warning;
      case "critical":
        return UIColors.error;
      default:
        return UIColors.info;
    }
  }
}
