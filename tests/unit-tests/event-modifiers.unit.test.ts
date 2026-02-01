/**
 * Event Modifiers Unit Tests (Phase 9e).
 *
 * Purpose: Test event modifier calculations and application.
 */

import { assertEqual, assert } from "../db-tests/_utils/assert";
import { ops, type Suite } from "../db-tests/_utils/runner";
import {
  applyEventMultiplier,
  applyEventDiscount,
  isEventActive,
  buildDefaultEventConfig,
  buildEventModifiers,
  getModifierSummary,
  DEFAULT_EVENT_MODIFIERS,
} from "../../src/modules/economy/events/types";

export const suite: Suite = {
  name: "event-modifiers",
  tests: [
    {
      name: "applyEventMultiplier applies XP multiplier correctly",
      ops: [ops.other],
      run() {
        const result = applyEventMultiplier(100, 1.5); // 50% bonus
        assertEqual(result, 150, "XP should be multiplied by 1.5");
      },
    },
    {
      name: "applyEventMultiplier rounds to nearest integer",
      ops: [ops.other],
      run() {
        const result = applyEventMultiplier(100, 1.33); // 33% bonus
        assertEqual(result, 133, "Should round 133.33 to 133");
      },
    },
    {
      name: "applyEventMultiplier returns 0 for negative results",
      ops: [ops.other],
      run() {
        const result = applyEventMultiplier(100, -0.5); // Negative multiplier
        assertEqual(result, 0, "Should return 0 for negative multiplier");
      },
    },
    {
      name: "applyEventDiscount applies discount correctly",
      ops: [ops.other],
      run() {
        const result = applyEventDiscount(100, 0.2); // 20% discount
        assertEqual(result, 80, "Price should be 80 after 20% discount");
      },
    },
    {
      name: "applyEventDiscount minimum price is 1",
      ops: [ops.other],
      run() {
        const result = applyEventDiscount(10, 0.95); // 95% discount
        assertEqual(result, 1, "Minimum price should be 1");
      },
    },
    {
      name: "isEventActive returns false when disabled",
      ops: [ops.other],
      run() {
        const config = buildDefaultEventConfig();
        assert(!isEventActive(config), "Disabled event should not be active");
      },
    },
    {
      name: "isEventActive returns true when enabled and no time bounds",
      ops: [ops.other],
      run() {
        const config = {
          ...buildDefaultEventConfig(),
          enabled: true,
          name: "Test Event",
        };
        assert(isEventActive(config), "Enabled event should be active");
      },
    },
    {
      name: "isEventActive returns false when before start time",
      ops: [ops.other],
      run() {
        const future = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now
        const config = {
          ...buildDefaultEventConfig(),
          enabled: true,
          name: "Test Event",
          startsAt: future,
        };
        assert(!isEventActive(config), "Event should not be active before start time");
      },
    },
    {
      name: "isEventActive returns false when after end time",
      ops: [ops.other],
      run() {
        const past = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
        const config = {
          ...buildDefaultEventConfig(),
          enabled: true,
          name: "Test Event",
          endsAt: past,
        };
        assert(!isEventActive(config), "Event should not be active after end time");
      },
    },
    {
      name: "isEventActive returns true when within time bounds",
      ops: [ops.other],
      run() {
        const past = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
        const future = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now
        const config = {
          ...buildDefaultEventConfig(),
          enabled: true,
          name: "Test Event",
          startsAt: past,
          endsAt: future,
        };
        assert(isEventActive(config), "Event should be active within time bounds");
      },
    },
    {
      name: "buildEventModifiers applies partial overrides",
      ops: [ops.other],
      run() {
        const modifiers = buildEventModifiers({ xpMultiplier: 2.0 });
        assertEqual(modifiers.xpMultiplier, 2.0, "XP multiplier should be 2.0");
        assertEqual(modifiers.dailyRewardBonusPct, 0, "Daily bonus should be default (0)");
        assertEqual(modifiers.storeDiscountPct, 0, "Store discount should be default (0)");
      },
    },
    {
      name: "buildEventModifiers uses all defaults when empty",
      ops: [ops.other],
      run() {
        const modifiers = buildEventModifiers();
        assertEqual(modifiers.xpMultiplier, DEFAULT_EVENT_MODIFIERS.xpMultiplier);
        assertEqual(modifiers.dailyRewardBonusPct, DEFAULT_EVENT_MODIFIERS.dailyRewardBonusPct);
        assertEqual(modifiers.workRewardBonusPct, DEFAULT_EVENT_MODIFIERS.workRewardBonusPct);
        assertEqual(modifiers.triviaRewardBonusPct, DEFAULT_EVENT_MODIFIERS.triviaRewardBonusPct);
        assertEqual(modifiers.storeDiscountPct, DEFAULT_EVENT_MODIFIERS.storeDiscountPct);
        assertEqual(modifiers.questRewardBonusPct, DEFAULT_EVENT_MODIFIERS.questRewardBonusPct);
        assertEqual(modifiers.craftingCostReductionPct, DEFAULT_EVENT_MODIFIERS.craftingCostReductionPct);
      },
    },
    {
      name: "getModifierSummary shows XP multiplier",
      ops: [ops.other],
      run() {
        const modifiers = buildEventModifiers({ xpMultiplier: 1.5 });
        const summary = getModifierSummary(modifiers);
        assert(summary.includes("+50% XP"), "Summary should include +50% XP");
      },
    },
    {
      name: "getModifierSummary shows store discount",
      ops: [ops.other],
      run() {
        const modifiers = buildEventModifiers({ storeDiscountPct: 0.2 });
        const summary = getModifierSummary(modifiers);
        assert(summary.includes("-20% Store"), "Summary should include -20% Store");
      },
    },
    {
      name: "getModifierSummary shows multiple modifiers",
      ops: [ops.other],
      run() {
        const modifiers = buildEventModifiers({
          xpMultiplier: 2.0,
          dailyRewardBonusPct: 0.5,
          storeDiscountPct: 0.25,
        });
        const summary = getModifierSummary(modifiers);
        assert(summary.includes("+100% XP"), "Summary should include XP bonus");
        assert(summary.includes("+50% Daily"), "Summary should include Daily bonus");
        assert(summary.includes("-25% Store"), "Summary should include Store discount");
      },
    },
    {
      name: "getModifierSummary returns 'No modifiers' when empty",
      ops: [ops.other],
      run() {
        const modifiers = buildDefaultEventConfig().modifiers;
        const summary = getModifierSummary(modifiers);
        assertEqual(summary, "No modifiers", "Should return 'No modifiers' when no active modifiers");
      },
    },
  ],
};
