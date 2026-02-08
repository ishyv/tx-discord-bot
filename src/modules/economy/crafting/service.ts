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
import { isInstanceBased } from "@/modules/inventory/instances";
import { itemInstanceService } from "@/modules/economy/mutations/items/instance-service";
import { rpgProfileRepo } from "@/modules/rpg/profile/repository";
import { getToolTierFromItemId } from "@/modules/rpg/gathering/definitions";
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

interface UserCraftingContext {
  readonly profession: "miner" | "lumber" | null;
  readonly toolTier: number;
}

async function getUserCraftingContext(userId: UserId): Promise<UserCraftingContext> {
  const profileResult = await rpgProfileRepo.findById(userId);
  if (profileResult.isErr() || !profileResult.unwrap()) {
    return { profession: null, toolTier: 0 };
  }

  const profile = profileResult.unwrap()!;
  const profession = profile.starterKitType;

  const equippedWeapon = profile.loadout.weapon;
  const equippedItemId =
    typeof equippedWeapon === "string"
      ? equippedWeapon
      : equippedWeapon?.itemId ?? null;

  if (!equippedItemId) {
    return { profession, toolTier: 0 };
  }

  const toolDef = getItemDefinition(equippedItemId);
  if (toolDef?.tool?.tier !== undefined) {
    return { profession, toolTier: toolDef.tool.tier };
  }

  return { profession, toolTier: getToolTierFromItemId(equippedItemId) };
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

export class CraftingService {
  async getRecipes(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<CraftingRecipeView[], Error>> {
    const [recipesResult, userResult, craftingContext] = await Promise.all([
      craftingRepo.getRecipes(guildId),
      UserStore.get(userId),
      getUserCraftingContext(userId),
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

      const meetsProfession =
        !recipe.professionRequirement ||
        recipe.professionRequirement === craftingContext.profession;
      const meetsTier =
        !recipe.tierRequirement ||
        craftingContext.toolTier >= recipe.tierRequirement;

      let requirementIssue: string | undefined;
      if (!meetsProfession && recipe.professionRequirement) {
        requirementIssue = `Requires ${recipe.professionRequirement} profession path`;
      } else if (!meetsTier && recipe.tierRequirement) {
        requirementIssue = `Requires tool tier ${recipe.tierRequirement}`;
      }

      views.push({
        ...recipe,
        canCraft: hasItems && hasCurrency && meetsProfession && meetsTier,
        missingItems: missing,
        missingCurrency,
        requirementIssue,
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
        new CraftingErrorClass("CRAFT_FAILED", "Invalid quantity."),
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
            "Crafting is disabled in this server.",
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
        new CraftingErrorClass("CRAFT_FAILED", "Error getting the recipe."),
      );
    }
    const recipe = recipeResult.unwrap();
    if (!recipe) {
      return ErrResult(
        new CraftingErrorClass("RECIPE_NOT_FOUND", "Recipe not found."),
      );
    }
    if (!recipe.enabled) {
      return ErrResult(
        new CraftingErrorClass(
          "RECIPE_DISABLED",
          "This recipe is disabled.",
        ),
      );
    }

    // Check account status
    const ensureResult = await economyAccountRepo.ensure(userId);
    if (ensureResult.isErr()) {
      return ErrResult(
        new CraftingErrorClass(
          "CRAFT_FAILED",
          "Could not access the account.",
        ),
      );
    }
    const { account } = ensureResult.unwrap();
    if (account.status === "blocked") {
      return ErrResult(
        new CraftingErrorClass(
          "ACCOUNT_BLOCKED",
          "Your account has temporary restrictions.",
        ),
      );
    }
    if (account.status === "banned") {
      return ErrResult(
        new CraftingErrorClass(
          "ACCOUNT_BANNED",
          "Your account has permanent restrictions.",
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
            `You need level ${recipe.requiredLevel} for this recipe.`,
          ),
        );
      }
    }

    // Check profession and tool tier requirements
    const craftingContext = await getUserCraftingContext(userId);
    if (
      recipe.professionRequirement &&
      craftingContext.profession !== recipe.professionRequirement
    ) {
      return ErrResult(
        new CraftingErrorClass(
          "PROFESSION_REQUIRED",
          `You need profession ${recipe.professionRequirement} for this recipe.`,
        ),
      );
    }

    if (
      recipe.tierRequirement &&
      craftingContext.toolTier < recipe.tierRequirement
    ) {
      return ErrResult(
        new CraftingErrorClass(
          "TIER_REQUIRED",
          `You need tool tier ${recipe.tierRequirement} for this recipe.`,
        ),
      );
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

    const stackableOutputs: RecipeItemOutput[] = [];
    const instanceOutputs: RecipeItemOutput[] = [];
    for (const output of scaledOutputs) {
      if (isInstanceBased(output.itemId)) {
        instanceOutputs.push(output);
      } else {
        stackableOutputs.push(output);
      }
    }

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
        if (!checkOutputCapacity(snapshot.inventory, stackableOutputs)) {
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

        // Add stackable outputs
        for (const output of stackableOutputs) {
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
              "You do not have the required materials.",
            ),
          );
        }
        if (message === "INSUFFICIENT_CURRENCY") {
          return ErrResult(
            new CraftingErrorClass(
              "INSUFFICIENT_CURRENCY",
              "You do not have enough currency.",
            ),
          );
        }
        if (message === "CAPACITY_EXCEEDED") {
          return ErrResult(
            new CraftingErrorClass(
              "CAPACITY_EXCEEDED",
              "You do not have enough inventory space.",
            ),
          );
        }
        return ErrResult(
          new CraftingErrorClass(
            "CRAFT_FAILED",
            "Error crafting item. Try again.",
          ),
        );
      }

      const commit = result.unwrap();
      const warnings: string[] = [];

      for (const output of instanceOutputs) {
        const grantResult = await itemInstanceService.grantInstances({
          actorId: userId,
          targetId: userId,
          guildId,
          itemId: output.itemId,
          count: output.quantity,
          reason: `Craft output ${recipeId}`,
          correlationId,
        });

        if (grantResult.isErr()) {
          const warning = `Could not grant ${output.quantity}x ${output.itemId} as instance: ${grantResult.error.message}`;
          warnings.push(warning);
          console.error("[CraftingService] Instance output grant failed:", warning);
        }
      }

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
          warnings,
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
        warnings: warnings.length > 0 ? warnings : undefined,
        correlationId,
        timestamp: new Date(),
      });
    });
  }
}

export const craftingService = new CraftingService();



