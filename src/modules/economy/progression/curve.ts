/**
 * Progression curve (12 levels).
 *
 * Levels are derived from total XP thresholds.
 * Level 1 starts at 0 XP. Level 12 is the cap.
 */

export const MAX_LEVEL = 12;

// Total XP required to reach each level (index = level).
// Example: level 2 starts at 100 total XP.
export const LEVEL_XP_TABLE: Readonly<number[]> = Object.freeze([
  0, // level 1
  100, // level 2
  250, // level 3
  450, // level 4
  700, // level 5
  1000, // level 6
  1350, // level 7
  1750, // level 8
  2200, // level 9
  2700, // level 10
  3250, // level 11
  3850, // level 12
]);

const clampLevel = (level: number): number =>
  Math.max(1, Math.min(MAX_LEVEL, Math.trunc(level)));

/** Get total XP required to reach a given level (1..12). */
export function getXPForLevel(level: number): number {
  const idx = clampLevel(level) - 1;
  return LEVEL_XP_TABLE[idx] ?? 0;
}

/** Resolve level from total XP (integer). */
export function getLevelFromXP(totalXP: number): number {
  const xp = Math.max(0, Math.trunc(totalXP));
  let level = 1;

  for (let i = 0; i < LEVEL_XP_TABLE.length; i += 1) {
    if (xp >= LEVEL_XP_TABLE[i]) {
      level = i + 1;
    } else {
      break;
    }
  }

  return clampLevel(level);
}
