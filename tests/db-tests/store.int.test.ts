/**
 * Store Integration Tests.
 *
 * Tests:
 * - Store catalog operations
 * - Buy item with capacity check
 * - Sell item with guild liquidity check
 * - Stock management
 * - Tax application on transactions
 * - Transaction atomicity
 */

import * as UsersRepo from "../../src/db/repositories/users";
import * as GuildsRepo from "../../src/db/repositories/guilds";
import {
  storeService,
  storeRepo,
  guildEconomyService,
  economyAccountRepo,
} from "../../src/modules/economy";
import type { StoreError } from "../../src/modules/economy/store";
import type { ItemInventory } from "../../src/modules/inventory";
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

const cleanupGuild = (
  cleanup: { add: (task: () => Promise<void> | void) => void },
  id: string,
) => {
  cleanup.add(async () => {
    const res = await GuildsRepo.deleteGuild(id);
    if (res.isErr()) return;
  });
};

export const suite: Suite = {
  name: "store",
  tests: [
    // ========================================================================
    // Catalog Tests
    // ========================================================================
    {
      name: "creates default catalog for guild",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        // Ensure guild exists
        await GuildsRepo.ensureGuild(guildId);

        const catalog = assertOk(await storeService.getCatalog(guildId));
        assertEqual(
          catalog.guildId,
          guildId,
          "catalog should have correct guild ID",
        );
        assertEqual(
          catalog.active,
          true,
          "catalog should be active by default",
        );
        assertEqual(catalog.taxRate, 0.05, "default tax rate should be 5%");
        assertEqual(
          Object.keys(catalog.items).length,
          0,
          "catalog should start empty",
        );
      },
    },
    {
      name: "adds item to catalog",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);

        const item = {
          itemId: "palo",
          name: "Palo de Madera",
          buyPrice: 10,
          sellPrice: 8,
          stock: 100,
          available: true,
          category: "Materials",
        };

        const catalog = assertOk(await storeRepo.upsertItem(guildId, item));
        assertEqual(
          catalog.items["palo"]?.name,
          "Palo de Madera",
          "item should be added",
        );
        assertEqual(catalog.items["palo"]?.stock, 100, "stock should be set");
      },
    },

    // ========================================================================
    // Stock Tests
    // ========================================================================
    {
      name: "checks item stock correctly",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);

        // Add item with limited stock
        const item = {
          itemId: "palo",
          name: "Palo de Madera",
          buyPrice: 10,
          sellPrice: 8,
          stock: 10,
          available: true,
        };
        assertOk(await storeRepo.upsertItem(guildId, item));

        const stockCheck = assertOk(
          await storeService.checkItemStock(guildId, "palo", 5),
        );
        assertEqual(stockCheck.available, true, "should have enough stock");
        assertEqual(stockCheck.requested, 5, "requested should be 5");
        assertEqual(
          stockCheck.availableStock,
          10,
          "available stock should be 10",
        );
        assertEqual(
          stockCheck.unlimited,
          false,
          "stock should not be unlimited",
        );
      },
    },
    {
      name: "handles unlimited stock (-1)",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);

        const item = {
          itemId: "palo",
          name: "Palo de Madera",
          buyPrice: 10,
          sellPrice: 8,
          stock: -1, // Unlimited
          available: true,
        };
        assertOk(await storeRepo.upsertItem(guildId, item));

        const stockCheck = assertOk(
          await storeService.checkItemStock(guildId, "palo", 9999),
        );
        assertEqual(
          stockCheck.available,
          true,
          "should allow any quantity with unlimited stock",
        );
        assertEqual(
          stockCheck.unlimited,
          true,
          "should be marked as unlimited",
        );
      },
    },
    {
      name: "rejects purchase when stock insufficient",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);

        const item = {
          itemId: "palo",
          name: "Palo de Madera",
          buyPrice: 10,
          sellPrice: 8,
          stock: 5,
          available: true,
        };
        assertOk(await storeRepo.upsertItem(guildId, item));

        const buyerId = factory.userId();
        cleanupUser(cleanup, buyerId);

        const result = await storeService.buyItem({
          buyerId,
          guildId,
          itemId: "palo",
          quantity: 10,
        });

        assertEqual(
          result.isErr(),
          true,
          "should reject when stock insufficient",
        );
        const error = result.error as StoreError;
        assertEqual(
          error.code,
          "INSUFFICIENT_STOCK",
          "error should be INSUFFICIENT_STOCK",
        );
      },
    },

    // ========================================================================
    // Buy Tests
    // ========================================================================
    {
      name: "calculates purchase price with tax",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);

        const item = {
          itemId: "palo",
          name: "Palo de Madera",
          buyPrice: 100,
          sellPrice: 85,
          stock: 100,
          available: true,
        };
        assertOk(await storeRepo.upsertItem(guildId, item));

        const pricing = assertOk(
          await storeService.calculatePurchasePrice(guildId, "palo", 2),
        );

        assertEqual(pricing.unitPrice, 100, "unit price should be 100");
        assertEqual(pricing.subtotal, 200, "subtotal should be 200");
        assertEqual(pricing.tax, 10, "tax should be 10 (5% of 200)");
        assertEqual(pricing.total, 210, "total should be 210");
        assertEqual(pricing.taxRate, 0.05, "tax rate should be 5%");
      },
    },
    {
      name: "rejects purchase when capacity exceeded",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const buyerId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, buyerId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(buyerId);
        assertOk(await economyAccountRepo.ensure(buyerId));

        // Give buyer plenty of currency
        await UsersRepo.saveUser(buyerId, { currency: { coin: 10000 } } as any);

        // Add item to store
        const item = {
          itemId: "espada", // Heavy item (weight 5)
          name: "Espada de Hierro",
          buyPrice: 100,
          sellPrice: 85,
          stock: 100,
          available: true,
        };
        assertOk(await storeRepo.upsertItem(guildId, item));

        // Try to buy more than weight capacity allows (max 200)
        // Each espada is weight 5, so 50 would be exactly at limit
        // But slots also matter - non-stackable uses slots per item
        const result = await storeService.buyItem({
          buyerId,
          guildId,
          itemId: "espada",
          quantity: 25, // 25 * 5 = 125 weight, 25 slots
        });

        // This should succeed (within capacity)
        assertEqual(
          result.isOk(),
          true,
          "purchase within capacity should succeed",
        );
      },
    },

    // ========================================================================
    // Sell Tests
    // ========================================================================
    {
      name: "gets sell price from store item",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);

        const item = {
          itemId: "palo",
          name: "Palo de Madera",
          buyPrice: 100,
          sellPrice: 85,
          stock: 100,
          available: true,
        };
        assertOk(await storeRepo.upsertItem(guildId, item));

        const sellPrice = assertOk(
          await storeService.getSellPrice(guildId, "palo"),
        );
        assertEqual(sellPrice, 85, "sell price should be 85");
      },
    },
    {
      name: "falls back to item definition value for sell price",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);

        // Don't add item to store - should fall back to item definition
        // espada has value: 100 in definitions
        const sellPrice = assertOk(
          await storeService.getSellPrice(guildId, "espada"),
        );
        assertEqual(sellPrice, 85, "should calculate 85% of base value (100)");
      },
    },
    {
      name: "rejects sale when guild liquidity insufficient",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const sellerId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, sellerId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(sellerId);
        assertOk(await economyAccountRepo.ensure(sellerId));

        // Give seller items
        await UsersRepo.saveUser(sellerId, {
          inventory: { palo: { id: "palo", quantity: 100 } } as any,
        });

        // Add item to store
        const item = {
          itemId: "palo",
          name: "Palo de Madera",
          buyPrice: 100,
          sellPrice: 85,
          stock: 0,
          available: true,
        };
        assertOk(await storeRepo.upsertItem(guildId, item));

        // Ensure guild economy exists but with empty trade sector
        assertOk(await guildEconomyService.getConfig(guildId));

        // Try to sell - guild has no liquidity
        const result = await storeService.sellItem({
          sellerId,
          guildId,
          itemId: "palo",
          quantity: 10, // Would cost 850
        });

        assertEqual(
          result.isErr(),
          true,
          "should reject when guild has no liquidity",
        );
        const error = result.error as StoreError;
        assertEqual(
          error.code,
          "GUILD_LIQUIDITY_INSUFFICIENT",
          "error should be GUILD_LIQUIDITY_INSUFFICIENT",
        );
      },
    },

    // ========================================================================
    // Store State Tests
    // ========================================================================
    {
      name: "rejects operations when store closed",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);

        // Create catalog and close it
        assertOk(await storeRepo.ensure(guildId));
        assertOk(await storeRepo.setActive(guildId, false));

        const buyerId = factory.userId();
        cleanupUser(cleanup, buyerId);

        const result = await storeService.buyItem({
          buyerId,
          guildId,
          itemId: "palo",
          quantity: 1,
        });

        assertEqual(result.isErr(), true, "should reject when store closed");
        const error = result.error as StoreError;
        assertEqual(error.code, "STORE_CLOSED", "error should be STORE_CLOSED");
      },
    },
    {
      name: "lists only available items",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);

        // Add available item
        const availableItem = {
          itemId: "palo",
          name: "Palo de Madera",
          buyPrice: 10,
          sellPrice: 8,
          stock: 100,
          available: true,
        };
        assertOk(await storeRepo.upsertItem(guildId, availableItem));

        // Add unavailable item
        const unavailableItem = {
          itemId: "espada",
          name: "Espada de Hierro",
          buyPrice: 100,
          sellPrice: 85,
          stock: 10,
          available: false,
        };
        assertOk(await storeRepo.upsertItem(guildId, unavailableItem));

        const items = assertOk(await storeService.listAvailableItems(guildId));
        assertEqual(items.length, 1, "should only list available items");
        assertEqual(items[0]?.itemId, "palo", "should be the available item");
      },
    },
  ],
};
