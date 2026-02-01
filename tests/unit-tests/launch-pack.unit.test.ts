/**
 * Launch Pack Unit Tests (Phase 10d).
 *
 * Purpose: Verify Launch Week event template and starter questline.
 */

import { assertEqual, assert } from "../db-tests/_utils/assert";
import { ops, type Suite } from "../db-tests/_utils/runner";
import {
  LAUNCH_WEEK_EVENT,
  LAUNCH_WEEK_MODIFIERS,
  STARTER_QUESTLINE,
  getStarterQuestTotalRewards,
  isLaunchWeekEvent,
  getStarterQuestCategory,
} from "../../src/modules/economy/events/launch-pack";

export const suite: Suite = {
  name: "launch-pack",
  tests: [
    // Launch Week Event tests
    {
      name: "LAUNCH_WEEK_EVENT has correct name and description",
      ops: [ops.other],
      run() {
        const nameCheck = LAUNCH_WEEK_EVENT.name.includes("Launch Week") || 
                         LAUNCH_WEEK_EVENT.name.includes("🚀");
        assert(nameCheck, "Launch Week event should have appropriate name");
        assert(LAUNCH_WEEK_EVENT.description && LAUNCH_WEEK_EVENT.description.length > 0, 
          "Launch Week event should have description");
      },
    },
    {
      name: "LAUNCH_WEEK_EVENT has 7 day duration",
      ops: [ops.other],
      run() {
        assertEqual(LAUNCH_WEEK_EVENT.durationHours, 7 * 24, "Duration should be 7 days (168 hours)");
      },
    },
    {
      name: "LAUNCH_WEEK_EVENT has correct modifiers",
      ops: [ops.other],
      run() {
        const mods = LAUNCH_WEEK_EVENT.modifiers;
        assert(mods, "Should have modifiers");
        
        // XP multiplier: 1.2 (+20%)
        assertEqual(mods?.xpMultiplier, 1.2, "XP multiplier should be 1.2");
        
        // Daily reward bonus: 0.1 (+10%)
        assertEqual(mods?.dailyRewardBonusPct, 0.1, "Daily bonus should be 10%");
        
        // Trivia reward bonus: 0.1 (+10%)
        assertEqual(mods?.triviaRewardBonusPct, 0.1, "Trivia bonus should be 10%");
        
        // Store discount: 0.05 (-5%)
        assertEqual(mods?.storeDiscountPct, 0.05, "Store discount should be 5%");
      },
    },
    {
      name: "LAUNCH_WEEK_MODIFIERS has all required fields",
      ops: [ops.other],
      run() {
        const mods = LAUNCH_WEEK_MODIFIERS;
        assertEqual(mods.xpMultiplier, 1.2, "XP multiplier should be 1.2");
        assertEqual(mods.dailyRewardBonusPct, 0.1, "Daily bonus should be 0.1");
        assertEqual(mods.workRewardBonusPct, 0, "Work bonus should be 0");
        assertEqual(mods.triviaRewardBonusPct, 0.1, "Trivia bonus should be 0.1");
        assertEqual(mods.storeDiscountPct, 0.05, "Store discount should be 0.05");
        assertEqual(mods.questRewardBonusPct, 0, "Quest bonus should be 0");
        assertEqual(mods.craftingCostReductionPct, 0, "Crafting reduction should be 0");
      },
    },
    // Starter Questline tests
    {
      name: "STARTER_QUESTLINE has 10 quests",
      ops: [ops.other],
      run() {
        assertEqual(STARTER_QUESTLINE.length, 10, "Should have exactly 10 starter quests");
      },
    },
    {
      name: "All starter quests have starter category",
      ops: [ops.other],
      run() {
        for (const quest of STARTER_QUESTLINE) {
          assertEqual(quest.category, "starter", `Quest ${quest.id} should have category starter`);
        }
      },
    },
    {
      name: "All starter quests have valid requirements",
      ops: [ops.other],
      run() {
        for (const quest of STARTER_QUESTLINE) {
          assert(quest.requirements.length > 0, `Quest ${quest.id} should have requirements`);
          
          for (const req of quest.requirements) {
            assert(req.type, `Quest ${quest.id} should have requirement type`);
            // Different requirement types use different property names
            if (req.type === "spend_currency") {
              assert((req as any).amount > 0, `Quest ${quest.id} should have positive amount`);
            } else {
              assert(req.count > 0, `Quest ${quest.id} should have positive count`);
            }
          }
        }
      },
    },
    {
      name: "All starter quests have rewards",
      ops: [ops.other],
      run() {
        for (const quest of STARTER_QUESTLINE) {
          assert(quest.rewards.length > 0, `Quest ${quest.id} should have rewards`);
        }
      },
    },
    {
      name: "Starter quests have appropriate difficulties",
      ops: [ops.other],
      run() {
        const difficulties = STARTER_QUESTLINE.map(q => q.difficulty);
        const validDifficulties = ["easy", "medium", "hard"];
        
        for (const diff of difficulties) {
          assert(validDifficulties.includes(diff), `Difficulty ${diff} should be valid`);
        }
        
        // Most should be easy or medium for beginners
        const easyCount = difficulties.filter(d => d === "easy").length;
        assert(easyCount >= 3, "Should have at least 3 easy quests for beginners");
      },
    },
    {
      name: "Starter quests include beginner equipment items",
      ops: [ops.other],
      run() {
        const itemRewards = STARTER_QUESTLINE.flatMap(q => 
          q.rewards.filter(r => r.type === "item")
        );
        
        assert(itemRewards.length > 0, "Should have item rewards");
        
        // Check for beginner items
        const hasBeginnerItems = itemRewards.some(r => 
          r.itemId?.includes("starter") || r.itemId?.includes("beginner")
        );
        assert(hasBeginnerItems, "Should have beginner/starter equipment items");
      },
    },
    {
      name: "First quest is First Steps tutorial",
      ops: [ops.other],
      run() {
        const firstQuest = STARTER_QUESTLINE[0];
        assertEqual(firstQuest.id, "starter_first_steps", "First quest should be First Steps");
        assert(firstQuest.difficulty === "easy", "First quest should be easy");
      },
    },
    {
      name: "Last quest is Graduate completion",
      ops: [ops.other],
      run() {
        const lastQuest = STARTER_QUESTLINE[STARTER_QUESTLINE.length - 1];
        assertEqual(lastQuest.id, "starter_graduate", "Last quest should be Graduate");
        assert(lastQuest.difficulty === "hard", "Last quest should be hard");
      },
    },
    // Total rewards tests
    {
      name: "getStarterQuestTotalRewards calculates correctly",
      ops: [ops.other],
      run() {
        const rewards = getStarterQuestTotalRewards();
        
        assert(rewards.totalCoins > 0, "Should have total coins");
        assert(rewards.totalXP > 0, "Should have total XP");
        assert(Object.keys(rewards.totalItems).length > 0, "Should have items");
        
        // Total should be significant but not excessive for beginners
        assert(rewards.totalCoins >= 2500, "Total coins should be at least 2500");
        assert(rewards.totalCoins <= 4000, "Total coins should not exceed 4000");
      },
    },
    // Utility function tests
    {
      name: "isLaunchWeekEvent detects launch week names",
      ops: [ops.other],
      run() {
        assert(isLaunchWeekEvent("🚀 Launch Week"), "Should detect emoji + Launch Week");
        assert(isLaunchWeekEvent("Launch Week Celebration"), "Should detect Launch Week");
        assert(!isLaunchWeekEvent("Summer Festival"), "Should not detect other events");
        assert(!isLaunchWeekEvent(undefined), "Should handle undefined");
        assert(!isLaunchWeekEvent(""), "Should handle empty string");
      },
    },
    {
      name: "getStarterQuestCategory returns correct categories",
      ops: [ops.other],
      run() {
        const tutorialCat = getStarterQuestCategory("starter_first_steps");
        assert(tutorialCat.includes("Tutorial"), "First steps should be tutorial");
        
        const completionCat = getStarterQuestCategory("starter_graduate");
        assert(completionCat.includes("Completion"), "Graduate should be completion");
        
        const generalCat = getStarterQuestCategory("unknown_quest");
        assert(generalCat.includes("General"), "Unknown should be general");
      },
    },
  ],
};
