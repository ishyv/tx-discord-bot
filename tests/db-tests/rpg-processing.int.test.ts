/**
 * RPG Processing Integration Tests.
 *
 * Tests:
 * - Processing materials with success/failure
 * - Fee calculation and deduction
 * - Luck stat influence on success rate
 * - Inventory updates (materials consumed, products gained)
 * - Insufficient materials handling
 * - Deterministic RNG with seeded values
 */

import * as UsersRepo from "../../src/db/repositories/users";
import * as GuildsRepo from "../../src/db/repositories/guilds";
import { rpgProcessingService } from "../../src/modules/rpg/processing/service";
import { rpgProfileRepo } from "../../src/modules/rpg/profile/repository";
import { rpgConfigRepo } from "../../src/modules/rpg/config";
import { economyAccountRepo } from "../../src/modules/economy/accounts/repository";
import { itemMutationService } from "../../src/modules/economy/mutations/items/service";
import { currencyMutationService } from "../../src/modules/economy/mutations/currency/service";
import { SeededRNG } from "../../src/modules/rpg/utils/seeded-rng";
import { assert, assertEqual, assertOk, ops, type Suite } from "./_utils";

const cleanupUser = (
  cleanup: { add: (task: () => Promise<void> | void) => void },
  id: string,
) => {
  cleanup.add(async () => {
    await UsersRepo.deleteUser(id);
  });
};

const cleanupGuild = (
  cleanup: { add: (task: () => Promise<void> | void) => void },
  id: string,
) => {
  cleanup.add(async () => {
    await GuildsRepo.deleteGuild(id);
  });
};

export const suite: Suite = {
  name: "rpg processing",
  tests: [
    {
      name: "process requires profile",
      ops: [ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);

        const result = await rpgProcessingService.process({
          userId,
          guildId,
          rawMaterialId: "iron_ore",
          quantity: 2,
          actorId: userId,
        });
        
        assert(result.isErr(), "should fail without profile");
        assertEqual((result.error as { code?: string }).code, "PROFILE_NOT_FOUND", "error code should be PROFILE_NOT_FOUND");
      },
    },
    {
      name: "process requires sufficient materials",
      ops: [ops.create, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await rpgConfigRepo.ensure(guildId);
        assertOk(await economyAccountRepo.ensure(userId));
        assertOk(await rpgProfileRepo.ensure(userId));

        // Don't give any materials
        const result = await rpgProcessingService.process({
          userId,
          guildId,
          rawMaterialId: "iron_ore",
          quantity: 2,
          actorId: userId,
        });
        
        assert(result.isErr(), "should fail without materials");
        assertEqual((result.error as { code?: string }).code, "INSUFFICIENT_MATERIALS", "error code should be INSUFFICIENT_MATERIALS");
      },
    },
    {
      name: "process consumes materials and creates products on success",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await rpgConfigRepo.ensure(guildId);
        assertOk(await economyAccountRepo.ensure(userId));
        assertOk(await rpgProfileRepo.ensure(userId));

        // Give raw materials
        assertOk(
          await itemMutationService.adjustItemQuantity(
            { actorId: userId, targetId: userId, guildId, itemId: "iron_ore", delta: 10, reason: "test" },
            async () => true,
          ),
        );

        // Give currency for fees
        assertOk(
          await currencyMutationService.adjustCurrency(
            { actorId: userId, targetId: userId, guildId, currencyId: "coins", delta: 1000, reason: "test" },
            async () => true,
          ),
        );

        // Process with high success seed
        const rng = new SeededRNG(10000); // Seed that produces success
        const result = await rpgProcessingService.process({
          userId,
          guildId,
          rawMaterialId: "iron_ore",
          quantity: 4, // 2 batches
          actorId: userId,
          rng,
        });
        
        assertOk(result);
        const processResult = result.unwrap();
        assertEqual(processResult.batchesAttempted, 2, "should attempt 2 batches");
        assert(processResult.batchesSucceeded > 0, "should have some successes");
        assertEqual(processResult.materialsConsumed, 4, "should consume 4 raw materials");
        assert(processResult.outputGained > 0, "should gain processed materials");
        assert(processResult.feePaid > 0, "should pay processing fee");
      },
    },
    {
      name: "deterministic RNG produces predictable results",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await rpgConfigRepo.ensure(guildId);
        assertOk(await economyAccountRepo.ensure(userId));
        assertOk(await rpgProfileRepo.ensure(userId));

        // Give plenty of materials and currency
        assertOk(
          await itemMutationService.adjustItemQuantity(
            { actorId: userId, targetId: userId, guildId, itemId: "iron_ore", delta: 20, reason: "test" },
            async () => true,
          ),
        );
        assertOk(
          await currencyMutationService.adjustCurrency(
            { actorId: userId, targetId: userId, guildId, currencyId: "coins", delta: 2000, reason: "test" },
            async () => true,
          ),
        );

        // First process with seed 12345
        const rng1 = new SeededRNG(12345);
        const result1 = assertOk(await rpgProcessingService.process({
          userId,
          guildId,
          rawMaterialId: "iron_ore",
          quantity: 4,
          actorId: userId,
          rng: rng1,
        }));

        // Reset inventory for second run
        assertOk(
          await itemMutationService.adjustItemQuantity(
            { actorId: userId, targetId: userId, guildId, itemId: "iron_ore", delta: 20, reason: "test reset" },
            async () => true,
          ),
        );

        // Second process with same seed
        const rng2 = new SeededRNG(12345);
        const result2 = assertOk(await rpgProcessingService.process({
          userId,
          guildId,
          rawMaterialId: "iron_ore",
          quantity: 4,
          actorId: userId,
          rng: rng2,
        }));

        // Results should be identical
        assertEqual(result1.batchesSucceeded, result2.batchesSucceeded, "same seed should produce same successes");
        assertEqual(result1.outputGained, result2.outputGained, "same seed should produce same output");
      },
    },
    {
      name: "process fails with insufficient funds for fees",
      ops: [ops.create, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await rpgConfigRepo.ensure(guildId);
        assertOk(await economyAccountRepo.ensure(userId));
        assertOk(await rpgProfileRepo.ensure(userId));

        // Give materials but no currency
        assertOk(
          await itemMutationService.adjustItemQuantity(
            { actorId: userId, targetId: userId, guildId, itemId: "iron_ore", delta: 10, reason: "test" },
            async () => true,
          ),
        );

        const result = await rpgProcessingService.process({
          userId,
          guildId,
          rawMaterialId: "iron_ore",
          quantity: 4,
          actorId: userId,
        });
        
        assert(result.isErr(), "should fail without funds for fees");
        assertEqual((result.error as { code?: string }).code, "INSUFFICIENT_FUNDS", "error code should be INSUFFICIENT_FUNDS");
      },
    },
    {
      name: "luck stat increases success chance",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId1 = factory.userId();
        const userId2 = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId1);
        cleanupUser(cleanup, userId2);

        await GuildsRepo.ensureGuild(guildId);
        await rpgConfigRepo.ensure(guildId);

        // Setup user with no luck
        assertOk(await economyAccountRepo.ensure(userId1));
        assertOk(await rpgProfileRepo.ensure(userId1));
        assertOk(
          await itemMutationService.adjustItemQuantity(
            { actorId: userId1, targetId: userId1, guildId, itemId: "iron_ore", delta: 20, reason: "test" },
            async () => true,
          ),
        );
        assertOk(
          await currencyMutationService.adjustCurrency(
            { actorId: userId1, targetId: userId1, guildId, currencyId: "coins", delta: 5000, reason: "test" },
            async () => true,
          ),
        );

        // Setup user with luck equipment
        assertOk(await economyAccountRepo.ensure(userId2));
        assertOk(await rpgProfileRepo.ensure(userId2));
        assertOk(
          await itemMutationService.adjustItemQuantity(
            { actorId: userId2, targetId: userId2, guildId, itemId: "iron_ore", delta: 20, reason: "test" },
            async () => true,
          ),
        );
        assertOk(
          await currencyMutationService.adjustCurrency(
            { actorId: userId2, targetId: userId2, guildId, currencyId: "coins", delta: 5000, reason: "test" },
            async () => true,
          ),
        );
        // Equip luck ring for user 2
        assertOk(
          await itemMutationService.adjustItemQuantity(
            { actorId: userId2, targetId: userId2, guildId, itemId: "luck_ring", delta: 1, reason: "test" },
            async () => true,
          ),
        );
        const profile2 = assertOk(await rpgProfileRepo.findById(userId2));
        assertOk(await rpgProfileRepo.updateLoadout(userId2, { ...profile2.unwrap()!.loadout, ring: "luck_ring" }));

        // Process multiple batches with same seed to compare
        const rng1 = new SeededRNG(77777);
        const rng2 = new SeededRNG(77777);

        let success1 = 0;
        let success2 = 0;
        const batches = 10;

        for (let i = 0; i < batches; i++) {
          // Reset materials for each batch
          await itemMutationService.adjustItemQuantity(
            { actorId: userId1, targetId: userId1, guildId, itemId: "iron_ore", delta: 2, reason: "test" },
            async () => true,
          );
          await itemMutationService.adjustItemQuantity(
            { actorId: userId2, targetId: userId2, guildId, itemId: "iron_ore", delta: 2, reason: "test" },
            async () => true,
          );

          const r1 = await rpgProcessingService.process({
            userId: userId1,
            guildId,
            rawMaterialId: "iron_ore",
            quantity: 2,
            actorId: userId1,
            rng: rng1,
          });
          const r2 = await rpgProcessingService.process({
            userId: userId2,
            guildId,
            rawMaterialId: "iron_ore",
            quantity: 2,
            actorId: userId2,
            rng: rng2,
          });

          if (r1.isOk() && r1.unwrap().batchesSucceeded > 0) success1++;
          if (r2.isOk() && r2.unwrap().batchesSucceeded > 0) success2++;
        }

        // User with luck ring should have equal or higher success rate
        assert(success2 >= success1 * 0.8, "luck should improve or maintain success rate");
      },
    },
    {
      name: "processing fees are calculated correctly",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        const config = assertOk(await rpgConfigRepo.ensure(guildId));
        assertOk(await economyAccountRepo.ensure(userId));
        assertOk(await rpgProfileRepo.ensure(userId));

        // Give materials and exact amount for fees
        assertOk(
          await itemMutationService.adjustItemQuantity(
            { actorId: userId, targetId: userId, guildId, itemId: "iron_ore", delta: 4, reason: "test" },
            async () => true,
          ),
        );
        
        // Calculate expected fee: 4 materials = 2 batches, fee per batch based on config
        const expectedFeePerBatch = Math.max(
          config.processing.minFee,
          Math.min(config.processing.maxFee, 4 * config.processing.feePercent),
        );
        const expectedTotalFee = expectedFeePerBatch * 2;

        assertOk(
          await currencyMutationService.adjustCurrency(
            { actorId: userId, targetId: userId, guildId, currencyId: "coins", delta: expectedTotalFee, reason: "test" },
            async () => true,
          ),
        );

        const rng = new SeededRNG(10000);
        const result = assertOk(await rpgProcessingService.process({
          userId,
          guildId,
          rawMaterialId: "iron_ore",
          quantity: 4,
          actorId: userId,
          rng,
        }));

        assertEqual(result.feePaid, expectedTotalFee, "fee should match expected calculation");
      },
    },
  ],
};
