/**
 * RPG Config Defaults.
 *
 * Purpose: Default values and conversion functions for RPG configuration.
 */

import type {
  RpgConfig,
  RpgCombatConfig,
  RpgProcessingConfig,
  RpgGatheringConfig,
  RpgUpgradeConfig,
  RpgOnboardingConfig,
} from "./types";
import type { RpgConfigData } from "./repository";

/** Default combat configuration. */
export const DEFAULT_COMBAT_CONFIG: RpgCombatConfig = {
  critChance: 0.15,
  blockChance: 0.25,
  varianceMin: 0.85,
  varianceMax: 1.15,
  defenseReductionMin: 0.1,
  defenseReductionMax: 0.5,
  timeoutSeconds: 300,
};

/** Default processing configuration. */
export const DEFAULT_PROCESSING_CONFIG: RpgProcessingConfig = {
  baseSuccessChance: 0.6,
  luckCap: 0.25,
  feePercent: 0.05,
  minFee: 5,
  maxFee: 100,
};

/** Default gathering configuration. */
export const DEFAULT_GATHERING_CONFIG: RpgGatheringConfig = {
  durabilityMin: 8,
  durabilityMax: 12,
  yieldMin: 1,
  yieldMax: 3,
  tierBonusPerLevel: 0.5,
};

/** Default upgrade configuration. */
export const DEFAULT_UPGRADE_CONFIG: RpgUpgradeConfig = {
  costs: {
    tier2: { money: 500, materials: [{ id: "iron_ore", quantity: 5 }] },
    tier3: { money: 2000, materials: [{ id: "silver_ore", quantity: 5 }] },
    tier4: { money: 10000, materials: [{ id: "gold_ore", quantity: 5 }] },
  },
  maxTier: 4,
  resetDurabilityOnUpgrade: true,
};

/** Default onboarding configuration. */
export const DEFAULT_ONBOARDING_CONFIG: RpgOnboardingConfig = {
  enabled: true,
  starterKits: {
    miner: {
      toolId: "pickaxe",
      gear: [
        { id: "leather_helmet", qty: 1 },
        { id: "leather_chest", qty: 1 },
      ],
    },
    lumber: {
      toolId: "axe",
      gear: [
        { id: "leather_helmet", qty: 1 },
        { id: "leather_chest", qty: 1 },
      ],
    },
  },
};

/** Default complete RPG configuration. */
export const DEFAULT_RPG_CONFIG = {
  combat: DEFAULT_COMBAT_CONFIG,
  processing: DEFAULT_PROCESSING_CONFIG,
  gathering: DEFAULT_GATHERING_CONFIG,
  upgrades: DEFAULT_UPGRADE_CONFIG,
  onboarding: DEFAULT_ONBOARDING_CONFIG,
};

/** Convert DB data to domain model. */
export function toDomain(guildId: string, data: RpgConfigData): RpgConfig {
  return {
    guildId,
    enabled: data.enabled,
    combat: { ...DEFAULT_COMBAT_CONFIG, ...data.combat },
    processing: { ...DEFAULT_PROCESSING_CONFIG, ...data.processing },
    gathering: { ...DEFAULT_GATHERING_CONFIG, ...data.gathering },
    upgrades: {
      costs: data.upgrades?.costs ?? DEFAULT_UPGRADE_CONFIG.costs,
      maxTier: data.upgrades?.maxTier ?? DEFAULT_UPGRADE_CONFIG.maxTier,
      resetDurabilityOnUpgrade: data.upgrades?.resetDurabilityOnUpgrade ?? DEFAULT_UPGRADE_CONFIG.resetDurabilityOnUpgrade,
    },
    updatedAt: data.updatedAt,
  };
}

/** Convert combat config to domain. */
export function toCombatDomain(data: RpgConfigData["combat"]): RpgCombatConfig {
  return {
    critChance: data.critChance ?? DEFAULT_COMBAT_CONFIG.critChance,
    blockChance: data.blockChance ?? DEFAULT_COMBAT_CONFIG.blockChance,
    varianceMin: data.varianceMin ?? DEFAULT_COMBAT_CONFIG.varianceMin,
    varianceMax: data.varianceMax ?? DEFAULT_COMBAT_CONFIG.varianceMax,
    defenseReductionMin: data.defenseReductionMin ?? DEFAULT_COMBAT_CONFIG.defenseReductionMin,
    defenseReductionMax: data.defenseReductionMax ?? DEFAULT_COMBAT_CONFIG.defenseReductionMax,
    timeoutSeconds: data.timeoutSeconds ?? DEFAULT_COMBAT_CONFIG.timeoutSeconds,
  };
}

/** Convert processing config to domain. */
export function toProcessingDomain(data: RpgConfigData["processing"]): RpgProcessingConfig {
  return {
    baseSuccessChance: data.baseSuccessChance ?? DEFAULT_PROCESSING_CONFIG.baseSuccessChance,
    luckCap: data.luckCap ?? DEFAULT_PROCESSING_CONFIG.luckCap,
    feePercent: data.feePercent ?? DEFAULT_PROCESSING_CONFIG.feePercent,
    minFee: data.minFee ?? DEFAULT_PROCESSING_CONFIG.minFee,
    maxFee: data.maxFee ?? DEFAULT_PROCESSING_CONFIG.maxFee,
  };
}

/** Convert gathering config to domain. */
export function toGatheringDomain(data: RpgConfigData["gathering"]): RpgGatheringConfig {
  return {
    durabilityMin: data.durabilityMin ?? DEFAULT_GATHERING_CONFIG.durabilityMin,
    durabilityMax: data.durabilityMax ?? DEFAULT_GATHERING_CONFIG.durabilityMax,
    yieldMin: data.yieldMin ?? DEFAULT_GATHERING_CONFIG.yieldMin,
    yieldMax: data.yieldMax ?? DEFAULT_GATHERING_CONFIG.yieldMax,
    tierBonusPerLevel: data.tierBonusPerLevel ?? DEFAULT_GATHERING_CONFIG.tierBonusPerLevel,
  };
}

/** Convert upgrade config to domain. */
export function toUpgradeDomain(data: RpgConfigData["upgrades"]): RpgUpgradeConfig {
  return {
    costs: data.costs ?? DEFAULT_UPGRADE_CONFIG.costs,
    maxTier: data.maxTier ?? DEFAULT_UPGRADE_CONFIG.maxTier,
    resetDurabilityOnUpgrade: data.resetDurabilityOnUpgrade ?? DEFAULT_UPGRADE_CONFIG.resetDurabilityOnUpgrade,
  };
}
