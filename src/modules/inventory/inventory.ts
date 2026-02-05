import { UserStore } from "@/db/repositories/users";
import { ItemId, InventoryItem, DEFAULT_MAX_STACK } from "./definitions";
import { getItemDefinition } from "./items";
import type { InventoryEntry, ItemInstance, InstanceId } from "./instances";
import {
  isInstanceBased,
  createInstances,
  normalizeToEntry,
  getTotalQuantity,
  isEmpty,
  removeInstance,
  decrementDurability,
} from "./instances";

/** Legacy inventory type for backward compatibility. */
export type ItemInventory = Record<ItemId, InventoryItem | undefined>;

/** New inventory type supporting instances. */
export type ModernInventory = Record<ItemId, InventoryEntry | undefined>;

/** Get inventory entry type for an item. */
export function getInventoryEntryType(itemId: ItemId): "stackable" | "instances" {
  return isInstanceBased(itemId) ? "instances" : "stackable";
}

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
  allowDebt: boolean = false,
): ItemInventory {
  const amount = Number.isFinite(quantity) ? Math.trunc(quantity) : 0;
  if (amount === 0) return inv;

  const definition = getItemDefinition(itemId);
  const maxStack = definition?.maxStack ?? DEFAULT_MAX_STACK;

  const existing = inv[itemId] as InventoryItem | undefined;
  const nextQuantity = (existing?.quantity ?? 0) + amount;
  // If allowDebt is true, we don't clamp to maxStack for negative values (technically undefined behavior for add, but safe)
  // For standard add, we clamp.
  const clampedQuantity = allowDebt
    ? nextQuantity
    : Math.min(nextQuantity, maxStack);

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
  allowDebt: boolean = false,
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
export async function saveInventory(
  userID: string,
  inv: ItemInventory,
): Promise<void> {
  const userResult = await UserStore.ensure(userID);
  if (userResult.isErr()) {
    console.warn(
      "saveInventory: failed to ensure user; ignoring save.",
      userResult.error,
    );
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
    console.warn(
      "loadInventory: failed to ensure user; returning empty inventory.",
      userResult.error,
    );
    return createEmptyInventory();
  }
  const user = userResult.unwrap();
  return normalizeInventory(user?.inventory);
}

// ============================================================================
// Instance-Based Inventory Operations (New)
// ============================================================================

/** Normalize raw inventory to modern format. */
export function normalizeModernInventory(raw: unknown): ModernInventory {
  if (!raw || typeof raw !== "object") return {};
  const entries = Object.entries(raw as Record<string, unknown>);
  const next: ModernInventory = {};
  for (const [itemId, rawEntry] of entries) {
    const entry = normalizeToEntry(itemId, rawEntry);
    if (!isEmpty(entry)) {
      next[itemId] = entry;
    }
  }
  return next;
}

/** Get quantity of an item in modern inventory. */
export function getModernItemQuantity(
  inventory: ModernInventory,
  itemId: ItemId,
): number {
  return getTotalQuantity(inventory[itemId]);
}

/** Check if modern inventory has sufficient quantity. */
export function modernHasItem(
  inventory: ModernInventory,
  itemId: ItemId,
  quantity: number,
): boolean {
  return getModernItemQuantity(inventory, itemId) >= quantity;
}

/** Add instances to inventory. */
export function addInstances(
  inventory: ModernInventory,
  instances: ItemInstance[],
): ModernInventory {
  if (instances.length === 0) return inventory;

  const itemId = instances[0].itemId;
  const existing = inventory[itemId];

  if (existing?.type === "instances") {
    return {
      ...inventory,
      [itemId]: {
        type: "instances",
        instances: [...existing.instances, ...instances],
      },
    };
  }

  return {
    ...inventory,
    [itemId]: { type: "instances", instances },
  };
}

/** Add a single instance to inventory. */
export function addInstance(
  inventory: ModernInventory,
  instance: ItemInstance,
): ModernInventory {
  return addInstances(inventory, [instance]);
}

/** Remove and return an instance by ID. */
export function removeInstanceById(
  inventory: ModernInventory,
  itemId: ItemId,
  instanceId: InstanceId,
): { inventory: ModernInventory; removed: ItemInstance | null } {
  const entry = inventory[itemId];
  if (entry?.type !== "instances") {
    return { inventory, removed: null };
  }

  const removed = entry.instances.find((i) => i.instanceId === instanceId);
  if (!removed) {
    return { inventory, removed: null };
  }

  const newInstances = removeInstance(entry.instances, instanceId);
  const newInventory: ModernInventory = { ...inventory };

  if (newInstances.length === 0) {
    delete newInventory[itemId];
  } else {
    newInventory[itemId] = { type: "instances", instances: newInstances };
  }

  return { inventory: newInventory, removed };
}

/** Pop N instances of an item (removes first N found). */
export function popInstances(
  inventory: ModernInventory,
  itemId: ItemId,
  count: number,
): { inventory: ModernInventory; removed: ItemInstance[] } {
  const entry = inventory[itemId];
  if (entry?.type !== "instances") {
    return { inventory, removed: [] };
  }

  const removed = entry.instances.slice(0, count);
  const newInstances = entry.instances.slice(count);
  const newInventory: ModernInventory = { ...inventory };

  if (newInstances.length === 0) {
    delete newInventory[itemId];
  } else {
    newInventory[itemId] = { type: "instances", instances: newInstances };
  }

  return { inventory: newInventory, removed };
}

/** Decrement durability of an instance. Returns updated inventory and whether item broke. */
export function useInstance(
  inventory: ModernInventory,
  itemId: ItemId,
  instanceId: InstanceId,
  damage: number = 1,
): { inventory: ModernInventory; broken: boolean; remainingDurability: number } {
  const entry = inventory[itemId];
  if (entry?.type !== "instances") {
    return { inventory, broken: false, remainingDurability: 0 };
  }

  const instance = entry.instances.find((i) => i.instanceId === instanceId);
  if (!instance) {
    return { inventory, broken: false, remainingDurability: 0 };
  }

  const updated = decrementDurability(instance, damage);

  if (updated === null) {
    // Item broke - remove it
    const newInstances = removeInstance(entry.instances, instanceId);
    const newInventory: ModernInventory = { ...inventory };

    if (newInstances.length === 0) {
      delete newInventory[itemId];
    } else {
      newInventory[itemId] = { type: "instances", instances: newInstances };
    }

    return { inventory: newInventory, broken: true, remainingDurability: 0 };
  }

  // Update instance
  const newInstances = entry.instances.map((i) =>
    i.instanceId === instanceId ? updated : i,
  );

  return {
    inventory: {
      ...inventory,
      [itemId]: { type: "instances", instances: newInstances },
    },
    broken: false,
    remainingDurability: updated.durability,
  };
}

/** Create instances for an item and add to inventory. */
export function createAndAddInstances(
  inventory: ModernInventory,
  itemId: ItemId,
  count: number,
  durability?: number,
): { inventory: ModernInventory; created: ItemInstance[] } {
  const created = createInstances(itemId, count).map((inst) =>
    durability !== undefined ? { ...inst, durability } : inst,
  );
  return { inventory: addInstances(inventory, created), created };
}

/** Convert legacy inventory to modern format. */
export function migrateToModernInventory(
  legacy: ItemInventory,
): ModernInventory {
  const modern: ModernInventory = {};
  for (const [itemId, item] of Object.entries(legacy)) {
    if (!item || item.quantity <= 0) continue;

    if (isInstanceBased(itemId)) {
      modern[itemId] = {
        type: "instances",
        instances: createInstances(itemId, item.quantity),
      };
    } else {
      modern[itemId] = { type: "stackable", quantity: item.quantity };
    }
  }
  return modern;
}
