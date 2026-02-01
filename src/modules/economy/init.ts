/**
 * Economy Module Initialization.
 *
 * Purpose: One-time setup for economy system (indexes, defaults, etc).
 * Call this during application startup before handling requests.
 */

import { ensureAllEconomyIndexes, getEconomyIndexStats } from "./db-indexes";
import { ensureAuditIndexes } from "./audit/repository";
import { launchOps } from "../ops";

/** Initialization options for economy module. */
export interface EconomyInitOptions {
  /** Whether to ensure database indexes (default: true) */
  ensureIndexes?: boolean;
  /** Whether to log index statistics after creation (default: false) */
  logIndexStats?: boolean;
  /** Skip index creation if set to true (useful for tests) */
  skipIndexes?: boolean;
}

/**
 * Initialize the economy module.
 *
 * This function should be called once during application startup.
 * It ensures all database indexes are created and logs any errors.
 *
 * Example usage:
 * ```typescript
 * import { initEconomy } from "@/modules/economy/init";
 *
 * await initEconomy({ ensureIndexes: true, logIndexStats: true });
 * ```
 */
export async function initEconomy(
  options: EconomyInitOptions = {},
): Promise<void> {
  const {
    ensureIndexes = true,
    logIndexStats = false,
    skipIndexes = false,
  } = options;

  console.log("[Economy] Initializing economy module...");

  if (!skipIndexes && ensureIndexes) {
    // Ensure audit indexes first (they already have a function)
    try {
      await ensureAuditIndexes();
    } catch (error) {
      console.error("[Economy] Failed to ensure audit indexes:", error);
      // Continue - app can still function without indexes
    }

    // Ensure all economy indexes
    try {
      await ensureAllEconomyIndexes();
    } catch (error) {
      console.error("[Economy] Failed to ensure economy indexes:", error);
      // Continue - app can still function without indexes
    }

    // Log index stats if requested
    if (logIndexStats) {
      try {
        const stats = await getEconomyIndexStats();
        console.log(
          "[Economy] Index statistics:",
          JSON.stringify(stats, null, 2),
        );
      } catch (error) {
        console.error("[Economy] Failed to get index stats:", error);
      }
    }
  } else {
    console.log("[Economy] Skipping index creation (skipIndexes=true)");
  }

  console.log("[Economy] Economy module initialized");

  // Initialize launch ops (startup assertions, scheduled reports)
  try {
    const opsResult = await launchOps.initialize();
    if (!opsResult.success) {
      console.error("[Economy] Launch ops initialization failed:", opsResult.error);
      // Continue - ops failure shouldn't stop the bot
    }
  } catch (error) {
    console.error("[Economy] Failed to initialize launch ops:", error);
    // Continue - ops failure shouldn't stop the bot
  }
}

/**
 * Quick check to verify economy database connectivity and indexes.
 *
 * Returns true if all critical indexes exist, false otherwise.
 * This can be used for health checks.
 */
export async function checkEconomyHealth(): Promise<{
  healthy: boolean;
  indexesReady: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  let indexesReady = false;

  try {
    const stats = await getEconomyIndexStats();

    // Check if critical indexes exist
    const dailyClaims = (stats.dailyClaims as Array<{ name: string }>) ?? [];
    const workClaims = (stats.workClaims as Array<{ name: string }>) ?? [];
    const votes = (stats.votes as Array<{ name: string }>) ?? [];

    const hasDailyGuildUser = dailyClaims.some(
      (i) => i.name === "guild_user_idx",
    );
    const hasWorkGuildUser = workClaims.some(
      (i) => i.name === "guild_user_idx",
    );
    const hasVoteGuildTarget = votes.some(
      (i) => i.name === "guild_target_time_idx",
    );

    indexesReady = hasDailyGuildUser && hasWorkGuildUser && hasVoteGuildTarget;

    if (!hasDailyGuildUser) errors.push("Missing daily claims guild_user_idx");
    if (!hasWorkGuildUser) errors.push("Missing work claims guild_user_idx");
    if (!hasVoteGuildTarget) errors.push("Missing votes guild_target_time_idx");
  } catch (error) {
    errors.push(
      `Failed to check indexes: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    healthy: indexesReady,
    indexesReady,
    errors,
  };
}
