/**
 * Upgrade Types.
 *
 * Purpose: Type definitions for tool upgrades.
 * Context: Tier progression for tools.
 */

import type { UserId } from "@/db/types";

/** Upgrade operation input. */
export interface UpgradeInput {
  /** User ID. */
  userId: UserId;
  /** Guild ID (for audit). */
  guildId?: string;
  /** Tool item ID to upgrade. */
  toolId: string;
  /** Specific instance ID to upgrade (optional). */
  instanceId?: string;
  /** Actor ID. */
  actorId: UserId;
  /** Correlation ID. */
  correlationId?: string;
}

/** Upgrade result. */
export interface UpgradeResult {
  /** User ID. */
  userId: UserId;
  /** Original tool ID. */
  originalToolId: string;
  /** New tool ID. */
  newToolId: string;
  /** New tool tier. */
  newTier: number;
  /** Money spent. */
  moneySpent: number;
  /** Materials consumed. */
  materialsConsumed: Array<{ id: string; quantity: number }>;
  /** Correlation ID. */
  correlationId: string;
  /** Timestamp. */
  timestamp: Date;
}

/** Upgrade requirement. */
export interface UpgradeRequirement {
  /** Target tier. */
  tier: number;
  /** Money cost. */
  money: number;
  /** Materials required. */
  materials: Array<{ id: string; qty: number }>;
}

/** Tool upgrade info. */
export interface UpgradeInfo {
  /** Whether upgrade is possible. */
  canUpgrade: boolean;
  /** Reason if cannot upgrade. */
  reason?: string;
  /** Next tier. */
  nextTier: number;
  /** Requirements. */
  requirements: UpgradeRequirement;
}
