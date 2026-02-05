/**
 * RPG Equipment Service Integration Tests.
 *
 * Purpose: Test equipment operations with inventory integration:
 * - Equip while isFighting fails
 * - Equip replaces existing (with capacity check)
 * - Unequip fails if inventory would overflow
 * - HP clamping after equipment changes
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { UserStore } from "@/db/repositories/users";
import { rpgProfileRepo } from "@/modules/rpg/profile/repository";
import { rpgEquipmentService } from "@/modules/rpg/equipment/service";
import { RpgError } from "@/modules/rpg/profile/types";
import type { Loadout } from "@/db/schemas/rpg-profile";
import { simulateCapacityAfterAdd } from "@/modules/inventory/capacity";
import type { ItemInventory } from "@/modules/inventory/inventory";
import { ITEM_DEFINITIONS } from "@/modules/inventory/definitions";

// Test setup helpers
const TEST_USER_ID = "test_equip_user";
const TEST_ACTOR_ID = "test_actor";
const TEST_GUILD_ID = "test_guild";

// Create items for testing in inventory
const createTestInventory = (items: Record<string, number>): ItemInventory => {
  const inventory: ItemInventory = {};
  for (const [itemId, quantity] of Object.entries(items)) {
    if (quantity > 0) {
      inventory[itemId] = { id: itemId, quantity };
    }
  }
  return inventory;
};

// Setup test user with inventory and profile
async function setupTestUser(
  inventory: ItemInventory,
  loadout?: Partial<Loadout>,
  isFighting = false,
): Promise<void> {
  // Ensure user exists
  await UserStore.ensure(TEST_USER_ID);

  // Set inventory
  await UserStore.patch(TEST_USER_ID, { inventory } as any);

  // Ensure RPG profile
  const profileResult = await rpgProfileRepo.ensure(TEST_USER_ID);
  if (profileResult.isOk()) {
    const { profile } = profileResult.unwrap();

    // Update loadout if specified
    if (loadout) {
      const newLoadout: Loadout = { ...profile.loadout, ...loadout };
      await rpgProfileRepo.updateLoadout(TEST_USER_ID, newLoadout);
    }

    // Set combat state if fighting
    if (isFighting) {
      await rpgProfileRepo.updateCombatState(TEST_USER_ID, true, "fight_123", profile.hpCurrent, false);
    }
  }
}

// Cleanup test user
async function cleanupTestUser(): Promise<void> {
  await UserStore.delete(TEST_USER_ID);
}

describe("RPG Equipment Service Integration", () => {
  beforeAll(async () => {
    // Verify item definitions exist for testing
    expect(ITEM_DEFINITIONS.wooden_sword).toBeDefined();
    expect(ITEM_DEFINITIONS.steel_sword).toBeDefined();
    expect(ITEM_DEFINITIONS.iron_shield).toBeDefined();
    expect(ITEM_DEFINITIONS.health_ring).toBeDefined();
  });

  afterAll(async () => {
    await cleanupTestUser();
  });

  describe("equip", () => {
    it("should equip item from inventory to empty slot", async () => {
      await cleanupTestUser();
      await setupTestUser(
        createTestInventory({ wooden_sword: 1 }),
        { weapon: null, shield: null, helmet: null, chest: null, pants: null, boots: null, ring: null, necklace: null },
      );

      const result = await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "weapon",
        itemId: "wooden_sword",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const change = result.unwrap();
        expect(change.operation).toBe("equip");
        expect(change.slot).toBe("weapon");
        expect(change.previousItemId).toBeNull();
        expect(change.newItemId).toBe("wooden_sword");
        expect(change.stats.atk).toBeGreaterThan(0); // Wooden sword has atk
      }

      // Verify item removed from inventory
      const user = await UserStore.get(TEST_USER_ID);
      expect(user.isOk()).toBe(true);
      if (user.isOk()) {
        const inv = user.unwrap()?.inventory as ItemInventory;
        expect(inv?.wooden_sword).toBeUndefined();
      }
    });

    it("should fail to equip while isFighting", async () => {
      await cleanupTestUser();
      await setupTestUser(
        createTestInventory({ wooden_sword: 1 }),
        {},
        true, // isFighting = true
      );

      const result = await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "weapon",
        itemId: "wooden_sword",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("IN_COMBAT");
      }
    });

    it("should fail to equip item not in inventory", async () => {
      await cleanupTestUser();
      await setupTestUser(createTestInventory({})); // Empty inventory

      const result = await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "weapon",
        itemId: "wooden_sword",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("ITEM_NOT_IN_INVENTORY");
      }
    });

    it("should fail to equip to invalid slot", async () => {
      await cleanupTestUser();
      await setupTestUser(createTestInventory({ wooden_sword: 1 }));

      const result = await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "invalid_slot" as any,
        itemId: "wooden_sword",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("INVALID_EQUIPMENT_SLOT");
      }
    });

    it("should fail to equip item to incompatible slot", async () => {
      await cleanupTestUser();
      await setupTestUser(createTestInventory({ wooden_sword: 1 }));

      // Try to equip sword to shield slot
      const result = await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "shield",
        itemId: "wooden_sword",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("INVALID_EQUIPMENT_SLOT");
      }
    });

    it("should auto-unequip existing item when equipping new one", async () => {
      await cleanupTestUser();
      // Set up with wooden_sword equipped and steel_sword in inventory
      await setupTestUser(
        createTestInventory({ steel_sword: 1, wooden_sword: 1 }),
        { weapon: "wooden_sword" },
      );

      const result = await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "weapon",
        itemId: "steel_sword",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const change = result.unwrap();
        expect(change.operation).toBe("equip");
        expect(change.previousItemId).toBe("wooden_sword");
        expect(change.newItemId).toBe("steel_sword");
      }

      // Verify old item returned to inventory
      const user = await UserStore.get(TEST_USER_ID);
      if (user.isOk()) {
        const inv = user.unwrap()?.inventory as ItemInventory;
        // We had 1 wooden_sword in inventory + 1 unequipped = 2
        expect(inv?.wooden_sword?.quantity).toBe(2);
        expect(inv?.steel_sword).toBeUndefined(); // New item removed
      }
    });

    it("should fail if inventory full and trying to unequip current item", async () => {
      await cleanupTestUser();

      // Create inventory at capacity limit using real items that have definitions
      // First, let's get 20 different real items by using various quantities
      const fullInventory: ItemInventory = {};
      // Use different real items from ITEM_DEFINITIONS
      const realItems = [
        "stick", "wooden_sword", "steel_sword", "wooden_shield", "iron_shield",
        "leather_helmet", "iron_helmet", "leather_armor", "iron_armor",
        "leather_pants", "iron_pants", "leather_boots", "iron_boots",
        "health_ring", "power_ring", "defense_amulet",
        "pickaxe", "pickaxe_lv2", "axe", "axe_lv2",
      ];
      for (let i = 0; i < 20; i++) {
        fullInventory[realItems[i]] = { id: realItems[i], quantity: 1 };
      }
      // Add the item we want to equip (needs to be in inventory)
      fullInventory.steel_sword = { id: "steel_sword", quantity: 2 };

      await setupTestUser(fullInventory, { weapon: "wooden_sword" });

      const result = await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "weapon",
        itemId: "steel_sword",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("UPDATE_FAILED");
        expect(result.error.message).toContain("Inventory is full");
      }
    });

    it("should clamp HP when unequipping HP-boosting item", async () => {
      await cleanupTestUser();
      // Equip health ring and set HP to max
      await setupTestUser(
        createTestInventory({}),
        { ring: "health_ring" },
      );

      // Set HP to 125 (100 base + 25 from ring)
      const profileResult = await rpgProfileRepo.findById(TEST_USER_ID);
      if (profileResult.isOk() && profileResult.unwrap()) {
        const profile = profileResult.unwrap()!;
        await rpgProfileRepo.updateCombatState(
          TEST_USER_ID,
          profile.isFighting,
          profile.activeFightId,
          125, // Current HP at max
          profile.isFighting,
        );
      }

      // Add a dummy item to inventory so we can unequip
      await UserStore.patch(TEST_USER_ID, {
        inventory: { dummy: { id: "dummy", quantity: 1 } },
      } as any);

      // Now unequip the ring
      const result = await rpgEquipmentService.unequip(
        TEST_USER_ID,
        TEST_ACTOR_ID,
        "ring",
        TEST_GUILD_ID,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const change = result.unwrap();
        expect(change.currentHp).toBe(100); // HP clamped to new max
        expect(change.stats.maxHp).toBe(100); // Base HP without ring
      }
    });

    it("should preserve HP when equipping HP-boosting item", async () => {
      await cleanupTestUser();
      await setupTestUser(
        createTestInventory({ health_ring: 1 }),
        { ring: null },
      );

      // Set HP to 80 (below max)
      const profileResult = await rpgProfileRepo.findById(TEST_USER_ID);
      if (profileResult.isOk() && profileResult.unwrap()) {
        const profile = profileResult.unwrap()!;
        await rpgProfileRepo.updateCombatState(
          TEST_USER_ID,
          profile.isFighting,
          profile.activeFightId,
          80,
          profile.isFighting,
        );
      }

      // Equip health ring (+25 HP)
      const result = await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "ring",
        itemId: "health_ring",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const change = result.unwrap();
        expect(change.stats.maxHp).toBe(125); // 100 + 25
        expect(change.currentHp).toBe(80); // HP preserved (not healed)
      }
    });
  });

  describe("unequip", () => {
    it("should unequip item and return to inventory", async () => {
      await cleanupTestUser();
      await setupTestUser(
        createTestInventory({}),
        { weapon: "wooden_sword" },
      );

      const result = await rpgEquipmentService.unequip(
        TEST_USER_ID,
        TEST_ACTOR_ID,
        "weapon",
        TEST_GUILD_ID,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const change = result.unwrap();
        expect(change.operation).toBe("unequip");
        expect(change.previousItemId).toBe("wooden_sword");
        expect(change.newItemId).toBeNull();
      }

      // Verify item returned to inventory
      const user = await UserStore.get(TEST_USER_ID);
      if (user.isOk()) {
        const inv = user.unwrap()?.inventory as ItemInventory;
        expect(inv?.wooden_sword?.quantity).toBe(1);
      }
    });

    it("should fail to unequip if inventory is full", async () => {
      await cleanupTestUser();

      // Create inventory at capacity limit using real items
      const fullInventory: ItemInventory = {};
      const realItems = [
        "stick", "wooden_sword", "steel_sword", "wooden_shield", "iron_shield",
        "leather_helmet", "iron_helmet", "leather_armor", "iron_armor",
        "leather_pants", "iron_pants", "leather_boots", "iron_boots",
        "health_ring", "power_ring", "defense_amulet",
        "pickaxe", "pickaxe_lv2", "axe", "axe_lv2",
      ];
      for (let i = 0; i < 20; i++) {
        fullInventory[realItems[i]] = { id: realItems[i], quantity: 1 };
      }

      await setupTestUser(fullInventory, { weapon: "wooden_sword" });

      const result = await rpgEquipmentService.unequip(
        TEST_USER_ID,
        TEST_ACTOR_ID,
        "weapon",
        TEST_GUILD_ID,
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("UPDATE_FAILED");
        expect(result.error.message).toContain("Inventory is full");
      }
    });

    it("should succeed when unequipping empty slot", async () => {
      await cleanupTestUser();
      await setupTestUser(createTestInventory({}), { weapon: null });

      const result = await rpgEquipmentService.unequip(
        TEST_USER_ID,
        TEST_ACTOR_ID,
        "weapon",
        TEST_GUILD_ID,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const change = result.unwrap();
        expect(change.operation).toBe("unequip");
        expect(change.previousItemId).toBeNull();
        expect(change.newItemId).toBeNull();
      }
    });
  });

  describe("unequipAll", () => {
    it("should unequip all equipped items", async () => {
      await cleanupTestUser();
      await setupTestUser(
        createTestInventory({}),
        {
          weapon: "wooden_sword",
          shield: "iron_shield",
          ring: "health_ring",
        },
      );

      const result = await rpgEquipmentService.unequipAll(
        TEST_USER_ID,
        TEST_ACTOR_ID,
        TEST_GUILD_ID,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const changes = result.unwrap();
        expect(changes.length).toBe(3); // 3 items unequipped

        // Verify all items returned to inventory
        const user = await UserStore.get(TEST_USER_ID);
        if (user.isOk()) {
          const inv = user.unwrap()?.inventory as ItemInventory;
          expect(inv?.wooden_sword?.quantity).toBe(1);
          expect(inv?.iron_shield?.quantity).toBe(1);
          expect(inv?.health_ring?.quantity).toBe(1);
        }
      }
    });

    it("should stop on first failure", async () => {
      await cleanupTestUser();

      // Create inventory near capacity using real items
      const nearFullInventory: ItemInventory = {};
      const realItems = [
        "stick", "wooden_sword", "steel_sword", "wooden_shield", "iron_shield",
        "leather_helmet", "iron_helmet", "leather_armor", "iron_armor",
        "leather_pants", "iron_pants", "leather_boots", "iron_boots",
        "health_ring", "power_ring", "defense_amulet",
        "pickaxe", "pickaxe_lv2", "axe", // 19 items
      ];
      for (let i = 0; i < 19; i++) {
        nearFullInventory[realItems[i]] = { id: realItems[i], quantity: 1 };
      }

      await setupTestUser(nearFullInventory, {
        weapon: "wooden_sword", // This will fail since wooden_sword is already in inventory
        shield: "iron_shield",
        helmet: "leather_helmet",
      });

      const result = await rpgEquipmentService.unequipAll(
        TEST_USER_ID,
        TEST_ACTOR_ID,
        TEST_GUILD_ID,
      );

      // Should fail after first item fills inventory (slot 20)
      expect(result.isErr()).toBe(true);
    });

    it("should return empty array when nothing equipped", async () => {
      await cleanupTestUser();
      await setupTestUser(
        createTestInventory({}),
        {}, // All slots empty
      );

      const result = await rpgEquipmentService.unequipAll(
        TEST_USER_ID,
        TEST_ACTOR_ID,
        TEST_GUILD_ID,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().length).toBe(0);
      }
    });
  });

  describe("stat calculation", () => {
    it("should calculate correct stats after equipment change", async () => {
      await cleanupTestUser();
      await setupTestUser(
        createTestInventory({
          wooden_sword: 1, // +5 atk
          iron_shield: 1, // +10 def
          health_ring: 1, // +25 hp
        }),
      );

      // Equip sword
      await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "weapon",
        itemId: "wooden_sword",
      });

      // Equip shield
      await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "shield",
        itemId: "iron_shield",
      });

      // Equip ring
      const result = await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
        slot: "ring",
        itemId: "health_ring",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const change = result.unwrap();
        expect(change.stats.atk).toBe(5); // From wooden_sword
        expect(change.stats.def).toBe(15); // From iron_shield (has def: 15)
        expect(change.stats.maxHp).toBe(125); // 100 base + 25 from ring
      }
    });
  });
});
