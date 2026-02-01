/**
 * Trivia System Types (Phase 9c).
 *
 * Purpose: Enhanced trivia types with difficulty levels 1-5 and explanations.
 */

/** Trivia categories. */
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

/** Difficulty level 1-5. */
export type TriviaDifficulty = 1 | 2 | 3 | 4 | 5;

/** Enhanced trivia question with explanation. */
export interface TriviaQuestion {
  readonly id: string;
  readonly question: string;
  readonly options: readonly string[]; // Always 4 options: A, B, C, D
  readonly correctIndex: number; // 0-3
  readonly category: TriviaCategory;
  readonly difficulty: TriviaDifficulty;
  readonly explanation: string; // 1-2 lines explaining the answer
  readonly tags: readonly string[]; // For filtering/searching
}

/** Difficulty configuration with rewards. */
export interface DifficultyConfig {
  readonly level: TriviaDifficulty;
  readonly name: string;
  readonly emoji: string;
  readonly currencyMultiplier: number;
  readonly xpMultiplier: number;
  readonly color: number;
}

/** Streak configuration. */
export interface StreakConfig {
  readonly enabled: boolean;
  readonly maxStreak: number; // Cap for streak bonus
  readonly bonusPerStreak: number; // Percentage per consecutive correct
  readonly maxBonusPercent: number; // Max streak bonus percentage
}

/** Timeout configuration. */
export interface TimeoutConfig {
  readonly enabled: boolean;
  readonly timeoutSeconds: number;
  readonly penaltyAmount: number; // Small penalty for timeout
  readonly endStreakOnTimeout: boolean;
}

/** Category display info. */
export interface CategoryInfo {
  readonly id: TriviaCategory;
  readonly name: string;
  readonly emoji: string;
  readonly description: string;
}

/** Question filter options. */
export interface QuestionFilter {
  categories?: TriviaCategory[];
  minDifficulty?: TriviaDifficulty;
  maxDifficulty?: TriviaDifficulty;
  excludeIds?: string[];
}

/** User trivia session state. */
export interface TriviaSession {
  readonly userId: string;
  readonly guildId: string;
  readonly questionId: string;
  readonly correlationId: string;
  readonly startedAt: Date;
  readonly expiresAt: Date; // For timeout
  readonly streak: number; // Current correct streak
}

/** Trivia result with enhanced info. */
export interface TriviaGameResult {
  readonly correct: boolean;
  readonly question: TriviaQuestion;
  readonly selectedAnswerIndex: number;
  readonly baseReward: { currency: number; xp: number };
  readonly difficultyBonus: { currency: number; xp: number };
  readonly streakBonus: { currency: number; xp: number };
  readonly totalReward: { currency: number; xp: number };
  readonly newStreak: number;
  readonly correlationId: string;
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
