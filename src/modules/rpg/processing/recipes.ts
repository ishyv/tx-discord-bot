/**
 * Processing Recipes.
 *
 * Purpose: Define raw to processed material mappings.
 * Context: Used by processing service.
 */

import { PROCESSED_MATERIALS, PROCESSING_CONFIG } from "../config";
import { getContentRegistry } from "@/modules/content";
import { getItemDefinition } from "@/modules/inventory/items";

export interface ProcessingRecipe {
  readonly id: string;
  readonly rawMaterialId: string;
  readonly outputMaterialId: string;
  readonly materialsPerBatch: number;
  readonly outputPerBatch: number;
}

const LEGACY_PROCESSING_RECIPES: Record<string, ProcessingRecipe> = Object.entries(
  PROCESSED_MATERIALS,
).reduce<Record<string, ProcessingRecipe>>((acc, [rawMaterialId, outputMaterialId]) => {
  acc[rawMaterialId] = {
    id: `legacy_process_${rawMaterialId}`,
    rawMaterialId,
    outputMaterialId,
    materialsPerBatch: PROCESSING_CONFIG.materialsRequired,
    outputPerBatch: PROCESSING_CONFIG.outputQuantity,
  };
  return acc;
}, {});

/** Resolve processing recipe (content-first, legacy fallback). */
export function getProcessingRecipe(rawMaterialId: string): ProcessingRecipe | null {
  const registry = getContentRegistry();
  const contentRecipe = registry?.findProcessingRecipeByInput(rawMaterialId);

  if (contentRecipe) {
    const input = contentRecipe.itemInputs[0];
    const output = contentRecipe.itemOutputs[0];

    if (input && output) {
      return {
        id: contentRecipe.id,
        rawMaterialId: input.itemId,
        outputMaterialId: output.itemId,
        materialsPerBatch: input.quantity,
        outputPerBatch: output.quantity,
      };
    }
  }

  return LEGACY_PROCESSING_RECIPES[rawMaterialId] ?? null;
}

/** List all raw material IDs that can be processed. */
export function listProcessableMaterials(): string[] {
  const ids = new Set<string>(Object.keys(LEGACY_PROCESSING_RECIPES));
  const registry = getContentRegistry();

  if (registry) {
    for (const recipe of registry.listRecipesByType("processing")) {
      const input = recipe.itemInputs[0];
      if (input?.itemId) {
        ids.add(input.itemId);
      }
    }
  }

  return Array.from(ids);
}

/** Get processed material for raw material. */
export function getProcessedMaterial(rawMaterialId: string): string | null {
  return getProcessingRecipe(rawMaterialId)?.outputMaterialId ?? null;
}

/** Check if material can be processed. */
export function canProcessMaterial(materialId: string): boolean {
  return getProcessingRecipe(materialId) !== null;
}

/** Get material value (for fee calculation). */
export function getMaterialValue(materialId: string): number {
  const contentOrLegacyDef = getItemDefinition(materialId);
  if (contentOrLegacyDef?.value !== undefined) {
    return contentOrLegacyDef.value;
  }

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
