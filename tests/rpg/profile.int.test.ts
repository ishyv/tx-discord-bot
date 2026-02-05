/**
 * RPG Profile Integration Tests.
 *
 * Purpose: Test profile auto-creation and economy gating.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { rpgProfileService } from "@/modules/rpg/profile/service";
import { rpgProfileRepo } from "@/modules/rpg/profile/repository";
import { economyAccountRepo } from "@/modules/economy/account/repository";
import { connectToDatabase, disconnectFromDatabase } from "@/db/mongo";
import { UserStore } from "@/db/repositories/users";

describe("RPG Profile Integration", () => {
  const testUserId = "test_rpg_user_1";

  beforeAll(async () => {
    await connectToDatabase();
    // Clean up test user
    const col = await UserStore.collection();
    await col.deleteOne({ _id: testUserId });
  });

  afterAll(async () => {
    // Clean up
    const col = await UserStore.collection();
    await col.deleteOne({ _id: testUserId });
    await disconnectFromDatabase();
  });

  describe("Profile Auto-Creation", () => {
    test("should auto-create profile when economy account exists", async () => {
      // First ensure economy account
      const accountResult = await economyAccountRepo.ensure(testUserId);
      expect(accountResult.isOk()).toBe(true);

      // Now ensure RPG profile
      const result = await rpgProfileService.ensure(testUserId);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const { profile, isNew } = result.unwrap();
        expect(isNew).toBe(true);
        expect(profile.userId).toBe(testUserId);
        expect(profile.combat.isFighting).toBe(false);
        expect(profile.record.wins).toBe(0);
        expect(profile.record.losses).toBe(0);
      }
    });

    test("should return existing profile on second ensure", async () => {
      const result = await rpgProfileService.ensure(testUserId);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const { isNew } = result.unwrap();
        expect(isNew).toBe(false);
      }
    });
  });

  describe("Economy Gating", () => {
    const blockedUserId = "test_rpg_blocked_1";

    beforeAll(async () => {
      // Create blocked account
      const accountResult = await economyAccountRepo.ensure(blockedUserId);
      if (accountResult.isOk()) {
        const { account } = accountResult.unwrap();
        await economyAccountRepo.updateStatus(blockedUserId, "blocked", account.version);
      }
    });

    afterAll(async () => {
      const col = await UserStore.collection();
      await col.deleteOne({ _id: blockedUserId });
    });

    test("should reject profile creation for blocked account", async () => {
      const result = await rpgProfileService.ensure(blockedUserId);
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.code).toBe("ACCOUNT_BLOCKED");
      }
    });

    test("should check RPG permission correctly", async () => {
      const canUseResult = await rpgProfileService.canUseRpg(blockedUserId);
      expect(canUseResult.isOk()).toBe(true);

      if (canUseResult.isOk()) {
        const { allowed, reason } = canUseResult.unwrap();
        expect(allowed).toBe(false);
        expect(reason).toContain("blocked");
      }
    });
  });

  describe("Profile Retrieval", () => {
    test("should retrieve existing profile", async () => {
      const result = await rpgProfileService.getProfile(testUserId);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const profile = result.unwrap();
        expect(profile).not.toBeNull();
        expect(profile?.userId).toBe(testUserId);
      }
    });

    test("should return null for non-existent profile", async () => {
      const result = await rpgProfileService.getProfile("non_existent_user_12345");
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        expect(result.unwrap()).toBeNull();
      }
    });
  });
});
