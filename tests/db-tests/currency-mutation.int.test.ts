/**
 * Currency Mutation Integration Tests.
 *
 * Tests:
 * - Permission gating
 * - Delta positive/negative behavior
 * - Currency entry creation behavior
 * - Concurrent adjustment correctness
 * - Audit log entry creation
 */

import * as UsersRepo from "../../src/db/repositories/users";
import {
  currencyMutationService,
  economyAuditRepo,
  economyAccountRepo,
  CurrencyMutationError,
} from "../../src/modules/economy";
import type { CurrencyInventory } from "../../src/modules/economy";
import {
  assert,
  assertEqual,
  assertOk,
  assertErr,
  ops,
  type Suite,
} from "./_utils";

const cleanupUser = (
  cleanup: { add: (task: () => Promise<void> | void) => void },
  id: string,
) => {
  cleanup.add(async () => {
    const res = await UsersRepo.deleteUser(id);
    if (res.isErr()) return;
  });
};

/** Mock admin check that always returns true. */
async function mockCheckAdminTrue(): Promise<boolean> {
  return true;
}

/** Mock admin check that always returns false. */
async function mockCheckAdminFalse(): Promise<boolean> {
  return false;
}

export const suite: Suite = {
  name: "currency mutation",
  tests: [
    // ========================================================================
    // Permission Gating Tests
    // ========================================================================
    {
      name: "rejects non-admin actor",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        const result = await currencyMutationService.adjustCurrencyBalance(
          {
            actorId,
            targetId,
            currencyId: "rep",
            delta: 10,
          },
          mockCheckAdminFalse,
        );

        assertEqual(result.isErr(), true, "should reject non-admin");
        const error = result.error as CurrencyMutationError;
        assertEqual(
          error.code,
          "INSUFFICIENT_PERMISSIONS",
          "error should be INSUFFICIENT_PERMISSIONS",
        );
      },
    },
    {
      name: "accepts admin actor",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        // Ensure target exists
        assertOk(await economyAccountRepo.ensure(targetId));

        const result = await currencyMutationService.adjustCurrencyBalance(
          {
            actorId,
            targetId,
            currencyId: "rep",
            delta: 10,
          },
          mockCheckAdminTrue,
        );

        assertEqual(result.isOk(), true, "should accept admin");
      },
    },

    // ========================================================================
    // Delta Positive/Negative Tests
    // ========================================================================
    {
      name: "positive delta increases balance",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        // Set initial balance
        await UsersRepo.ensureUser(targetId);
        await UsersRepo.saveUser(targetId, { currency: { rep: 100 } as any });
        assertOk(await economyAccountRepo.ensure(targetId));

        const result = await currencyMutationService.adjustCurrencyBalance(
          {
            actorId,
            targetId,
            currencyId: "rep",
            delta: 50,
          },
          mockCheckAdminTrue,
        );

        const adjustment = assertOk(result);
        assertEqual(adjustment.delta, 50, "delta should be 50");
        assertEqual(adjustment.before, 100, "before should be 100");
        assertEqual(adjustment.after, 150, "after should be 150");
      },
    },
    {
      name: "negative delta decreases balance",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        // Set initial balance
        await UsersRepo.ensureUser(targetId);
        await UsersRepo.saveUser(targetId, { currency: { rep: 100 } as any });
        assertOk(await economyAccountRepo.ensure(targetId));

        const result = await currencyMutationService.adjustCurrencyBalance(
          {
            actorId,
            targetId,
            currencyId: "rep",
            delta: -30,
          },
          mockCheckAdminTrue,
        );

        const adjustment = assertOk(result);
        assertEqual(adjustment.delta, -30, "delta should be -30");
        assertEqual(adjustment.before, 100, "before should be 100");
        assertEqual(adjustment.after, 70, "after should be 70");
      },
    },
    {
      name: "negative delta allows debt (negative balance)",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        // Set small initial balance
        await UsersRepo.ensureUser(targetId);
        await UsersRepo.saveUser(targetId, { currency: { rep: 10 } as any });
        assertOk(await economyAccountRepo.ensure(targetId));

        // Remove more than available (creates debt)
        const result = await currencyMutationService.adjustCurrencyBalance(
          {
            actorId,
            targetId,
            currencyId: "rep",
            delta: -50,
          },
          mockCheckAdminTrue,
        );

        const adjustment = assertOk(result);
        assertEqual(
          adjustment.after,
          -40,
          "after should be -40 (debt allowed)",
        );
      },
    },

    // ========================================================================
    // Currency Entry Creation Tests
    // ========================================================================
    {
      name: "creates currency entry if not exists",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        // Ensure user exists but has no currency
        await UsersRepo.ensureUser(targetId);
        assertOk(await economyAccountRepo.ensure(targetId));

        const result = await currencyMutationService.adjustCurrencyBalance(
          {
            actorId,
            targetId,
            currencyId: "rep",
            delta: 25,
          },
          mockCheckAdminTrue,
        );

        const adjustment = assertOk(result);
        assertEqual(
          adjustment.before,
          0,
          "before should be 0 (no existing currency)",
        );
        assertEqual(adjustment.after, 25, "after should be 25");
      },
    },
    {
      name: "rejects invalid currency",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        assertOk(await economyAccountRepo.ensure(targetId));

        const result = await currencyMutationService.adjustCurrencyBalance(
          {
            actorId,
            targetId,
            currencyId: "invalid_currency",
            delta: 10,
          },
          mockCheckAdminTrue,
        );

        assertEqual(result.isErr(), true, "should reject invalid currency");
        const error = result.error as CurrencyMutationError;
        assertEqual(
          error.code,
          "CURRENCY_NOT_FOUND",
          "error should be CURRENCY_NOT_FOUND",
        );
      },
    },

    // ========================================================================
    // Target Status Gating Tests
    // ========================================================================
    {
      name: "rejects adjustment to blocked account",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        // Create and block target
        const { account } = assertOk(await economyAccountRepo.ensure(targetId));
        assertOk(
          await economyAccountRepo.updateStatus(
            targetId,
            "blocked",
            account.version,
          ),
        );

        const result = await currencyMutationService.adjustCurrencyBalance(
          {
            actorId,
            targetId,
            currencyId: "rep",
            delta: 10,
          },
          mockCheckAdminTrue,
        );

        assertEqual(result.isErr(), true, "should reject blocked account");
        const error = result.error as CurrencyMutationError;
        assertEqual(
          error.code,
          "TARGET_BLOCKED",
          "error should be TARGET_BLOCKED",
        );
      },
    },
    {
      name: "rejects adjustment to banned account",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        // Create and ban target
        const { account } = assertOk(await economyAccountRepo.ensure(targetId));
        assertOk(
          await economyAccountRepo.updateStatus(
            targetId,
            "banned",
            account.version,
          ),
        );

        const result = await currencyMutationService.adjustCurrencyBalance(
          {
            actorId,
            targetId,
            currencyId: "rep",
            delta: 10,
          },
          mockCheckAdminTrue,
        );

        assertEqual(result.isErr(), true, "should reject banned account");
        const error = result.error as CurrencyMutationError;
        assertEqual(
          error.code,
          "TARGET_BANNED",
          "error should be TARGET_BANNED",
        );
      },
    },

    // ========================================================================
    // Concurrent Adjustment Tests
    // ========================================================================
    {
      name: "concurrent adjustments produce correct final value",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        // Set initial balance
        await UsersRepo.ensureUser(targetId);
        await UsersRepo.saveUser(targetId, { currency: { rep: 0 } as any });
        assertOk(await economyAccountRepo.ensure(targetId));

        // Run 5 concurrent +10 adjustments
        const promises = Array.from({ length: 5 }, () =>
          currencyMutationService.adjustCurrencyBalance(
            { actorId, targetId, currencyId: "rep", delta: 10 },
            mockCheckAdminTrue,
          ),
        );

        const results = await Promise.all(promises);

        // All should succeed
        for (const result of results) {
          assertEqual(
            result.isOk(),
            true,
            "all concurrent adjustments should succeed",
          );
        }

        // Final balance should be 50 (5 x 10)
        const user = assertOk(await UsersRepo.findUser(targetId));
        const finalRep = (user!.currency as CurrencyInventory).rep ?? 0;
        assertEqual(
          finalRep,
          50,
          "final balance should be 50 (no lost updates)",
        );
      },
    },
    {
      name: "concurrent mixed delta adjustments are atomic",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        // Set initial balance
        await UsersRepo.ensureUser(targetId);
        await UsersRepo.saveUser(targetId, { currency: { rep: 100 } as any });
        assertOk(await economyAccountRepo.ensure(targetId));

        // Run concurrent: 3 x +20 and 2 x -15
        const promises = [
          ...Array.from({ length: 3 }, () =>
            currencyMutationService.adjustCurrencyBalance(
              { actorId, targetId, currencyId: "rep", delta: 20 },
              mockCheckAdminTrue,
            ),
          ),
          ...Array.from({ length: 2 }, () =>
            currencyMutationService.adjustCurrencyBalance(
              { actorId, targetId, currencyId: "rep", delta: -15 },
              mockCheckAdminTrue,
            ),
          ),
        ];

        const results = await Promise.all(promises);

        // All should succeed
        for (const result of results) {
          assertEqual(
            result.isOk(),
            true,
            "all concurrent adjustments should succeed",
          );
        }

        // Final balance: 100 + (3 * 20) + (2 * -15) = 100 + 60 - 30 = 130
        const user = assertOk(await UsersRepo.findUser(targetId));
        const finalRep = (user!.currency as CurrencyInventory).rep ?? 0;
        assertEqual(
          finalRep,
          130,
          "final balance should be 130 (atomic operations)",
        );
      },
    },

    // ========================================================================
    // Audit Log Tests
    // ========================================================================
    {
      name: "creates audit log entry for adjustment",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        const guildId = factory.guildId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        assertOk(await economyAccountRepo.ensure(targetId));

        const result = await currencyMutationService.adjustCurrencyBalance(
          {
            actorId,
            targetId,
            guildId,
            currencyId: "rep",
            delta: 42,
            reason: "Test adjustment",
          },
          mockCheckAdminTrue,
        );

        assertOk(result);

        // Query audit log
        const auditResult = await economyAuditRepo.query({
          targetId,
          operationType: "currency_adjust",
        });

        const audit = assertOk(auditResult);
        assertEqual(
          audit.entries.length >= 1,
          true,
          "should have at least one audit entry",
        );

        const entry = audit.entries[0];
        assertEqual(entry.actorId, actorId, "audit should have correct actor");
        assertEqual(
          entry.targetId,
          targetId,
          "audit should have correct target",
        );
        assertEqual(entry.guildId, guildId, "audit should have correct guild");
        assertEqual(
          entry.currencyData?.currencyId,
          "rep",
          "audit should have correct currency",
        );
        assertEqual(
          entry.currencyData?.delta,
          42,
          "audit should have correct delta",
        );
        assertEqual(
          entry.reason,
          "Test adjustment",
          "audit should have correct reason",
        );
        assertEqual(
          entry.source,
          "give-currency",
          "audit should have correct source",
        );
      },
    },
    {
      name: "audit log preserves before and after balances",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const actorId = factory.userId();
        const targetId = factory.userId();
        cleanupUser(cleanup, actorId);
        cleanupUser(cleanup, targetId);

        // Set known initial balance
        await UsersRepo.ensureUser(targetId);
        await UsersRepo.saveUser(targetId, { currency: { rep: 50 } as any });
        assertOk(await economyAccountRepo.ensure(targetId));

        const result = await currencyMutationService.adjustCurrencyBalance(
          { actorId, targetId, currencyId: "rep", delta: 25 },
          mockCheckAdminTrue,
        );

        assertOk(result);

        // Query audit log
        const auditResult = await economyAuditRepo.query({ targetId });
        const audit = assertOk(auditResult);

        const entry = audit.entries[0];
        assertEqual(
          entry.currencyData?.beforeBalance,
          50,
          "audit should record before balance",
        );
        assertEqual(
          entry.currencyData?.afterBalance,
          75,
          "audit should record after balance",
        );
      },
    },
  ],
};
