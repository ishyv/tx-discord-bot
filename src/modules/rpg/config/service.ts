/**
 * RPG Config Service.
 *
 * Purpose: Business logic for RPG configuration with audit logging.
 */

import { rpgConfigRepo } from "./repository";
import { economyAuditRepo } from "@/modules/economy/audit/repository";
import type { GuildId } from "@/db/types";
import type { Result } from "@/utils/result";
import type {
  RpgConfig,
  RpgCombatConfig,
  RpgProcessingConfig,
  RpgGatheringConfig,
  RpgUpgradeConfig,
} from "./types";

/** Service implementation. */
export const rpgConfigService = {
  /**
   * Get RPG config for guild (creates defaults if missing).
   */
  async getConfig(guildId: GuildId): Promise<Result<RpgConfig, Error>> {
    return rpgConfigRepo.ensure(guildId);
  },

  /**
   * Update combat configuration with audit logging.
   */
  async updateCombatConfig(
    guildId: GuildId,
    actorId: string,
    combat: Partial<RpgCombatConfig>,
    options?: { reason?: string; correlationId?: string },
  ): Promise<Result<RpgConfig, Error>> {
    // Get current config for before values
    const beforeResult = await rpgConfigRepo.ensure(guildId);
    if (beforeResult.isErr()) return beforeResult;
    const before = beforeResult.unwrap();

    // Update config
    const updateResult = await rpgConfigRepo.updateCombatConfig(guildId, combat);
    if (updateResult.isErr()) return updateResult;

    // Audit each changed field
    for (const [field, value] of Object.entries(combat)) {
      if (value === undefined) continue;
      const beforeValue = before.combat[field as keyof RpgCombatConfig];
      
      await economyAuditRepo.create({
        operationType: "config_update",
        guildId,
        actorId,
        targetId: actorId,
        source: "rpg-config-combat",
        reason: options?.reason ?? `Updated combat ${field}`,
        metadata: {
          category: "combat",
          field,
          before: beforeValue,
          after: value,
          correlationId: options?.correlationId,
        },
      });
    }

    return updateResult;
  },

  /**
   * Update processing configuration with audit logging.
   */
  async updateProcessingConfig(
    guildId: GuildId,
    actorId: string,
    processing: Partial<RpgProcessingConfig>,
    options?: { reason?: string; correlationId?: string },
  ): Promise<Result<RpgConfig, Error>> {
    const beforeResult = await rpgConfigRepo.ensure(guildId);
    if (beforeResult.isErr()) return beforeResult;
    const before = beforeResult.unwrap();

    const updateResult = await rpgConfigRepo.updateProcessingConfig(guildId, processing);
    if (updateResult.isErr()) return updateResult;

    for (const [field, value] of Object.entries(processing)) {
      if (value === undefined) continue;
      const beforeValue = before.processing[field as keyof RpgProcessingConfig];
      
      await economyAuditRepo.create({
        operationType: "config_update",
        guildId,
        actorId,
        targetId: actorId,
        source: "rpg-config-processing",
        reason: options?.reason ?? `Updated processing ${field}`,
        metadata: {
          category: "processing",
          field,
          before: beforeValue,
          after: value,
          correlationId: options?.correlationId,
        },
      });
    }

    return updateResult;
  },

  /**
   * Update gathering configuration with audit logging.
   */
  async updateGatheringConfig(
    guildId: GuildId,
    actorId: string,
    gathering: Partial<RpgGatheringConfig>,
    options?: { reason?: string; correlationId?: string },
  ): Promise<Result<RpgConfig, Error>> {
    const beforeResult = await rpgConfigRepo.ensure(guildId);
    if (beforeResult.isErr()) return beforeResult;
    const before = beforeResult.unwrap();

    const updateResult = await rpgConfigRepo.updateGatheringConfig(guildId, gathering);
    if (updateResult.isErr()) return updateResult;

    for (const [field, value] of Object.entries(gathering)) {
      if (value === undefined) continue;
      const beforeValue = before.gathering[field as keyof RpgGatheringConfig];
      
      await economyAuditRepo.create({
        operationType: "config_update",
        guildId,
        actorId,
        targetId: actorId,
        source: "rpg-config-gathering",
        reason: options?.reason ?? `Updated gathering ${field}`,
        metadata: {
          category: "gathering",
          field,
          before: beforeValue,
          after: value,
          correlationId: options?.correlationId,
        },
      });
    }

    return updateResult;
  },

  /**
   * Update upgrade configuration with audit logging.
   */
  async updateUpgradeConfig(
    guildId: GuildId,
    actorId: string,
    upgrades: Partial<RpgUpgradeConfig>,
    options?: { reason?: string; correlationId?: string },
  ): Promise<Result<RpgConfig, Error>> {
    const beforeResult = await rpgConfigRepo.ensure(guildId);
    if (beforeResult.isErr()) return beforeResult;
    const before = beforeResult.unwrap();

    const updateResult = await rpgConfigRepo.updateUpgradeConfig(guildId, upgrades);
    if (updateResult.isErr()) return updateResult;

    for (const [field, value] of Object.entries(upgrades)) {
      if (value === undefined) continue;
      const beforeValue = before.upgrades[field as keyof RpgUpgradeConfig];
      
      await economyAuditRepo.create({
        operationType: "config_update",
        guildId,
        actorId,
        targetId: actorId,
        source: "rpg-config-upgrades",
        reason: options?.reason ?? `Updated upgrades ${field}`,
        metadata: {
          category: "upgrades",
          field,
          before: beforeValue,
          after: value,
          correlationId: options?.correlationId,
        },
      });
    }

    return updateResult;
  },

  /**
   * Enable/disable RPG system with audit logging.
   */
  async setEnabled(
    guildId: GuildId,
    actorId: string,
    enabled: boolean,
    options?: { reason?: string; correlationId?: string },
  ): Promise<Result<RpgConfig, Error>> {
    const beforeResult = await rpgConfigRepo.ensure(guildId);
    if (beforeResult.isErr()) return beforeResult;
    const before = beforeResult.unwrap();

    const updateResult = await rpgConfigRepo.setEnabled(guildId, enabled);
    if (updateResult.isErr()) return updateResult;

    await economyAuditRepo.create({
      operationType: "config_update",
      guildId,
      actorId,
      targetId: actorId,
      source: "rpg-config-enabled",
      reason: options?.reason ?? (enabled ? "Enabled RPG" : "Disabled RPG"),
      metadata: {
        category: "enabled",
        field: "enabled",
        before: before.enabled,
        after: enabled,
        correlationId: options?.correlationId,
      },
    });

    return updateResult;
  },
};
