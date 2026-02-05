/**
 * Equipment Service Types.
 *
 * Purpose: Type definitions for equipment operations.
 * Context: Used by equipment service for equip/unequip.
 */

import type { Result } from "@/utils/result";
import type { UserId } from "@/db/types";
import type { EquipmentSlot } from "@/db/schemas/rpg-profile";

/** Equipment operation type. */
export type EquipmentOperationType = "equip" | "unequip";

/** RPG Equipment Service interface. */
export interface RpgEquipmentService {
  /**
   * Equip an item from inventory to a slot.
   * If slot occupied, auto-unequips existing item (if inventory allows).
   */
  equip(input: EquipmentOperationInput): Promise<Result<EquipmentChangeResult, Error>>;

  /**
   * Unequip an item from a slot and return to inventory.
   * Fails if inventory capacity would be exceeded.
   */
  unequip(
    userId: UserId,
    actorId: UserId,
    slot: EquipmentSlot,
    guildId?: string,
    correlationId?: string,
  ): Promise<Result<EquipmentChangeResult, Error>>;

  /**
   * Unequip all items.
   * Stops on first failure (partial unequip possible).
   */
  unequipAll(
    userId: UserId,
    actorId: UserId,
    guildId?: string,
  ): Promise<Result<EquipmentChangeResult[], Error>>;
}

/** Equipment operation input. */
export interface EquipmentOperationInput {
  /** User ID. */
  userId: UserId;
  /** Guild ID (for audit). */
  guildId?: string;
  /** Equipment slot. */
  slot: EquipmentSlot;
  /** Item ID to equip (null to unequip). */
  itemId: string | null;
  /** Specific instance ID to equip (required for instance-based items). */
  instanceId?: string;
  /** Actor ID (for audit). */
  actorId: UserId;
  /** Optional reason for audit. */
  reason?: string;
  /** Correlation ID for audit trail. */
  correlationId?: string;
}

/** Equipment validation result. */
export interface EquipmentValidationResult {
  /** Whether the operation is valid. */
  valid: boolean;
  /** Error code if invalid. */
  error?: string;
  /** Error message if invalid. */
  message?: string;
}

/** Equipment change result. */
export interface EquipmentChangeResult {
  /** User ID. */
  userId: UserId;
  /** Slot affected. */
  slot: EquipmentSlot;
  /** Operation performed. */
  operation: EquipmentOperationType;
  /** Previous item ID (if any). */
  previousItemId: string | null;
  /** New item ID (if any). */
  newItemId: string | null;
  /** ID of the equipped instance. */
  equippedInstanceId?: string;
  /** Recalculated stats after operation. */
  stats: {
    atk: number;
    def: number;
    maxHp: number;
  };
  /** Current HP (may be adjusted if maxHp changed). */
  currentHp: number;
  /** Audit correlation ID. */
  correlationId: string;
  /** Timestamp. */
  timestamp: Date;
}

/** Item properties for RPG. */
export interface RpgItemProperties {
  /** Attack bonus. */
  atk?: number;
  /** Defense bonus. */
  def?: number;
  /** HP bonus. */
  hp?: number;
  /** Equipment slot (if equippable). */
  slot?: EquipmentSlot;
}
