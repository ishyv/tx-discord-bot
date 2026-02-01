/**
 * Quest Rewards Integration Tests.
 *
 * Purpose: Test quest reward claiming, audit logging, and rollback.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { initDb, closeDb } from "@/db/mongo";
import { questRepo } from "@/modules/economy/quests/repository";
import { questService } from "@/modules/economy/quests/service";
import { questRotationService } from "@/modules/economy/quests/rotation";
import { economyAccountRepo } from "@/modules/economy/account/repository";
import { economyAuditRepo } from "@/modules/economy/audit/repository";
import { currencyMutationService } from "@/modules/economy/mutations/service";
import { rollbackByCorrelationId } from "@/modules/economy/rollback";
import { UserStore } from "@/db/repositories/users";

describe("Quest Rewards Integration", () => {
  const TEST_GUILD_ID = "test_guild_rewards";
  const TEST_USER_ID = "test_user_rewards";
  const TEST_ADMIN_ID = "test_admin_rewards";

  beforeAll(async () => {
    await initDb();

    // Clean up
    const db = await import("@/db/mongo").then((m) => m.getDb());
    await db
      .collection("quest_templates")
      .deleteMany({ guildId: TEST_GUILD_ID } as any);
    await db
      .collection("quest_rotations")
      .deleteMany({ guildId: TEST_GUILD_ID } as any);
    await db
      .collection("quest_progress")
      .deleteMany({ userId: TEST_USER_ID } as any);
    await db
      .collection("economy_audit")
      .deleteMany({ guildId: TEST_GUILD_ID } as any);

    // Ensure test user has an economy account and initial balance
    await economyAccountRepo.ensure(TEST_USER_ID);
    await currencyMutationService.adjustCurrencyBalance(
      {
        actorId: TEST_ADMIN_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        currencyId: "coins",
        delta: 1000,
        reason: "Test setup",
      },
      async () => true,
    );
  });

  afterAll(async () => {
    await closeDb();
  });

  test("should complete quest and claim rewards", async () => {
    // Create a quest with simple requirement
    const templateResult = await questRepo.createTemplate(
      TEST_GUILD_ID,
      {
        id: "reward_test_quest",
        name: "Reward Test Quest",
        description: "A quest for testing rewards",
        category: "general",
        difficulty: "easy",
        requirements: [{ type: "do_command", command: "test", count: 1 }],
        rewards: [
          { type: "currency", currencyId: "coins", amount: 100 },
          { type: "xp", amount: 50 },
          { type: "quest_token", amount: 5 },
        ],
        maxCompletions: 1,
      },
      TEST_ADMIN_ID,
    );
    expect(templateResult.isOk()).toBe(true);

    // Generate rotation
    const rotationResult =
      await questRotationService.generateDailyRotation(TEST_GUILD_ID);
    expect(rotationResult.isOk()).toBe(true);

    const rotation = rotationResult.unwrap();
    const questId = "reward_test_quest";

    // Get initial balance
    const initialUser = await UserStore.get(TEST_USER_ID);
    const initialCoins = (initialUser.unwrap()?.currency?.coins as number) ?? 0;

    // Create progress and complete requirement
    await questRepo.getOrCreateProgress(
      TEST_USER_ID,
      TEST_GUILD_ID,
      rotation.id,
      questId,
      1,
    );

    // Update progress to complete requirement
    await questRepo.updateProgress(TEST_USER_ID, rotation.id, questId, 0, 1, 1);

    // Complete quest
    const completeResult = await questService.checkAndCompleteQuest(
      TEST_USER_ID,
      rotation.id,
      questId,
    );
    expect(completeResult.isOk()).toBe(true);

    // Claim rewards
    const claimResult = await questService.claimRewards({
      guildId: TEST_GUILD_ID,
      userId: TEST_USER_ID,
      rotationId: rotation.id,
      questId,
    });
    expect(claimResult.isOk()).toBe(true);

    if (claimResult.isOk()) {
      const claim = claimResult.unwrap();
      expect(claim.rewards.length).toBeGreaterThan(0);
      expect(claim.correlationId).toBeDefined();

      // Verify rewards were applied
      const finalUser = await UserStore.get(TEST_USER_ID);
      const finalCoins = (finalUser.unwrap()?.currency?.coins as number) ?? 0;
      expect(finalCoins).toBeGreaterThan(initialCoins);

      // Verify audit entry
      const auditResult = await economyAuditRepo.findByCorrelationKey(
        claim.correlationId,
      );
      expect(auditResult.isOk()).toBe(true);
      if (auditResult.isOk()) {
        expect(auditResult.unwrap().length).toBeGreaterThan(0);
      }
    }
  });

  test("should not allow double claiming", async () => {
    const rotation = await questRepo.getCurrentRotation(TEST_GUILD_ID, "daily");
    if (rotation.isErr() || !rotation.unwrap()) {
      throw new Error("No rotation found");
    }

    const rotationId = rotation.unwrap()!.id;

    // Try to claim again
    const claimResult = await questService.claimRewards({
      guildId: TEST_GUILD_ID,
      userId: TEST_USER_ID,
      rotationId,
      questId: "reward_test_quest",
    });

    expect(claimResult.isErr()).toBe(true);
    if (claimResult.isErr()) {
      expect(claimResult.error.code).toBe("REWARDS_ALREADY_CLAIMED");
    }
  });

  test("should rollback quest rewards", async () => {
    // Create a new quest for rollback testing
    const templateResult = await questRepo.createTemplate(
      TEST_GUILD_ID,
      {
        id: "rollback_test_quest",
        name: "Rollback Test Quest",
        description: "A quest for testing rollback",
        category: "economy",
        difficulty: "medium",
        requirements: [{ type: "do_command", command: "test2", count: 1 }],
        rewards: [
          { type: "currency", currencyId: "coins", amount: 500 },
          { type: "xp", amount: 100 },
        ],
        maxCompletions: 1,
      },
      TEST_ADMIN_ID,
    );
    expect(templateResult.isOk()).toBe(true);

    // Force new rotation to include this quest
    const rotationResult =
      await questRotationService.generateDailyRotation(TEST_GUILD_ID);
    expect(rotationResult.isOk()).toBe(true);

    const rotation = rotationResult.unwrap();

    // Create and complete progress
    await questRepo.getOrCreateProgress(
      TEST_USER_ID,
      TEST_GUILD_ID,
      rotation.id,
      "rollback_test_quest",
      1,
    );

    await questRepo.updateProgress(
      TEST_USER_ID,
      rotation.id,
      "rollback_test_quest",
      0,
      1,
      1,
    );

    await questService.checkAndCompleteQuest(
      TEST_USER_ID,
      rotation.id,
      "rollback_test_quest",
    );

    // Get balance before claim
    const userBefore = await UserStore.get(TEST_USER_ID);
    const coinsBefore = (userBefore.unwrap()?.currency?.coins as number) ?? 0;

    // Claim rewards
    const claimResult = await questService.claimRewards({
      guildId: TEST_GUILD_ID,
      userId: TEST_USER_ID,
      rotationId: rotation.id,
      questId: "rollback_test_quest",
    });
    expect(claimResult.isOk()).toBe(true);

    const correlationId = claimResult.unwrap().correlationId;

    // Verify balance increased
    const userAfter = await UserStore.get(TEST_USER_ID);
    const coinsAfter = (userAfter.unwrap()?.currency?.coins as number) ?? 0;
    expect(coinsAfter).toBeGreaterThan(coinsBefore);

    // Rollback
    const rollbackResult = await rollbackByCorrelationId({
      correlationId,
      guildId: TEST_GUILD_ID,
      actorId: TEST_ADMIN_ID,
    });
    expect(rollbackResult.isOk()).toBe(true);

    if (rollbackResult.isOk()) {
      expect(rollbackResult.unwrap().entries).toBeGreaterThan(0);
    }
  });

  test("should enforce max completions cap", async () => {
    // Create a quest with low max completions
    const templateResult = await questRepo.createTemplate(
      TEST_GUILD_ID,
      {
        id: "limited_quest",
        name: "Limited Quest",
        description: "Can only be completed once",
        category: "general",
        difficulty: "easy",
        requirements: [{ type: "do_command", command: "limited", count: 1 }],
        rewards: [{ type: "currency", currencyId: "coins", amount: 50 }],
        maxCompletions: 1,
      },
      TEST_ADMIN_ID,
    );
    expect(templateResult.isOk()).toBe(true);

    // Create a rotation with just this quest
    const rotation = await questRepo.createRotation({
      guildId: TEST_GUILD_ID,
      type: "daily",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86400000),
      questIds: ["limited_quest"],
    });
    expect(rotation.isOk()).toBe(true);

    const rotationId = rotation.unwrap().id;

    // Complete the quest
    await questRepo.getOrCreateProgress(
      TEST_USER_ID,
      TEST_GUILD_ID,
      rotationId,
      "limited_quest",
      1,
    );

    await questRepo.updateProgress(
      TEST_USER_ID,
      rotationId,
      "limited_quest",
      0,
      1,
      1,
    );

    const firstComplete = await questRepo.completeQuest(
      TEST_USER_ID,
      rotationId,
      "limited_quest",
      1, // maxCompletions = 1
    );
    expect(firstComplete.isOk()).toBe(true);

    // Try to complete again (should fail)
    const secondComplete = await questRepo.completeQuest(
      TEST_USER_ID,
      rotationId,
      "limited_quest",
      1,
    );
    expect(secondComplete.isErr()).toBe(true);
    if (secondComplete.isErr()) {
      expect(secondComplete.error.code).toBe("MAX_COMPLETIONS_REACHED");
    }
  });
});
