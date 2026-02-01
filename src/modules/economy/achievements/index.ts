/**
 * Achievements Module Public API.
 *
 * Purpose: Export achievement system components for use by commands and services.
 */

// Types
export type {
  AchievementDefinition,
  AchievementTier,
  AchievementCategory,
  UnlockCondition,
  UnlockConditionType,
  AchievementReward,
  AchievementRewardType,
  UnlockedAchievement,
  AchievementProgress,
  AchievementView,
  AchievementBoardView,
  AchievementProgressView,
  TitleView,
  UserTitle,
  UserBadge,
  EquippedTitle,
  ProfileCosmetics,
  ClaimAchievementRewardsInput,
  ClaimAchievementRewardsResult,
  AppliedAchievementReward,
  EquipTitleInput,
  AchievementProgressEvent,
} from "./types";

// Constants and display configs
export {
  AchievementError,
  TIER_DISPLAY,
  CATEGORY_DISPLAY,
  MAX_XP_REWARD,
  MAX_CURRENCY_REWARD,
} from "./types";

// Definitions
export {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_MAP,
  getAchievementDefinition,
  getAllAchievementDefinitions,
  getAchievementsByCategory,
  getAchievementsByTier,
} from "./definitions";

// Repository
export { achievementRepo } from "./repository";
export type { AchievementRepository } from "./repository";

// Service
export { achievementService } from "./service";
export type { AchievementService } from "./service";

// Hooks
export {
  trackCoinflipResult,
  trackTriviaWin,
  trackRobSuccess,
  trackCraftingForAchievements,
  trackDailyStreak,
  trackLevelUp,
  trackStorePurchase,
  trackItemCollection,
  trackQuestCompletion,
  trackVoteCastForAchievements,
  evaluateAchievementsFromAudit,
} from "./hooks";

// UI Builders
export {
  buildAchievementBoardEmbed,
  buildAchievementDetailEmbed,
  buildCategoryAchievementsEmbed,
  buildTitlesEmbed,
  buildTitleEquippedEmbed,
  buildRewardClaimEmbed,
  buildAchievementErrorEmbed,
  buildAchievementSuccessEmbed,
  buildAchievementUnlockedEmbed,
  buildBadgeSlotsEmbed,
} from "./ui";
