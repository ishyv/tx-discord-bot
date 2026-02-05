/**
 * RPG Gathering Integration Tests.
 *
 * Purpose: Test mining and woodcutting:
 * - Tier gate enforced
 * - Durability decrement
 * - Tool break destroys and clears equipment slot
 * - Yields in 2-5 range
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { UserStore } from "@/db/repositories/users";
import { rpgProfileRepo } from "@/modules/rpg/profile/repository";
import { rpgGatheringService } from "@/modules/rpg/gathering/service";
import { itemInstanceService } from "@/modules/economy/mutations/items/instance-service";
import { rpgEquipmentService } from "@/modules/rpg/equipment/service";
import { normalizeModernInventory, getModernItemQuantity } from "@/modules/inventory/inventory";
import { ITEM_DEFINITIONS } from "@/modules/inventory/definitions";

const TEST_USER_ID = "test_gather_user";
const TEST_ACTOR_ID = "test_actor";
const TEST_GUILD_ID = "test_guild";

async function setupTestUser(): Promise<void> {
  await UserStore.ensure(TEST_USER_ID);
  await rpgProfileRepo.ensure(TEST_USER_ID);
}

async function cleanupTestUser(): Promise<void> {
  await UserStore.delete(TEST_USER_ID);
}

async function getUserInventory() {
  const result = await UserStore.get(TEST_USER_ID);
  if (result.isErr() || !result.unwrap()) {
    return {};
  }
  return normalizeModernInventory(result.unwrap()!.inventory);
}

async function getProfile() {
  const result = await rpgProfileRepo.findById(TEST_USER_ID);
  return result.unwrap();
}

describe("RPG Gathering", () => {
  beforeAll(async () => {
    // Verify items exist
    expect(ITEM_DEFINITIONS.pickaxe).toBeDefined();
    expect(ITEM_DEFINITIONS.axe).toBeDefined();
  });

  afterAll(async () => {
    await cleanupTestUser();
  });

  describe("mine", () => {
    it("should mine with tier 1 pickaxe at stone mine", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Grant and equip tier 1 pickaxe
      const grantResult = await itemInstanceService.grantInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe",
        durability: 10,
      });
      expect(grantResult.isOk()).toBe(true);

      const instanceId = grantResult.unwrap().instance.instanceId;

      // Equip pickaxe
      await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "weapon",
        itemId: "pickaxe",
      });

      // Mine at stone mine (tier 1)
      const result = await rpgGatheringService.mine(
        TEST_USER_ID,
        "stone_mine",
        TEST_ACTOR_ID,
        TEST_GUILD_ID,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const gather = result.unwrap();
        expect(gather.locationId).toBe("stone_mine");
        expect(gather.tier).toBe(1);
        expect(gather.materialsGained.length).toBe(1);
        expect(gather.materialsGained[0]!.id).toBe("stone");
        expect(gather.materialsGained[0]!.quantity).toBeGreaterThanOrEqual(2);
        expect(gather.materialsGained[0]!.quantity).toBeLessThanOrEqual(5);
        expect(gather.remainingDurability).toBe(9); // 10 - 1
        expect(gather.toolBroken).toBe(false);
      }
    });

    it("should enforce tier gate", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Grant tier 1 pickaxe
      await itemInstanceService.grantInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe",
      });

      // Equip tier 1 pickaxe
      await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "weapon",
        itemId: "pickaxe",
      });

      // Try to mine at iron mine (tier 3) with tier 1 pickaxe
      const result = await rpgGatheringService.mine(
        TEST_USER_ID,
        "iron_mine",
        TEST_ACTOR_ID,
        TEST_GUILD_ID,
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("INSUFFICIENT_TOOL_TIER");
      }
    });

    it("should break tool and clear equipment slot when durability reaches 0", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Grant pickaxe with 1 durability
      await itemInstanceService.grantInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe",
        durability: 1,
      });

      // Equip pickaxe
      await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "weapon",
        itemId: "pickaxe",
      });

      // Use the tool once (should break)
      const result = await rpgGatheringService.mine(
        TEST_USER_ID,
        "stone_mine",
        TEST_ACTOR_ID,
        TEST_GUILD_ID,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().toolBroken).toBe(true);
        expect(result.unwrap().remainingDurability).toBe(0);
      }

      // Verify tool removed from inventory
      const inventory = await getUserInventory();
      expect(getModernItemQuantity(inventory, "pickaxe")).toBe(0);

      // Verify slot cleared
      const profile = await getProfile();
      expect(profile?.loadout.weapon).toBeNull();
    });

    it("should fail without equipped tool", async () => {
      await cleanupTestUser();
      await setupTestUser();

      const result = await rpgGatheringService.mine(
        TEST_USER_ID,
        "stone_mine",
        TEST_ACTOR_ID,
        TEST_GUILD_ID,
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("NO_TOOL_EQUIPPED");
      }
    });

    it("should fail with wrong tool type", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Grant and equip axe (wrong tool for mining)
      await itemInstanceService.grantInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "axe",
      });

      await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "weapon",
        itemId: "axe",
      });

      const result = await rpgGatheringService.mine(
        TEST_USER_ID,
        "stone_mine",
        TEST_ACTOR_ID,
        TEST_GUILD_ID,
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("INVALID_EQUIPMENT_SLOT");
      }
    });
  });

  describe("cutdown", () => {
    it("should cut wood with tier 1 axe at oak forest", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Grant and equip tier 1 axe
      await itemInstanceService.grantInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "axe",
        durability: 10,
      });

      await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "weapon",
        itemId: "axe",
      });

      const result = await rpgGatheringService.cutdown(
        TEST_USER_ID,
        "oak_forest",
        TEST_ACTOR_ID,
        TEST_GUILD_ID,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const gather = result.unwrap();
        expect(gather.locationId).toBe("oak_forest");
        expect(gather.materialsGained[0]!.id).toBe("oak_wood");
        expect(gather.materialsGained[0]!.quantity).toBeGreaterThanOrEqual(2);
        expect(gather.materialsGained[0]!.quantity).toBeLessThanOrEqual(5);
        expect(gather.remainingDurability).toBe(9);
      }
    });

    it("should enforce tier gate for forests", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Grant tier 1 axe
      await itemInstanceService.grantInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "axe",
      });

      await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "weapon",
        itemId: "axe",
      });

      // Try to cut at palm forest (tier 3) with tier 1 axe
      const result = await rpgGatheringService.cutdown(
        TEST_USER_ID,
        "palm_forest",
        TEST_ACTOR_ID,
        TEST_GUILD_ID,
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("INSUFFICIENT_TOOL_TIER");
      }
    });
  });

  describe("yield range", () => {
    it("should yield 2-5 materials per gather", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Grant pickaxe with high durability for multiple uses
      await itemInstanceService.grantInstances({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe",
        count: 5,
        durability: 100,
      });

      await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "weapon",
        itemId: "pickaxe",
      });

      // Gather multiple times
      const yields: number[] = [];
      for (let i = 0; i < 5; i++) {
        const result = await rpgGatheringService.mine(
          TEST_USER_ID,
          "stone_mine",
          TEST_ACTOR_ID,
          TEST_GUILD_ID,
        );

        if (result.isOk()) {
          yields.push(result.unwrap().materialsGained[0]!.quantity);
        }
      }

      // All yields should be in range
      expect(yields.length).toBe(5);
      for (const y of yields) {
        expect(y).toBeGreaterThanOrEqual(2);
        expect(y).toBeLessThanOrEqual(5);
      }
    });
  });

  describe("higher tier tools", () => {
    it("should allow tier 2+ pickaxes at higher tier mines", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Grant tier 2 pickaxe
      await itemInstanceService.grantInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe_lv2",
        durability: 25,
      });

      await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "weapon",
        itemId: "pickaxe_lv2",
      });

      // Mine at copper mine (tier 2)
      const result = await rpgGatheringService.mine(
        TEST_USER_ID,
        "copper_mine",
        TEST_ACTOR_ID,
        TEST_GUILD_ID,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().materialsGained[0]!.id).toBe("copper_ore");
      }
    });
  });
});
