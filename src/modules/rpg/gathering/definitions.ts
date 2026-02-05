/**
 * Gathering Definitions.
 *
 * Purpose: Constants and lookup tables for gathering system.
 * Context: Tool tiers, locations, and material yields.
 */

import { GATHERING_CONFIG } from "../config";
import type { GatheringLocation, ToolTierInfo } from "./types";

/** Get durability for a tool tier. */
export function getToolDurability(tier: number): number {
  const index = Math.max(1, Math.min(4, tier)) - 1;
  return GATHERING_CONFIG.durabilityByTier[index] ?? 10;
}

/** Get tier from tool ID. */
export function getToolTier(toolId: string): number {
  // Check for tier suffix: "pickaxe_lv2", "pickaxe_3", "pickaxe lv.4"
  const match = toolId.match(/(?:lv\.?|level|_|\s)(\d)/i);
  if (match) {
    return parseInt(match[1]!, 10);
  }
  // Default to tier 1
  return 1;
}

/** Check if tool is valid for gathering. */
export function isValidGatheringTool(toolId: string, locationType: "mine" | "forest"): boolean {
  const lowerId = toolId.toLowerCase();
  if (locationType === "mine") {
    return lowerId.includes("pickaxe");
  }
  return lowerId.includes("axe") && !lowerId.includes("pickaxe");
}

/** Get tool tier info. */
export function getToolTierInfo(toolId: string): ToolTierInfo {
  const tier = getToolTier(toolId);
  return {
    tier,
    maxDurability: getToolDurability(tier),
  };
}

/** Default gathering locations. */
export const DEFAULT_LOCATIONS: GatheringLocation[] = [
  // Mines
  { id: "stone_mine", name: "Stone Mine", type: "mine", requiredTier: 1, materials: ["stone"] },
  { id: "copper_mine", name: "Copper Mine", type: "mine", requiredTier: 2, materials: ["copper_ore"] },
  { id: "iron_mine", name: "Iron Mine", type: "mine", requiredTier: 3, materials: ["iron_ore"] },
  { id: "silver_mine", name: "Silver Mine", type: "mine", requiredTier: 4, materials: ["silver_ore"] },

  // Forests
  { id: "oak_forest", name: "Oak Forest", type: "forest", requiredTier: 1, materials: ["oak_wood"] },
  { id: "spruce_forest", name: "Spruce Forest", type: "forest", requiredTier: 2, materials: ["spruce_wood"] },
  { id: "palm_forest", name: "Palm Forest", type: "forest", requiredTier: 3, materials: ["palm_wood"] },
  { id: "pine_forest", name: "Pine Forest", type: "forest", requiredTier: 4, materials: ["pine_wood"] },
];

/** Location lookup map. */
const locationMap = new Map(DEFAULT_LOCATIONS.map((l) => [l.id, l]));

/** Get location by ID. */
export function getLocation(locationId: string): GatheringLocation | undefined {
  return locationMap.get(locationId);
}

/** Calculate yield amount. */
export function calculateYield(tier: number): number {
  // Random between min and max, slight tier bonus
  const min = GATHERING_CONFIG.baseYield.min;
  const max = GATHERING_CONFIG.baseYield.max + Math.floor(tier / 2);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Get material for location. */
export function getLocationMaterial(location: GatheringLocation): string {
  // Pick random material from location's possible materials
  const index = Math.floor(Math.random() * location.materials.length);
  return location.materials[index]!;
}

/** Get material for a specific tier (deterministic). */
export function getMaterialForTier(type: "mine" | "forest", tier: number): string {
  const location = DEFAULT_LOCATIONS.find(
    (l) => l.type === type && l.requiredTier === tier,
  );
  return location?.materials[0] ?? (type === "mine" ? "stone" : "oak_wood");
}

/** Alias for getToolTier for clarity in imports. */
export function getToolTierFromItemId(toolId: string): number {
  return getToolTier(toolId);
}
