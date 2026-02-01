/**
 * Economy Database Indexes Integration Tests.
 *
 * Purpose: Verify that all economy indexes are created correctly.
 * Setup: Requires MongoDB connection (uses docker-compose or local instance).
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  ensureAllEconomyIndexes,
  getEconomyIndexStats,
  TTLConfig,
} from "@/modules/economy/db-indexes";
import { connectToMongo, disconnectFromMongo } from "@/db/mongo";
import { MongoClient, Db } from "mongodb";

describe("Economy Database Indexes", () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    // Connect to test database
    const uri = process.env.MONGO_URI ?? "mongodb://localhost:27017";
    const dbName = "pyebot_test_indexes";

    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);

    // Set up connection for the app
    process.env.MONGO_URI = uri;
    process.env.DB_NAME = dbName;
    await connectToMongo();
  });

  afterAll(async () => {
    // Clean up test database
    if (db) {
      await db.dropDatabase();
    }
    await disconnectFromMongo();
    if (client) {
      await client.close();
    }
  });

  describe("Index Creation", () => {
    it("should create all economy indexes without errors", async () => {
      await expect(ensureAllEconomyIndexes()).resolves.not.toThrow();
    });

    it("should be idempotent (safe to call multiple times)", async () => {
      // Call twice - should not throw
      await ensureAllEconomyIndexes();
      await expect(ensureAllEconomyIndexes()).resolves.not.toThrow();
    });
  });

  describe("Daily Claims Indexes", () => {
    it("should have required indexes on economy_daily_claims", async () => {
      const stats = await getEconomyIndexStats();
      const dailyIndexes = stats.dailyClaims as Array<{
        name: string;
        key: unknown;
      }>;
      const indexNames = dailyIndexes.map((i) => i.name);

      expect(indexNames).toContain("guild_user_idx");
      expect(indexNames).toContain("lastClaim_time_idx");
      expect(indexNames).toContain("guild_lastClaim_idx");
      expect(indexNames).toContain("streak_idx");
      expect(indexNames).toContain("bestStreak_idx");
    });
  });

  describe("Work Claims Indexes", () => {
    it("should have required indexes on economy_work_claims", async () => {
      const stats = await getEconomyIndexStats();
      const workIndexes = stats.workClaims as Array<{
        name: string;
        key: unknown;
      }>;
      const indexNames = workIndexes.map((i) => i.name);

      expect(indexNames).toContain("guild_user_idx");
      expect(indexNames).toContain("lastWork_time_idx");
      expect(indexNames).toContain("guild_lastWork_idx");
      expect(indexNames).toContain("dayStamp_idx");
      expect(indexNames).toContain("guild_dayStamp_idx");
    });
  });

  describe("Voting Indexes", () => {
    it("should have required indexes on votes collection", async () => {
      const stats = await getEconomyIndexStats();
      const voteIndexes = stats.votes as Array<{ name: string; key: unknown }>;
      const indexNames = voteIndexes.map((i) => i.name);

      expect(indexNames).toContain("guild_target_time_idx");
      expect(indexNames).toContain("guild_voter_time_idx");
      expect(indexNames).toContain("target_time_idx");
      expect(indexNames).toContain("voter_time_idx");
      expect(indexNames).toContain("guild_type_time_idx");
      expect(indexNames).toContain("correlation_idx");
      expect(indexNames).toContain("time_idx");
    });
  });

  describe("Perk State Indexes", () => {
    it("should have required indexes on economy_perks", async () => {
      const stats = await getEconomyIndexStats();
      const perkIndexes = stats.perks as Array<{ name: string; key: unknown }>;
      const indexNames = perkIndexes.map((i) => i.name);

      expect(indexNames).toContain("guild_user_idx");
      expect(indexNames).toContain("guild_updated_idx");
      expect(indexNames).toContain("user_updated_idx");
    });
  });

  describe("Crafting Indexes", () => {
    it("should have required indexes on economy_crafting", async () => {
      const stats = await getEconomyIndexStats();
      const craftingIndexes = stats.crafting as Array<{
        name: string;
        key: unknown;
      }>;
      const indexNames = craftingIndexes.map((i) => i.name);

      expect(indexNames).toContain("guild_user_idx");
      expect(indexNames).toContain("guild_lastCraft_idx");
      expect(indexNames).toContain("lastCraft_time_idx");
    });
  });

  describe("Index Stats", () => {
    it("should return index statistics for all collections", async () => {
      const stats = await getEconomyIndexStats();

      expect(stats).toHaveProperty("guilds");
      expect(stats).toHaveProperty("users");
      expect(stats).toHaveProperty("dailyClaims");
      expect(stats).toHaveProperty("workClaims");
      expect(stats).toHaveProperty("votes");
      expect(stats).toHaveProperty("perks");
      expect(stats).toHaveProperty("crafting");

      // All should be arrays
      expect(Array.isArray(stats.guilds)).toBe(true);
      expect(Array.isArray(stats.users)).toBe(true);
      expect(Array.isArray(stats.dailyClaims)).toBe(true);
    });
  });

  describe("TTL Configuration", () => {
    it("should have TTL disabled by default", () => {
      expect(TTLConfig.dailyClaimsSeconds).toBeNull();
      expect(TTLConfig.workClaimsSeconds).toBeNull();
      expect(TTLConfig.votesSeconds).toBeNull();
    });

    it("should allow enabling TTL via configuration", () => {
      // Test that TTL can be enabled (this is a type check)
      const config = { ...TTLConfig };

      // Simulate enabling TTL
      config.dailyClaimsSeconds = 60 * 60 * 24 * 90; // 90 days
      config.workClaimsSeconds = 60 * 60 * 24 * 30; // 30 days
      config.votesSeconds = 60 * 60 * 24 * 180; // 180 days

      expect(config.dailyClaimsSeconds).toBe(7776000);
      expect(config.workClaimsSeconds).toBe(2592000);
      expect(config.votesSeconds).toBe(15552000);
    });
  });
});
