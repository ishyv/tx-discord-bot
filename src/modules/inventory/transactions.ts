/**
 * Inventory transactions: apply item costs/rewards with optimistic concurrency on user inventory.
 */
import { UserStore } from "@/db/repositories/users";
import { runUserTransition } from "@/db/user-transition";
import { normalizeInventory, type ItemInventory } from "./inventory";

import {
  itemEngine,
  type ItemTransaction,
  type ItemTransactionResult,
} from "./engine";
export type { ItemTransaction, ItemTransactionResult };

export async function itemTransaction(
  userID: string,
  tx: ItemTransaction,
): Promise<ItemTransactionResult> {
  return runUserTransition(userID, {
    getSnapshot: (user) => normalizeInventory(user.inventory),
    computeNext: (inv) => itemEngine.apply(inv, tx),
    commit: (id, expected, next) =>
      UserStore.replaceIfMatch(
        id,
        { inventory: expected } as any,
        { inventory: next } as any,
      ),
    project: (updatedUser) => updatedUser.inventory as ItemInventory,
    conflictError: "ITEM_TX_CONFLICT",
  });
}
