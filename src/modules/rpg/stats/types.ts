/**
 * Stats Calculator Types.
 *
 * Purpose: Type definitions for pure stat calculations.
 * Context: Used by StatsCalculator to derive ATK/DEF/HP from equipment.
 */

export type { EquipmentSlot as EquipmentSlotType } from "../config";
import type { EquipmentSlots } from "../types";
export type { EquipmentSlots };

/** Calculated combat stats. */
export interface CalculatedStats {
  /** Attack power. */
  atk: number;
  /** Defense power. */
  def: number;
  /** Maximum HP. */
  maxHp: number;
}

/** Equipment item with RPG properties. */
export interface EquipmentItem {
  /** Item ID. */
  id: string;
  /** Attack bonus. */
  atk?: number;
  /** Defense bonus. */
  def?: number;
  /** HP bonus. */
  hp?: number;
}

/** Stats calculation input. */
export interface StatsCalculationInput {
  /** Current equipment slots. */
  equipment: EquipmentSlots;
  /** Function to resolve item properties. */
  resolveItem: (itemId: string) => EquipmentItem | null;
}

/** Stats delta for comparisons. */
export interface StatsDelta {
  /** Change in ATK. */
  atkDelta: number;
  /** Change in DEF. */
  defDelta: number;
  /** Change in max HP. */
  maxHpDelta: number;
}
