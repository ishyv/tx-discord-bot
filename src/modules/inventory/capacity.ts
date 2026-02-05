/**
 * Inventory Capacity.
 *
 * Purpose: Single source of truth for inventory capacity calculations.
 * Context: Used by economy store checks and item mutation constraints.
 * Dependencies: Item definitions and inventory types.
 * Invariants: Slot usage follows stackable vs non-stackable rules.
 */

import { DEFAULT_INVENTORY_CAPACITY, type ItemId } from "./definitions";
import type { ItemInventory, ModernInventory } from "./inventory";
import { getItemDefinition, resolveCanStack, resolveWeight } from "./items";
import { isInstanceBased, getTotalQuantity } from "./instances";

export type CapacityLimits = {
  readonly maxWeight: number;
  readonly maxSlots: number;
};

export type CapacityStats = {
  readonly currentWeight: number;
  readonly maxWeight: number;
  readonly currentSlots: number;
  readonly maxSlots: number;
  readonly remainingWeight: number;
  readonly remainingSlots: number;
  readonly weightExceeded: boolean;
  readonly slotsExceeded: boolean;
};

type CapacityOptions = {
  readonly limits?: CapacityLimits;
  /**
   * When true, missing item definitions do not trigger exceed checks.
   * Current usage is still reported based on known items.
   */
  readonly ignoreUnknownItem?: boolean;
};

const resolveLimits = (limits?: CapacityLimits): CapacityLimits =>
  limits ?? DEFAULT_INVENTORY_CAPACITY;

const buildCapacityStats = (
  currentWeight: number,
  currentSlots: number,
  limits: CapacityLimits,
): CapacityStats => {
  const remainingWeight = limits.maxWeight - currentWeight;
  const remainingSlots = limits.maxSlots - currentSlots;

  return {
    currentWeight,
    maxWeight: limits.maxWeight,
    currentSlots,
    maxSlots: limits.maxSlots,
    remainingWeight,
    remainingSlots,
    weightExceeded: currentWeight > limits.maxWeight,
    slotsExceeded: currentSlots > limits.maxSlots,
  };
};

const calculateSlotsForItem = (canStack: boolean, quantity: number): number => {
  if (quantity <= 0) return 0;
  return canStack ? 1 : quantity;
};

/** Calculate current capacity usage. */
export function calculateCapacity(
  inventory: ItemInventory,
  options?: CapacityOptions,
): CapacityStats {
  const limits = resolveLimits(options?.limits);
  let currentWeight = 0;
  let currentSlots = 0;

  for (const [itemId, item] of Object.entries(inventory)) {
    if (!item || item.quantity <= 0) continue;

    const definition = getItemDefinition(itemId);
    if (!definition) continue;

    const weight = resolveWeight(definition);
    const canStack = resolveCanStack(definition);

    currentWeight += weight * item.quantity;
    currentSlots += calculateSlotsForItem(canStack, item.quantity);
  }

  return buildCapacityStats(currentWeight, currentSlots, limits);
}

/** Simulate capacity after adding items. */
export function simulateCapacityAfterAdd(
  inventory: ItemInventory,
  itemId: ItemId,
  quantity: number,
  options?: CapacityOptions,
): CapacityStats {
  const limits = resolveLimits(options?.limits);
  const current = calculateCapacity(inventory, { limits });

  const definition = getItemDefinition(itemId);
  if (!definition) {
    if (options?.ignoreUnknownItem) {
      return {
        ...current,
        weightExceeded: false,
        slotsExceeded: false,
      };
    }
    return current;
  }

  const weight = resolveWeight(definition);
  const canStack = resolveCanStack(definition);
  const currentItem = inventory[itemId];
  const currentQty = currentItem?.quantity ?? 0;

  const weightDelta = weight * quantity;
  let slotsDelta = 0;

  if (canStack) {
    if (currentQty === 0 && quantity > 0) {
      slotsDelta = 1;
    }
  } else {
    slotsDelta = quantity;
  }

  return buildCapacityStats(
    current.currentWeight + weightDelta,
    current.currentSlots + slotsDelta,
    limits,
  );
}

// ============================================================================
// Modern Inventory Capacity (with Instances)
// ============================================================================

/** Calculate capacity for modern inventory with instances. */
export function calculateModernCapacity(
  inventory: ModernInventory,
  options?: CapacityOptions,
): CapacityStats {
  const limits = resolveLimits(options?.limits);
  let currentWeight = 0;
  let currentSlots = 0;

  for (const [itemId, entry] of Object.entries(inventory)) {
    if (!entry) continue;

    const definition = getItemDefinition(itemId);
    if (!definition) continue;

    const weight = resolveWeight(definition);
    const quantity = getTotalQuantity(entry);

    if (quantity <= 0) continue;

    // Instance-based items always use 1 slot per instance
    if (entry.type === "instances") {
      currentWeight += weight * quantity;
      currentSlots += quantity; // 1 slot per instance
    } else {
      const canStack = resolveCanStack(definition);
      currentWeight += weight * quantity;
      currentSlots += calculateSlotsForItem(canStack, quantity);
    }
  }

  return buildCapacityStats(currentWeight, currentSlots, limits);
}

/** Simulate capacity after adding items to modern inventory. */
export function simulateModernCapacityAfterAdd(
  inventory: ModernInventory,
  itemId: ItemId,
  quantity: number,
  options?: CapacityOptions,
): CapacityStats {
  const limits = resolveLimits(options?.limits);
  const current = calculateModernCapacity(inventory, { limits });

  const definition = getItemDefinition(itemId);
  if (!definition) {
    if (options?.ignoreUnknownItem) {
      return {
        ...current,
        weightExceeded: false,
        slotsExceeded: false,
      };
    }
    return current;
  }

  const weight = resolveWeight(definition);
  const isInstanced = isInstanceBased(itemId);
  const entry = inventory[itemId];

  const weightDelta = weight * quantity;
  let slotsDelta = 0;

  if (isInstanced) {
    // Instance-based: each item takes 1 slot
    slotsDelta = quantity;
  } else {
    const canStack = resolveCanStack(definition);
    const currentQty = entry?.type === "stackable" ? entry.quantity : 0;

    if (canStack) {
      if (currentQty === 0 && quantity > 0) {
        slotsDelta = 1;
      }
    } else {
      slotsDelta = quantity;
    }
  }

  return buildCapacityStats(
    current.currentWeight + weightDelta,
    current.currentSlots + slotsDelta,
    limits,
  );
}

/** Check if adding instances would exceed capacity. */
export function canAddInstances(
  inventory: ModernInventory,
  itemId: ItemId,
  count: number,
  limits?: CapacityLimits,
): { allowed: boolean; reason?: string } {
  const simulated = simulateModernCapacityAfterAdd(inventory, itemId, count, { limits });

  if (simulated.weightExceeded) {
    return { allowed: false, reason: "Weight limit would be exceeded" };
  }
  if (simulated.slotsExceeded) {
    return { allowed: false, reason: "Slot limit would be exceeded" };
  }

  return { allowed: true };
}
