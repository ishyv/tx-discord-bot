/**
 * RPG Config Repository.
 *
 * Purpose: Persist and retrieve guild RPG configuration.
 * Encaje: Uses GuildStore for persistence with RPG-specific subdocument.
 */

import { z } from "zod";
import { GuildStore } from "@/db/repositories/guilds";
import type { GuildId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type {
  RpgConfig,
  RpgCombatConfig,
  RpgProcessingConfig,
  RpgGatheringConfig,
  RpgUpgradeConfig,
} from "./types";
import {
  DEFAULT_RPG_CONFIG,
  toDomain,
} from "./defaults";

/** Zod schema for RPG config data (stored as subdocument in guild). */
export const RpgConfigDataSchema = z.object({
  enabled: z.boolean().catch(true),
  combat: z.object({
    critChance: z.number().min(0).max(1).catch(0.15),
    blockChance: z.number().min(0).max(1).catch(0.25),
    varianceMin: z.number().min(0).max(1).catch(0.85),
    varianceMax: z.number().min(0).max(1).catch(1.15),
    defenseReductionMin: z.number().min(0).max(1).catch(0.1),
    defenseReductionMax: z.number().min(0).max(1).catch(0.5),
    timeoutSeconds: z.number().int().min(30).catch(300),
  }).catch(() => ({ ...DEFAULT_RPG_CONFIG.combat })),
  processing: z.object({
    baseSuccessChance: z.number().min(0).max(1).catch(0.6),
    luckCap: z.number().min(0).max(1).catch(0.25),
    feePercent: z.number().min(0).max(1).catch(0.05),
    minFee: z.number().int().min(0).catch(5),
    maxFee: z.number().int().min(0).catch(100),
  }).catch(() => ({ ...DEFAULT_RPG_CONFIG.processing })),
  gathering: z.object({
    durabilityMin: z.number().int().min(1).catch(8),
    durabilityMax: z.number().int().min(1).catch(12),
    yieldMin: z.number().int().min(1).catch(1),
    yieldMax: z.number().int().min(1).catch(3),
    tierBonusPerLevel: z.number().min(0).catch(0.5),
  }).catch(() => ({ ...DEFAULT_RPG_CONFIG.gathering })),
  upgrades: z.object({
    costs: z.record(z.string(), z.object({
      money: z.number().int().min(0),
      materials: z.array(z.object({
        id: z.string(),
        quantity: z.number().int().min(1),
      })),
    })).catch(() => ({ ...DEFAULT_RPG_CONFIG.upgrades.costs })),
    maxTier: z.number().int().min(1).max(10).catch(4),
    resetDurabilityOnUpgrade: z.boolean().catch(true),
  }).catch(() => ({ ...DEFAULT_RPG_CONFIG.upgrades })),
  updatedAt: z.date().catch(() => new Date()),
});

export type RpgConfigData = z.infer<typeof RpgConfigDataSchema>;

/** Repository implementation. */
export const rpgConfigRepo = {
  /**
   * Ensure RPG config exists for guild (creates defaults if missing).
   */
  async ensure(guildId: GuildId): Promise<Result<RpgConfig, Error>> {
    try {
      const col = await GuildStore.collection();
      const now = new Date();

      // Try to find existing
      const existing = await col.findOne({ _id: guildId });
      if (existing?.rpg) {
        return OkResult(toDomain(guildId, existing.rpg as RpgConfigData));
      }

      // Create default config
      const defaultData: RpgConfigData = {
        enabled: true,
        combat: { ...DEFAULT_RPG_CONFIG.combat },
        processing: { ...DEFAULT_RPG_CONFIG.processing },
        gathering: { ...DEFAULT_RPG_CONFIG.gathering },
        upgrades: { ...DEFAULT_RPG_CONFIG.upgrades },
        updatedAt: now,
      };

      await col.updateOne(
        { _id: guildId },
        {
          $set: { rpg: defaultData },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );

      return OkResult(toDomain(guildId, defaultData));
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  },

  /**
   * Get RPG config (returns null if not found, does not create).
   */
  async get(guildId: GuildId): Promise<Result<RpgConfig | null, Error>> {
    try {
      const col = await GuildStore.collection();
      const doc = await col.findOne({ _id: guildId });
      if (!doc?.rpg) return OkResult(null);
      return OkResult(toDomain(guildId, doc.rpg as RpgConfigData));
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  },

  /**
   * Update combat configuration.
   */
  async updateCombatConfig(
    guildId: GuildId,
    combat: Partial<RpgCombatConfig>,
  ): Promise<Result<RpgConfig, Error>> {
    const ensureResult = await this.ensure(guildId);
    if (ensureResult.isErr()) return ErrResult(ensureResult.error);

    try {
      const col = await GuildStore.collection();
      const now = new Date();
      const setPaths: Record<string, unknown> = {
        "rpg.updatedAt": now,
      };

      if (combat.critChance !== undefined) {
        setPaths["rpg.combat.critChance"] = Math.max(0, Math.min(1, combat.critChance));
      }
      if (combat.blockChance !== undefined) {
        setPaths["rpg.combat.blockChance"] = Math.max(0, Math.min(1, combat.blockChance));
      }
      if (combat.varianceMin !== undefined) {
        setPaths["rpg.combat.varianceMin"] = Math.max(0, Math.min(1, combat.varianceMin));
      }
      if (combat.varianceMax !== undefined) {
        setPaths["rpg.combat.varianceMax"] = Math.max(0, Math.min(1, combat.varianceMax));
      }
      if (combat.defenseReductionMin !== undefined) {
        setPaths["rpg.combat.defenseReductionMin"] = Math.max(0, Math.min(1, combat.defenseReductionMin));
      }
      if (combat.defenseReductionMax !== undefined) {
        setPaths["rpg.combat.defenseReductionMax"] = Math.max(0, Math.min(1, combat.defenseReductionMax));
      }
      if (combat.timeoutSeconds !== undefined) {
        setPaths["rpg.combat.timeoutSeconds"] = Math.max(30, combat.timeoutSeconds);
      }

      const result = await col.findOneAndUpdate(
        { _id: guildId },
        { $set: setPaths },
        { returnDocument: "after" },
      );

      if (!result?.rpg) {
        return ErrResult(new Error("Failed to update combat config"));
      }

      return OkResult(toDomain(guildId, result.rpg as RpgConfigData));
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  },

  /**
   * Update processing configuration.
   */
  async updateProcessingConfig(
    guildId: GuildId,
    processing: Partial<RpgProcessingConfig>,
  ): Promise<Result<RpgConfig, Error>> {
    const ensureResult = await this.ensure(guildId);
    if (ensureResult.isErr()) return ErrResult(ensureResult.error);

    try {
      const col = await GuildStore.collection();
      const now = new Date();
      const setPaths: Record<string, unknown> = {
        "rpg.updatedAt": now,
      };

      if (processing.baseSuccessChance !== undefined) {
        setPaths["rpg.processing.baseSuccessChance"] = Math.max(0, Math.min(1, processing.baseSuccessChance));
      }
      if (processing.luckCap !== undefined) {
        setPaths["rpg.processing.luckCap"] = Math.max(0, Math.min(1, processing.luckCap));
      }
      if (processing.feePercent !== undefined) {
        setPaths["rpg.processing.feePercent"] = Math.max(0, Math.min(1, processing.feePercent));
      }
      if (processing.minFee !== undefined) {
        setPaths["rpg.processing.minFee"] = Math.max(0, processing.minFee);
      }
      if (processing.maxFee !== undefined) {
        setPaths["rpg.processing.maxFee"] = Math.max(0, processing.maxFee);
      }

      const result = await col.findOneAndUpdate(
        { _id: guildId },
        { $set: setPaths },
        { returnDocument: "after" },
      );

      if (!result?.rpg) {
        return ErrResult(new Error("Failed to update processing config"));
      }

      return OkResult(toDomain(guildId, result.rpg as RpgConfigData));
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  },

  /**
   * Update gathering configuration.
   */
  async updateGatheringConfig(
    guildId: GuildId,
    gathering: Partial<RpgGatheringConfig>,
  ): Promise<Result<RpgConfig, Error>> {
    const ensureResult = await this.ensure(guildId);
    if (ensureResult.isErr()) return ErrResult(ensureResult.error);

    try {
      const col = await GuildStore.collection();
      const now = new Date();
      const setPaths: Record<string, unknown> = {
        "rpg.updatedAt": now,
      };

      if (gathering.durabilityMin !== undefined) {
        setPaths["rpg.gathering.durabilityMin"] = Math.max(1, gathering.durabilityMin);
      }
      if (gathering.durabilityMax !== undefined) {
        setPaths["rpg.gathering.durabilityMax"] = Math.max(1, gathering.durabilityMax);
      }
      if (gathering.yieldMin !== undefined) {
        setPaths["rpg.gathering.yieldMin"] = Math.max(1, gathering.yieldMin);
      }
      if (gathering.yieldMax !== undefined) {
        setPaths["rpg.gathering.yieldMax"] = Math.max(1, gathering.yieldMax);
      }
      if (gathering.tierBonusPerLevel !== undefined) {
        setPaths["rpg.gathering.tierBonusPerLevel"] = Math.max(0, gathering.tierBonusPerLevel);
      }

      const result = await col.findOneAndUpdate(
        { _id: guildId },
        { $set: setPaths },
        { returnDocument: "after" },
      );

      if (!result?.rpg) {
        return ErrResult(new Error("Failed to update gathering config"));
      }

      return OkResult(toDomain(guildId, result.rpg as RpgConfigData));
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  },

  /**
   * Update upgrade configuration.
   */
  async updateUpgradeConfig(
    guildId: GuildId,
    upgrades: Partial<RpgUpgradeConfig>,
  ): Promise<Result<RpgConfig, Error>> {
    const ensureResult = await this.ensure(guildId);
    if (ensureResult.isErr()) return ErrResult(ensureResult.error);

    try {
      const col = await GuildStore.collection();
      const now = new Date();
      const setPaths: Record<string, unknown> = {
        "rpg.updatedAt": now,
      };

      if (upgrades.costs !== undefined) {
        setPaths["rpg.upgrades.costs"] = upgrades.costs;
      }
      if (upgrades.maxTier !== undefined) {
        setPaths["rpg.upgrades.maxTier"] = Math.max(1, Math.min(10, upgrades.maxTier));
      }
      if (upgrades.resetDurabilityOnUpgrade !== undefined) {
        setPaths["rpg.upgrades.resetDurabilityOnUpgrade"] = upgrades.resetDurabilityOnUpgrade;
      }

      const result = await col.findOneAndUpdate(
        { _id: guildId },
        { $set: setPaths },
        { returnDocument: "after" },
      );

      if (!result?.rpg) {
        return ErrResult(new Error("Failed to update upgrade config"));
      }

      return OkResult(toDomain(guildId, result.rpg as RpgConfigData));
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  },

  /**
   * Enable/disable RPG system.
   */
  async setEnabled(guildId: GuildId, enabled: boolean): Promise<Result<RpgConfig, Error>> {
    const ensureResult = await this.ensure(guildId);
    if (ensureResult.isErr()) return ErrResult(ensureResult.error);

    try {
      const col = await GuildStore.collection();
      const now = new Date();

      const result = await col.findOneAndUpdate(
        { _id: guildId },
        {
          $set: {
            "rpg.enabled": enabled,
            "rpg.updatedAt": now,
          },
        },
        { returnDocument: "after" },
      );

      if (!result?.rpg) {
        return ErrResult(new Error("Failed to update RPG enabled status"));
      }

      return OkResult(toDomain(guildId, result.rpg as RpgConfigData));
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  },
};
