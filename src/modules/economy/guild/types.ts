/**
 * Guild Economy Types.
 *
 * Purpose: Define guild treasury sectors, tax configuration, and economy settings.
 */

import type { CurrencyId } from "../currency";
import type { ProgressionConfig } from "../progression/types";
import type { GuildId } from "@/db/types";

/** Economy sectors for guild treasury. */
export type EconomySector = "global" | "works" | "trade" | "tax";

/** Balance for each economy sector. */
export type SectorBalances = Record<EconomySector, number>;

/** Default sector balances (all start at 0). */
export const DEFAULT_SECTOR_BALANCES: SectorBalances = {
  global: 0,
  works: 0,
  trade: 0,
  tax: 0,
};

/** Tax configuration for guild. */
export interface TaxConfig {
  /** Global tax rate (0-1, default 0.05 = 5%) */
  readonly rate: number;
  /** Whether taxes are enabled */
  readonly enabled: boolean;
  /** Minimum amount before tax applies */
  readonly minimumTaxableAmount: number;
  /** Sector to deposit taxes into */
  readonly taxSector: EconomySector;
}

/** Default tax configuration. */
export const DEFAULT_TAX_CONFIG: TaxConfig = {
  rate: 0.05,
  enabled: true,
  minimumTaxableAmount: 0,
  taxSector: "tax",
};

/** Transfer thresholds for large transfer alerts. */
export interface TransferThresholds {
  /** Warning threshold (default: 100,000) */
  readonly warning: number;
  /** Alert threshold (default: 1,000,000) */
  readonly alert: number;
  /** Critical threshold (default: 10,000,000) */
  readonly critical: number;
}

/** Default transfer thresholds. */
export const DEFAULT_TRANSFER_THRESHOLDS: TransferThresholds = {
  warning: 100_000,
  alert: 1_000_000,
  critical: 10_000_000,
};

/** Alert level for transfers. */
export type TransferAlertLevel = "none" | "warning" | "alert" | "critical";

/** Result of applying tax to an amount. */
export interface TaxResult {
  /** Net amount after tax (what recipient receives). */
  readonly net: number;
  /** Tax amount deducted. */
  readonly tax: number;
  /** Tax rate applied (0-1). */
  readonly rate: number;
  /** Whether tax was applied. */
  readonly taxed: boolean;
  /** Sector where tax was deposited. */
  readonly depositedTo: EconomySector | null;
}

/** Daily claim configuration (guild-scoped). */
export interface DailyConfig {
  /** Amount of primary currency granted per claim (default 250). */
  readonly dailyReward: number;
  /** Cooldown in hours between claims (default 24). */
  readonly dailyCooldownHours: number;
  /** Currency ID for daily reward (default "coins"). */
  readonly dailyCurrencyId: string;
  /** Fee rate for daily claim (0.00-0.20, default 0.00) */
  readonly dailyFeeRate: number;
  /** Sector to deposit daily fee (default: "tax") */
  readonly dailyFeeSector: EconomySector;
  /** Bonus per streak day (default 5). */
  readonly dailyStreakBonus: number;
  /** Max streak days counted for bonus (default 10). */
  readonly dailyStreakCap: number;
}

/** Default daily config. */
export const DEFAULT_DAILY_CONFIG: DailyConfig = {
  dailyReward: 250,
  dailyCooldownHours: 24,
  dailyCurrencyId: "coins",
  dailyFeeRate: 0.0,
  dailyFeeSector: "tax",
  dailyStreakBonus: 5,
  dailyStreakCap: 10,
};

/** Work claim configuration (guild-scoped). */
export interface WorkConfig {
  /** Base amount granted per work claim (historic/deprecated if using hybrid). */
  readonly workRewardBase: number;
  /** Base amount minted per work claim (integer, default 100). */
  readonly workBaseMintReward: number;
  /** Max additional bonus from guild works sector (integer, default 100). */
  readonly workBonusFromWorksMax: number;
  /** Scale mode for bonus calculation ("flat" | "percent", default "flat"). */
  readonly workBonusScaleMode: "flat" | "percent";
  /** Cooldown in minutes between work claims (default 30). */
  readonly workCooldownMinutes: number;
  /** Max work claims per day (default 5). */
  readonly workDailyCap: number;
  /** Currency ID for work reward (default: same as dailyCurrencyId). */
  readonly workCurrencyId: string;
  /** Sector to pay work rewards from (default: "works"). */
  readonly workPaysFromSector: EconomySector;
  /** Optional failure chance (0-1, default 0.10). */
  readonly workFailureChance: number;
}

/** Default work config. */
export const DEFAULT_WORK_CONFIG: WorkConfig = {
  workRewardBase: 120,
  workBaseMintReward: 100,
  workBonusFromWorksMax: 100,
  workBonusScaleMode: "flat",
  workCooldownMinutes: 30,
  workDailyCap: 5,
  workCurrencyId: DEFAULT_DAILY_CONFIG.dailyCurrencyId,
  workPaysFromSector: "works",
  workFailureChance: 0.1,
};

/** Feature flags for high-risk economy systems (runtime kill switches). */
export interface EconomyFeatureFlags {
  /** Coinflip minigame enabled (default: true) */
  readonly coinflip: boolean;
  /** Trivia minigame enabled (default: true) */
  readonly trivia: boolean;
  /** Rob minigame enabled (default: true) */
  readonly rob: boolean;
  /** Voting system enabled (default: true) */
  readonly voting: boolean;
  /** Crafting system enabled (default: true) */
  readonly crafting: boolean;
  /** Store system enabled (default: true) */
  readonly store: boolean;
}

/** Default feature flags (all enabled). */
export const DEFAULT_FEATURE_FLAGS: EconomyFeatureFlags = {
  coinflip: true,
  trivia: true,
  rob: true,
  voting: true,
  crafting: true,
  store: true,
};

/** Guild economy configuration stored per guild. */
export interface GuildEconomyConfig {
  readonly guildId: GuildId;
  readonly sectors: SectorBalances;
  readonly tax: TaxConfig;
  readonly thresholds: TransferThresholds;
  readonly daily: DailyConfig;
  readonly work: WorkConfig;
  readonly progression: ProgressionConfig;
  readonly features: EconomyFeatureFlags;
  readonly updatedAt: Date;
  readonly version: number;
}

/** Operation types that can be taxed. */
export type TaxableOperationType =
  | "transfer"
  | "store_purchase"
  | "store_sell"
  | "works_reward";

/** Default XP configuration per guild. */
export const DEFAULT_PROGRESSION_CONFIG: ProgressionConfig = {
  enabled: true,
  xpAmounts: {
    daily_claim: 60,
    work_claim: 25,
    store_buy: 15,
    store_sell: 10,
    quest_complete: 120,
    craft: 10,
  },
  cooldownSeconds: {
    daily_claim: 0,
    work_claim: 0,
    store_buy: 15,
    store_sell: 15,
    quest_complete: 0,
    craft: 0,
  },
};

/** Input for depositing to a sector. */
export interface DepositToSectorInput {
  readonly guildId: GuildId;
  readonly sector: EconomySector;
  readonly amount: number;
  readonly source: string;
  readonly reason?: string;
}

/** Input for withdrawing from a sector. */
export interface WithdrawFromSectorInput {
  readonly guildId: GuildId;
  readonly sector: EconomySector;
  readonly amount: number;
  readonly source: string;
  readonly reason?: string;
}

/** Result of a sector balance operation. */
export interface SectorBalanceResult {
  readonly guildId: GuildId;
  readonly sector: EconomySector;
  readonly before: number;
  readonly after: number;
  readonly delta: number;
  readonly timestamp: Date;
}

/** Error codes for guild economy operations. */
export type GuildEconomyErrorCode =
  | "GUILD_NOT_FOUND"
  | "INSUFFICIENT_FUNDS"
  | "INVALID_SECTOR"
  | "INVALID_AMOUNT"
  | "INVALID_TAX_RATE"
  | "UPDATE_FAILED"
  | "CONFIG_NOT_FOUND";

/** Error class for guild economy operations. */
export class GuildEconomyError extends Error {
  constructor(
    public readonly code: GuildEconomyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GuildEconomyError";
  }
}

/** Large transfer alert data. */
export interface LargeTransferAlert {
  readonly level: TransferAlertLevel;
  readonly amount: number;
  readonly senderId: string;
  readonly recipientId: string;
  readonly currencyId: CurrencyId;
  readonly guildId: GuildId;
  readonly timestamp: Date;
  readonly message: string;
}

/** Check if an amount triggers a large transfer alert. */
export function checkTransferThreshold(
  amount: number,
  thresholds: TransferThresholds,
): TransferAlertLevel {
  if (amount >= thresholds.critical) return "critical";
  if (amount >= thresholds.alert) return "alert";
  if (amount >= thresholds.warning) return "warning";
  return "none";
}

/** Build alert message for large transfer. */
export function buildTransferAlertMessage(
  level: TransferAlertLevel,
  amount: number,
  currencyId: CurrencyId,
  senderId: string,
  recipientId: string,
): string {
  const emojis: Record<TransferAlertLevel, string> = {
    none: "",
    warning: "⚠️",
    alert: "🚨",
    critical: "🔴",
  };

  const titles: Record<TransferAlertLevel, string> = {
    none: "",
    warning: "Transferencia significativa",
    alert: "Gran transferencia detectada",
    critical: "Mass transfer - Requires attention",
  };

  if (level === "none") return "";

  return (
    `${emojis[level]} **${titles[level]}**\n` +
    `💰 Monto: ${amount.toLocaleString()} ${currencyId}\n` +
    `👤 De: <@${senderId}>\n` +
    `👥 Para: <@${recipientId}>`
  );
}

