/**
 * Store Admin Integration Tests.
 *
 * Tests:
 * - addItem
 * - editItem
 * - removeItem
 */

import * as GuildsRepo from "../../src/db/repositories/guilds";
import {
    storeService,
    storeRepo,
} from "../../src/modules/economy";
import {
    assertEqual,
    assertOk,
    ops,
    type Suite,
} from "./_utils";

const cleanupGuild = (
    cleanup: { add: (task: () => Promise<void> | void) => void },
    id: string,
) => {
    cleanup.add(async () => {
        await GuildsRepo.deleteGuild(id);
    });
};

export const suite: Suite = {
    name: "store admin",
    tests: [
        {
            name: "addItem adds a new item to the catalog",
            ops: [ops.create, ops.update],
            run: async ({ factory, cleanup }) => {
                const guildId = factory.guildId();
                cleanupGuild(cleanup, guildId);

                await GuildsRepo.ensureGuild(guildId);

                const item = {
                    itemId: "stick",
                    name: "Wooden Stick",
                    buyPrice: 10,
                    sellPrice: 8,
                    stock: 100,
                    available: true,
                    category: "Materials",
                };

                const result = assertOk(await storeService.addItem(guildId, item)) as any;
                assertEqual(result.items["stick"]?.name, "Wooden Stick", "item should be added");
                assertEqual(result.items["stick"]?.buyPrice, 10, "buyPrice should be 10");
            },
        },
        {
            name: "editItem updates an existing item",
            ops: [ops.create, ops.update],
            run: async ({ factory, cleanup }) => {
                const guildId = factory.guildId();
                cleanupGuild(cleanup, guildId);

                await GuildsRepo.ensureGuild(guildId);

                const item = {
                    itemId: "stick",
                    name: "Wooden Stick",
                    buyPrice: 10,
                    sellPrice: 8,
                    stock: 100,
                    available: true,
                    category: "Materials",
                };

                const added = assertOk(await storeService.addItem(guildId, item)) as any;
                console.log("Item added:", JSON.stringify(added.items["stick"], null, 2));

                const result = assertOk(await storeService.editItem(guildId, "stick", { buyPrice: 15, stock: 50 })) as any;
                console.log("Item after edit:", JSON.stringify(result.items["stick"], null, 2));

                assertEqual(result.items["stick"]?.buyPrice, 15, "buyPrice should be updated to 15");
                assertEqual(result.items["stick"]?.stock, 50, "stock should be updated to 50");
                assertEqual(result.items["stick"]?.name, "Wooden Stick", "name should remain unchanged");
            },
        },
        {
            name: "removeItem removes an item from the catalog",
            ops: [ops.create, ops.update],
            run: async ({ factory, cleanup }) => {
                const guildId = factory.guildId();
                cleanupGuild(cleanup, guildId);

                await GuildsRepo.ensureGuild(guildId);

                const item = {
                    itemId: "stick",
                    name: "Wooden Stick",
                    buyPrice: 10,
                    sellPrice: 8,
                    stock: 100,
                    available: true,
                    category: "Materials",
                };

                assertOk(await storeService.addItem(guildId, item));
                const catalogBefore = assertOk(await storeRepo.findByGuildId(guildId)) as any;
                console.log("Items before remove:", Object.keys(catalogBefore.items));
                assertEqual(Object.keys(catalogBefore.items).length, 1, "should have 1 item");

                const result = assertOk(await storeService.removeItem(guildId, "stick")) as any;
                console.log("Items after remove:", Object.keys(result.items));

                assertEqual(result.items["stick"], undefined, "item should be removed");
                assertEqual(Object.keys(result.items).length, 0, "catalog should be empty");
            },
        },
    ],
};
