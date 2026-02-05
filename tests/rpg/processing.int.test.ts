/**
 * RPG Processing Integration Tests.
 *
 * Purpose: Test material processing:
 * - Success rate uses configured base (0.62)
 * - Luck modifies success chance (+1% per level, capped at +25%)
 * - Fee deposited to guild economy
 * - Inputs consumed on failure
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { UserStore } from "@/db/repositories/users";
import { rpgProcessingService } from "@/modules/rpg/processing/service";
import { itemMutationService } from "@/modules/economy/mutations/items/service";
import { guildEconomyService } from "@/modules/economy/guild/service";
import { guildEconomyRepo } from "@/modules/economy/guild/repository";
import { normalizeModernInventory, getModernItemQuantity } from "@/modules/inventory/inventory";
import { PROCESSING_CONFIG } from "@/modules/rpg/config";
import { canProcessMaterial, calculateSuccessChance, calculateFee } from "@/modules/rpg/processing/recipes";

const TEST_USER_ID = "test_process_user";
const TEST_GUILD_ID = "test_process_guild";
const TEST_ACTOR_ID = "test_actor";

async function setupTestUser(): Promise<void> {
  await UserStore.ensure(TEST_USER_ID);
  // Ensure RPG profile exists
  const { rpgProfileRepo } = await import("@/modules/rpg/profile/repository");
  await rpgProfileRepo.ensure(TEST_USER_ID);
  // Ensure guild exists
  await guildEconomyRepo.ensure(TEST_GUILD_ID);
}

async function cleanupTestUser(): Promise<void> {
  await UserStore.delete(TEST_USER_ID);
  // Guild cleanup not needed - repository doesn't support delete
}

async function getUserInventory() {
  const result = await UserStore.get(TEST_USER_ID);
  if (result.isErr() || !result.unwrap()) {
    return {};
  }
  return normalizeModernInventory(result.unwrap()!.inventory);
}

describe("RPG Processing", () => {
  beforeAll(async () => {
    // Verify materials can be processed
    expect(canProcessMaterial("copper_ore")).toBe(true);
    expect(canProcessMaterial("iron_ore")).toBe(true);
    expect(canProcessMaterial("oak_wood")).toBe(true);
    expect(canProcessMaterial("gold_ore")).toBe(true);
  });

  afterAll(async () => {
    await cleanupTestUser();
  });

  describe("basic processing", () => {
    it("should process copper ore with correct ratios", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Give user materials and coins
      await itemMutationService.adjustItemQuantity(
        {
          actorId: TEST_ACTOR_ID,
          targetId: TEST_USER_ID,
          guildId: TEST_GUILD_ID,
          itemId: "copper_ore",
          delta: 10,
          reason: "Test setup",
        },
        async () => true,
      );

      // Directly patch user with coins using UserStore
      await UserStore.patch(TEST_USER_ID, {
        currency: {
          coins: { hand: 1000, bank: 0, use_total_on_subtract: false },
        },
      } as any);

      // Process 4 copper ore (2 batches)
      const result = await rpgProcessingService.process({
        userId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        rawMaterialId: "copper_ore",
        quantity: 4,
        actorId: TEST_ACTOR_ID,
        luckLevel: 0, // No luck bonus
      });

      if (result.isErr()) {
        console.error("Processing error:", result.error);
      }
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const proc = result.unwrap();
        expect(proc.rawMaterialId).toBe("copper_ore");
        expect(proc.outputMaterialId).toBe("copper_ingot");
        expect(proc.materialsConsumed).toBe(4);
        expect(proc.batchesAttempted).toBe(2);
        expect(proc.outputGained).toBeGreaterThanOrEqual(0);
        expect(proc.outputGained).toBeLessThanOrEqual(2);
        expect(proc.feePaid).toBeGreaterThan(0);
      }

      // Verify materials consumed
      const inventory = await getUserInventory();
      expect(getModernItemQuantity(inventory, "copper_ore")).toBe(6); // 10 - 4
    });

    it("should fail without sufficient materials", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Give only 1 material
      await itemMutationService.adjustItemQuantity(
        {
          actorId: TEST_ACTOR_ID,
          targetId: TEST_USER_ID,
          guildId: TEST_GUILD_ID,
          itemId: "copper_ore",
          delta: 1,
          reason: "Test setup",
        },
        async () => true,
      );

      const result = await rpgProcessingService.process({
        userId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        rawMaterialId: "copper_ore",
        quantity: 4,
        actorId: TEST_ACTOR_ID,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("INSUFFICIENT_MATERIALS");
      }
    });

    it("should fail without sufficient funds", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Give materials but no coins
      await itemMutationService.adjustItemQuantity(
        {
          actorId: TEST_ACTOR_ID,
          targetId: TEST_USER_ID,
          guildId: TEST_GUILD_ID,
          itemId: "copper_ore",
          delta: 10,
          reason: "Test setup",
        },
        async () => true,
      );

      const result = await rpgProcessingService.process({
        userId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        rawMaterialId: "copper_ore",
        quantity: 4,
        actorId: TEST_ACTOR_ID,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("INSUFFICIENT_FUNDS");
      }
    });
  });

  describe("success chance", () => {
    it("should use base success rate from config", async () => {
      expect(PROCESSING_CONFIG.baseSuccessRate).toBe(0.62);
      
      const chance = calculateSuccessChance(0);
      expect(chance).toBe(0.62);
    });

    it("should apply luck bonus", async () => {
      // Luck level 10 should give +10%
      const chance = calculateSuccessChance(10);
      expect(chance).toBe(0.72); // 0.62 + 0.10
    });

    it("should cap luck bonus at 25%", async () => {
      // Luck level 50 should still only give +25%
      const chance = calculateSuccessChance(50);
      expect(chance).toBe(0.87); // 0.62 + 0.25 (capped)
    });

    it("should use provided luck level", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Give materials directly via UserStore
      await UserStore.patch(TEST_USER_ID, {
        inventory: {
          copper_ore: { id: "copper_ore", quantity: 100 },
        },
      } as any);

      // Give user coins for processing fees
      await UserStore.patch(TEST_USER_ID, {
        currency: {
          coins: { hand: 5000, bank: 0, use_total_on_subtract: false },
        },
      } as any);

      // Process with high luck (should have higher success rate)
      const result = await rpgProcessingService.process({
        userId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        rawMaterialId: "copper_ore",
        quantity: 20, // 10 batches
        actorId: TEST_ACTOR_ID,
        luckLevel: 25, // Max luck
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.unwrap().successChance).toBe(0.87); // 62% + 25%
      }
    });
  });

  describe("fee handling", () => {
    it("should calculate tier-scaled fees", async () => {
      // Tier 1 (oak) should be cheaper than tier 4 (gold/pine)
      const oakFee = calculateFee("oak_wood", 1);
      const goldFee = calculateFee("gold_ore", 1);
      
      expect(oakFee).toBeLessThan(goldFee);
      expect(oakFee).toBe(1); // 12 * 0.1 = 1.2 -> 1 (floored)
      expect(goldFee).toBe(12); // 120 * 0.1 = 12
    });

    it("should deposit fee to guild trade sector", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Get initial guild balance
      const initialBalance = await guildEconomyService.getSectorBalance(
        TEST_GUILD_ID,
        "trade",
      );
      const initialAmount = initialBalance.isOk() ? initialBalance.unwrap() : 0;

      // Give materials directly via UserStore
      await UserStore.patch(TEST_USER_ID, {
        inventory: {
          copper_ore: { id: "copper_ore", quantity: 10 },
        },
      } as any);

      // Give user coins for processing fees
      await UserStore.patch(TEST_USER_ID, {
        currency: {
          coins: { hand: 1000, bank: 0, use_total_on_subtract: false },
        },
      } as any);

      // Process
      const procResult = await rpgProcessingService.process({
        userId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        rawMaterialId: "copper_ore",
        quantity: 4,
        actorId: TEST_ACTOR_ID,
      });
      
      expect(procResult.isOk()).toBe(true);
      
      // Verify guild received fee
      const finalBalance = await guildEconomyService.getSectorBalance(
        TEST_GUILD_ID,
        "trade",
      );
      
      expect(finalBalance.isOk()).toBe(true);
      if (finalBalance.isOk()) {
        const finalAmount = finalBalance.unwrap();
        // Fee should be deposited (2 batches * fee per batch)
        expect(typeof finalAmount).toBe("number");
        expect(finalAmount).toBeGreaterThan(initialAmount);
      }
    });
  });

  describe("failure handling", () => {
    it("should consume inputs on failure", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Give materials and coins
      await itemMutationService.adjustItemQuantity(
        {
          actorId: TEST_ACTOR_ID,
          targetId: TEST_USER_ID,
          guildId: TEST_GUILD_ID,
          itemId: "copper_ore",
          delta: 10,
          reason: "Test setup",
        },
        async () => true,
      );

      // Give user coins for processing fees
      await UserStore.patch(TEST_USER_ID, {
        currency: {
          coins: { hand: 1000, bank: 0, use_total_on_subtract: false },
        },
      } as any);

      // Get initial material count
      const initialInventory = await getUserInventory();
      const initialCount = getModernItemQuantity(initialInventory, "copper_ore");

      // Process with 0% luck to maximize failures
      const result = await rpgProcessingService.process({
        userId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        rawMaterialId: "copper_ore",
        quantity: 4,
        actorId: TEST_ACTOR_ID,
        luckLevel: 0,
      });

      expect(result.isOk()).toBe(true);

      // Verify materials were consumed regardless of success/failure
      const finalInventory = await getUserInventory();
      const finalCount = getModernItemQuantity(finalInventory, "copper_ore");
      expect(finalCount).toBe(initialCount - 4);
    });

    it("should produce no output on failed batches", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Give materials directly via UserStore
      await UserStore.patch(TEST_USER_ID, {
        inventory: {
          copper_ore: { id: "copper_ore", quantity: 100 },
        },
      } as any);

      // Give user coins for processing fees
      await UserStore.patch(TEST_USER_ID, {
        currency: {
          coins: { hand: 5000, bank: 0, use_total_on_subtract: false },
        },
      } as any);

      // Process many batches with 0% luck
      const result = await rpgProcessingService.process({
        userId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        rawMaterialId: "copper_ore",
        quantity: 20, // 10 batches
        actorId: TEST_ACTOR_ID,
        luckLevel: 0,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const proc = result.unwrap();
        // Output should be at most successes (could be 0-10)
        expect(proc.outputGained).toBeLessThanOrEqual(proc.batchesSucceeded);
        expect(proc.outputGained).toBe(proc.batchesSucceeded); // 1:1 ratio on success
      }
    });
  });

  describe("batch calculations", () => {
    it("should floor quantity to pairs", async () => {
      await cleanupTestUser();
      await setupTestUser();

      // Give materials and coins
      await itemMutationService.adjustItemQuantity(
        {
          actorId: TEST_ACTOR_ID,
          targetId: TEST_USER_ID,
          guildId: TEST_GUILD_ID,
          itemId: "copper_ore",
          delta: 10,
          reason: "Test setup",
        },
        async () => true,
      );

      // Give user coins for processing fees
      await UserStore.patch(TEST_USER_ID, {
        currency: {
          coins: { hand: 1000, bank: 0, use_total_on_subtract: false },
        },
      } as any);

      // Try to process 5 (odd number)
      const result = await rpgProcessingService.process({
        userId: TEST_USER_ID,
        guildId: TEST_GUILD_ID,
        rawMaterialId: "copper_ore",
        quantity: 5, // Should floor to 4 (2 batches)
        actorId: TEST_ACTOR_ID,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // Should only process 4 materials (2 batches)
        expect(result.unwrap().materialsConsumed).toBe(4);
        expect(result.unwrap().batchesAttempted).toBe(2);
      }
    });
  });

  describe("getProcessingInfo", () => {
    it("should return processing info for valid material", async () => {
      await cleanupTestUser();
      await setupTestUser();

      const info = await rpgProcessingService.getProcessingInfo(
        "copper_ore",
        TEST_GUILD_ID,
        TEST_USER_ID,
      );

      expect(info.canProcess).toBe(true);
      expect(info.outputId).toBe("copper_ingot");
      expect(info.successChance).toBeGreaterThan(0);
      expect(info.fee).toBeGreaterThan(0);
    });

    it("should return canProcess=false for invalid material", async () => {
      const info = await rpgProcessingService.getProcessingInfo("stick");

      expect(info.canProcess).toBe(false);
      expect(info.outputId).toBeNull();
    });
  });
});
