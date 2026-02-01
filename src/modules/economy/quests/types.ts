/**
 * Quest Board 2.0 Types and Definitions.
 *
 * Purpose: Define quest system types, requirements, rewards, and user progress.
 * Context: Used by quest service, repository, and UI components.
 * Dependencies: Zod for validation, Result pattern for error handling.
 */

import type { CurrencyId } from "../currency";
import type { ItemId } from "@/modules/inventory/definitions";
import type { UserId, GuildId } from "@/db/types";

/** Quest difficulty levels. */
export type QuestDifficulty =
  | "easy"
  | "medium"
  | "hard"
  | "expert"
  | "legendary";

/** Quest rotation types. */
export type QuestRotationType = "daily" | "weekly" | "featured";

/** Quest categories for grouping/filtering. */
export type QuestCategory =
  | "general"
  | "economy"
  | "social"
  | "minigame"
  | "crafting"
  | "voting"
  | "exploration"
  | "event"
  | "starter";

/** Supported quest requirement types. */
export type QuestRequirementType =
  | "do_command"
  | "spend_currency"
  | "craft_recipe"
  | "win_minigame"
  | "vote_cast";

/** Base interface for all quest requirements. */
export interface QuestRequirementBase {
  type: QuestRequirementType;
}

/** Requirement: Execute a command N times. */
export interface DoCommandRequirement extends QuestRequirementBase {
  type: "do_command";
  command: string;
  count: number;
}

/** Requirement: Spend N amount of a currency. */
export interface SpendCurrencyRequirement extends QuestRequirementBase {
  type: "spend_currency";
  currencyId: CurrencyId;
  amount: number;
}

/** Requirement: Craft a recipe N times. */
export interface CraftRecipeRequirement extends QuestRequirementBase {
  type: "craft_recipe";
  recipeId: string;
  count: number;
}

/** Supported minigames for win requirements. */
export type QuestMinigameType = "coinflip" | "trivia";

/** Requirement: Win a minigame N times. */
export interface WinMinigameRequirement extends QuestRequirementBase {
  type: "win_minigame";
  game: QuestMinigameType;
  count: number;
}

/** Vote types for voting requirements. */
export type QuestVoteType = "love" | "hate";

/** Requirement: Cast N votes of a specific type. */
export interface VoteCastRequirement extends QuestRequirementBase {
  type: "vote_cast";
  voteType: QuestVoteType;
  count: number;
}

/** Union type of all quest requirements. */
export type QuestRequirement =
  | DoCommandRequirement
  | SpendCurrencyRequirement
  | CraftRecipeRequirement
  | WinMinigameRequirement
  | VoteCastRequirement;

/** Reward types. */
export type QuestRewardType = "currency" | "xp" | "item" | "quest_token";

/** Base interface for quest rewards. */
export interface QuestRewardBase {
  type: QuestRewardType;
}

/** Currency reward. */
export interface CurrencyReward extends QuestRewardBase {
  type: "currency";
  currencyId: CurrencyId;
  amount: number;
  source?: "mint" | "guild_sector";
  sector?: "global" | "works" | "trade" | "tax";
}

/** XP reward. */
export interface XPReward extends QuestRewardBase {
  type: "xp";
  amount: number;
}

/** Item reward. */
export interface ItemReward extends QuestRewardBase {
  type: "item";
  itemId: ItemId;
  quantity: number;
}

/** Quest token reward (for future shop). */
export interface QuestTokenReward extends QuestRewardBase {
  type: "quest_token";
  amount: number;
}

/** Union type of all quest rewards. */
export type QuestReward =
  | CurrencyReward
  | XPReward
  | ItemReward
  | QuestTokenReward;

/** Quest template definition (guild-scoped). */
export interface QuestTemplate {
  /** Unique quest ID (guild-scoped). */
  readonly id: string;
  /** Human-readable quest name. */
  readonly name: string;
  /** Quest description. */
  readonly description: string;
  /** Quest category. */
  readonly category: QuestCategory;
  /** Quest difficulty. */
  readonly difficulty: QuestDifficulty;
  /** Requirements to complete. */
  readonly requirements: QuestRequirement[];
  /** Rewards on completion. */
  readonly rewards: QuestReward[];
  /** Cooldown before quest can appear again (in hours). */
  readonly cooldownHours: number;
  /** Maximum completions per rotation period (0 = unlimited). */
  readonly maxCompletions: number;
  /** Minimum level required. */
  readonly minLevel?: number;
  /** Whether this quest can be featured. */
  readonly canBeFeatured: boolean;
  /** Featured quest reward multiplier. */
  readonly featuredMultiplier: number;
  /** Created timestamp. */
  readonly createdAt: Date;
  /** Updated timestamp. */
  readonly updatedAt: Date;
  /** Created by user ID. */
  readonly createdBy: UserId;
  /** Whether the quest is active. */
  readonly enabled: boolean;
}

/** Quest rotation instance (generated from templates). */
export interface QuestRotation {
  /** Unique rotation ID. */
  readonly id: string;
  /** Guild ID. */
  readonly guildId: GuildId;
  /** Rotation type. */
  readonly type: QuestRotationType;
  /** Start time. */
  readonly startsAt: Date;
  /** End time. */
  readonly endsAt: Date;
  /** Quest IDs in this rotation. */
  readonly questIds: string[];
  /** Featured quest ID (if any). */
  readonly featuredQuestId?: string;
  /** Created timestamp. */
  readonly createdAt: Date;
}

/** User progress on a specific quest instance. */
export interface QuestProgress {
  /** Composite ID: userId:rotationId:questId */
  readonly _id: string;
  /** User ID. */
  readonly userId: UserId;
  /** Guild ID. */
  readonly guildId: GuildId;
  /** Rotation ID. */
  readonly rotationId: string;
  /** Quest ID. */
  readonly questId: string;
  /** Current progress per requirement (index-aligned with quest.requirements). */
  readonly requirementProgress: number[];
  /** Whether quest is completed. */
  readonly completed: boolean;
  /** When quest was completed. */
  readonly completedAt?: Date;
  /** Number of times completed this rotation. */
  readonly completionCount: number;
  /** Whether rewards have been claimed. */
  readonly rewardsClaimed: boolean;
  /** When rewards were claimed. */
  readonly rewardsClaimedAt?: Date;
  /** Created timestamp. */
  readonly createdAt: Date;
  /** Updated timestamp. */
  readonly updatedAt: Date;
}

/** View model for quest display. */
export interface QuestView {
  /** Quest ID. */
  readonly id: string;
  /** Quest name. */
  readonly name: string;
  /** Quest description. */
  readonly description: string;
  /** Quest category. */
  readonly category: QuestCategory;
  /** Quest difficulty. */
  readonly difficulty: QuestDifficulty;
  /** Requirements with progress info. */
  readonly requirements: RequirementView[];
  /** Rewards. */
  readonly rewards: QuestReward[];
  /** Whether this is a featured quest. */
  readonly isFeatured: boolean;
  /** Reward multiplier (for featured quests). */
  readonly rewardMultiplier: number;
  /** User progress (if any). */
  readonly progress?: QuestProgressView;
  /** Time remaining for this rotation. */
  readonly expiresAt: Date;
}

/** View model for requirement with progress. */
export interface RequirementView {
  /** Requirement type. */
  readonly type: QuestRequirementType;
  /** Human-readable description. */
  readonly description: string;
  /** Current progress. */
  readonly current: number;
  /** Target value. */
  readonly target: number;
  /** Whether completed. */
  readonly completed: boolean;
}

/** View model for quest progress. */
export interface QuestProgressView {
  /** Current progress (0-100). */
  readonly percentComplete: number;
  /** Whether quest is completed. */
  readonly isCompleted: boolean;
  /** Whether rewards are claimed. */
  readonly isClaimed: boolean;
  /** Completions this rotation. */
  readonly completions: number;
  /** Max completions allowed. */
  readonly maxCompletions: number;
}

/** Quest board view (all rotations). */
export interface QuestBoardView {
  /** Current daily rotation. */
  readonly daily: QuestRotationView;
  /** Current weekly rotation. */
  readonly weekly: QuestRotationView;
  /** Current featured quest (if any). */
  readonly featured?: QuestView;
  /** User's total quests completed. */
  readonly totalCompleted: number;
  /** User's quest tokens. */
  readonly questTokens: number;
}

/** Quest rotation view. */
export interface QuestRotationView {
  /** Rotation type. */
  readonly type: QuestRotationType;
  /** Quests in this rotation. */
  readonly quests: QuestView[];
  /** Time remaining. */
  readonly expiresAt: Date;
  /** Whether rotation is active. */
  readonly isActive: boolean;
}

/** Error codes for quest operations. */
export type QuestErrorCode =
  | "QUEST_NOT_FOUND"
  | "QUEST_DISABLED"
  | "ROTATION_NOT_FOUND"
  | "QUEST_ALREADY_COMPLETED"
  | "QUEST_NOT_COMPLETED"
  | "REWARDS_ALREADY_CLAIMED"
  | "MAX_COMPLETIONS_REACHED"
  | "INSUFFICIENT_FUNDS"
  | "INSUFFICIENT_ITEMS"
  | "INSUFFICIENT_LEVEL"
  | "CAPACITY_EXCEEDED"
  | "UPDATE_FAILED"
  | "INVALID_TEMPLATE"
  | "DUPLICATE_QUEST_ID"
  | "FEATURE_DISABLED";

/** Quest error class. */
export class QuestError extends Error {
  constructor(
    public readonly code: QuestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "QuestError";
  }
}

/** Input for creating a quest template. */
export interface CreateQuestTemplateInput {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: QuestCategory;
  readonly difficulty: QuestDifficulty;
  readonly requirements: QuestRequirement[];
  readonly rewards: QuestReward[];
  readonly cooldownHours?: number;
  readonly maxCompletions?: number;
  readonly minLevel?: number;
  readonly canBeFeatured?: boolean;
  readonly featuredMultiplier?: number;
  readonly enabled?: boolean;
}

/** Input for updating quest progress. */
export interface UpdateQuestProgressInput {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly rotationId: string;
  readonly questId: string;
  readonly requirementType: QuestRequirementType;
  readonly increment: number;
  readonly metadata?: Record<string, unknown>;
}

/** Input for claiming quest rewards. */
export interface ClaimQuestRewardsInput {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly rotationId: string;
  readonly questId: string;
}

/** Result of claiming quest rewards. */
export interface ClaimQuestRewardsResult {
  readonly questId: string;
  readonly rotationId: string;
  readonly rewards: AppliedReward[];
  readonly correlationId: string;
}

/** Applied reward with actual values. */
export interface AppliedReward {
  readonly type: QuestRewardType;
  readonly description: string;
  readonly amount: number;
}

/** Quest completion statistics for a user. */
export interface QuestStats {
  readonly userId: UserId;
  readonly guildId: GuildId;
  readonly totalCompleted: number;
  readonly dailyCompleted: number;
  readonly weeklyCompleted: number;
  readonly featuredCompleted: number;
  readonly questTokens: number;
  readonly favoriteCategory?: QuestCategory;
  readonly currentStreak: number;
  readonly bestStreak: number;
}

/** Event payload for quest progress update. */
export interface QuestProgressEvent {
  readonly userId: UserId;
  readonly guildId: GuildId;
  readonly requirementType: QuestRequirementType;
  readonly metadata: Record<string, unknown>;
}

/** Quest filter options for listing. */
export interface QuestFilterOptions {
  readonly category?: QuestCategory;
  readonly difficulty?: QuestDifficulty;
  readonly enabled?: boolean;
  readonly canBeFeatured?: boolean;
}

/** Quest sort options. */
export type QuestSortBy =
  | "name"
  | "difficulty"
  | "category"
  | "createdAt"
  | "cooldownHours";

/** Configuration for quest rotations. */
export interface QuestRotationConfig {
  readonly dailyQuestCount: number;
  readonly weeklyQuestCount: number;
  readonly featuredEnabled: boolean;
  readonly dailyResetHour: number;
  readonly weeklyResetDay: number;
  readonly weeklyResetHour: number;
}

/** Default rotation configuration. */
export const DEFAULT_QUEST_ROTATION_CONFIG: QuestRotationConfig = {
  dailyQuestCount: 3,
  weeklyQuestCount: 5,
  featuredEnabled: true,
  dailyResetHour: 0,
  weeklyResetDay: 1, // Monday
  weeklyResetHour: 0,
};
