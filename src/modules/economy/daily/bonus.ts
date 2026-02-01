/**
 * Daily streak bonus calculation.
 *
 * Purpose: Centralize streak bonus formula and caps.
 * Encaje: Used by /daily and tests to ensure consistent behavior.
 */

export interface DailyStreakBonusInput {
  readonly streak: number;
  readonly perStreakBonus: number;
  readonly streakCap: number;
}

export function computeDailyStreakBonus(input: DailyStreakBonusInput): number {
  const streak = Math.max(0, Math.trunc(input.streak));
  const cap = Math.max(0, Math.trunc(input.streakCap));
  const perBonus = Math.max(0, Math.trunc(input.perStreakBonus));
  return Math.min(streak, cap) * perBonus;
}
