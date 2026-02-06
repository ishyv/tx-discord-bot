/**
 * Crafting system types.
 *
 * Purpose: Define recipes, crafting inputs/outputs, and crafting operations.
 */

import type { ItemId } from "@/modules/inventory/definitions";
import type { CurrencyId } from "@/modules/economy/currency";
import type { GuildId, UserId } from "@/db/types";
import type { EconomySector } from "@/modules/economy/guild";

/** A single item requirement for a recipe. */
export interface RecipeItemInput {
  readonly itemId: ItemId;
  readonly quantity: number;
}

/** Currency requirement for a recipe. */
export interface RecipeCurrencyInput {
  readonly currencyId: CurrencyId;
  readonly amount: number;
}

/** A single item output from a recipe. */
export interface RecipeItemOutput {
  readonly itemId: ItemId;
  readonly quantity: number;
}

/** A crafting recipe definition. */
export interface CraftingRecipe {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Input items required. */
  readonly itemInputs: RecipeItemInput[];
  /** Input currency required (optional). */
  readonly currencyInput?: RecipeCurrencyInput;
  /** Output items produced. */
  readonly itemOutputs: RecipeItemOutput[];
  /** Crafting fee deposited to guild (optional). */
  readonly guildFee?: {
    readonly currencyId: CurrencyId;
    readonly amount: number;
    readonly sector: EconomySector;
  };
  /** Minimum progression level required. */
  readonly requiredLevel?: number;
  /** Required RPG profession path (miner/lumber). */
  readonly professionRequirement?: "miner" | "lumber";
  /** Minimum tool tier required to craft. */
  readonly tierRequirement?: number;
  /** XP granted for crafting this recipe. */
  readonly xpReward: number;
  /** Whether this recipe is enabled. */
  readonly enabled: boolean;
}

/** User-friendly view of a recipe. */
export interface CraftingRecipeView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly itemInputs: RecipeItemInput[];
  readonly currencyInput?: RecipeCurrencyInput;
  readonly itemOutputs: RecipeItemOutput[];
  readonly guildFee?: {
    readonly currencyId: CurrencyId;
    readonly amount: number;
    readonly sector: EconomySector;
  };
  readonly requiredLevel?: number;
  readonly professionRequirement?: "miner" | "lumber";
  readonly tierRequirement?: number;
  readonly xpReward: number;
  readonly enabled: boolean;
  /** Whether user can craft (has materials). */
  readonly canCraft: boolean;
  /** Missing items if cannot craft. */
  readonly missingItems: RecipeItemInput[];
  /** Missing currency if cannot craft. */
  readonly missingCurrency?: number;
  /** Requirement message if profession/tier requirement is not met. */
  readonly requirementIssue?: string;
}

/** Input for crafting operation. */
export interface CraftInput {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly recipeId: string;
  readonly quantity?: number;
}

/** Result of a crafting operation. */
export interface CraftResult {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly recipeId: string;
  readonly quantity: number;
  readonly itemInputs: RecipeItemInput[];
  readonly itemOutputs: RecipeItemOutput[];
  readonly currencySpent?: number;
  readonly currencyId?: CurrencyId;
  readonly guildFee?: number;
  readonly xpGained: number;
  readonly warnings?: string[];
  readonly correlationId: string;
  readonly timestamp: Date;
}

/** Error codes for crafting operations. */
export type CraftingErrorCode =
  | "RECIPE_NOT_FOUND"
  | "RECIPE_DISABLED"
  | "INSUFFICIENT_ITEMS"
  | "INSUFFICIENT_CURRENCY"
  | "LEVEL_REQUIRED"
  | "CAPACITY_EXCEEDED"
  | "PROFESSION_REQUIRED"
  | "TIER_REQUIRED"
  | "ACCOUNT_BLOCKED"
  | "ACCOUNT_BANNED"
  | "RATE_LIMITED"
  | "CRAFT_FAILED"
  | "CONFLICT"
  | "FEATURE_DISABLED";

export class CraftingError extends Error {
  constructor(
    public readonly code: CraftingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CraftingError";
  }
}

/** Recipe storage per guild. */
export interface GuildRecipes {
  readonly guildId: GuildId;
  readonly recipes: Record<string, CraftingRecipe>;
  readonly updatedAt: Date;
}

/** Rate limit tracking for crafting spam prevention. */
export interface CraftingRateLimit {
  readonly userId: UserId;
  readonly count: number;
  readonly windowStart: Date;
}
