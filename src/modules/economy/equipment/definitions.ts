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
    name: "Casco de Cuero",
    description: "Un casco básico de cuero. Proporciona poca protección.",
    emoji: "🪖",
    slot: "head",
    stats: { luck: 1, weightCap: 5 },
  },
  {
    id: "casco_hierro",
    name: "Casco de Hierro",
    description: "Un casco de hierro resistente.",
    emoji: "⛑️",
    slot: "head",
    stats: { luck: 2, workBonusPct: 0.02, weightCap: 10 },
    requiredLevel: 3,
  },
  {
    id: "corona_oro",
    name: "Corona Dorada",
    description: "Una corona que simboliza riqueza.",
    emoji: "👑",
    slot: "head",
    stats: { luck: 5, shopDiscountPct: 0.05, dailyBonusCap: 1 },
    requiredLevel: 5,
  },

  // Chest items
  {
    id: "camisa_tela",
    name: "Camisa de Tela",
    description: "Ropa común y corriente.",
    emoji: "👕",
    slot: "chest",
    stats: { weightCap: 5, slotCap: 1 },
  },
  {
    id: "armadura_cuero",
    name: "Armadura de Cuero",
    description: "Armadura ligera de cuero.",
    emoji: "🦺",
    slot: "chest",
    stats: { weightCap: 15, slotCap: 2, workBonusPct: 0.02 },
    requiredLevel: 2,
  },
  {
    id: "armadura_hierro",
    name: "Armadura de Hierro",
    description: "Armadura resistente de hierro.",
    emoji: "🛡️",
    slot: "chest",
    stats: { weightCap: 25, slotCap: 3, workBonusPct: 0.05 },
    requiredLevel: 4,
  },

  // Legs items
  {
    id: "pantalones_tela",
    name: "Pantalones de Tela",
    description: "Pantalones comunes.",
    emoji: "👖",
    slot: "legs",
    stats: { weightCap: 5 },
  },
  {
    id: "grebas_hierro",
    name: "Grebas de Hierro",
    description: "Protección para las piernas.",
    emoji: "🦵",
    slot: "legs",
    stats: { weightCap: 15, luck: 1 },
    requiredLevel: 3,
  },

  // Weapon items
  {
    id: "espada_hierro",
    name: "Espada de Hierro",
    description: "Una espada básica pero confiable.",
    emoji: "⚔️",
    slot: "weapon",
    stats: { workBonusPct: 0.03, luck: 1 },
  },
  {
    id: "espada_acero",
    name: "Espada de Acero",
    description: "Una espada forjada en acero.",
    emoji: "🗡️",
    slot: "weapon",
    stats: { workBonusPct: 0.07, luck: 2 },
    requiredLevel: 4,
  },
  {
    id: "hacha_guerra",
    name: "Hacha de Guerra",
    description: "Un hacha pesada para trabajos duros.",
    emoji: "🪓",
    slot: "weapon",
    stats: { workBonusPct: 0.1, weightCap: 10 },
    requiredLevel: 5,
  },

  // Offhand items
  {
    id: "escudo_madera",
    name: "Escudo de Madera",
    description: "Un escudo básico de madera.",
    emoji: "🛡️",
    slot: "offhand",
    stats: { luck: 1, weightCap: 10 },
  },
  {
    id: "escudo_hierro",
    name: "Escudo de Hierro",
    description: "Un escudo resistente.",
    emoji: "🔰",
    slot: "offhand",
    stats: { luck: 2, weightCap: 15, shopDiscountPct: 0.03 },
    requiredLevel: 3,
  },
  {
    id: "linterna",
    name: "Linterna Mágica",
    description: "Ilumina tu camino y trae suerte.",
    emoji: "🏮",
    slot: "offhand",
    stats: { luck: 3, workBonusPct: 0.02 },
    requiredLevel: 4,
  },

  // Accessory items (accessory1 and accessory2 share pool)
  {
    id: "anillo_oro",
    name: "Anillo de Oro",
    description: "Un anillo que atrae riqueza.",
    emoji: "💍",
    slot: "accessory1", // Can also go in accessory2
    stats: { shopDiscountPct: 0.03, luck: 1 },
  },
  {
    id: "amuleto_suerte",
    name: "Amuleto de Suerte",
    description: "Aumenta tu suerte en todo.",
    emoji: "📿",
    slot: "accessory1",
    stats: { luck: 3, dailyBonusCap: 1 },
    requiredLevel: 2,
  },
  {
    id: "cinturon_carga",
    name: "Cinturón de Carga",
    description: "Aumenta tu capacidad de carga.",
    emoji: "🎒",
    slot: "accessory1",
    stats: { weightCap: 20, slotCap: 2 },
    requiredLevel: 3,
  },
  {
    id: "pulsera_trabajo",
    name: "Pulsera del Trabajador",
    description: "Aumenta tu eficiencia laboral.",
    emoji: "⌚",
    slot: "accessory2",
    stats: { workBonusPct: 0.05 },
    requiredLevel: 4,
  },
  {
    id: "collar_riqueza",
    name: "Collar de Riqueza",
    description: "Atrae riqueza y oportunidades.",
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
  head: "👤 Cabeza",
  chest: "👕 Pecho",
  legs: "👖 Piernas",
  weapon: "⚔️ Arma",
  offhand: "🛡️ Mano izquierda",
  accessory1: "💍 Accesorio 1",
  accessory2: "📿 Accesorio 2",
};

/** Get display name for a slot. */
export function getSlotDisplayName(slot: string): string {
  return SLOT_DISPLAY_NAMES[slot] ?? slot;
}
