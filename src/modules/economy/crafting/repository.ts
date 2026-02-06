/**
 * Crafting Repository.
 *
 * Purpose: Manage guild-specific recipe configurations.
 */

import { GuildStore } from "@/db/repositories/guilds";
import type { GuildId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { CraftingRecipe, GuildRecipes } from "./types";
import { DEFAULT_CRAFTING_RECIPES } from "./definitions";
import { getContentRegistry } from "@/modules/content";

interface CraftingConfigData {
  recipes?: Record<string, CraftingRecipe>;
  updatedAt?: string;
}

function contentRecipeToCraftingRecipe(contentRecipe: {
  id: string;
  name: string;
  description: string;
  type: "crafting" | "processing";
  itemInputs: readonly { itemId: string; quantity: number }[];
  itemOutputs: readonly { itemId: string; quantity: number }[];
  currencyInput?: { currencyId: string; amount: number };
  guildFee?: { currencyId: string; amount: number; sector: "global" | "works" | "trade" | "tax" };
  requiredLevel?: number;
  professionRequirement?: "miner" | "lumber";
  tierRequirement?: number;
  xpReward: number;
  enabled: boolean;
}): CraftingRecipe | null {
  if (contentRecipe.type !== "crafting") {
    return null;
  }

  return {
    id: contentRecipe.id,
    name: contentRecipe.name,
    description: contentRecipe.description,
    itemInputs: contentRecipe.itemInputs.map((input) => ({
      itemId: input.itemId,
      quantity: input.quantity,
    })),
    currencyInput: contentRecipe.currencyInput,
    itemOutputs: contentRecipe.itemOutputs.map((output) => ({
      itemId: output.itemId,
      quantity: output.quantity,
    })),
    guildFee: contentRecipe.guildFee,
    requiredLevel: contentRecipe.requiredLevel,
    professionRequirement: contentRecipe.professionRequirement,
    tierRequirement: contentRecipe.tierRequirement,
    xpReward: contentRecipe.xpReward,
    enabled: contentRecipe.enabled,
  };
}

export interface CraftingRepo {
  /**
   * Get all recipes for a guild.
   */
  getRecipes(guildId: GuildId): Promise<Result<GuildRecipes, Error>>;

  /**
   * Get a specific recipe by ID.
   */
  getRecipe(
    guildId: GuildId,
    recipeId: string,
  ): Promise<Result<CraftingRecipe | null, Error>>;

  /**
   * Enable/disable a recipe for a guild.
   */
  setRecipeEnabled(
    guildId: GuildId,
    recipeId: string,
    enabled: boolean,
  ): Promise<Result<CraftingRecipe | null, Error>>;

  /**
   * Add or update a custom recipe for a guild.
   */
  upsertRecipe(
    guildId: GuildId,
    recipe: CraftingRecipe,
  ): Promise<Result<CraftingRecipe, Error>>;

  /**
   * Remove a custom recipe from a guild.
   */
  removeRecipe(
    guildId: GuildId,
    recipeId: string,
  ): Promise<Result<boolean, Error>>;
}

class CraftingRepoImpl implements CraftingRepo {
  async getRecipes(guildId: GuildId): Promise<Result<GuildRecipes, Error>> {
    const guildResult = await GuildStore.ensure(guildId);
    if (guildResult.isErr()) return ErrResult(guildResult.error);

    const guild = guildResult.unwrap();
    const config = (guild.crafting ?? {}) as CraftingConfigData;

    // Merge default recipes with guild overrides
    const recipes: Record<string, CraftingRecipe> = {};

    // Start with defaults
    for (const recipe of DEFAULT_CRAFTING_RECIPES) {
      recipes[recipe.id] = recipe;
    }

    // Apply content recipes (content-first over legacy defaults)
    const contentRegistry = getContentRegistry();
    if (contentRegistry) {
      for (const contentRecipe of contentRegistry.listRecipesByType("crafting")) {
        const mapped = contentRecipeToCraftingRecipe(contentRecipe);
        if (!mapped) continue;
        recipes[mapped.id] = mapped;
      }
    }

    // Apply guild overrides
    for (const [id, recipe] of Object.entries(config.recipes ?? {})) {
      if (recipe) {
        recipes[id] = recipe;
      }
    }

    return OkResult({
      guildId,
      recipes,
      updatedAt: new Date(config.updatedAt ?? Date.now()),
    });
  }

  async getRecipe(
    guildId: GuildId,
    recipeId: string,
  ): Promise<Result<CraftingRecipe | null, Error>> {
    const recipesResult = await this.getRecipes(guildId);
    if (recipesResult.isErr()) return ErrResult(recipesResult.error);

    return OkResult(recipesResult.unwrap().recipes[recipeId] ?? null);
  }

  async setRecipeEnabled(
    guildId: GuildId,
    recipeId: string,
    enabled: boolean,
  ): Promise<Result<CraftingRecipe | null, Error>> {
    const recipeResult = await this.getRecipe(guildId, recipeId);
    if (recipeResult.isErr()) return ErrResult(recipeResult.error);

    const recipe = recipeResult.unwrap();
    if (!recipe) return OkResult(null);

    const updatedRecipe: CraftingRecipe = { ...recipe, enabled };
    return this.upsertRecipe(guildId, updatedRecipe);
  }

  async upsertRecipe(
    guildId: GuildId,
    recipe: CraftingRecipe,
  ): Promise<Result<CraftingRecipe, Error>> {
    try {
      const col = await GuildStore.collection();
      const now = new Date();

      const result = await col.findOneAndUpdate(
        { _id: guildId } as any,
        {
          $set: {
            [`crafting.recipes.${recipe.id}`]: recipe,
            "crafting.updatedAt": now.toISOString(),
          },
        } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(new Error("Guild not found"));
      }

      return OkResult(recipe);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async removeRecipe(
    guildId: GuildId,
    recipeId: string,
  ): Promise<Result<boolean, Error>> {
    try {
      const col = await GuildStore.collection();
      const now = new Date();

      const result = await col.findOneAndUpdate(
        { _id: guildId } as any,
        {
          $unset: { [`crafting.recipes.${recipeId}`]: "" } as any,
          $set: { "crafting.updatedAt": now.toISOString() } as any,
        } as any,
        { returnDocument: "after" },
      );

      return OkResult(!!result);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}

export const craftingRepo: CraftingRepo = new CraftingRepoImpl();
