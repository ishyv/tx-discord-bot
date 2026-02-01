/**
 * Progressive Unlock Scheduler.
 *
 * Purpose: Periodically check for features ready to unlock and post suggestions.
 * Context: Runs alongside scheduled reports to guide admins through rollout.
 */

import { featurePresetService } from "./preset-service";
import { opsConfigRepo } from "./repository";
import type { RolloutStatus } from "./preset-service";

/** Scheduler configuration. */
export interface ProgressiveUnlockConfig {
  /** Check interval in hours (default: 24) */
  readonly checkIntervalHours: number;
  /** Only suggest if days since launch >= this (default: 2) */
  readonly minDaysBeforeSuggest: number;
  /** Cooldown between duplicate suggestions in hours (default: 48) */
  readonly suggestionCooldownHours: number;
}

/** Default configuration. */
export const DEFAULT_UNLOCK_CONFIG: ProgressiveUnlockConfig = {
  checkIntervalHours: 24,
  minDaysBeforeSuggest: 2,
  suggestionCooldownHours: 48,
};

/** In-memory tracking of sent suggestions. */
const sentSuggestions = new Map<string, Date>();

/** Service for progressive unlock scheduling. */
export interface ProgressiveUnlockService {
  /** Start the scheduler. */
  start(): void;

  /** Stop the scheduler. */
  stop(): void;

  /** Manually trigger a check. */
  checkAllGuilds(): Promise<CheckResult[]>;

  /** Check a specific guild. */
  checkGuild(guildId: string): Promise<CheckResult | null>;
}

/** Result of a progressive unlock check. */
export interface CheckResult {
  readonly guildId: string;
  readonly hasSuggestions: boolean;
  readonly message: string | null;
  readonly status: RolloutStatus;
  readonly sent: boolean;
}

class ProgressiveUnlockServiceImpl implements ProgressiveUnlockService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private config: ProgressiveUnlockConfig;

  constructor(config: Partial<ProgressiveUnlockConfig> = {}) {
    this.config = { ...DEFAULT_UNLOCK_CONFIG, ...config };
  }

  start(): void {
    if (this.intervalId) {
      console.log("[ProgressiveUnlock] Already running");
      return;
    }

    console.log("[ProgressiveUnlock] Starting scheduler...");

    // Check immediately on start
    this.checkAllGuilds().catch((error) => {
      console.error("[ProgressiveUnlock] Initial check failed:", error);
    });

    // Schedule periodic checks
    const intervalMs = this.config.checkIntervalHours * 60 * 60 * 1000;
    this.intervalId = setInterval(() => {
      this.checkAllGuilds().catch((error) => {
        console.error("[ProgressiveUnlock] Scheduled check failed:", error);
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[ProgressiveUnlock] Scheduler stopped");
    }
  }

  async checkAllGuilds(): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    try {
      // Get all guilds with ops enabled
      const configsResult = await opsConfigRepo.listWithDailyReports();
      if (configsResult.isErr()) {
        console.error("[ProgressiveUnlock] Failed to get configs:", configsResult.error);
        return results;
      }

      const configs = configsResult.unwrap();

      for (const config of configs) {
        // Only check guilds in soft launch mode
        if (!config.softLaunchMode) {
          continue;
        }

        const result = await this.checkGuild(config.guildId);
        if (result) {
          results.push(result);
        }
      }
    } catch (error) {
      console.error("[ProgressiveUnlock] Error checking guilds:", error);
    }

    return results;
  }

  async checkGuild(guildId: string): Promise<CheckResult | null> {
    try {
      // Get ops config
      const configResult = await opsConfigRepo.get(guildId);
      if (configResult.isErr()) {
        console.error(`[ProgressiveUnlock] Failed to get config for ${guildId}:`, configResult.error);
        return null;
      }

      const config = configResult.unwrap();

      // Skip if not in soft launch mode
      if (!config.softLaunchMode) {
        return null;
      }

      // Skip if no ops channel configured
      if (!config.opsChannelId) {
        return null;
      }

      // Check progressive unlocks
      const statusResult = await featurePresetService.checkProgressiveUnlocks(guildId);
      if (statusResult.isErr()) {
        console.error(`[ProgressiveUnlock] Failed to check unlocks for ${guildId}:`, statusResult.error);
        return null;
      }

      const status = statusResult.unwrap();

      // Skip if not enough days since launch
      if (status.daysSinceLaunch < this.config.minDaysBeforeSuggest) {
        return null;
      }

      // Generate message
      const message = featurePresetService.generateUnlockMessage(status);
      const hasSuggestions = message !== null;

      // Check cooldown
      const suggestionKey = `${guildId}_${status.suggestions.map((s) => s.feature).join("_")}`;
      const lastSent = sentSuggestions.get(suggestionKey);
      const now = new Date();

      let sent = false;
      if (hasSuggestions) {
        if (
          !lastSent ||
          now.getTime() - lastSent.getTime() > this.config.suggestionCooldownHours * 60 * 60 * 1000
        ) {
          // Would send message to Discord here
          // For now, just log it
          console.log(`[ProgressiveUnlock] Suggestion for ${guildId}:`, message);
          sentSuggestions.set(suggestionKey, now);
          sent = true;
        } else {
          console.log(`[ProgressiveUnlock] Skipping ${guildId} - cooldown active`);
        }
      }

      return {
        guildId,
        hasSuggestions,
        message,
        status,
        sent,
      };
    } catch (error) {
      console.error(`[ProgressiveUnlock] Error checking guild ${guildId}:`, error);
      return null;
    }
  }
}

/** Singleton instance. */
export const progressiveUnlock: ProgressiveUnlockService = new ProgressiveUnlockServiceImpl();

/** Start progressive unlock scheduler. */
export function startProgressiveUnlock(): void {
  progressiveUnlock.start();
}

/** Stop progressive unlock scheduler. */
export function stopProgressiveUnlock(): void {
  progressiveUnlock.stop();
}
