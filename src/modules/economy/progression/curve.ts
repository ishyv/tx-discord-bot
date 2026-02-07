/**
 * Progression curve (10 levels) - Exponential Growth.
 *
 * Purpose: Define XP thresholds for each level with exponential difficulty.
 * The curve is designed so that:
 * - Levels 1-3: Easy progression (Common items)
 * - Levels 4-5: Moderate difficulty (Uncommon items)
 * - Levels 6-7: Hard (Rare items)
 * - Levels 8-10: Very Hard (Holy items)
 *
 * Formula: Each level requires significantly more XP than the previous.
 * The jump from 5→6 and 7→8 is intentionally steep.
 */

export const MAX_LEVEL = 10;

/**
 * Total XP required to reach each level (index = level).
 * 
 * Progression difficulty:
 * - Level 1→2: 100 XP (Easy)
 * - Level 2→3: 200 XP (Easy)
 * - Level 3→4: 400 XP (Moderate)
 * - Level 4→5: 800 XP (Moderate)
 * - Level 5→6: 2,000 XP (HARD - first major wall)
 * - Level 6→7: 3,500 XP (Hard)
 * - Level 7→8: 6,000 XP (VERY HARD - second major wall)
 * - Level 8→9: 10,000 XP (Very Hard)
 * - Level 9→10: 15,000 XP (EXTREME - final push)
 * 
 * Total to reach Level 10: 38,000 XP
 */
export const LEVEL_XP_TABLE: Readonly<number[]> = Object.freeze([
  0, // Level 1 (starting point)
  100, // Level 2 - Total: 100
  300, // Level 3 - Total: 300 (200 more)
  700, // Level 4 - Total: 700 (400 more)
  1_500, // Level 5 - Total: 1,500 (800 more) [UNCOMMON tier starts]
  3_500, // Level 6 - Total: 3,500 (2,000 more) [RARE tier starts]
  7_000, // Level 7 - Total: 7,000 (3,500 more)
  13_000, // Level 8 - Total: 13,000 (6,000 more) [HOLY tier starts]
  23_000, // Level 9 - Total: 23,000 (10,000 more)
  38_000, // Level 10 - Total: 38,000 (15,000 more) [HOLY tier peak]
]);

/**
 * XP required to level up FROM each level.
 * Example: XP_TO_LEVEL_UP[5] = XP needed to go from level 5 to 6
 */
export const XP_TO_LEVEL_UP: Readonly<number[]> = Object.freeze([
  0, // Level 0 doesn't exist
  100, // To reach Level 2 from Level 1
  200, // To reach Level 3 from Level 2
  400, // To reach Level 4 from Level 3
  800, // To reach Level 5 from Level 4
  2_000, // To reach Level 6 from Level 5 [FIRST WALL]
  3_500, // To reach Level 7 from Level 6
  6_000, // To reach Level 8 from Level 7 [SECOND WALL]
  10_000, // To reach Level 9 from Level 8
  15_000, // To reach Level 10 from Level 9 [FINAL PUSH]
]);

const clampLevel = (level: number): number =>
  Math.max(1, Math.min(MAX_LEVEL, Math.trunc(level)));

/** Get total XP required to reach a given level (1..10). */
export function getXPForLevel(level: number): number {
  const idx = clampLevel(level) - 1;
  return LEVEL_XP_TABLE[idx] ?? 0;
}

/** Get XP needed to level up from current level. */
export function getXPToLevelUp(currentLevel: number): number {
  const level = clampLevel(currentLevel);
  return XP_TO_LEVEL_UP[level] ?? 0;
}

/** Get XP progress in current level (how much XP earned toward next level). */
export function getXPProgressInLevel(totalXP: number): number {
  const currentLevel = getLevelFromXP(totalXP);
  const xpForCurrentLevel = getXPForLevel(currentLevel);
  return totalXP - xpForCurrentLevel;
}

/** Get XP needed to reach next level from current XP. */
export function getXPRemainingToLevelUp(totalXP: number): number {
  const currentLevel = getLevelFromXP(totalXP);
  if (currentLevel >= MAX_LEVEL) return 0;
  
  const xpForNextLevel = getXPForLevel(currentLevel + 1);
  return xpForNextLevel - totalXP;
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

/** Get progress percentage toward next level (0-100). */
export function getLevelProgressPercentage(totalXP: number): number {
  const currentLevel = getLevelFromXP(totalXP);
  if (currentLevel >= MAX_LEVEL) return 100;
  
  const xpInCurrentLevel = getXPProgressInLevel(totalXP);
  const xpNeededForNext = getXPToLevelUp(currentLevel);
  
  return Math.min(100, Math.floor((xpInCurrentLevel / xpNeededForNext) * 100));
}

/**
 * Get a human-readable description of the next level difficulty.
 */
export function getLevelDifficultyDescription(level: number): string {
  switch (level) {
    case 1:
    case 2:
      return "🟢 Easy - Just getting started!";
    case 3:
      return "🟢 Easy - Building momentum";
    case 4:
      return "🔵 Moderate - The grind begins";
    case 5:
      return "🔵 Moderate - Preparing for the wall";
    case 6:
      return "🟣 Hard - First major challenge";
    case 7:
      return "🟣 Hard - Dedication required";
    case 8:
      return "🟡 Very Hard - The elite tier";
    case 9:
      return "🟡 Very Hard - Almost legendary";
    case 10:
      return "🟡 EXTREME - Master of the economy";
    default:
      return "Unknown";
  }
}

/**
 * Estimate time to reach next level based on average XP gain.
 * @param totalXP Current total XP
 * @param xpPerDay Average XP gained per day
 * @returns Days to reach next level
 */
export function estimateDaysToLevelUp(totalXP: number, xpPerDay: number): number {
  if (xpPerDay <= 0) return Infinity;
  
  const xpRemaining = getXPRemainingToLevelUp(totalXP);
  return Math.ceil(xpRemaining / xpPerDay);
}

/**
 * Get rarity tier for a level.
 * Maps levels to item rarity tiers.
 */
export function getRarityForLevel(level: number): string {
  if (level >= 8) return "Holy";
  if (level === 7 || level === 6) return "Rare";
  if (level === 5 || level === 4) return "Uncommon";
  return "Common";
}
