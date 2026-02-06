/**
 * Achievement Definitions Registry.
 *
 * Purpose: Define all available achievements with their unlock conditions and rewards.
 * Context: Static registry of achievement definitions.
 * Dependencies: Achievement types.
 *
 * Invariants:
 * - All achievement IDs are unique.
 * - Rewards are capped to prevent economy abuse.
 * - Tiers follow a logical progression.
 */

import type { AchievementDefinition } from "./types";

/**
 * Achievement definitions registry.
 * 16 achievements across 6 categories with increasing difficulty.
 */
export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  // ============================================================================
  // PROGRESSION - Streak & Level Milestones
  // ============================================================================

  {
    id: "streak_7",
    name: "Consistency",
    description: "Maintain a 7-day streak claiming your daily reward.",
    tier: "bronze",
    category: "progression",
    condition: { type: "streak_milestone", days: 7 },
    rewards: [
      { type: "xp", amount: 100 },
      { type: "currency", currencyId: "coins", amount: 500 },
    ],
    title: {
      type: "title",
      titleId: "title_constant",
      titleName: "Consistent",
      titlePrefix: "[Consistent] ",
    },
    displayOrder: 1,
  },

  {
    id: "streak_14",
    name: "Dedication",
    description: "Maintain a 14-day streak claiming your daily reward.",
    tier: "silver",
    category: "progression",
    condition: { type: "streak_milestone", days: 14 },
    rewards: [
      { type: "xp", amount: 250 },
      { type: "currency", currencyId: "coins", amount: 1000 },
    ],
    title: {
      type: "title",
      titleId: "title_dedicated",
      titleName: "Dedicated",
      titlePrefix: "[Dedicated] ",
    },
    displayOrder: 2,
  },

  {
    id: "streak_30",
    name: "Legend de la Consistency",
    description:
      "Maintain a 30-day streak claiming your daily reward. You are a legend!",
    tier: "gold",
    category: "progression",
    condition: { type: "streak_milestone", days: 30 },
    rewards: [
      { type: "xp", amount: 500 },
      { type: "currency", currencyId: "coins", amount: 2500 },
      {
        type: "badge",
        badgeId: "badge_streak",
        badgeEmoji: "🔥",
        badgeName: "Unbreakable Streak",
      },
    ],
    title: {
      type: "title",
      titleId: "title_legend",
      titleName: "Legend",
      titlePrefix: "[🔥 Legend] ",
    },
    displayOrder: 3,
  },

  {
    id: "level_3",
    name: "First Steps",
    description: "Reach level 3 in the progression system.",
    tier: "bronze",
    category: "progression",
    condition: { type: "level_milestone", level: 3 },
    rewards: [
      { type: "xp", amount: 100 },
      { type: "currency", currencyId: "coins", amount: 300 },
    ],
    displayOrder: 4,
  },

  {
    id: "level_6",
    name: "Rising",
    description: "Reach level 6 in the progression system.",
    tier: "silver",
    category: "progression",
    condition: { type: "level_milestone", level: 6 },
    rewards: [
      { type: "xp", amount: 200 },
      { type: "currency", currencyId: "coins", amount: 600 },
    ],
    title: {
      type: "title",
      titleId: "title_rising",
      titleName: "Rising",
      titleSuffix: " el Rising",
    },
    displayOrder: 5,
  },

  {
    id: "level_9",
    name: "Veteran",
    description: "Reach level 9 in the progression system.",
    tier: "gold",
    category: "progression",
    condition: { type: "level_milestone", level: 9 },
    rewards: [
      { type: "xp", amount: 350 },
      { type: "currency", currencyId: "coins", amount: 1200 },
    ],
    title: {
      type: "title",
      titleId: "title_veteran",
      titleName: "Veteran",
      titlePrefix: "[Veteran] ",
    },
    displayOrder: 6,
  },

  {
    id: "level_12",
    name: "Master",
    description:
      "Reach level 12 in the progression system. The top is near!",
    tier: "platinum",
    category: "progression",
    condition: { type: "level_milestone", level: 12 },
    rewards: [
      { type: "xp", amount: 500 },
      { type: "currency", currencyId: "coins", amount: 2000 },
      {
        type: "badge",
        badgeId: "badge_master",
        badgeEmoji: "👑",
        badgeName: "Master",
      },
    ],
    title: {
      type: "title",
      titleId: "title_master",
      titleName: "Master",
      titlePrefix: "[👑 Master] ",
    },
    displayOrder: 7,
  },

  // ============================================================================
  // CRAFTING
  // ============================================================================

  {
    id: "craft_10",
    name: "Novice Craftsman",
    description: "Craft 10 recipes successfully.",
    tier: "bronze",
    category: "crafting",
    condition: { type: "craft_count", count: 10 },
    rewards: [
      { type: "xp", amount: 150 },
      { type: "currency", currencyId: "coins", amount: 500 },
    ],
    title: {
      type: "title",
      titleId: "title_crafter",
      titleName: "Craftsman",
      titleSuffix: " el Craftsman",
    },
    displayOrder: 8,
  },

  {
    id: "craft_50",
    name: "Master Craftsman",
    description:
      "Craft 50 recipes successfully. Your hands create wonders!",
    tier: "gold",
    category: "crafting",
    condition: { type: "craft_count", count: 50 },
    rewards: [
      { type: "xp", amount: 400 },
      { type: "currency", currencyId: "coins", amount: 2000 },
      {
        type: "badge",
        badgeId: "badge_crafter",
        badgeEmoji: "⚒️",
        badgeName: "Master Craftsman",
      },
    ],
    title: {
      type: "title",
      titleId: "title_master_crafter",
      titleName: "Master Craftsman",
      titlePrefix: "[⚒️ Master] ",
    },
    displayOrder: 9,
  },

  // ============================================================================
  // MINIGAMES
  // ============================================================================

  {
    id: "trivia_wins_10",
    name: "Brilliant Mind",
    description: "Win 10 trivia matches correctly.",
    tier: "silver",
    category: "minigame",
    condition: { type: "trivia_wins", count: 10 },
    rewards: [
      { type: "xp", amount: 200 },
      { type: "currency", currencyId: "coins", amount: 800 },
    ],
    title: {
      type: "title",
      titleId: "title_brain",
      titleName: "Brilliant Mind",
      titleSuffix: " el Sabio",
    },
    displayOrder: 10,
  },

  {
    id: "trivia_wins_50",
    name: "Trivia Genius",
    description: "Win 50 trivia matches. You are a well of knowledge!",
    tier: "platinum",
    category: "minigame",
    condition: { type: "trivia_wins", count: 50 },
    rewards: [
      { type: "xp", amount: 500 },
      { type: "currency", currencyId: "coins", amount: 2500 },
      {
        type: "badge",
        badgeId: "badge_genius",
        badgeEmoji: "🧠",
        badgeName: "Genius",
      },
    ],
    title: {
      type: "title",
      titleId: "title_genius",
      titleName: "Genius",
      titlePrefix: "[🧠 Genius] ",
    },
    displayOrder: 11,
  },

  {
    id: "coinflip_streak_5",
    name: "Beginner's Luck",
    description: "Win coinflip 5 times in a row.",
    tier: "silver",
    category: "minigame",
    condition: { type: "coinflip_streak", consecutiveWins: 5 },
    rewards: [
      { type: "xp", amount: 250 },
      { type: "currency", currencyId: "coins", amount: 1000 },
    ],
    displayOrder: 12,
  },

  // ============================================================================
  // SOCIAL - Robin Hood
  // ============================================================================

  {
    id: "rob_total_5000",
    name: "Robin Hood",
    description:
      "Accumulate 5000 coins stolen successfully (across any number of attempts).",
    tier: "gold",
    category: "social",
    condition: { type: "rob_success", totalAmount: 5000 },
    rewards: [
      { type: "xp", amount: 300 },
      { type: "currency", currencyId: "coins", amount: 1500 },
      {
        type: "badge",
        badgeId: "badge_robin",
        badgeEmoji: "🏹",
        badgeName: "Robin Hood",
      },
    ],
    title: {
      type: "title",
      titleId: "title_robin",
      titleName: "Robin Hood",
      titlePrefix: "[🏹 Robin Hood] ",
    },
    displayOrder: 13,
  },

  // ============================================================================
  // COLLECTION
  // ============================================================================

  {
    id: "store_purchases_20",
    name: "Frequent Customer",
    description: "Complete 20 successful shop purchases.",
    tier: "silver",
    category: "collection",
    condition: { type: "store_purchases", count: 20 },
    rewards: [
      { type: "xp", amount: 200 },
      { type: "currency", currencyId: "coins", amount: 1000 },
    ],
    title: {
      type: "title",
      titleId: "title_shopper",
      titleName: "Shopper",
      titleSuffix: " el Shopper",
    },
    displayOrder: 14,
  },

  {
    id: "items_collected_25",
    name: "Collector",
    description: "Obtain 25 different unique items in your inventory.",
    tier: "gold",
    category: "collection",
    condition: { type: "items_collected", uniqueItems: 25 },
    rewards: [
      { type: "xp", amount: 350 },
      { type: "currency", currencyId: "coins", amount: 1500 },
      {
        type: "badge",
        badgeId: "badge_collector",
        badgeEmoji: "🎒",
        badgeName: "Collector",
      },
    ],
    title: {
      type: "title",
      titleId: "title_collector",
      titleName: "Collector",
      titlePrefix: "[🎒 Collector] ",
    },
    displayOrder: 15,
  },

  // ============================================================================
  // SPECIAL
  // ============================================================================

  {
    id: "quest_completions_10",
    name: "Quest Hunter",
    description: "Complete 10 quest-board missions.",
    tier: "silver",
    category: "special",
    condition: { type: "quest_completions", count: 10 },
    rewards: [
      { type: "xp", amount: 250 },
      { type: "currency", currencyId: "quest_tokens", amount: 5 },
    ],
    title: {
      type: "title",
      titleId: "title_hunter",
      titleName: "Hunter",
      titleSuffix: " el Hunter",
    },
    displayOrder: 16,
  },

  {
    id: "votes_cast_50",
    name: "Popular Jury",
    description: "Cast 50 votes using the voting system.",
    tier: "silver",
    category: "social",
    condition: { type: "votes_cast", count: 50 },
    rewards: [
      { type: "xp", amount: 200 },
      { type: "currency", currencyId: "coins", amount: 1000 },
      {
        type: "badge",
        badgeId: "badge_voter",
        badgeEmoji: "🗳️",
        badgeName: "Voter",
      },
    ],
    displayOrder: 17,
  },
] as const;

/** Achievement definitions map by ID. */
export const ACHIEVEMENT_MAP: ReadonlyMap<string, AchievementDefinition> =
  new Map(ACHIEVEMENT_DEFINITIONS.map((a) => [a.id, a]));

/**
 * Get achievement definition by ID.
 */
export function getAchievementDefinition(
  id: string,
): AchievementDefinition | undefined {
  return ACHIEVEMENT_MAP.get(id);
}

/**
 * Get all achievement definitions.
 */
export function getAllAchievementDefinitions(): readonly AchievementDefinition[] {
  return ACHIEVEMENT_DEFINITIONS;
}

/**
 * Get achievements by category.
 */
export function getAchievementsByCategory(
  category: AchievementDefinition["category"],
): readonly AchievementDefinition[] {
  return ACHIEVEMENT_DEFINITIONS.filter((a) => a.category === category);
}

/**
 * Get achievements by tier.
 */
export function getAchievementsByTier(
  tier: AchievementDefinition["tier"],
): readonly AchievementDefinition[] {
  return ACHIEVEMENT_DEFINITIONS.filter((a) => a.tier === tier);
}



