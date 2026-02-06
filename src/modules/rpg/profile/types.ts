/**
 * RPG Profile domain types.
 *
 * Purpose: Define the core domain model for RPG profiles including
 * equipment loadout, combat stats, and state tracking.
 *
 * Encaje: Base types used by repository, service, and view layers.
 * Dependencies: None (pure types).
 * Invariants:
 * - Loadout always has exactly 8 slots (weapon/shield/helmet/chest/pants/boots/ring/necklace).
 * - hpCurrent is always >= 0.
 * - wins/losses are always >= 0.
 * - version is a non-negative integer for optimistic concurrency.
 */

import type { EquipmentSlot, Loadout, StarterKitType } from "@/db/schemas/rpg-profile";

export type { EquipmentSlot, Loadout, StarterKitType };

/** RPG Profile entity stored per user. */
export interface RpgProfile {
  readonly userId: string;
  readonly loadout: Loadout;
  readonly hpCurrent: number;
  readonly wins: number;
  readonly losses: number;
  readonly isFighting: boolean;
  readonly activeFightId: string | null;
  /** Starter kit path claimed (miner or lumber). */
  readonly starterKitType: StarterKitType | null;
  /** When starter kit was claimed. */
  readonly starterKitClaimedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

/** Result of ensuring a profile exists. */
export interface ProfileEnsureResult {
  /** The profile. */
  readonly profile: RpgProfile;
  /** Whether this is a newly created profile. */
  readonly isNew: boolean;
}

/** Error codes for RPG operations. */
export type RpgErrorCode =
  | "PROFILE_NOT_FOUND"
  | "ACCOUNT_BLOCKED"
  | "ACCOUNT_BANNED"
  | "IN_COMBAT"
  | "NOT_IN_COMBAT"
  | "ITEM_NOT_IN_INVENTORY"
  | "INVALID_EQUIPMENT_SLOT"
  | "COMBAT_SESSION_EXPIRED"
  | "INSUFFICIENT_TOOL_TIER"
  | "TOOL_BROKEN"
  | "INSUFFICIENT_MATERIALS"
  | "INSUFFICIENT_FUNDS"
  | "ALREADY_OWNS_HIGHER_TIER"
  | "PROCESSING_FAILED"
  | "INVALID_UPGRADE"
  | "COMBAT_NOT_PENDING"
  | "COMBAT_ALREADY_ACCEPTED"
  | "SELF_COMBAT"
  | "LOCATION_NOT_FOUND"
  | "NO_TOOL_EQUIPPED"
  | "CONCURRENT_MODIFICATION"
  | "UPDATE_FAILED"
  | "MAX_TIER_REACHED"
  | "INSTANCE_NOT_FOUND";

/** Error class for RPG operations. */
export class RpgError extends Error {
  constructor(
    public readonly code: RpgErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RpgError";
  }
}

/** Input for equipping an item. */
export interface EquipInput {
  userId: string;
  slot: EquipmentSlot;
  itemId: string | null;
  guildId?: string;
  actorId: string;
  correlationId?: string;
  reason?: string;
}

/** Result of equip/unequip operation. */
export interface EquipResult {
  userId: string;
  slot: EquipmentSlot;
  previousItemId: string | null;
  newItemId: string | null;
  hpCurrent: number;
  correlationId: string;
  timestamp: Date;
}

/** Profile view for external display. */
export interface ProfileView {
  userId: string;
  loadout: Loadout;
  hpCurrent: number;
  maxHp: number;
  wins: number;
  losses: number;
  winRate: number;
  isFighting: boolean;
  activeFightId: string | null;
  totalFights: number;
}

/** Options for building profile view. */
export interface ProfileViewOptions {
  /** Calculate max HP from equipment (requires item resolver). */
  resolveItem?: (itemId: string) => { hp?: number } | null;
  /** Default max HP if no resolver provided. */
  defaultMaxHp?: number;
}
