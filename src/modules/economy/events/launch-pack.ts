/**
 * Launch Event Pack (Phase 10d).
 *
 * Purpose: Default "Launch Week" event template and starter questline.
 * Context: Pre-configured event for server launches with beginner-friendly quests.
 */

import type { StartEventInput, EventModifiers } from "./types";
import type { CreateQuestTemplateInput } from "../quests/types";

/** Launch Week event template - 7 day celebration with starter bonuses. */
export const LAUNCH_WEEK_EVENT: StartEventInput = {
  name: "🚀 Launch Week",
  description: "Celebrate the launch of our economy system with boosted rewards and special quests! New players get extra help to get started.",
  durationHours: 7 * 24, // 7 days
  modifiers: {
    xpMultiplier: 1.2,           // +20% XP
    dailyRewardBonusPct: 0.1,    // +10% Daily rewards
    triviaRewardBonusPct: 0.1,   // +10% Trivia rewards
    storeDiscountPct: 0.05,      // -5% Store prices
  },
};

/** Launch Week modifiers for reference. */
export const LAUNCH_WEEK_MODIFIERS: EventModifiers = {
  xpMultiplier: 1.2,
  dailyRewardBonusPct: 0.1,
  workRewardBonusPct: 0,
  triviaRewardBonusPct: 0.1,
  storeDiscountPct: 0.05,
  questRewardBonusPct: 0,
  craftingCostReductionPct: 0,
};

/** Starter questline - 10 quests for new players (completable in 1-2 days). */
export const STARTER_QUESTLINE: CreateQuestTemplateInput[] = [
  // Tutorial / Onboarding Quests (Easy, Day 1)
  {
    id: "starter_first_steps",
    name: "👣 First Steps",
    description: "Welcome! Claim your first daily reward to get started.",
    category: "starter",
    difficulty: "easy",
    requirements: [
      { type: "do_command", command: "daily", count: 1 },
    ],
    rewards: [
      { type: "currency", currencyId: "coins", amount: 100, source: "mint" },
      { type: "xp", amount: 50 },
      { type: "item", itemId: "starter_backpack", quantity: 1 }, // Beginner equipment
    ],
    cooldownHours: 0,
    maxCompletions: 1,
    minLevel: 1,
  },
  {
    id: "starter_work_ethic",
    name: "💼 Work Ethic",
    description: "Try the work command to earn your first wages.",
    category: "starter",
    difficulty: "easy",
    requirements: [
      { type: "do_command", command: "work", count: 1 },
    ],
    rewards: [
      { type: "currency", currencyId: "coins", amount: 150, source: "mint" },
      { type: "xp", amount: 75 },
    ],
    cooldownHours: 0,
    maxCompletions: 1,
    minLevel: 1,
  },
  {
    id: "starter_bank_visit",
    name: "🏦 Bank Visit",
    description: "Deposit some coins to keep them safe using the bank or deposit command.",
    category: "starter",
    difficulty: "easy",
    requirements: [
      { type: "spend_currency", currencyId: "coins", amount: 50 }, // Deposit counts as moving currency
    ],
    rewards: [
      { type: "currency", currencyId: "coins", amount: 75, source: "mint" },
      { type: "xp", amount: 60 },
    ],
    cooldownHours: 0,
    maxCompletions: 1,
    minLevel: 1,
  },
  
  // Exploration Quests (Easy-Medium, Day 1-2)
  {
    id: "starter_shopper",
    name: "🛍️ First Purchase",
    description: "Visit the store and buy your first item.",
    category: "starter",
    difficulty: "easy",
    requirements: [
      { type: "do_command", command: "store", count: 1 }, // Viewing store counts
    ],
    rewards: [
      { type: "currency", currencyId: "coins", amount: 100, source: "mint" },
      { type: "xp", amount: 50 },
      { type: "item", itemId: "starter_potion", quantity: 3 }, // Consumables
    ],
    cooldownHours: 0,
    maxCompletions: 1,
    minLevel: 1,
  },
  {
    id: "starter_trivia_novice",
    name: "🧠 Trivia Novice",
    description: "Test your knowledge! Play a game of trivia.",
    category: "starter",
    difficulty: "easy",
    requirements: [
      { type: "win_minigame", game: "trivia", count: 1 },
    ],
    rewards: [
      { type: "currency", currencyId: "coins", amount: 200, source: "mint" },
      { type: "xp", amount: 100 },
    ],
    cooldownHours: 0,
    maxCompletions: 1,
    minLevel: 1,
  },
  
  // Progression Quests (Medium, Day 2)
  {
    id: "starter_consistency",
    name: "📅 Daily Habit",
    description: "Claim daily rewards on 2 different days.",
    category: "starter",
    difficulty: "medium",
    requirements: [
      { type: "do_command", command: "daily", count: 2 },
    ],
    rewards: [
      { type: "currency", currencyId: "coins", amount: 250, source: "mint" },
      { type: "xp", amount: 125 },
      { type: "item", itemId: "starter_ring", quantity: 1 }, // Equipment
    ],
    cooldownHours: 0,
    maxCompletions: 1,
    minLevel: 1,
  },
  {
    id: "starter_hard_worker",
    name: "⚒️ Hard Worker",
    description: "Complete work commands 3 times.",
    category: "starter",
    difficulty: "medium",
    requirements: [
      { type: "do_command", command: "work", count: 3 },
    ],
    rewards: [
      { type: "currency", currencyId: "coins", amount: 300, source: "mint" },
      { type: "xp", amount: 150 },
    ],
    cooldownHours: 0,
    maxCompletions: 1,
    minLevel: 2,
  },
  {
    id: "starter_crafter",
    name: "🔨 Budding Crafter",
    description: "Craft your first item.",
    category: "starter",
    difficulty: "medium",
    requirements: [
      { type: "craft_recipe", recipeId: "any", count: 1 },
    ],
    rewards: [
      { type: "currency", currencyId: "coins", amount: 200, source: "mint" },
      { type: "xp", amount: 100 },
      { type: "item", itemId: "starter_hammer", quantity: 1 }, // Crafting tool
    ],
    cooldownHours: 0,
    maxCompletions: 1,
    minLevel: 2,
  },
  
  // Challenge Quests (Medium-Hard, Day 2)
  {
    id: "starter_trivia_enthusiast",
    name: "🎯 Trivia Enthusiast",
    description: "Win 3 trivia games.",
    category: "starter",
    difficulty: "medium",
    requirements: [
      { type: "win_minigame", game: "trivia", count: 3 },
    ],
    rewards: [
      { type: "currency", currencyId: "coins", amount: 400, source: "mint" },
      { type: "xp", amount: 200 },
      { type: "item", itemId: "starter_amulet", quantity: 1 }, // Equipment
    ],
    cooldownHours: 0,
    maxCompletions: 1,
    minLevel: 3,
  },
  
  // Completion Quest (Hard, Day 2-3)
  {
    id: "starter_graduate",
    name: "🎓 Starter Graduate",
    description: "Complete all other starter quests to prove you've mastered the basics!",
    category: "starter",
    difficulty: "hard",
    requirements: [
      { type: "do_command", command: "daily", count: 1 }, // Placeholder - actual completion tracked by quest service
    ],
    rewards: [
      { type: "currency", currencyId: "coins", amount: 1000, source: "mint" },
      { type: "xp", amount: 500 },
      { type: "item", itemId: "starter_set", quantity: 1 }, // Complete beginner set
      { type: "currency", currencyId: "tokens", amount: 5, source: "mint" }, // Premium currency
    ],
    cooldownHours: 0,
    maxCompletions: 1,
    minLevel: 3,
  },
];

/** Get total starter quest rewards (for documentation). */
export function getStarterQuestTotalRewards(): {
  totalCoins: number;
  totalXP: number;
  totalItems: Record<string, number>;
} {
  const totalCoins = STARTER_QUESTLINE.reduce(
    (sum, q) => sum + q.rewards.filter((r) => r.type === "currency" && r.currencyId === "coins")
      .reduce((s, r) => s + ((r as import("../quests/types").CurrencyReward).amount ?? 0), 0),
    0
  );
  
  const totalXP = STARTER_QUESTLINE.reduce(
    (sum, q) => sum + q.rewards.filter((r) => r.type === "xp")
      .reduce((s, r) => s + (r as import("../quests/types").XPReward).amount, 0),
    0
  );
  
  const totalItems: Record<string, number> = {};
  for (const quest of STARTER_QUESTLINE) {
    for (const reward of quest.rewards) {
      if (reward.type === "item" && reward.itemId) {
        totalItems[reward.itemId] = (totalItems[reward.itemId] ?? 0) + reward.quantity;
      }
    }
  }
  
  return { totalCoins, totalXP, totalItems };
}

/** Check if launch week event is currently active for a guild. */
export function isLaunchWeekEvent(eventName: string | undefined): boolean {
  if (!eventName) return false;
  return eventName.toLowerCase().includes("launch") || 
         eventName.toLowerCase().includes("semana de lanzamiento");
}

/** Starter quest categories for display. */
export const STARTER_QUEST_CATEGORIES = {
  tutorial: "📚 Tutorial",
  exploration: "🔍 Exploration",
  progression: "📈 Progression",
  challenge: "⚔️ Challenge",
  completion: "🏆 Completion",
} as const;

/** Map starter quests to their display categories. */
export function getStarterQuestCategory(questId: string): string {
  const categoryMap: Record<string, keyof typeof STARTER_QUEST_CATEGORIES> = {
    starter_first_steps: "tutorial",
    starter_work_ethic: "tutorial",
    starter_bank_visit: "tutorial",
    starter_shopper: "exploration",
    starter_trivia_novice: "exploration",
    starter_consistency: "progression",
    starter_hard_worker: "progression",
    starter_crafter: "progression",
    starter_trivia_enthusiast: "challenge",
    starter_graduate: "completion",
  };
  
  const key = categoryMap[questId];
  return key ? STARTER_QUEST_CATEGORIES[key] : "📋 General";
}
