/**
 * Launch Ops Module (Phase 10a).
 *
 * Purpose: Startup assertions, ops config, and scheduled reports for safe economy launch.
 */

export { launchOps } from "./service";
export { opsConfigRepo } from "./repository";
export { startupAssertions } from "./startup-assertions";
export { scheduledReporting, startScheduledReporting } from "./scheduled-reports";

export type {
  GuildOpsConfig,
  UpdateOpsConfigInput,
  AssertionResult,
  KillSwitch,
  ScheduledReport,
  OpsHealthStatus,
} from "./types";

export type { InitializationResult } from "./service";

export {
  DEFAULT_GUILD_OPS_CONFIG,
  CANONICAL_CURRENCY_IDS,
  CONFIG_BOUNDS,
  isCanonicalCurrencyId,
  isValidTaxRate,
  isValidFeeRate,
  isValidDailyCooldown,
  isValidWorkCooldown,
  isValidDailyCap,
  isValidReportWindowDays,
  isValidReportHour,
} from "./types";

export {
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
} from "./presets";

export type {
  FeaturePreset,
  FeatureFlagDef,
} from "./presets";

export { featurePresetService } from "./preset-service";
export type {
  PresetApplyResult,
  UnlockSuggestion,
  RolloutStatus,
} from "./preset-service";

export { progressiveUnlock, startProgressiveUnlock, stopProgressiveUnlock } from "./progressive-unlock";
export type {
  ProgressiveUnlockConfig,
  CheckResult,
} from "./progressive-unlock";
