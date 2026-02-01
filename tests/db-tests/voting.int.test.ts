/**
 * Voting System Integration Tests.
 */
import { beforeAll, afterAll, describe, expect, it } from "bun:test";
import { connectDb, disconnectDb, getDb } from "@/db/mongo";
import { votingService, votingRepo } from "@/modules/economy/voting";
import {
  economyAccountRepo,
  createEconomyAccountService,
} from "@/modules/economy/account";

const TEST_USER_1 = "voting_user_001";
const TEST_USER_2 = "voting_user_002";
const TEST_USER_3 = "voting_user_003";
const TEST_GUILD = "voting_guild_001";

describe("Voting System Integration", () => {
  const accountService = createEconomyAccountService(economyAccountRepo);

  beforeAll(async () => {
    await connectDb();
    const db = getDb();
    await db
      .collection("users")
      .deleteMany({ id: { $in: [TEST_USER_1, TEST_USER_2, TEST_USER_3] } });
    await db.collection("guilds").deleteMany({ _id: TEST_GUILD });
    await db.collection("votes").deleteMany({ guildId: TEST_GUILD });

    // Create test accounts
    await accountService.ensureAccount(TEST_USER_1);
    await accountService.ensureAccount(TEST_USER_2);
    await accountService.ensureAccount(TEST_USER_3);
  });

  afterAll(async () => {
    const db = getDb();
    await db
      .collection("users")
      .deleteMany({ id: { $in: [TEST_USER_1, TEST_USER_2, TEST_USER_3] } });
    await db.collection("guilds").deleteMany({ _id: TEST_GUILD });
    await db.collection("votes").deleteMany({ guildId: TEST_GUILD });
    await disconnectDb();
  });

  // ============================================================================
  // Basic Voting
  // ============================================================================

  describe("Cast Vote", () => {
    it("should fail with self-vote", async () => {
      const result = await votingService.castVote({
        guildId: TEST_GUILD,
        voterId: TEST_USER_1,
        targetId: TEST_USER_1,
        type: "love",
      });

      expect(result.isErr()).toBe(true);
      expect(result.error?.code).toBe("SELF_VOTE");
    });

    it("should cast a love vote successfully", async () => {
      const result = await votingService.castVote({
        guildId: TEST_GUILD,
        voterId: TEST_USER_1,
        targetId: TEST_USER_2,
        type: "love",
      });

      expect(result.isOk()).toBe(true);

      const vote = result.unwrap();
      expect(vote.success).toBe(true);
      expect(vote.targetStats.loveCount).toBe(1);
      expect(vote.targetStats.hateCount).toBe(0);
      expect(vote.correlationId).toBeDefined();
    });

    it("should cast a hate vote successfully", async () => {
      const result = await votingService.castVote({
        guildId: TEST_GUILD,
        voterId: TEST_USER_1,
        targetId: TEST_USER_3,
        type: "hate",
      });

      expect(result.isOk()).toBe(true);

      const vote = result.unwrap();
      expect(vote.success).toBe(true);
      expect(vote.targetStats.hateCount).toBe(1);
    });

    it("should update voter stats", async () => {
      const stats = await votingService.getUserStats(TEST_GUILD, TEST_USER_1);
      expect(stats.isOk()).toBe(true);
      expect(stats.unwrap().dailyVoteCount).toBeGreaterThan(0);
    });

    it("should prevent same vote type on same target", async () => {
      // First vote succeeds
      await votingService.resetDailyLimits(TEST_GUILD, TEST_USER_2);

      const result = await votingService.castVote({
        guildId: TEST_GUILD,
        voterId: TEST_USER_2,
        targetId: TEST_USER_3,
        type: "love",
      });
      expect(result.isOk()).toBe(true);

      // Same vote again should fail
      const result2 = await votingService.castVote({
        guildId: TEST_GUILD,
        voterId: TEST_USER_2,
        targetId: TEST_USER_3,
        type: "love",
      });

      expect(result2.isErr()).toBe(true);
      expect(result2.error?.code).toBe("SAME_VOTE_TYPE");
    });
  });

  // ============================================================================
  // Cooldowns and Limits
  // ============================================================================

  describe("Cooldowns", () => {
    it("should enforce daily limit", async () => {
      const config = await votingRepo.getConfig(TEST_GUILD);
      const dailyMax = config.unwrap().dailyMaxVotes;

      // Reset daily limits for clean test
      await votingService.resetDailyLimits(TEST_GUILD, "daily_limit_test_user");
      await accountService.ensureAccount("daily_limit_test_user");

      // Cast votes up to limit
      for (let i = 0; i < dailyMax; i++) {
        await votingService.resetDailyLimits(
          TEST_GUILD,
          "daily_limit_test_user",
        );

        const result = await votingService.castVote({
          guildId: TEST_GUILD,
          voterId: "daily_limit_test_user",
          targetId: `target_${i}`,
          type: "love",
        });

        // Reset between votes to bypass cooldown
        if (result.isErr() && result.error?.code === "COOLDOWN_ACTIVE") {
          await votingService.resetDailyLimits(
            TEST_GUILD,
            "daily_limit_test_user",
          );
        }
      }

      // Cleanup
      const db = getDb();
      await db.collection("users").deleteMany({ id: "daily_limit_test_user" });
    });

    it("should check canVote status", async () => {
      const result = await votingService.canVote(
        TEST_GUILD,
        TEST_USER_1,
        TEST_USER_2,
      );
      expect(result.isOk()).toBe(true);

      const status = result.unwrap();
      expect(typeof status.canVote).toBe("boolean");
    });
  });

  // ============================================================================
  // Opt-out
  // ============================================================================

  describe("Opt-out", () => {
    it("should toggle opt-out status", async () => {
      const result = await votingService.toggleOptOut(TEST_USER_2);
      expect(result.isOk()).toBe(true);

      const newState = result.unwrap();
      expect(typeof newState).toBe("boolean");
    });

    it("should prevent voting on opted-out users", async () => {
      // Ensure user is opted out
      await votingService.updateUserPrefs(TEST_USER_2, { optOut: true });

      const result = await votingService.castVote({
        guildId: TEST_GUILD,
        voterId: TEST_USER_1,
        targetId: TEST_USER_2,
        type: "love",
      });

      expect(result.isErr()).toBe(true);
      expect(result.error?.code).toBe("TARGET_OPTED_OUT");

      // Reset
      await votingService.updateUserPrefs(TEST_USER_2, { optOut: false });
    });

    it("should get user preferences", async () => {
      const result = await votingService.getUserPrefs(TEST_USER_1);
      expect(result.isOk()).toBe(true);

      const prefs = result.unwrap();
      expect(typeof prefs.optOut).toBe("boolean");
      expect(typeof prefs.showVotes).toBe("boolean");
    });
  });

  // ============================================================================
  // Aggregates and Badges
  // ============================================================================

  describe("Aggregates", () => {
    it("should track aggregates correctly", async () => {
      const result = await votingRepo.getAggregates(TEST_GUILD, TEST_USER_3);
      expect(result.isOk()).toBe(true);

      const agg = result.unwrap();
      expect(typeof agg.loveReceived).toBe("number");
      expect(typeof agg.hateReceived).toBe("number");
    });

    it("should get user badges", async () => {
      const result = await votingService.getUserBadges(TEST_GUILD, TEST_USER_1);
      expect(result.isOk()).toBe(true);

      const badges = result.unwrap();
      expect(Array.isArray(badges)).toBe(true);
    });
  });

  // ============================================================================
  // Stats
  // ============================================================================

  describe("Stats", () => {
    it("should get user stats", async () => {
      const result = await votingService.getUserStats(TEST_GUILD, TEST_USER_1);
      expect(result.isOk()).toBe(true);

      const stats = result.unwrap();
      expect(stats.userId).toBe(TEST_USER_1);
      expect(typeof stats.loveCount).toBe("number");
      expect(typeof stats.hateCount).toBe("number");
      expect(stats.netScore).toBe(stats.loveCount - stats.hateCount);
    });

    it("should reset daily limits", async () => {
      const result = await votingService.resetDailyLimits(
        TEST_GUILD,
        TEST_USER_1,
      );
      expect(result.isOk()).toBe(true);

      const stats = await votingService.getUserStats(TEST_GUILD, TEST_USER_1);
      expect(stats.unwrap().dailyVoteCount).toBe(0);
    });
  });

  // ============================================================================
  // Configuration
  // ============================================================================

  describe("Configuration", () => {
    it("should get config", async () => {
      const result = await votingRepo.getConfig(TEST_GUILD);
      expect(result.isOk()).toBe(true);

      const config = result.unwrap();
      expect(typeof config.enabled).toBe("boolean");
      expect(typeof config.dailyMaxVotes).toBe("number");
      expect(typeof config.cooldownSeconds).toBe("number");
    });

    it("should update config", async () => {
      const result = await votingRepo.updateConfig(TEST_GUILD, {
        dailyMaxVotes: 25,
      });
      expect(result.isOk()).toBe(true);

      const config = result.unwrap();
      expect(config.dailyMaxVotes).toBe(25);

      // Reset
      await votingRepo.updateConfig(TEST_GUILD, { dailyMaxVotes: 20 });
    });
  });

  // ============================================================================
  // History
  // ============================================================================

  describe("Vote History", () => {
    it("should get vote history", async () => {
      const result = await votingRepo.getVoteHistory({
        guildId: TEST_GUILD,
        limit: 10,
      });

      expect(result.isOk()).toBe(true);

      const history = result.unwrap();
      expect(Array.isArray(history)).toBe(true);
    });

    it("should get last vote between users", async () => {
      const result = await votingRepo.getLastVote(
        TEST_GUILD,
        TEST_USER_1,
        TEST_USER_2,
      );
      expect(result.isOk()).toBe(true);
    });
  });
});
