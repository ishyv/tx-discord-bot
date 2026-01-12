import { UserStore } from "@/db/repositories/users";
import {
  ItemId,
  InventoryItem,
  DEFAULT_MAX_STACK,
} from "./definitions";
import { getItemDefinition } from "./items";
export type ItemInventory = Record<ItemId, InventoryItem | undefined>;

export function createEmptyInventory(): ItemInventory {
  return {};
}

export function normalizeInventory(raw: unknown): ItemInventory {
  if (!raw || typeof raw !== "object") return createEmptyInventory();
  const entries = Object.entries(raw as Record<string, unknown>);
  const next: ItemInventory = {};
  for (const [key, value] of entries) {
    const item = value as InventoryItem | undefined;
    if (
      item &&
      typeof item.id === "string" &&
      typeof item.id === "string" &&
      typeof item.quantity === "number" &&
      item.quantity !== 0 // Allow negative quantities
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
  inv: ItemInventory,
  itemId: ItemId,
  quantity: number,
  allowDebt: boolean = false
): ItemInventory {
  const amount = Number.isFinite(quantity) ? Math.trunc(quantity) : 0;
  if (amount === 0) return inv;

  const definition = getItemDefinition(itemId);
  const maxStack = definition?.maxStack ?? DEFAULT_MAX_STACK;

  const existing = inv[itemId] as InventoryItem | undefined;
  const nextQuantity = (existing?.quantity ?? 0) + amount;
  // If allowDebt is true, we don't clamp to maxStack for negative values (technically undefined behavior for add, but safe)
  // For standard add, we clamp.
  const clampedQuantity = allowDebt ? nextQuantity : Math.min(nextQuantity, maxStack);

  if (clampedQuantity === 0) {
    const { [itemId]: _, ...rest } = inv as Record<string, InventoryItem>;
    return rest as ItemInventory;
  }

  return {
    ...inv,
    [itemId]: {
      id: itemId,
      quantity: clampedQuantity,
    },
  };
}

export function removeItem(
  inv: ItemInventory,
  itemId: ItemId,
  quantity: number,
  allowDebt: boolean = false
): ItemInventory {
  const amount = Number.isFinite(quantity) ? Math.trunc(quantity) : 0;
  if (amount <= 0) return inv;

  const existing = inv[itemId] as InventoryItem | undefined;
  if (!existing) {
    return inv;
  }

  const nextQuantity = existing.quantity - amount;
  if (!allowDebt && nextQuantity <= 0) {
    const { [itemId]: _, ...rest } = inv as Record<string, InventoryItem>;
    return rest as ItemInventory;
  }

  // If debt is allowed, we keep the item even if <= 0
  if (allowDebt && nextQuantity === 0) {
    // If nextQuantity is 0, we can remove it.
    const { [itemId]: _, ...rest } = inv as Record<string, InventoryItem>;
    return rest as ItemInventory;
  }

  return {
    ...inv,
    [itemId]: {
      id: itemId,
      quantity: nextQuantity,
    },
  };
}

export function getItemQuantity(inv: ItemInventory, itemId: ItemId): number {
  return (inv[itemId] as InventoryItem | undefined)?.quantity ?? 0;
}

export function hasItem(
  inv: ItemInventory,
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
export async function saveInventory(userID: string, inv: ItemInventory): Promise<void> {
  const userResult = await UserStore.ensure(userID);
  if (userResult.isErr()) {
    console.warn("saveInventory: failed to ensure user; ignoring save.", userResult.error);
    return;
  }
  const saved = await UserStore.patch(userID, { inventory: inv } as any);
  if (saved.isErr()) {
    console.warn("saveInventory: failed to save user inventory.", saved.error);
  }
}

/** Loads the user inventory from the database.
 */
export async function loadInventory(userID: string): Promise<ItemInventory> {
  const userResult = await UserStore.ensure(userID);
  if (userResult.isErr()) {
    console.warn("loadInventory: failed to ensure user; returning empty inventory.", userResult.error);
    return createEmptyInventory();
  }
  const user = userResult.unwrap();
  return normalizeInventory(user?.inventory);
}

