/**
 * Item Mutation Integration Tests.
 *
 * Tests:
 * - Permission gating
 * - Stackable vs non-stackable slot counting
 * - Weight limit enforcement
 * - Slot limit enforcement
 * - Concurrent mutation correctness
 * - Audit entry creation
 */

import * as UsersRepo from "../../src/db/repositories/users";
import {
  itemMutationService,
  economyAuditRepo,
  economyAccountRepo,
} from "../../src/modules/economy";
import type { ItemMutationError } from "../../src/modules/economy/mutations/items/types";
import type { ItemInventory } from "../../src/modules/inventory";
import {
  assert,
  assertEqual,
  assertOk,
  assertErr,
  ops,
  type Suite,
} from "./_utils";

const cleanupUser = (cleanup: { add: (task: () => Promise<void> | void) => void }, id: string) => {
  cleanup.add(async () => {
    const res = await UsersRepo.deleteUser(id);
    if (res.isErr()) return;
  });
};

async function mockCheckAdminTrue(): Promise<boolean> {
  return true;
}

async function mockCheckAdminFalse(): Promise<boolean> {
  return false;
}

export const suite: Suite = {
  name: "item mutation",
  tests: [
    // ========================================================================
    // Permission Tests
    // ========================================================================
    {
      name: "rejects non-admin actor",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        assertOk(await economyAccountRepo.ensure(targetId));

        const result = await itemMutationService.adjustItemQuantity(
          {
            actorId,
            targetId,
            itemId: "palo",
            delta: 5,
          },
          mockCheckAdminFalse,
        );

        assertEqual(result.isErr(), true, "should reject non-admin");
        const error = result.error as ItemMutationError;
        assertEqual(error.code, "INSUFFICIENT_PERMISSIONS", "error should be INSUFFICIENT_PERMISSIONS");
      },
    },

    // ========================================================================
    // Item Validation Tests
    // ========================================================================
    {
      name: "rejects invalid item ID",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        assertOk(await economyAccountRepo.ensure(targetId));

        const result = await itemMutationService.adjustItemQuantity(
          {
            actorId,
            targetId,
            itemId: "invalid.item" as any, // Contains dot
            delta: 5,
          },
          mockCheckAdminTrue,
        );

        assertEqual(result.isErr(), true, "should reject invalid item ID");
        const error = result.error as ItemMutationError;
        assertEqual(error.code, "ITEM_NOT_FOUND", "error should be ITEM_NOT_FOUND");
      },
    },

    // ========================================================================
    // Stackable Item Tests
    // ========================================================================
    {
      name: "stackable items use single slot",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        await UsersRepo.ensureUser(targetId);
        assertOk(await economyAccountRepo.ensure(targetId));

        // Add 50 stackable items (palo)
        const result = await itemMutationService.adjustItemQuantity(
          {
            actorId,
            targetId,
            itemId: "palo",
            delta: 50,
          },
          mockCheckAdminTrue,
        );

        const adjustment = assertOk(result);
        assertEqual(adjustment.afterQuantity, 50, "should have 50 items");
        assertEqual(adjustment.capacity.currentSlots, 1, "stackable items use 1 slot");
        assertEqual(adjustment.capacity.currentWeight, 50, "weight should be 50 (1x50)");
      },
    },

    // ========================================================================
    // Non-Stackable Item Tests
    // ========================================================================
    {
      name: "non-stackable items use multiple slots",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        await UsersRepo.ensureUser(targetId);
        assertOk(await economyAccountRepo.ensure(targetId));

        // Add 3 non-stackable items (espada)
        const result = await itemMutationService.adjustItemQuantity(
          {
            actorId,
            targetId,
            itemId: "espada",
            delta: 3,
          },
          mockCheckAdminTrue,
        );

        const adjustment = assertOk(result);
        assertEqual(adjustment.afterQuantity, 3, "should have 3 items");
        assertEqual(adjustment.capacity.currentSlots, 3, "non-stackable items use 3 slots");
        assertEqual(adjustment.capacity.currentWeight, 15, "weight should be 15 (5x3)");
      },
    },

    // ========================================================================
    // Capacity Limit Tests
    // ========================================================================
    {
      name: "rejects item addition exceeding weight limit",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        await UsersRepo.ensureUser(targetId);
        assertOk(await economyAccountRepo.ensure(targetId));

        // Try to add items that would exceed weight limit (200)
        // Each palo is weight 1, so 250 would exceed
        const result = await itemMutationService.adjustItemQuantity(
          {
            actorId,
            targetId,
            itemId: "palo",
            delta: 250,
          },
          mockCheckAdminTrue,
        );

        assertEqual(result.isErr(), true, "should reject weight limit exceeded");
        const error = result.error as ItemMutationError;
        assertEqual(error.code, "CAPACITY_EXCEEDED", "error should be CAPACITY_EXCEEDED");
      },
    },
    {
      name: "allows exceeding limits with force flag",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        await UsersRepo.ensureUser(targetId);
        assertOk(await economyAccountRepo.ensure(targetId));

        // Force add items exceeding weight limit
        const result = await itemMutationService.adjustItemQuantity(
          {
            actorId,
            targetId,
            itemId: "palo",
            delta: 250,
            force: true,
          },
          mockCheckAdminTrue,
        );

        const adjustment = assertOk(result);
        assertEqual(adjustment.afterQuantity, 250, "should allow with force flag");
        assertEqual(adjustment.capacity.weightExceeded, true, "should mark weight as exceeded");
      },
    },

    // ========================================================================
    // Removal Tests
    // ========================================================================
    {
      name: "removes items correctly",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        // Setup: give 20 palos
        await UsersRepo.ensureUser(targetId);
        await UsersRepo.saveUser(targetId, {
          inventory: { palo: { id: "palo", quantity: 20 } } as any,
        });
        assertOk(await economyAccountRepo.ensure(targetId));

        // Remove 5
        const result = await itemMutationService.adjustItemQuantity(
          {
            actorId,
            targetId,
            itemId: "palo",
            delta: -5,
          },
          mockCheckAdminTrue,
        );

        const adjustment = assertOk(result);
        assertEqual(adjustment.beforeQuantity, 20, "before should be 20");
        assertEqual(adjustment.afterQuantity, 15, "after should be 15");
      },
    },
    {
      name: "rejects removing more than available",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        // Setup: give 5 palos
        await UsersRepo.ensureUser(targetId);
        await UsersRepo.saveUser(targetId, {
          inventory: { palo: { id: "palo", quantity: 5 } } as any,
        });
        assertOk(await economyAccountRepo.ensure(targetId));

        // Try to remove 10
        const result = await itemMutationService.adjustItemQuantity(
          {
            actorId,
            targetId,
            itemId: "palo",
            delta: -10,
          },
          mockCheckAdminTrue,
        );

        assertEqual(result.isErr(), true, "should reject removing more than available");
        const error = result.error as ItemMutationError;
        assertEqual(error.code, "INVALID_QUANTITY", "error should be INVALID_QUANTITY");
      },
    },
    {
      name: "removing all quantity deletes item entry",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        // Setup: give 5 palos
        await UsersRepo.ensureUser(targetId);
        await UsersRepo.saveUser(targetId, {
          inventory: { palo: { id: "palo", quantity: 5 } } as any,
        });
        assertOk(await economyAccountRepo.ensure(targetId));

        // Remove all 5
        const result = await itemMutationService.adjustItemQuantity(
          {
            actorId,
            targetId,
            itemId: "palo",
            delta: -5,
          },
          mockCheckAdminTrue,
        );

        const adjustment = assertOk(result);
        assertEqual(adjustment.afterQuantity, 0, "after should be 0");

        // Verify inventory entry is removed
        const user = assertOk(await UsersRepo.findUser(targetId));
        const inv = (user!.inventory as ItemInventory) ?? {};
        assertEqual(inv.palo, undefined, "item entry should be removed");
      },
    },

    // ========================================================================
    // Blocked/Banned Tests
    // ========================================================================
    {
      name: "rejects item grant to blocked account",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        const { account } = assertOk(await economyAccountRepo.ensure(targetId));
        assertOk(await economyAccountRepo.updateStatus(targetId, "blocked", account.version));

        const result = await itemMutationService.adjustItemQuantity(
          {
            actorId,
            targetId,
            itemId: "palo",
            delta: 5,
          },
          mockCheckAdminTrue,
        );

        assertEqual(result.isErr(), true, "should reject blocked target");
        const error = result.error as ItemMutationError;
        assertEqual(error.code, "TARGET_BLOCKED", "error should be TARGET_BLOCKED");
      },
    },

    // ========================================================================
    // Audit Tests
    // ========================================================================
    {
      name: "creates audit entry with correlation ID",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        assertOk(await economyAccountRepo.ensure(targetId));

        const result = await itemMutationService.adjustItemQuantity(
          {
            actorId,
            targetId,
            itemId: "palo",
            delta: 10,
            reason: "Test grant",
          },
          mockCheckAdminTrue,
        );

        assertOk(result);

        // Query audit
        const auditResult = await economyAuditRepo.query({
          targetId,
          operationType: "item_grant",
        });

        const audit = assertOk(auditResult);
        assertEqual(audit.entries.length >= 1, true, "should have audit entry");

        const entry = audit.entries[0];
        assertEqual(entry.itemData?.itemId, "palo", "audit should have item ID");
        assertEqual(entry.itemData?.quantity, 10, "audit should have quantity");
        assert(entry.metadata?.correlationId, "audit should have correlation ID");
      },
    },

    // ========================================================================
    // Concurrent Tests
    // ========================================================================
    {
      name: "concurrent item grants produce correct quantities",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        await UsersRepo.ensureUser(targetId);
        assertOk(await economyAccountRepo.ensure(targetId));

        // 5 concurrent grants of 10 items each
        const promises = Array.from({ length: 5 }, () =>
          itemMutationService.adjustItemQuantity(
            { actorId, targetId, itemId: "palo", delta: 10 },
            mockCheckAdminTrue,
          ),
        );

        const results = await Promise.all(promises);

        // All should succeed
        for (const result of results) {
          assertEqual(result.isOk(), true, "all concurrent grants should succeed");
        }

        // Final quantity should be 50
        const user = assertOk(await UsersRepo.findUser(targetId));
        const finalQty = ((user!.inventory as ItemInventory).palo?.quantity) ?? 0;
        assertEqual(finalQty, 50, "final quantity should be 50");
      },
    },
  ],
};
