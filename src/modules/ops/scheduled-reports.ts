/**
 * Scheduled Reporting Service.
 *
 * Purpose: Post daily economy reports to configured channels.
 * Context: Runs on schedule, prevents duplicate reports.
 *
 * Invariants:
 * - Exactly one report per guild per day
 * - Reports posted at configured hour in guild local time
 * - No duplicate reports if bot restarts
 */

import { ErrResult, OkResult, type Result } from "@/utils/result";
import { economyReportService } from "@/modules/economy/reports";
import { opsConfigRepo } from "./repository";
import type { GuildOpsConfig, ScheduledReport, SchedulingError } from "./types";
import type { GuildId } from "@/db/types";
import { progressiveUnlock } from "./progressive-unlock";

/** Service interface for scheduled reports. */
export interface ScheduledReportingService {
  /** Check and run any due reports. */
  checkAndRun(): Promise<ReportRunResult[]>;

  /** Manually trigger a report for a guild. */
  runReport(guildId: GuildId): Promise<Result<ReportOutput, Error>>;

  /** Get next scheduled run times. */
  getSchedule(): Promise<ScheduledReport[]>;

  /** Get recent errors. */
  getRecentErrors(limit?: number): SchedulingError[];
}

/** Result of a report run. */
export interface ReportRunResult {
  readonly guildId: GuildId;
  readonly success: boolean;
  readonly output?: ReportOutput;
  readonly error?: string;
  readonly timestamp: Date;
}

/** Report output for sending to Discord. */
export interface ReportOutput {
  readonly guildId: GuildId;
  readonly embeds: unknown[];
  readonly content: string;
  readonly quickStats: {
    readonly days: number;
    readonly totalMinted: number;
    readonly totalSunk: number;
    readonly netInflation: number;
    readonly uniqueUsers: number;
  };
  readonly topRecommendation: {
    readonly message: string;
    readonly severity: string;
  } | null;
  readonly flags: {
    readonly inflation: boolean;
    readonly deflation: boolean;
    readonly wealthGap: boolean;
  };
}

/** In-memory tracking of report runs (cleared on restart). */
const recentRuns = new Map<GuildId, Date>();
const recentErrors: SchedulingError[] = [];
const MAX_ERRORS = 100;

/** Hour tolerance for "same day" check (prevents edge case duplicates). */
const RUN_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

class ScheduledReportingServiceImpl implements ScheduledReportingService {
  async checkAndRun(): Promise<ReportRunResult[]> {
    const results: ReportRunResult[] = [];

    try {
      // Also run progressive unlock checks
      await progressiveUnlock.checkAllGuilds();

      // Get all guilds with daily reports enabled
      const configsResult = await opsConfigRepo.listWithDailyReports();
      if (configsResult.isErr()) {
        console.error("[ScheduledReports] Failed to get configs:", configsResult.error);
        return results;
      }

      const configs = configsResult.unwrap();
      const now = new Date();

      for (const config of configs) {
        if (!this.isReportDue(config, now)) {
          continue;
        }

        // Check if already ran recently (prevent duplicates)
        if (this.hasRunRecently(config.guildId, now)) {
          console.log(`[ScheduledReports] Skipping ${config.guildId} - ran recently`);
          continue;
        }

        const result = await this.runReport(config.guildId);

        if (result.isOk()) {
          results.push({
            guildId: config.guildId,
            success: true,
            output: result.unwrap(),
            timestamp: new Date(),
          });
          recentRuns.set(config.guildId, new Date());
        } else {
          const error = result.error.message;
          results.push({
            guildId: config.guildId,
            success: false,
            error,
            timestamp: new Date(),
          });
          this.addError({ guildId: config.guildId, error, timestamp: new Date() });
        }
      }
    } catch (error) {
      console.error("[ScheduledReports] Error in checkAndRun:", error);
    }

    return results;
  }

  async runReport(guildId: GuildId): Promise<Result<ReportOutput, Error>> {
    try {
      // Get ops config
      const configResult = await opsConfigRepo.get(guildId);
      if (configResult.isErr()) {
        return ErrResult(configResult.error);
      }
      const config = configResult.unwrap();

      // Check if ops enabled
      if (!config.economyOpsEnabled) {
        return ErrResult(new Error("Economy ops disabled for this guild"));
      }

      // Check if channel configured
      if (!config.opsChannelId) {
        return ErrResult(new Error("No ops channel configured"));
      }

      // Generate report
      const reportResult = await economyReportService.generateReport({
        guildId,
        days: config.reportWindowDays,
      });

      if (reportResult.isErr()) {
        return ErrResult(reportResult.error);
      }

      const { report, recommendations, overallHealth } = reportResult.unwrap();

      // Find top recommendation (first non-healthy one, or the healthy one)
      const topRec = recommendations.find((r) => r.type !== "healthy") ??
        recommendations.find((r) => r.type === "healthy") ??
        null;

      // Calculate quick stats
      const quickStats = {
        days: report.timeWindow.days,
        totalMinted: report.currencyFlows.reduce((sum, f) => sum + f.totalMinted, 0),
        totalSunk: report.currencyFlows.reduce((sum, f) => sum + f.totalSunk, 0),
        netInflation: report.currencyFlows.reduce((sum, f) => sum + f.netInflation, 0),
        uniqueUsers: 0, // Would need to calculate from audit
      };

      // Build simplified embeds for scheduled report
      const embeds = this.buildScheduledReportEmbeds(report, recommendations, overallHealth);

      // Check flags
      const flags = {
        inflation: recommendations.some((r) => r.type === "inflation" && r.severity !== "info"),
        deflation: recommendations.some((r) => r.type === "deflation"),
        wealthGap: recommendations.some((r) => r.type === "wealth_gap" && r.severity !== "info"),
      };

      return OkResult({
        guildId,
        embeds,
        content: this.buildContent(flags, overallHealth),
        quickStats,
        topRecommendation: topRec
          ? { message: topRec.message, severity: topRec.severity }
          : null,
        flags,
      });
    } catch (error) {
      console.error("[ScheduledReports] Failed to run report:", error);
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async getSchedule(): Promise<ScheduledReport[]> {
    const configsResult = await opsConfigRepo.listWithDailyReports();
    if (configsResult.isErr()) {
      return [];
    }

    const configs = configsResult.unwrap();
    const now = new Date();

    return configs.map((config) => {
      const lastRun = recentRuns.get(config.guildId) ?? null;
      const nextRun = this.calculateNextRun(config, now);

      return {
        guildId: config.guildId,
        scheduledHour: config.dailyReportHourLocal,
        lastRunAt: lastRun,
        nextRunAt: nextRun,
        isRunning: false,
      };
    });
  }

  getRecentErrors(limit = 10): SchedulingError[] {
    return recentErrors.slice(-limit);
  }

  private isReportDue(config: GuildOpsConfig, now: Date): boolean {
    const currentHour = now.getHours();
    return currentHour >= config.dailyReportHourLocal;
  }

  private hasRunRecently(guildId: GuildId, now: Date): boolean {
    const lastRun = recentRuns.get(guildId);
    if (!lastRun) return false;

    // Check if ran today (same day)
    const isSameDay = lastRun.toDateString() === now.toDateString();
    if (!isSameDay) return false;

    // Check if ran within tolerance window
    const timeSinceLastRun = now.getTime() - lastRun.getTime();
    return timeSinceLastRun < RUN_TOLERANCE_MS;
  }

  private calculateNextRun(config: GuildOpsConfig, now: Date): Date {
    const next = new Date(now);
    next.setHours(config.dailyReportHourLocal, 0, 0, 0);

    // If we've passed the hour today, schedule for tomorrow
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }

  private buildContent(
    flags: { inflation: boolean; deflation: boolean; wealthGap: boolean },
    health: string,
  ): string {
    const parts: string[] = [];

    if (flags.inflation) parts.push("📈 **Inflation Alert**");
    if (flags.deflation) parts.push("📉 **Deflation Warning**");
    if (flags.wealthGap) parts.push("⚠️ **Wealth Gap Detected**");

    if (parts.length === 0) {
      parts.push(health === "healthy" ? "✅ Economy looks healthy" : "📊 Daily Economy Report");
    }

    return parts.join(" | ");
  }

  private buildScheduledReportEmbeds(
    report: import("@/modules/economy/reports").EconomyReport,
    recommendations: import("@/modules/economy/reports").EconomyRecommendation[],
    overallHealth: string,
  ): unknown[] {
    // Simplified embed for scheduled reports
    const { Embed } = require("seyfert");
    const { EmbedColors } = require("seyfert/lib/common");

    const color =
      overallHealth === "healthy"
        ? EmbedColors.Green
        : overallHealth === "attention"
          ? EmbedColors.Yellow
          : EmbedColors.Red;

    const embed = new Embed()
      .setColor(color)
      .setTitle(`📊 Economy Report: Last ${report.timeWindow.days} Days`)
      .setDescription(`Report generated at ${new Date().toISOString().slice(0, 16)} UTC`);

    // Currency flows summary
    if (report.currencyFlows.length > 0) {
      const flowLines = report.currencyFlows.map((f) => {
        const trend = f.netInflation > 0 ? "📈" : f.netInflation < 0 ? "📉" : "➡️";
        return `${trend} ${f.currencyId}: ${f.netInflation >= 0 ? "+" : ""}${f.netInflation.toLocaleString()} (${f.inflationRatePct}%)`;
      });
      embed.addFields({
        name: "Currency Flows",
        value: flowLines.join("\n") || "No activity",
        inline: false,
      });
    }

    // Top recommendation
    const topRec = recommendations.find((r) => r.type !== "healthy");
    if (topRec) {
      const severityEmoji = topRec.severity === "critical" ? "🔴" : topRec.severity === "warning" ? "🟡" : "🔵";
      embed.addFields({
        name: `${severityEmoji} Top Recommendation`,
        value: topRec.message,
        inline: false,
      });
    }

    return [embed];
  }

  private addError(error: SchedulingError): void {
    recentErrors.push(error);
    if (recentErrors.length > MAX_ERRORS) {
      recentErrors.shift();
    }
  }
}

/** Singleton instance. */
export const scheduledReporting: ScheduledReportingService = new ScheduledReportingServiceImpl();

/** Start the scheduled report checker. */
export function startScheduledReporting(): void {
  console.log("[ScheduledReports] Starting scheduled reporting service...");

  // Check every 15 minutes
  const INTERVAL_MS = 15 * 60 * 1000;

  setInterval(async () => {
    await scheduledReporting.checkAndRun();
  }, INTERVAL_MS);

  // Also run immediately on startup (after a short delay to let things settle)
  setTimeout(async () => {
    await scheduledReporting.checkAndRun();
  }, 5000);
}
