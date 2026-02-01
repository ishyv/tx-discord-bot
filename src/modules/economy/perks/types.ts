/**
 * Perk system domain types.
 *
 * Purpose: define perk definitions, effects, and views.
 */

import type { CurrencyId } from "../currency";
import type { GuildId, UserId } from "@/db/types";

export type PerkId = string;

export type PerkEffectType =
  | "weight_cap"
  | "slot_cap"
  | "work_bonus_pct"
  | "daily_bonus_cap";

export interface PerkEffect {
  readonly type: PerkEffectType;
  /** Effect value per level (additive). */
  readonly value: number;
}

export interface PerkCost {
  readonly currencyId: CurrencyId;
  readonly amount: number;
  /** Optional minimum progression level required. */
  readonly minLevel?: number;
}

export interface PerkDefinition {
  readonly id: PerkId;
  readonly name: string;
  readonly description: string;
  readonly maxLevel: number;
  /** Effects applied per level (additive). */
  readonly effects: PerkEffect[];
  /** Cost curve for the next level (1-based). */
  readonly cost: (nextLevel: number) => PerkCost;
}

export interface PerkState {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly levels: Record<PerkId, number>;
  readonly updatedAt: Date;
}

export interface PerkView {
  readonly id: PerkId;
  readonly name: string;
  readonly description: string;
  readonly level: number;
  readonly maxLevel: number;
  readonly effects: PerkEffect[];
  readonly nextCost: PerkCost | null;
}

export interface PerkEffectsSummary {
  weightCapBonus: number;
  slotCapBonus: number;
  workBonusPct: number;
  dailyBonusCap: number;
}

export interface PerkPurchaseInput {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly perkId: PerkId;
}

export interface PerkPurchaseResult {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly perkId: PerkId;
  readonly beforeLevel: number;
  readonly afterLevel: number;
  readonly cost: PerkCost;
  readonly correlationId: string;
  readonly beforeCurrency: unknown;
  readonly afterCurrency: unknown;
  readonly timestamp: Date;
}

export type PerkErrorCode =
  | "PERK_NOT_FOUND"
  | "PERK_MAXED"
  | "INSUFFICIENT_FUNDS"
  | "LEVEL_REQUIRED"
  | "ACCOUNT_BLOCKED"
  | "ACCOUNT_BANNED"
  | "UPDATE_FAILED"
  | "CONFLICT"
  | "CONFIG_NOT_FOUND";

export class PerkError extends Error {
  constructor(
    public readonly code: PerkErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PerkError";
  }
}
