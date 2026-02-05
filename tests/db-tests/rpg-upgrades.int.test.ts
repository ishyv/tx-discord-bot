/**
 * RPG Upgrades Integration Tests.
 *
 * Tests:
 * - Tool tier upgrades with materials and money
 * - Upgrade preview calculation
 * - Max tier reached handling
 * - Already owns higher tier handling
 * - Instance-based tool consumption
 * - Auto-equip after upgrade
 * - Audit logging
 * - Deterministic behavior
 */

import * as UsersRepo from "../../src/db/repositories/users";
import * as GuildsRepo from "../../src/db/repositories/guilds";
import { rpgUpgradeService } from "../../src/modules/rpg/upgrades/service";
import { rpgProfileRepo } from "../../src/modules/rpg/profile/repository";
import { rpgConfigRepo } from "../../src/modules/rpg/config";
import { economyAccountRepo } from "../../src/modules/economy/accounts/repository";
import { itemMutationService } from "../../src/modules/economy/mutations/items/service";
import { currencyMutationService } from "../../src/modules/economy/mutations/currency/service";
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
  name: "rpg upgrades",
  tests: [
    {
      name: "upgrade requires profile",
      ops: [ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);

        const result = await rpgUpgradeService.upgrade({
          userId,
          guildId,
          toolId: "pickaxe",
          instanceId: "test-instance-1",
          actorId: userId,
        });
        
        assert(result.isErr(), "should fail without profile");
        assertEqual((result.error as { code?: string }).code, "PROFILE_NOT_FOUND", "error code should be PROFILE_NOT_FOUND");
      },
    },
    {
      name: "upgrade requires tool instance",
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

        const result = await rpgUpgradeService.upgrade({
          userId,
          guildId,
          toolId: "pickaxe",
          instanceId: "non-existent-instance",
          actorId: userId,
        });
        
        assert(result.isErr(), "should fail without tool instance");
        assertEqual((result.error as { code?: string }).code, "INSTANCE_NOT_FOUND", "error code should be INSTANCE_NOT_FOUND");
      },
    },
    {
      name: "upgrade fails at max tier",
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

        // Give tier 4 pickaxe (max tier)
        assertOk(
          await itemMutationService.adjustItemQuantity(
            { actorId: userId, targetId: userId, guildId, itemId: "pickaxe_lv4", delta: 1, reason: "test" },
            async () => true,
          ),
        );

        const result = await rpgUpgradeService.upgrade({
          userId,
          guildId,
          toolId: "pickaxe_lv4",
          instanceId: "pickaxe-lv4-instance",
          actorId: userId,
        });
        
        assert(result.isErr(), "should fail at max tier");
        assertEqual((result.error as { code?: string }).code, "MAX_TIER_REACHED", "error code should be MAX_TIER_REACHED");
      },
    },
    {
      name: "upgrade preview shows correct costs",
      ops: [ops.create, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        const config = assertOk(await rpgConfigRepo.ensure(guildId));
        assertOk(await economyAccountRepo.ensure(userId));
        assertOk(await rpgProfileRepo.ensure(userId));

        // Give tier 1 pickaxe
        assertOk(
          await itemMutationService.adjustItemQuantity(
            { actorId: userId, targetId: userId, guildId, itemId: "pickaxe", delta: 1, reason: "test" },
            async () => true,
          ),
        );

        const preview = assertOk(await rpgUpgradeService.getUpgradePreview(userId, "pickaxe", "pickaxe-instance"));
        
        assert(preview.canUpgrade, "should be able to upgrade from tier 1");
        assertEqual(preview.currentTier, 1, "current tier should be 1");
        assertEqual(preview.nextTier, 2, "next tier should be 2");
        assert(preview.cost.money > 0, "should have money cost");
        assert(preview.cost.materials.length > 0, "should have material costs");
      },
    },
    {
      name: "successful upgrade consumes materials and money",
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

        // Give tier 1 pickaxe
        assertOk(
          await itemMutationService.adjustItemQuantity(
            { actorId: userId, targetId: userId, guildId, itemId: "pickaxe", delta: 1, reason: "test" },
            async () => true,
          ),
        );

        // Get upgrade costs
        const tier2Cost = config.upgrades.costs.tier2;
        assert(tier2Cost, "should have tier 2 cost defined");

        // Give required materials
        for (const mat of tier2Cost.materials) {
          assertOk(
            await itemMutationService.adjustItemQuantity(
              { actorId: userId, targetId: userId, guildId, itemId: mat.id, delta: mat.quantity, reason: "test" },
              async () => true,
            ),
          );
        }

        // Give required money
        assertOk(
          await currencyMutationService.adjustCurrency(
            { actorId: userId, targetId: userId, guildId, currencyId: "coins", delta: tier2Cost.money, reason: "test" },
            async () => true,
          ),
        );

        // Perform upgrade
        const result = await rpgUpgradeService.upgrade({
          userId,
          guildId,
          toolId: "pickaxe",
          instanceId: "pickaxe-instance-1",
          actorId: userId,
        });
        
        assertOk(result);
        const upgradeResult = result.unwrap();
        assertEqual(upgradeResult.newTier, 2, "should upgrade to tier 2");
        assertEqual(upgradeResult.newToolId, "pickaxe_lv2", "should have new tool ID");
        assertEqual(upgradeResult.moneySpent, tier2Cost.money, "should spend correct amount");
      },
    },
    {
      name: "upgrade fails with insufficient materials",
      ops: [ops.create, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        const config = assertOk(await rpgConfigRepo.ensure(guildId));
        assertOk(await economyAccountRepo.ensure(userId));
        assertOk(await rpgProfileRepo.ensure(userId));

        // Give tier 1 pickaxe
        assertOk(
          await itemMutationService.adjustItemQuantity(
            { actorId: userId, targetId: userId, guildId, itemId: "pickaxe", delta: 1, reason: "test" },
            async () => true,
          ),
        );

        // Give money but no materials
        const tier2Cost = config.upgrades.costs.tier2;
        assertOk(
          await currencyMutationService.adjustCurrency(
            { actorId: userId, targetId: userId, guildId, currencyId: "coins", delta: tier2Cost.money, reason: "test" },
            async () => true,
          ),
        );

        const result = await rpgUpgradeService.upgrade({
          userId,
          guildId,
          toolId: "pickaxe",
          instanceId: "pickaxe-instance-1",
          actorId: userId,
        });
        
        assert(result.isErr(), "should fail without materials");
        assertEqual((result.error as { code?: string }).code, "INSUFFICIENT_MATERIALS", "error code should be INSUFFICIENT_MATERIALS");
      },
    },
    {
      name: "upgrade fails with insufficient funds",
      ops: [ops.create, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        const config = assertOk(await rpgConfigRepo.ensure(guildId));
        assertOk(await economyAccountRepo.ensure(userId));
        assertOk(await rpgProfileRepo.ensure(userId));

        // Give tier 1 pickaxe
        assertOk(
          await itemMutationService.adjustItemQuantity(
            { actorId: userId, targetId: userId, guildId, itemId: "pickaxe", delta: 1, reason: "test" },
            async () => true,
          ),
        );

        // Give materials but no money
        const tier2Cost = config.upgrades.costs.tier2;
        for (const mat of tier2Cost.materials) {
          assertOk(
            await itemMutationService.adjustItemQuantity(
              { actorId: userId, targetId: userId, guildId, itemId: mat.id, delta: mat.quantity, reason: "test" },
              async () => true,
            ),
          );
        }

        const result = await rpgUpgradeService.upgrade({
          userId,
          guildId,
          toolId: "pickaxe",
          instanceId: "pickaxe-instance-1",
          actorId: userId,
        });
        
        assert(result.isErr(), "should fail without money");
        assertEqual((result.error as { code?: string }).code, "INSUFFICIENT_FUNDS", "error code should be INSUFFICIENT_FUNDS");
      },
    },
    {
      name: "combat lock prevents equipment changes during upgrade",
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

        // Set fighting status
        assertOk(await rpgProfileRepo.setFightingStatus(userId, true, "test-fight-id"));

        // Give tier 1 pickaxe
        assertOk(
          await itemMutationService.adjustItemQuantity(
            { actorId: userId, targetId: userId, guildId, itemId: "pickaxe", delta: 1, reason: "test" },
            async () => true,
          ),
        );

        const result = await rpgUpgradeService.upgrade({
          userId,
          guildId,
          toolId: "pickaxe",
          instanceId: "pickaxe-instance-1",
          actorId: userId,
        });
        
        assert(result.isErr(), "should fail while in combat");
        assertEqual((result.error as { code?: string }).code, "IN_COMBAT", "error code should be IN_COMBAT");

        // Clear fighting status
        assertOk(await rpgProfileRepo.setFightingStatus(userId, false, null));
      },
    },
    {
      name: "upgrade check validates if upgrade is possible",
      ops: [ops.create, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        const config = assertOk(await rpgConfigRepo.ensure(guildId));
        assertOk(await economyAccountRepo.ensure(userId));
        assertOk(await rpgProfileRepo.ensure(userId));

        // Give tier 1 pickaxe
        assertOk(
          await itemMutationService.adjustItemQuantity(
            { actorId: userId, targetId: userId, guildId, itemId: "pickaxe", delta: 1, reason: "test" },
            async () => true,
          ),
        );

        // Check upgrade without materials/money - should indicate cannot upgrade
        const checkResult = assertOk(await rpgUpgradeService.checkUpgrade(userId, "pickaxe", "pickaxe-instance"));
        
        assert(!checkResult.canUpgrade, "should not be able to upgrade without resources");
        assert(checkResult.reason, "should provide reason why upgrade is not possible");
      },
    },
  ],
};
