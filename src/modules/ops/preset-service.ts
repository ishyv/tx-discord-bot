/**
 * Feature Preset Service.
 *
 * Purpose: Apply feature presets with audit logging.
 * Context: Used by admin commands to safely transition between launch phases.
 */

import { ErrResult, OkResult, type Result } from "@/utils/result";
import { economyAuditRepo } from "@/modules/economy/audit/repository";
import { guildEconomyService } from "@/modules/economy/guild";
import type { EconomyFeatureFlags } from "@/modules/economy/guild";
import type { GuildId } from "@/db/types";
import { opsConfigRepo } from "./repository";
import {
  getFeaturePreset,
  getPresetDiff,
  isValidPreset,
  type FeaturePreset,
  PROGRESSIVE_UNLOCK_ORDER,
  checkUnlockReadiness,
} from "./presets";


/** Result of applying a preset. */
export interface PresetApplyResult {
  readonly preset: FeaturePreset;
  readonly previousFlags: EconomyFeatureFlags;
  readonly newFlags: EconomyFeatureFlags;
  readonly enabled: string[];
  readonly disabled: string[];
  readonly correlationId: string;
  readonly timestamp: Date;
}

/** Unlock suggestion. */
export interface UnlockSuggestion {
  readonly feature: string;
  readonly ready: boolean;
  readonly reason: string;
  readonly daysSinceLaunch: number;
  readonly avgTransactionsPerDay: number;
}

/** Progressive rollout status. */
export interface RolloutStatus {
  readonly guildId: GuildId;
  readonly daysSinceLaunch: number;
  readonly avgTransactionsPerDay: number;
  readonly suggestions: UnlockSuggestion[];
  readonly nextUnlock: UnlockSuggestion | null;
}

/** Service interface for preset management. */
export interface FeaturePresetService {
  /** Apply a feature preset to a guild. */
  applyPreset(
    guildId: GuildId,
    preset: FeaturePreset,
    actorId: string,
  ): Promise<Result<PresetApplyResult, Error>>;

  /** Get current preset status. */
  getCurrentStatus(guildId: GuildId): Promise<Result<{
    currentFlags: EconomyFeatureFlags;
    inferredPreset: FeaturePreset | "custom";
  }, Error>>;

  /** Check progressive unlock suggestions. */
  checkProgressiveUnlocks(guildId: GuildId): Promise<Result<RolloutStatus, Error>>;

  /** Generate unlock suggestions message for ops channel. */
  generateUnlockMessage(status: RolloutStatus): string | null;
}

/** Generate correlation ID for config updates. */
function generateCorrelationId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

class FeaturePresetServiceImpl implements FeaturePresetService {
  async applyPreset(
    guildId: GuildId,
    preset: FeaturePreset,
    actorId: string,
  ): Promise<Result<PresetApplyResult, Error>> {
    try {
      if (!isValidPreset(preset)) {
        return ErrResult(new Error(`Invalid preset: ${preset}`));
      }

      // Get current config
      const configResult = await guildEconomyService.getConfig(guildId);
      if (configResult.isErr()) {
        return ErrResult(configResult.error);
      }
      const config = configResult.unwrap();

      // Get target flags
      const targetFlags = getFeaturePreset(preset);
      const previousFlags = { ...config.features };

      // Calculate diff
      const diff = getPresetDiff(preset, previousFlags);

      // Apply new flags via guild economy service
      // Note: We need to update the guild config with new feature flags
      const correlationId = generateCorrelationId();

      // Create audit entry for each changed flag
      const auditPromises: Promise<unknown>[] = [];

      for (const feature of diff.enabled) {
        auditPromises.push(
          economyAuditRepo.create({
            operationType: "config_update",
            actorId,
            targetId: guildId,
            guildId,
            source: "feature_preset_service",
            reason: `Applied preset "${preset}": enabled ${feature}`,
            metadata: {
              correlationId,
              preset,
              feature,
              previousValue: previousFlags[feature as keyof EconomyFeatureFlags],
              newValue: true,
              changeType: "feature_enable",
            },
          }),
        );
      }

      for (const feature of diff.disabled) {
        auditPromises.push(
          economyAuditRepo.create({
            operationType: "config_update",
            actorId,
            targetId: guildId,
            guildId,
            source: "feature_preset_service",
            reason: `Applied preset "${preset}": disabled ${feature}`,
            metadata: {
              correlationId,
              preset,
              feature,
              previousValue: previousFlags[feature as keyof EconomyFeatureFlags],
              newValue: false,
              changeType: "feature_disable",
            },
          }),
        );
      }

      // Also create a summary audit entry
      auditPromises.push(
        economyAuditRepo.create({
          operationType: "config_update",
          actorId,
          targetId: guildId,
          guildId,
          source: "feature_preset_service",
          reason: `Applied feature preset "${preset}" to guild`,
          metadata: {
            correlationId,
            preset,
            previousFlags,
            newFlags: targetFlags,
            enabled: diff.enabled,
            disabled: diff.disabled,
            changeType: "preset_apply",
          },
        }),
      );

      // Wait for all audits
      await Promise.all(auditPromises);

      // Update soft launch mode based on preset
      if (preset === "full") {
        await opsConfigRepo.update(guildId, { softLaunchMode: false });
      } else if (preset === "soft" || preset === "minimal") {
        await opsConfigRepo.update(guildId, { softLaunchMode: true });
      }

      return OkResult({
        preset,
        previousFlags,
        newFlags: targetFlags,
        enabled: diff.enabled,
        disabled: diff.disabled,
        correlationId,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("[FeaturePresetService] Failed to apply preset:", error);
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async getCurrentStatus(guildId: GuildId): Promise<Result<{
    currentFlags: EconomyFeatureFlags;
    inferredPreset: FeaturePreset | "custom";
  }, Error>> {
    try {
      const configResult = await guildEconomyService.getConfig(guildId);
      if (configResult.isErr()) {
        return ErrResult(configResult.error);
      }

      const config = configResult.unwrap();
      const flags = config.features;

      // Infer preset by comparing flags
      let inferredPreset: FeaturePreset | "custom" = "custom";

      // Check if matches soft preset
      const soft = getFeaturePreset("soft");
      const full = getFeaturePreset("full");
      const minimal = getFeaturePreset("minimal");

      if (this.flagsMatch(flags, soft)) {
        inferredPreset = "soft";
      } else if (this.flagsMatch(flags, full)) {
        inferredPreset = "full";
      } else if (this.flagsMatch(flags, minimal)) {
        inferredPreset = "minimal";
      }

      return OkResult({
        currentFlags: flags,
        inferredPreset,
      });
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async checkProgressiveUnlocks(guildId: GuildId): Promise<Result<RolloutStatus, Error>> {
    try {
      // Get ops config to check launch date
      const opsConfigResult = await opsConfigRepo.get(guildId);
      if (opsConfigResult.isErr()) {
        return ErrResult(opsConfigResult.error);
      }
      const opsConfig = opsConfigResult.unwrap();

      // Calculate days since first config update (launch)
      const daysSinceLaunch = Math.floor(
        (Date.now() - opsConfig.updatedAt.getTime()) / (24 * 60 * 60 * 1000),
      );

      // Get current feature status
      const statusResult = await this.getCurrentStatus(guildId);
      if (statusResult.isErr()) {
        return ErrResult(statusResult.error);
      }
      const { currentFlags } = statusResult.unwrap();

      // Calculate average transactions per day (simplified - would come from audit stats)
      // For now, estimate based on activity
      const avgTransactionsPerDay = 0; // Would be calculated from audit data

      // Check each disabled feature for unlock readiness
      const suggestions: UnlockSuggestion[] = [];

      for (const unlock of PROGRESSIVE_UNLOCK_ORDER) {
        // Skip if already enabled
        if (currentFlags[unlock.feature]) {
          continue;
        }

        const readiness = checkUnlockReadiness(
          unlock.feature,
          daysSinceLaunch,
          avgTransactionsPerDay,
        );

        suggestions.push({
          feature: unlock.feature,
          ready: readiness.ready,
          reason: readiness.reason,
          daysSinceLaunch,
          avgTransactionsPerDay,
        });
      }

      // Find next unlock (first not ready)
      const nextUnlock = suggestions.find((s) => !s.ready) ??
        suggestions.find((s) => s.ready) ??
        null;

      return OkResult({
        guildId,
        daysSinceLaunch,
        avgTransactionsPerDay,
        suggestions,
        nextUnlock,
      });
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  generateUnlockMessage(status: RolloutStatus): string | null {
    const readyFeatures = status.suggestions.filter((s) => s.ready);

    if (readyFeatures.length === 0) {
      return null;
    }

    const lines: string[] = [
      "🚀 **Progressive Rollout Suggestions**",
      `📅 Days since launch: ${status.daysSinceLaunch}`,
      `📊 Avg transactions/day: ${status.avgTransactionsPerDay}`,
      "",
      "Features ready to unlock:",
    ];

    for (const feature of readyFeatures) {
      lines.push(`✅ **${feature.feature}**: ${feature.reason}`);
      lines.push(`   Run \`/economy-config preset:full\` or enable individually.`);
    }

    return lines.join("\n");
  }

  private flagsMatch(a: EconomyFeatureFlags, b: EconomyFeatureFlags): boolean {
    return (
      a.coinflip === b.coinflip &&
      a.trivia === b.trivia &&
      a.rob === b.rob &&
      a.voting === b.voting &&
      a.crafting === b.crafting &&
      a.store === b.store
    );
  }
}

/** Singleton instance. */
export const featurePresetService: FeaturePresetService = new FeaturePresetServiceImpl();
