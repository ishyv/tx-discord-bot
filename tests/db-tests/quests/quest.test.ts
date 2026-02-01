/**
 * Quest System Integration Tests.
 *
 * Purpose: Test quest template creation, rotation, progress tracking, and rewards.
 * Context: Run against test database.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { initDb, closeDb } from "@/db/mongo";
import { questRepo } from "@/modules/economy/quests/repository";
import { questService } from "@/modules/economy/quests/service";
import { questRotationService } from "@/modules/economy/quests/rotation";
import {
  trackCommandUsage,
  trackCrafting,
} from "@/modules/economy/quests/hooks";
import { QuestError } from "@/modules/economy/quests/types";
import { economyAccountRepo } from "@/modules/economy/account/repository";

describe("Quest System Integration", () => {
  const TEST_GUILD_ID = "test_guild_quests";
  const TEST_USER_ID = "test_user_quests";
  const TEST_ADMIN_ID = "test_admin_quests";

  beforeAll(async () => {
    await initDb();

    // Clean up any existing test data
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

    // Ensure test user has an economy account
    await economyAccountRepo.ensure(TEST_USER_ID);
  });

  afterAll(async () => {
    await closeDb();
  });

  describe("Quest Templates", () => {
    test("should create a quest template", async () => {
      const result = await questRepo.createTemplate(
        TEST_GUILD_ID,
        {
          id: "test_quest_1",
          name: "Test Quest",
          description: "A test quest for integration testing",
          category: "general",
          difficulty: "easy",
          requirements: [{ type: "do_command", command: "test", count: 3 }],
          rewards: [{ type: "currency", currencyId: "coins", amount: 100 }],
        },
        TEST_ADMIN_ID,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().id).toBe("test_quest_1");
        expect(result.unwrap().name).toBe("Test Quest");
      }
    });

    test("should not allow duplicate quest IDs", async () => {
      const result = await questRepo.createTemplate(
        TEST_GUILD_ID,
        {
          id: "test_quest_1", // Same as before
          name: "Duplicate Quest",
          description: "Should fail",
          category: "general",
          difficulty: "easy",
          requirements: [],
          rewards: [],
        },
        TEST_ADMIN_ID,
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("DUPLICATE_QUEST_ID");
      }
    });

    test("should list quest templates", async () => {
      // Create another template
      await questRepo.createTemplate(
        TEST_GUILD_ID,
        {
          id: "test_quest_2",
          name: "Second Test Quest",
          description: "Another test quest",
          category: "economy",
          difficulty: "medium",
          requirements: [
            { type: "spend_currency", currencyId: "coins", amount: 500 },
          ],
          rewards: [
            { type: "currency", currencyId: "coins", amount: 200 },
            { type: "xp", amount: 50 },
          ],
        },
        TEST_ADMIN_ID,
      );

      const result = await questRepo.getTemplates(TEST_GUILD_ID);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe("Quest Rotations", () => {
    test("should generate daily rotation", async () => {
      const result =
        await questRotationService.generateDailyRotation(TEST_GUILD_ID);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const rotation = result.unwrap();
        expect(rotation.guildId).toBe(TEST_GUILD_ID);
        expect(rotation.type).toBe("daily");
        expect(rotation.questIds.length).toBeGreaterThan(0);
        expect(rotation.endsAt > rotation.startsAt).toBe(true);
      }
    });

    test("should generate weekly rotation", async () => {
      const result =
        await questRotationService.generateWeeklyRotation(TEST_GUILD_ID);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const rotation = result.unwrap();
        expect(rotation.guildId).toBe(TEST_GUILD_ID);
        expect(rotation.type).toBe("weekly");
        expect(rotation.questIds.length).toBeGreaterThan(0);
      }
    });

    test("should get current rotation", async () => {
      const result = await questRepo.getCurrentRotation(TEST_GUILD_ID, "daily");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap()).not.toBeNull();
      }
    });
  });

  describe("Quest Progress", () => {
    test("should get or create progress", async () => {
      const rotation = await questRepo.getCurrentRotation(
        TEST_GUILD_ID,
        "daily",
      );
      expect(rotation.isOk()).toBe(true);
      if (rotation.isErr() || !rotation.unwrap()) {
        throw new Error("No rotation found");
      }

      const rotationId = rotation.unwrap()!.id;
      const questId = rotation.unwrap()!.questIds[0];

      const result = await questRepo.getOrCreateProgress(
        TEST_USER_ID,
        TEST_GUILD_ID,
        rotationId,
        questId,
        1,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().userId).toBe(TEST_USER_ID);
        expect(result.unwrap().completed).toBe(false);
        expect(result.unwrap().requirementProgress).toEqual([0]);
      }
    });

    test("should update progress", async () => {
      const rotation = await questRepo.getCurrentRotation(
        TEST_GUILD_ID,
        "daily",
      );
      if (rotation.isErr() || !rotation.unwrap()) {
        throw new Error("No rotation found");
      }

      const rotationId = rotation.unwrap()!.id;
      const questId = rotation.unwrap()!.questIds[0];

      const result = await questRepo.updateProgress(
        TEST_USER_ID,
        rotationId,
        questId,
        0, // First requirement
        1,
        10,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().requirementProgress[0]).toBe(1);
      }
    });

    test("should track progress via hooks", async () => {
      // First, create a quest with "do_command" requirement
      await questRepo.createTemplate(
        TEST_GUILD_ID,
        {
          id: "command_quest",
          name: "Command Quest",
          description: "Use the work command",
          category: "economy",
          difficulty: "easy",
          requirements: [{ type: "do_command", command: "work", count: 1 }],
          rewards: [{ type: "currency", currencyId: "coins", amount: 50 }],
          maxCompletions: 5,
        },
        TEST_ADMIN_ID,
      );

      // Force a fresh rotation
      const rotation =
        await questRotationService.generateDailyRotation(TEST_GUILD_ID);
      expect(rotation.isOk()).toBe(true);

      // Track command usage
      const result = await trackCommandUsage(
        TEST_USER_ID,
        TEST_GUILD_ID,
        "work",
      );
      expect(result.isOk()).toBe(true);
    });
  });

  describe("Quest Completion", () => {
    test("should not complete quest if requirements not met", async () => {
      const rotation = await questRepo.getCurrentRotation(
        TEST_GUILD_ID,
        "daily",
      );
      if (rotation.isErr() || !rotation.unwrap()) {
        throw new Error("No rotation found");
      }

      const rotationId = rotation.unwrap()!.id;
      const questId = rotation.unwrap()!.questIds[0];

      const result = await questService.checkAndCompleteQuest(
        TEST_USER_ID,
        rotationId,
        questId,
      );
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("QUEST_NOT_COMPLETED");
      }
    });
  });

  describe("Quest Board View", () => {
    test("should get quest board for user", async () => {
      const result = await questService.getQuestBoard(
        TEST_GUILD_ID,
        TEST_USER_ID,
      );
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const board = result.unwrap();
        expect(board.daily).toBeDefined();
        expect(board.weekly).toBeDefined();
      }
    });

    test("should get quest stats", async () => {
      const result = await questService.getStats(TEST_USER_ID, TEST_GUILD_ID);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const stats = result.unwrap();
        expect(stats.userId).toBe(TEST_USER_ID);
        expect(stats.guildId).toBe(TEST_GUILD_ID);
      }
    });
  });

  describe("Quest Configuration", () => {
    test("should get rotation config", async () => {
      const result = await questRepo.getRotationConfig(TEST_GUILD_ID);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const config = result.unwrap();
        expect(config.dailyQuestCount).toBeGreaterThan(0);
        expect(config.weeklyQuestCount).toBeGreaterThan(0);
      }
    });

    test("should set rotation config", async () => {
      const result = await questRepo.setRotationConfig(TEST_GUILD_ID, {
        dailyQuestCount: 5,
        featuredEnabled: false,
      });
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        expect(result.unwrap().dailyQuestCount).toBe(5);
        expect(result.unwrap().featuredEnabled).toBe(false);
      }
    });
  });
});
