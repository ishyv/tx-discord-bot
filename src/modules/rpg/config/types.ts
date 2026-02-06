/**
 * RPG Config Types.
 *
 * Purpose: Type definitions for RPG guild configuration.
 */

/** Combat configuration. */
export interface RpgCombatConfig {
  /** Critical hit chance (0-1). */
  critChance: number;
  /** Block chance (0-1). */
  blockChance: number;
  /** Minimum damage variance (0-1). */
  varianceMin: number;
  /** Maximum damage variance (0-1). */
  varianceMax: number;
  /** Minimum defense reduction (0-1). */
  defenseReductionMin: number;
  /** Maximum defense reduction (0-1). */
  defenseReductionMax: number;
  /** Combat timeout in seconds. */
  timeoutSeconds: number;
}

/** Processing (crafting) configuration. */
export interface RpgProcessingConfig {
  /** Base success chance (0-1). */
  baseSuccessChance: number;
  /** Maximum luck bonus (0-1). */
  luckCap: number;
  /** Processing fee as percentage (0-1). */
  feePercent: number;
  /** Minimum processing fee. */
  minFee: number;
  /** Maximum processing fee. */
  maxFee: number;
}

/** Gathering configuration. */
export interface RpgGatheringConfig {
  /** Minimum tool durability loss per action. */
  durabilityMin: number;
  /** Maximum tool durability loss per action. */
  durabilityMax: number;
  /** Minimum materials yielded per action. */
  yieldMin: number;
  /** Maximum materials yielded per action. */
  yieldMax: number;
  /** Bonus yield per tool tier level. */
  tierBonusPerLevel: number;
}

/** Upgrade material requirement. */
export interface UpgradeMaterial {
  /** Item ID. */
  id: string;
  /** Quantity required. */
  quantity: number;
}

/** Upgrade cost for a tier. */
export interface UpgradeCost {
  /** Money required. */
  money: number;
  /** Materials required. */
  materials: UpgradeMaterial[];
}

/** Upgrades configuration. */
export interface RpgUpgradeConfig {
  /** Cost table by tier key (e.g., "tier2", "tier3"). */
  costs: Record<string, UpgradeCost>;
  /** Maximum tool tier. */
  maxTier: number;
  /** Whether to reset durability on upgrade. */
  resetDurabilityOnUpgrade: boolean;
}

/** Starter kit item definition. */
export interface StarterKitItem {
  /** Item ID. */
  id: string;
  /** Quantity to grant. */
  qty: number;
}

/** Starter kit definition for a path (miner/lumber). */
export interface StarterKitDefinition {
  /** Tool item ID to grant. */
  toolId: string;
  /** Additional gear items to grant. */
  gear: StarterKitItem[];
}

/** Onboarding configuration. */
export interface RpgOnboardingConfig {
  /** Whether onboarding is enabled. */
  enabled: boolean;
  /** Starter kit definitions by path. */
  starterKits: {
    miner: StarterKitDefinition;
    lumber: StarterKitDefinition;
  };
}

/** Complete RPG configuration. */
export interface RpgConfig {
  /** Guild ID. */
  guildId: string;
  /** Whether RPG is enabled. */
  enabled: boolean;
  /** Combat configuration. */
  combat: RpgCombatConfig;
  /** Processing configuration. */
  processing: RpgProcessingConfig;
  /** Gathering configuration. */
  gathering: RpgGatheringConfig;
  /** Upgrades configuration. */
  upgrades: RpgUpgradeConfig;
  /** Onboarding configuration (optional, defaults applied if missing). */
  onboarding?: RpgOnboardingConfig;
  /** Last updated timestamp. */
  updatedAt: Date;
}

/** Error class for RPG config operations. */
export class RpgConfigError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "RpgConfigError";
  }
}

/** Config update input for auditing. */
export interface ConfigUpdateInput {
  /** Guild ID. */
  guildId: string;
  /** Actor ID (who made the change). */
  actorId: string;
  /** Config category being updated. */
  category: "combat" | "processing" | "gathering" | "upgrades" | "enabled" | "onboarding";
  /** Field being updated. */
  field: string;
  /** Previous value. */
  before: unknown;
  /** New value. */
  after: unknown;
  /** Optional reason for the change. */
  reason?: string;
  /** Correlation ID for tracing. */
  correlationId?: string;
}
