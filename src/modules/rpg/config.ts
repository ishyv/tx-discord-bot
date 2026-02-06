/**
 * RPG Configuration.
 *
 * Purpose: Centralized constants and balance parameters for the RPG system.
 * Context: Used across all RPG modules for consistent balancing.
 */

/** Equipment slot definitions. */
export const EQUIPMENT_SLOTS = [
  "weapon",
  "shield",
  "helmet",
  "chest",
  "pants",
  "boots",
  "ring",
  "necklace",
] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

/** Combat balance configuration. */
export const COMBAT_CONFIG = {
  /** Base maximum HP for all characters. */
  baseMaxHp: 100,

  /** Damage variance range (multiplier on ATK). */
  damageVariance: { min: 0.95, max: 1.25 },

  /** Critical hit damage multiplier range. */
  critMultiplier: { min: 1.5, max: 2.0 },

  /** Base chance for critical hit. */
  critChance: 0.2,

  /** Base chance to block (requires shield). */
  blockChance: 0.5,

  /** Damage reduction when blocking successfully. */
  blockDamageReduction: { min: 0.7, max: 1.0 },

  /** Defense effectiveness range (multiplier on DEF). */
  defenseReduction: { min: 0.5, max: 1.0 },

  /** Minimum damage per successful hit. */
  minDamage: 1,

  /** Combat session TTL in minutes. */
  sessionTtlMinutes: 5,

  /** Round timeout in seconds (Phase 12.3). */
  roundTimeoutSeconds: 60,

  /** Round escalation: ATK boost every N rounds. */
  escalationRounds: 10,
  escalationBoostPercent: 2,
} as const;

/** Gathering configuration. */
export const GATHERING_CONFIG = {
  /** Material yield range per successful gathering. */
  baseYield: { min: 2, max: 5 },

  /** Durability per tool tier (tier 1-4). */
  durabilityByTier: [10, 25, 50, 70],

  /** Tool types. */
  toolTypes: ["pickaxe", "axe"] as const,

  /** Gathering location types. */
  locationTypes: ["mine", "forest"] as const,
} as const;

/** Processing (crafting) configuration. */
export const PROCESSING_CONFIG = {
  /** Base success rate for processing. */
  baseSuccessRate: 0.62,

  /** Luck bonus per luck level (+1%). */
  luckMultiplier: 0.01,

  /** Maximum luck bonus cap (+25%). */
  maxLuckBonus: 0.25,

  /** Materials required per process. */
  materialsRequired: 2,

  /** Output quantity per success. */
  outputQuantity: 1,

  /** Processing fee as percentage of material value. */
  feePercent: 0.1,
} as const;

/** Tool upgrade configuration. */
export const UPGRADE_CONFIG = {
  /** Maximum tool tier. */
  maxTier: 4,

  /** Upgrade costs by tier (upgrading TO this tier). */
  costs: {
    2: { tier: 2, money: 10000, materials: [{ id: "spruce_wood", qty: 5 }] },
    3: { tier: 3, money: 20000, materials: [{ id: "copper_ingot", qty: 5 }] },
    4: { tier: 4, money: 30000, materials: [{ id: "palm_wood", qty: 5 }] },
  } as Record<number, { tier: number; money: number; materials: Array<{ id: string; qty: number }> }>,
} as const;

/** Material tiers and their sources. */
export const MATERIAL_TIERS = {
  mining: {
    1: "stone",
    2: "copper_ore",
    3: "iron_ore",
    4: "silver_ore",
    5: "gold_ore",
  },
  woodcutting: {
    1: "oak_wood",
    2: "spruce_wood",
    3: "palm_wood",
    4: "pine_wood",
  },
} as const;

/** Processed material mappings. */
export const PROCESSED_MATERIALS: Record<string, string> = {
  // Ores -> Ingots
  copper_ore: "copper_ingot",
  iron_ore: "iron_ingot",
  silver_ore: "silver_ingot",
  gold_ore: "gold_ingot",
  // Wood -> Processed Wood
  oak_wood: "oak_plank",
  spruce_wood: "spruce_plank",
  palm_wood: "palm_plank",
  pine_wood: "pine_plank",
} as const;

/** Combined RPG configuration export. */
export const RPG_CONFIG = {
  equipmentSlots: EQUIPMENT_SLOTS,
  combat: COMBAT_CONFIG,
  gathering: GATHERING_CONFIG,
  processing: PROCESSING_CONFIG,
  upgrade: UPGRADE_CONFIG,
  materials: MATERIAL_TIERS,
  processed: PROCESSED_MATERIALS,
} as const;
