/**
 * RPG Processing Module.
 *
 * Purpose: Export processing system components.
 * Context: Raw material to processed material conversion.
 */

export { rpgProcessingService } from "./service";
export type { RpgProcessingService } from "./service";
export type { ProcessingResult, ProcessingInput, ProcessingBatchResult } from "./types";
export {
  getProcessedMaterial,
  canProcessMaterial,
  calculateFee,
  calculateSuccessChance,
  MATERIALS_PER_BATCH,
  OUTPUT_PER_BATCH,
} from "./recipes";
