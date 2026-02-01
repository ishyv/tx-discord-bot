/**
 * Economy Moderation Types (Phase 10c).
 *
 * Purpose: Types for economy moderation (freeze, unfreeze, peek).
 * Context: Used by moderation commands to manage user economy access.
 */

import type { UserId } from "@/db/types";
import type { AccountStatus } from "../account/types";
import type { EconomyAuditEntry } from "../audit/types";

/** Economy freeze record for timed blocks. */
export interface EconomyFreeze {
  /** MongoDB ID (same as userId). */
  readonly _id: UserId;
  readonly userId: UserId;
  readonly status: AccountStatus;
  readonly reason: string;
  readonly frozenAt: Date;
  readonly expiresAt: Date | null; // null = indefinite
  readonly frozenBy: string;
  readonly correlationId: string;
}

/** Input for freezing an economy account. */
export interface FreezeAccountInput {
  readonly userId: UserId;
  readonly hours: number | null; // null = indefinite
  readonly reason: string;
  readonly moderatorId: string;
  readonly guildId?: string;
}

/** Input for unfreezing an economy account. */
export interface UnfreezeAccountInput {
  readonly userId: UserId;
  readonly reason?: string;
  readonly moderatorId: string;
  readonly guildId?: string;
}

/** Result of freeze/unfreeze operation. */
export interface FreezeOperationResult {
  readonly success: boolean;
  readonly userId: UserId;
  readonly previousStatus: AccountStatus;
  readonly newStatus: AccountStatus;
  readonly expiresAt: Date | null;
  readonly correlationId: string;
  readonly timestamp: Date;
}

/** User peek data for moderation review. */
export interface EconomyPeekResult {
  readonly userId: UserId;
  readonly account: {
    status: AccountStatus;
    frozenUntil: Date | null;
    createdAt: Date;
    lastActivityAt: Date;
  };
  readonly balances: Record<string, unknown>;
  readonly recentAudit: EconomyAuditEntry[];
  readonly flags: {
    isOptedOut: boolean;
    hasActiveCooldowns: boolean;
    isFrozen: boolean;
    daysSinceActivity: number;
  };
}

/** Moderation action types for audit. */
export type ModerationActionType = "freeze" | "unfreeze" | "peek";

/** Audit query filters for moderation. */
export interface ModerationAuditQuery {
  readonly targetId?: UserId;
  readonly moderatorId?: string;
  readonly sinceDays?: number;
  readonly limit?: number;
  readonly correlationId?: string;
}

/** Check if account is currently frozen. */
export function isAccountFrozen(freeze: EconomyFreeze | null): boolean {
  if (!freeze) return false;
  if (freeze.expiresAt === null) return true;
  return new Date() < freeze.expiresAt;
}

/** Calculate remaining freeze time in hours. */
export function getRemainingFreezeHours(freeze: EconomyFreeze | null): number | null {
  if (!freeze || !isAccountFrozen(freeze)) return null;
  if (freeze.expiresAt === null) return null; // Indefinite
  
  const msRemaining = freeze.expiresAt.getTime() - Date.now();
  if (msRemaining <= 0) return 0;
  return Math.ceil(msRemaining / (60 * 60 * 1000));
}

/** Format freeze duration for display. */
export function formatFreezeDuration(hours: number | null): string {
  if (hours === null) return "indefinite";
  if (hours < 1) return "< 1 hour";
  if (hours === 1) return "1 hour";
  if (hours < 24) return `${hours} hours`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (remainingHours === 0) return `${days} day${days > 1 ? "s" : ""}`;
  return `${days}d ${remainingHours}h`;
}

/** Maximum freeze duration (30 days). */
export const MAX_FREEZE_HOURS = 30 * 24;

/** Default audit query limit. */
export const DEFAULT_AUDIT_LIMIT = 10;

/** Maximum audit query limit. */
export const MAX_AUDIT_LIMIT = 100;
