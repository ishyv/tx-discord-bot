/**
 * RPG Gathering Module.
 *
 * Purpose: Export gathering system components.
 * Context: Mining and woodcutting with tool durability.
 */

export { rpgGatheringService } from "./service";
export type { RpgGatheringService } from "./service";
export type { GatheringResult, GatheringInput, GatheringLocation } from "./types";
export {
  getLocation,
  getToolTier,
  getToolTierFromItemId,
  getToolDurability,
  isValidGatheringTool,
  calculateYield,
  getLocationMaterial,
  getMaterialForTier,
  DEFAULT_LOCATIONS,
} from "./definitions";
