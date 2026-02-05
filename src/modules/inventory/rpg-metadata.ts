/**
 * RPG Metadata for Item Definitions.
 *
 * Purpose: Extends item definitions with RPG-specific properties.
 * Context: Combat stats, equipment slots, and tool tiers.
 */

import type { ItemId, ItemDefinitionWithUse } from "./definitions";
import { getItemDefinition } from "./items";

/** RPG equipment slot types. */
export type RpgEquipmentSlot =
  | "weapon"
  | "shield"
  | "helmet"
  | "chest"
  | "pants"
  | "boots"
  | "ring"
  | "necklace"
  | "tool";

/** Tool kinds for gathering. */
export type ToolKind = "pickaxe" | "axe";

/** Tool tier (1-4). */
export type ToolTier = 1 | 2 | 3 | 4;

/** Tool metadata for items that can be used as gathering tools. */
export interface ToolMetadata {
  /** Kind of tool. */
  toolKind: ToolKind;
  /** Tier level (affects gathering locations). */
  tier: ToolTier;
  /** Maximum durability before breaking. */
  maxDurability: number;
}

/** Extended item definition with RPG metadata. */
export interface RpgItemMetadata {
  /** RPG equipment slot this item occupies when equipped. */
  rpgSlot?: RpgEquipmentSlot;
  /** Combat stats provided when equipped. */
  stats?: {
    /** Attack bonus. */
    atk?: number;
    /** Defense bonus. */
    def?: number;
    /** HP bonus. */
    hp?: number;
  };
  /** Tool metadata for gathering tools. */
  tool?: ToolMetadata;
}

/** Item definition with RPG metadata (extends base ItemDefinitionWithUse). */
export type ItemDefinitionWithRpg = ItemDefinitionWithUse & RpgItemMetadata;

/** Check if an item can be equipped to a specific slot. */
export function canEquipToSlot(itemId: ItemId, slot: RpgEquipmentSlot): boolean {
  const item = getItemDefinition(itemId);
  if (!item) return false;

  const rpgItem = item as ItemDefinitionWithRpg;

  // If item has explicit slot, check exact match
  if (rpgItem.rpgSlot) {
    return rpgItem.rpgSlot === slot;
  }

  // Fallback: infer from item ID naming conventions
  return inferSlotFromId(itemId) === slot;
}

/** Get the equipment slot for an item. */
export function getItemSlot(itemId: ItemId): RpgEquipmentSlot | null {
  const item = getItemDefinition(itemId);
  if (!item) return null;

  const rpgItem = item as ItemDefinitionWithRpg;

  // Return explicit slot if defined
  if (rpgItem.rpgSlot) {
    return rpgItem.rpgSlot;
  }

  // Otherwise infer from ID
  return inferSlotFromId(itemId);
}

/** Infer slot from item ID using naming conventions. */
function inferSlotFromId(itemId: string): RpgEquipmentSlot | null {
  const id = itemId.toLowerCase();

  // Weapon patterns
  if (
    /sword|dagger|knife|blade|axe|bow|staff|wand|mace|spear|hammer/.test(
      id,
    ) &&
    !/pickaxe/.test(id)
  ) {
    return "weapon";
  }

  // Shield patterns
  if (/shield|buckler|targe/.test(id)) {
    return "shield";
  }

  // Helmet patterns
  if (/helmet|helm|hood|crown|hat|cap/.test(id)) {
    return "helmet";
  }

  // Chest patterns
  if (/armor|chest|vest|robe|tunic|plate|chainmail|breastplate/.test(id)) {
    return "chest";
  }

  // Pants patterns
  if (/pants|leggings|greaves|legguards|trousers/.test(id)) {
    return "pants";
  }

  // Boots patterns
  if (/boots|shoes|greaves|sandals/.test(id)) {
    return "boots";
  }

  // Ring patterns
  if (/ring|band/.test(id)) {
    return "ring";
  }

  // Necklace patterns
  if (/necklace|amulet|pendant|charm/.test(id)) {
    return "necklace";
  }

  // Tool patterns
  if (/pickaxe|mining/.test(id) || /axe/.test(id) || /hatchet/.test(id)) {
    return "tool";
  }

  return null;
}

/** Get RPG stats for an item. */
export function getItemStats(itemId: ItemId): { atk: number; def: number; hp: number } {
  const item = getItemDefinition(itemId);
  if (!item) return { atk: 0, def: 0, hp: 0 };

  const rpgItem = item as ItemDefinitionWithRpg;
  return {
    atk: rpgItem.stats?.atk ?? 0,
    def: rpgItem.stats?.def ?? 0,
    hp: rpgItem.stats?.hp ?? 0,
  };
}

/** Check if item is a tool. */
export function isTool(itemId: ItemId): boolean {
  const item = getItemDefinition(itemId);
  if (!item) return false;

  const rpgItem = item as ItemDefinitionWithRpg;

  // Explicit tool slot
  if (rpgItem.rpgSlot === "tool") return true;

  // Has tool metadata
  if (rpgItem.tool) return true;

  // Infer from ID
  const slot = inferSlotFromId(itemId);
  return slot === "tool";
}

/** Get tool metadata for an item. */
export function getToolMetadata(itemId: ItemId): ToolMetadata | null {
  const item = getItemDefinition(itemId);
  if (!item) return null;

  const rpgItem = item as ItemDefinitionWithRpg;

  // Return explicit tool metadata if defined
  if (rpgItem.tool) {
    return rpgItem.tool;
  }

  // Otherwise infer from ID
  return inferToolFromId(itemId);
}

/** Infer tool metadata from item ID. */
function inferToolFromId(itemId: string): ToolMetadata | null {
  const id = itemId.toLowerCase();

  // Check if it's a tool
  const isPickaxe = /pickaxe/.test(id);
  const isAxe = /axe|hatchet/.test(id) && !/pickaxe/.test(id);

  if (!isPickaxe && !isAxe) return null;

  // Extract tier from ID patterns like: pickaxe_lv2, pickaxe_3, pickaxeLv4
  let tier: ToolTier = 1;
  const tierMatch = id.match(/(?:lv|level|_|-)?(\d)(?:$|[^0-9])/);
  if (tierMatch) {
    const parsed = parseInt(tierMatch[1], 10);
    if (parsed >= 1 && parsed <= 4) {
      tier = parsed as ToolTier;
    }
  }

  // Default durability by tier
  const durabilityByTier: Record<ToolTier, number> = {
    1: 10,
    2: 25,
    3: 50,
    4: 70,
  };

  return {
    toolKind: isPickaxe ? "pickaxe" : "axe",
    tier,
    maxDurability: durabilityByTier[tier],
  };
}

/** Validate that item ID is safe for use as MongoDB key. */
export function isSafeItemId(itemId: string): boolean {
  // Pattern: alphanumeric, hyphen, underscore only
  const SAFE_ITEM_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

  // Dangerous characters in MongoDB field paths
  const DANGEROUS_CHARS = [".", "$"];

  for (const char of DANGEROUS_CHARS) {
    if (itemId.includes(char)) return false;
  }

  return SAFE_ITEM_ID_PATTERN.test(itemId);
}

/** Get all items that can be equipped to a specific slot.
 *  Note: Use findItemsBySlot from items.ts for actual implementation.
 */
export function getItemsBySlot(_slot: RpgEquipmentSlot): ItemDefinitionWithRpg[] {
  // This would need to scan ITEM_DEFINITIONS
  // For now, return empty array - can be implemented with import if needed
  return [];
}

/** Default durability values for tool tiers. */
export const DEFAULT_TOOL_DURABILITY: Record<ToolTier, number> = {
  1: 10,
  2: 25,
  3: 50,
  4: 70,
};

/** Validate tool tier. */
export function isValidToolTier(tier: number): tier is ToolTier {
  return tier >= 1 && tier <= 4 && Number.isInteger(tier);
}

/** Get max durability for a tool tier. */
export function getToolDurabilityForTier(tier: ToolTier): number {
  return DEFAULT_TOOL_DURABILITY[tier];
}
