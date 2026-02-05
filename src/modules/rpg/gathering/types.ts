/**
 * Gathering Types.
 *
 * Purpose: Type definitions for resource gathering.
 * Context: Mining and woodcutting operations.
 */

import type { UserId } from "@/db/types";

/** Gathering location definition. */
export interface GatheringLocation {
  /** Location ID. */
  id: string;
  /** Location name. */
  name: string;
  /** Location type. */
  type: "mine" | "forest";
  /** Required tool tier. */
  requiredTier: number;
  /** Materials that can be gathered here. */
  materials: string[];
}

/** Gathering operation input. */
export interface GatheringInput {
  /** User ID. */
  userId: UserId;
  /** Guild ID (for audit). */
  guildId?: string;
  /** Location ID. */
  locationId: string;
  /** Tool item ID being used. */
  toolId: string;
  /** Actor ID (for audit). */
  actorId: UserId;
  /** Correlation ID. */
  correlationId?: string;
}

/** Gathering result. */
export interface GatheringResult {
  /** User ID. */
  userId: UserId;
  /** Location ID. */
  locationId: string;
  /** Location tier. */
  tier: number;
  /** Tool used. */
  toolId: string;
  /** Materials gained. */
  materialsGained: Array<{ id: string; quantity: number }>;
  /** Tool durability after operation. */
  remainingDurability: number;
  /** Whether the tool broke. */
  toolBroken: boolean;
  /** Correlation ID. */
  correlationId: string;
  /** Timestamp. */
  timestamp: Date;
}

/** Tool tier info. */
export interface ToolTierInfo {
  /** Tier number (1-4). */
  tier: number;
  /** Maximum durability. */
  maxDurability: number;
}
