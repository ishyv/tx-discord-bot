/**
 * Feature Presets for Soft Launch.
 *
 * Purpose: Define feature flag presets for progressive rollout.
 * Context: Used by LaunchOpsService to apply safe configurations.
 */

import type { EconomyFeatureFlags } from "@/modules/economy/guild";

/** Feature preset types. */
export type FeaturePreset = "soft" | "full" | "minimal";

/** Feature flags with descriptions. */
export interface FeatureFlagDef {
  readonly name: keyof EconomyFeatureFlags;
  readonly description: string;
  readonly riskLevel: "low" | "medium" | "high";
  readonly category: "minigame" | "social" | "economy" | "inventory";
}

/** All available feature flags with metadata. */
export const FEATURE_FLAGS: FeatureFlagDef[] = [
  { name: "coinflip", description: "Coinflip minigame", riskLevel: "high", category: "minigame" },
  { name: "trivia", description: "Trivia minigame", riskLevel: "low", category: "minigame" },
  { name: "rob", description: "Rob minigame", riskLevel: "high", category: "minigame" },
  { name: "voting", description: "Love/Hate voting", riskLevel: "low", category: "social" },
  { name: "crafting", description: "Item crafting", riskLevel: "low", category: "inventory" },
  { name: "store", description: "Item store", riskLevel: "low", category: "economy" },
];

/** Soft launch preset - safe features only. */
export const SOFT_LAUNCH_PRESET: EconomyFeatureFlags = {
  coinflip: false,  // High risk - gambling
  trivia: true,     // Low risk - knowledge based
  rob: false,       // High risk - theft mechanic
  voting: true,     // Low risk - social feature
  crafting: true,   // Low risk - inventory management
  store: true,      // Low risk - commerce
};

/** Full launch preset - all features enabled. */
export const FULL_LAUNCH_PRESET: EconomyFeatureFlags = {
  coinflip: true,
  trivia: true,
  rob: true,
  voting: true,
  crafting: true,
  store: true,
};

/** Minimal preset - core economy only. */
export const MINIMAL_PRESET: EconomyFeatureFlags = {
  coinflip: false,
  trivia: false,
  rob: false,
  voting: false,
  crafting: false,
  store: true,  // Store is essential
};

/** Get preset by name. */
export function getFeaturePreset(preset: FeaturePreset): EconomyFeatureFlags {
  switch (preset) {
    case "soft":
      return SOFT_LAUNCH_PRESET;
    case "full":
      return FULL_LAUNCH_PRESET;
    case "minimal":
      return MINIMAL_PRESET;
    default:
      return SOFT_LAUNCH_PRESET;
  }
}

/** Get human-readable preset description. */
export function getPresetDescription(preset: FeaturePreset): string {
  switch (preset) {
    case "soft":
      return "Safe features only (disables coinflip and rob)";
    case "full":
      return "All features enabled";
    case "minimal":
      return "Core economy only (daily/work/store)";
    default:
      return "Unknown preset";
  }
}

/** Get list of features enabled/disabled by preset. */
export function getPresetDiff(
  preset: FeaturePreset,
  current?: EconomyFeatureFlags,
): { enabled: string[]; disabled: string[]; unchanged: string[] } {
  const target = getFeaturePreset(preset);
  const base = current ?? FULL_LAUNCH_PRESET;

  const enabled: string[] = [];
  const disabled: string[] = [];
  const unchanged: string[] = [];

  for (const flag of FEATURE_FLAGS) {
    const key = flag.name;
    if (target[key] && !base[key]) {
      enabled.push(key);
    } else if (!target[key] && base[key]) {
      disabled.push(key);
    } else {
      unchanged.push(key);
    }
  }

  return { enabled, disabled, unchanged };
}

/** Validate if a preset name is valid. */
export function isValidPreset(preset: string): preset is FeaturePreset {
  return ["soft", "full", "minimal"].includes(preset);
}

/** Get recommended unlock order for progressive rollout. */
export const PROGRESSIVE_UNLOCK_ORDER: Array<{
  feature: keyof EconomyFeatureFlags;
  daysThreshold: number;
  transactionsPerDayThreshold: number;
  reason: string;
}> = [
  {
    feature: "coinflip",
    daysThreshold: 3,
    transactionsPerDayThreshold: 20,
    reason: "Community is active, safe to enable gambling minigame",
  },
  {
    feature: "rob",
    daysThreshold: 7,
    transactionsPerDayThreshold: 30,
    reason: "Strong economy activity, ready for theft mechanics",
  },
];

/** Check if a feature is ready for unlock. */
export function checkUnlockReadiness(
  feature: keyof EconomyFeatureFlags,
  daysSinceLaunch: number,
  avgTransactionsPerDay: number,
): { ready: boolean; reason: string } {
  const unlock = PROGRESSIVE_UNLOCK_ORDER.find((u) => u.feature === feature);
  if (!unlock) {
    return { ready: false, reason: "No unlock criteria defined" };
  }

  const daysOk = daysSinceLaunch >= unlock.daysThreshold;
  const txOk = avgTransactionsPerDay >= unlock.transactionsPerDayThreshold;

  if (daysOk && txOk) {
    return { ready: true, reason: unlock.reason };
  }

  const reasons: string[] = [];
  if (!daysOk) {
    reasons.push(`wait ${unlock.daysThreshold - daysSinceLaunch} more days`);
  }
  if (!txOk) {
    reasons.push(`need ${unlock.transactionsPerDayThreshold - avgTransactionsPerDay} more daily transactions`);
  }

  return { ready: false, reason: reasons.join(", ") };
}
