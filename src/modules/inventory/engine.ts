
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { type ItemId } from "./definitions";
import {
    type ItemInventory,
    addItem,
    removeItem,
    hasItem,
} from "./inventory";

export type ItemAmount = {
    itemId: ItemId;
    quantity: number;
};

export type ItemTransaction = {
    /** Items to remove from inventory */
    costs?: ItemAmount[];
    /** Items to add to inventory */
    rewards?: ItemAmount[];
    /** Allow negative quantities (debt) if true */
    allowDebt?: boolean;
};

export type ItemTransactionResult = Result<ItemInventory, Error>;

export class ItemEngine {
    apply(inv: ItemInventory, tx: ItemTransaction): ItemTransactionResult {
        const costs = tx.costs ?? [];
        const rewards = tx.rewards ?? [];

        if (costs.length === 0 && rewards.length === 0) {
            return ErrResult(new Error("Transaction must have costs or rewards."));
        }

        if (!tx.allowDebt) {
            for (const cost of costs) {
                if (!hasItem(inv, cost.itemId, cost.quantity)) {
                    return ErrResult(new Error(`Insufficient items: ${cost.itemId}`));
                }
            }
        }

        let nextInv = { ...inv };

        for (const cost of costs) {
            nextInv = removeItem(nextInv, cost.itemId, cost.quantity, tx.allowDebt);
        }

        for (const reward of rewards) {
            nextInv = addItem(nextInv, reward.itemId, reward.quantity, tx.allowDebt);
        }

        return OkResult(nextInv);
    }
}

export const itemEngine = new ItemEngine();
