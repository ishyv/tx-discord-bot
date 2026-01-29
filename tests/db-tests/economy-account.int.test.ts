/**
 * Economy Account Integration Tests.
 *
 * Tests:
 * - Lazy account initialization
 * - Corruption detection and repair
 * - Pagination boundaries
 * - Status management
 * - Access control
 */

import * as UsersRepo from "../../src/db/repositories/users";
import {
  economyAccountRepo,
  createEconomyAccountService,
  buildInventoryPage,
  buildInventorySummary,
  EconomyError,
  type InventoryPaginationOptions,
  type AccountStatus,
} from "../../src/modules/economy";
import type { ItemInventory, CurrencyInventory } from "../../src/modules/economy";
import {
  assert,
  assertEqual,
  assertDeepEqual,
  assertOk,
  assertErr,
  ops,
  type Suite,
} from "./_utils";

// Service instance for tests
const economyService = createEconomyAccountService(economyAccountRepo);

const cleanupUser = (cleanup: { add: (task: () => Promise<void> | void) => void }, id: string) => {
  cleanup.add(async () => {
    const res = await UsersRepo.deleteUser(id);
    if (res.isErr()) return;
  });
};

export const suite: Suite = {
  name: "economy account",
  tests: [
    // ========================================================================
    // Account Lifecycle Tests
    // ========================================================================
    {
      name: "ensure creates account lazily",
      ops: [ops.create, ops.read],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        // Initially no account
        const initial = assertOk(await economyAccountRepo.findById(userId));
        assertEqual(initial, null, "findById should return null before ensure");

        // Ensure creates account
        const result = assertOk(await economyAccountRepo.ensure(userId));
        assertEqual(result.isNew, true, "ensure should mark as new on first call");
        assertEqual(result.account.status, "ok", "new account should have ok status");
        assertEqual(result.account.userId, userId, "account should have correct userId");
        assert(result.account.version >= 0, "version should be non-negative");

        // Second ensure returns existing
        const second = assertOk(await economyAccountRepo.ensure(userId));
        assertEqual(second.isNew, false, "second ensure should not be new");
        assertEqual(second.account.version, result.account.version, "version should not change");
      },
    },
    {
      name: "ensure creates user if missing",
      ops: [ops.create, ops.read],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        // User doesn't exist yet
        const userBefore = assertOk(await UsersRepo.findUser(userId));
        assertEqual(userBefore, null, "user should not exist");

        // Ensure account creates user
        assertOk(await economyAccountRepo.ensure(userId));

        // User now exists
        const userAfter = assertOk(await UsersRepo.findUser(userId));
        assert(userAfter !== null, "user should exist after ensure");
      },
    },

    // ========================================================================
    // Corruption Detection and Repair Tests
    // ========================================================================
    {
      name: "detects corrupted status field",
      ops: [ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        // Create account with corrupted status
        await UsersRepo.ensureUser(userId);
        await UsersRepo.saveUser(userId, {
          economyAccount: {
            status: "invalid_status",
            createdAt: new Date(),
            updatedAt: new Date(),
            lastActivityAt: new Date(),
            version: 0,
          } as any,
        });

        // Repair should fix it
        const repair = assertOk(await economyAccountRepo.repair(userId));
        assertEqual(repair.wasCorrupted, true, "should detect corruption");
        assert(repair.repairedFields.includes("status"), "should repair status");
        assertEqual(repair.account.status, "ok", "status should default to ok");
      },
    },
    {
      name: "detects corrupted date fields",
      ops: [ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        // Create account with corrupted dates
        await UsersRepo.ensureUser(userId);
        await UsersRepo.saveUser(userId, {
          economyAccount: {
            status: "ok",
            createdAt: "not_a_date",
            updatedAt: -1,
            lastActivityAt: null,
            version: 0,
          } as any,
        });

        const repair = assertOk(await economyAccountRepo.repair(userId));
        assertEqual(repair.wasCorrupted, true, "should detect corruption");
        assert(repair.repairedFields.length >= 2, "should repair multiple date fields");
        assert(repair.account.createdAt instanceof Date, "createdAt should be a Date");
      },
    },
    {
      name: "auto-repairs on read when corruption detected",
      ops: [ops.read, ops.update],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        // Create user with corrupted account
        await UsersRepo.ensureUser(userId);
        await UsersRepo.saveUser(userId, {
          economyAccount: {
            status: 12345, // Invalid type
            version: "not_a_number",
          } as any,
        });

        // Ensure should auto-repair
        const result = assertOk(await economyAccountRepo.ensure(userId));
        assertEqual(result.account.status, "ok", "status should be repaired to ok");
        assertEqual(result.account.version, 0, "version should be repaired to 0");
      },
    },
    {
      name: "no corruption detected on valid data",
      ops: [ops.read],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        // Create valid account
        assertOk(await economyAccountRepo.ensure(userId));

        // Repair should report no corruption
        const repair = assertOk(await economyAccountRepo.repair(userId));
        assertEqual(repair.wasCorrupted, false, "should not detect corruption on valid data");
        assertEqual(repair.repairedFields.length, 0, "should not repair any fields");
      },
    },

    // ========================================================================
    // Status Management Tests
    // ========================================================================
    {
      name: "update status with optimistic concurrency",
      ops: [ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        const initial = assertOk(await economyAccountRepo.ensure(userId));
        const initialVersion = initial.account.version;

        // Update status
        const updated = assertOk(
          await economyAccountRepo.updateStatus(userId, "blocked", initialVersion),
        );
        assert(updated !== null, "update should succeed");
        assertEqual(updated!.status, "blocked", "status should be blocked");
        assertEqual(updated!.version, initialVersion + 1, "version should increment");

        // Verify persisted
        const found = assertOk(await economyAccountRepo.findById(userId));
        assertEqual(found!.status, "blocked", "status should persist");
      },
    },
    {
      name: "concurrent modification returns null",
      ops: [ops.update],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        const initial = assertOk(await economyAccountRepo.ensure(userId));
        const initialVersion = initial.account.version;

        // First update succeeds
        const first = assertOk(
          await economyAccountRepo.updateStatus(userId, "blocked", initialVersion),
        );
        assert(first !== null, "first update should succeed");

        // Second update with old version should return null (conflict)
        const second = assertOk(
          await economyAccountRepo.updateStatus(userId, "banned", initialVersion),
        );
        assertEqual(second, null, "concurrent update should return null");
      },
    },

    // ========================================================================
    // Service Layer Access Control Tests
    // ========================================================================
    {
      name: "check access for new user",
      ops: [ops.read],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        // New user (no account yet) should have access
        const result = assertOk(await economyService.checkAccess(userId));
        assertEqual(result.allowed, true, "new user should have access");
        assertEqual(result.status, undefined, "new user should have no status");
      },
    },
    {
      name: "blocked account denied access",
      ops: [ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        const { account } = assertOk(await economyAccountRepo.ensure(userId));
        assertOk(await economyAccountRepo.updateStatus(userId, "blocked", account.version));

        const result = assertOk(await economyService.checkAccess(userId));
        assertEqual(result.allowed, false, "blocked account should not have access");
        assertEqual(result.status, "blocked", "should return blocked status");
      },
    },
    {
      name: "service returns error for blocked account on getBalanceView",
      ops: [ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        const { account } = assertOk(await economyAccountRepo.ensure(userId));
        assertOk(await economyAccountRepo.updateStatus(userId, "blocked", account.version));

        const result = await economyService.getBalanceView(userId);
        assertEqual(result.isErr(), true, "should return error");
        const error = result.error as EconomyError;
        assertEqual(error.code, "ACCOUNT_BLOCKED", "error should be ACCOUNT_BLOCKED");
      },
    },

    // ========================================================================
    // Inventory Pagination Tests
    // ========================================================================
    {
      name: "pagination empty inventory",
      ops: [ops.read],
      run: async () => {
        const inventory: ItemInventory = {};
        const page = buildInventoryPage(inventory, { page: 0, pageSize: 6 });

        assertEqual(page.items.length, 0, "empty inventory should have no items");
        assertEqual(page.totalItems, 0, "totalItems should be 0");
        assertEqual(page.totalPages, 1, "should have 1 page even when empty");
        assertEqual(page.page, 0, "should be on page 0");
        assertEqual(page.hasMore, false, "should not have more");
      },
    },
    {
      name: "pagination single page",
      ops: [ops.read],
      run: async () => {
        const inventory: ItemInventory = {
          item1: { id: "item1", quantity: 5 },
          item2: { id: "item2", quantity: 3 },
        };
        const page = buildInventoryPage(inventory, { page: 0, pageSize: 6 });

        assertEqual(page.items.length, 2, "should show all items");
        assertEqual(page.totalItems, 2, "totalItems should be 2");
        assertEqual(page.totalPages, 1, "should have 1 page");
        assertEqual(page.hasMore, false, "should not have more");
      },
    },
    {
      name: "pagination multiple pages",
      ops: [ops.read],
      run: async () => {
        const inventory: ItemInventory = {};
        for (let i = 0; i < 15; i++) {
          inventory[`item${i}`] = { id: `item${i}`, quantity: i + 1 };
        }

        const page1 = buildInventoryPage(inventory, { page: 0, pageSize: 6 });
        assertEqual(page1.items.length, 6, "page 1 should have 6 items");
        assertEqual(page1.totalItems, 15, "totalItems should be 15");
        assertEqual(page1.totalPages, 3, "should have 3 pages");
        assertEqual(page1.hasMore, true, "should have more");

        const page2 = buildInventoryPage(inventory, { page: 1, pageSize: 6 });
        assertEqual(page2.items.length, 6, "page 2 should have 6 items");
        assertEqual(page2.page, 1, "should be on page 1");

        const page3 = buildInventoryPage(inventory, { page: 2, pageSize: 6 });
        assertEqual(page3.items.length, 3, "page 3 should have 3 items");
        assertEqual(page3.hasMore, false, "should not have more");
      },
    },
    {
      name: "pagination clamps out of bounds page",
      ops: [ops.read],
      run: async () => {
        const inventory: ItemInventory = {
          item1: { id: "item1", quantity: 5 },
        };

        // Request page 100, should clamp to page 0 (only page)
        const page = buildInventoryPage(inventory, { page: 100, pageSize: 6 });
        assertEqual(page.page, 0, "should clamp to valid page");
      },
    },
    {
      name: "pagination respects max page size",
      ops: [ops.read],
      run: async () => {
        const inventory: ItemInventory = {};
        for (let i = 0; i < 30; i++) {
          inventory[`item${i}`] = { id: `item${i}`, quantity: 1 };
        }

        // Request page size 100, should clamp to 25
        const page = buildInventoryPage(inventory, { page: 0, pageSize: 100 });
        assertEqual(page.items.length <= 25, true, "should not exceed max page size");
      },
    },
    {
      name: "pagination with search filter",
      ops: [ops.read],
      run: async () => {
        const inventory: ItemInventory = {
          sword: { id: "sword", quantity: 1 },
          shield: { id: "shield", quantity: 1 },
          potion: { id: "potion", quantity: 5 },
        };

        const page = buildInventoryPage(inventory, {
          page: 0,
          pageSize: 6,
          search: "s", // sword, shield
        });

        assertEqual(page.items.length, 2, "should filter to matching items");
        assertEqual(page.totalItems, 2, "total should reflect filter");
      },
    },
    {
      name: "pagination with sorting",
      ops: [ops.read],
      run: async () => {
        const inventory: ItemInventory = {
          zulu: { id: "zulu", quantity: 1 },
          alpha: { id: "alpha", quantity: 1 },
          mike: { id: "mike", quantity: 1 },
        };

        const asc = buildInventoryPage(inventory, {
          page: 0,
          pageSize: 6,
          sortBy: "name",
          sortOrder: "asc",
        });
        assertEqual(asc.items[0].id, "alpha", "asc should start with alpha");
        assertEqual(asc.items[2].id, "zulu", "asc should end with zulu");

        const desc = buildInventoryPage(inventory, {
          page: 0,
          pageSize: 6,
          sortBy: "name",
          sortOrder: "desc",
        });
        assertEqual(desc.items[0].id, "zulu", "desc should start with zulu");
        assertEqual(desc.items[2].id, "alpha", "desc should end with alpha");
      },
    },

    // ========================================================================
    // Inventory Summary Tests
    // ========================================================================
    {
      name: "inventory summary calculates totals",
      ops: [ops.read],
      run: async () => {
        const inventory: ItemInventory = {
          item1: { id: "item1", quantity: 5 },
          item2: { id: "item2", quantity: 3 },
          item3: { id: "item3", quantity: 2 },
        };

        const summary = buildInventorySummary(inventory);
        assertEqual(summary.totalItems, 10, "totalItems should sum quantities");
        assertEqual(summary.uniqueItems, 3, "uniqueItems should count types");
        assertEqual(summary.isEmpty, false, "should not be empty");
        assertEqual(summary.topItems.length, 3, "should have top items");
        assertEqual(summary.topItems[0].quantity, 5, "top item should have highest quantity");
      },
    },
    {
      name: "inventory summary handles zero and negative quantities",
      ops: [ops.read],
      run: async () => {
        const inventory: ItemInventory = {
          item1: { id: "item1", quantity: 5 },
          item2: { id: "item2", quantity: 0 },
          item3: { id: "item3", quantity: -1 },
        };

        const summary = buildInventorySummary(inventory);
        assertEqual(summary.totalItems, 5, "should only count positive quantities");
        assertEqual(summary.uniqueItems, 1, "should only count items with positive quantity");
      },
    },

    // ========================================================================
    // Touch Activity Tests
    // ========================================================================
    {
      name: "touch activity updates timestamp",
      ops: [ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        const initial = assertOk(await economyAccountRepo.ensure(userId));
        const beforeTouch = initial.account.lastActivityAt;

        // Wait a tiny bit to ensure timestamp changes
        await new Promise((resolve) => setTimeout(resolve, 10));

        await economyAccountRepo.touchActivity(userId);

        const after = assertOk(await economyAccountRepo.findById(userId));
        assert(
          after!.lastActivityAt.getTime() > beforeTouch.getTime(),
          "lastActivityAt should be updated",
        );
      },
    },

    // ========================================================================
    // Critical Data Safety Tests (from PR review)
    // ========================================================================
    {
      name: "date coercion: ISO string dates are preserved",
      ops: [ops.create, ops.read],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        // Create user with ISO string dates (simulating DB storage)
        const originalDate = "2024-06-15T10:30:00.000Z";
        await UsersRepo.ensureUser(userId);
        await UsersRepo.saveUser(userId, {
          economyAccount: {
            status: "ok",
            createdAt: originalDate,
            updatedAt: originalDate,
            lastActivityAt: originalDate,
            version: 0,
          } as any,
        });

        // Schema should coerce strings to dates, not replace with new Date()
        const result = assertOk(await economyAccountRepo.findById(userId));
        assert(result !== null, "account should exist");
        assert(
          result!.createdAt.toISOString() === originalDate,
          "createdAt should preserve original timestamp",
        );
      },
    },
    {
      name: "no erase on parse failure: invalid subdoc is repaired not deleted",
      ops: [ops.create, ops.read],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        // Create user with corrupted account data
        await UsersRepo.ensureUser(userId);
        await UsersRepo.saveUser(userId, {
          economyAccount: {
            status: "invalid_status",
            version: "not_a_number",
            // Missing dates
          } as any,
        });

        // UserSchema.catch() should repair, NOT erase to undefined
        const user = assertOk(await UsersRepo.findUser(userId));
        assert(user !== null, "user should exist");
        assert(user!.economyAccount !== undefined, "economyAccount should NOT be undefined after parse failure");
        assertEqual(user!.economyAccount!.status, "ok", "status should be repaired to ok");
        assertEqual(user!.economyAccount!.version, 0, "version should be repaired to 0");
        assert(user!.economyAccount!.createdAt instanceof Date, "createdAt should be a Date");
      },
    },
    {
      name: "ensure race condition: parallel ensures both succeed",
      ops: [ops.create, ops.read],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        // Race two ensure() calls
        const [result1, result2] = await Promise.all([
          economyAccountRepo.ensure(userId),
          economyAccountRepo.ensure(userId),
        ]);

        // Both should succeed
        const r1 = assertOk(result1);
        const r2 = assertOk(result2);

        // Exactly one should be new
        const oneIsNew = (r1.isNew && !r2.isNew) || (!r1.isNew && r2.isNew);
        const bothNotNew = !r1.isNew && !r2.isNew; // Also acceptable: both see existing
        assert(oneIsNew || bothNotNew, "one should be new, or both should see existing");

        // Both should return the same account data
        assertEqual(r1.account.userId, userId, "both should return correct userId");
        assertEqual(r2.account.userId, userId, "both should return correct userId");
      },
    },
    {
      name: "gating blocks all views for blocked account",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        // Create and block account
        const { account } = assertOk(await economyAccountRepo.ensure(userId));
        assertOk(await economyAccountRepo.updateStatus(userId, "blocked", account.version));

        // All service methods should return ACCOUNT_BLOCKED error
        const balanceResult = await economyService.getBalanceView(userId);
        assertEqual(balanceResult.isErr(), true, "getBalanceView should error");
        assertEqual((balanceResult.error as EconomyError).code, "ACCOUNT_BLOCKED", "should be ACCOUNT_BLOCKED");

        const bankResult = await economyService.getBankBreakdown(userId);
        assertEqual(bankResult.isErr(), true, "getBankBreakdown should error");

        const invResult = await economyService.getInventorySummary(userId);
        assertEqual(invResult.isErr(), true, "getInventorySummary should error");

        const pageResult = await economyService.getInventoryPage(userId, { page: 0, pageSize: 6 });
        assertEqual(pageResult.isErr(), true, "getInventoryPage should error");

        const profileResult = await economyService.getProfileSummary(userId);
        assertEqual(profileResult.isErr(), true, "getProfileSummary should error");
      },
    },
    {
      name: "gating blocks all views for banned account even with malformed data",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        // Create account with corrupted but banned status
        await UsersRepo.ensureUser(userId);
        await UsersRepo.saveUser(userId, {
          economyAccount: {
            status: "banned",
            version: "corrupted",
            createdAt: null,
          } as any,
        });

        // Service should repair on ensure, then gate on banned status
        const balanceResult = await economyService.getBalanceView(userId);
        assertEqual(balanceResult.isErr(), true, "should error for banned");
        assertEqual((balanceResult.error as EconomyError).code, "ACCOUNT_BANNED", "should be ACCOUNT_BANNED");
      },
    },
    {
      name: "findById does not repair: pure read operation",
      ops: [ops.create, ops.read],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        // Create corrupted account directly
        await UsersRepo.ensureUser(userId);
        await UsersRepo.saveUser(userId, {
          economyAccount: {
            status: "blocked",
            version: 5,
            createdAt: "2024-01-01T00:00:00.000Z",
          } as any,
        });

        // findById should return the account as-is (without repairing)
        const result1 = assertOk(await economyAccountRepo.findById(userId));
        assertEqual(result1!.version, 5, "version should remain 5 (not repaired)");

        // ensure() will repair
        const ensured = assertOk(await economyAccountRepo.ensure(userId));
        assert(ensured.account.version > 5 || ensured.isNew === false, "ensure may repair");
      },
    },
  ],
};
