/**
 * Guild Economy Types.
 *
 * Purpose: Define guild treasury sectors, tax configuration, and economy settings.
 */

import type { CurrencyId } from "../currency";
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

/** Guild economy configuration stored per guild. */
export interface GuildEconomyConfig {
  readonly guildId: GuildId;
  readonly sectors: SectorBalances;
  readonly tax: TaxConfig;
  readonly thresholds: TransferThresholds;
  readonly updatedAt: Date;
  readonly version: number;
}

/** Operation types that can be taxed. */
export type TaxableOperationType = "transfer" | "store_purchase" | "store_sell" | "works_reward";

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
    critical: "Transferencia masiva - Requiere atención",
  };

  if (level === "none") return "";

  return (
    `${emojis[level]} **${titles[level]}**\n` +
    `💰 Monto: ${amount.toLocaleString()} ${currencyId}\n` +
    `👤 De: <@${senderId}>\n` +
    `👥 Para: <@${recipientId}>`
  );
}
