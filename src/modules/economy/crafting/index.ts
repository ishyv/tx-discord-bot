/**
 * Crafting Module.
 *
 * Purpose: Manage crafting recipes and crafting operations.
 */

export * from "./types";
export {
  getRecipeById,
  listDefaultRecipes,
  recipeExists,
  DEFAULT_CRAFTING_RECIPES,
} from "./definitions";
export { craftingRepo, type CraftingRepo } from "./repository";
export { craftingService, type CraftingService } from "./service";
