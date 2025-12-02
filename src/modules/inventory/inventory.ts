import { Schema } from "mongoose";
import { ensureUser, updateUser } from "@/db/repositories";
import {
    ItemId,
    InventoryItem,
    DEFAULT_MAX_STACK,
} from "./definitions";
import { getItemDefinition } from "./items";

export type UserInventory = Record<ItemId, InventoryItem | undefined>;

export const UserInventorySchema = new Schema<Record<string, any>>(
    {},
    { strict: false, _id: false },
);

export function createEmptyInventory(): UserInventory {
    return {};
}

export function addItem(
    inv: UserInventory,
    itemId: ItemId,
    quantity: number,
): UserInventory {
    const amount = Number.isFinite(quantity) ? Math.trunc(quantity) : 0;
    if (amount <= 0) return inv;

    const definition = getItemDefinition(itemId);
    const maxStack = definition?.maxStack ?? DEFAULT_MAX_STACK;

    const existing = inv[itemId] as InventoryItem | undefined;
    const nextQuantity = (existing?.quantity ?? 0) + amount;
    const clampedQuantity = Math.min(nextQuantity, maxStack);

    return {
        ...inv,
        [itemId]: {
            id: itemId,
            quantity: clampedQuantity,
        },
    };
}

export function removeItem(
    inv: UserInventory,
    itemId: ItemId,
    quantity: number,
): UserInventory {
    const amount = Number.isFinite(quantity) ? Math.trunc(quantity) : 0;
    if (amount <= 0) return inv;

    const existing = inv[itemId];
    if (!existing) {
        return inv;
    }

    const nextQuantity = existing.quantity - amount;

    if (nextQuantity <= 0) {
        const { [itemId]: _, ...rest } = inv;
        return rest;
    }

    return {
        ...inv,
        [itemId]: {
            id: itemId,
            quantity: nextQuantity,
        },
    };
}

export function getItemQuantity(inv: UserInventory, itemId: ItemId): number {
    return inv[itemId]?.quantity ?? 0;
}

export function hasItem(
    inv: UserInventory,
    itemId: ItemId,
    quantity: number,
): boolean {
    const amount = Number.isFinite(quantity) ? Math.trunc(quantity) : 0;
    if (amount <= 0) return true;

    const existingQuantity = getItemQuantity(inv, itemId);
    return existingQuantity >= amount;
}

/**
 * Saves the user inventory to the database.
 */
export async function saveInventory(userID: string, inv: UserInventory): Promise<void> {
    const user = await ensureUser(userID);
    user.inventory = inv;
    await updateUser(userID, { inventory: inv });
}

/** Loads the user inventory from the database.
 */
export async function loadInventory(userID: string): Promise<UserInventory> {
    const user = await ensureUser(userID);
    return (user.inventory as UserInventory) || createEmptyInventory();
}

