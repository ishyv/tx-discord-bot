/**
 * Feature Presets Unit Tests (Phase 10b).
 *
 * Purpose: Verify preset definitions, diff calculation, and unlock readiness.
 */

import { assertEqual, assert } from "../db-tests/_utils/assert";
import { ops, type Suite } from "../db-tests/_utils/runner";
import {
  getFeaturePreset,
  getPresetDescription,
  getPresetDiff,
  isValidPreset,
  checkUnlockReadiness,
  SOFT_LAUNCH_PRESET,
  FULL_LAUNCH_PRESET,
  MINIMAL_PRESET,
  PROGRESSIVE_UNLOCK_ORDER,
  FEATURE_FLAGS,
} from "../../src/modules/ops";

export const suite: Suite = {
  name: "feature-presets",
  tests: [
    // Preset validation tests
    {
      name: "validates preset names correctly",
      ops: [ops.other],
      run() {
        assert(isValidPreset("soft"), "soft should be valid");
        assert(isValidPreset("full"), "full should be valid");
        assert(isValidPreset("minimal"), "minimal should be valid");
        assert(!isValidPreset("invalid"), "invalid should not be valid");
        assert(!isValidPreset(""), "empty string should not be valid");
      },
    },
    // Soft launch preset tests
    {
      name: "soft preset disables high-risk features",
      ops: [ops.other],
      run() {
        const preset = SOFT_LAUNCH_PRESET;
        assert(!preset.coinflip, "coinflip should be disabled in soft");
        assert(!preset.rob, "rob should be disabled in soft");
        assert(preset.trivia, "trivia should be enabled in soft");
        assert(preset.voting, "voting should be enabled in soft");
        assert(preset.crafting, "crafting should be enabled in soft");
        assert(preset.store, "store should be enabled in soft");
      },
    },
    // Full launch preset tests
    {
      name: "full preset enables all features",
      ops: [ops.other],
      run() {
        const preset = FULL_LAUNCH_PRESET;
        assert(preset.coinflip, "coinflip should be enabled in full");
        assert(preset.rob, "rob should be enabled in full");
        assert(preset.trivia, "trivia should be enabled in full");
        assert(preset.voting, "voting should be enabled in full");
        assert(preset.crafting, "crafting should be enabled in full");
        assert(preset.store, "store should be enabled in full");
      },
    },
    // Minimal preset tests
    {
      name: "minimal preset only enables core features",
      ops: [ops.other],
      run() {
        const preset = MINIMAL_PRESET;
        assert(!preset.coinflip, "coinflip should be disabled in minimal");
        assert(!preset.rob, "rob should be disabled in minimal");
        assert(!preset.trivia, "trivia should be disabled in minimal");
        assert(!preset.voting, "voting should be disabled in minimal");
        assert(!preset.crafting, "crafting should be disabled in minimal");
        assert(preset.store, "store should be enabled in minimal");
      },
    },
    // getFeaturePreset tests
    {
      name: "getFeaturePreset returns correct presets",
      ops: [ops.other],
      run() {
        assertEqual(getFeaturePreset("soft"), SOFT_LAUNCH_PRESET, "should return soft preset");
        assertEqual(getFeaturePreset("full"), FULL_LAUNCH_PRESET, "should return full preset");
        assertEqual(getFeaturePreset("minimal"), MINIMAL_PRESET, "should return minimal preset");
      },
    },
    {
      name: "getFeaturePreset defaults to soft for invalid",
      ops: [ops.other],
      run() {
        // @ts-ignore - testing invalid input
        const preset = getFeaturePreset("invalid");
        assertEqual(preset, SOFT_LAUNCH_PRESET, "should default to soft preset");
      },
    },
    // Preset description tests
    {
      name: "getPresetDescription returns correct descriptions",
      ops: [ops.other],
      run() {
        const softDesc = getPresetDescription("soft");
        const fullDesc = getPresetDescription("full");
        const minimalDesc = getPresetDescription("minimal");

        assert(softDesc.toLowerCase().includes("safe"), "soft description should mention safe");
        assert(softDesc.includes("coinflip"), "soft description should mention coinflip");
        assert(fullDesc.toLowerCase().includes("all"), "full description should mention all");
        assert(minimalDesc.toLowerCase().includes("core"), "minimal description should mention core");
      },
    },
    // Preset diff tests
    {
      name: "getPresetDiff calculates changes correctly",
      ops: [ops.other],
      run() {
        const current = FULL_LAUNCH_PRESET;
        const diff = getPresetDiff("soft", current);

        // Moving from full to soft should disable coinflip and rob
        assert(diff.disabled.includes("coinflip"), "should disable coinflip");
        assert(diff.disabled.includes("rob"), "should disable rob");
        assertEqual(diff.enabled.length, 0, "should not enable anything");
      },
    },
    {
      name: "getPresetDiff detects unchanged features",
      ops: [ops.other],
      run() {
        const current = SOFT_LAUNCH_PRESET;
        const diff = getPresetDiff("soft", current);

        assertEqual(diff.enabled.length, 0, "no features to enable");
        assertEqual(diff.disabled.length, 0, "no features to disable");
        assertEqual(diff.unchanged.length, 6, "all 6 features unchanged");
      },
    },
    {
      name: "getPresetDiff detects features to enable",
      ops: [ops.other],
      run() {
        const current = SOFT_LAUNCH_PRESET;
        const diff = getPresetDiff("full", current);

        assert(diff.enabled.includes("coinflip"), "should enable coinflip");
        assert(diff.enabled.includes("rob"), "should enable rob");
        assertEqual(diff.disabled.length, 0, "should not disable anything");
      },
    },
    // Progressive unlock tests
    {
      name: "checkUnlockReadiness returns ready when thresholds met",
      ops: [ops.other],
      run() {
        const result = checkUnlockReadiness("coinflip", 5, 25);
        assert(result.ready, "should be ready with 5 days and 25 tx/day");
        assert(result.reason.length > 0, "should have a reason");
      },
    },
    {
      name: "checkUnlockReadiness returns not ready when days insufficient",
      ops: [ops.other],
      run() {
        const result = checkUnlockReadiness("coinflip", 1, 25);
        assert(!result.ready, "should not be ready with only 1 day");
        assert(result.reason.includes("day"), "reason should mention days");
      },
    },
    {
      name: "checkUnlockReadiness returns not ready when transactions insufficient",
      ops: [ops.other],
      run() {
        const result = checkUnlockReadiness("coinflip", 5, 10);
        assert(!result.ready, "should not be ready with only 10 tx/day");
        assert(result.reason.includes("transaction"), "reason should mention transactions");
      },
    },
    {
      name: "checkUnlockReadiness handles rob unlock thresholds",
      ops: [ops.other],
      run() {
        const ready = checkUnlockReadiness("rob", 8, 35);
        const notReady = checkUnlockReadiness("rob", 5, 20);

        assert(ready.ready, "rob should be ready with 8 days and 35 tx/day");
        assert(!notReady.ready, "rob should not be ready with 5 days and 20 tx/day");
      },
    },
    // Feature flags metadata tests
    {
      name: "FEATURE_FLAGS contains all expected features",
      ops: [ops.other],
      run() {
        assertEqual(FEATURE_FLAGS.length, 6, "should have 6 features");
        
        const names = FEATURE_FLAGS.map((f) => f.name);
        assert(names.includes("coinflip"), "should include coinflip");
        assert(names.includes("rob"), "should include rob");
        assert(names.includes("trivia"), "should include trivia");
        assert(names.includes("voting"), "should include voting");
        assert(names.includes("crafting"), "should include crafting");
        assert(names.includes("store"), "should include store");
      },
    },
    {
      name: "FEATURE_FLAGS has correct risk levels",
      ops: [ops.other],
      run() {
        const coinflip = FEATURE_FLAGS.find((f) => f.name === "coinflip");
        const rob = FEATURE_FLAGS.find((f) => f.name === "rob");
        const trivia = FEATURE_FLAGS.find((f) => f.name === "trivia");
        const store = FEATURE_FLAGS.find((f) => f.name === "store");

        assertEqual(coinflip?.riskLevel, "high", "coinflip should be high risk");
        assertEqual(rob?.riskLevel, "high", "rob should be high risk");
        assertEqual(trivia?.riskLevel, "low", "trivia should be low risk");
        assertEqual(store?.riskLevel, "low", "store should be low risk");
      },
    },
    // Progressive unlock order tests
    {
      name: "PROGRESSIVE_UNLOCK_ORDER has correct sequence",
      ops: [ops.other],
      run() {
        assertEqual(PROGRESSIVE_UNLOCK_ORDER.length, 2, "should have 2 unlock stages");
        
        const first = PROGRESSIVE_UNLOCK_ORDER[0];
        assertEqual(first.feature, "coinflip", "first unlock should be coinflip");
        assert(first.daysThreshold < PROGRESSIVE_UNLOCK_ORDER[1].daysThreshold, "coinflip should unlock before rob");
      },
    },
    {
      name: "PROGRESSIVE_UNLOCK_ORDER thresholds are reasonable",
      ops: [ops.other],
      run() {
        for (const unlock of PROGRESSIVE_UNLOCK_ORDER) {
          assert(unlock.daysThreshold > 0, "days threshold should be positive");
          assert(unlock.transactionsPerDayThreshold > 0, "tx threshold should be positive");
          assert(unlock.reason.length > 0, "should have a reason");
        }
      },
    },
  ],
};
