/**
 * Store Rotation Types (Phase 9d).
 *
 * Purpose: Define types for store featured items, rotation schedules, and pricing modifiers.
 */

import type { ItemId } from "../types";
import type { GuildId } from "@/db/types";

/** Rotation mode for featured items. */
export type RotationMode = "manual" | "auto" | "disabled";

/** Featured item slot type. */
export type FeaturedSlotType = "daily" | "legendary";

/** Featured item with rotation metadata. */
export interface FeaturedItem {
  /** Item ID reference. */
  readonly itemId: ItemId;
  /** Slot type (daily or legendary). */
  readonly slotType: FeaturedSlotType;
  /** Position in rotation (for daily slots: 0-4). */
  readonly slotIndex: number;
  /** Featured price (after discount). */
  readonly featuredPrice: number;
  /** Original base price. */
  readonly originalPrice: number;
  /** Discount percentage applied (0-1). */
  readonly discountPct: number;
  /** Scarcity markup applied (0-1). */
  readonly scarcityMarkupPct: number;
  /** Limited stock for featured item (-1 for unlimited). */
  readonly featuredStock: number;
  /** When this item was featured. */
  readonly featuredAt: Date;
  /** When this rotation expires. */
  readonly expiresAt: Date;
  /** Total purchased during this rotation. */
  readonly purchaseCount: number;
}

/** Store rotation configuration. */
export interface StoreRotationConfig {
  /** Rotation mode. */
  readonly mode: RotationMode;
  /** Number of daily featured items (default: 5). */
  readonly dailyFeaturedCount: number;
  /** Whether to have a weekly legendary slot. */
  readonly hasLegendarySlot: boolean;
  /** Discount percentage for featured items (0-1). */
  readonly featuredDiscountPct: number;
  /** Scarcity markup when stock is low (0-1). */
  readonly scarcityMarkupPct: number;
  /** Stock threshold for scarcity markup (if stock < this, apply markup). */
  readonly scarcityThreshold: number;
  /** Rotation time in hours (default: 24). */
  readonly rotationHours: number;
  /** Whether rotation happens on first access or at fixed time. */
  readonly rotationOnAccess: boolean;
  /** Fixed rotation time (if not onAccess, in HH:mm format UTC). */
  readonly rotationTimeUtc?: string;
}

/** Store rotation state for a guild. */
export interface StoreRotation {
  readonly guildId: GuildId;
  /** Currently featured items. */
  readonly featured: FeaturedItem[];
  /** Last rotation timestamp. */
  readonly lastRotationAt: Date;
  /** Next scheduled rotation. */
  readonly nextRotationAt: Date;
  /** Rotation configuration. */
  readonly config: StoreRotationConfig;
  /** Rotation version for optimistic concurrency. */
  readonly version: number;
}

/** Input for rotating featured items. */
export interface RotateFeaturedInput {
  readonly guildId: GuildId;
  /** Force rotation even if not due. */
  readonly force?: boolean;
  /** Specific item IDs to feature (optional, for manual mode). */
  readonly manualSelection?: ItemId[];
}

/** Result of a rotation operation. */
export interface RotationResult {
  readonly success: boolean;
  readonly previousFeatured: FeaturedItem[];
  readonly newFeatured: FeaturedItem[];
  readonly rotatedAt: Date;
  readonly nextRotationAt: Date;
  readonly wasDue: boolean;
}

/** Featured item purchase metadata for audit. */
export interface FeaturedPurchaseMetadata {
  readonly isFeatured: boolean;
  readonly slotType: FeaturedSlotType;
  readonly originalPrice: number;
  readonly featuredDiscountPct: number;
  readonly scarcityMarkupPct: number;
  readonly finalPrice: number;
}

/** Default rotation configuration. */
export const DEFAULT_ROTATION_CONFIG: StoreRotationConfig = {
  mode: "auto",
  dailyFeaturedCount: 5,
  hasLegendarySlot: true,
  featuredDiscountPct: 0.15, // 15% discount
  scarcityMarkupPct: 0.25, // 25% markup when scarce
  scarcityThreshold: 10,
  rotationHours: 24,
  rotationOnAccess: true,
};

/** Calculate featured price with modifiers. */
export function calculateFeaturedPrice(
  basePrice: number,
  discountPct: number,
  scarcityMarkupPct: number,
  stock: number,
  scarcityThreshold: number,
): { price: number; appliedScarcity: number } {
  // Start with base price
  let price = basePrice;

  // Apply discount
  price = price * (1 - discountPct);

  // Apply scarcity markup if stock is low (and stock is limited)
  let appliedScarcity = 0;
  if (stock >= 0 && stock < scarcityThreshold) {
    appliedScarcity = scarcityMarkupPct;
    price = price * (1 + scarcityMarkupPct);
  }

  // Round to nearest integer, minimum 1
  return {
    price: Math.max(1, Math.round(price)),
    appliedScarcity,
  };
}

/** Check if rotation is due. */
export function isRotationDue(
  nextRotationAt: Date,
  mode: RotationMode,
): boolean {
  if (mode === "disabled") return false;
  return new Date() >= nextRotationAt;
}

/** Build default rotation state. */
export function buildDefaultRotation(guildId: GuildId): StoreRotation {
  const now = new Date();
  return {
    guildId,
    featured: [],
    lastRotationAt: now,
    nextRotationAt: now, // Immediate rotation on first access
    config: DEFAULT_ROTATION_CONFIG,
    version: 0,
  };
}
