/**
 * Daily claim audit metadata builder.
 *
 * Purpose: Ensure consistent metadata payloads for daily claim audits.
 */

export interface DailyClaimAuditMetadataInput {
  readonly correlationId: string;
  readonly fee: number;
  readonly streakBefore: number;
  readonly streakAfter: number;
  readonly bestStreakAfter: number;
  readonly streakBonus: number;
  readonly baseReward: number;
  readonly totalReward: number;
  readonly netReward: number;
  readonly feeSector: string | null;
}

export function buildDailyClaimAuditMetadata(
  input: DailyClaimAuditMetadataInput,
) {
  return {
    correlationId: input.correlationId,
    fee: input.fee,
    streakBefore: input.streakBefore,
    streakAfter: input.streakAfter,
    bestStreakAfter: input.bestStreakAfter,
    streakBonus: input.streakBonus,
    baseReward: input.baseReward,
    totalReward: input.totalReward,
    netReward: input.netReward,
    feeSector: input.feeSector,
  };
}
