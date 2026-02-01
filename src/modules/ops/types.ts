/**
 * Launch Ops Types.
 *
 * Purpose: Define types for startup assertions, ops config, and scheduled reports.
 * Context: Used by LaunchOpsHarness for safe economy launch and monitoring.
 */

import type { GuildId } from "@/db/types";

/** Guild-scoped operations configuration. */
export interface GuildOpsConfig {
  /** MongoDB ID (same as guildId for single doc per guild). */
  readonly _id: GuildId;
  /** Guild ID this config belongs to. */
  readonly guildId: GuildId;
  /** Whether economy ops are enabled for this guild. */
  readonly economyOpsEnabled: boolean;
  /** Channel ID for ops reports/alerts. */
  readonly opsChannelId: string | null;
  /** Whether daily reports are enabled. */
  readonly dailyReportEnabled: boolean;
  /** Hour (0-23) to post daily reports in guild's local time. */
  readonly dailyReportHourLocal: number;
  /** Number of days to include in reports (default 7). */
  readonly reportWindowDays: number;
  /** Soft launch mode - limited features for testing. */
  readonly softLaunchMode: boolean;
  /** When this config was last updated. */
  readonly updatedAt: Date;
  /** Config version for migrations. */
  readonly version: number;
}

/** Default ops configuration (without ID fields). */
export const DEFAULT_GUILD_OPS_CONFIG: Omit<GuildOpsConfig, "_id" | "guildId" | "updatedAt"> = {
  economyOpsEnabled: true,
  opsChannelId: null,
  dailyReportEnabled: false,
  dailyReportHourLocal: 9,
  reportWindowDays: 7,
  softLaunchMode: true,
  version: 1,
};

/** Input for updating ops config. */
export interface UpdateOpsConfigInput {
  economyOpsEnabled?: boolean;
  opsChannelId?: string | null;
  dailyReportEnabled?: boolean;
  dailyReportHourLocal?: number;
  reportWindowDays?: number;
  softLaunchMode?: boolean;
}

/** Startup assertion result. */
export interface AssertionResult {
  readonly name: string;
  readonly passed: boolean;
  readonly message: string;
  readonly severity: "critical" | "warning" | "info";
}

/** Critical index definition for verification. */
export interface CriticalIndex {
  readonly collection: string;
  readonly name: string;
  readonly fields: Record<string, 1 | -1>;
  readonly options?: Record<string, unknown>;
}

/** Config validation rule. */
export interface ConfigValidationRule {
  readonly name: string;
  readonly validate: (value: unknown) => boolean;
  readonly message: string;
}

/** Kill switch definition. */
export interface KillSwitch {
  readonly name: string;
  readonly description: string;
  readonly defaultState: boolean;
  readonly currentState: boolean;
}

/** Scheduled report metadata. */
export interface ScheduledReport {
  readonly guildId: GuildId;
  readonly scheduledHour: number;
  readonly lastRunAt: Date | null;
  readonly nextRunAt: Date;
  readonly isRunning: boolean;
}

/** Report scheduling error. */
export interface SchedulingError {
  readonly guildId: GuildId;
  readonly error: string;
  readonly timestamp: Date;
}

/** Ops service health status. */
export interface OpsHealthStatus {
  readonly assertionsPassed: number;
  readonly assertionsFailed: number;
  readonly configsValidated: number;
  readonly configsWithErrors: number;
  readonly scheduledReportsActive: number;
  readonly lastCheckAt: Date;
  readonly overallStatus: "healthy" | "degraded" | "critical";
}

/** Canonical currency IDs for validation. */
export const CANONICAL_CURRENCY_IDS = ["coins", "tokens", "rep"] as const;
export type CanonicalCurrencyId = (typeof CANONICAL_CURRENCY_IDS)[number];

/**
 * Check if a currency ID is canonical.
 */
export function isCanonicalCurrencyId(id: string): id is CanonicalCurrencyId {
  return CANONICAL_CURRENCY_IDS.includes(id as CanonicalCurrencyId);
}

/** Config bounds for validation. */
export const CONFIG_BOUNDS = {
  taxRate: { min: 0, max: 0.5 },
  feeRate: { min: 0, max: 0.2 },
  dailyCooldownHours: { min: 1, max: 168 },
  workCooldownMinutes: { min: 1, max: 1440 },
  dailyCap: { min: 1, max: 100 },
  dailyReward: { min: 1, max: 10000 },
  workReward: { min: 1, max: 10000 },
  reportWindowDays: { min: 1, max: 30 },
  reportHour: { min: 0, max: 23 },
} as const;

/**
 * Validate tax rate is within bounds.
 */
export function isValidTaxRate(rate: number): boolean {
  return rate >= CONFIG_BOUNDS.taxRate.min && rate <= CONFIG_BOUNDS.taxRate.max;
}

/**
 * Validate fee rate is within bounds.
 */
export function isValidFeeRate(rate: number): boolean {
  return rate >= CONFIG_BOUNDS.feeRate.min && rate <= CONFIG_BOUNDS.feeRate.max;
}

/**
 * Validate cooldown hours are within bounds.
 */
export function isValidDailyCooldown(hours: number): boolean {
  return (
    hours >= CONFIG_BOUNDS.dailyCooldownHours.min &&
    hours <= CONFIG_BOUNDS.dailyCooldownHours.max
  );
}

/**
 * Validate work cooldown minutes are within bounds.
 */
export function isValidWorkCooldown(minutes: number): boolean {
  return (
    minutes >= CONFIG_BOUNDS.workCooldownMinutes.min &&
    minutes <= CONFIG_BOUNDS.workCooldownMinutes.max
  );
}

/**
 * Validate daily cap is within bounds.
 */
export function isValidDailyCap(cap: number): boolean {
  return cap >= CONFIG_BOUNDS.dailyCap.min && cap <= CONFIG_BOUNDS.dailyCap.max;
}

/**
 * Validate report window days are within bounds.
 */
export function isValidReportWindowDays(days: number): boolean {
  return (
    days >= CONFIG_BOUNDS.reportWindowDays.min &&
    days <= CONFIG_BOUNDS.reportWindowDays.max
  );
}

/**
 * Validate report hour is within bounds.
 */
export function isValidReportHour(hour: number): boolean {
  return hour >= CONFIG_BOUNDS.reportHour.min && hour <= CONFIG_BOUNDS.reportHour.max;
}
