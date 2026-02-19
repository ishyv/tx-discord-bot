/**
 * Ops Command (Phase 10a).
 *
 * Purpose: Configure launch operations - channel, reports, soft launch mode.
 * Permission: ManageGuild (admin).
 */

import { HelpDoc, HelpCategory } from "@/modules/help";
import {
  Command,
  Declare,
  Embed,
  createChannelOption,
  createIntegerOption,
  createBooleanOption,
  Options,
  type CommandContext,
} from "seyfert";
import { MessageFlags, ChannelType } from "seyfert/lib/types";
import { UIColors } from "@/modules/ui/design-system";
import { launchOps, opsConfigRepo } from "@/modules/ops";

const MAX_REPORT_DAYS = 30;
const MAX_REPORT_HOUR = 23;

@HelpDoc({
  command: "ops",
  category: HelpCategory.Economy,
  description: "Configure launch operations, channels, and scheduled reports (admin only)",
  usage: "/ops [channel] [report_hour] [soft_launch]",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "ops",
  description: "Configure launch operations and scheduled reports (admin only)",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageGuild"],
})
@Options({
  // Channel configuration
  channel: createChannelOption({
    description: "Set ops channel (omit to clear)",
    required: false,
    channel_types: [ChannelType.GuildText],
  }),
  // Economy ops toggle
  economy: createBooleanOption({
    description: "Enable/disable economy operations",
    required: false,
  }),
  // Reports configuration
  reports: createBooleanOption({
    description: "Enable/disable daily reports",
    required: false,
  }),
  hour: createIntegerOption({
    description: "Report hour (0-23)",
    required: false,
    min_value: 0,
    max_value: MAX_REPORT_HOUR,
  }),
  days: createIntegerOption({
    description: "Report window days (1-30)",
    required: false,
    min_value: 1,
    max_value: MAX_REPORT_DAYS,
  }),
  // Soft launch mode
  soft_launch: createBooleanOption({
    description: "Enable/disable soft launch mode",
    required: false,
  }),
  // Test report
  test: createBooleanOption({
    description: "Trigger test report",
    required: false,
  }),
  // Status display
  status: createBooleanOption({
    description: "Show system status",
    required: false,
  }),
})
export default class OpsCommand extends Command {
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
      channel?: { id: string };
      economy?: boolean;
      reports?: boolean;
      hour?: number;
      days?: number;
      soft_launch?: boolean;
      test?: boolean;
      status?: boolean;
    };

    // Route to appropriate handler based on options
    if (options.channel !== undefined) {
      await this.handleSetChannel(ctx, guildId, options.channel?.id ?? null);
    } else if (options.economy !== undefined) {
      await this.handleEconomy(ctx, guildId, options.economy);
    } else if (options.reports !== undefined || options.hour !== undefined || options.days !== undefined) {
      await this.handleReports(ctx, guildId, options.reports ?? true, options.hour, options.days);
    } else if (options.soft_launch !== undefined) {
      await this.handleSoftLaunch(ctx, guildId, options.soft_launch);
    } else if (options.test) {
      await this.handleTestReport(ctx, guildId);
    } else if (options.status) {
      await this.handleStatus(ctx, guildId);
    } else {
      // Default: show config
      await this.showConfig(ctx, guildId);
    }
  }

  private async showConfig(ctx: CommandContext, guildId: string) {
    const configResult = await opsConfigRepo.get(guildId);
    if (configResult.isErr()) {
      await ctx.write({
        content: "❌ Failed to load ops config.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = configResult.unwrap();

    const embed = new Embed()
      .setColor(UIColors.info)
      .setTitle("⚙️ Launch Ops Configuration")
      .setDescription(`Current settings for this server`)
      .addFields(
        {
          name: "Economy Ops",
          value: config.economyOpsEnabled ? "✅ Enabled" : "❌ Disabled",
          inline: true,
        },
        {
          name: "Ops Channel",
          value: config.opsChannelId ? `<#${config.opsChannelId}>` : "Not set",
          inline: true,
        },
        {
          name: "Daily Reports",
          value: config.dailyReportEnabled ? "✅ Enabled" : "❌ Disabled",
          inline: true,
        },
        {
          name: "Report Hour",
          value: `${config.dailyReportHourLocal}:00 local time`,
          inline: true,
        },
        {
          name: "Report Window",
          value: `${config.reportWindowDays} days`,
          inline: true,
        },
        {
          name: "Soft Launch Mode",
          value: config.softLaunchMode ? "✅ On (limited features)" : "❌ Off (full launch)",
          inline: true,
        },
      )
      .setFooter({ text: `Version ${config.version} | Updated ${config.updatedAt.toISOString().slice(0, 16)}` });

    await ctx.write({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }

  private async handleSetChannel(ctx: CommandContext, guildId: string, channelId: string | null) {
    const result = await launchOps.updateConfig(guildId, { opsChannelId: channelId });

    if (result.isErr()) {
      await ctx.write({
        content: `❌ Failed to update channel: ${result.error.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.write({
      content: channelId
        ? `✅ Ops channel set to <#${channelId}>`
        : "✅ Ops channel cleared. Reports will not be sent.",
      flags: MessageFlags.Ephemeral,
    });
  }

  private async handleEconomy(ctx: CommandContext, guildId: string, enabled: boolean) {
    const result = await launchOps.updateConfig(guildId, { economyOpsEnabled: enabled });

    if (result.isErr()) {
      await ctx.write({
        content: `❌ Failed to update: ${result.error.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.write({
      content: enabled
        ? "✅ Economy ops enabled. Scheduled reports will run."
        : "✅ Economy ops disabled. Scheduled reports paused.",
      flags: MessageFlags.Ephemeral,
    });
  }

  private async handleReports(
    ctx: CommandContext,
    guildId: string,
    enabled: boolean,
    hour?: number,
    days?: number,
  ) {
    const update: Parameters<typeof launchOps.updateConfig>[1] = {
      dailyReportEnabled: enabled,
    };

    if (hour !== undefined) {
      update.dailyReportHourLocal = hour;
    }

    if (days !== undefined) {
      update.reportWindowDays = days;
    }

    const result = await launchOps.updateConfig(guildId, update);

    if (result.isErr()) {
      await ctx.write({
        content: `❌ Failed to update: ${result.error.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = result.unwrap();
    const parts: string[] = [];

    if (enabled) {
      parts.push(`✅ Daily reports enabled`);
      parts.push(`📅 Hour: ${config.dailyReportHourLocal}:00`);
      parts.push(`📊 Window: ${config.reportWindowDays} days`);
      if (!config.opsChannelId) {
        parts.push("⚠️ **Warning:** No ops channel set. Set a channel to receive reports.");
      }
    } else {
      parts.push("✅ Daily reports disabled");
    }

    await ctx.write({
      content: parts.join("\n"),
      flags: MessageFlags.Ephemeral,
    });
  }

  private async handleSoftLaunch(ctx: CommandContext, guildId: string, enabled: boolean) {
    const result = await launchOps.updateConfig(guildId, { softLaunchMode: enabled });

    if (result.isErr()) {
      await ctx.write({
        content: `❌ Failed to update: ${result.error.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (enabled) {
      await ctx.write({
        content:
          "✅ **Soft launch mode enabled.**\n" +
          "Limited features active. Use this for testing before full launch.\n" +
          "Run `/ops soft_launch:false` when ready for full launch.",
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await ctx.write({
        content:
          "🚀 **Full launch mode enabled!**\n" +
          "All economy features are now active.\n" +
          "Monitor with `/economy-report` and scheduled daily reports.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  private async handleTestReport(ctx: CommandContext, guildId: string) {
    await ctx.write({
      content: "⏳ Generating test report...",
      flags: MessageFlags.Ephemeral,
    });

    const result = await launchOps.triggerReport(guildId);

    if (result.isErr()) {
      await ctx.editResponse({
        content: `❌ Failed to generate report: ${result.error.message}`,
      });
      return;
    }

    await ctx.editResponse({
      content: `✅ **Test Report Generated**\n${result.unwrap()}`,
    });
  }

  private async handleStatus(ctx: CommandContext, guildId: string) {
    const [configResult, health] = await Promise.all([
      opsConfigRepo.get(guildId),
      launchOps.getHealth(),
    ]);

    if (configResult.isErr()) {
      await ctx.write({
        content: "❌ Failed to load config.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = configResult.unwrap();

    const statusColor =
      health.overallStatus === "healthy"
        ? UIColors.success
        : health.overallStatus === "degraded"
          ? UIColors.warning
          : UIColors.error;

    const embed = new Embed()
      .setColor(statusColor)
      .setTitle("📊 Ops System Status")
      .addFields(
        {
          name: "Health",
          value: `${this.getHealthEmoji(health.overallStatus)} ${health.overallStatus.toUpperCase()}`,
          inline: true,
        },
        {
          name: "Assertions",
          value: `${health.assertionsPassed} passed, ${health.assertionsFailed} failed`,
          inline: true,
        },
        {
          name: "Scheduled Reports",
          value: config.dailyReportEnabled ? "✅ Active" : "⏸️ Paused",
          inline: true,
        },
        {
          name: "Soft Launch",
          value: config.softLaunchMode ? "🧪 Testing" : "🚀 Live",
          inline: true,
        },
      )
      .setFooter({ text: `Last check: ${health.lastCheckAt.toISOString().slice(0, 16)} UTC` });

    await ctx.write({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }

  private getHealthEmoji(status: string): string {
    switch (status) {
      case "healthy":
        return "🟢";
      case "degraded":
        return "🟡";
      case "critical":
        return "🔴";
      default:
        return "⚪";
    }
  }
}
