/**
 * Ops Config Repository.
 *
 * Purpose: Persist and query GuildOpsConfig.
 * Context: MongoDB storage for per-guild operations configuration.
 */

import { z } from "zod";
import { MongoStore } from "@/db/mongo-store";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { GuildOpsConfig, UpdateOpsConfigInput } from "./types";
import { DEFAULT_GUILD_OPS_CONFIG } from "./types";
import type { GuildId } from "@/db/types";

/** Zod schema for ops config validation. */
const GuildOpsConfigSchema = z.object({
  _id: z.string(),
  guildId: z.string(),
  economyOpsEnabled: z.boolean().catch(DEFAULT_GUILD_OPS_CONFIG.economyOpsEnabled),
  opsChannelId: z.string().nullable().catch(DEFAULT_GUILD_OPS_CONFIG.opsChannelId),
  dailyReportEnabled: z.boolean().catch(DEFAULT_GUILD_OPS_CONFIG.dailyReportEnabled),
  dailyReportHourLocal: z.number().int().min(0).max(23).catch(DEFAULT_GUILD_OPS_CONFIG.dailyReportHourLocal),
  reportWindowDays: z.number().int().min(1).max(30).catch(DEFAULT_GUILD_OPS_CONFIG.reportWindowDays),
  softLaunchMode: z.boolean().catch(DEFAULT_GUILD_OPS_CONFIG.softLaunchMode),
  updatedAt: z.date().catch(() => new Date()),
  version: z.number().int().catch(DEFAULT_GUILD_OPS_CONFIG.version),
});

/** Ops config store singleton. */
const OpsConfigStore = new MongoStore<GuildOpsConfig>("guild_ops_config", GuildOpsConfigSchema);

/** Repository interface for ops config. */
export interface OpsConfigRepo {
  /** Get or create ops config for a guild. */
  get(guildId: GuildId): Promise<Result<GuildOpsConfig, Error>>;
  
  /** Update ops config for a guild. */
  update(guildId: GuildId, input: UpdateOpsConfigInput): Promise<Result<GuildOpsConfig, Error>>;
  
  /** List all guilds with ops enabled (for scheduled reports). */
  listWithDailyReports(): Promise<Result<GuildOpsConfig[], Error>>;
  
  /** Check if ops config exists. */
  exists(guildId: GuildId): Promise<Result<boolean, Error>>;
  
  /** Delete ops config (cleanup). */
  delete(guildId: GuildId): Promise<Result<boolean, Error>>;
}

class OpsConfigRepoImpl implements OpsConfigRepo {
  async get(guildId: GuildId): Promise<Result<GuildOpsConfig, Error>> {
    try {
      const result = await OpsConfigStore.get(guildId);
      if (result.isOk() && result.unwrap()) {
        return OkResult(result.unwrap()!);
      }

      // Create default config
      const defaultConfig: GuildOpsConfig = {
        ...DEFAULT_GUILD_OPS_CONFIG,
        _id: guildId,
        guildId,
        updatedAt: new Date(),
      };

      const createResult = await OpsConfigStore.set(guildId, defaultConfig);
      if (createResult.isErr()) {
        return ErrResult(createResult.error);
      }

      return OkResult(defaultConfig);
    } catch (error) {
      console.error("[OpsConfigRepo] Failed to get ops config:", error);
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async update(guildId: GuildId, input: UpdateOpsConfigInput): Promise<Result<GuildOpsConfig, Error>> {
    try {
      const currentResult = await this.get(guildId);
      if (currentResult.isErr()) return ErrResult(currentResult.error);

      const current = currentResult.unwrap();
      const updated: GuildOpsConfig = {
        ...current,
        ...(input.economyOpsEnabled !== undefined && { economyOpsEnabled: input.economyOpsEnabled }),
        ...(input.opsChannelId !== undefined && { opsChannelId: input.opsChannelId }),
        ...(input.dailyReportEnabled !== undefined && { dailyReportEnabled: input.dailyReportEnabled }),
        ...(input.dailyReportHourLocal !== undefined && { dailyReportHourLocal: input.dailyReportHourLocal }),
        ...(input.reportWindowDays !== undefined && { reportWindowDays: input.reportWindowDays }),
        ...(input.softLaunchMode !== undefined && { softLaunchMode: input.softLaunchMode }),
        updatedAt: new Date(),
      };

      const result = await OpsConfigStore.set(guildId, updated);
      if (result.isErr()) return ErrResult(result.error);

      return OkResult(updated);
    } catch (error) {
      console.error("[OpsConfigRepo] Failed to update ops config:", error);
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async listWithDailyReports(): Promise<Result<GuildOpsConfig[], Error>> {
    try {
      const col = await OpsConfigStore.collection();
      const configs = await col
        .find({
          economyOpsEnabled: true,
          dailyReportEnabled: true,
          opsChannelId: { $ne: null },
        } as any)
        .toArray();
      
      return OkResult(configs as GuildOpsConfig[]);
    } catch (error) {
      console.error("[OpsConfigRepo] Failed to list configs with daily reports:", error);
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async exists(guildId: GuildId): Promise<Result<boolean, Error>> {
    try {
      const result = await OpsConfigStore.get(guildId);
      if (result.isErr()) return ErrResult(result.error);
      return OkResult(result.unwrap() !== null);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async delete(guildId: GuildId): Promise<Result<boolean, Error>> {
    try {
      const result = await OpsConfigStore.delete(guildId);
      if (result.isErr()) return ErrResult(result.error);
      return OkResult(result.unwrap());
    } catch (error) {
      console.error("[OpsConfigRepo] Failed to delete ops config:", error);
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/** Ensure indexes exist for ops config collection. */
export async function ensureOpsConfigIndexes(): Promise<void> {
  try {
    const col = await OpsConfigStore.collection();
    
    // Index for querying enabled daily reports
    await col.createIndex(
      { economyOpsEnabled: 1, dailyReportEnabled: 1, opsChannelId: 1 },
      { name: "daily_reports_idx" },
    );

    console.log("[OpsConfig] Indexes ensured");
  } catch (error) {
    console.error("[OpsConfig] Failed to ensure indexes:", error);
  }
}

/** Singleton instance. */
export const opsConfigRepo: OpsConfigRepo = new OpsConfigRepoImpl();
