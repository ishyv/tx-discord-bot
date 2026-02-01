/**
 * Minigames Configuration (Phase 9c).
 *
 * Purpose: Default configs and re-exports from trivia module.
 */

import type {
  CoinflipConfig,
  TriviaConfig,
  RobConfig,
} from "./types";

// Re-export everything from the trivia module
export {
  ALL_QUESTIONS,
  TOTAL_QUESTIONS,
  DIFFICULTY_CONFIG,
  CATEGORY_INFO,
  getQuestionsByCategory,
  getQuestionsByDifficulty,
  getRandomQuestion,
  getQuestionById,
  validateAnswer,
  calculateRewards,
  getCategoryStats,
  type TriviaQuestion,
  type TriviaCategory,
  type TriviaDifficulty,
  type DifficultyConfig,
  type CategoryInfo,
  type QuestionFilter,
} from "./trivia";

/** Default coinflip configuration. */
export const DEFAULT_COINFLIP_CONFIG: CoinflipConfig = {
  enabled: true,
  currencyId: "coins",
  minBet: 10,
  maxBet: 10000,
  houseEdge: 0.05, // 5% house edge
  cooldownSeconds: 10,
  dailyMaxBets: 50,
};

/** Default trivia configuration (Phase 9c with difficulty multipliers). */
export const DEFAULT_TRIVIA_CONFIG: TriviaConfig = {
  enabled: true,
  currencyId: "coins",
  baseCurrencyReward: 50,
  baseXpReward: 15,
  difficultyMultipliers: {
    1: 1.0, // Muy Fácil
    2: 1.2, // Fácil
    3: 1.5, // Medio
    4: 2.0, // Difícil
    5: 3.0, // Experto
  },
  streakBonusEnabled: true,
  streakBonusPerQuestion: 0.1, // 10% per streak
  maxStreakBonus: 0.5, // Max 50% bonus
  cooldownSeconds: 30,
  dailyMaxPlays: 20,
  timeoutSeconds: 60, // 1 minute to answer
  timeoutPenalty: 0, // No penalty for timeout
};

/** Default rob configuration. */
export const DEFAULT_ROB_CONFIG: RobConfig = {
  enabled: true,
  currencyId: "coins",
  cooldownSeconds: 300, // 5 minutes
  dailyMaxAttempts: 10,
  maxStealPct: 0.15, // 15% of target balance
  maxStealAmount: 5000, // Absolute cap
  minTargetBalance: 500, // Target must have at least 500
  minRobberBalance: 200, // Robber must have at least 200
  failChance: 0.35, // 35% base fail chance
  failFinePct: 0.2, // 20% fine of attempted amount
  failFineMin: 50, // Minimum 50 fine
  pairCooldownSeconds: 3600, // 1 hour between robbing same person
  targetActivityHours: 24, // Target must have been active in last 24h
  taxSector: "tax",
};
