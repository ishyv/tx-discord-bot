/**
 * RPG Profile Foundation Integration Tests.
 *
 * Purpose: Test profile creation, idempotency, and default values.
 * Context: RPG Phase 0 - Profile foundation.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { rpgProfileService } from "@/modules/rpg/profile/service";
import { rpgProfileRepo } from "@/modules/rpg/profile/repository";
import { economyAccountRepo } from "@/modules/economy/account/repository";
import { connectToDatabase, disconnectFromDatabase } from "@/db/mongo";
import { UserStore } from "@/db/repositories/users";

describe("RPG Profile Foundation", () => {
  const testUserId = "test_rpg_foundation_user";
  const blockedUserId = "test_rpg_blocked_user";
  const bannedUserId = "test_rpg_banned_user";

  beforeAll(async () => {
    await connectToDatabase();

    // Clean up test users
    const col = await UserStore.collection();
    await col.deleteMany({
      _id: { $in: [testUserId, blockedUserId, bannedUserId] },
    });
  });

  afterAll(async () => {
    // Clean up
    const col = await UserStore.collection();
    await col.deleteMany({
      _id: { $in: [testUserId, blockedUserId, bannedUserId] },
    });
    await disconnectFromDatabase();
  });

  beforeEach(async () => {
    // Clean specific user before each test
    const col = await UserStore.collection();
    await col.deleteOne({ _id: testUserId });
  });

  describe("ensureProfile", () => {
    test("should create profile with correct default values", async () => {
      const result = await rpgProfileService.ensureProfile(testUserId);

      expect(result.isOk()).toBe(true);
      expect(result.unwrap().isNew).toBe(true);

      const profile = result.unwrap().profile;

      // Check default values
      expect(profile.userId).toBe(testUserId);
      expect(profile.hpCurrent).toBe(100);
      expect(profile.wins).toBe(0);
      expect(profile.losses).toBe(0);
      expect(profile.isFighting).toBe(false);
      expect(profile.activeFightId).toBeNull();
      expect(profile.version).toBe(0);

      // Check loadout defaults (all null)
      expect(profile.loadout.weapon).toBeNull();
      expect(profile.loadout.shield).toBeNull();
      expect(profile.loadout.helmet).toBeNull();
      expect(profile.loadout.chest).toBeNull();
      expect(profile.loadout.pants).toBeNull();
      expect(profile.loadout.boots).toBeNull();
      expect(profile.loadout.ring).toBeNull();
      expect(profile.loadout.necklace).toBeNull();

      // Check timestamps
      expect(profile.createdAt).toBeInstanceOf(Date);
      expect(profile.updatedAt).toBeInstanceOf(Date);
    });

    test("should be idempotent - second call returns existing", async () => {
      // First call creates
      const first = await rpgProfileService.ensureProfile(testUserId);
      expect(first.unwrap().isNew).toBe(true);
      const firstProfile = first.unwrap().profile;

      // Second call returns existing
      const second = await rpgProfileService.ensureProfile(testUserId);
      expect(second.unwrap().isNew).toBe(false);
      const secondProfile = second.unwrap().profile;

      // Same profile
      expect(secondProfile.userId).toBe(firstProfile.userId);
      expect(secondProfile.createdAt.getTime()).toBe(firstProfile.createdAt.getTime());

      // Version unchanged (no repair needed)
      expect(secondProfile.version).toBe(firstProfile.version);
    });

    test("should persist to database", async () => {
      await rpgProfileService.ensureProfile(testUserId);

      // Fetch directly from repo
      const fromRepo = await rpgProfileRepo.findById(testUserId);
      expect(fromRepo.unwrap()).not.toBeNull();
      expect(fromRepo.unwrap()!.userId).toBe(testUserId);
      expect(fromRepo.unwrap()!.hpCurrent).toBe(100);
    });
  });

  describe("ensureAndGate", () => {
    test("should create profile when economy account exists and is ok", async () => {
      // Create economy account first
      await economyAccountRepo.ensure(testUserId);

      const result = await rpgProfileService.ensureAndGate(testUserId);

      expect(result.isOk()).toBe(true);
      expect(result.unwrap().isNew).toBe(true);
      expect(result.unwrap().profile.userId).toBe(testUserId);
    });

    test("should auto-create economy account if missing", async () => {
      const result = await rpgProfileService.ensureAndGate(testUserId);

      expect(result.isOk()).toBe(true);

      // Verify economy account was created
      const account = await economyAccountRepo.findById(testUserId);
      expect(account.unwrap()).not.toBeNull();
      expect(account.unwrap()!.status).toBe("ok");
    });

    test("should reject blocked accounts", async () => {
      // Setup blocked account
      const blockedEnsure = await economyAccountRepo.ensure(blockedUserId);
      const blockedAccount = blockedEnsure.unwrap().account;
      await economyAccountRepo.updateStatus(blockedUserId, "blocked", blockedAccount.version);

      const result = await rpgProfileService.ensureAndGate(blockedUserId);

      expect(result.isErr()).toBe(true);
      expect(result.error!.code).toBe("ACCOUNT_BLOCKED");
    });

    test("should reject banned accounts", async () => {
      // Setup banned account
      const bannedEnsure = await economyAccountRepo.ensure(bannedUserId);
      const bannedAccount = bannedEnsure.unwrap().account;
      await economyAccountRepo.updateStatus(bannedUserId, "banned", bannedAccount.version);

      const result = await rpgProfileService.ensureAndGate(bannedUserId);

      expect(result.isErr()).toBe(true);
      expect(result.error!.code).toBe("ACCOUNT_BANNED");
    });

    test("should be idempotent", async () => {
      await economyAccountRepo.ensure(testUserId);

      // First call
      const first = await rpgProfileService.ensureAndGate(testUserId);
      expect(first.unwrap().isNew).toBe(true);

      // Second call
      const second = await rpgProfileService.ensureAndGate(testUserId);
      expect(second.unwrap().isNew).toBe(false);
    });
  });

  describe("getProfile", () => {
    test("should return null for non-existent profile", async () => {
      const result = await rpgProfileService.getProfile("non_existent_user_12345");
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBeNull();
    });

    test("should return existing profile", async () => {
      await rpgProfileService.ensureProfile(testUserId);

      const result = await rpgProfileService.getProfile(testUserId);
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).not.toBeNull();
      expect(result.unwrap()!.userId).toBe(testUserId);
    });
  });

  describe("canUseRpg", () => {
    test("should allow new users (no account)", async () => {
      const result = await rpgProfileService.canUseRpg("brand_new_user_123");
      expect(result.isOk()).toBe(true);
      expect(result.unwrap().allowed).toBe(true);
    });

    test("should allow ok accounts", async () => {
      await economyAccountRepo.ensure(testUserId);

      const result = await rpgProfileService.canUseRpg(testUserId);
      expect(result.isOk()).toBe(true);
      expect(result.unwrap().allowed).toBe(true);
    });

    test("should reject blocked accounts", async () => {
      await economyAccountRepo.ensure(blockedUserId);
      const account = await economyAccountRepo.findById(blockedUserId);
      await economyAccountRepo.updateStatus(blockedUserId, "blocked", account.unwrap()!.version);

      const result = await rpgProfileService.canUseRpg(blockedUserId);
      expect(result.isOk()).toBe(true);
      expect(result.unwrap().allowed).toBe(false);
      expect(result.unwrap().reason).toContain("blocked");
    });

    test("should reject banned accounts", async () => {
      await economyAccountRepo.ensure(bannedUserId);
      const account = await economyAccountRepo.findById(bannedUserId);
      await economyAccountRepo.updateStatus(bannedUserId, "banned", account.unwrap()!.version);

      const result = await rpgProfileService.canUseRpg(bannedUserId);
      expect(result.isOk()).toBe(true);
      expect(result.unwrap().allowed).toBe(false);
      expect(result.unwrap().reason).toContain("banned");
    });
  });

  describe("ProfileView", () => {
    test("should build profile view with correct stats", async () => {
      await rpgProfileService.ensureProfile(testUserId);

      const viewResult = await rpgProfileService.getProfileView(testUserId, {
        defaultMaxHp: 100,
      });

      expect(viewResult.isOk()).toBe(true);
      const view = viewResult.unwrap()!;

      expect(view.userId).toBe(testUserId);
      expect(view.hpCurrent).toBe(100);
      expect(view.maxHp).toBe(100);
      expect(view.wins).toBe(0);
      expect(view.losses).toBe(0);
      expect(view.winRate).toBe(0);
      expect(view.totalFights).toBe(0);
      expect(view.isFighting).toBe(false);
    });

    test("should calculate win rate correctly", async () => {
      // Manually update wins/losses via repo
      await rpgProfileService.ensureProfile(testUserId);
      await rpgProfileRepo.completeCombat(testUserId, 3, 2, 100);

      const viewResult = await rpgProfileService.getProfileView(testUserId);
      expect(viewResult.unwrap()!.wins).toBe(3);
      expect(viewResult.unwrap()!.losses).toBe(2);
      expect(viewResult.unwrap()!.totalFights).toBe(5);
      expect(viewResult.unwrap()!.winRate).toBe(60);
    });
  });

  describe("Equip/Unequip", () => {
    beforeEach(async () => {
      await rpgProfileService.ensureProfile(testUserId);
    });

    test("should equip item to slot", async () => {
      const result = await rpgProfileService.equip({
        userId: testUserId,
        slot: "weapon",
        itemId: "wooden_sword",
        actorId: testUserId,
      });

      expect(result.isOk()).toBe(true);
      expect(result.unwrap().slot).toBe("weapon");
      expect(result.unwrap().newItemId).toBe("wooden_sword");
      expect(result.unwrap().previousItemId).toBeNull();

      // Verify persisted
      const profile = await rpgProfileRepo.findById(testUserId);
      expect(profile.unwrap()!.loadout.weapon).toBe("wooden_sword");
    });

    test("should unequip item from slot", async () => {
      // First equip
      await rpgProfileService.equip({
        userId: testUserId,
        slot: "weapon",
        itemId: "wooden_sword",
        actorId: testUserId,
      });

      // Then unequip
      const result = await rpgProfileService.equip({
        userId: testUserId,
        slot: "weapon",
        itemId: null,
        actorId: testUserId,
      });

      expect(result.isOk()).toBe(true);
      expect(result.unwrap().newItemId).toBeNull();
      expect(result.unwrap().previousItemId).toBe("wooden_sword");

      // Verify persisted
      const profile = await rpgProfileRepo.findById(testUserId);
      expect(profile.unwrap()!.loadout.weapon).toBeNull();
    });

    test("should reject equip while in combat", async () => {
      // Put in combat
      await rpgProfileRepo.updateCombatState(testUserId, true, "fight_123", 100, false);

      const result = await rpgProfileService.equip({
        userId: testUserId,
        slot: "weapon",
        itemId: "wooden_sword",
        actorId: testUserId,
      });

      expect(result.isErr()).toBe(true);
      expect(result.error!.code).toBe("IN_COMBAT");
    });

    test("should reject equip for non-existent profile", async () => {
      const result = await rpgProfileService.equip({
        userId: "non_existent_user",
        slot: "weapon",
        itemId: "wooden_sword",
        actorId: "non_existent_user",
      });

      expect(result.isErr()).toBe(true);
      expect(result.error!.code).toBe("PROFILE_NOT_FOUND");
    });
  });
});
