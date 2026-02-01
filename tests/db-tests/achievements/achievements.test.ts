/**
 * Achievements System Integration Tests.
 *
 * Purpose: Test achievement unlock conditions, idempotency, and audit correlation.
 * Context: Run against test database.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { initDb, closeDb } from "@/db/mongo";
import { achievementRepo } from "@/modules/economy/achievements/repository";
import { achievementService } from "@/modules/economy/achievements/service";
import {
  trackDailyStreak,
  trackLevelUp,
  trackCraftingForAchievements,
  trackTriviaWin,
  trackCoinflipResult,
  trackRobSuccess,
  trackStorePurchase,
  trackQuestCompletion,
  trackVoteCastForAchievements,
} from "@/modules/economy/achievements/hooks";
import {
  AchievementError,
  getAchievementDefinition,
  getAllAchievementDefinitions,
} from "@/modules/economy/achievements";
import { economyAccountRepo } from "@/modules/economy/account/repository";

describe("Achievements System Integration", () => {
  const TEST_GUILD_ID = "test_guild_achievements";
  const TEST_USER_ID = "test_user_achievements";

  beforeAll(async () => {
    await initDb();

    // Clean up any existing test data
    const db = await import("@/db/mongo").then((m) => m.getDb());
    await db
      .collection("achievements_unlocked")
      .deleteMany({ userId: TEST_USER_ID, guildId: TEST_GUILD_ID } as any);
    await db
      .collection("achievements_progress")
      .deleteMany({ userId: TEST_USER_ID, guildId: TEST_GUILD_ID } as any);
    await db
      .collection("achievements_cosmetics")
      .deleteMany({ userId: TEST_USER_ID, guildId: TEST_GUILD_ID } as any);

    // Ensure test user has an economy account
    await economyAccountRepo.ensure(TEST_USER_ID);
  });

  afterAll(async () => {
    await closeDb();
  });

  // ============================================================================
  // Definitions
  // ============================================================================

  describe("Achievement Definitions", () => {
    test("should have 17 achievements defined", () => {
      const definitions = getAllAchievementDefinitions();
      expect(definitions.length).toBe(17);
    });

    test("should have unique achievement IDs", () => {
      const definitions = getAllAchievementDefinitions();
      const ids = definitions.map((d) => d.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    test("should have streak milestones (7, 14, 30)", () => {
      const streak7 = getAchievementDefinition("streak_7");
      const streak14 = getAchievementDefinition("streak_14");
      const streak30 = getAchievementDefinition("streak_30");

      expect(streak7).toBeDefined();
      expect(streak14).toBeDefined();
      expect(streak30).toBeDefined();

      expect(streak7!.tier).toBe("bronze");
      expect(streak14!.tier).toBe("silver");
      expect(streak30!.tier).toBe("gold");
    });

    test("should have level milestones (3, 6, 9, 12)", () => {
      const level3 = getAchievementDefinition("level_3");
      const level6 = getAchievementDefinition("level_6");
      const level9 = getAchievementDefinition("level_9");
      const level12 = getAchievementDefinition("level_12");

      expect(level3).toBeDefined();
      expect(level6).toBeDefined();
      expect(level9).toBeDefined();
      expect(level12).toBeDefined();
    });

    test("should have crafting milestones", () => {
      const craft10 = getAchievementDefinition("craft_10");
      const craft50 = getAchievementDefinition("craft_50");

      expect(craft10).toBeDefined();
      expect(craft50).toBeDefined();
      expect(craft10!.condition.type).toBe("craft_count");
      expect(craft50!.condition.type).toBe("craft_count");
    });

    test("should have Robin Hood achievement with strict caps", () => {
      const robinHood = getAchievementDefinition("rob_total_5000");

      expect(robinHood).toBeDefined();
      expect(robinHood!.category).toBe("social");
      expect(robinHood!.condition.type).toBe("rob_success");
    });
  });

  // ============================================================================
  // Repository - Basic Operations
  // ============================================================================

  describe("Achievement Repository", () => {
    test("should record achievement unlock", async () => {
      const result = await achievementRepo.recordUnlock(
        TEST_USER_ID,
        TEST_GUILD_ID,
        "streak_7",
        { streakDays: 7 },
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().userId).toBe(TEST_USER_ID);
        expect(result.unwrap().achievementId).toBe("streak_7");
        expect(result.unwrap().rewardsClaimed).toBe(false);
      }
    });

    test("should be idempotent - not duplicate unlocks", async () => {
      // Try to unlock same achievement again
      const result = await achievementRepo.recordUnlock(
        TEST_USER_ID,
        TEST_GUILD_ID,
        "streak_7",
        { streakDays: 7 },
      );

      expect(result.isOk()).toBe(true);

      // Should only have one unlock record
      const unlocked = await achievementRepo.getUnlocked(
        TEST_USER_ID,
        TEST_GUILD_ID,
      );
      expect(unlocked.isOk()).toBe(true);
      if (unlocked.isOk()) {
        const streak7Unlocks = unlocked
          .unwrap()
          .filter((u) => u.achievementId === "streak_7");
        expect(streak7Unlocks.length).toBe(1);
      }
    });

    test("should check if achievement is unlocked", async () => {
      const result = await achievementRepo.hasUnlocked(
        TEST_USER_ID,
        TEST_GUILD_ID,
        "streak_7",
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap()).toBe(true);
      }
    });

    test("should return false for non-unlocked achievement", async () => {
      const result = await achievementRepo.hasUnlocked(
        TEST_USER_ID,
        TEST_GUILD_ID,
        "streak_14",
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap()).toBe(false);
      }
    });

    test("should mark rewards as claimed", async () => {
      const result = await achievementRepo.markRewardsClaimed(
        TEST_USER_ID,
        TEST_GUILD_ID,
        "streak_7",
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().rewardsClaimed).toBe(true);
        expect(result.unwrap().rewardsClaimedAt).toBeDefined();
      }
    });
  });

  // ============================================================================
  // Progress Tracking
  // ============================================================================

  describe("Progress Tracking", () => {
    test("should create progress for achievement", async () => {
      const result = await achievementRepo.getOrCreateProgress(
        TEST_USER_ID,
        TEST_GUILD_ID,
        "craft_10",
        10,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().progress).toBe(0);
        expect(result.unwrap().target).toBe(10);
        expect(result.unwrap().completed).toBe(false);
      }
    });

    test("should increment progress", async () => {
      const result = await achievementRepo.updateProgress(
        TEST_USER_ID,
        TEST_GUILD_ID,
        "craft_10",
        3,
        10,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().progress).toBe(3);
      }
    });

    test("should cap progress at target", async () => {
      // Add 10 more (total 13, should cap at 10)
      const result = await achievementRepo.updateProgress(
        TEST_USER_ID,
        TEST_GUILD_ID,
        "craft_10",
        10,
        10,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().progress).toBeLessThanOrEqual(10);
      }
    });

    test("should set progress directly", async () => {
      const result = await achievementRepo.setProgress(
        TEST_USER_ID,
        TEST_GUILD_ID,
        "level_3",
        3,
        3,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().progress).toBe(3);
        expect(result.unwrap().completed).toBe(true);
      }
    });
  });

  // ============================================================================
  // Service - Unlock Evaluation
  // ============================================================================

  describe("Achievement Service - Unlock Evaluation", () => {
    const NEW_USER_ID = "test_new_user_achievements";

    beforeAll(async () => {
      // Clean up for new user
      const db = await import("@/db/mongo").then((m) => m.getDb());
      await db
        .collection("achievements_unlocked")
        .deleteMany({ userId: NEW_USER_ID, guildId: TEST_GUILD_ID } as any);
      await db
        .collection("achievements_progress")
        .deleteMany({ userId: NEW_USER_ID, guildId: TEST_GUILD_ID } as any);
      await economyAccountRepo.ensure(NEW_USER_ID);
    });

    test("should unlock level achievements on progress update", async () => {
      // Set progress to level 3
      await achievementService.updateProgress(
        NEW_USER_ID,
        TEST_GUILD_ID,
        "level_milestone",
        3,
      );

      const hasUnlocked = await achievementRepo.hasUnlocked(
        NEW_USER_ID,
        TEST_GUILD_ID,
        "level_3",
      );

      expect(hasUnlocked.isOk()).toBe(true);
      if (hasUnlocked.isOk()) {
        expect(hasUnlocked.unwrap()).toBe(true);
      }
    });

    test("should unlock craft achievements on increment", async () => {
      // Increment 10 times using the hook
      for (let i = 0; i < 10; i++) {
        await trackCraftingForAchievements(
          NEW_USER_ID,
          TEST_GUILD_ID,
          "test_recipe",
          1,
        );
      }

      const hasUnlocked = await achievementRepo.hasUnlocked(
        NEW_USER_ID,
        TEST_GUILD_ID,
        "craft_10",
      );

      expect(hasUnlocked.isOk()).toBe(true);
      if (hasUnlocked.isOk()) {
        expect(hasUnlocked.unwrap()).toBe(true);
      }
    });

    test("should get achievement board view", async () => {
      const result = await achievementService.getAchievementBoard(
        NEW_USER_ID,
        TEST_GUILD_ID,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const board = result.unwrap();
        expect(board.achievements.length).toBe(17);
        expect(board.unlockedCount).toBeGreaterThanOrEqual(2); // level_3 and craft_10
        expect(board.totalCount).toBe(17);
        expect(board.byTier).toBeDefined();
        expect(board.byCategory).toBeDefined();
      }
    });
  });

  // ============================================================================
  // Hooks Integration
  // ============================================================================

  describe("Achievement Hooks", () => {
    const HOOKS_USER_ID = "test_hooks_user";

    beforeAll(async () => {
      const db = await import("@/db/mongo").then((m) => m.getDb());
      await db
        .collection("achievements_unlocked")
        .deleteMany({ userId: HOOKS_USER_ID, guildId: TEST_GUILD_ID } as any);
      await db
        .collection("achievements_progress")
        .deleteMany({ userId: HOOKS_USER_ID, guildId: TEST_GUILD_ID } as any);
      await economyAccountRepo.ensure(HOOKS_USER_ID);
    });

    test("should track daily streak via hook", async () => {
      await trackDailyStreak(HOOKS_USER_ID, TEST_GUILD_ID, 7);

      const hasUnlocked = await achievementRepo.hasUnlocked(
        HOOKS_USER_ID,
        TEST_GUILD_ID,
        "streak_7",
      );

      expect(hasUnlocked.isOk()).toBe(true);
      if (hasUnlocked.isOk()) {
        expect(hasUnlocked.unwrap()).toBe(true);
      }
    });

    test("should track level up via hook", async () => {
      await trackLevelUp(HOOKS_USER_ID, TEST_GUILD_ID, 6);

      const hasUnlocked = await achievementRepo.hasUnlocked(
        HOOKS_USER_ID,
        TEST_GUILD_ID,
        "level_6",
      );

      expect(hasUnlocked.isOk()).toBe(true);
      if (hasUnlocked.isOk()) {
        expect(hasUnlocked.unwrap()).toBe(true);
      }
    });

    test("should track trivia wins via hook", async () => {
      // Win 10 trivia games
      for (let i = 0; i < 10; i++) {
        await trackTriviaWin(HOOKS_USER_ID, TEST_GUILD_ID, `question_${i}`);
      }

      const hasUnlocked = await achievementRepo.hasUnlocked(
        HOOKS_USER_ID,
        TEST_GUILD_ID,
        "trivia_wins_10",
      );

      expect(hasUnlocked.isOk()).toBe(true);
      if (hasUnlocked.isOk()) {
        expect(hasUnlocked.unwrap()).toBe(true);
      }
    });

    test("should track store purchases via hook", async () => {
      // Make 20 purchases
      for (let i = 0; i < 20; i++) {
        await trackStorePurchase(HOOKS_USER_ID, TEST_GUILD_ID, `item_${i}`);
      }

      const hasUnlocked = await achievementRepo.hasUnlocked(
        HOOKS_USER_ID,
        TEST_GUILD_ID,
        "store_purchases_20",
      );

      expect(hasUnlocked.isOk()).toBe(true);
      if (hasUnlocked.isOk()) {
        expect(hasUnlocked.unwrap()).toBe(true);
      }
    });

    test("should track quest completions via hook", async () => {
      // Complete 10 quests
      for (let i = 0; i < 10; i++) {
        await trackQuestCompletion(HOOKS_USER_ID, TEST_GUILD_ID, `quest_${i}`);
      }

      const hasUnlocked = await achievementRepo.hasUnlocked(
        HOOKS_USER_ID,
        TEST_GUILD_ID,
        "quest_completions_10",
      );

      expect(hasUnlocked.isOk()).toBe(true);
      if (hasUnlocked.isOk()) {
        expect(hasUnlocked.unwrap()).toBe(true);
      }
    });

    test("should track votes via hook", async () => {
      // Cast 50 votes
      for (let i = 0; i < 50; i++) {
        await trackVoteCastForAchievements(
          HOOKS_USER_ID,
          TEST_GUILD_ID,
          i % 2 === 0 ? "love" : "hate",
        );
      }

      const hasUnlocked = await achievementRepo.hasUnlocked(
        HOOKS_USER_ID,
        TEST_GUILD_ID,
        "votes_cast_50",
      );

      expect(hasUnlocked.isOk()).toBe(true);
      if (hasUnlocked.isOk()) {
        expect(hasUnlocked.unwrap()).toBe(true);
      }
    });

    test("should track coinflip streak (win)", async () => {
      // Win 5 times
      for (let i = 0; i < 5; i++) {
        await trackCoinflipResult(HOOKS_USER_ID, TEST_GUILD_ID, true);
      }

      const progress = await achievementRepo.getOrCreateProgress(
        HOOKS_USER_ID,
        TEST_GUILD_ID,
        "coinflip_streak_5",
        5,
      );

      expect(progress.isOk()).toBe(true);
      if (progress.isOk()) {
        expect(progress.unwrap().progress).toBe(5);
      }
    });

    test("should reset coinflip streak on loss", async () => {
      await trackCoinflipResult(HOOKS_USER_ID, TEST_GUILD_ID, false);

      const progress = await achievementRepo.getOrCreateProgress(
        HOOKS_USER_ID,
        TEST_GUILD_ID,
        "coinflip_streak_5",
        5,
      );

      expect(progress.isOk()).toBe(true);
      if (progress.isOk()) {
        expect(progress.unwrap().progress).toBe(0);
      }
    });
  });

  // ============================================================================
  // Title Management
  // ============================================================================

  describe("Title Management", () => {
    const TITLE_USER_ID = "test_title_user";

    beforeAll(async () => {
      const db = await import("@/db/mongo").then((m) => m.getDb());
      await db
        .collection("achievements_unlocked")
        .deleteMany({ userId: TITLE_USER_ID, guildId: TEST_GUILD_ID } as any);
      await db
        .collection("achievements_progress")
        .deleteMany({ userId: TITLE_USER_ID, guildId: TEST_GUILD_ID } as any);
      await db
        .collection("achievements_cosmetics")
        .deleteMany({ userId: TITLE_USER_ID, guildId: TEST_GUILD_ID } as any);
      await economyAccountRepo.ensure(TITLE_USER_ID);
    });

    test("should grant title on achievement unlock", async () => {
      // Unlock streak_7 which grants a title
      await achievementService.updateProgress(
        TITLE_USER_ID,
        TEST_GUILD_ID,
        "streak_milestone",
        7,
      );

      const cosmetics = await achievementRepo.getOrCreateCosmetics(
        TITLE_USER_ID,
        TEST_GUILD_ID,
      );

      expect(cosmetics.isOk()).toBe(true);
      if (cosmetics.isOk()) {
        const hasTitle = cosmetics
          .unwrap()
          .titles.some((t) => t.sourceAchievementId === "streak_7");
        expect(hasTitle).toBe(true);
      }
    });

    test("should equip a title", async () => {
      const result = await achievementService.equipTitle({
        userId: TITLE_USER_ID,
        guildId: TEST_GUILD_ID,
        titleId: "title_constant",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().titleId).toBe("title_constant");
      }
    });

    test("should get equipped title", async () => {
      const result = await achievementService.getEquippedTitle(
        TITLE_USER_ID,
        TEST_GUILD_ID,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap()).not.toBeNull();
        expect(result.unwrap()?.titleId).toBe("title_constant");
      }
    });

    test("should list all titles", async () => {
      const result = await achievementService.getTitles(
        TITLE_USER_ID,
        TEST_GUILD_ID,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().length).toBeGreaterThan(0);
        const equipped = result.unwrap().find((t) => t.isEquipped);
        expect(equipped).toBeDefined();
      }
    });

    test("should unequip title", async () => {
      const result = await achievementService.unequipTitle(
        TITLE_USER_ID,
        TEST_GUILD_ID,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap()).toBe(true);
      }

      const equipped = await achievementService.getEquippedTitle(
        TITLE_USER_ID,
        TEST_GUILD_ID,
      );

      expect(equipped.isOk()).toBe(true);
      if (equipped.isOk()) {
        expect(equipped.unwrap()).toBeNull();
      }
    });
  });

  // ============================================================================
  // Badge Management
  // ============================================================================

  describe("Badge Management", () => {
    const BADGE_USER_ID = "test_badge_user";

    beforeAll(async () => {
      const db = await import("@/db/mongo").then((m) => m.getDb());
      await db
        .collection("achievements_unlocked")
        .deleteMany({ userId: BADGE_USER_ID, guildId: TEST_GUILD_ID } as any);
      await db
        .collection("achievements_progress")
        .deleteMany({ userId: BADGE_USER_ID, guildId: TEST_GUILD_ID } as any);
      await db
        .collection("achievements_cosmetics")
        .deleteMany({ userId: BADGE_USER_ID, guildId: TEST_GUILD_ID } as any);
      await economyAccountRepo.ensure(BADGE_USER_ID);
    });

    test("should grant badge on achievement unlock", async () => {
      // Unlock streak_30 which grants a badge
      await achievementService.updateProgress(
        BADGE_USER_ID,
        TEST_GUILD_ID,
        "streak_milestone",
        30,
      );

      const cosmetics = await achievementRepo.getOrCreateCosmetics(
        BADGE_USER_ID,
        TEST_GUILD_ID,
      );

      expect(cosmetics.isOk()).toBe(true);
      if (cosmetics.isOk()) {
        const hasBadge = cosmetics
          .unwrap()
          .badges.some((b) => b.sourceAchievementId === "streak_30");
        expect(hasBadge).toBe(true);
      }
    });

    test("should set badge slot", async () => {
      const cosmetics = await achievementRepo.getOrCreateCosmetics(
        BADGE_USER_ID,
        TEST_GUILD_ID,
      );

      let badgeId: string | undefined;
      if (cosmetics.isOk()) {
        badgeId = cosmetics.unwrap().badges[0]?.id;
      }

      if (badgeId) {
        const result = await achievementService.setBadgeSlot(
          BADGE_USER_ID,
          TEST_GUILD_ID,
          1,
          badgeId,
        );

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.unwrap()).toBe(true);
        }
      }
    });

    test("should get equipped badges", async () => {
      const result = await achievementService.getEquippedBadges(
        BADGE_USER_ID,
        TEST_GUILD_ID,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().length).toBe(3); // Always 3 slots
      }
    });
  });

  // ============================================================================
  // Reward Claiming
  // ============================================================================

  describe("Reward Claiming", () => {
    const REWARD_USER_ID = "test_reward_user";

    beforeAll(async () => {
      const db = await import("@/db/mongo").then((m) => m.getDb());
      await db
        .collection("achievements_unlocked")
        .deleteMany({ userId: REWARD_USER_ID, guildId: TEST_GUILD_ID } as any);
      await db
        .collection("achievements_progress")
        .deleteMany({ userId: REWARD_USER_ID, guildId: TEST_GUILD_ID } as any);
      await economyAccountRepo.ensure(REWARD_USER_ID);
    });

    test("should claim rewards for unlocked achievement", async () => {
      // Unlock an achievement first
      await achievementService.updateProgress(
        REWARD_USER_ID,
        TEST_GUILD_ID,
        "level_milestone",
        3,
      );

      const claimResult = await achievementService.claimRewards({
        userId: REWARD_USER_ID,
        guildId: TEST_GUILD_ID,
        achievementId: "level_3",
      });

      expect(claimResult.isOk()).toBe(true);
      if (claimResult.isOk()) {
        expect(claimResult.unwrap().rewards.length).toBeGreaterThan(0);
        expect(claimResult.unwrap().correlationId).toBeDefined();
      }
    });

    test("should not allow claiming twice", async () => {
      const claimResult = await achievementService.claimRewards({
        userId: REWARD_USER_ID,
        guildId: TEST_GUILD_ID,
        achievementId: "level_3",
      });

      expect(claimResult.isErr()).toBe(true);
      if (claimResult.isErr()) {
        expect(claimResult.error.code).toBe("REWARDS_ALREADY_CLAIMED");
      }
    });

    test("should not allow claiming unowned achievement", async () => {
      const claimResult = await achievementService.claimRewards({
        userId: REWARD_USER_ID,
        guildId: TEST_GUILD_ID,
        achievementId: "level_12",
      });

      expect(claimResult.isErr()).toBe(true);
      if (claimResult.isErr()) {
        expect(claimResult.error.code).toBe("ACHIEVEMENT_NOT_UNLOCKED");
      }
    });
  });
});
