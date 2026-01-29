/**
 * Guild Economy Repository.
 *
 * Purpose: Persist and retrieve guild economy configuration and sector balances.
 * Encaje: Uses GuildStore for persistence with economy-specific subdocument.
 */

import { z } from "zod";
import { GuildStore } from "@/db/repositories/guilds";
import type { GuildId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import {
  type GuildEconomyConfig,
  type TaxConfig,
  type TransferThresholds,
  type EconomySector,
  type SectorBalances,
  type DailyConfig,
  DEFAULT_SECTOR_BALANCES,
  DEFAULT_TAX_CONFIG,
  DEFAULT_TRANSFER_THRESHOLDS,
  DEFAULT_DAILY_CONFIG,
  GuildEconomyError,
} from "./types";

/** Zod schema for guild economy data (stored as subdocument in guild). */
export const GuildEconomyDataSchema = z.object({
  sectors: z.object({
    global: z.number().catch(0),
    works: z.number().catch(0),
    trade: z.number().catch(0),
    tax: z.number().catch(0),
  }),
  tax: z.object({
    rate: z.number().min(0).max(1).catch(0.05),
    enabled: z.boolean().catch(true),
    minimumTaxableAmount: z.number().min(0).catch(0),
    taxSector: z.enum(["global", "works", "trade", "tax"]).catch("tax"),
  }),
  thresholds: z.object({
    warning: z.number().catch(100_000),
    alert: z.number().catch(1_000_000),
    critical: z.number().catch(10_000_000),
  }),
  daily: z
    .object({
      dailyReward: z.number().min(0).catch(250),
      dailyCooldownHours: z.number().min(0).max(168).catch(24),
      dailyCurrencyId: z.string().catch("coins"),
    })
    .catch(() => ({
      dailyReward: 250,
      dailyCooldownHours: 24,
      dailyCurrencyId: "coins",
    })),
  updatedAt: z.date().catch(() => new Date()),
  version: z.number().catch(0),
});

export type GuildEconomyData = z.infer<typeof GuildEconomyDataSchema>;

/** Convert DB data to domain model. */
function toDomain(guildId: string, data: GuildEconomyData): GuildEconomyConfig {
  const daily = data.daily ?? DEFAULT_DAILY_CONFIG;
  return {
    guildId,
    sectors: data.sectors as SectorBalances,
    tax: data.tax as TaxConfig,
    thresholds: data.thresholds as TransferThresholds,
    daily: daily as DailyConfig,
    updatedAt: data.updatedAt,
    version: data.version,
  };
}

/** Build DB data from domain model - kept for future use */
// function toData(config: GuildEconomyConfig): GuildEconomyData {
//   return {
//     sectors: config.sectors,
//     tax: config.tax,
//     thresholds: config.thresholds,
//     updatedAt: config.updatedAt,
//     version: config.version,
//   };
// }

/** Get default economy data for new guilds. */
function getDefaultData(): GuildEconomyData {
  return {
    sectors: { ...DEFAULT_SECTOR_BALANCES },
    tax: { ...DEFAULT_TAX_CONFIG },
    thresholds: { ...DEFAULT_TRANSFER_THRESHOLDS },
    daily: { ...DEFAULT_DAILY_CONFIG },
    updatedAt: new Date(),
    version: 0,
  };
}

export interface GuildEconomyRepo {
  /**
   * Find economy config for a guild.
   * Returns null if guild exists but has no economy config.
   */
  findByGuildId(guildId: GuildId): Promise<Result<GuildEconomyConfig | null, Error>>;

  /**
   * Ensure economy config exists, creating with defaults if needed.
   */
  ensure(guildId: GuildId): Promise<Result<GuildEconomyConfig, Error>>;

  /**
   * Update sector balance with optimistic concurrency.
   */
  updateSectorBalance(
    guildId: GuildId,
    sector: EconomySector,
    delta: number,
    expectedVersion: number,
  ): Promise<Result<GuildEconomyConfig | null, Error>>;

  /**
   * Update tax configuration.
   */
  updateTaxConfig(
    guildId: GuildId,
    tax: Partial<TaxConfig>,
  ): Promise<Result<GuildEconomyConfig, Error>>;

  /**
   * Update transfer thresholds.
   */
  updateThresholds(
    guildId: GuildId,
    thresholds: Partial<TransferThresholds>,
  ): Promise<Result<GuildEconomyConfig, Error>>;

  /**
   * Update daily claim configuration.
   */
  updateDailyConfig(
    guildId: GuildId,
    daily: Partial<DailyConfig>,
  ): Promise<Result<GuildEconomyConfig, Error>>;

  /**
   * Atomically deposit to a sector (increment).
   */
  depositToSector(
    guildId: GuildId,
    sector: EconomySector,
    amount: number,
  ): Promise<Result<GuildEconomyConfig, Error>>;

  /**
   * Atomically withdraw from a sector (decrement).
   * Fails if insufficient funds.
   */
  withdrawFromSector(
    guildId: GuildId,
    sector: EconomySector,
    amount: number,
  ): Promise<Result<GuildEconomyConfig, Error>>;
}

class GuildEconomyRepoImpl implements GuildEconomyRepo {
  async findByGuildId(guildId: GuildId): Promise<Result<GuildEconomyConfig | null, Error>> {
    const guildResult = await GuildStore.get(guildId);
    if (guildResult.isErr()) {
      return ErrResult(guildResult.error);
    }

    const guild = guildResult.unwrap();
    if (!guild) {
      return OkResult(null);
    }

    const raw = (guild as any).economy;
    if (!raw) {
      return OkResult(null);
    }

    const parsed = GuildEconomyDataSchema.safeParse(raw);
    if (!parsed.success) {
      // Auto-repair with defaults
      console.warn(`[GuildEconomyRepo] Invalid economy data for guild ${guildId}, using defaults`);
      const defaults = getDefaultData();
      return OkResult(toDomain(guildId, defaults));
    }

    return OkResult(toDomain(guildId, parsed.data));
  }

  async ensure(guildId: GuildId): Promise<Result<GuildEconomyConfig, Error>> {
    // First ensure guild exists
    const guildResult = await GuildStore.ensure(guildId);
    if (guildResult.isErr()) {
      return ErrResult(guildResult.error);
    }

    const existing = await this.findByGuildId(guildId);
    if (existing.isErr()) {
      return ErrResult(existing.error);
    }

    if (existing.unwrap()) {
      return OkResult(existing.unwrap()!);
    }

    // Need to create new config
    const defaults = getDefaultData();

    try {
      const col = await GuildStore.collection();
      const now = new Date();

      await col.updateOne(
        { _id: guildId } as any,
        {
          $set: {
            economy: defaults,
            updatedAt: now,
          },
        } as any,
        { upsert: false },
      );

      return OkResult(toDomain(guildId, defaults));
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async updateSectorBalance(
    guildId: GuildId,
    sector: EconomySector,
    delta: number,
    expectedVersion: number,
  ): Promise<Result<GuildEconomyConfig | null, Error>> {
    const current = await this.findByGuildId(guildId);
    if (current.isErr()) return ErrResult(current.error);

    const config = current.unwrap();
    if (!config) {
      return ErrResult(new GuildEconomyError("CONFIG_NOT_FOUND", "Economy config not found"));
    }

    if (config.version !== expectedVersion) {
      return OkResult(null); // Concurrent modification
    }

    const currentBalance = config.sectors[sector];
    const newBalance = Math.max(0, currentBalance + delta);

    try {
      const col = await GuildStore.collection();
      const now = new Date();

      const result = await col.findOneAndUpdate(
        { _id: guildId, "economy.version": expectedVersion } as any,
        {
          $set: {
            [`economy.sectors.${sector}`]: newBalance,
            "economy.updatedAt": now,
          },
          $inc: { "economy.version": 1 } as any,
        } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return OkResult(null); // Version mismatch
      }

      const raw = (result as any).economy;
      return OkResult(toDomain(guildId, raw));
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async updateTaxConfig(
    guildId: GuildId,
    tax: Partial<TaxConfig>,
  ): Promise<Result<GuildEconomyConfig, Error>> {
    const ensureResult = await this.ensure(guildId);
    if (ensureResult.isErr()) return ErrResult(ensureResult.error);

    try {
      const col = await GuildStore.collection();
      const now = new Date();

      const setPaths: Record<string, unknown> = {
        "economy.updatedAt": now,
      };

      if (tax.rate !== undefined) setPaths["economy.tax.rate"] = Math.max(0, Math.min(1, tax.rate));
      if (tax.enabled !== undefined) setPaths["economy.tax.enabled"] = tax.enabled;
      if (tax.minimumTaxableAmount !== undefined) {
        setPaths["economy.tax.minimumTaxableAmount"] = Math.max(0, tax.minimumTaxableAmount);
      }
      if (tax.taxSector !== undefined) setPaths["economy.tax.taxSector"] = tax.taxSector;

      const result = await col.findOneAndUpdate(
        { _id: guildId } as any,
        { $set: setPaths } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(new GuildEconomyError("GUILD_NOT_FOUND", "Guild not found"));
      }

      const raw = (result as any).economy;
      return OkResult(toDomain(guildId, raw));
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async updateThresholds(
    guildId: GuildId,
    thresholds: Partial<TransferThresholds>,
  ): Promise<Result<GuildEconomyConfig, Error>> {
    const ensureResult = await this.ensure(guildId);
    if (ensureResult.isErr()) return ErrResult(ensureResult.error);

    try {
      const col = await GuildStore.collection();
      const now = new Date();

      const setPaths: Record<string, unknown> = {
        "economy.updatedAt": now,
      };

      if (thresholds.warning !== undefined) {
        setPaths["economy.thresholds.warning"] = Math.max(0, thresholds.warning);
      }
      if (thresholds.alert !== undefined) {
        setPaths["economy.thresholds.alert"] = Math.max(0, thresholds.alert);
      }
      if (thresholds.critical !== undefined) {
        setPaths["economy.thresholds.critical"] = Math.max(0, thresholds.critical);
      }

      const result = await col.findOneAndUpdate(
        { _id: guildId } as any,
        { $set: setPaths } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(new GuildEconomyError("GUILD_NOT_FOUND", "Guild not found"));
      }

      const raw = (result as any).economy;
      return OkResult(toDomain(guildId, raw));
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async updateDailyConfig(
    guildId: GuildId,
    daily: Partial<DailyConfig>,
  ): Promise<Result<GuildEconomyConfig, Error>> {
    const ensureResult = await this.ensure(guildId);
    if (ensureResult.isErr()) return ErrResult(ensureResult.error);

    try {
      const col = await GuildStore.collection();
      const now = new Date();
      const setPaths: Record<string, unknown> = {
        "economy.updatedAt": now,
      };
      if (daily.dailyReward !== undefined) {
        setPaths["economy.daily.dailyReward"] = Math.max(0, daily.dailyReward);
      }
      if (daily.dailyCooldownHours !== undefined) {
        setPaths["economy.daily.dailyCooldownHours"] = Math.max(
          0,
          Math.min(168, daily.dailyCooldownHours),
        );
      }
      if (daily.dailyCurrencyId !== undefined) {
        setPaths["economy.daily.dailyCurrencyId"] = daily.dailyCurrencyId;
      }

      const result = await col.findOneAndUpdate(
        { _id: guildId } as any,
        { $set: setPaths } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(new GuildEconomyError("GUILD_NOT_FOUND", "Guild not found"));
      }

      const raw = (result as any).economy;
      return OkResult(toDomain(guildId, raw));
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async depositToSector(
    guildId: GuildId,
    sector: EconomySector,
    amount: number,
  ): Promise<Result<GuildEconomyConfig, Error>> {
    if (!Number.isFinite(amount) || amount <= 0) {
      return ErrResult(new GuildEconomyError("INVALID_AMOUNT", "Amount must be positive"));
    }

    const ensureResult = await this.ensure(guildId);
    if (ensureResult.isErr()) return ErrResult(ensureResult.error);

    try {
      const col = await GuildStore.collection();
      const now = new Date();

      const result = await col.findOneAndUpdate(
        { _id: guildId } as any,
        {
          $inc: { [`economy.sectors.${sector}`]: amount } as any,
          $set: {
            "economy.updatedAt": now,
          },
        } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(new GuildEconomyError("GUILD_NOT_FOUND", "Guild not found"));
      }

      const raw = (result as any).economy;
      return OkResult(toDomain(guildId, raw));
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async withdrawFromSector(
    guildId: GuildId,
    sector: EconomySector,
    amount: number,
  ): Promise<Result<GuildEconomyConfig, Error>> {
    if (!Number.isFinite(amount) || amount <= 0) {
      return ErrResult(new GuildEconomyError("INVALID_AMOUNT", "Amount must be positive"));
    }

    const ensureResult = await this.ensure(guildId);
    if (ensureResult.isErr()) return ErrResult(ensureResult.error);

    const config = ensureResult.unwrap();
    if (config.sectors[sector] < amount) {
      return ErrResult(new GuildEconomyError("INSUFFICIENT_FUNDS", "Sector has insufficient funds"));
    }

    try {
      const col = await GuildStore.collection();
      const now = new Date();

      const result = await col.findOneAndUpdate(
        { _id: guildId, [`economy.sectors.${sector}`]: { $gte: amount } } as any,
        {
          $inc: { [`economy.sectors.${sector}`]: -amount } as any,
          $set: {
            "economy.updatedAt": now,
          },
        } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(new GuildEconomyError("INSUFFICIENT_FUNDS", "Sector has insufficient funds"));
      }

      const raw = (result as any).economy;
      return OkResult(toDomain(guildId, raw));
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/** Singleton instance. */
export const guildEconomyRepo: GuildEconomyRepo = new GuildEconomyRepoImpl();
