/**
 * Inventory Item Instances.
 *
 * Purpose: Support durability-based non-stackable items (tools, weapons, armor).
 * Context: Tools have durability that decreases with use; when durability reaches 0, item breaks.
 * Dependencies: Item definitions for durability defaults.
 *
 * Invariants:
 * - Stackable items use quantity-based storage.
 * - Non-stackable items use instance-based storage with durability.
 * - Instance IDs are unique within a user's inventory.
 * - Durability is clamped 0-maxDurability.
 */

import { getItemDefinition } from "./items";
import type { ItemId } from "./definitions";

/** Unique instance ID for non-stackable items. */
export type InstanceId = string;

/** Item instance with durability for non-stackables. */
export interface ItemInstance {
  /** Unique instance ID. */
  readonly instanceId: InstanceId;
  /** Item type ID. */
  readonly itemId: ItemId;
  /** Current durability. */
  readonly durability: number;
}

/** Inventory entry - either stackable quantity or instances array. */
export type InventoryEntry =
  | { type: "stackable"; quantity: number }
  | { type: "instances"; instances: ItemInstance[] };

/** Check if item should use instance-based storage. */
export function isInstanceBased(itemId: ItemId): boolean {
  const def = getItemDefinition(itemId);
  if (!def) return false;
  // Non-stackable items with durability use instances
  return def.canStack === false || def.tool !== undefined;
}

/** Get default durability for an item. */
export function getDefaultDurability(itemId: ItemId): number {
  const def = getItemDefinition(itemId);
  if (!def) return 0;
  return def.tool?.maxDurability ?? 100;
}

/** Get max durability for an item. */
export function getMaxDurability(itemId: ItemId): number {
  const def = getItemDefinition(itemId);
  if (!def) return 0;
  return def.tool?.maxDurability ?? 100;
}

/** Generate a unique instance ID. */
export function generateInstanceId(): InstanceId {
  return `inst_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/** Create a new item instance with full durability. */
export function createInstance(
  itemId: ItemId,
  durability?: number,
): ItemInstance {
  const maxDur = getMaxDurability(itemId);
  return {
    instanceId: generateInstanceId(),
    itemId,
    durability: durability ?? maxDur,
  };
}

/** Create multiple instances of the same item. */
export function createInstances(itemId: ItemId, count: number): ItemInstance[] {
  return Array.from({ length: count }, () => createInstance(itemId));
}

/** Decrement durability and return updated instance (or null if broken). */
export function decrementDurability(
  instance: ItemInstance,
  amount: number = 1,
): ItemInstance | null {
  const newDurability = instance.durability - amount;
  if (newDurability <= 0) {
    return null; // Item breaks
  }
  return {
    ...instance,
    durability: newDurability,
  };
}

/** Repair an instance to full or specified durability. */
export function repairInstance(
  instance: ItemInstance,
  durability?: number,
): ItemInstance {
  const maxDur = getMaxDurability(instance.itemId);
  return {
    ...instance,
    durability: durability ?? maxDur,
  };
}

/** Find an instance by ID in an instances array. */
export function findInstance(
  instances: ItemInstance[],
  instanceId: InstanceId,
): ItemInstance | undefined {
  return instances.find((i) => i.instanceId === instanceId);
}

/** Remove an instance by ID from an instances array. */
export function removeInstance(
  instances: ItemInstance[],
  instanceId: InstanceId,
): ItemInstance[] {
  return instances.filter((i) => i.instanceId !== instanceId);
}

/** Get total quantity of an item (stacks count or instances length). */
export function getTotalQuantity(entry: InventoryEntry | undefined): number {
  if (!entry) return 0;
  if (entry.type === "stackable") return entry.quantity;
  return entry.instances.length;
}

/** Check if entry has any items. */
export function isEmpty(entry: InventoryEntry | undefined): boolean {
  return getTotalQuantity(entry) === 0;
}

/** Normalize old inventory format to new format. */
export function normalizeToEntry(
  itemId: ItemId,
  raw: unknown,
): InventoryEntry {
  // Handle old format: { id: ItemId, quantity: number }
  if (
    raw &&
    typeof raw === "object" &&
    "quantity" in (raw as object) &&
    typeof (raw as { quantity: unknown }).quantity === "number"
  ) {
    const qty = (raw as { quantity: number }).quantity;
    if (isInstanceBased(itemId)) {
      // Convert quantity to instances
      return {
        type: "instances",
        instances: createInstances(itemId, Math.max(0, qty)),
      };
    }
    return { type: "stackable", quantity: Math.max(0, qty) };
  }

  // Handle new format
  if (raw && typeof raw === "object") {
    const obj = raw as { type?: string; quantity?: number; instances?: unknown };
    if (obj.type === "stackable" && typeof obj.quantity === "number") {
      return { type: "stackable", quantity: Math.max(0, obj.quantity) };
    }
    if (obj.type === "instances" && Array.isArray(obj.instances)) {
      const instances = obj.instances.filter(
        (i): i is ItemInstance =>
          i &&
          typeof i === "object" &&
          typeof (i as ItemInstance).instanceId === "string" &&
          typeof (i as ItemInstance).itemId === "string" &&
          typeof (i as ItemInstance).durability === "number",
      );
      return { type: "instances", instances };
    }
  }

  // Default empty
  if (isInstanceBased(itemId)) {
    return { type: "instances", instances: [] };
  }
  return { type: "stackable", quantity: 0 };
}

/** Legacy inventory item type for backward compatibility. */
export interface LegacyInventoryItem {
  id: ItemId;
  quantity: number;
}

/** Convert new entry to legacy format for backward compatibility. */
export function toLegacyFormat(
  itemId: ItemId,
  entry: InventoryEntry | undefined,
): LegacyInventoryItem | undefined {
  if (!entry || isEmpty(entry)) return undefined;

  if (entry.type === "stackable") {
    return { id: itemId, quantity: entry.quantity };
  }

  // For instances, return quantity = count of instances
  return { id: itemId, quantity: entry.instances.length };
}

/** Inventory view entry for display. */
export interface InventoryViewEntry {
  itemId: ItemId;
  quantity: number;
  isInstanceBased: boolean;
  instances?: ItemInstance[];
}

/** Build view entries from inventory record. */
export function buildInventoryView(
  inventory: Record<ItemId, unknown>,
): InventoryViewEntry[] {
  const entries: InventoryViewEntry[] = [];

  for (const [itemId, raw] of Object.entries(inventory)) {
    const entry = normalizeToEntry(itemId, raw);
    if (isEmpty(entry)) continue;

    entries.push({
      itemId,
      quantity: getTotalQuantity(entry),
      isInstanceBased: entry.type === "instances",
      instances: entry.type === "instances" ? entry.instances : undefined,
    });
  }

  return entries;
}
