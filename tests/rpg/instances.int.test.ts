/**
 * Item Instance Integration Tests.
 *
 * Purpose: Test instance-based inventory operations:
 * - Tool grant creates instances
 * - Durability decrements and breaks at 0
 * - Stackables unaffected
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { UserStore } from "@/db/repositories/users";
import { itemInstanceService } from "@/modules/economy/mutations/items/instance-service";
import type { ModernInventory } from "@/modules/inventory/inventory";
import { normalizeModernInventory, getModernItemQuantity } from "@/modules/inventory/inventory";
import { isInstanceBased, getMaxDurability } from "@/modules/inventory/instances";
import { ITEM_DEFINITIONS } from "@/modules/inventory/definitions";

const TEST_USER_ID = "test_instance_user";
const TEST_ACTOR_ID = "test_actor";
const TEST_GUILD_ID = "test_guild";

async function cleanupTestUser(): Promise<void> {
  await UserStore.delete(TEST_USER_ID);
}

async function getTestUserInventory(): Promise<ModernInventory> {
  const result = await UserStore.get(TEST_USER_ID);
  if (result.isErr() || !result.unwrap()) {
    return {};
  }
  return normalizeModernInventory(result.unwrap()!.inventory);
}

describe("Item Instance System", () => {
  beforeAll(async () => {
    // Verify test items exist
    expect(ITEM_DEFINITIONS.pickaxe).toBeDefined();
    expect(ITEM_DEFINITIONS.stick).toBeDefined();
    expect(isInstanceBased("pickaxe")).toBe(true); // Tools are instance-based
    expect(isInstanceBased("stick")).toBe(false); // Regular items are stackable
  });

  afterAll(async () => {
    await cleanupTestUser();
  });

  describe("grantInstance", () => {
    it("should create instance for tool with full durability", async () => {
      await cleanupTestUser();
      await UserStore.ensure(TEST_USER_ID);

      const result = await itemInstanceService.grantInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe",
        reason: "Test grant",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const grant = result.unwrap();
        expect(grant.itemId).toBe("pickaxe");
        expect(grant.instance.instanceId).toMatch(/^inst_/);
        expect(grant.instance.durability).toBe(getMaxDurability("pickaxe"));
        expect(grant.instance.itemId).toBe("pickaxe");
      }

      // Verify in inventory
      const inventory = await getTestUserInventory();
      const entry = inventory.pickaxe;
      expect(entry?.type).toBe("instances");
      if (entry?.type === "instances") {
        expect(entry.instances.length).toBe(1);
        expect(entry.instances[0].durability).toBe(getMaxDurability("pickaxe"));
      }
    });

    it("should reject granting instance-based item to non-instance item", async () => {
      await cleanupTestUser();
      await UserStore.ensure(TEST_USER_ID);

      // Try to grant a stackable item (stick) via instance service
      const result = await itemInstanceService.grantInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "stick", // Stackable, not instance-based
        reason: "Test reject",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("NOT_INSTANCE_BASED");
      }
    });

    it("should respect capacity limits", async () => {
      await cleanupTestUser();
      await UserStore.ensure(TEST_USER_ID);

      // Fill inventory to capacity (20 slots)
      const fullInventory: Record<string, unknown> = {};
      const realItems = [
        "wooden_sword", "steel_sword", "wooden_shield", "iron_shield",
        "leather_helmet", "iron_helmet", "leather_armor", "iron_armor",
        "leather_pants", "iron_pants", "leather_boots", "iron_boots",
        "health_ring", "power_ring", "defense_amulet",
        "pickaxe_lv2", "pickaxe_lv3", "axe", "axe_lv2", "axe_lv3",
      ];
      for (const item of realItems) {
        fullInventory[item] = { id: item, quantity: 1 };
      }
      await UserStore.patch(TEST_USER_ID, { inventory: fullInventory } as any);

      // Try to grant another instance
      const result = await itemInstanceService.grantInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe",
        reason: "Test capacity",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("CAPACITY_EXCEEDED");
      }
    });

    it("should create instance with custom durability", async () => {
      await cleanupTestUser();
      await UserStore.ensure(TEST_USER_ID);

      const customDurability = 5;
      const result = await itemInstanceService.grantInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe",
        durability: customDurability,
        reason: "Test custom durability",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().instance.durability).toBe(customDurability);
      }
    });
  });

  describe("grantInstances (batch)", () => {
    it("should create multiple instances", async () => {
      await cleanupTestUser();
      await UserStore.ensure(TEST_USER_ID);

      const result = await itemInstanceService.grantInstances({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe",
        count: 3,
        reason: "Test batch grant",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const grant = result.unwrap();
        expect(grant.instances.length).toBe(3);
        // Each instance should have unique ID
        const ids = grant.instances.map((i) => i.instanceId);
        expect(new Set(ids).size).toBe(3);
      }

      // Verify in inventory
      const inventory = await getTestUserInventory();
      expect(getModernItemQuantity(inventory, "pickaxe")).toBe(3);
    });

    it("should reject invalid count", async () => {
      await cleanupTestUser();
      await UserStore.ensure(TEST_USER_ID);

      const result = await itemInstanceService.grantInstances({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe",
        count: 0,
        reason: "Test invalid",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("INVALID_QUANTITY");
      }
    });
  });

  describe("removeInstance", () => {
    it("should remove specific instance by ID", async () => {
      await cleanupTestUser();
      await UserStore.ensure(TEST_USER_ID);

      // Grant an instance first
      const grantResult = await itemInstanceService.grantInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe",
      });

      expect(grantResult.isOk()).toBe(true);
      const instanceId = grantResult.unwrap().instance.instanceId;

      // Remove it
      const removeResult = await itemInstanceService.removeInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe",
        instanceId,
        reason: "Test remove",
      });

      expect(removeResult.isOk()).toBe(true);
      if (removeResult.isOk()) {
        expect(removeResult.unwrap().removed?.instanceId).toBe(instanceId);
      }

      // Verify removed from inventory
      const inventory = await getTestUserInventory();
      expect(getModernItemQuantity(inventory, "pickaxe")).toBe(0);
    });

    it("should pop first instance when ID not specified", async () => {
      await cleanupTestUser();
      await UserStore.ensure(TEST_USER_ID);

      // Grant multiple instances
      await itemInstanceService.grantInstances({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe",
        count: 3,
      });

      const inventoryBefore = await getTestUserInventory();
      const firstInstanceId = (inventoryBefore.pickaxe as any).instances[0].instanceId;

      // Remove without specifying ID
      const removeResult = await itemInstanceService.removeInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe",
        reason: "Test pop",
      });

      expect(removeResult.isOk()).toBe(true);
      if (removeResult.isOk()) {
        expect(removeResult.unwrap().removed?.instanceId).toBe(firstInstanceId);
      }

      const inventoryAfter = await getTestUserInventory();
      expect(getModernItemQuantity(inventoryAfter, "pickaxe")).toBe(2);
    });

    it("should fail when no instances available", async () => {
      await cleanupTestUser();
      await UserStore.ensure(TEST_USER_ID);

      const result = await itemInstanceService.removeInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe",
        reason: "Test remove empty",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("ITEM_NOT_FOUND");
      }
    });
  });

  describe("useInstance (durability)", () => {
    it("should decrement durability", async () => {
      await cleanupTestUser();
      await UserStore.ensure(TEST_USER_ID);

      // Grant with specific durability
      const grantResult = await itemInstanceService.grantInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe",
        durability: 5,
      });

      const instanceId = grantResult.unwrap().instance.instanceId;

      // Use it (damage = 1)
      const useResult = await itemInstanceService.useInstance({
        userId: TEST_USER_ID,
        itemId: "pickaxe",
        instanceId,
        damage: 1,
        guildId: TEST_GUILD_ID,
        reason: "Test use",
      });

      expect(useResult.isOk()).toBe(true);
      if (useResult.isOk()) {
        const use = useResult.unwrap();
        expect(use.broken).toBe(false);
        expect(use.remainingDurability).toBe(4);
      }

      // Verify in inventory
      const inventory = await getTestUserInventory();
      const entry = inventory.pickaxe;
      if (entry?.type === "instances") {
        expect(entry.instances[0].durability).toBe(4);
      }
    });

    it("should break item when durability reaches 0", async () => {
      await cleanupTestUser();
      await UserStore.ensure(TEST_USER_ID);

      // Grant with low durability
      const grantResult = await itemInstanceService.grantInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe",
        durability: 2,
      });

      const instanceId = grantResult.unwrap().instance.instanceId;

      // Use it with enough damage to break
      const useResult = await itemInstanceService.useInstance({
        userId: TEST_USER_ID,
        itemId: "pickaxe",
        instanceId,
        damage: 2,
        guildId: TEST_GUILD_ID,
        reason: "Test break",
      });

      expect(useResult.isOk()).toBe(true);
      if (useResult.isOk()) {
        const use = useResult.unwrap();
        expect(use.broken).toBe(true);
        expect(use.remainingDurability).toBe(0);
      }

      // Verify removed from inventory
      const inventory = await getTestUserInventory();
      expect(getModernItemQuantity(inventory, "pickaxe")).toBe(0);
    });

    it("should use default damage of 1", async () => {
      await cleanupTestUser();
      await UserStore.ensure(TEST_USER_ID);

      const grantResult = await itemInstanceService.grantInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe",
        durability: 5,
      });

      const instanceId = grantResult.unwrap().instance.instanceId;

      // Use without specifying damage
      const useResult = await itemInstanceService.useInstance({
        userId: TEST_USER_ID,
        itemId: "pickaxe",
        instanceId,
        guildId: TEST_GUILD_ID,
      });

      expect(useResult.isOk()).toBe(true);
      if (useResult.isOk()) {
        expect(useResult.unwrap().remainingDurability).toBe(4);
      }
    });
  });

  describe("stackables unaffected", () => {
    it("stackable items should not use instances", async () => {
      expect(isInstanceBased("stick")).toBe(false);
      expect(isInstanceBased("wooden_sword")).toBe(true); // Non-stackable equipment
    });

    it("should reject instance operations on stackables", async () => {
      await cleanupTestUser();
      await UserStore.ensure(TEST_USER_ID);

      // Try to grant stackable via instance service
      const result = await itemInstanceService.grantInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "stick",
        reason: "Test stackable reject",
      });

      expect(result.isErr()).toBe(true);
      expect(result.error?.code).toBe("NOT_INSTANCE_BASED");
    });
  });

  describe("capacity tracking", () => {
    it("should report correct capacity after operations", async () => {
      await cleanupTestUser();
      await UserStore.ensure(TEST_USER_ID);

      const result = await itemInstanceService.grantInstance({
        actorId: TEST_ACTOR_ID,
        targetId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        itemId: "pickaxe",
        reason: "Test capacity",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const capacity = result.unwrap().capacity;
        expect(capacity.currentSlots).toBe(1);
        expect(capacity.maxSlots).toBe(20);
        expect(capacity.currentWeight).toBeGreaterThan(0);
      }
    });
  });
});
