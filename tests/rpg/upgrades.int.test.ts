/**
 * RPG Tool Upgrades Integration Tests.
 *
 * Purpose: Test tool upgrade functionality:
 * - Verify tier progression (1->2->3->4)
 * - Verify materials and currency consumed
 * - Verify new tool has full durability
 * - Verify cannot upgrade if higher tier owned
 * - Verify equipped tools are handled correctly
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { UserStore } from "@/db/repositories/users";
import { rpgUpgradeService } from "@/modules/rpg/upgrades/service";
import { rpgProfileRepo } from "@/modules/rpg/profile/repository";
import { itemMutationService } from "@/modules/economy/mutations/items/service";
import { rpgEquipmentService } from "@/modules/rpg/equipment/service";
import { normalizeModernInventory, getModernItemQuantity } from "@/modules/inventory/inventory";
import { UPGRADE_CONFIG } from "@/modules/rpg/config";
import { getToolDurability } from "@/modules/rpg/gathering/definitions";
import { parseToolTier, generateUpgradedToolId } from "@/modules/rpg/upgrades/definitions";

const TEST_USER_ID = "test_upgrade_user";
const TEST_GUILD_ID = "test_upgrade_guild";
const TEST_ACTOR_ID = "test_actor";

// Tool IDs - tier 1 is just "pickaxe", not "pickaxe_lv1"
const T1_PICKAXE = "pickaxe";
const T2_PICKAXE = "pickaxe_lv2";
const T3_PICKAXE = "pickaxe_lv3";
const T4_PICKAXE = "pickaxe_lv4";

async function setupTestUser(): Promise<void> {
  await UserStore.ensure(TEST_USER_ID);
  await rpgProfileRepo.ensure(TEST_USER_ID);
}

async function cleanupTestUser(): Promise<void> {
  await UserStore.delete(TEST_USER_ID);
}

async function giveCoins(amount: number): Promise<void> {
  await UserStore.patch(TEST_USER_ID, {
    currency: {
      coins: { hand: amount, bank: 0, use_total_on_subtract: false },
    },
  } as any);
}

async function giveTool(toolId: string, durability?: number): Promise<string> {
  // Get current inventory
  const userResult = await UserStore.get(TEST_USER_ID);
  if (userResult.isErr() || !userResult.unwrap()) {
    throw new Error("User not found");
  }

  const user = userResult.unwrap()!;
  const inventory = normalizeModernInventory(user.inventory);

  // Create instance with full durability
  const { getMaxDurability } = await import("@/modules/inventory/instances");
  const maxDur = durability ?? getMaxDurability(toolId);

  const { createInstance } = await import("@/modules/inventory/instances");
  const { addInstance } = await import("@/modules/inventory/inventory");

  const instance = createInstance(toolId, maxDur);
  const newInventory = addInstance(inventory, instance);

  // Save inventory
  const saveResult = await UserStore.patch(TEST_USER_ID, { inventory: newInventory } as any);
  if (saveResult.isErr()) {
    throw new Error(`Failed to give tool: ${saveResult.error.message}`);
  }

  return instance.instanceId;
}

async function giveMaterial(materialId: string, quantity: number): Promise<void> {
  await itemMutationService.adjustItemQuantity(
    {
      actorId: TEST_ACTOR_ID,
      targetId: TEST_USER_ID,
      guildId: TEST_GUILD_ID,
      itemId: materialId,
      delta: quantity,
      reason: "Test setup",
    },
    async () => true,
  );
}

async function getInventory() {
  const result = await UserStore.get(TEST_USER_ID);
  if (result.isErr() || !result.unwrap()) {
    return {};
  }
  return normalizeModernInventory(result.unwrap()!.inventory);
}

async function getCoins(): Promise<number> {
  const result = await UserStore.get(TEST_USER_ID);
  if (result.isErr() || !result.unwrap()) {
    return 0;
  }
  const user = result.unwrap()!;
  return (user.currency?.coins as { hand?: number } | undefined)?.hand ?? 0;
}

describe("RPG Tool Upgrades", () => {
  beforeAll(async () => {
    // Verify upgrade config
    expect(UPGRADE_CONFIG.maxTier).toBe(4);
    expect(UPGRADE_CONFIG.costs[2]).toBeDefined();
    expect(UPGRADE_CONFIG.costs[3]).toBeDefined();
    expect(UPGRADE_CONFIG.costs[4]).toBeDefined();
  });

  afterAll(async () => {
    await cleanupTestUser();
  });

  describe("upgrade validation", () => {
    it("should block upgrade if tool at max tier", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Give tier 4 tool
      await giveTool(T4_PICKAXE);
      await giveCoins(100000);
      await giveMaterial("palm_wood", 10);

      const result = await rpgUpgradeService.upgrade({
        userId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        toolId: T4_PICKAXE,
        actorId: TEST_ACTOR_ID,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        // Can be either MAX_TIER_REACHED or INVALID_UPGRADE (from getUpgradeInfo)
        expect(["MAX_TIER_REACHED", "INVALID_UPGRADE"]).toContain(result.error.code);
      }
    });

    it("should block upgrade if higher tier owned", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Give tier 1 and tier 2 tools
      await giveTool(T1_PICKAXE);
      await giveTool(T2_PICKAXE);
      await giveCoins(100000);
      await giveMaterial("spruce_wood", 10);

      // Try to upgrade tier 1 when tier 2 is owned
      const result = await rpgUpgradeService.upgrade({
        userId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        toolId: T1_PICKAXE,
        actorId: TEST_ACTOR_ID,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("ALREADY_OWNS_HIGHER_TIER");
        expect(result.error.message).toContain("higher tier");
      }
    });

    it("should block upgrade if insufficient materials", async () => {
      await cleanupTestUser();
      await setupTestUser();

      await giveTool(T1_PICKAXE);
      await giveCoins(100000);
      // Don't give spruce_wood

      const result = await rpgUpgradeService.upgrade({
        userId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        toolId: T1_PICKAXE,
        actorId: TEST_ACTOR_ID,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("INSUFFICIENT_MATERIALS");
      }
    });

    it("should block upgrade if insufficient funds", async () => {
      await cleanupTestUser();
      await setupTestUser();

      await giveTool(T1_PICKAXE);
      await giveCoins(100); // Not enough
      await giveMaterial("spruce_wood", 10);

      const result = await rpgUpgradeService.upgrade({
        userId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        toolId: T1_PICKAXE,
        actorId: TEST_ACTOR_ID,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("INSUFFICIENT_FUNDS");
      }
    });
  });

  describe("successful upgrade", () => {
    it("should upgrade tool from tier 1 to tier 2", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Setup
      const instanceId = await giveTool(T1_PICKAXE);
      const initialCoins = 100000;
      await giveCoins(initialCoins);
      await giveMaterial("spruce_wood", 5);

      const initialInventory = await getInventory();
      const initialToolCount = getModernItemQuantity(initialInventory, T1_PICKAXE);

      // Upgrade
      const result = await rpgUpgradeService.upgrade({
        userId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        toolId: T1_PICKAXE,
        instanceId,
        actorId: TEST_ACTOR_ID,
      });

      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const upgrade = result.unwrap();
        expect(upgrade.originalToolId).toBe(T1_PICKAXE);
        expect(upgrade.newToolId).toBe(T2_PICKAXE);
        expect(upgrade.newTier).toBe(2);
        expect(upgrade.moneySpent).toBe(UPGRADE_CONFIG.costs[2]!.money);
        expect(upgrade.materialsConsumed).toHaveLength(1);
        expect(upgrade.materialsConsumed[0]!.id).toBe("spruce_wood");
      }

      // Verify tool consumed
      const finalInventory = await getInventory();
      const finalToolCount = getModernItemQuantity(finalInventory, T1_PICKAXE);
      expect(finalToolCount).toBe(initialToolCount - 1);

      // Verify new tool exists
      const newToolCount = getModernItemQuantity(finalInventory, T2_PICKAXE);
      expect(newToolCount).toBe(1);

      // Verify materials consumed
      const spruceWoodQty = getModernItemQuantity(finalInventory, "spruce_wood");
      expect(spruceWoodQty).toBe(0);

      // Verify coins deducted
      const finalCoins = await getCoins();
      expect(finalCoins).toBe(initialCoins - UPGRADE_CONFIG.costs[2]!.money);
    });

    it("should create new tool with full durability", async () => {
      await cleanupTestUser();
      await setupTestUser();

      await giveTool(T1_PICKAXE);
      await giveCoins(100000);
      await giveMaterial("spruce_wood", 5);

      const result = await rpgUpgradeService.upgrade({
        userId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        toolId: T1_PICKAXE,
        actorId: TEST_ACTOR_ID,
      });

      expect(result.isOk()).toBe(true);

      // Verify new tool has full durability for tier 2
      const inventory = await getInventory();
      const entry = inventory[T2_PICKAXE];
      expect(entry?.type).toBe("instances");
      if (entry?.type === "instances") {
        expect(entry.instances).toHaveLength(1);
        const instance = entry.instances[0]!;
        const expectedMaxDurability = getToolDurability(2);
        expect(instance.durability).toBe(expectedMaxDurability);
      }
    });

    it("should upgrade tool from tier 2 to tier 3", async () => {
      await cleanupTestUser();
      await setupTestUser();

      await giveTool(T2_PICKAXE);
      await giveCoins(100000);
      await giveMaterial("copper_ingot", 5);

      const result = await rpgUpgradeService.upgrade({
        userId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        toolId: T2_PICKAXE,
        actorId: TEST_ACTOR_ID,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().newTier).toBe(3);
        expect(result.unwrap().newToolId).toBe(T3_PICKAXE);
      }
    });

    it("should upgrade tool from tier 3 to tier 4", async () => {
      await cleanupTestUser();
      await setupTestUser();

      await giveTool(T3_PICKAXE);
      await giveCoins(100000);
      await giveMaterial("palm_wood", 5);

      const result = await rpgUpgradeService.upgrade({
        userId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        toolId: T3_PICKAXE,
        actorId: TEST_ACTOR_ID,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().newTier).toBe(4);
        expect(result.unwrap().newToolId).toBe(T4_PICKAXE);
      }
    });
  });

  describe("equipped tool handling", () => {
    it("should auto-equip upgraded tool if original was equipped", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Give and equip tier 1 tool
      await giveTool(T1_PICKAXE);
      await giveCoins(100000);
      await giveMaterial("spruce_wood", 5);

      const equipResult = await rpgEquipmentService.equip({
        userId: TEST_USER_ID,
        itemId: T1_PICKAXE,
        slot: "weapon",
        actorId: TEST_ACTOR_ID,
        guildId: TEST_GUILD_ID,
      });
      expect(equipResult.isOk()).toBe(true);

      // Upgrade
      const result = await rpgUpgradeService.upgrade({
        userId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        toolId: T1_PICKAXE,
        actorId: TEST_ACTOR_ID,
      });

      expect(result.isOk()).toBe(true);

      // Verify new tool is equipped
      const profile = await rpgProfileRepo.findById(TEST_USER_ID);
      expect(profile.isOk()).toBe(true);
      if (profile.isOk() && profile.unwrap()) {
        expect(profile.unwrap()!.loadout.weapon).toBe(T2_PICKAXE);
      }
    });
  });

  describe("upgrade preview", () => {
    it("should return correct preview for upgradeable tool", async () => {
      await cleanupTestUser();
      await setupTestUser();

      const instanceId = await giveTool(T1_PICKAXE);
      await giveCoins(100000);
      await giveMaterial("spruce_wood", 5);

      const previewResult = await rpgUpgradeService.getUpgradePreview(
        TEST_USER_ID,
        T1_PICKAXE,
        instanceId,
      );

      expect(previewResult.isOk()).toBe(true);
      if (previewResult.isOk()) {
        const preview = previewResult.unwrap();
        expect(preview.toolId).toBe(T1_PICKAXE);
        expect(preview.currentTier).toBe(1);
        expect(preview.nextTier).toBe(2);
        expect(preview.canUpgrade).toBe(true);
        expect(preview.cost.money).toBe(UPGRADE_CONFIG.costs[2]!.money);
        expect(preview.durability.newMax).toBe(getToolDurability(2));
      }
    });

    it("should return correct preview for non-upgradeable tool", async () => {
      await cleanupTestUser();
      await setupTestUser();

      await giveTool(T4_PICKAXE);
      await giveCoins(100000);

      const previewResult = await rpgUpgradeService.getUpgradePreview(
        TEST_USER_ID,
        T4_PICKAXE,
      );

      expect(previewResult.isOk()).toBe(true);
      if (previewResult.isOk()) {
        const preview = previewResult.unwrap();
        expect(preview.canUpgrade).toBe(false);
        expect(preview.reason).toContain("maximum tier");
      }
    });
  });

  describe("full upgrade chain", () => {
    it("should complete full upgrade chain 1->2->3->4", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Start with tier 1
      let currentToolId = T1_PICKAXE;
      let currentTier = 1;

      await giveTool(currentToolId);
      await giveCoins(100000);
      await giveMaterial("spruce_wood", 5);
      await giveMaterial("copper_ingot", 5);
      await giveMaterial("palm_wood", 5);

      // Upgrade through all tiers
      for (const targetTier of [2, 3, 4]) {
        const result = await rpgUpgradeService.upgrade({
          userId: TEST_USER_ID,
          guildId: TEST_GUILD_ID,
          toolId: currentToolId,
          actorId: TEST_ACTOR_ID,
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.unwrap().newTier).toBe(targetTier);
          currentToolId = result.unwrap().newToolId;
          currentTier = targetTier;
        }
      }

      // Verify final state
      expect(currentTier).toBe(4);
      expect(currentToolId).toBe(T4_PICKAXE);

      const inventory = await getInventory();
      expect(getModernItemQuantity(inventory, T4_PICKAXE)).toBe(1);
      expect(getModernItemQuantity(inventory, "spruce_wood")).toBe(0);
      expect(getModernItemQuantity(inventory, "copper_ingot")).toBe(0);
      expect(getModernItemQuantity(inventory, "palm_wood")).toBe(0);
    });
  });
});
