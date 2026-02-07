/**
 * Boons & Trinkets Definitions.
 *
 * Purpose: Registry of equippable trinkets, rings, and necklaces that provide boons.
 * These are NOT armor/weapons - they are magical items that grant economic bonuses.
 *
 * RARITY SYSTEM:
 * - Common (🟢): Level 1-3
 * - Uncommon (🔵): Level 4-5
 * - Rare (🟣): Level 6-7
 * - Holy (🟡): Level 8-10
 * - Unique (🔴): Special quest-gated items (not yet implemented)
 *
 * SLOT EXPANSION:
 * - Dimemorphin Belt: Infinite slot expansion (Holy tier, very rare)
 * - Timepiece: +2 slots (Rare tier)
 * - Crystal Orb: +1 slot (Uncommon tier)
 * - Bottomless Pouch: +1 slot (Common tier, moved to Belt slot)
 */

import type { EquipableItemDefinition } from "./types";

export const EQUIPABLE_ITEM_DEFINITIONS: EquipableItemDefinition[] = [
  // ==========================================
  // PRIMARY TRINKET - Main magical item
  // ==========================================
  {
    id: "lucky_charm",
    name: "Lucky Charm",
    description: "A small charm that brings fortune to its bearer.",
    emoji: "🍀",
    slot: "trinket1",
    stats: { luck: 2, workBonusPct: 0.02 },
    requiredLevel: 1,
  },
  {
    id: "merchants_seal",
    name: "Merchant's Seal",
    description: "A seal that marks you as a trusted trader.",
    emoji: "📜",
    slot: "trinket1",
    stats: { shopDiscountPct: 0.05, workBonusPct: 0.03 },
    requiredLevel: 4,
  },
  {
    id: "golden_compass",
    name: "Golden Compass",
    description: "Always points toward opportunity.",
    emoji: "🧭",
    slot: "trinket1",
    stats: { luck: 3, dailyBonusCap: 1, workBonusPct: 0.04 },
    requiredLevel: 6,
  },

  // ==========================================
  // SECONDARY TRINKET - Supporting magical item
  // ==========================================
  {
    id: "crystal_orb",
    name: "Crystal Orb",
    description: "Glimpses of the future help you work smarter.",
    emoji: "🔮",
    slot: "trinket2",
    stats: { workBonusPct: 0.04, luck: 1, slotCap: 1 },
    requiredLevel: 4,
    canEquipInBonusSlot: false, // Slot-expanding item
  },
  {
    id: "timepiece",
    name: "Chronos Timepiece",
    description: "Time flows differently for the bearer.",
    emoji: "⏳",
    slot: "trinket2",
    stats: { workBonusPct: 0.06, dailyBonusCap: 2, slotCap: 2 },
    requiredLevel: 6,
    canEquipInBonusSlot: false, // Slot-expanding item
  },

  // ==========================================
  // RING 1 - Left hand magical ring
  // ==========================================
  {
    id: "novices_band",
    name: "Novice's Band",
    description: "A simple ring given to those beginning their journey.",
    emoji: "💍",
    slot: "ring1",
    stats: { luck: 1 },
    requiredLevel: 1,
  },
  {
    id: "silver_ring_commerce",
    name: "Silver Ring of Commerce",
    description: "Traders respect the silver ring.",
    emoji: "💍",
    slot: "ring1",
    stats: { shopDiscountPct: 0.04, luck: 1 },
    requiredLevel: 5,
  },
  {
    id: "golden_ring_wealth",
    name: "Golden Ring of Wealth",
    description: "Attracts coins like a magnet.",
    emoji: "💍",
    slot: "ring1",
    stats: { shopDiscountPct: 0.06, workBonusPct: 0.03, luck: 2 },
    requiredLevel: 7,
  },

  // ==========================================
  // RING 2 - Right hand magical ring
  // ==========================================
  {
    id: "band_steady_hand",
    name: "Band of the Steady Hand",
    description: "A sturdy band for steady workers.",
    emoji: "⭕",
    slot: "ring2",
    stats: { workBonusPct: 0.03 },
    requiredLevel: 1,
  },
  {
    id: "whispering_band",
    name: "Whispering Band",
    description: "Hums with barely audible magical energy.",
    emoji: "✨",
    slot: "ring2",
    stats: { luck: 2, weightCap: 10 },
    requiredLevel: 5,
  },
  {
    id: "platinum_band_mastery",
    name: "Platinum Band of Mastery",
    description: "Worn by master merchants.",
    emoji: "🔘",
    slot: "ring2",
    stats: { workBonusPct: 0.05, shopDiscountPct: 0.04, dailyBonusCap: 1 },
    requiredLevel: 7,
  },

  // ==========================================
  // NECKLACE - Amulets and pendants
  // ==========================================
  {
    id: "cord_burden",
    name: "Cord of Burden",
    description: "A simple cord that somehow lightens your load.",
    emoji: "📿",
    slot: "necklace",
    stats: { weightCap: 5 },
    requiredLevel: 1,
  },
  {
    id: "lucky_amulet",
    name: "Lucky Amulet",
    description: "Brings fortune to the wearer.",
    emoji: "🎐",
    slot: "necklace",
    stats: { luck: 3, dailyBonusCap: 1 },
    requiredLevel: 4,
  },
  {
    id: "merchants_pendant",
    name: "Merchant's Pendant",
    description: "Sign of a prosperous trader.",
    emoji: "🔮",
    slot: "necklace",
    stats: { shopDiscountPct: 0.05, workBonusPct: 0.02, luck: 1 },
    requiredLevel: 6,
  },
  {
    id: "crown_jewel",
    name: "Crown Jewel",
    description: "Only the wealthiest can afford such a piece.",
    emoji: "👑",
    slot: "necklace",
    stats: { luck: 4, shopDiscountPct: 0.08, workBonusPct: 0.05, dailyBonusCap: 2 },
    requiredLevel: 8,
  },

  // ==========================================
  // BELT - Storage and utility (renamed from Belt to Sash/Girdle theme)
  // ==========================================
  {
    id: "sash_wanderer",
    name: "Sash of the Wanderer",
    description: "Worn by those who travel far and wide.",
    emoji: "🎗️",
    slot: "belt",
    stats: { weightCap: 15 },
    requiredLevel: 1,
  },
  {
    id: "bottomless_pouch",
    name: "Bottomless Pouch",
    description: "Holds more than it should. Moved from trinket slot to belt.",
    emoji: "👝",
    slot: "belt",
    stats: { weightCap: 10, slotCap: 1 },
    requiredLevel: 2,
    canEquipInBonusSlot: false, // Slot-expanding item
  },
  {
    id: "artisans_sash",
    name: "Artisan's Sash",
    description: "Everything you need at your fingertips.",
    emoji: "🛠️",
    slot: "belt",
    stats: { weightCap: 20, workBonusPct: 0.04 },
    requiredLevel: 5,
  },
  {
    id: "dimemorphin_belt",
    name: "Dimemorphin Belt",
    description: "A legendary belt that bends space itself. Grants infinite slot expansion to those worthy enough to wear it.",
    emoji: "⚜️",
    slot: "belt",
    stats: { slotCap: 999 }, // Infinite expansion represented by large number
    requiredLevel: 10,
    canEquipInBonusSlot: true, // Can be equipped in bonus slots (special exception)
  },
];

/** Map for O(1) lookup by item ID. */
const EQUIPABLE_ITEM_MAP: Map<string, EquipableItemDefinition> = new Map(
  EQUIPABLE_ITEM_DEFINITIONS.map((item) => [item.id, item]),
);

/** Check if an item is equipable. */
export function isEquipableItem(itemId: string): boolean {
  return EQUIPABLE_ITEM_MAP.has(itemId);
}

/** Get equipable item definition. */
export function getEquipableItemDefinition(
  itemId: string,
): EquipableItemDefinition | null {
  return EQUIPABLE_ITEM_MAP.get(itemId) ?? null;
}

/** Get all equipable items for a slot. */
export function getEquipableItemsForSlot(
  slot: string,
): EquipableItemDefinition[] {
  return EQUIPABLE_ITEM_DEFINITIONS.filter((item) => item.slot === slot);
}

/** Get all equipable definitions (for admin/commands). */
export function listEquipableItemDefinitions(): EquipableItemDefinition[] {
  return EQUIPABLE_ITEM_DEFINITIONS.slice();
}

/** Slot display names for UI. */
export const SLOT_DISPLAY_NAMES: Record<string, string> = {
  trinket1: "🔮 Trinket (Primary)",
  trinket2: "✨ Trinket (Secondary)",
  ring1: "💍 Ring (Left)",
  ring2: "💍 Ring (Right)",
  necklace: "📿 Necklace",
  belt: "🎗️ Sash",
};

/** Get display name for a slot. */
export function getSlotDisplayName(slot: string): string {
  return SLOT_DISPLAY_NAMES[slot] ?? slot;
}

/**
 * Get items that provide slot expansion.
 * Used for validation logic.
 */
export function getSlotExpandingItems(): EquipableItemDefinition[] {
  return EQUIPABLE_ITEM_DEFINITIONS.filter(
    (item) => item.stats.slotCap && item.stats.slotCap > 0
  );
}

/**
 * Check if an item provides slot expansion.
 */
export function isSlotExpandingItem(itemId: string): boolean {
  const item = getEquipableItemDefinition(itemId);
  return item ? (item.stats.slotCap ?? 0) > 0 : false;
}

/**
 * Check if an item can be equipped in bonus slots.
 * Most items can, but slot-expanding items cannot (except Dimemorphin Belt).
 */
export function canEquipInBonusSlot(itemId: string): boolean {
  const item = getEquipableItemDefinition(itemId);
  if (!item) return false;
  
  // If explicitly set, use that value
  if (item.canEquipInBonusSlot !== undefined) {
    return item.canEquipInBonusSlot;
  }
  
  // Default: slot-expanding items cannot go in bonus slots
  return !isSlotExpandingItem(itemId);
}
