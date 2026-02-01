/**
 * Event Quests (Phase 9e).
 *
 * Purpose: Special quests that appear during guild events.
 * Context: These quests are designed to engage users during special events.
 */

import type { QuestTemplate, CreateQuestTemplateInput } from "./types";

/** Event quest templates (Phase 9e). */
export const EVENT_QUEST_TEMPLATES: CreateQuestTemplateInput[] = [
  {
    id: "event_enthusiast",
    name: "🎉 Event Enthusiast",
    description: "Claim your daily reward 3 times during the event",
    category: "event",
    difficulty: "easy",
    requirements: [
      { type: "do_command", command: "daily", count: 3 },
    ],
    rewards: [
      { type: "currency", currencyId: "coins", amount: 500, source: "mint" },
      { type: "xp", amount: 100 },
    ],
    cooldownHours: 0, // No cooldown during events
    maxCompletions: 1,
  },
  {
    id: "event_spender",
    name: "💰 Event Spender",
    description: "Spend 1,000 coins at the store during the event",
    category: "event",
    difficulty: "medium",
    requirements: [
      { type: "spend_currency", currencyId: "coins", amount: 1000 },
    ],
    rewards: [
      { type: "currency", currencyId: "coins", amount: 300, source: "mint" },
      { type: "xp", amount: 150 },
    ],
    cooldownHours: 0,
    maxCompletions: 1,
  },
  {
    id: "event_trivia_champion",
    name: "🎯 Trivia Champion",
    description: "Win 5 trivia games during the event",
    category: "event",
    difficulty: "medium",
    requirements: [
      { type: "win_minigame", game: "trivia", count: 5 },
    ],
    rewards: [
      { type: "currency", currencyId: "coins", amount: 750, source: "mint" },
      { type: "xp", amount: 200 },
    ],
    cooldownHours: 0,
    maxCompletions: 1,
  },
  {
    id: "event_master_crafter",
    name: "🔨 Master Crafter",
    description: "Craft 3 items during the event",
    category: "event",
    difficulty: "medium",
    requirements: [
      { type: "craft_recipe", recipeId: "any", count: 3 },
    ],
    rewards: [
      { type: "currency", currencyId: "coins", amount: 600, source: "mint" },
      { type: "xp", amount: 180 },
    ],
    cooldownHours: 0,
    maxCompletions: 1,
  },
  {
    id: "event_community_supporter",
    name: "❤️ Community Supporter",
    description: "Cast 3 love votes during the event",
    category: "event",
    difficulty: "easy",
    requirements: [
      { type: "vote_cast", voteType: "love", count: 3 },
    ],
    rewards: [
      { type: "currency", currencyId: "coins", amount: 400, source: "mint" },
      { type: "xp", amount: 120 },
    ],
    cooldownHours: 0,
    maxCompletions: 1,
  },
  {
    id: "event_power_worker",
    name: "⚡ Power Worker",
    description: "Complete 5 work commands during the event",
    category: "event",
    difficulty: "hard",
    requirements: [
      { type: "do_command", command: "work", count: 5 },
    ],
    rewards: [
      { type: "currency", currencyId: "coins", amount: 1000, source: "mint" },
      { type: "xp", amount: 250 },
    ],
    cooldownHours: 0,
    maxCompletions: 1,
  },
  {
    id: "event_lucky_gambler",
    name: "🎰 Lucky Gambler",
    description: "Play 10 coinflip games during the event",
    category: "event",
    difficulty: "hard",
    requirements: [
      { type: "win_minigame", game: "coinflip", count: 10 },
    ],
    rewards: [
      { type: "currency", currencyId: "coins", amount: 800, source: "mint" },
      { type: "xp", amount: 220 },
      { type: "quest_token", amount: 5 },
    ],
    cooldownHours: 0,
    maxCompletions: 1,
  },
  {
    id: "event_legend",
    name: "🏆 Event Legend",
    description: "Complete all other event quests",
    category: "event",
    difficulty: "legendary",
    requirements: [
      { type: "do_command", command: "daily", count: 1 }, // Placeholder - actual logic handled by quest service
    ],
    rewards: [
      { type: "currency", currencyId: "coins", amount: 5000, source: "mint" },
      { type: "xp", amount: 1000 },
      { type: "quest_token", amount: 25 },
    ],
    cooldownHours: 0,
    maxCompletions: 1,
    minLevel: 5,
  },
];

/** Get event quests for a guild. */
export function getEventQuestTemplates(): CreateQuestTemplateInput[] {
  return EVENT_QUEST_TEMPLATES;
}

/** Check if a quest is an event quest. */
export function isEventQuest(quest: QuestTemplate): boolean {
  return quest.category === "event";
}
