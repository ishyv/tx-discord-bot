/**
 * Perk Service.
 *
 * Purpose: list perks, compute effects, and handle purchases.
 * Encaje: Uses user CAS transitions for atomic currency + perk updates.
 */

import { UserStore } from "@/db/repositories/users";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { runUserTransition } from "@/db/user-transition";
import type { GuildId, UserId } from "@/db/types";
import type { CurrencyInventory } from "../currency";
import { currencyEngine, currencyRegistry } from "../transactions";
import { economyAccountRepo } from "../account/repository";
import { progressionService } from "../progression/service";
import { economyAuditRepo } from "../audit/repository";
import { getPerkDefinition, listPerkDefinitions } from "./registry";
import {
  type PerkState,
  type PerkView,
  type PerkEffectsSummary,
  type PerkPurchaseInput,
  type PerkPurchaseResult,
  PerkError,
} from "./types";

type PerkSnapshot = {
  currency: CurrencyInventory;
  perks: Record<string, { levels?: Record<string, number>; updatedAt?: Date }>;
};

type PerkCommit = {
  currency: CurrencyInventory;
  perks: Record<string, { levels: Record<string, number>; updatedAt: Date }>;
  beforeCurrency: unknown;
  afterCurrency: unknown;
  beforeLevel: number;
  afterLevel: number;
  cost: { currencyId: string; amount: number; minLevel?: number };
  correlationId: string;
};

const MAX_WORK_BONUS_PCT = 0.5;

const normalizeLevel = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;

const getCurrencyValue = (
  inventory: CurrencyInventory,
  currencyId: string,
): unknown => {
  if (currencyId in inventory) return inventory[currencyId];
  const currency = currencyRegistry.get(currencyId);
  return currency ? currency.zero() : 0;
};

const buildCurrencyCostValue = (
  currencyId: string,
  amount: number,
): unknown => {
  if (currencyId === "coins") {
    return { hand: amount, bank: 0, use_total_on_subtract: true };
  }
  return amount;
};

const buildPerkState = (
  guildId: GuildId,
  userId: UserId,
  perks: PerkSnapshot["perks"],
): PerkState => {
  const state = perks[guildId];
  return {
    guildId,
    userId,
    levels: state?.levels ?? {},
    updatedAt: state?.updatedAt ?? new Date(0),
  };
};

const computeEffects = (levels: Record<string, number>): PerkEffectsSummary => {
  const summary: PerkEffectsSummary = {
    weightCapBonus: 0,
    slotCapBonus: 0,
    workBonusPct: 0,
    dailyBonusCap: 0,
  };

  for (const [perkId, levelRaw] of Object.entries(levels)) {
    const perk = getPerkDefinition(perkId);
    if (!perk) continue;
    const level = normalizeLevel(levelRaw);
    if (level <= 0) continue;

    for (const effect of perk.effects) {
      const total = effect.value * level;
      switch (effect.type) {
        case "weight_cap":
          summary.weightCapBonus += total;
          break;
        case "slot_cap":
          summary.slotCapBonus += total;
          break;
        case "work_bonus_pct":
          summary.workBonusPct += total;
          break;
        case "daily_bonus_cap":
          summary.dailyBonusCap += total;
          break;
        default:
          break;
      }
    }
  }

  summary.workBonusPct = Math.min(
    MAX_WORK_BONUS_PCT,
    Math.max(0, summary.workBonusPct),
  );
  summary.weightCapBonus = Math.max(0, Math.round(summary.weightCapBonus));
  summary.slotCapBonus = Math.max(0, Math.round(summary.slotCapBonus));
  summary.dailyBonusCap = Math.max(0, Math.round(summary.dailyBonusCap));

  return summary;
};

export class PerkService {
  async listPerks(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<PerkView[], Error>> {
    const stateResult = await this.getState(guildId, userId);
    if (stateResult.isErr()) return ErrResult(stateResult.error);

    const state = stateResult.unwrap();
    const views = listPerkDefinitions().map((perk) => {
      const level = normalizeLevel(state.levels[perk.id]);
      const nextLevel = level + 1;
      const nextCost = nextLevel > perk.maxLevel ? null : perk.cost(nextLevel);
      return {
        id: perk.id,
        name: perk.name,
        description: perk.description,
        level,
        maxLevel: perk.maxLevel,
        effects: perk.effects,
        nextCost,
      };
    });

    return OkResult(views);
  }

  async getState(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<PerkState, Error>> {
    const userResult = await UserStore.ensure(userId);
    if (userResult.isErr()) return ErrResult(userResult.error);
    const user = userResult.unwrap();

    const snapshot = (user.perks ?? {}) as PerkSnapshot["perks"];
    return OkResult(buildPerkState(guildId, userId, snapshot));
  }

  async getEffects(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<PerkEffectsSummary, Error>> {
    const stateResult = await this.getState(guildId, userId);
    if (stateResult.isErr()) return ErrResult(stateResult.error);
    const state = stateResult.unwrap();
    return OkResult(computeEffects(state.levels));
  }

  async getCapacityLimits(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<{ maxWeight: number; maxSlots: number }, Error>> {
    const effectsResult = await this.getEffects(guildId, userId);
    if (effectsResult.isErr()) return ErrResult(effectsResult.error);
    const effects = effectsResult.unwrap();
    return OkResult({
      maxWeight: 200 + effects.weightCapBonus,
      maxSlots: 20 + effects.slotCapBonus,
    });
  }

  async getWorkBonusPct(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<number, Error>> {
    const effectsResult = await this.getEffects(guildId, userId);
    if (effectsResult.isErr()) return ErrResult(effectsResult.error);
    return OkResult(effectsResult.unwrap().workBonusPct);
  }

  async purchasePerk(
    input: PerkPurchaseInput,
  ): Promise<Result<PerkPurchaseResult, PerkError>> {
    const { guildId, userId, perkId } = input;

    const perk = getPerkDefinition(perkId);
    if (!perk) {
      return ErrResult(new PerkError("PERK_NOT_FOUND", "Perk not found."));
    }

    const ensureResult = await economyAccountRepo.ensure(userId);
    if (ensureResult.isErr()) {
      return ErrResult(
        new PerkError("UPDATE_FAILED", "Could not access the account."),
      );
    }
    const { account } = ensureResult.unwrap();
    if (account.status === "blocked") {
      return ErrResult(
        new PerkError(
          "ACCOUNT_BLOCKED",
          "Your account has temporary restrictions.",
        ),
      );
    }
    if (account.status === "banned") {
      return ErrResult(
        new PerkError(
          "ACCOUNT_BANNED",
          "Your account has permanent restrictions.",
        ),
      );
    }

    const progressResult = await progressionService.getProgressView(
      guildId,
      userId,
    );
    const progressionLevel =
      progressResult.isOk() && progressResult.unwrap()
        ? progressResult.unwrap()!.level
        : 0;

    return runUserTransition(userId, {
      attempts: 4,
      getSnapshot: (user) => ({
        currency: (user.currency ?? {}) as CurrencyInventory,
        perks: (user.perks ?? {}) as PerkSnapshot["perks"],
      }),
      computeNext: (snapshot) => {
        const state = buildPerkState(guildId, userId, snapshot.perks);
        const currentLevel = normalizeLevel(state.levels[perkId]);
        if (currentLevel >= perk.maxLevel) {
          return ErrResult(new Error("PERK_MAXED"));
        }

        const nextLevel = currentLevel + 1;
        const cost = perk.cost(nextLevel);

        if (cost.minLevel && progressionLevel < cost.minLevel) {
          return ErrResult(new Error("LEVEL_REQUIRED"));
        }

        const costValue = buildCurrencyCostValue(cost.currencyId, cost.amount);
        const nextCurrencyResult = currencyEngine.apply(snapshot.currency, {
          costs: [{ currencyId: cost.currencyId, value: costValue }],
          allowDebt: false,
        });

        if (nextCurrencyResult.isErr()) {
          return ErrResult(new Error("INSUFFICIENT_FUNDS"));
        }

        const nextCurrency = nextCurrencyResult.unwrap();
        const nextLevels = {
          ...state.levels,
          [perkId]: nextLevel,
        };

        const nextPerks = {
          ...snapshot.perks,
          [guildId]: {
            levels: nextLevels,
            updatedAt: new Date(),
          },
        };

        return OkResult({
          currency: nextCurrency,
          perks: nextPerks,
          beforeCurrency: getCurrencyValue(snapshot.currency, cost.currencyId),
          afterCurrency: getCurrencyValue(nextCurrency, cost.currencyId),
          beforeLevel: currentLevel,
          afterLevel: nextLevel,
          cost,
          correlationId: `perk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        });
      },
      commit: async (_userId, expected, next) => {
        const n = next as PerkCommit;
        return UserStore.replaceIfMatch(
          userId,
          { currency: expected.currency, perks: expected.perks } as any,
          { currency: n.currency, perks: n.perks } as any,
        );
      },
      project: (_updatedUser, next) => next as PerkCommit,
      conflictError: "PERK_PURCHASE_CONFLICT",
    }).then(async (result) => {
      if (result.isErr()) {
        const err = result.error;
        const message = err.message;
        if (message === "PERK_MAXED") {
          return ErrResult(
            new PerkError("PERK_MAXED", "Perk already at max level."),
          );
        }
        if (message === "LEVEL_REQUIRED") {
          return ErrResult(
            new PerkError("LEVEL_REQUIRED", "You do not meet the required level."),
          );
        }
        if (message === "INSUFFICIENT_FUNDS") {
          return ErrResult(
            new PerkError(
              "INSUFFICIENT_FUNDS",
              "You do not have enough funds.",
            ),
          );
        }
        if (message === "PERK_PURCHASE_CONFLICT") {
          return ErrResult(
            new PerkError(
              "CONFLICT",
              "Purchase conflict. Try again.",
            ),
          );
        }
        return ErrResult(
          new PerkError("UPDATE_FAILED", "Could not complete purchase."),
        );
      }

      const commit = result.unwrap() as PerkCommit;
      const audit = await economyAuditRepo.create({
        operationType: "perk_purchase",
        actorId: userId,
        targetId: userId,
        guildId,
        source: "perks",
        reason: `Purchase perk ${perkId}`,
        currencyData: {
          currencyId: commit.cost.currencyId,
          delta: -commit.cost.amount,
          beforeBalance: commit.beforeCurrency,
          afterBalance: commit.afterCurrency,
        },
        metadata: {
          correlationId: commit.correlationId,
          perkId,
          beforeLevel: commit.beforeLevel,
          afterLevel: commit.afterLevel,
          cost: commit.cost.amount,
          currencyId: commit.cost.currencyId,
          minLevel: commit.cost.minLevel ?? null,
        },
      });

      if (audit.isErr()) {
        console.error(
          "[PerkService] Failed to create audit entry:",
          audit.error,
        );
      }

      return OkResult({
        guildId,
        userId,
        perkId,
        beforeLevel: commit.beforeLevel,
        afterLevel: commit.afterLevel,
        cost: commit.cost,
        correlationId: commit.correlationId,
        beforeCurrency: commit.beforeCurrency,
        afterCurrency: commit.afterCurrency,
        timestamp: new Date(),
      });
    });
  }
}

export const perkService = new PerkService();

