/**
 * Quest Board 2.0 Module - Public API.
 *
 * Purpose: Export quest system components for use by commands and other modules.
 */

// Types
export type {
  QuestDifficulty,
  QuestRotationType,
  QuestCategory,
  QuestRequirementType,
  QuestRequirement,
  DoCommandRequirement,
  SpendCurrencyRequirement,
  CraftRecipeRequirement,
  WinMinigameRequirement,
  VoteCastRequirement,
  QuestRewardType,
  QuestReward,
  CurrencyReward,
  XPReward,
  ItemReward,
  QuestTokenReward,
  QuestTemplate,
  QuestRotation,
  QuestProgress,
  QuestView,
  RequirementView,
  QuestProgressView,
  QuestBoardView,
  QuestRotationView,
  QuestErrorCode,
  CreateQuestTemplateInput,
  UpdateQuestProgressInput,
  ClaimQuestRewardsInput,
  ClaimQuestRewardsResult,
  AppliedReward,
  QuestStats,
  QuestFilterOptions,
  QuestSortBy,
  QuestRotationConfig,
  QuestMinigameType,
  QuestVoteType,
} from "./types";

// Classes and constants
export { QuestError, DEFAULT_QUEST_ROTATION_CONFIG } from "./types";

// Repository
export { questRepo } from "./repository";
export type { QuestRepository } from "./repository";

// Service
export { questService } from "./service";
export type { QuestService } from "./service";

// Rotation Service
export { questRotationService, generateExampleQuests } from "./rotation";
export type {
  QuestRotationService,
  RotationStatus,
  ScheduleInfo,
} from "./rotation";

// Hooks
export {
  trackQuestProgress,
  trackCommandUsage,
  trackCurrencySpent,
  trackCrafting,
  trackMinigameWin,
  trackVoteCast,
} from "./hooks";
export type { QuestHookContext } from "./hooks";

// Event Quests (Phase 9e)
export {
  EVENT_QUEST_TEMPLATES,
  getEventQuestTemplates,
  isEventQuest,
} from "./event-quests";

// Launch Pack (Phase 10d)
export {
  STARTER_QUESTLINE,
  LAUNCH_WEEK_EVENT,
  LAUNCH_WEEK_MODIFIERS,
  getStarterQuestTotalRewards,
  isLaunchWeekEvent,
  getStarterQuestCategory,
  STARTER_QUEST_CATEGORIES,
} from "../events/launch-pack";
