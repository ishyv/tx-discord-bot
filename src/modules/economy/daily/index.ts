/**
 * Daily Claim Module.
 *
 * Purpose: Atomic cooldown and claim state for /daily.
 */

export { dailyClaimRepo } from "./repository";
export { computeDailyStreakBonus } from "./bonus";
export { buildDailyClaimAuditMetadata } from "./audit";
export type { DailyClaimRecord, DailyClaimRepo } from "./repository";
