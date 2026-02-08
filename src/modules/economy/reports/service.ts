/**
 * Economy Report Service.
 *
 * Purpose: Generate economy telemetry reports with recommendations.
 * Context: Provides admins with insights into currency flows and balance.
 * Dependencies: Audit repository, user repository for balance percentiles.
 *
 * Performance Notes:
 * - Uses MongoDB aggregation pipelines with proper indexes
 * - Avoids full collection scans by using date filters
 * - Balance percentiles use approximate quantile calculation
 */

import { MongoStore } from "@/db/mongo-store";
import { UserSchema, type User } from "@/db/schemas/user";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { economyAuditRepo } from "../audit/repository";
import type { EconomyAuditEntry } from "../audit/types";
import {
  DEFAULT_REPORT_THRESHOLDS,
  isMintingOperation,
  isSinkOperation,
  getSourceLabel,
  getSinkLabel,
} from "./types";
import type {
  GenerateReportInput,
  EconomyReport,
  EconomyReportWithRecommendations,
  CurrencyFlowSummary,
  FlowEntry,
  DailyActivity,
  BalanceDistribution,
  EconomyRecommendation,
  ReportThresholds,
} from "./types";

/** User store for balance distribution queries. */
const UserStore = new MongoStore<User>("users", UserSchema);

/** Maximum report window in days. */
const MAX_REPORT_DAYS = 30;

/** Default report window in days. */
const DEFAULT_REPORT_DAYS = 7;

/** Quick stats for dashboard display. */
export type QuickStats = {
  readonly days: number;
  readonly totalMinted: number;
  readonly totalSunk: number;
  readonly netInflation: number;
  readonly transactionCount: number;
  readonly uniqueUsers: number;
};

/** Service for generating economy reports. */
export class EconomyReportService {
  async generateReport(
    input: GenerateReportInput,
  ): Promise<Result<EconomyReportWithRecommendations, Error>> {
    try {
      const days = Math.min(
        Math.max(1, input.days ?? DEFAULT_REPORT_DAYS),
        MAX_REPORT_DAYS,
      );
      const toDate = new Date();
      const fromDate = new Date(toDate.getTime() - days * 24 * 60 * 60 * 1000);

      // Fetch audit data in parallel
      const [auditResult, balanceResult] = await Promise.all([
        this.fetchAuditData(input.guildId, fromDate, toDate),
        this.fetchBalanceDistribution(input.guildId),
      ]);

      if (auditResult.isErr()) return ErrResult(auditResult.error);
      if (balanceResult.isErr()) return ErrResult(balanceResult.error);

      const auditEntries = auditResult.unwrap();
      const balanceDistribution = balanceResult.unwrap();

      // Build report
      const report = this.buildReport(
        input.guildId,
        days,
        fromDate,
        toDate,
        auditEntries,
        balanceDistribution,
      );

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        report,
        DEFAULT_REPORT_THRESHOLDS,
      );

      // Determine overall health
      const overallHealth = this.determineOverallHealth(recommendations);

      return OkResult({
        report,
        recommendations,
        overallHealth,
      });
    } catch (error) {
      console.error("[EconomyReportService] Failed to generate report:", error);
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async getQuickStats(
    guildId: string,
    days?: number,
  ): Promise<Result<QuickStats, Error>> {
    try {
      const reportDays = Math.min(
        Math.max(1, days ?? DEFAULT_REPORT_DAYS),
        MAX_REPORT_DAYS,
      );
      const toDate = new Date();
      const fromDate = new Date(toDate.getTime() - reportDays * 24 * 60 * 60 * 1000);

      const auditResult = await this.fetchAuditData(guildId, fromDate, toDate);
      if (auditResult.isErr()) return ErrResult(auditResult.error);

      const entries = auditResult.unwrap();

      let totalMinted = 0;
      let totalSunk = 0;
      const uniqueUsers = new Set<string>();

      for (const entry of entries) {
        if (entry.currencyData?.delta) {
          let mintedAmount = 0;
          let sunkAmount = 0;

          if (entry.operationType === "work_claim") {
            mintedAmount = (entry.metadata?.baseMint as number) ?? entry.currencyData.delta;
          } else if (isMintingOperation(entry.operationType) && entry.currencyData.delta > 0) {
            mintedAmount = entry.currencyData.delta;
          } else if (isSinkOperation(entry.operationType) && entry.currencyData.delta < 0) {
            sunkAmount = Math.abs(entry.currencyData.delta);
          }

          totalMinted += mintedAmount;
          totalSunk += sunkAmount;
        }
        uniqueUsers.add(entry.targetId);
      }

      return OkResult({
        days: reportDays,
        totalMinted,
        totalSunk,
        netInflation: totalMinted - totalSunk,
        transactionCount: entries.length,
        uniqueUsers: uniqueUsers.size,
      });
    } catch (error) {
      console.error("[EconomyReportService] Failed to get quick stats:", error);
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async fetchAuditData(
    guildId: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<Result<EconomyAuditEntry[], Error>> {
    const result = await economyAuditRepo.query({
      guildId,
      fromDate,
      toDate,
      pageSize: 10000, // Reasonable limit for report generation
    });

    if (result.isErr()) return ErrResult(result.error);
    return OkResult(result.unwrap().entries);
  }

  private async fetchBalanceDistribution(
    _guildId: string,
  ): Promise<Result<BalanceDistribution[], Error>> {
    try {
      const col = await UserStore.collection();

      // Aggregation for balance distribution using percentile approximation
      const pipeline = [
        {
          $match: {
            // Match users who have currency data
            "currency.coins": { $exists: true },
          },
        },
        {
          $project: {
            _id: 1,
            coins: { $ifNull: [{ $add: ["$currency.coins.hand", "$currency.coins.bank"] }, 0] },
            tokens: { $ifNull: ["$currency.tokens", 0] },
          },
        },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            coinsValues: { $push: "$coins" },
            tokensValues: { $push: "$tokens" },
            totalCoins: { $sum: "$coins" },
            totalTokens: { $sum: "$tokens" },
            maxCoins: { $max: "$coins" },
            maxTokens: { $max: "$tokens" },
          },
        },
      ];

      const result = await col.aggregate(pipeline as any).toArray();
      const data = result[0] as any;

      if (!data) {
        return OkResult([]);
      }

      const totalUsers = data.totalUsers as number;

      // Calculate percentiles by sorting arrays (for accuracy with smaller datasets)
      const coinsSorted = (data.coinsValues as number[]).sort((a, b) => a - b);
      const tokensSorted = (data.tokensValues as number[]).sort((a, b) => a - b);

      const distributions: BalanceDistribution[] = [];

      if (coinsSorted.length > 0) {
        distributions.push({
          currencyId: "coins",
          totalHolders: totalUsers,
          p50: this.percentile(coinsSorted, 50),
          p90: this.percentile(coinsSorted, 90),
          p99: this.percentile(coinsSorted, 99),
          max: data.maxCoins as number,
          mean: Math.floor((data.totalCoins as number) / totalUsers),
        });
      }

      if (tokensSorted.length > 0) {
        distributions.push({
          currencyId: "tokens",
          totalHolders: totalUsers,
          p50: this.percentile(tokensSorted, 50),
          p90: this.percentile(tokensSorted, 90),
          p99: this.percentile(tokensSorted, 99),
          max: data.maxTokens as number,
          mean: Math.floor((data.totalTokens as number) / totalUsers),
        });
      }

      return OkResult(distributions);
    } catch (error) {
      console.error("[EconomyReportService] Failed to fetch balance distribution:", error);
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  private buildReport(
    guildId: string,
    days: number,
    fromDate: Date,
    toDate: Date,
    entries: EconomyAuditEntry[],
    balanceDistribution: BalanceDistribution[],
  ): EconomyReport {
    // Track currency flows
    const mintedByCurrency: Record<string, number> = {};
    const sunkByCurrency: Record<string, number> = {};
    const mintedBySource: Record<string, number> = {};
    const sunkBySink: Record<string, number> = {};

    // Daily activity tracking
    const dailyData: Record<string, { minted: Record<string, number>; sunk: Record<string, number>; count: number }> = {};

    // Initialize daily buckets
    for (let i = 0; i < days; i++) {
      const date = new Date(fromDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split("T")[0];
      dailyData[dateKey] = { minted: {}, sunk: {}, count: 0 };
    }

    for (const entry of entries) {
      if (!entry.currencyData) continue;

      const { currencyId, delta } = entry.currencyData;
      const dateKey = entry.timestamp.toISOString().split("T")[0];

      // Track daily activity
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { minted: {}, sunk: {}, count: 0 };
      }
      dailyData[dateKey].count++;

      // Hybrid Work Payout Logic: Only baseMint is inflation
      let mintedAmount = 0;
      let sunkAmount = 0;

      if (entry.operationType === "work_claim") {
        mintedAmount = (entry.metadata?.baseMint as number) ?? delta;
        // bonusFromWorks is not minted (redistribution)
      } else if (isMintingOperation(entry.operationType) && delta > 0) {
        mintedAmount = delta;
      } else if (isSinkOperation(entry.operationType) && delta < 0) {
        sunkAmount = Math.abs(delta);
      }

      if (mintedAmount > 0) {
        mintedByCurrency[currencyId] = (mintedByCurrency[currencyId] ?? 0) + mintedAmount;
        mintedBySource[entry.operationType] = (mintedBySource[entry.operationType] ?? 0) + mintedAmount;
        dailyData[dateKey].minted[currencyId] = (dailyData[dateKey].minted[currencyId] ?? 0) + mintedAmount;
      }

      if (sunkAmount > 0) {
        sunkByCurrency[currencyId] = (sunkByCurrency[currencyId] ?? 0) + sunkAmount;
        sunkBySink[entry.operationType] = (sunkBySink[entry.operationType] ?? 0) + sunkAmount;
        dailyData[dateKey].sunk[currencyId] = (dailyData[dateKey].sunk[currencyId] ?? 0) + sunkAmount;
      }
    }

    // Build currency flow summaries
    const allCurrencies = new Set([
      ...Object.keys(mintedByCurrency),
      ...Object.keys(sunkByCurrency),
    ]);

    const currencyFlows: CurrencyFlowSummary[] = [];
    for (const currencyId of allCurrencies) {
      const minted = mintedByCurrency[currencyId] ?? 0;
      const sunk = sunkByCurrency[currencyId] ?? 0;
      const netInflation = minted - sunk;
      const totalInCirculation = minted > 0 ? minted : 1;
      const inflationRatePct = Number(((netInflation / totalInCirculation) * 100).toFixed(2));

      currencyFlows.push({
        currencyId,
        totalMinted: minted,
        totalSunk: sunk,
        netInflation,
        inflationRatePct,
      });
    }

    // Sort by net inflation (highest first)
    currencyFlows.sort((a, b) => b.netInflation - a.netInflation);

    // Build top sources
    const totalMinted = Object.values(mintedBySource).reduce((a, b) => a + b, 0);
    const topSources: FlowEntry[] = Object.entries(mintedBySource)
      .map(([source, amount]) => ({
        source: getSourceLabel(source),
        amount,
        percentage: totalMinted > 0 ? Number(((amount / totalMinted) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // Build top sinks
    const totalSunk = Object.values(sunkBySink).reduce((a, b) => a + b, 0);
    const topSinks: FlowEntry[] = Object.entries(sunkBySink)
      .map(([sink, amount]) => ({
        source: getSinkLabel(sink),
        amount,
        percentage: totalSunk > 0 ? Number(((amount / totalSunk) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // Build daily activity
    const dailyActivity: DailyActivity[] = Object.entries(dailyData)
      .map(([date, data]) => ({
        date,
        minted: data.minted,
        sunk: data.sunk,
        netInflation: Object.entries(data.minted).reduce(
          (acc, [k, v]) => ({ ...acc, [k]: v - (data.sunk[k] ?? 0) }),
          {},
        ),
        transactionCount: data.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      guildId,
      generatedAt: new Date(),
      timeWindow: { days, fromDate, toDate },
      currencyFlows,
      topSources,
      topSinks,
      dailyActivity,
      balanceDistribution,
    };
  }

  private generateRecommendations(
    report: EconomyReport,
    thresholds: ReportThresholds,
  ): EconomyRecommendation[] {
    const recommendations: EconomyRecommendation[] = [];

    // Check inflation for each currency
    for (const flow of report.currencyFlows) {
      if (flow.inflationRatePct > thresholds.highInflationPct) {
        recommendations.push({
          type: "inflation",
          severity: flow.inflationRatePct > thresholds.highInflationPct * 2 ? "critical" : "warning",
          message: `High inflation detected for ${flow.currencyId}: +${flow.inflationRatePct}% over ${report.timeWindow.days} days`,
          suggestedActions: [
            `Reduce daily reward amounts in /guild-economy config`,
            `Reduce work reward amounts in /guild-economy config`,
            `Increase store prices or add more sink items`,
            `Enable or increase transfer tax rates`,
          ],
          metrics: {
            currency: flow.currencyId,
            inflationRate: `${flow.inflationRatePct}%`,
            netMinted: flow.netInflation,
          },
        });
      } else if (flow.inflationRatePct < thresholds.deflationThresholdPct) {
        recommendations.push({
          type: "deflation",
          severity: "warning",
          message: `Deflation detected for ${flow.currencyId}: ${flow.inflationRatePct}% over ${report.timeWindow.days} days`,
          suggestedActions: [
            `Increase daily reward amounts in /guild-economy config`,
            `Add more daily/quest reward variety`,
            `Run an event with bonus rewards using /event-start`,
            `Reduce store prices temporarily`,
          ],
          metrics: {
            currency: flow.currencyId,
            deflationRate: `${flow.inflationRatePct}%`,
            netRemoved: Math.abs(flow.netInflation),
          },
        });
      }
    }

    // Check wealth concentration
    for (const dist of report.balanceDistribution) {
      const concentrationRatio = dist.p50 > 0 ? dist.p99 / dist.p50 : 0;
      if (concentrationRatio > thresholds.wealthConcentrationRatio) {
        recommendations.push({
          type: "wealth_gap",
          severity: concentrationRatio > thresholds.wealthConcentrationRatio * 2 ? "critical" : "warning",
          message: `High wealth concentration: top 1% hold ${concentrationRatio.toFixed(0)}x more than median`,
          suggestedActions: [
            `Enable progressive tax brackets in /guild-economy config`,
            `Add sink items that benefit newer players`,
            `Create quests with anti-whale mechanics`,
            `Consider a wealth tax on high balances`,
          ],
          metrics: {
            currency: dist.currencyId,
            p99: dist.p99,
            p50: dist.p50,
            ratio: concentrationRatio.toFixed(1),
          },
        });
      }
    }

    // Check transaction volume
    const totalTransactions = report.dailyActivity.reduce((sum, d) => sum + d.transactionCount, 0);
    const avgDailyTransactions = totalTransactions / report.timeWindow.days;
    if (avgDailyTransactions < thresholds.minDailyTransactions) {
      recommendations.push({
        type: "sector_imbalance",
        severity: "warning",
        message: `Low economy activity: ${avgDailyTransactions.toFixed(1)} transactions/day`,
        suggestedActions: [
          `Promote daily/work commands with /announcements`,
          `Add more engaging store items`,
          `Create limited-time events with /event-start`,
          `Review and adjust quest difficulty/rewards`,
        ],
        metrics: {
          avgDailyTransactions: avgDailyTransactions.toFixed(1),
          totalTransactions,
          days: report.timeWindow.days,
        },
      });
    }

    // Check sector balance (work vs daily)
    const workSource = report.topSources.find((s) => s.source.includes("Work"));
    const dailySource = report.topSources.find((s) => s.source.includes("Daily"));
    if (workSource && dailySource) {
      const ratio = workSource.amount / dailySource.amount;
      if (ratio < 0.5) {
        recommendations.push({
          type: "sector_imbalance",
          severity: "info",
          message: "Work sector is underutilized compared to daily rewards",
          suggestedActions: [
            `Increase work rewards or reduce cooldown in /guild-economy config`,
            `Add work-related quests to encourage usage`,
            `Promote work command benefits to users`,
          ],
          metrics: {
            workToDailyRatio: ratio.toFixed(2),
            workAmount: workSource.amount,
            dailyAmount: dailySource.amount,
          },
        });
      }
    }

    // If no issues found, add a healthy status
    if (recommendations.length === 0) {
      recommendations.push({
        type: "healthy",
        severity: "info",
        message: "Economy appears healthy with balanced flows",
        suggestedActions: [
          `Continue monitoring with weekly reports`,
          `Consider seasonal events to maintain engagement`,
        ],
        metrics: {
          currenciesTracked: report.currencyFlows.length,
          avgDailyTransactions: avgDailyTransactions.toFixed(1),
        },
      });
    }

    return recommendations;
  }

  private determineOverallHealth(
    recommendations: EconomyRecommendation[],
  ): "healthy" | "attention" | "critical" {
    const criticalCount = recommendations.filter((r) => r.severity === "critical").length;
    const warningCount = recommendations.filter((r) => r.severity === "warning").length;

    if (criticalCount > 0) return "critical";
    if (warningCount > 1) return "attention";
    return "healthy";
  }
}

/** Singleton instance. */
export const economyReportService = new EconomyReportService();
