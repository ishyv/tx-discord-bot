/**
 * Progression domain types.
 *
 * Purpose: Define XP progression state and configuration.
 */

import type { GuildId, UserId } from "@/db/types";

export type ProgressionSourceOp =
  | "daily_claim"
  | "work_claim"
  | "store_buy"
  | "store_sell"
  | "quest_complete"
  | "craft";

export interface ProgressionState {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly totalXP: number;
  readonly level: number;
  readonly updatedAt: Date;
  readonly cooldowns: Partial<Record<ProgressionSourceOp, Date>>;
}

export interface ProgressionGrantInput {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly sourceOp: ProgressionSourceOp;
  readonly amount: number;
  readonly correlationId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ProgressionGrantResult {
  readonly beforeXP: number;
  readonly afterXP: number;
  readonly beforeLevel: number;
  readonly afterLevel: number;
  readonly leveledUp: boolean;
}

export interface ProgressionConfig {
  readonly enabled: boolean;
  readonly xpAmounts: Record<ProgressionSourceOp, number>;
  readonly cooldownSeconds: Record<ProgressionSourceOp, number>;
}

export type ProgressionConfigUpdate = Partial<
  Omit<ProgressionConfig, "xpAmounts" | "cooldownSeconds">
> & {
  readonly xpAmounts?: Partial<Record<ProgressionSourceOp, number>>;
  readonly cooldownSeconds?: Partial<Record<ProgressionSourceOp, number>>;
};

export interface ProgressionView {
  readonly level: number;
  readonly totalXP: number;
  readonly currentLevelXP: number;
  readonly nextLevelXP: number | null;
  readonly progressToNext: number;
  readonly progressPercent: number;
  readonly isMaxLevel: boolean;
}

export type ProgressionErrorCode =
  | "INVALID_AMOUNT"
  | "CONFIG_DISABLED"
  | "UPDATE_FAILED";

export class ProgressionError extends Error {
  constructor(
    public readonly code: ProgressionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProgressionError";
  }
}
