/**
 * Processing Recipes.
 *
 * Purpose: Define raw to processed material mappings.
 * Context: Used by processing service.
 */

import { PROCESSED_MATERIALS, PROCESSING_CONFIG } from "../config";

/** Get processed material for raw material. */
export function getProcessedMaterial(rawMaterialId: string): string | null {
  return PROCESSED_MATERIALS[rawMaterialId] ?? null;
}

/** Check if material can be processed. */
export function canProcessMaterial(materialId: string): boolean {
  return materialId in PROCESSED_MATERIALS;
}

/** Get material value (for fee calculation). */
export function getMaterialValue(materialId: string): number {
  // Base values for materials
  const values: Record<string, number> = {
    // Ores
    copper_ore: 15,
    iron_ore: 30,
    silver_ore: 60,
    gold_ore: 120,

    // Wood
    oak_wood: 12,
    spruce_wood: 30,
    palm_wood: 60,
    pine_wood: 100,

    // Processed metals
    copper_ingot: 35,
    iron_ingot: 70,
    silver_ingot: 140,
    gold_ingot: 280,

    // Processed wood
    oak_plank: 15,
    spruce_plank: 40,
    palm_plank: 80,
    pine_plank: 130,
  };

  return values[materialId] ?? 10;
}

/** Calculate processing fee. */
export function calculateFee(materialId: string, batches: number): number {
  const value = getMaterialValue(materialId);
  const feePerBatch = Math.floor(value * PROCESSING_CONFIG.feePercent);
  return feePerBatch * batches;
}

/** Calculate success chance with luck. */
export function calculateSuccessChance(luckLevel: number): number {
  const luckBonus = Math.min(
    luckLevel * PROCESSING_CONFIG.luckMultiplier,
    PROCESSING_CONFIG.maxLuckBonus,
  );
  return PROCESSING_CONFIG.baseSuccessRate + luckBonus;
}

/** Materials required per batch. */
export const MATERIALS_PER_BATCH = PROCESSING_CONFIG.materialsRequired;

/** Output per successful batch. */
export const OUTPUT_PER_BATCH = PROCESSING_CONFIG.outputQuantity;
