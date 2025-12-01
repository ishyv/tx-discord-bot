import { ensureUser, updateUser } from "@/db/repositories";
import { Schema } from "mongoose";

export type ItemId = string;

export type ItemDefinition = {
  id: ItemId;
  name: string;
  description: string;
  emoji?: string;
  maxStack?: number;
};

export type InventoryItem = {
  id: ItemId;
  quantity: number;
};

export type UserInventory = Record<ItemId, InventoryItem | undefined>;
export const UserInventorySchema = new Schema<Record<string, any>>(
  {},
  { strict: false, _id: false },
);

export type ItemUseFunction = (ctx: {
  item: InventoryItem;
  userId: string;
}) => Promise<void>;

export type ItemDefinitionWithUse = ItemDefinition & {
  onUse?: ItemUseFunction;
};

const DEFAULT_MAX_STACK = 99;

export const ITEM_DEFINITIONS: Record<ItemId, ItemDefinitionWithUse> = {
  palo: {
    id: "palo",
    name: "Palo de Madera",
    description: "Un palo comun y corriente. Tal vez sirva para craftear algo.",
    emoji: ":wood:",
    maxStack: DEFAULT_MAX_STACK,
    onUse: async ({ item, userId }) => {
      console.log(`[inventory] Usuario ${userId} uso el item ${item.id}`);
      // TODO: add real item behavior/persistence hook here.
    },
  },
};

export function getItemDefinition(
  id: ItemId,
): ItemDefinitionWithUse | null {
  return ITEM_DEFINITIONS[id] ?? null;
}

export function resolveMaxStack(item: ItemDefinitionWithUse): number {
  return item.maxStack ?? DEFAULT_MAX_STACK;
}

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