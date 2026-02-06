/**
 * Crafting recipe definitions.
 *
 * Purpose: Built-in crafting recipes for the economy system.
 */

import type { CraftingRecipe } from "./types";

/** Default crafting recipes available to all guilds. */
export const DEFAULT_CRAFTING_RECIPES: CraftingRecipe[] = [
  // Material processing
  {
    id: "process_wood",
    name: "🪵 Process Wood",
    description: "Convert sticks into wooden planks.",
    itemInputs: [{ itemId: "palo", quantity: 2 }],
    itemOutputs: [{ itemId: "tabla_madera", quantity: 1 }],
    xpReward: 5,
    enabled: true,
  },
  {
    id: "process_stone",
    name: "🪨 Polish Stone",
    description: "Refine rough stone into blocks.",
    itemInputs: [{ itemId: "piedra_bruta", quantity: 2 }],
    itemOutputs: [{ itemId: "bloque_piedra", quantity: 1 }],
    xpReward: 3,
    enabled: true,
  },
  {
    id: "process_iron",
    name: "⚙️ Smelt Iron",
    description: "Smelt iron ore into ingots.",
    itemInputs: [{ itemId: "mineral_hierro", quantity: 2 }],
    currencyInput: { currencyId: "coins", amount: 10 },
    itemOutputs: [{ itemId: "lingote_hierro", quantity: 1 }],
    guildFee: { currencyId: "coins", amount: 5, sector: "trade" },
    xpReward: 10,
    enabled: true,
  },

  // Basic equipment crafting
  {
    id: "craft_leather_helmet",
    name: "🪖 Leather Helmet",
    description: "Craft a basic leather helmet.",
    itemInputs: [{ itemId: "cuero", quantity: 3 }],
    currencyInput: { currencyId: "coins", amount: 50 },
    itemOutputs: [{ itemId: "casco_cuero", quantity: 1 }],
    xpReward: 15,
    enabled: true,
  },
  {
    id: "craft_iron_helmet",
    name: "⛑️ Iron Helmet",
    description: "Forge a durable iron helmet.",
    itemInputs: [
      { itemId: "lingote_hierro", quantity: 2 },
      { itemId: "casco_cuero", quantity: 1 },
    ],
    currencyInput: { currencyId: "coins", amount: 150 },
    itemOutputs: [{ itemId: "casco_hierro", quantity: 1 }],
    requiredLevel: 3,
    xpReward: 30,
    enabled: true,
  },
  {
    id: "craft_iron_sword",
    name: "⚔️ Iron Sword",
    description: "Forge a sharp iron sword.",
    itemInputs: [{ itemId: "lingote_hierro", quantity: 3 }],
    currencyInput: { currencyId: "coins", amount: 100 },
    itemOutputs: [{ itemId: "espada_hierro", quantity: 1 }],
    xpReward: 20,
    enabled: true,
  },
  {
    id: "craft_steel_sword",
    name: "🗡️ Steel Sword",
    description: "Forge a superior steel sword.",
    itemInputs: [
      { itemId: "lingote_acero", quantity: 3 },
      { itemId: "espada_hierro", quantity: 1 },
    ],
    currencyInput: { currencyId: "coins", amount: 300 },
    itemOutputs: [{ itemId: "espada_acero", quantity: 1 }],
    guildFee: { currencyId: "coins", amount: 50, sector: "trade" },
    requiredLevel: 4,
    xpReward: 50,
    enabled: true,
  },

  // Armor crafting
  {
    id: "craft_leather_armor",
    name: "🦺 Leather Armor",
    description: "Sew light leather armor.",
    itemInputs: [{ itemId: "cuero", quantity: 5 }],
    currencyInput: { currencyId: "coins", amount: 100 },
    itemOutputs: [{ itemId: "armadura_cuero", quantity: 1 }],
    xpReward: 25,
    enabled: true,
  },
  {
    id: "craft_iron_armor",
    name: "🛡️ Iron Armor",
    description: "Forge sturdy armor.",
    itemInputs: [
      { itemId: "lingote_hierro", quantity: 4 },
      { itemId: "armadura_cuero", quantity: 1 },
    ],
    currencyInput: { currencyId: "coins", amount: 250 },
    itemOutputs: [{ itemId: "armadura_hierro", quantity: 1 }],
    requiredLevel: 4,
    xpReward: 50,
    enabled: true,
  },

  // Accessory crafting
  {
    id: "craft_lucky_amulet",
    name: "📿 Lucky Amulet",
    description: "Craft an amulet that attracts fortune.",
    itemInputs: [
      { itemId: "piedra_preciosa", quantity: 1 },
      { itemId: "cuerda", quantity: 1 },
    ],
    currencyInput: { currencyId: "coins", amount: 200 },
    itemOutputs: [{ itemId: "amuleto_suerte", quantity: 1 }],
    guildFee: { currencyId: "coins", amount: 20, sector: "trade" },
    requiredLevel: 2,
    xpReward: 35,
    enabled: true,
  },
  {
    id: "craft_gold_ring",
    name: "💍 Gold Ring",
    description: "Forge a golden ring.",
    itemInputs: [{ itemId: "lingote_oro", quantity: 1 }],
    currencyInput: { currencyId: "coins", amount: 300 },
    itemOutputs: [{ itemId: "anillo_oro", quantity: 1 }],
    guildFee: { currencyId: "coins", amount: 30, sector: "trade" },
    requiredLevel: 3,
    xpReward: 40,
    enabled: true,
  },

  // Tool crafting
  {
    id: "craft_lantern",
    name: "🏮 Magic Lantern",
    description: "Craft an enchanted lantern.",
    itemInputs: [
      { itemId: "lingote_hierro", quantity: 1 },
      { itemId: "piedra_preciosa", quantity: 1 },
    ],
    currencyInput: { currencyId: "coins", amount: 250 },
    itemOutputs: [{ itemId: "linterna", quantity: 1 }],
    requiredLevel: 4,
    xpReward: 45,
    enabled: true,
  },

  // Advanced materials
  {
    id: "craft_steel_ingot",
    name: "🔩 Steel Ingot",
    description: "Refine iron into higher quality steel.",
    itemInputs: [
      { itemId: "lingote_hierro", quantity: 2 },
      { itemId: "carbon", quantity: 1 },
    ],
    currencyInput: { currencyId: "coins", amount: 50 },
    itemOutputs: [{ itemId: "lingote_acero", quantity: 1 }],
    guildFee: { currencyId: "coins", amount: 10, sector: "works" },
    requiredLevel: 3,
    xpReward: 20,
    enabled: true,
  },
];

/** Map for O(1) recipe lookup. */
const RECIPE_MAP: Map<string, CraftingRecipe> = new Map(
  DEFAULT_CRAFTING_RECIPES.map((r) => [r.id, r]),
);

/** Get recipe by ID. */
export function getRecipeById(id: string): CraftingRecipe | null {
  return RECIPE_MAP.get(id) ?? null;
}

/** List all default recipes. */
export function listDefaultRecipes(): CraftingRecipe[] {
  return DEFAULT_CRAFTING_RECIPES.filter((r) => r.enabled);
}

/** Check if recipe exists. */
export function recipeExists(id: string): boolean {
  return RECIPE_MAP.has(id);
}


