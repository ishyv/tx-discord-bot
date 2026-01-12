import { currencyTransaction } from "@/modules/economy/transactions";
import { itemTransaction } from "@/modules/inventory/transactions";
import * as UsersRepo from "@/db/repositories/users";
import { assert, assertErr, assertOk, assertEqual, type Suite, ops } from "./_utils";

const cleanupUser = (cleanup: { add: (task: () => Promise<void> | void) => void }, id: string) => {
    cleanup.add(async () => {
        const res = await UsersRepo.deleteUser(id);
        if (res.isErr()) return;
    });
};

export const suite: Suite = {
    name: "negative adjustments",
    tests: [
        {
            name: "currency removal and debt",
            ops: [ops.update],
            run: async ({ factory, cleanup }) => {
                const userId = factory.userId();
                cleanupUser(cleanup, userId);
                assertOk(await UsersRepo.ensureUser(userId));

                // 1. Give 100 coins
                assertOk(await currencyTransaction(userId, {
                    rewards: [{ currencyId: "coins", value: { hand: 100, bank: 0 } }]
                }));

                // 2. Remove 50 coins (normal subtraction using COSTS)
                const subResult = assertOk(await currencyTransaction(userId, {
                    costs: [{ currencyId: "coins", value: { hand: 50, bank: 0 } }]
                }));
                const hand = (subResult.coins as any)?.hand;
                assertEqual(hand, 50, "should have 50 coins remaining");

                // 3. Remove 100 coins (resulting in debt) with allowDebt: true
                const debtResult = assertOk(await currencyTransaction(userId, {
                    costs: [{ currencyId: "coins", value: { hand: 100, bank: 0 } }],
                    allowDebt: true
                }));
                const debtHand = (debtResult.coins as any)?.hand;
                assertEqual(debtHand, -50, "should exist debt (-50)");

                // 4. Try to remove 10 coins without allowDebt (should fail because balance < 0 is invalid)
                // Reset to 0 first to be clean?
                // Current state is -50.
                // Adding 50 to get to 0.
                assertOk(await currencyTransaction(userId, {
                    rewards: [{ currencyId: "coins", value: { hand: 50, bank: 0 } }],
                    allowDebt: true // needed to recover from invalid state
                }));

                // Now balance is 0. Try to remove 10 without allowDebt.
                const failResult = await currencyTransaction(userId, {
                    costs: [{ currencyId: "coins", value: { hand: 10, bank: 0 } }]
                });
                assertErr(failResult);
            }
        },
        {
            name: "item removal and debt",
            ops: [ops.update],
            run: async ({ factory, cleanup }) => {
                const userId = factory.userId();
                cleanupUser(cleanup, userId);
                assertOk(await UsersRepo.ensureUser(userId));
                const itemId = "palo";

                // 1. Give 5 items
                assertOk(await itemTransaction(userId, {
                    rewards: [{ itemId, quantity: 5 }]
                }));

                // 2. Remove 2 items (using COSTS)
                const subResult = assertOk(await itemTransaction(userId, {
                    costs: [{ itemId, quantity: 2 }]
                }));
                const inv = subResult;
                assertEqual(inv[itemId]?.quantity, 3, "should have 3 items");

                // 3. Remove 5 items (debt -2) with allowDebt
                const debtResult = assertOk(await itemTransaction(userId, {
                    costs: [{ itemId, quantity: 5 }],
                    allowDebt: true
                }));
                assertEqual(debtResult[itemId]?.quantity, -2, "should have -2 items");

                // 4. Reset to 0
                assertOk(await itemTransaction(userId, {
                    rewards: [{ itemId, quantity: 2 }],
                    allowDebt: true
                }));

                // 5. Try to remove 1 without allowDebt (should fail)
                const failResult = await itemTransaction(userId, {
                    costs: [{ itemId, quantity: 1 }]
                });
                assertErr(failResult);
            }
        }
    ]
};
