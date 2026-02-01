/**
 * Item Mutation Types.
 *
 * Purpose: Domain types for item adjustment operations.
 */

import type { ItemId } from "@/modules/inventory/definitions";
import type { CapacityStats as InventoryCapacityStats } from "@/modules/inventory/capacity";
import type { UserId } from "@/db/types";

/** Input for adjusting item quantity. */
export interface AdjustItemQuantityInput {
  /** User ID performing the adjustment (moderator). */
  readonly actorId: UserId;
  /** User ID receiving the adjustment. */
  readonly targetId: UserId;
  /** Guild ID where adjustment occurred. */
  readonly guildId?: string;
  /** Item being adjusted. */
  readonly itemId: ItemId;
  /** Quantity to adjust (positive or negative). */
  readonly delta: number;
  /** Optional reason. */
  readonly reason?: string;
  /** Whether to allow exceeding capacity limits (mod override). */
  readonly force?: boolean;
}

/** Result of item adjustment. */
export interface AdjustItemQuantityResult {
  readonly targetId: UserId;
  readonly itemId: ItemId;
  readonly delta: number;
  readonly beforeQuantity: number;
  readonly afterQuantity: number;
  readonly capacity: CapacityStats;
  readonly timestamp: Date;
}

/** Capacity statistics. */
export type CapacityStats = InventoryCapacityStats;

/** Error codes for item mutations. */
export type ItemMutationErrorCode =
  | "ITEM_NOT_FOUND"
  | "TARGET_NOT_FOUND"
  | "TARGET_BLOCKED"
  | "TARGET_BANNED"
  | "ACTOR_BLOCKED"
  | "INSUFFICIENT_PERMISSIONS"
  | "INVALID_QUANTITY"
  | "CAPACITY_EXCEEDED"
  | "UPDATE_FAILED";

/** Error class for item mutations. */
export class ItemMutationError extends Error {
  constructor(
    public readonly code: ItemMutationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ItemMutationError";
  }
}
