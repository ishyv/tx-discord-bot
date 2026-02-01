/**
 * Minigames Module Types (Phase 9c).
 *
 * Purpose: Define types for coinflip, trivia, and rob games with enhanced trivia.
 */

import type { GuildId, UserId } from "@/db/types";
import type { CurrencyId } from "@/modules/economy/currency";
import type { EconomySector } from "@/modules/economy/guild";

// =============================================================================
// Common Types
// =============================================================================

/** Supported minigame types. */
export type MinigameType = "coinflip" | "trivia" | "rob";

/** Error codes for minigame operations. */
export type MinigameErrorCode =
  | "INSUFFICIENT_FUNDS"
  | "BET_TOO_LOW"
  | "BET_TOO_HIGH"
  | "COOLDOWN_ACTIVE"
  | "DAILY_LIMIT_REACHED"
  | "TARGET_NOT_FOUND"
  | "TARGET_BLOCKED"
  | "TARGET_BANNED"
  | "TARGET_TOO_POOR"
  | "TARGET_INACTIVE"
  | "SELF_TARGET"
  | "PAIR_COOLDOWN"
  | "INVALID_CHOICE"
  | "CONFIG_NOT_FOUND"
  | "UPDATE_FAILED"
  | "CONFLICT"
  | "FEATURE_DISABLED"
  | "TIMEOUT_EXPIRED"
  | "INVALID_DIFFICULTY";

export class MinigameError extends Error {
  constructor(
    public readonly code: MinigameErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MinigameError";
  }
}

// =============================================================================
// Coinflip Types
// =============================================================================

export type CoinSide = "heads" | "tails";

export interface CoinflipConfig {
  readonly enabled: boolean;
  readonly currencyId: CurrencyId;
  readonly minBet: number;
  readonly maxBet: number;
  readonly houseEdge: number; // 0.05 = 5% house edge
  readonly cooldownSeconds: number;
  readonly dailyMaxBets: number;
}

export interface CoinflipInput {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly amount: number;
  readonly choice: CoinSide;
}

export interface CoinflipResult {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly amount: number;
  readonly choice: CoinSide;
  readonly outcome: CoinSide;
  readonly won: boolean;
  readonly winnings: number;
  readonly houseFee: number;
  readonly netProfit: number;
  readonly newBalance: number;
  readonly correlationId: string;
  readonly timestamp: Date;
}

// =============================================================================
// Trivia Types (Phase 9c Enhanced)
// =============================================================================

/** Trivia difficulty level (1-5). */
export type TriviaDifficulty = 1 | 2 | 3 | 4 | 5;

/** Trivia category. */
export type TriviaCategory =
  | "tech"
  | "gaming"
  | "anime"
  | "history"
  | "general"
  | "science"
  | "music"
  | "memes"
  | "programming";

/** Enhanced trivia question with explanation and difficulty. */
export interface TriviaQuestion {
  readonly id: string;
  readonly question: string;
  readonly options: readonly string[]; // Always 4 options: A, B, C, D
  readonly correctIndex: number; // 0-3
  readonly category: TriviaCategory;
  readonly difficulty: TriviaDifficulty;
  readonly explanation: string; // Explanation shown after answering
  readonly tags: readonly string[];
}

/** Difficulty configuration with reward multipliers. */
export interface DifficultyConfig {
  readonly level: TriviaDifficulty;
  readonly name: string;
  readonly emoji: string;
  readonly currencyMultiplier: number;
  readonly xpMultiplier: number;
  readonly color: number;
}

/** Enhanced trivia configuration. */
export interface TriviaConfig {
  readonly enabled: boolean;
  readonly currencyId: CurrencyId;
  readonly baseCurrencyReward: number;
  readonly baseXpReward: number;
  readonly difficultyMultipliers: Record<TriviaDifficulty, number>;
  readonly streakBonusEnabled: boolean;
  readonly streakBonusPerQuestion: number; // Percent per streak
  readonly maxStreakBonus: number; // Max percentage
  readonly cooldownSeconds: number;
  readonly dailyMaxPlays: number;
  readonly timeoutSeconds: number;
  readonly timeoutPenalty: number; // Penalty for timeout (0 = no penalty)
}

/** Trivia input for answering. */
export interface TriviaInput {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly questionId: string;
  readonly answerIndex: number; // 0-3
}

/** Trivia session for tracking active games. */
export interface TriviaSession {
  readonly userId: string;
  readonly guildId: string;
  readonly questionId: string;
  readonly correlationId: string;
  readonly startedAt: Date;
  readonly expiresAt: Date; // Timeout
  readonly streak: number; // Current streak before this question
}

/** Enhanced trivia start result. */
export interface TriviaStartResult {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly question: TriviaQuestion;
  readonly correlationId: string;
  readonly streak: number; // Current streak
  readonly expiresAt: Date; // Timeout time
  readonly timestamp: Date;
}

/** Reward breakdown for transparency. */
export interface TriviaRewardBreakdown {
  readonly base: { currency: number; xp: number };
  readonly difficulty: { currency: number; xp: number };
  readonly streak: { currency: number; xp: number };
  readonly total: { currency: number; xp: number };
}

/** Enhanced trivia result with streak and explanation. */
export interface TriviaResult {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly questionId: string;
  readonly question: string;
  readonly correct: boolean;
  readonly correctAnswer: string;
  readonly selectedAnswer: string;
  readonly explanation: string;
  readonly difficulty: TriviaDifficulty;
  readonly rewards: TriviaRewardBreakdown;
  readonly streakBefore: number;
  readonly streakAfter: number;
  readonly newBalance: number;
  readonly correlationId: string;
  readonly timestamp: Date;
}

/** Pending question for admin review. */
export interface PendingTriviaQuestion {
  readonly _id: string;
  readonly submittedBy: string;
  readonly submittedAt: Date;
  readonly question: Omit<TriviaQuestion, "id">;
  readonly status: "pending" | "approved" | "rejected";
  readonly reviewedBy?: string;
  readonly reviewedAt?: Date;
  readonly rejectionReason?: string;
}

// =============================================================================
// Rob Types
// =============================================================================

export interface RobConfig {
  readonly enabled: boolean;
  readonly currencyId: CurrencyId;
  readonly cooldownSeconds: number;
  readonly dailyMaxAttempts: number;
  readonly maxStealPct: number; // 0.15 = max 15% of target balance
  readonly maxStealAmount: number; // Absolute cap
  readonly minTargetBalance: number; // Target must have at least this much
  readonly minRobberBalance: number; // Robber must have at least this much
  readonly failChance: number; // 0.3 = 30% base fail chance
  readonly failFinePct: number; // Fine on failure (of attempted amount)
  readonly failFineMin: number; // Minimum fine
  readonly pairCooldownSeconds: number; // Cooldown between same robber/target pair
  readonly targetActivityHours: number; // Target must have been active within this
  readonly taxSector?: EconomySector; // Where fines go
}

export interface RobInput {
  readonly guildId: GuildId;
  readonly userId: UserId; // Robber
  readonly targetId: UserId; // Victim
}

export interface RobResult {
  readonly guildId: GuildId;
  readonly userId: UserId; // Robber
  readonly targetId: UserId; // Victim
  readonly success: boolean;
  readonly amountStolen: number;
  readonly targetBalanceBefore: number;
  readonly targetBalanceAfter: number;
  readonly robberBalanceBefore: number;
  readonly robberBalanceAfter: number;
  readonly fineAmount?: number; // If failed
  readonly taxPaid?: number; // Fine paid to guild
  readonly correlationId: string;
  readonly timestamp: Date;
}

// =============================================================================
// State Tracking
// =============================================================================

/** Per-user minigame state (stored in user document). */
export interface MinigameState {
  readonly coinflip: {
    readonly lastPlayAt?: Date;
    readonly dailyCount: number;
    readonly dailyResetAt: Date;
  };
  readonly trivia: {
    readonly lastPlayAt?: Date;
    readonly dailyCount: number;
    readonly dailyResetAt: Date;
    readonly pendingQuestionId?: string; // For tracking active trivia
    readonly currentStreak: number; // Current correct streak
    readonly bestStreak: number; // Best streak ever
  };
  readonly rob: {
    readonly lastAttemptAt?: Date;
    readonly dailyCount: number;
    readonly dailyResetAt: Date;
    readonly pairCooldowns: Record<string, Date>; // targetId -> cooldown end
  };
}

/** Per-guild minigame configuration. */
export interface GuildMinigameConfig {
  readonly coinflip: CoinflipConfig;
  readonly trivia: TriviaConfig;
  readonly rob: RobConfig;
  readonly updatedAt: Date;
}

// =============================================================================
// Audit Types
// =============================================================================

export interface CoinflipAuditData {
  readonly type: "coinflip";
  readonly correlationId: string;
  readonly userId: UserId;
  readonly guildId: GuildId;
  readonly bet: number;
  readonly choice: CoinSide;
  readonly outcome: CoinSide;
  readonly won: boolean;
  readonly winnings: number;
  readonly houseFee: number;
  readonly netProfit: number;
}

export interface TriviaAuditData {
  readonly type: "trivia";
  readonly correlationId: string;
  readonly userId: UserId;
  readonly guildId: GuildId;
  readonly questionId: string;
  readonly difficulty: TriviaDifficulty;
  readonly correct: boolean;
  readonly streakBefore: number;
  readonly streakAfter: number;
  readonly rewards: TriviaRewardBreakdown;
}

export interface RobAuditData {
  readonly type: "rob";
  readonly correlationId: string;
  readonly userId: UserId; // Robber
  readonly targetId: UserId; // Victim
  readonly guildId: GuildId;
  readonly success: boolean;
  readonly amountStolen: number;
  readonly fineAmount?: number;
  readonly taxPaid?: number;
}
