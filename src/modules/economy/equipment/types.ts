/**
 * Equipment system types.
 *
 * Purpose: Define equipment slots, equipped items, and equipment stats.
 */

import type { ItemId } from "@/modules/inventory/definitions";
import type { GuildId, UserId } from "@/db/types";

/** Equipment slot types. */
export type EquipmentSlot =
  | "head"
  | "chest"
  | "legs"
  | "weapon"
  | "offhand"
  | "accessory1"
  | "accessory2";

export const EQUIPMENT_SLOTS: EquipmentSlot[] = [
  "head",
  "chest",
  "legs",
  "weapon",
  "offhand",
  "accessory1",
  "accessory2",
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
  | "CONFLICT";

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
