/**
 * Inventory transactions: apply item costs/rewards with optimistic concurrency on user inventory.
 */
import { ErrResult, OkResult, Result } from "@/utils/result";
import { ItemId } from "./definitions";
import {
  UserInventory,
  addItem,
  removeItem,
  hasItem,
  normalizeInventory,
} from "./inventory";
import { ensureUser, replaceInventoryIfMatch } from "@/db/repositories";

export type ItemAmount = {
    itemId: ItemId;
    quantity: number;
};

export type ItemTransaction = {
    /** Items to remove from inventory */
    costs?: ItemAmount[];
    /** Items to add to inventory */
    rewards?: ItemAmount[];
};

export type ItemTransactionResult = Result<UserInventory, Error>;

export async function itemTransaction(
  userID: string,
  tx: ItemTransaction,
): Promise<ItemTransactionResult> {
    const userResult = await ensureUser(userID);
    if (userResult.isErr()) return ErrResult(userResult.error);
    const user = userResult.unwrap();
    let inv = normalizeInventory(user.inventory);

    // Optimistic retry loop to avoid lost updates under concurrent writes.
    for (let attempt = 0; attempt < 3; attempt += 1) {
        // 1. Validate costs first (all or nothing)
        const costs = tx.costs ?? [];
        for (const cost of costs) {
            if (!hasItem(inv, cost.itemId, cost.quantity)) {
                return ErrResult(new Error(`Insufficient items: ${cost.itemId}`));
            }
        }

        // 2. Apply changes to a copy
        let nextInv = { ...inv };

        // Apply costs
        for (const cost of costs) {
            nextInv = removeItem(nextInv, cost.itemId, cost.quantity);
        }

        // Apply rewards
        const rewards = tx.rewards ?? [];
        for (const reward of rewards) {
            nextInv = addItem(nextInv, reward.itemId, reward.quantity);
        }

        const updated = await replaceInventoryIfMatch(userID, inv, nextInv);
        if (updated.isErr()) return ErrResult(updated.error);
        const updatedUser = updated.unwrap();
        if (updatedUser) {
            return OkResult(updatedUser.inventory as UserInventory);
        }

        // Inventory changed concurrently; reload and retry.
        const fresh = await ensureUser(userID);
        if (fresh.isErr()) return ErrResult(fresh.error);
        inv = normalizeInventory(fresh.unwrap().inventory);
    }

    return ErrResult(new Error("ITEM_TX_CONFLICT"));
}

