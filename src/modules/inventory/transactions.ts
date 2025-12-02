import { ErrResult, OkResult, Result } from "@/utils/result";
import { ItemId } from "./definitions";
import { UserInventory, addItem, removeItem, hasItem } from "./inventory";
import { ensureUser, toUser } from "@/db/repositories";
import { connectMongo, UserModel } from "@/db";

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
    const user = await ensureUser(userID);
    let inv = user.inventory;

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

        await connectMongo();
        const doc = await UserModel.findOneAndUpdate(
            { _id: userID, inventory: inv },
            { $set: { inventory: nextInv } },
            { new: true, lean: true },
        );

        if (doc) {
            const mapped = toUser(doc);
            return mapped ? OkResult(mapped.inventory) : ErrResult(new Error("USER_NOT_FOUND"));
        }

        // Inventory changed concurrently; reload and retry.
        const fresh = await UserModel.findById(userID).lean();
        const mapped = toUser(fresh);
        if (!mapped) return ErrResult(new Error("USER_NOT_FOUND"));
        inv = mapped.inventory;
    }

    return ErrResult(new Error("ITEM_TX_CONFLICT"));
}

