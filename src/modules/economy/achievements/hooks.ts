/**
 * Achievements Hooks.
 *
 * Purpose: Integration points for other systems to trigger achievement evaluation.
 * Context: Called from minigames, crafting, daily, store, and other services.
 * Dependencies: AchievementService.
 *
 * Invariants:
 * - Hooks are non-blocking (fire and forget).
 * - Failures in achievement tracking don't break main operations.
 */

import type { UserId, GuildId } from "@/db/types";
import { achievementService } from "./service";

// =============================================================================
// Minigame Hooks
// =============================================================================

/**
 * Track coinflip result for streak calculation.
 * Call after each coinflip game.
 */
export async function trackCoinflipResult(
  userId: UserId,
  guildId: GuildId,
  won: boolean,
): Promise<void> {
  try {
    if (won) {
      // For streak tracking, we need consecutive wins
      // This is handled by checking current streak and updating
      // A more complex implementation would track streaks in state
      // For now, we check if user has a recent coinflip win and increment
      await achievementService.incrementProgress(
        userId,
        guildId,
        "coinflip_streak",
        1,
        { game: "coinflip", won: true },
      );
    } else {
      // Reset streak on loss (handled by setting progress to 0)
      await achievementService.updateProgress(
        userId,
        guildId,
        "coinflip_streak",
        0,
        { game: "coinflip", won: false },
      );
    }
  } catch (error) {
    console.error("[Achievements] trackCoinflipResult error:", error);
    // Non-blocking - don't throw
  }
}

/**
 * Track trivia win.
 * Call when user answers trivia correctly.
 */
export async function trackTriviaWin(
  userId: UserId,
  guildId: GuildId,
  questionId?: string,
): Promise<void> {
  try {
    await achievementService.incrementProgress(
      userId,
      guildId,
      "trivia_wins",
      1,
      { questionId },
    );
  } catch (error) {
    console.error("[Achievements] trackTriviaWin error:", error);
  }
}

/**
 * Track successful rob.
 * Call when rob succeeds.
 */
export async function trackRobSuccess(
  userId: UserId,
  guildId: GuildId,
  amountStolen: number,
): Promise<void> {
  try {
    // For Robin Hood achievement, we track cumulative amount
    await achievementService.updateProgress(
      userId,
      guildId,
      "rob_success",
      amountStolen,
      { amountStolen },
    );
  } catch (error) {
    console.error("[Achievements] trackRobSuccess error:", error);
  }
}

// =============================================================================
// Crafting Hooks
// =============================================================================

/**
 * Track crafting completion for achievements.
 * Call after successful craft.
 */
export async function trackCraftingForAchievements(
  userId: UserId,
  guildId: GuildId,
  recipeId: string,
  quantity: number,
): Promise<void> {
  try {
    await achievementService.incrementProgress(
      userId,
      guildId,
      "craft_count",
      quantity,
      { recipeId, quantity },
    );
  } catch (error) {
    console.error("[Achievements] trackCraftingForAchievements error:", error);
  }
}

// =============================================================================
// Daily/Progression Hooks
// =============================================================================

/**
 * Track daily streak.
 * Call when user claims daily with streak info.
 */
export async function trackDailyStreak(
  userId: UserId,
  guildId: GuildId,
  streakDays: number,
): Promise<void> {
  try {
    await achievementService.updateProgress(
      userId,
      guildId,
      "streak_milestone",
      streakDays,
      { streakDays },
    );
  } catch (error) {
    console.error("[Achievements] trackDailyStreak error:", error);
  }
}

/**
 * Track level up.
 * Call when user levels up.
 */
export async function trackLevelUp(
  userId: UserId,
  guildId: GuildId,
  newLevel: number,
): Promise<void> {
  try {
    await achievementService.updateProgress(
      userId,
      guildId,
      "level_milestone",
      newLevel,
      { newLevel },
    );
  } catch (error) {
    console.error("[Achievements] trackLevelUp error:", error);
  }
}

// =============================================================================
// Store Hooks
// =============================================================================

/**
 * Track store purchase.
 * Call after successful purchase.
 */
export async function trackStorePurchase(
  userId: UserId,
  guildId: GuildId,
  itemId: string,
): Promise<void> {
  try {
    await achievementService.incrementProgress(
      userId,
      guildId,
      "store_purchases",
      1,
      { itemId },
    );
  } catch (error) {
    console.error("[Achievements] trackStorePurchase error:", error);
  }
}

/**
 * Track unique items collected.
 * Call when user's unique item count changes.
 */
export async function trackItemCollection(
  userId: UserId,
  guildId: GuildId,
  uniqueItemCount: number,
): Promise<void> {
  try {
    await achievementService.updateProgress(
      userId,
      guildId,
      "items_collected",
      uniqueItemCount,
      { uniqueItemCount },
    );
  } catch (error) {
    console.error("[Achievements] trackItemCollection error:", error);
  }
}

// =============================================================================
// Quest Hooks
// =============================================================================

/**
 * Track quest completion.
 * Call when user completes a quest.
 */
export async function trackQuestCompletion(
  userId: UserId,
  guildId: GuildId,
  questId: string,
): Promise<void> {
  try {
    await achievementService.incrementProgress(
      userId,
      guildId,
      "quest_completions",
      1,
      { questId },
    );
  } catch (error) {
    console.error("[Achievements] trackQuestCompletion error:", error);
  }
}

// =============================================================================
// Voting Hooks
// =============================================================================

/**
 * Track vote cast for achievements.
 * Call when user casts a vote.
 */
export async function trackVoteCastForAchievements(
  userId: UserId,
  guildId: GuildId,
  voteType: "love" | "hate",
): Promise<void> {
  try {
    await achievementService.incrementProgress(
      userId,
      guildId,
      "votes_cast",
      1,
      { voteType },
    );
  } catch (error) {
    console.error("[Achievements] trackVoteCastForAchievements error:", error);
  }
}

// =============================================================================
// Audit-based Evaluation
// =============================================================================

/**
 * Evaluate achievements from audit event.
 * Call when processing audit log events.
 */
export async function evaluateAchievementsFromAudit(
  userId: UserId,
  guildId: GuildId,
  operationType: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await achievementService.evaluateFromAudit(
      userId,
      guildId,
      operationType,
      metadata,
    );
  } catch (error) {
    console.error("[Achievements] evaluateAchievementsFromAudit error:", error);
  }
}
