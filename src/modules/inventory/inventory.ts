import { ensureUser, saveUser } from "@/db/repositories";
import {
  ItemId,
  InventoryItem,
  DEFAULT_MAX_STACK,
} from "./definitions";
import { getItemDefinition } from "./items";
export type UserInventory = Record<ItemId, InventoryItem | undefined>;

export function createEmptyInventory(): UserInventory {
  return {};
}

export function normalizeInventory(raw: unknown): UserInventory {
  if (!raw || typeof raw !== "object") return createEmptyInventory();
  const entries = Object.entries(raw as Record<string, unknown>);
  const next: UserInventory = {};
  for (const [key, value] of entries) {
    const item = value as InventoryItem | undefined;
    if (
      item &&
      typeof item.id === "string" &&
      typeof item.quantity === "number" &&
      item.quantity > 0
    ) {
      next[key] = {
        id: item.id,
        quantity: Math.trunc(item.quantity),
      };
    }
  }
  return next;
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

  const existing = inv[itemId] as InventoryItem | undefined;
  if (!existing) {
    return inv;
  }

  const nextQuantity = existing.quantity - amount;

  if (nextQuantity <= 0) {
    const { [itemId]: _, ...rest } = inv as Record<string, InventoryItem>;
    return rest as UserInventory;
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
  return (inv[itemId] as InventoryItem | undefined)?.quantity ?? 0;
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
  const userResult = await ensureUser(userID);
  if (userResult.isErr()) {
    console.warn("saveInventory: failed to ensure user; ignoring save.", userResult.error);
    return;
  }
  const saved = await saveUser(userID, { inventory: inv });
  if (saved.isErr()) {
    console.warn("saveInventory: failed to save user inventory.", saved.error);
  }
}

/** Loads the user inventory from the database.
 */
export async function loadInventory(userID: string): Promise<UserInventory> {
  const userResult = await ensureUser(userID);
  if (userResult.isErr()) {
    console.warn("loadInventory: failed to ensure user; returning empty inventory.", userResult.error);
    return createEmptyInventory();
  }
  const user = userResult.unwrap();
  return normalizeInventory(user?.inventory);
}

