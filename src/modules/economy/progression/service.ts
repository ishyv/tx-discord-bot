/**
 * Progression Service.
 *
 * Purpose: Central entrypoint for XP gains and level progression.
 */

import { ErrResult, OkResult, type Result } from "@/utils/result";
import type {
  ProgressionGrantInput,
  ProgressionGrantResult,
  ProgressionView,
  ProgressionError,
} from "./types";
import { ProgressionError as ProgressionErrorImpl } from "./types";
import { getLevelFromXP, getXPForLevel, MAX_LEVEL } from "./curve";
import { progressionRepo } from "./repository";
import { guildEconomyService } from "../guild/service";
import { economyAuditRepo } from "../audit/repository";

const normalizeAmount = (value: number): number => Math.trunc(value);

function buildProgressionView(totalXP: number): ProgressionView {
  const level = getLevelFromXP(totalXP);
  const currentLevelXP = getXPForLevel(level);
  const nextLevelXP = level >= MAX_LEVEL ? null : getXPForLevel(level + 1);
  const progressToNext =
    nextLevelXP === null ? 0 : Math.max(0, totalXP - currentLevelXP);
  const denominator =
    nextLevelXP === null ? 0 : Math.max(1, nextLevelXP - currentLevelXP);
  const progressPercent =
    nextLevelXP === null
      ? 100
      : Math.min(100, (progressToNext / denominator) * 100);

  return {
    level,
    totalXP,
    currentLevelXP,
    nextLevelXP,
    progressToNext,
    progressPercent,
    isMaxLevel: level >= MAX_LEVEL,
  };
}

export interface ProgressionService {
  addXP(
    input: ProgressionGrantInput,
  ): Promise<Result<ProgressionGrantResult, ProgressionError>>;
  getProgressView(
    guildId: string,
    userId: string,
  ): Promise<Result<ProgressionView, ProgressionError>>;
}

class ProgressionServiceImpl implements ProgressionService {
  async addXP(
    input: ProgressionGrantInput,
  ): Promise<Result<ProgressionGrantResult, ProgressionError>> {
    const amount = normalizeAmount(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return ErrResult(
        new ProgressionErrorImpl(
          "INVALID_AMOUNT",
          "XP amount must be positive.",
        ),
      );
    }

    const configResult = await guildEconomyService.getConfig(input.guildId);
    if (configResult.isErr()) {
      return ErrResult(
        new ProgressionErrorImpl(
          "UPDATE_FAILED",
          "Failed to load guild config.",
        ),
      );
    }

    const config = configResult.unwrap().progression;
    if (!config.enabled) {
      return ErrResult(
        new ProgressionErrorImpl("CONFIG_DISABLED", "Progression is disabled."),
      );
    }

    const cooldownSeconds = config.cooldownSeconds[input.sourceOp] ?? 0;
    const now = new Date();

    const updateResult = await progressionRepo.updateState(
      input.guildId,
      input.userId,
      (current) => {
        const lastGrant = current.cooldowns?.[input.sourceOp];
        if (cooldownSeconds > 0 && lastGrant) {
          const elapsedMs = now.getTime() - lastGrant.getTime();
          if (elapsedMs < cooldownSeconds * 1000) {
            return OkResult(current);
          }
        }

        const nextTotal = Math.max(0, current.totalXP + amount);
        const nextLevel = getLevelFromXP(nextTotal);
        const nextCooldowns = {
          ...(current.cooldowns ?? {}),
          [input.sourceOp]: now,
        };

        return OkResult({
          ...current,
          totalXP: nextTotal,
          level: nextLevel,
          updatedAt: now,
          cooldowns: nextCooldowns,
        });
      },
    );

    if (updateResult.isErr()) {
      return ErrResult(
        new ProgressionErrorImpl(
          "UPDATE_FAILED",
          "Failed to update progression.",
        ),
      );
    }

    const { before, after } = updateResult.unwrap();
    const leveledUp = after.level > before.level;

    if (after.totalXP !== before.totalXP) {
      await economyAuditRepo.create({
        operationType: "xp_grant",
        actorId: input.userId,
        targetId: input.userId,
        guildId: input.guildId,
        source: input.sourceOp,
        reason: "xp grant",
        metadata: {
          source: input.sourceOp,
          amount,
          beforeXP: before.totalXP,
          afterXP: after.totalXP,
          beforeLevel: before.level,
          afterLevel: after.level,
          leveledUp,
          correlationId: input.correlationId,
          ...(input.metadata ?? {}),
        },
      });
    }

    return OkResult({
      beforeXP: before.totalXP,
      afterXP: after.totalXP,
      beforeLevel: before.level,
      afterLevel: after.level,
      leveledUp,
    });
  }

  async getProgressView(
    guildId: string,
    userId: string,
  ): Promise<Result<ProgressionView, ProgressionError>> {
    const stateResult = await progressionRepo.getState(guildId, userId);
    if (stateResult.isErr()) {
      return ErrResult(
        new ProgressionErrorImpl(
          "UPDATE_FAILED",
          "Failed to load progression.",
        ),
      );
    }

    return OkResult(buildProgressionView(stateResult.unwrap().totalXP));
  }
}

export const progressionService: ProgressionService =
  new ProgressionServiceImpl();
export { buildProgressionView };
