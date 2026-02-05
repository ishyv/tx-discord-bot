/**
 * RPG Stats Calculator.
 *
 * Purpose: Pure functions for calculating RPG combat stats from equipment loadout.
 * Context: Used by profile service and combat system to derive ATK/DEF/MAX_HP.
 * Dependencies: COMBAT_CONFIG for base values, Loadout type from rpg-profile schema.
 *
 * Invariants:
 * - All functions are pure (no side effects, deterministic).
 * - Base stats: ATK=0, DEF=0, MAX_HP=100.
 * - Stats stack additively from all equipped items.
 * - HP clamping ensures current HP never exceeds max HP.
 */

import { COMBAT_CONFIG } from "../config";
import type { Loadout } from "@/db/schemas/rpg-profile";

/** Calculated combat stats result. */
export interface CalculatedStats {
  /** Attack power. */
  atk: number;
  /** Defense power. */
  def: number;
  /** Maximum HP. */
  maxHp: number;
}

/** Item stats resolver function type. */
export type ItemStatsResolver = (itemId: string) => { atk?: number; def?: number; hp?: number } | null;

/** Stats delta for comparing equipment changes. */
export interface StatsDelta {
  /** Change in ATK. */
  atkDelta: number;
  /** Change in DEF. */
  defDelta: number;
  /** Change in max HP. */
  maxHpDelta: number;
}

/** Combat snapshot for fight initialization. */
export interface CombatStatsSnapshot {
  /** Base attack (from equipment). */
  atk: number;
  /** Base defense (from equipment). */
  def: number;
  /** Maximum HP (base + equipment bonus). */
  maxHp: number;
  /** Current HP (clamped to max). */
  hpCurrent: number;
}

/**
 * Calculate combat stats from equipment loadout.
 * Pure function - no side effects.
 *
 * @param loadout - Equipment loadout with item IDs per slot
 * @param resolveItem - Function to resolve item stats from item ID
 * @returns Calculated stats (atk, def, maxHp)
 */
export function calcStats(
  loadout: Loadout,
  resolveItem: ItemStatsResolver,
): CalculatedStats {
  let atk = 0;
  let def = 0;
  let maxHp = COMBAT_CONFIG.baseMaxHp;

  // Sum stats from all equipped items
  for (const [, slotValue] of Object.entries(loadout)) {
    if (!slotValue) continue;

    const itemId = typeof slotValue === "string" ? slotValue : slotValue.itemId;
    const item = resolveItem(itemId);
    if (!item) continue;

    if (item.atk) atk += item.atk;
    if (item.def) def += item.def;
    if (item.hp) maxHp += item.hp;
  }

  return { atk, def, maxHp };
}

/**
 * Clamp current HP to maximum HP.
 * Ensures current HP never exceeds max HP (e.g., after equipment change).
 *
 * @param currentHp - Current HP value
 * @param maxHp - Maximum HP cap
 * @returns Clamped HP value (0 <= result <= maxHp)
 */
export function clampHp(currentHp: number, maxHp: number): number {
  return Math.max(0, Math.min(maxHp, Math.floor(currentHp)));
}

/**
 * Calculate stats delta when changing equipment.
 * Pure function - no side effects.
 *
 * @param currentLoadout - Current equipment loadout
 * @param newLoadout - New equipment loadout
 * @param resolveItem - Function to resolve item stats
 * @returns Stats delta between loadouts
 */
export function calcStatsDelta(
  currentLoadout: Loadout,
  newLoadout: Loadout,
  resolveItem: ItemStatsResolver,
): StatsDelta {
  const currentStats = calcStats(currentLoadout, resolveItem);
  const newStats = calcStats(newLoadout, resolveItem);

  return {
    atkDelta: newStats.atk - currentStats.atk,
    defDelta: newStats.def - currentStats.def,
    maxHpDelta: newStats.maxHp - currentStats.maxHp,
  };
}

/**
 * Compute combat stats snapshot for fight initialization.
 * Resolves equipment stats and clamps current HP to max.
 *
 * @param loadout - Equipment loadout
 * @param hpCurrent - Current HP (may be clamped)
 * @param resolveItem - Function to resolve item stats
 * @returns Combat snapshot with clamped HP
 */
export function computeCombatSnapshot(
  loadout: Loadout,
  hpCurrent: number,
  resolveItem: ItemStatsResolver,
): CombatStatsSnapshot {
  const stats = calcStats(loadout, resolveItem);
  return {
    atk: stats.atk,
    def: stats.def,
    maxHp: stats.maxHp,
    hpCurrent: clampHp(hpCurrent, stats.maxHp),
  };
}

/**
 * Calculate new HP after max HP change.
 * If max HP decreases, current HP is clamped to new max.
 * If max HP increases, current HP stays the same (healing is separate).
 *
 * @param currentHp - Current HP before change
 * @param oldMaxHp - Previous maximum HP
 * @param newMaxHp - New maximum HP
 * @returns Adjusted current HP
 */
export function adjustHpOnMaxChange(
  currentHp: number,
  oldMaxHp: number,
  newMaxHp: number,
): number {
  // If max HP decreased, clamp current HP to new max
  if (newMaxHp < oldMaxHp) {
    return Math.min(currentHp, newMaxHp);
  }
  // If max HP increased, keep current HP (can heal elsewhere)
  return currentHp;
}

/** Legacy EquipmentSlots type for backward compatibility. */
interface LegacyEquipmentSlots {
  [slot: string]: string | null;
}

/** Legacy calculate function signature for backward compatibility. */
function calculateLegacy(
  input: { equipment: LegacyEquipmentSlots; resolveItem: ItemStatsResolver },
): CalculatedStats {
  return calcStats(input.equipment as Loadout, input.resolveItem);
}

/**
 * StatsCalculator namespace for organized access.
 * Maintains backward compatibility with existing code.
 */
export const StatsCalculator = {
  /** Legacy calculate with {equipment, resolveItem} signature. */
  calculate: calculateLegacy,
  /** New direct calculate with (loadout, resolveItem) signature. */
  calcStats,
  calculateDelta: calcStatsDelta,
  clampHp,
  computeSnapshot: computeCombatSnapshot,
  adjustHpOnMaxChange,
  /** Alias for adjustHpOnMaxChange for backward compatibility. */
  adjustCurrentHp: adjustHpOnMaxChange,
} as const;
