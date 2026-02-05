/**
 * Processing Types.
 *
 * Purpose: Type definitions for material processing (crafting).
 * Context: Convert raw materials to processed materials.
 */

import type { UserId } from "@/db/types";

/** Processing operation input. */
export interface ProcessingInput {
  /** User ID. */
  userId: UserId;
  /** Guild ID (for fee contribution). */
  guildId?: string;
  /** Raw material ID to process. */
  rawMaterialId: string;
  /** Quantity to process (will be rounded down to pairs). */
  quantity?: number;
  /** Actor ID. */
  actorId: UserId;
  /** User's luck level (affects success rate). */
  luckLevel?: number;
  /** Correlation ID. */
  correlationId?: string;
}

/** Single batch result. */
export interface ProcessingBatchResult {
  /** Batch number. */
  batchNumber: number;
  /** Whether processing succeeded. */
  success: boolean;
  /** Success chance used. */
  successChance: number;
  /** RNG roll result. */
  roll: number;
}

/** Processing result. */
export interface ProcessingResult {
  /** User ID. */
  userId: UserId;
  /** Raw material ID. */
  rawMaterialId: string;
  /** Output material ID. */
  outputMaterialId: string;
  /** Number of batches attempted. */
  batchesAttempted: number;
  /** Number of successful batches. */
  batchesSucceeded: number;
  /** Number of failed batches. */
  batchesFailed: number;
  /** Total materials consumed. */
  materialsConsumed: number;
  /** Total output gained. */
  outputGained: number;
  /** Total fee paid. */
  totalFee: number;
  /** Whether at least one batch succeeded. */
  success: boolean;
  /** Success chance used. */
  successChance: number;
  /** Fee paid. */
  feePaid: number;
  /** Batch details. */
  batches: ProcessingBatchResult[];
  /** Correlation ID. */
  correlationId: string;
  /** Timestamp. */
  timestamp: Date;
}
