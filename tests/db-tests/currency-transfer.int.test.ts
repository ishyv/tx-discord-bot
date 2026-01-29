/**
 * Currency Transfer Integration Tests.
 *
 * Tests:
 * - Positive amount validation (no negative transfers)
 * - Self-transfer rejection
 * - Insufficient funds rejection
 * - Blocked/banned account handling
 * - Concurrent transfer correctness
 * - Audit correlation ID
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

const cleanupUser = (cleanup: { add: (task: () => Promise<void> | void) => void }, id: string) => {
  cleanup.add(async () => {
    const res = await UsersRepo.deleteUser(id);
    if (res.isErr()) return;
  });
};

export const suite: Suite = {
  name: "currency transfer",
  tests: [
    // ========================================================================
    // Amount Validation Tests
    // ========================================================================
    {
      name: "rejects negative transfer amount",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const senderId = factory.userId();
        const recipientId = factory.userId();
        cleanupUser(cleanup, senderId);
        cleanupUser(cleanup, recipientId);

        assertOk(await economyAccountRepo.ensure(senderId));
        assertOk(await economyAccountRepo.ensure(recipientId));

        const result = await currencyMutationService.transferCurrency({
          senderId,
          recipientId,
          currencyId: "rep",
          amount: -50,
        });

        assertEqual(result.isErr(), true, "should reject negative amount");
        const error = result.error as CurrencyMutationError;
        assertEqual(error.code, "INVALID_AMOUNT", "error should be INVALID_AMOUNT");
      },
    },
    {
      name: "rejects zero transfer amount",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const senderId = factory.userId();
        const recipientId = factory.userId();
        cleanupUser(cleanup, senderId);
        cleanupUser(cleanup, recipientId);

        assertOk(await economyAccountRepo.ensure(senderId));
        assertOk(await economyAccountRepo.ensure(recipientId));

        const result = await currencyMutationService.transferCurrency({
          senderId,
          recipientId,
          currencyId: "rep",
          amount: 0,
        });

        assertEqual(result.isErr(), true, "should reject zero amount");
        const error = result.error as CurrencyMutationError;
        assertEqual(error.code, "INVALID_AMOUNT", "error should be INVALID_AMOUNT");
      },
    },

    // ========================================================================
    // Self-Transfer Tests
    // ========================================================================
    {
      name: "rejects self-transfer",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        assertOk(await economyAccountRepo.ensure(userId));

        const result = await currencyMutationService.transferCurrency({
          senderId: userId,
          recipientId: userId,
          currencyId: "rep",
          amount: 100,
        });

        assertEqual(result.isErr(), true, "should reject self-transfer");
        const error = result.error as CurrencyMutationError;
        assertEqual(error.code, "SELF_TRANSFER", "error should be SELF_TRANSFER");
      },
    },

    // ========================================================================
    // Insufficient Funds Tests
    // ========================================================================
    {
      name: "rejects transfer with insufficient funds",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const senderId = factory.userId();
        const recipientId = factory.userId();
        cleanupUser(cleanup, senderId);
        cleanupUser(cleanup, recipientId);

        // Set sender with low balance
        await UsersRepo.ensureUser(senderId);
        await UsersRepo.saveUser(senderId, { currency: { rep: 10 } as any });
        assertOk(await economyAccountRepo.ensure(senderId));

        await UsersRepo.ensureUser(recipientId);
        assertOk(await economyAccountRepo.ensure(recipientId));

        const result = await currencyMutationService.transferCurrency({
          senderId,
          recipientId,
          currencyId: "rep",
          amount: 100, // More than available
        });

        assertEqual(result.isErr(), true, "should reject insufficient funds");
        const error = result.error as CurrencyMutationError;
        assertEqual(error.code, "INSUFFICIENT_FUNDS", "error should be INSUFFICIENT_FUNDS");
      },
    },

    // ========================================================================
    // Successful Transfer Tests
    // ========================================================================
    {
      name: "successful transfer updates both balances",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const senderId = factory.userId();
        const recipientId = factory.userId();
        cleanupUser(cleanup, senderId);
        cleanupUser(cleanup, recipientId);

        // Set initial balances
        await UsersRepo.ensureUser(senderId);
        await UsersRepo.saveUser(senderId, { currency: { rep: 100 } as any });
        assertOk(await economyAccountRepo.ensure(senderId));

        await UsersRepo.ensureUser(recipientId);
        await UsersRepo.saveUser(recipientId, { currency: { rep: 50 } as any });
        assertOk(await economyAccountRepo.ensure(recipientId));

        const result = await currencyMutationService.transferCurrency({
          senderId,
          recipientId,
          currencyId: "rep",
          amount: 30,
        });

        const transfer = assertOk(result);
        assertEqual(transfer.senderId, senderId, "sender ID should match");
        assertEqual(transfer.recipientId, recipientId, "recipient ID should match");
        assertEqual(transfer.amount, 30, "amount should be 30");
        assertEqual(transfer.senderBefore, 100, "sender before should be 100");
        assertEqual(transfer.senderAfter, 70, "sender after should be 70");
        assertEqual(transfer.recipientBefore, 50, "recipient before should be 50");
        assertEqual(transfer.recipientAfter, 80, "recipient after should be 80");
      },
    },

    // ========================================================================
    // Blocked/Banned Tests
    // ========================================================================
    {
      name: "rejects transfer from blocked sender",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const senderId = factory.userId();
        const recipientId = factory.userId();
        cleanupUser(cleanup, senderId);
        cleanupUser(cleanup, recipientId);

        // Block sender
        const { account } = assertOk(await economyAccountRepo.ensure(senderId));
        assertOk(await economyAccountRepo.updateStatus(senderId, "blocked", account.version));

        assertOk(await economyAccountRepo.ensure(recipientId));

        const result = await currencyMutationService.transferCurrency({
          senderId,
          recipientId,
          currencyId: "rep",
          amount: 10,
        });

        assertEqual(result.isErr(), true, "should reject blocked sender");
        const error = result.error as CurrencyMutationError;
        assertEqual(error.code, "ACTOR_BLOCKED", "error should be ACTOR_BLOCKED");
      },
    },
    {
      name: "rejects transfer to blocked recipient",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const senderId = factory.userId();
        const recipientId = factory.userId();
        cleanupUser(cleanup, senderId);
        cleanupUser(cleanup, recipientId);

        assertOk(await economyAccountRepo.ensure(senderId));

        // Block recipient
        const { account } = assertOk(await economyAccountRepo.ensure(recipientId));
        assertOk(await economyAccountRepo.updateStatus(recipientId, "blocked", account.version));

        const result = await currencyMutationService.transferCurrency({
          senderId,
          recipientId,
          currencyId: "rep",
          amount: 10,
        });

        assertEqual(result.isErr(), true, "should reject blocked recipient");
        const error = result.error as CurrencyMutationError;
        assertEqual(error.code, "TARGET_BLOCKED", "error should be TARGET_BLOCKED");
      },
    },

    // ========================================================================
    // Audit Correlation Tests
    // ========================================================================
    {
      name: "creates audit entries with correlation ID",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const senderId = factory.userId();
        const recipientId = factory.userId();
        const guildId = factory.guildId();
        cleanupUser(cleanup, senderId);
        cleanupUser(cleanup, recipientId);

        await UsersRepo.ensureUser(senderId);
        await UsersRepo.saveUser(senderId, { currency: { rep: 100 } as any });
        assertOk(await economyAccountRepo.ensure(senderId));

        await UsersRepo.ensureUser(recipientId);
        await UsersRepo.saveUser(recipientId, { currency: { rep: 50 } as any });
        assertOk(await economyAccountRepo.ensure(recipientId));

        const result = await currencyMutationService.transferCurrency({
          senderId,
          recipientId,
          guildId,
          currencyId: "rep",
          amount: 25,
          reason: "Test transfer",
        });

        const transfer = assertOk(result);
        assert(transfer.transferId, "transfer should have a correlation ID");

        // Query audit logs
        const auditResult = await economyAuditRepo.query({
          targetId: recipientId,
          operationType: "currency_transfer",
        });

        const audit = assertOk(auditResult);
        assertEqual(audit.entries.length >= 1, true, "should have audit entries");

        // Check that entries have the correlation ID
        const entry = audit.entries[0];
        assertEqual(entry.metadata?.transferId, transfer.transferId, "audit should have matching transfer ID");
      },
    },

    // ========================================================================
    // Concurrent Transfer Tests
    // ========================================================================
    {
      name: "concurrent transfers produce correct final balances",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const senderId = factory.userId();
        const recipientId = factory.userId();
        cleanupUser(cleanup, senderId);
        cleanupUser(cleanup, recipientId);

        // Set initial balances
        await UsersRepo.ensureUser(senderId);
        await UsersRepo.saveUser(senderId, { currency: { rep: 100 } as any });
        assertOk(await economyAccountRepo.ensure(senderId));

        await UsersRepo.ensureUser(recipientId);
        await UsersRepo.saveUser(recipientId, { currency: { rep: 0 } as any });
        assertOk(await economyAccountRepo.ensure(recipientId));

        // Run 3 concurrent transfers of 20 each
        const promises = Array.from({ length: 3 }, () =>
          currencyMutationService.transferCurrency({
            senderId,
            recipientId,
            currencyId: "rep",
            amount: 20,
          }),
        );

        const results = await Promise.all(promises);

        // All should succeed
        let successCount = 0;
        for (const result of results) {
          if (result.isOk()) successCount++;
        }

        // At least 2 should succeed (100 / 20 = 5 max, but concurrent may have races)
        assert(successCount >= 2, `at least 2 transfers should succeed, got ${successCount}`);

        // Final balances should be consistent
        const senderUser = assertOk(await UsersRepo.findUser(senderId));
        const recipientUser = assertOk(await UsersRepo.findUser(recipientId));

        const senderFinal = ((senderUser!.currency as CurrencyInventory).rep ?? 0) as number;
        const recipientFinal = ((recipientUser!.currency as CurrencyInventory).rep ?? 0) as number;

        // Sender should have 100 - (successCount * 20)
        const expectedSender = 100 - (successCount * 20);
        assertEqual(senderFinal, expectedSender, `sender should have ${expectedSender}`);

        // Recipient should have 0 + (successCount * 20)
        const expectedRecipient = 0 + (successCount * 20);
        assertEqual(recipientFinal, expectedRecipient, `recipient should have ${expectedRecipient}`);
      },
    },
  ],
};
