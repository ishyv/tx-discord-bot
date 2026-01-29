/**
 * Guild Economy Service.
 *
 * Purpose: High-level guild economy operations including tax calculation,
 * sector management, and large transfer alerts.
 */

import type { GuildId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { CurrencyId } from "../currency";
import { guildEconomyRepo } from "./repository";
import {
  type GuildEconomyConfig,
  type TaxResult,
  type TaxableOperationType,
  type EconomySector,
  type LargeTransferAlert,
  type DepositToSectorInput,
  type WithdrawFromSectorInput,
  type SectorBalanceResult,
  TaxConfig,
  TransferThresholds,
  checkTransferThreshold,
  buildTransferAlertMessage,
  GuildEconomyError,
} from "./types";

/** Calculate tax for a given amount based on guild config. */
export function calculateTax(
  amount: number,
  config: TaxConfig,
): TaxResult {
  // Check if tax applies
  if (!config.enabled || amount < config.minimumTaxableAmount) {
    return {
      net: amount,
      tax: 0,
      rate: 0,
      taxed: false,
      depositedTo: null,
    };
  }

  const tax = Math.floor(amount * config.rate);
  const net = amount - tax;

  return {
    net,
    tax,
    rate: config.rate,
    taxed: true,
    depositedTo: config.taxSector,
  };
}

export interface GuildEconomyService {
  /**
   * Get or create guild economy config.
   */
  getConfig(guildId: GuildId): Promise<Result<GuildEconomyConfig, Error>>;

  /**
   * Apply tax to an amount and optionally deposit to guild.
   * Returns the net amount after tax.
   */
  applyTax(
    guildId: GuildId,
    operationType: TaxableOperationType,
    amount: number,
    options?: {
      depositToGuild?: boolean;
      source?: string;
    },
  ): Promise<Result<TaxResult, Error>>;

  /**
   * Check if a transfer triggers a large transfer alert.
   */
  checkLargeTransfer(
    guildId: GuildId,
    amount: number,
    currencyId: CurrencyId,
    senderId: string,
    recipientId: string,
  ): Promise<Result<LargeTransferAlert | null, Error>>;

  /**
   * Deposit funds to a guild sector.
   */
  depositToSector(
    input: DepositToSectorInput,
  ): Promise<Result<SectorBalanceResult, Error>>;

  /**
   * Withdraw funds from a guild sector.
   */
  withdrawFromSector(
    input: WithdrawFromSectorInput,
  ): Promise<Result<SectorBalanceResult, Error>>;

  /**
   * Get balance for a specific sector.
   */
  getSectorBalance(
    guildId: GuildId,
    sector: EconomySector,
  ): Promise<Result<number, Error>>;

  /**
   * Get all sector balances.
   */
  getAllSectorBalances(
    guildId: GuildId,
  ): Promise<Result<Record<EconomySector, number>, Error>>;

  /**
   * Update tax configuration (admin only).
   */
  updateTaxConfig(
    guildId: GuildId,
    config: Partial<TaxConfig>,
  ): Promise<Result<GuildEconomyConfig, Error>>;

  /**
   * Update transfer thresholds (admin only).
   */
  updateThresholds(
    guildId: GuildId,
    thresholds: Partial<TransferThresholds>,
  ): Promise<Result<GuildEconomyConfig, Error>>;

  /**
   * Transfer funds between sectors within a guild.
   */
  transferBetweenSectors(
    guildId: GuildId,
    from: EconomySector,
    to: EconomySector,
    amount: number,
    reason?: string,
  ): Promise<Result<{ from: SectorBalanceResult; to: SectorBalanceResult }, Error>>;
}

class GuildEconomyServiceImpl implements GuildEconomyService {
  async getConfig(guildId: GuildId): Promise<Result<GuildEconomyConfig, Error>> {
    return guildEconomyRepo.ensure(guildId);
  }

  async applyTax(
    guildId: GuildId,
    _operationType: TaxableOperationType,
    amount: number,
    options?: {
      depositToGuild?: boolean;
      source?: string;
    },
  ): Promise<Result<TaxResult, Error>> {
    const configResult = await guildEconomyRepo.ensure(guildId);
    if (configResult.isErr()) {
      return ErrResult(configResult.error);
    }

    const config = configResult.unwrap();
    const taxResult = calculateTax(amount, config.tax);

    // If tax was applied and depositToGuild is true, deposit the tax
    if (taxResult.taxed && taxResult.tax > 0 && options?.depositToGuild !== false) {
      const depositResult = await guildEconomyRepo.depositToSector(
        guildId,
        taxResult.depositedTo!,
        taxResult.tax,
      );

      if (depositResult.isErr()) {
        console.error("[GuildEconomyService] Failed to deposit tax:", depositResult.error);
        // Don't fail the operation, but log the error
      }
    }

    return OkResult(taxResult);
  }

  async checkLargeTransfer(
    guildId: GuildId,
    amount: number,
    currencyId: CurrencyId,
    senderId: string,
    recipientId: string,
  ): Promise<Result<LargeTransferAlert | null, Error>> {
    const configResult = await guildEconomyRepo.ensure(guildId);
    if (configResult.isErr()) {
      return ErrResult(configResult.error);
    }

    const config = configResult.unwrap();
    const level = checkTransferThreshold(amount, config.thresholds);

    if (level === "none") {
      return OkResult(null);
    }

    const message = buildTransferAlertMessage(level, amount, currencyId, senderId, recipientId);

    return OkResult({
      level,
      amount,
      senderId,
      recipientId,
      currencyId,
      guildId,
      timestamp: new Date(),
      message,
    });
  }

  async depositToSector(
    input: DepositToSectorInput,
  ): Promise<Result<SectorBalanceResult, Error>> {
    const { guildId, sector, amount } = input;

    // Get current balance before
    const beforeResult = await guildEconomyRepo.findByGuildId(guildId);
    if (beforeResult.isErr()) {
      return ErrResult(beforeResult.error);
    }

    const beforeConfig = beforeResult.unwrap();
    const before = beforeConfig?.sectors[sector] ?? 0;

    const result = await guildEconomyRepo.depositToSector(guildId, sector, amount);
    if (result.isErr()) {
      return ErrResult(result.error);
    }

    const config = result.unwrap();
    const after = config.sectors[sector];

    return OkResult({
      guildId,
      sector,
      before,
      after,
      delta: amount,
      timestamp: new Date(),
    });
  }

  async withdrawFromSector(
    input: WithdrawFromSectorInput,
  ): Promise<Result<SectorBalanceResult, Error>> {
    const { guildId, sector, amount } = input;

    // Get current balance before
    const beforeResult = await guildEconomyRepo.findByGuildId(guildId);
    if (beforeResult.isErr()) {
      return ErrResult(beforeResult.error);
    }

    const beforeConfig = beforeResult.unwrap();
    const before = beforeConfig?.sectors[sector] ?? 0;

    const result = await guildEconomyRepo.withdrawFromSector(guildId, sector, amount);
    if (result.isErr()) {
      return ErrResult(result.error);
    }

    const config = result.unwrap();
    const after = config.sectors[sector];

    return OkResult({
      guildId,
      sector,
      before,
      after,
      delta: -amount,
      timestamp: new Date(),
    });
  }

  async getSectorBalance(
    guildId: GuildId,
    sector: EconomySector,
  ): Promise<Result<number, Error>> {
    const result = await guildEconomyRepo.findByGuildId(guildId);
    if (result.isErr()) {
      return ErrResult(result.error);
    }

    const config = result.unwrap();
    if (!config) {
      return OkResult(0);
    }

    return OkResult(config.sectors[sector]);
  }

  async getAllSectorBalances(
    guildId: GuildId,
  ): Promise<Result<Record<EconomySector, number>, Error>> {
    const result = await guildEconomyRepo.ensure(guildId);
    if (result.isErr()) {
      return ErrResult(result.error);
    }

    return OkResult(result.unwrap().sectors);
  }

  async updateTaxConfig(
    guildId: GuildId,
    config: Partial<TaxConfig>,
  ): Promise<Result<GuildEconomyConfig, Error>> {
    return guildEconomyRepo.updateTaxConfig(guildId, config);
  }

  async updateThresholds(
    guildId: GuildId,
    thresholds: Partial<TransferThresholds>,
  ): Promise<Result<GuildEconomyConfig, Error>> {
    return guildEconomyRepo.updateThresholds(guildId, thresholds);
  }

  async transferBetweenSectors(
    guildId: GuildId,
    from: EconomySector,
    to: EconomySector,
    amount: number,
    reason?: string,
  ): Promise<Result<{ from: SectorBalanceResult; to: SectorBalanceResult }, Error>> {
    if (from === to) {
      return ErrResult(new GuildEconomyError("INVALID_SECTOR", "Cannot transfer to same sector"));
    }

    // First, withdraw from source
    const withdrawResult = await this.withdrawFromSector({
      guildId,
      sector: from,
      amount,
      source: "sector_transfer",
      reason,
    });

    if (withdrawResult.isErr()) {
      return ErrResult(withdrawResult.error);
    }

    // Then deposit to destination
    const depositResult = await this.depositToSector({
      guildId,
      sector: to,
      amount,
      source: "sector_transfer",
      reason,
    });

    if (depositResult.isErr()) {
      // This is bad - we withdrew but couldn't deposit
      // Try to refund the source (best effort)
      await guildEconomyRepo.depositToSector(guildId, from, amount);
      return ErrResult(depositResult.error);
    }

    return OkResult({
      from: withdrawResult.unwrap(),
      to: depositResult.unwrap(),
    });
  }
}

/** Singleton instance. */
export const guildEconomyService: GuildEconomyService = new GuildEconomyServiceImpl();
