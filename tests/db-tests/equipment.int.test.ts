/**
 * Equipment Integration Tests (Phase 4).
 *
 * Tests:
 * - equip removes from inventory and sets slot
 * - unequip returns to inventory
 * - cannot equip missing item
 * - slot swapping works correctly
 * - stats are calculated correctly
 * - audit entries are created
 * - rate limiting works
 */

import * as UsersRepo from "../../src/db/repositories/users";
import * as GuildsRepo from "../../src/db/repositories/guilds";
import {
  equipmentService,
  equipmentRepo,
  economyAccountRepo,
  economyAuditRepo,
  currencyMutationService,
  itemMutationService,
} from "../../src/modules/economy";
import { assert, assertEqual, assertOk, ops, type Suite } from "./_utils";

const cleanupUser = (
  cleanup: { add: (task: () => Promise<void> | void) => void },
  id: string,
) => {
  cleanup.add(async () => {
    const res = await UsersRepo.deleteUser(id);
    if (res.isErr()) return;
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
  name: "equipment",
  tests: [
    {
      name: "equip removes item from inventory and sets slot",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));

        // Give user an equipable item
        assertOk(
          await itemMutationService.adjustItemQuantity(
            {
              actorId: userId,
              targetId: userId,
              guildId,
              itemId: "casco_cuero",
              delta: 1,
              reason: "test setup",
            },
            async () => true,
          ),
        );

        // Equip the item
        const result = assertOk(
          await equipmentService.equipItem({
            guildId,
            userId,
            itemId: "casco_cuero",
          }),
        );

        assertEqual(result.slot, "head", "should equip to head slot");
        assertEqual(result.itemId, "casco_cuero", "itemId should match");
        assertEqual(result.operation, "equip", "operation should be equip");

        // Verify item is no longer in inventory
        const equipableItems = assertOk(
          await equipmentService.listEquipableItems(guildId, userId),
        );
        const casco = equipableItems.find((i) => i.itemId === "casco_cuero");
        assert(!casco, "item should not be in inventory after equipping");

        // Verify loadout
        const loadout = assertOk(
          await equipmentService.getLoadout(guildId, userId),
        );
        assert(loadout.slots.head, "head slot should have item");
        assertEqual(
          loadout.slots.head!.itemId,
          "casco_cuero",
          "equipped item should match",
        );
      },
    },
    {
      name: "equip swaps items when slot is occupied",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));

        // Give user two head items
        await itemMutationService.adjustItemQuantity(
          {
            actorId: userId,
            targetId: userId,
            guildId,
            itemId: "casco_cuero",
            delta: 1,
            reason: "test",
          },
          async () => true,
        );
        await itemMutationService.adjustItemQuantity(
          {
            actorId: userId,
            targetId: userId,
            guildId,
            itemId: "casco_hierro",
            delta: 1,
            reason: "test",
          },
          async () => true,
        );

        // Equip first item
        assertOk(
          await equipmentService.equipItem({
            guildId,
            userId,
            itemId: "casco_cuero",
          }),
        );

        // Equip second item (should swap)
        const result = assertOk(
          await equipmentService.equipItem({
            guildId,
            userId,
            itemId: "casco_hierro",
          }),
        );

        assertEqual(result.operation, "swap", "operation should be swap");
        assertEqual(
          result.previousItemId,
          "casco_cuero",
          "previous item should be returned",
        );
        assertEqual(
          result.itemId,
          "casco_hierro",
          "new item should be equipped",
        );

        // Verify old item is back in inventory
        const equipableItems = assertOk(
          await equipmentService.listEquipableItems(guildId, userId),
        );
        const oldItem = equipableItems.find((i) => i.itemId === "casco_cuero");
        assert(oldItem, "swapped item should be back in inventory");
        assertEqual(oldItem!.quantity, 1, "should have 1 of the swapped item");
      },
    },
    {
      name: "unequip returns item to inventory",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));

        // Give and equip item
        await itemMutationService.adjustItemQuantity(
          {
            actorId: userId,
            targetId: userId,
            guildId,
            itemId: "casco_cuero",
            delta: 1,
            reason: "test",
          },
          async () => true,
        );
        assertOk(
          await equipmentService.equipItem({
            guildId,
            userId,
            itemId: "casco_cuero",
          }),
        );

        // Unequip
        const result = assertOk(
          await equipmentService.unequipSlot({ guildId, userId, slot: "head" }),
        );

        assertEqual(result.slot, "head", "slot should be head");
        assertEqual(result.itemId, "casco_cuero", "itemId should match");
        assertEqual(result.operation, "unequip", "operation should be unequip");

        // Verify item is back in inventory
        const equipableItems = assertOk(
          await equipmentService.listEquipableItems(guildId, userId),
        );
        const casco = equipableItems.find((i) => i.itemId === "casco_cuero");
        assert(casco, "item should be back in inventory");
        assertEqual(casco!.quantity, 1, "should have 1 item");

        // Verify slot is empty
        const loadout = assertOk(
          await equipmentService.getLoadout(guildId, userId),
        );
        assert(!loadout.slots.head, "head slot should be empty");
      },
    },
    {
      name: "cannot equip item not in inventory",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));

        // Try to equip item not in inventory
        const result = await equipmentService.equipItem({
          guildId,
          userId,
          itemId: "casco_cuero",
        });

        assert(result.isErr(), "should fail when item not in inventory");
        assertEqual(
          result.error?.code,
          "ITEM_NOT_IN_INVENTORY",
          "error code should match",
        );
      },
    },
    {
      name: "cannot equip non-equipable item",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));

        // Give user a non-equipable item (e.g., "palo")
        await itemMutationService.adjustItemQuantity(
          {
            actorId: userId,
            targetId: userId,
            guildId,
            itemId: "palo",
            delta: 1,
            reason: "test",
          },
          async () => true,
        );

        const result = await equipmentService.equipItem({
          guildId,
          userId,
          itemId: "palo",
        });

        assert(result.isErr(), "should fail for non-equipable item");
        assertEqual(
          result.error?.code,
          "ITEM_NOT_EQUIPABLE",
          "error code should match",
        );
      },
    },
    {
      name: "cannot unequip empty slot",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));

        const result = await equipmentService.unequipSlot({
          guildId,
          userId,
          slot: "head",
        });

        assert(result.isErr(), "should fail when slot is empty");
        assertEqual(
          result.error?.code,
          "SLOT_EMPTY",
          "error code should match",
        );
      },
    },
    {
      name: "stats are calculated correctly from equipment",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));

        // Give and equip items with stats
        await itemMutationService.adjustItemQuantity(
          {
            actorId: userId,
            targetId: userId,
            guildId,
            itemId: "casco_cuero",
            delta: 1,
            reason: "test",
          },
          async () => true,
        );
        await itemMutationService.adjustItemQuantity(
          {
            actorId: userId,
            targetId: userId,
            guildId,
            itemId: "espada_hierro",
            delta: 1,
            reason: "test",
          },
          async () => true,
        );

        // casco_cuero: luck +1, weightCap +5
        // espada_hierro: workBonusPct +0.03, luck +1

        await equipmentService.equipItem({
          guildId,
          userId,
          itemId: "casco_cuero",
        });
        await equipmentService.equipItem({
          guildId,
          userId,
          itemId: "espada_hierro",
        });

        const stats = assertOk(
          await equipmentService.getStatsSummary(guildId, userId),
        );

        assertEqual(stats.luck, 2, "luck should be 2 (1+1)");
        assertEqual(stats.weightCap, 5, "weightCap should be 5");
        assertEqual(stats.workBonusPct, 0.03, "workBonusPct should be 0.03");
      },
    },
    {
      name: "audit entry created for equip operation",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));

        await itemMutationService.adjustItemQuantity(
          {
            actorId: userId,
            targetId: userId,
            guildId,
            itemId: "casco_cuero",
            delta: 1,
            reason: "test",
          },
          async () => true,
        );

        const result = assertOk(
          await equipmentService.equipItem({
            guildId,
            userId,
            itemId: "casco_cuero",
          }),
        );

        // Query audit
        const audit = assertOk(
          await economyAuditRepo.query({ correlationId: result.correlationId }),
        );

        assert(audit.entries.length > 0, "should have audit entry");
        assertEqual(
          audit.entries[0].operationType,
          "item_equip",
          "operation type should match",
        );
        assertEqual(
          audit.entries[0].metadata?.itemId,
          "casco_cuero",
          "itemId should be in metadata",
        );
      },
    },
    {
      name: "equipment is guild-scoped",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId1 = factory.guildId();
        const guildId2 = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId1);
        cleanupGuild(cleanup, guildId2);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId1);
        await GuildsRepo.ensureGuild(guildId2);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));

        // Give and equip in guild 1
        await itemMutationService.adjustItemQuantity(
          {
            actorId: userId,
            targetId: userId,
            guildId: guildId1,
            itemId: "casco_cuero",
            delta: 1,
            reason: "test",
          },
          async () => true,
        );
        await equipmentService.equipItem({
          guildId: guildId1,
          userId,
          itemId: "casco_cuero",
        });

        // Verify equipped in guild 1
        const loadout1 = assertOk(
          await equipmentService.getLoadout(guildId1, userId),
        );
        assert(loadout1.slots.head, "should be equipped in guild 1");

        // Verify not equipped in guild 2
        const loadout2 = assertOk(
          await equipmentService.getLoadout(guildId2, userId),
        );
        assert(!loadout2.slots.head, "should not be equipped in guild 2");
      },
    },
  ],
};
