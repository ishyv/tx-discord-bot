/**
 * Economy Report Types.
 *
 * Purpose: Define types for economy telemetry and balance reports.
 * Context: Used by EconomyReportService to generate guild economy summaries.
 * Dependencies: Audit system, currency system.
 */

import type { CurrencyId } from "../currency";

/** Time window for report queries. */
export interface ReportTimeWindow {
  readonly days: number;
  readonly fromDate: Date;
  readonly toDate: Date;
}

/** Currency flow summary (minted vs sunk). */
export interface CurrencyFlowSummary {
  readonly currencyId: CurrencyId;
  readonly totalMinted: number;
  readonly totalSunk: number;
  readonly netInflation: number;
  readonly inflationRatePct: number;
}

/** Top source/sink entry. */
export interface FlowEntry {
  readonly source: string;
  readonly amount: number;
  readonly percentage: number;
}

/** Daily breakdown of economy activity. */
export interface DailyActivity {
  readonly date: string; // ISO date YYYY-MM-DD
  readonly minted: Record<CurrencyId, number>;
  readonly sunk: Record<CurrencyId, number>;
  readonly netInflation: Record<CurrencyId, number>;
  readonly transactionCount: number;
}

/** Balance distribution percentiles for a currency. */
export interface BalanceDistribution {
  readonly currencyId: CurrencyId;
  readonly totalHolders: number;
  readonly p50: number; // Median
  readonly p90: number;
  readonly p99: number;
  readonly max: number;
  readonly mean: number;
}

/** Complete economy report for a guild. */
export interface EconomyReport {
  readonly guildId: string;
  readonly generatedAt: Date;
  readonly timeWindow: ReportTimeWindow;
  readonly currencyFlows: CurrencyFlowSummary[];
  readonly topSources: FlowEntry[];
  readonly topSinks: FlowEntry[];
  readonly dailyActivity: DailyActivity[];
  readonly balanceDistribution: BalanceDistribution[];
}

/** Recommendation for economy balance tuning. */
export interface EconomyRecommendation {
  readonly type: "inflation" | "deflation" | "sector_imbalance" | "wealth_gap" | "healthy";
  readonly severity: "critical" | "warning" | "info";
  readonly message: string;
  readonly suggestedActions: string[];
  readonly metrics: Record<string, number | string>;
}

/** Report with recommendations. */
export interface EconomyReportWithRecommendations {
  readonly report: EconomyReport;
  readonly recommendations: EconomyRecommendation[];
  readonly overallHealth: "healthy" | "attention" | "critical";
}

/** Input for generating a report. */
export interface GenerateReportInput {
  readonly guildId: string;
  readonly days?: number; // Default 7, max 30
}

/** Thresholds for triggering recommendations. */
export interface ReportThresholds {
  readonly highInflationPct: number; // e.g., 20% weekly
  readonly deflationThresholdPct: number; // e.g., -10% weekly
  readonly wealthConcentrationRatio: number; // p99 / p50 ratio threshold
  readonly minDailyTransactions: number; // Warn if below this
}

/** Default thresholds. */
export const DEFAULT_REPORT_THRESHOLDS: ReportThresholds = {
  highInflationPct: 20,
  deflationThresholdPct: -10,
  wealthConcentrationRatio: 100,
  minDailyTransactions: 10,
};

/** Source operation types that mint currency. */
export const MINTING_OPERATIONS = [
  "daily_claim",
  "work_claim",
  "quest_complete",
  "currency_adjust", // Manual admin adjustments (positive)
] as const;

/** Sink operation types that remove currency. */
export const SINK_OPERATIONS = [
  "item_purchase",
  "perk_purchase",
  "craft",
  "currency_adjust", // Manual admin adjustments (negative)
] as const;

/** Transfer operations (neutral for inflation). */
export const TRANSFER_OPERATIONS = [
  "currency_transfer",
  "item_sell",
] as const;

/** Map operation types to human-readable sources. */
export const SOURCE_LABELS: Record<string, string> = {
  daily_claim: "🎁 Daily Rewards",
  work_claim: "💼 Work Rewards",
  quest_complete: "📜 Quest Rewards",
  currency_adjust: "🔧 Admin Adjustments",
  xp_grant: "⭐ XP Grants",
  item_sell: "💰 Item Sales",
};

/** Map operation types to human-readable sinks. */
export const SINK_LABELS: Record<string, string> = {
  item_purchase: "🛒 Store Purchases",
  perk_purchase: "✨ Perk Purchases",
  craft: "🔨 Crafting Costs",
  currency_adjust: "🔧 Admin Adjustments",
};

/**
 * Check if an operation is a currency source (mints currency).
 */
export function isMintingOperation(operationType: string): boolean {
  return MINTING_OPERATIONS.includes(operationType as any);
}

/**
 * Check if an operation is a currency sink (removes currency).
 */
export function isSinkOperation(operationType: string): boolean {
  return SINK_OPERATIONS.includes(operationType as any);
}

/**
 * Check if an operation is a transfer (neutral for inflation).
 */
export function isTransferOperation(operationType: string): boolean {
  return TRANSFER_OPERATIONS.includes(operationType as any);
}

/**
 * Get human-readable label for a source operation.
 */
export function getSourceLabel(operationType: string): string {
  return SOURCE_LABELS[operationType] ?? `📊 ${operationType}`;
}

/**
 * Get human-readable label for a sink operation.
 */
export function getSinkLabel(operationType: string): string {
  return SINK_LABELS[operationType] ?? `📊 ${operationType}`;
}
