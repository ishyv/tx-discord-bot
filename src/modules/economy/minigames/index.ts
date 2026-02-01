/**
 * Minigames Module (Phase 9c).
 *
 * Purpose: Coinflip, Trivia, and Rob games with enhanced trivia system.
 */

// Export types
export * from "./types";

// Export config and trivia data
export {
  DEFAULT_COINFLIP_CONFIG,
  DEFAULT_TRIVIA_CONFIG,
  DEFAULT_ROB_CONFIG,
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
} from "./config";

// Export repository and service
export { minigameRepo, type MinigameRepo } from "./repository";
export { minigameService, type MinigameService } from "./service";
