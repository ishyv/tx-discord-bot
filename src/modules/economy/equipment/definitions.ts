/**
 * Equipment item definitions.
 *
 * Purpose: Registry of equipable items with their slots and stats.
 */

import type { EquipableItemDefinition } from "./types";

export const EQUIPABLE_ITEM_DEFINITIONS: EquipableItemDefinition[] = [
  // Head items
  {
    id: "casco_cuero",
    name: "Leather Helmet",
    description: "A basic leather helmet. Provides low protection.",
    emoji: "🪖",
    slot: "head",
    stats: { luck: 1, weightCap: 5 },
  },
  {
    id: "casco_hierro",
    name: "Iron Helmet",
    description: "A durable iron helmet.",
    emoji: "⛑️",
    slot: "head",
    stats: { luck: 2, workBonusPct: 0.02, weightCap: 10 },
    requiredLevel: 3,
  },
  {
    id: "corona_oro",
    name: "Golden Crown",
    description: "A crown that symbolizes wealth.",
    emoji: "👑",
    slot: "head",
    stats: { luck: 5, shopDiscountPct: 0.05, dailyBonusCap: 1 },
    requiredLevel: 5,
  },

  // Chest items
  {
    id: "camisa_tela",
    name: "Cloth Shirt",
    description: "Ordinary clothing.",
    emoji: "👕",
    slot: "chest",
    stats: { weightCap: 5, slotCap: 1 },
  },
  {
    id: "armadura_cuero",
    name: "Leather Armor",
    description: "Light leather armor.",
    emoji: "🦺",
    slot: "chest",
    stats: { weightCap: 15, slotCap: 2, workBonusPct: 0.02 },
    requiredLevel: 2,
  },
  {
    id: "armadura_hierro",
    name: "Iron Armor",
    description: "Sturdy iron armor.",
    emoji: "🛡️",
    slot: "chest",
    stats: { weightCap: 25, slotCap: 3, workBonusPct: 0.05 },
    requiredLevel: 4,
  },

  // Legs items
  {
    id: "pantalones_tela",
    name: "Cloth Pants",
    description: "Common pants.",
    emoji: "👖",
    slot: "legs",
    stats: { weightCap: 5 },
  },
  {
    id: "grebas_hierro",
    name: "Iron Greaves",
    description: "Leg protection.",
    emoji: "🦵",
    slot: "legs",
    stats: { weightCap: 15, luck: 1 },
    requiredLevel: 3,
  },

  // Weapon items
  {
    id: "espada_hierro",
    name: "Iron Sword",
    description: "A basic but reliable sword.",
    emoji: "⚔️",
    slot: "weapon",
    stats: { workBonusPct: 0.03, luck: 1 },
  },
  {
    id: "espada_acero",
    name: "Steel Sword",
    description: "A sword forged in steel.",
    emoji: "🗡️",
    slot: "weapon",
    stats: { workBonusPct: 0.07, luck: 2 },
    requiredLevel: 4,
  },
  {
    id: "hacha_guerra",
    name: "War Axe",
    description: "A heavy axe for hard work.",
    emoji: "🪓",
    slot: "weapon",
    stats: { workBonusPct: 0.1, weightCap: 10 },
    requiredLevel: 5,
  },

  // Offhand items
  {
    id: "escudo_madera",
    name: "Wooden Shield",
    description: "A basic wooden shield.",
    emoji: "🛡️",
    slot: "offhand",
    stats: { luck: 1, weightCap: 10 },
  },
  {
    id: "escudo_hierro",
    name: "Iron Shield",
    description: "A sturdy shield.",
    emoji: "🔰",
    slot: "offhand",
    stats: { luck: 2, weightCap: 15, shopDiscountPct: 0.03 },
    requiredLevel: 3,
  },
  {
    id: "linterna",
    name: "Magic Lantern",
    description: "Lights your path and brings luck.",
    emoji: "🏮",
    slot: "offhand",
    stats: { luck: 3, workBonusPct: 0.02 },
    requiredLevel: 4,
  },

  // Accessory items (accessory1 and accessory2 share pool)
  {
    id: "anillo_oro",
    name: "Gold Ring",
    description: "A ring that attracts wealth.",
    emoji: "💍",
    slot: "accessory1", // Can also go in accessory2
    stats: { shopDiscountPct: 0.03, luck: 1 },
  },
  {
    id: "amuleto_suerte",
    name: "Lucky Amulet",
    description: "Increases your luck in everything.",
    emoji: "📿",
    slot: "accessory1",
    stats: { luck: 3, dailyBonusCap: 1 },
    requiredLevel: 2,
  },
  {
    id: "cinturon_carga",
    name: "Load Belt",
    description: "Increases your carrying capacity.",
    emoji: "🎒",
    slot: "accessory1",
    stats: { weightCap: 20, slotCap: 2 },
    requiredLevel: 3,
  },
  {
    id: "pulsera_trabajo",
    name: "Worker Bracelet",
    description: "Increases your work efficiency.",
    emoji: "⌚",
    slot: "accessory2",
    stats: { workBonusPct: 0.05 },
    requiredLevel: 4,
  },
  {
    id: "collar_riqueza",
    name: "Wealth Necklace",
    description: "Attracts wealth and opportunities.",
    emoji: "📿",
    slot: "accessory2",
    stats: { shopDiscountPct: 0.05, workBonusPct: 0.03 },
    requiredLevel: 5,
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
  head: "👤 Head",
  chest: "👕 Chest",
  legs: "👖 Legs",
  weapon: "⚔️ Weapon",
  offhand: "🛡️ Offhand",
  accessory1: "💍 Accessory 1",
  accessory2: "📿 Accessory 2",
};

/** Get display name for a slot. */
export function getSlotDisplayName(slot: string): string {
  return SLOT_DISPLAY_NAMES[slot] ?? slot;
}


