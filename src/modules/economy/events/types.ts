/**
 * Event Framework Types (Phase 9e).
 *
 * Purpose: Define event configuration, modifiers, and event currency rules.
 * Context: Guild-scoped events with optional duration and multipliers.
 */

import type { CurrencyId } from "../currency";

/** Event modifiers that affect various economy systems. */
export interface EventModifiers {
  /** XP multiplier for all XP gains (default: 1.0). */
  readonly xpMultiplier: number;
  /** Daily reward bonus percentage (0-1, default: 0). */
  readonly dailyRewardBonusPct: number;
  /** Work reward bonus percentage (0-1, default: 0). */
  readonly workRewardBonusPct: number;
  /** Trivia reward bonus percentage (0-1, default: 0). */
  readonly triviaRewardBonusPct: number;
  /** Store discount percentage (0-1, default: 0). */
  readonly storeDiscountPct: number;
  /** Quest reward bonus percentage (0-1, default: 0). */
  readonly questRewardBonusPct: number;
  /** Crafting cost reduction percentage (0-1, default: 0). */
  readonly craftingCostReductionPct: number;
}

/** Default event modifiers (no modifiers). */
export const DEFAULT_EVENT_MODIFIERS: EventModifiers = {
  xpMultiplier: 1.0,
  dailyRewardBonusPct: 0,
  workRewardBonusPct: 0,
  triviaRewardBonusPct: 0,
  storeDiscountPct: 0,
  questRewardBonusPct: 0,
  craftingCostReductionPct: 0,
};

/** Event currency configuration (optional). */
export interface EventCurrencyConfig {
  /** Currency ID for the event currency. */
  readonly currencyId: CurrencyId;
  /** Display name for the currency. */
  readonly name: string;
  /** Emoji for the currency. */
  readonly emoji: string;
  /** Earn rules for the event currency. */
  readonly earnRules: {
    /** Amount earned per daily claim. */
    readonly perDaily: number;
    /** Amount earned per work claim. */
    readonly perWork: number;
    /** Amount earned per trivia win. */
    readonly perTriviaWin: number;
    /** Amount earned per quest completion. */
    readonly perQuest: number;
    /** Amount earned per store purchase. */
    readonly perStorePurchase: number;
    /** Amount earned per vote cast. */
    readonly perVote: number;
  };
  /** Whether event currency can be traded for regular currency. */
  readonly canExchange: boolean;
  /** Exchange rate (event currency to regular). */
  readonly exchangeRate: number;
}

/** Event configuration for a guild. */
export interface EventConfig {
  /** Whether an event is currently active. */
  readonly enabled: boolean;
  /** Event name. */
  readonly name: string;
  /** Event description. */
  readonly description?: string;
  /** Event start timestamp (optional, immediate if not set). */
  readonly startsAt?: Date;
  /** Event end timestamp (optional, indefinite if not set). */
  readonly endsAt?: Date;
  /** Event modifiers. */
  readonly modifiers: EventModifiers;
  /** Optional event currency configuration. */
  readonly eventCurrency?: EventCurrencyConfig;
  /** Event started by user ID. */
  readonly startedBy?: string;
  /** Event started at timestamp. */
  readonly startedAt?: Date;
  /** Event stopped by user ID (if stopped). */
  readonly stoppedBy?: string;
  /** Event stopped at timestamp (if stopped). */
  readonly stoppedAt?: Date;
  /** Event version for optimistic concurrency. */
  readonly version: number;
}

/** Input for starting an event. */
export interface StartEventInput {
  /** Event name. */
  readonly name: string;
  /** Event description (optional). */
  readonly description?: string;
  /** Event duration in hours (optional, indefinite if not set). */
  readonly durationHours?: number;
  /** Event modifiers (partial, defaults applied). */
  readonly modifiers?: Partial<EventModifiers>;
  /** Optional event currency configuration. */
  readonly eventCurrency?: Omit<EventCurrencyConfig, "earnRules"> & {
    earnRules?: Partial<EventCurrencyConfig["earnRules"]>;
  };
}

/** Result of starting an event. */
export interface StartEventResult {
  readonly success: boolean;
  readonly name: string;
  readonly startsAt: Date;
  readonly endsAt?: Date;
  readonly modifiers: EventModifiers;
}

/** Result of stopping an event. */
export interface StopEventResult {
  readonly success: boolean;
  readonly stoppedAt: Date;
  readonly duration: number; // milliseconds
}

/** Current event status with active modifiers. */
export interface EventStatus {
  readonly active: boolean;
  readonly name?: string;
  readonly description?: string;
  readonly timeRemaining?: number; // milliseconds
  readonly modifiers: EventModifiers;
  readonly eventCurrency?: EventCurrencyConfig;
  readonly startedAt?: Date;
  readonly endsAt?: Date;
}

/** Error codes for event operations. */
export type EventErrorCode =
  | "EVENT_ALREADY_ACTIVE"
  | "EVENT_NOT_ACTIVE"
  | "INVALID_DURATION"
  | "INVALID_MODIFIERS"
  | "CONFIG_NOT_FOUND"
  | "UPDATE_FAILED";

/** Event error class. */
export class EventError extends Error {
  constructor(
    public readonly code: EventErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EventError";
  }
}

/** Check if an event is currently active. */
export function isEventActive(config: EventConfig): boolean {
  if (!config.enabled) return false;
  
  const now = new Date();
  
  if (config.startsAt && now < config.startsAt) return false;
  if (config.endsAt && now > config.endsAt) return false;
  
  return true;
}

/** Calculate effective value with event modifier. */
export function applyEventMultiplier(
  baseValue: number,
  multiplier: number,
): number {
  return Math.max(0, Math.round(baseValue * multiplier));
}

/** Calculate price with event discount. */
export function applyEventDiscount(
  basePrice: number,
  discountPct: number,
): number {
  return Math.max(1, Math.round(basePrice * (1 - discountPct)));
}

/** Build default event config. */
export function buildDefaultEventConfig(): EventConfig {
  return {
    enabled: false,
    name: "",
    modifiers: DEFAULT_EVENT_MODIFIERS,
    version: 0,
  };
}

/** Merge partial modifiers with defaults. */
export function buildEventModifiers(
  partial?: Partial<EventModifiers>,
): EventModifiers {
  return {
    ...DEFAULT_EVENT_MODIFIERS,
    ...partial,
  };
}

/** Get human-readable modifier summary. */
export function getModifierSummary(modifiers: EventModifiers): string {
  const parts: string[] = [];
  
  if (modifiers.xpMultiplier !== 1.0) {
    const pct = Math.round((modifiers.xpMultiplier - 1) * 100);
    parts.push(`${pct > 0 ? "+" : ""}${pct}% XP`);
  }
  if (modifiers.dailyRewardBonusPct > 0) {
    parts.push(`+${Math.round(modifiers.dailyRewardBonusPct * 100)}% Daily`);
  }
  if (modifiers.workRewardBonusPct > 0) {
    parts.push(`+${Math.round(modifiers.workRewardBonusPct * 100)}% Work`);
  }
  if (modifiers.triviaRewardBonusPct > 0) {
    parts.push(`+${Math.round(modifiers.triviaRewardBonusPct * 100)}% Trivia`);
  }
  if (modifiers.storeDiscountPct > 0) {
    parts.push(`-${Math.round(modifiers.storeDiscountPct * 100)}% Store`);
  }
  if (modifiers.questRewardBonusPct > 0) {
    parts.push(`+${Math.round(modifiers.questRewardBonusPct * 100)}% Quests`);
  }
  if (modifiers.craftingCostReductionPct > 0) {
    parts.push(`-${Math.round(modifiers.craftingCostReductionPct * 100)}% Craft`);
  }
  
  return parts.join(" • ") || "No modifiers";
}
