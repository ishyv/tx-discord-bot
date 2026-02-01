/**
 * Crafting Service.
 *
 * Purpose: Handle crafting operations with atomic inventory/currency updates.
 */

import { UserStore } from "@/db/repositories/users";
import type { UserId, GuildId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { runUserTransition } from "@/db/user-transition";
import type { ItemInventory } from "@/modules/inventory/inventory";
import type { CurrencyInventory } from "@/modules/economy/currency";
import { currencyEngine } from "@/modules/economy/transactions";
import { economyAccountRepo } from "@/modules/economy/account/repository";
import { economyAuditRepo } from "@/modules/economy/audit/repository";
import { progressionService } from "@/modules/economy/progression/service";
import { guildEconomyService } from "@/modules/economy/guild/service";
import { guildEconomyRepo } from "@/modules/economy/guild/repository";
import {
  calculateCapacity,
  type CapacityLimits,
} from "@/modules/inventory/capacity";
import { getItemDefinition } from "@/modules/inventory/items";
import { craftingRepo } from "./repository";
import type {
  CraftingRecipeView,
  CraftInput,
  CraftResult,
  CraftingError,
  RecipeItemInput,
  RecipeItemOutput,
} from "./types";
import { CraftingError as CraftingErrorClass } from "./types";

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_CRAFTS = 15; // 15 crafts per minute

/** In-memory rate limit tracking. */
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

/** Check and update rate limit for a user. */
function checkRateLimit(userId: UserId): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_CRAFTS) {
    return false;
  }

  entry.count++;
  return true;
}

/** Check if user has sufficient items. */
function hasRequiredItems(
  inventory: ItemInventory,
  inputs: RecipeItemInput[],
): { sufficient: boolean; missing: RecipeItemInput[] } {
  const missing: RecipeItemInput[] = [];

  for (const input of inputs) {
    const currentQty = inventory[input.itemId]?.quantity ?? 0;
    if (currentQty < input.quantity) {
      missing.push({
        itemId: input.itemId,
        quantity: input.quantity - currentQty,
      });
    }
  }

  return { sufficient: missing.length === 0, missing };
}

/** Check if outputs would exceed capacity. */
function checkOutputCapacity(
  inventory: ItemInventory,
  outputs: RecipeItemOutput[],
  limits?: CapacityLimits,
): boolean {
  // Simulate adding all outputs
  const simulatedInventory: ItemInventory = { ...inventory };

  for (const output of outputs) {
    const current = simulatedInventory[output.itemId];
    const def = getItemDefinition(output.itemId);
    const maxStack = def?.maxStack ?? 99;

    if (current) {
      // Check if adding would exceed max stack
      if (current.quantity + output.quantity > maxStack) {
        return false;
      }
      simulatedInventory[output.itemId] = {
        ...current,
        quantity: current.quantity + output.quantity,
      };
    } else {
      simulatedInventory[output.itemId] = {
        id: output.itemId,
        quantity: output.quantity,
      };
    }
  }

  // Check capacity
  const capacity = calculateCapacity(simulatedInventory, { limits });
  return !capacity.weightExceeded && !capacity.slotsExceeded;
}

export interface CraftingService {
  /**
   * Get all available recipes for a guild with user's craftability status.
   */
  getRecipes(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<CraftingRecipeView[], Error>>;

  /**
   * Get a specific recipe view.
   */
  getRecipe(
    guildId: GuildId,
    userId: UserId,
    recipeId: string,
  ): Promise<Result<CraftingRecipeView | null, Error>>;

  /**
   * Craft items using a recipe.
   */
  craft(input: CraftInput): Promise<Result<CraftResult, CraftingError>>;
}

class CraftingServiceImpl implements CraftingService {
  async getRecipes(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<CraftingRecipeView[], Error>> {
    const [recipesResult, userResult] = await Promise.all([
      craftingRepo.getRecipes(guildId),
      UserStore.get(userId),
    ]);

    if (recipesResult.isErr()) return ErrResult(recipesResult.error);
    if (userResult.isErr()) return ErrResult(userResult.error);

    const recipes = recipesResult.unwrap();
    const user = userResult.unwrap();
    const inventory = (user?.inventory ?? {}) as ItemInventory;
    const currency = (user?.currency ?? {}) as CurrencyInventory;

    const views: CraftingRecipeView[] = [];

    for (const recipe of Object.values(recipes.recipes)) {
      if (!recipe.enabled) continue;

      const { sufficient: hasItems, missing } = hasRequiredItems(
        inventory,
        recipe.itemInputs,
      );

      let hasCurrency = true;
      let missingCurrency: number | undefined;
      if (recipe.currencyInput) {
        const currencyValue =
          (currency[recipe.currencyInput.currencyId] as number) ?? 0;
        if (currencyValue < recipe.currencyInput.amount) {
          hasCurrency = false;
          missingCurrency = recipe.currencyInput.amount - currencyValue;
        }
      }

      views.push({
        ...recipe,
        canCraft: hasItems && hasCurrency,
        missingItems: missing,
        missingCurrency,
      });
    }

    return OkResult(views);
  }

  async getRecipe(
    guildId: GuildId,
    userId: UserId,
    recipeId: string,
  ): Promise<Result<CraftingRecipeView | null, Error>> {
    const recipesResult = await this.getRecipes(guildId, userId);
    if (recipesResult.isErr()) return ErrResult(recipesResult.error);

    const recipe = recipesResult.unwrap().find((r) => r.id === recipeId);
    return OkResult(recipe ?? null);
  }

  async craft(input: CraftInput): Promise<Result<CraftResult, CraftingError>> {
    const { guildId, userId, recipeId, quantity = 1 } = input;

    if (quantity < 1 || !Number.isFinite(quantity)) {
      return ErrResult(
        new CraftingErrorClass("CRAFT_FAILED", "Cantidad inválida."),
      );
    }

    // Check guild feature flag
    const guildConfigResult = await guildEconomyRepo.findByGuildId(guildId);
    if (guildConfigResult.isOk()) {
      const guildConfig = guildConfigResult.unwrap();
      if (guildConfig && !guildConfig.features.crafting) {
        return ErrResult(
          new CraftingErrorClass(
            "FEATURE_DISABLED",
            "Crafting está deshabilitado en este servidor.",
          ),
        );
      }
    }

    // Rate limit check
    if (!checkRateLimit(userId)) {
      return ErrResult(
        new CraftingErrorClass(
          "RATE_LIMITED",
          "Demasiados crafts. Espera un momento.",
        ),
      );
    }

    // Get recipe
    const recipeResult = await craftingRepo.getRecipe(guildId, recipeId);
    if (recipeResult.isErr()) {
      return ErrResult(
        new CraftingErrorClass("CRAFT_FAILED", "Error al obtener la receta."),
      );
    }
    const recipe = recipeResult.unwrap();
    if (!recipe) {
      return ErrResult(
        new CraftingErrorClass("RECIPE_NOT_FOUND", "Receta no encontrada."),
      );
    }
    if (!recipe.enabled) {
      return ErrResult(
        new CraftingErrorClass(
          "RECIPE_DISABLED",
          "Esta receta está desactivada.",
        ),
      );
    }

    // Check account status
    const ensureResult = await economyAccountRepo.ensure(userId);
    if (ensureResult.isErr()) {
      return ErrResult(
        new CraftingErrorClass(
          "CRAFT_FAILED",
          "No se pudo acceder a la cuenta.",
        ),
      );
    }
    const { account } = ensureResult.unwrap();
    if (account.status === "blocked") {
      return ErrResult(
        new CraftingErrorClass(
          "ACCOUNT_BLOCKED",
          "Tu cuenta tiene restricciones temporales.",
        ),
      );
    }
    if (account.status === "banned") {
      return ErrResult(
        new CraftingErrorClass(
          "ACCOUNT_BANNED",
          "Tu cuenta tiene restricciones permanentes.",
        ),
      );
    }

    // Check level requirement
    if (recipe.requiredLevel) {
      const progressResult = await progressionService.getProgressView(
        guildId,
        userId,
      );
      const userLevel = progressResult.isOk()
        ? (progressResult.unwrap()?.level ?? 0)
        : 0;
      if (userLevel < recipe.requiredLevel) {
        return ErrResult(
          new CraftingErrorClass(
            "LEVEL_REQUIRED",
            `Necesitas nivel ${recipe.requiredLevel} para esta receta.`,
          ),
        );
      }
    }

    // Calculate scaled inputs/outputs
    const scaledInputs: RecipeItemInput[] = recipe.itemInputs.map((input) => ({
      itemId: input.itemId,
      quantity: input.quantity * quantity,
    }));

    const scaledOutputs: RecipeItemOutput[] = recipe.itemOutputs.map(
      (output) => ({
        itemId: output.itemId,
        quantity: output.quantity * quantity,
      }),
    );

    const scaledCurrencyAmount = recipe.currencyInput
      ? recipe.currencyInput.amount * quantity
      : undefined;

    const scaledGuildFee = recipe.guildFee
      ? recipe.guildFee.amount * quantity
      : undefined;

    const correlationId = `craft_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Perform atomic crafting via user transition
    return runUserTransition(userId, {
      attempts: 4,
      getSnapshot: (user) => ({
        inventory: (user.inventory ?? {}) as ItemInventory,
        currency: (user.currency ?? {}) as CurrencyInventory,
      }),
      computeNext: (snapshot) => {
        // Check items
        const { sufficient: hasItems, missing } = hasRequiredItems(
          snapshot.inventory,
          scaledInputs,
        );
        if (!hasItems) {
          return ErrResult(
            new Error(`INSUFFICIENT_ITEMS:${JSON.stringify(missing)}`),
          );
        }

        // Check currency
        if (recipe.currencyInput && scaledCurrencyAmount) {
          const currencyValue =
            (snapshot.currency[recipe.currencyInput.currencyId] as number) ?? 0;
          if (currencyValue < scaledCurrencyAmount) {
            return ErrResult(new Error("INSUFFICIENT_CURRENCY"));
          }
        }

        // Check output capacity
        if (!checkOutputCapacity(snapshot.inventory, scaledOutputs)) {
          return ErrResult(new Error("CAPACITY_EXCEEDED"));
        }

        // Build new inventory (remove inputs, add outputs)
        const newInventory: ItemInventory = { ...snapshot.inventory };

        // Remove inputs
        for (const input of scaledInputs) {
          const current = newInventory[input.itemId];
          if (current) {
            const newQty = current.quantity - input.quantity;
            if (newQty <= 0) {
              delete newInventory[input.itemId];
            } else {
              newInventory[input.itemId] = { ...current, quantity: newQty };
            }
          }
        }

        // Add outputs
        for (const output of scaledOutputs) {
          const current = newInventory[output.itemId];
          if (current) {
            newInventory[output.itemId] = {
              ...current,
              quantity: current.quantity + output.quantity,
            };
          } else {
            newInventory[output.itemId] = {
              id: output.itemId,
              quantity: output.quantity,
            };
          }
        }

        // Build new currency (deduct cost)
        let newCurrency: CurrencyInventory | undefined;
        if (recipe.currencyInput && scaledCurrencyAmount) {
          const costValue =
            recipe.currencyInput.currencyId === "coins"
              ? {
                  hand: scaledCurrencyAmount,
                  bank: 0,
                  use_total_on_subtract: true,
                }
              : scaledCurrencyAmount;

          const currencyResult = currencyEngine.apply(snapshot.currency, {
            costs: [
              { currencyId: recipe.currencyInput.currencyId, value: costValue },
            ],
            allowDebt: false,
          });

          if (currencyResult.isErr()) {
            return ErrResult(new Error("INSUFFICIENT_CURRENCY"));
          }
          newCurrency = currencyResult.unwrap();
        }

        return OkResult({
          inventory: newInventory,
          currency: newCurrency ?? snapshot.currency,
          inputs: scaledInputs,
          outputs: scaledOutputs,
          currencySpent: scaledCurrencyAmount,
        });
      },
      commit: async (_userId, expected, next) => {
        type NextType = {
          inventory: ItemInventory;
          currency: CurrencyInventory;
          inputs: RecipeItemInput[];
          outputs: RecipeItemOutput[];
          currencySpent?: number;
        };
        const n = next as NextType;
        return UserStore.replaceIfMatch(
          userId,
          { inventory: expected.inventory, currency: expected.currency } as any,
          { inventory: n.inventory, currency: n.currency } as any,
        );
      },
      project: (_updatedUser, next) =>
        next as {
          inventory: ItemInventory;
          currency: CurrencyInventory;
          inputs: RecipeItemInput[];
          outputs: RecipeItemOutput[];
          currencySpent?: number;
        },
      conflictError: "CRAFT_CONFLICT",
    }).then(async (result) => {
      if (result.isErr()) {
        const err = result.error;
        const message = err.message;

        if (message.startsWith("INSUFFICIENT_ITEMS:")) {
          return ErrResult(
            new CraftingErrorClass(
              "INSUFFICIENT_ITEMS",
              "No tienes los materiales necesarios.",
            ),
          );
        }
        if (message === "INSUFFICIENT_CURRENCY") {
          return ErrResult(
            new CraftingErrorClass(
              "INSUFFICIENT_CURRENCY",
              "No tienes suficiente moneda.",
            ),
          );
        }
        if (message === "CAPACITY_EXCEEDED") {
          return ErrResult(
            new CraftingErrorClass(
              "CAPACITY_EXCEEDED",
              "No tienes espacio suficiente en el inventario.",
            ),
          );
        }
        return ErrResult(
          new CraftingErrorClass(
            "CRAFT_FAILED",
            "Error al craftear. Intenta de nuevo.",
          ),
        );
      }

      const commit = result.unwrap();

      // Deposit guild fee if applicable
      if (recipe.guildFee && scaledGuildFee && scaledGuildFee > 0) {
        const feeResult = await guildEconomyService.depositToSector({
          guildId,
          sector: recipe.guildFee.sector,
          amount: scaledGuildFee,
          source: "crafting_fee",
          reason: `Crafting fee for ${recipeId} x${quantity}`,
        });

        if (feeResult.isErr()) {
          console.error(
            "[CraftingService] Failed to deposit guild fee:",
            feeResult.error,
          );
          // Don't fail the craft, but log the error
        }
      }

      // Grant XP
      let xpGained = 0;
      if (recipe.xpReward) {
        xpGained = recipe.xpReward * quantity;
        const xpResult = await progressionService.addXP({
          guildId,
          userId,
          sourceOp: "craft",
          amount: xpGained,
          correlationId,
          metadata: { recipeId, quantity },
        });

        if (xpResult.isErr()) {
          console.error(
            "[CraftingService] Failed to grant XP:",
            xpResult.error,
          );
        }
      }

      // Audit
      await economyAuditRepo.create({
        operationType: "craft",
        actorId: userId,
        targetId: userId,
        guildId,
        source: "crafting",
        reason: `Craft ${recipeId} x${quantity}`,
        metadata: {
          correlationId,
          recipeId,
          quantity,
          itemInputs: commit.inputs,
          itemOutputs: commit.outputs,
          currencySpent: commit.currencySpent,
          currencyId: recipe.currencyInput?.currencyId,
          guildFee: scaledGuildFee,
          xpGained,
        },
      });

      return OkResult({
        guildId,
        userId,
        recipeId,
        quantity,
        itemInputs: commit.inputs,
        itemOutputs: commit.outputs,
        currencySpent: commit.currencySpent,
        currencyId: recipe.currencyInput?.currencyId,
        guildFee: scaledGuildFee,
        xpGained,
        correlationId,
        timestamp: new Date(),
      });
    });
  }
}

export const craftingService: CraftingService = new CraftingServiceImpl();
