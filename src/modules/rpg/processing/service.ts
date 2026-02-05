/**
 * RPG Processing Service.
 *
 * Purpose: Process raw materials into refined materials with success chance.
 * Context: 2 raw -> 1 processed with 62% base success + luck modifier.
 * Dependencies: ItemMutationService, CurrencyMutationService, GuildEconomyService.
 *
 * Invariants:
 * - 2 raw materials consumed per attempt (batch).
 * - Base 62% success rate (from config).
 * - Luck adds +1% per level, capped at +25%.
 * - Fee paid to guild economy "trade" sector per attempt.
 * - Fee scales with material tier.
 * - Failure consumes inputs, produces nothing.
 */

import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId } from "@/db/types";
import { economyAuditRepo } from "@/modules/economy/audit/repository";
import { itemMutationService } from "@/modules/economy/mutations/items/service";
import { currencyMutationService } from "@/modules/economy/mutations/service";
import { guildEconomyService } from "@/modules/economy/guild/service";
import { progressionService } from "@/modules/economy/progression/service";
import { UserStore } from "@/db/repositories/users";
import { normalizeModernInventory, getModernItemQuantity } from "@/modules/inventory/inventory";
import { rpgProfileRepo } from "../profile/repository";
import { RpgError } from "../profile/types";
import type { ProcessingResult, ProcessingInput, ProcessingBatchResult } from "./types";
import {
  getProcessedMaterial,
  canProcessMaterial,
  calculateFee,
  calculateSuccessChance,
  MATERIALS_PER_BATCH,
  OUTPUT_PER_BATCH,
} from "./recipes";

export interface RpgProcessingService {
  /**
   * Process raw materials.
   * @param input - Processing parameters
   * @returns Result with success/failure details
   */
  process(input: ProcessingInput): Promise<Result<ProcessingResult, RpgError>>;

  /**
   * Get processing info for a material.
   * @param materialId - Raw material ID
   * @param guildId - Guild ID for luck calculation
   * @param userId - User ID for luck calculation
   * @returns Processing info
   */
  getProcessingInfo(
    materialId: string,
    guildId?: string,
    userId?: string,
  ): Promise<{ canProcess: boolean; outputId: string | null; successChance: number; fee: number }>;
}

/** Calculate luck level from user progression. */
async function getUserLuckLevel(guildId: string | undefined, userId: UserId): Promise<number> {
  if (!guildId) return 0;
  
  // Get progression level as base luck
  const progressResult = await progressionService.getProgressView(guildId, userId);
  if (progressResult.isOk()) {
    const level = progressResult.unwrap()?.level ?? 0;
    // Luck = level / 10, capped at 25
    return Math.min(25, Math.floor(level / 10));
  }
  return 0;
}

class RpgProcessingServiceImpl implements RpgProcessingService {
  async process(input: ProcessingInput): Promise<Result<ProcessingResult, RpgError>> {
    const correlationId = input.correlationId ?? this.generateCorrelationId();
    
    // Calculate batches from quantity (floor to pairs)
    const requestedQty = input.quantity ?? 2;
    const batches = Math.floor(requestedQty / MATERIALS_PER_BATCH);
    
    if (batches < 1) {
      return ErrResult(
        new RpgError("INSUFFICIENT_MATERIALS", `Need at least ${MATERIALS_PER_BATCH} materials to process`),
      );
    }

    // Step 1: Validate profile
    const profileResult = await rpgProfileRepo.findById(input.userId);
    if (profileResult.isErr() || !profileResult.unwrap()) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "RPG profile not found"));
    }

    // Step 2: Validate material can be processed
    if (!canProcessMaterial(input.rawMaterialId)) {
      return ErrResult(
        new RpgError("PROCESSING_FAILED", "This material cannot be processed"),
      );
    }

    const outputMaterialId = getProcessedMaterial(input.rawMaterialId);
    if (!outputMaterialId) {
      return ErrResult(
        new RpgError("PROCESSING_FAILED", "No processing recipe found for this material"),
      );
    }

    // Step 3: Check inventory
    const userResult = await UserStore.get(input.userId);
    if (userResult.isErr() || !userResult.unwrap()) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "User not found"));
    }

    const inventory = normalizeModernInventory(userResult.unwrap()!.inventory);
    const requiredMaterials = MATERIALS_PER_BATCH * batches;
    const availableMaterials = getModernItemQuantity(inventory, input.rawMaterialId);

    if (availableMaterials < requiredMaterials) {
      return ErrResult(
        new RpgError(
          "INSUFFICIENT_MATERIALS",
          `Need ${requiredMaterials} ${input.rawMaterialId}, have ${availableMaterials}`,
        ),
      );
    }

    // Step 4: Calculate luck and success chance
    const luckLevel = input.luckLevel ?? await getUserLuckLevel(input.guildId, input.userId);
    const successChance = calculateSuccessChance(luckLevel);

    // Step 5: Calculate total fee
    const totalFee = calculateFee(input.rawMaterialId, batches);

    // Step 6: Check funds for fee
    if (totalFee > 0) {
      const user = userResult.unwrap()!;
      const coins = (user.currency?.coins as { hand?: number } | undefined)?.hand ?? 0;

      if (coins < totalFee) {
        return ErrResult(
          new RpgError(
            "INSUFFICIENT_FUNDS",
            `Need ${totalFee} coins for processing fee, have ${coins}`,
          ),
        );
      }
    }

    // Step 7: Consume materials
    const removeResult = await itemMutationService.adjustItemQuantity(
      {
        actorId: input.actorId,
        targetId: input.userId,
        guildId: input.guildId,
        itemId: input.rawMaterialId,
        delta: -requiredMaterials,
        reason: `Processing ${batches} batch(es)`,
      },
      async () => true,
    );

    if (removeResult.isErr()) {
      return ErrResult(
        new RpgError("UPDATE_FAILED", `Failed to consume materials: ${removeResult.error.message}`),
      );
    }

    // Step 8: Pay fee to guild economy "trade" sector
    if (totalFee > 0 && input.guildId) {
      const feeDeductResult = await currencyMutationService.adjustCurrencyBalance(
        {
          actorId: input.actorId,
          targetId: input.userId,
          guildId: input.guildId,
          currencyId: "coins",
          delta: -totalFee,
          reason: "Processing fee",
        },
        async () => true,
      );

      if (feeDeductResult.isErr()) {
        // Rollback material consumption on fee failure
        await itemMutationService.adjustItemQuantity(
          {
            actorId: input.actorId,
            targetId: input.userId,
            guildId: input.guildId,
            itemId: input.rawMaterialId,
            delta: requiredMaterials,
            reason: "Rollback - fee payment failed",
          },
          async () => true,
        );
        return ErrResult(
          new RpgError("UPDATE_FAILED", `Failed to pay processing fee: ${feeDeductResult.error.message}`),
        );
      }

      // Deposit fee to guild trade sector
      const depositResult = await guildEconomyService.depositToSector({
        guildId: input.guildId,
        sector: "trade",
        amount: totalFee,
        source: "processing",
        reason: `Processing fee for ${batches} batch(es) of ${input.rawMaterialId}`,
      });

      if (depositResult.isErr()) {
        console.error("[RpgProcessingService] Failed to deposit fee to guild:", depositResult.error);
        // Continue anyway - user already paid
      }
    }

    // Step 9: Process batches
    const batchResults: ProcessingBatchResult[] = [];
    let successes = 0;
    let failures = 0;

    for (let i = 0; i < batches; i++) {
      const roll = Math.random();
      const success = roll < successChance;

      batchResults.push({
        batchNumber: i + 1,
        success,
        successChance,
        roll,
      });

      if (success) {
        successes++;
      } else {
        failures++;
      }
    }

    // Step 10: Grant output for successes
    const outputGained = successes * OUTPUT_PER_BATCH;
    
    if (outputGained > 0) {
      const addResult = await itemMutationService.adjustItemQuantity(
        {
          actorId: input.actorId,
          targetId: input.userId,
          guildId: input.guildId,
          itemId: outputMaterialId,
          delta: outputGained,
          reason: `Processed from ${input.rawMaterialId}`,
        },
        async () => true,
      );

      if (addResult.isErr()) {
        console.error("[RpgProcessingService] Failed to grant output:", addResult.error);
        // Processing already done, can't rollback
      }
    }

    // Step 11: Audit
    await economyAuditRepo.create({
      operationType: "craft",
      actorId: input.actorId,
      targetId: input.userId,
      guildId: input.guildId,
      source: "rpg-processing",
      reason: `Processed ${requiredMaterials} ${input.rawMaterialId} into ${outputGained} ${outputMaterialId}`,
      itemData: {
        itemId: input.rawMaterialId,
        quantity: requiredMaterials,
      },
      metadata: {
        correlationId,
        outputMaterialId,
        batchesAttempted: batches,
        batchesSucceeded: successes,
        batchesFailed: failures,
        successChance,
        luckLevel,
        feePaid: totalFee,
        batchDetails: batchResults,
      },
    });

    return OkResult({
      userId: input.userId,
      rawMaterialId: input.rawMaterialId,
      outputMaterialId,
      batchesAttempted: batches,
      batchesSucceeded: successes,
      batchesFailed: failures,
      materialsConsumed: requiredMaterials,
      outputGained,
      totalFee,
      success: successes > 0,
      successChance,
      feePaid: totalFee,
      batches: batchResults,
      correlationId,
      timestamp: new Date(),
    });
  }

  async getProcessingInfo(
    materialId: string,
    guildId?: string,
    userId?: string,
  ): Promise<{ canProcess: boolean; outputId: string | null; successChance: number; fee: number }> {
    const canProcess = canProcessMaterial(materialId);
    const outputId = getProcessedMaterial(materialId);
    
    let luckLevel = 0;
    if (guildId && userId) {
      luckLevel = await getUserLuckLevel(guildId, userId);
    }
    
    const successChance = calculateSuccessChance(luckLevel);
    const fee = calculateFee(materialId, 1);

    return {
      canProcess,
      outputId,
      successChance,
      fee,
    };
  }

  private generateCorrelationId(): string {
    return `process_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

export const rpgProcessingService: RpgProcessingService = new RpgProcessingServiceImpl();
