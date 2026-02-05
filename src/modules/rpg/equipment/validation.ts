/**
 * Equipment Validation.
 *
 * Purpose: Validation logic for equipment operations.
 * Context: Used by equipment service before performing mutations.
 */

import type { ItemInventory } from "@/modules/inventory/inventory";
import { getItemQuantity } from "@/modules/inventory/inventory";
import { EQUIPMENT_SLOTS } from "../config";
import type { RpgProfile } from "../profile/types";
import type { EquipmentOperationInput, EquipmentValidationResult } from "./types";

/**
 * Validate equipment operation.
 */
export function validateEquipmentOperation(
  input: EquipmentOperationInput,
  profile: RpgProfile,
  inventory: ItemInventory,
): EquipmentValidationResult {
  // Check if in combat
  if (profile.isFighting) {
    return {
      valid: false,
      error: "IN_COMBAT",
      message: "Cannot change equipment while in combat",
    };
  }

  // Validate slot
  if (!EQUIPMENT_SLOTS.includes(input.slot)) {
    return {
      valid: false,
      error: "INVALID_EQUIPMENT_SLOT",
      message: `Invalid equipment slot: ${input.slot}`,
    };
  }

  // For equip: validate item exists in inventory
  if (input.itemId !== null) {
    const quantity = getItemQuantity(inventory, input.itemId);
    if (quantity < 1) {
      return {
        valid: false,
        error: "ITEM_NOT_IN_INVENTORY",
        message: "Item not found in inventory",
      };
    }
  }

  return { valid: true };
}

/**
 * Check if an item can be equipped to a slot.
 */
export function canEquipToSlot(itemId: string, slot: string): boolean {
  // Basic naming convention check
  // This can be extended with item definitions
  const slotPatterns: Record<string, string[]> = {
    weapon: ["sword", "knife", "dagger", "axe", "pickaxe", "bow", "staff"],
    shield: ["shield"],
    helmet: ["helmet", "helm", "hat"],
    chest: ["chestplate", "armor", "vest", "robe"],
    pants: ["pants", "leggings", "trousers"],
    boots: ["boots", "shoes", "greaves"],
    ring: ["ring"],
    necklace: ["necklace", "amulet", "pendant"],
  };

  const patterns = slotPatterns[slot];
  if (!patterns) return false;

  const lowerItemId = itemId.toLowerCase();
  return patterns.some((pattern) => lowerItemId.includes(pattern));
}
