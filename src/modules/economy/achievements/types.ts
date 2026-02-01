/**
 * Achievements System Types and Definitions.
 *
 * Purpose: Define achievement types, unlock conditions, rewards, and user progress.
 * Context: Used by achievement service, repository, and UI components.
 * Dependencies: Zod for validation, Result pattern for error handling.
 */

import type { UserId, GuildId } from "@/db/types";

/** Achievement tier levels. */
export type AchievementTier =
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond";

/** Achievement category for grouping. */
export type AchievementCategory =
  | "progression"
  | "minigame"
  | "crafting"
  | "social"
  | "collection"
  | "special";

/** Types of unlock conditions. */
export type UnlockConditionType =
  | "streak_milestone"
  | "level_milestone"
  | "craft_count"
  | "trivia_wins"
  | "coinflip_streak"
  | "rob_success"
  | "store_purchases"
  | "quest_completions"
  | "currency_held"
  | "items_collected"
  | "votes_cast"
  | "login_streak"
  | "special";

/** Base interface for all unlock conditions. */
export interface UnlockConditionBase {
  type: UnlockConditionType;
}

/** Streak milestone condition. */
export interface StreakMilestoneCondition extends UnlockConditionBase {
  type: "streak_milestone";
  days: number;
}

/** Level milestone condition. */
export interface LevelMilestoneCondition extends UnlockConditionBase {
  type: "level_milestone";
  level: number;
}

/** Craft count condition. */
export interface CraftCountCondition extends UnlockConditionBase {
  type: "craft_count";
  count: number;
}

/** Trivia wins condition. */
export interface TriviaWinsCondition extends UnlockConditionBase {
  type: "trivia_wins";
  count: number;
}

/** Coinflip win streak condition. */
export interface CoinflipStreakCondition extends UnlockConditionBase {
  type: "coinflip_streak";
  consecutiveWins: number;
}

/** Rob success condition (Robin Hood). */
export interface RobSuccessCondition extends UnlockConditionBase {
  type: "rob_success";
  totalAmount: number;
}

/** Store purchases condition. */
export interface StorePurchasesCondition extends UnlockConditionBase {
  type: "store_purchases";
  count: number;
}

/** Quest completions condition. */
export interface QuestCompletionsCondition extends UnlockConditionBase {
  type: "quest_completions";
  count: number;
}

/** Currency held condition. */
export interface CurrencyHeldCondition extends UnlockConditionBase {
  type: "currency_held";
  currencyId: string;
  amount: number;
}

/** Items collected condition. */
export interface ItemsCollectedCondition extends UnlockConditionBase {
  type: "items_collected";
  uniqueItems: number;
}

/** Votes cast condition. */
export interface VotesCastCondition extends UnlockConditionBase {
  type: "votes_cast";
  count: number;
}

/** Login streak condition. */
export interface LoginStreakCondition extends UnlockConditionBase {
  type: "login_streak";
  days: number;
}

/** Special/manual unlock condition. */
export interface SpecialCondition extends UnlockConditionBase {
  type: "special";
  description: string;
}

/** Union type of all unlock conditions. */
export type UnlockCondition =
  | StreakMilestoneCondition
  | LevelMilestoneCondition
  | CraftCountCondition
  | TriviaWinsCondition
  | CoinflipStreakCondition
  | RobSuccessCondition
  | StorePurchasesCondition
  | QuestCompletionsCondition
  | CurrencyHeldCondition
  | ItemsCollectedCondition
  | VotesCastCondition
  | LoginStreakCondition
  | SpecialCondition;

/** Reward types for achievements. */
export type AchievementRewardType =
  | "xp"
  | "currency"
  | "title"
  | "badge"
  | "item";

/** Base interface for achievement rewards. */
export interface AchievementRewardBase {
  type: AchievementRewardType;
}

/** XP reward. */
export interface XPReward extends AchievementRewardBase {
  type: "xp";
  amount: number;
}

/** Currency reward. */
export interface CurrencyReward extends AchievementRewardBase {
  type: "currency";
  currencyId: string;
  amount: number;
}

/** Title reward. */
export interface TitleReward extends AchievementRewardBase {
  type: "title";
  titleId: string;
  titleName: string;
  titlePrefix?: string;
  titleSuffix?: string;
}

/** Badge reward. */
export interface BadgeReward extends AchievementRewardBase {
  type: "badge";
  badgeId: string;
  badgeEmoji: string;
  badgeName: string;
}

/** Item reward. */
export interface ItemReward extends AchievementRewardBase {
  type: "item";
  itemId: string;
  quantity: number;
}

/** Union type of all achievement rewards. */
export type AchievementReward =
  | XPReward
  | CurrencyReward
  | TitleReward
  | BadgeReward
  | ItemReward;

/** Achievement definition (static). */
export interface AchievementDefinition {
  /** Unique achievement ID. */
  readonly id: string;
  /** Achievement name. */
  readonly name: string;
  /** Achievement description. */
  readonly description: string;
  /** Achievement tier. */
  readonly tier: AchievementTier;
  /** Achievement category. */
  readonly category: AchievementCategory;
  /** Condition to unlock. */
  readonly condition: UnlockCondition;
  /** Rewards for unlocking. */
  readonly rewards: AchievementReward[];
  /** Optional title granted. */
  readonly title?: TitleReward;
  /** Whether this achievement is hidden until unlocked. */
  readonly hidden?: boolean;
  /** Display order for listing. */
  readonly displayOrder: number;
}

/** User's unlocked achievement record. */
export interface UnlockedAchievement {
  /** Composite ID: userId:guildId:achievementId */
  readonly _id: string;
  /** User ID. */
  readonly userId: UserId;
  /** Guild ID. */
  readonly guildId: GuildId;
  /** Achievement ID. */
  readonly achievementId: string;
  /** When unlocked. */
  readonly unlockedAt: Date;
  /** Whether rewards have been claimed. */
  readonly rewardsClaimed: boolean;
  /** When rewards were claimed. */
  readonly rewardsClaimedAt?: Date;
  /** Progress data at unlock time. */
  readonly unlockProgress?: Record<string, unknown>;
}

/** User's achievement progress tracking. */
export interface AchievementProgress {
  /** Composite ID: userId:guildId:achievementId */
  readonly _id: string;
  /** User ID. */
  readonly userId: UserId;
  /** Guild ID. */
  readonly guildId: GuildId;
  /** Achievement ID. */
  readonly achievementId: string;
  /** Current progress value. */
  readonly progress: number;
  /** Target value for completion. */
  readonly target: number;
  /** Whether completed. */
  readonly completed: boolean;
  /** Last updated timestamp. */
  readonly updatedAt: Date;
}

/** Title equipped by user. */
export interface EquippedTitle {
  /** Title ID. */
  readonly titleId: string;
  /** Title display name. */
  readonly titleName: string;
  /** Prefix to show before username. */
  readonly prefix?: string;
  /** Suffix to show after username. */
  readonly suffix?: string;
  /** When equipped. */
  readonly equippedAt: Date;
}

/** User's title collection. */
export interface UserTitle {
  /** Title ID. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Optional prefix. */
  readonly prefix?: string;
  /** Optional suffix. */
  readonly suffix?: string;
  /** Source achievement ID. */
  readonly sourceAchievementId: string;
  /** When unlocked. */
  readonly unlockedAt: Date;
}

/** User's badge collection. */
export interface UserBadge {
  /** Badge ID. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Emoji/icon. */
  readonly emoji: string;
  /** Source achievement ID. */
  readonly sourceAchievementId: string;
  /** When unlocked. */
  readonly unlockedAt: Date;
  /** Slot position (1-3, 0 = not displayed). */
  readonly slot: number;
}

/** User profile cosmetics. */
export interface ProfileCosmetics {
  /** Currently equipped title. */
  readonly equippedTitle?: EquippedTitle;
  /** Unlocked titles. */
  readonly titles: UserTitle[];
  /** Unlocked badges. */
  readonly badges: UserBadge[];
  /** Selected badge slots (1-3). */
  readonly badgeSlots: [string | null, string | null, string | null];
  /** Profile theme/color. */
  readonly themeColor?: string;
  /** Profile banner. */
  readonly banner?: string;
}

/** View model for achievement display. */
export interface AchievementView {
  /** Achievement ID. */
  readonly id: string;
  /** Achievement name. */
  readonly name: string;
  /** Achievement description. */
  readonly description: string;
  /** Achievement tier. */
  readonly tier: AchievementTier;
  /** Achievement category. */
  readonly category: AchievementCategory;
  /** Tier emoji. */
  readonly tierEmoji: string;
  /** Rewards. */
  readonly rewards: AchievementReward[];
  /** Title granted. */
  readonly title?: TitleReward;
  /** Progress info. */
  readonly progress?: AchievementProgressView;
  /** Whether hidden. */
  readonly hidden: boolean;
  /** Whether unlocked. */
  readonly isUnlocked: boolean;
  /** When unlocked. */
  readonly unlockedAt?: Date;
  /** Whether rewards claimed. */
  readonly rewardsClaimed: boolean;
}

/** View model for achievement progress. */
export interface AchievementProgressView {
  /** Current progress. */
  readonly current: number;
  /** Target value. */
  readonly target: number;
  /** Progress percentage (0-100). */
  readonly percent: number;
  /** Whether completed. */
  readonly completed: boolean;
}

/** Achievement board view. */
export interface AchievementBoardView {
  /** All achievements with progress. */
  readonly achievements: AchievementView[];
  /** Total unlocked count. */
  readonly unlockedCount: number;
  /** Total achievements count. */
  readonly totalCount: number;
  /** Count by tier. */
  readonly byTier: Record<AchievementTier, { unlocked: number; total: number }>;
  /** Count by category. */
  readonly byCategory: Record<
    AchievementCategory,
    { unlocked: number; total: number }
  >;
  /** Next achievement to unlock (closest to completion). */
  readonly nextAchievement?: AchievementView;
  /** Recently unlocked. */
  readonly recentlyUnlocked: AchievementView[];
}

/** Title view for display. */
export interface TitleView {
  readonly id: string;
  readonly name: string;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly sourceAchievementId: string;
  readonly sourceAchievementName: string;
  readonly isEquipped: boolean;
}

/** Error codes for achievement operations. */
export type AchievementErrorCode =
  | "ACHIEVEMENT_NOT_FOUND"
  | "ACHIEVEMENT_ALREADY_UNLOCKED"
  | "ACHIEVEMENT_NOT_UNLOCKED"
  | "REWARDS_ALREADY_CLAIMED"
  | "TITLE_NOT_OWNED"
  | "TITLE_ALREADY_EQUIPPED"
  | "INVALID_TITLE"
  | "BADGE_NOT_OWNED"
  | "UPDATE_FAILED"
  | "PROGRESS_NOT_FOUND";

/** Achievement error class. */
export class AchievementError extends Error {
  constructor(
    public readonly code: AchievementErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AchievementError";
  }
}

/** Input for claiming achievement rewards. */
export interface ClaimAchievementRewardsInput {
  readonly userId: UserId;
  readonly guildId: GuildId;
  readonly achievementId: string;
}

/** Result of claiming achievement rewards. */
export interface ClaimAchievementRewardsResult {
  readonly achievementId: string;
  readonly rewards: AppliedAchievementReward[];
  readonly correlationId: string;
}

/** Applied reward with actual values. */
export interface AppliedAchievementReward {
  readonly type: AchievementRewardType;
  readonly description: string;
  readonly amount?: number;
}

/** Input for equipping a title. */
export interface EquipTitleInput {
  readonly userId: UserId;
  readonly guildId: GuildId;
  readonly titleId: string;
}

/** Event payload for achievement progress update. */
export interface AchievementProgressEvent {
  readonly userId: UserId;
  readonly guildId: GuildId;
  readonly conditionType: UnlockConditionType;
  readonly metadata: Record<string, unknown>;
}

/** Tier display configuration. */
export const TIER_DISPLAY: Record<
  AchievementTier,
  { name: string; emoji: string; color: number }
> = {
  bronze: { name: "Bronce", emoji: "🥉", color: 0xcd7f32 },
  silver: { name: "Plata", emoji: "🥈", color: 0xc0c0c0 },
  gold: { name: "Oro", emoji: "🥇", color: 0xffd700 },
  platinum: { name: "Platino", emoji: "💎", color: 0xe5e4e2 },
  diamond: { name: "Diamante", emoji: "💠", color: 0xb9f2ff },
};

/** Category display configuration. */
export const CATEGORY_DISPLAY: Record<
  AchievementCategory,
  { name: string; emoji: string }
> = {
  progression: { name: "Progresión", emoji: "📈" },
  minigame: { name: "Minijuegos", emoji: "🎮" },
  crafting: { name: "Crafteo", emoji: "⚒️" },
  social: { name: "Social", emoji: "👥" },
  collection: { name: "Colección", emoji: "🎒" },
  special: { name: "Especial", emoji: "✨" },
};

/** XP reward cap per achievement. */
export const MAX_XP_REWARD = 500;

/** Currency reward cap per achievement. */
export const MAX_CURRENCY_REWARD = 1000;
