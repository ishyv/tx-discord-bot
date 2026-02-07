/**
 * Equipment system types.
 *
 * Purpose: Define equipment slots, equipped items, and equipment stats.
 */

import type { ItemId } from "@/modules/inventory/definitions";
import type { GuildId, UserId } from "@/db/types";

/** Equipment slot types for boons/trinkets. */
export type EquipmentSlot =
  | "trinket1"
  | "trinket2"
  | "ring1"
  | "ring2"
  | "necklace"
  | "belt";

export const EQUIPMENT_SLOTS: EquipmentSlot[] = [
  "trinket1",
  "trinket2",
  "ring1",
  "ring2",
  "necklace",
  "belt",
];

/** Equipment stats that can be provided by items. */
export interface EquipmentStats {
  /** Luck bonus (affects various RNG rolls). */
  readonly luck?: number;
  /** Work payout bonus percentage (0.05 = +5%). */
  readonly workBonusPct?: number;
  /** Shop discount percentage (0.10 = -10% cost). */
  readonly shopDiscountPct?: number;
  /** Daily streak bonus cap increase. */
  readonly dailyBonusCap?: number;
  /** Weight capacity bonus. */
  readonly weightCap?: number;
  /** Slot capacity bonus. */
  readonly slotCap?: number;
}

/** Item rarity tiers. */
export type ItemRarity = "common" | "uncommon" | "rare" | "holy" | "unique";

/** Rarity configuration with visual indicators. */
export const RARITY_CONFIG: Record<ItemRarity, {
  emoji: string;
  color: number;
  name: string;
}> = {
  common: { emoji: "🟢", color: 0x00FF00, name: "Common" },
  uncommon: { emoji: "🔵", color: 0x0000FF, name: "Uncommon" },
  rare: { emoji: "🟣", color: 0x800080, name: "Rare" },
  holy: { emoji: "🟡", color: 0xFFD700, name: "Holy" },
  unique: { emoji: "🔴", color: 0xFF0000, name: "Unique" },
};

/**
 * Determine rarity based on item level.
 * Level 1-3: Common
 * Level 4-5: Uncommon
 * Level 6-7: Rare
 * Level 8-9: Holy
 * Level 10: Holy (with possibility of Unique via special conditions)
 */
export function getRarityFromLevel(level: number): ItemRarity {
  if (level >= 8) return "holy";
  if (level >= 6) return "rare";
  if (level >= 4) return "uncommon";
  return "common";
}

/**
 * Get the next rarity tier for progression display.
 */
export function getNextRarity(current: ItemRarity): ItemRarity | null {
  const order: ItemRarity[] = ["common", "uncommon", "rare", "holy", "unique"];
  const index = order.indexOf(current);
  return order[index + 1] ?? null;
}

/** Extended item definition for equipable items. */
export interface EquipableItemDefinition {
  readonly id: ItemId;
  readonly name: string;
  readonly description: string;
  readonly emoji?: string;
  readonly slot: EquipmentSlot;
  readonly stats: EquipmentStats;
  /** Minimum progression level required to equip. */
  readonly requiredLevel?: number;
  /** Item rarity tier. Auto-derived from level if not specified. */
  readonly rarity?: ItemRarity;
  /**
   * Whether this item can be equipped in bonus slots.
   * Default: true for most items, false for slot-expanding items (except Dimemorphin Belt).
   */
  readonly canEquipInBonusSlot?: boolean;
}

/** An equipped item instance. */
export interface EquippedItem {
  readonly itemId: ItemId;
  readonly equippedAt: Date;
}

/** User's equipment loadout for a guild. */
export interface EquipmentLoadout {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly slots: Partial<Record<EquipmentSlot, EquippedItem>>;
  readonly updatedAt: Date;
}

/** View of equipped item with full details. */
export interface EquippedItemView {
  readonly slot: EquipmentSlot;
  readonly itemId: ItemId;
  readonly name: string;
  readonly emoji: string;
  readonly description: string;
  readonly stats: EquipmentStats;
  readonly equippedAt: Date;
}

/** Summary of all equipped stats. */
export interface EquipmentStatsSummary {
  luck: number;
  workBonusPct: number;
  shopDiscountPct: number;
  dailyBonusCap: number;
  weightCap: number;
  slotCap: number;
}

/** Input for equipping an item. */
export interface EquipItemInput {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly itemId: ItemId;
}

/** Input for unequipping a slot. */
export interface UnequipSlotInput {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly slot: EquipmentSlot;
}

/** Result of equip/unequip operations. */
export interface EquipmentOperationResult {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly slot: EquipmentSlot;
  readonly itemId: ItemId;
  readonly previousItemId?: ItemId;
  readonly operation: "equip" | "unequip" | "swap";
  readonly correlationId: string;
  readonly timestamp: Date;
}

/** View for listing equipable items. */
export interface EquipableItemView {
  readonly itemId: ItemId;
  readonly name: string;
  readonly emoji: string;
  readonly description: string;
  readonly slot: EquipmentSlot;
  readonly slotDisplay: string;
  readonly stats: EquipmentStats;
  readonly quantity: number;
  readonly requiredLevel?: number;
}

/** Error codes for equipment operations. */
export type EquipmentErrorCode =
  | "ITEM_NOT_FOUND"
  | "ITEM_NOT_EQUIPABLE"
  | "ITEM_NOT_IN_INVENTORY"
  | "SLOT_OCCUPIED"
  | "SLOT_EMPTY"
  | "LEVEL_REQUIRED"
  | "ACCOUNT_BLOCKED"
  | "ACCOUNT_BANNED"
  | "RATE_LIMITED"
  | "UPDATE_FAILED"
  | "CONFLICT"
  | "INVALID_SLOT";

export class EquipmentError extends Error {
  constructor(
    public readonly code: EquipmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EquipmentError";
  }
}

/** Rate limit tracking for equip spam prevention. */
export interface EquipRateLimit {
  readonly userId: UserId;
  readonly count: number;
  readonly windowStart: Date;
}
