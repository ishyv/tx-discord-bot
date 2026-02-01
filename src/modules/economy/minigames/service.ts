/**
 * Minigames Service (Phase 9c).
 *
 * Purpose: Core game logic with enhanced trivia, anti-abuse protection, and atomic transactions.
 */

import { UserStore } from "@/db/repositories/users";
import type { GuildId, UserId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { runUserTransition } from "@/db/user-transition";
import type { CurrencyInventory } from "@/modules/economy/currency";
import { currencyEngine } from "@/modules/economy/transactions";
import { economyAccountRepo } from "@/modules/economy/account/repository";
import { economyAuditRepo } from "@/modules/economy/audit/repository";
import { progressionService } from "@/modules/economy/progression/service";
import { guildEconomyService } from "@/modules/economy/guild/service";
import { guildEconomyRepo } from "@/modules/economy/guild/repository";
import type {
  CoinflipInput,
  CoinflipResult,
  TriviaInput,
  TriviaResult,
  TriviaStartResult,
  RobInput,
  RobResult,
  MinigameState,
  MinigameError,
  TriviaSession,
  TriviaRewardBreakdown,
} from "./types";
import { MinigameError as MinigameErrorClass } from "./types";
import { minigameRepo } from "./repository";
import {
  getRandomQuestion,
  getQuestionById,
  validateAnswer,
  calculateRewards,
} from "./config";

// =============================================================================
// Utility Functions
// =============================================================================

/** Check if a cooldown has expired. */
function isCooldownExpired(
  lastTime: Date | undefined,
  cooldownSeconds: number,
): boolean {
  if (!lastTime) return true;
  return Date.now() - new Date(lastTime).getTime() >= cooldownSeconds * 1000;
}

/** Get pair key for rob cooldown tracking. */
function getPairKey(robberId: string, targetId: string): string {
  return `${robberId}:${targetId}`;
}

/** Flip a coin with 50/50 chance. */
function flipCoin(): "heads" | "tails" {
  return Math.random() < 0.5 ? "heads" : "tails";
}

/** Check if rob attempt succeeds based on fail chance. */
function rollRobSuccess(failChance: number): boolean {
  return Math.random() >= failChance;
}

/** Calculate amount to steal with caps. */
function calculateStealAmount(
  targetBalance: number,
  maxStealPct: number,
  maxStealAmount: number,
): number {
  const pctAmount = Math.floor(targetBalance * maxStealPct);
  return Math.min(pctAmount, maxStealAmount);
}

// =============================================================================
// Active Sessions (for timeout handling)
// =============================================================================

const activeTriviaSessions = new Map<string, TriviaSession>();

/** Generate session key. */
function getSessionKey(userId: string, guildId: string): string {
  return `${userId}:${guildId}`;
}

// =============================================================================
// Service Interface
// =============================================================================

export interface MinigameService {
  /** Coinflip game. */
  coinflip(
    input: CoinflipInput,
  ): Promise<Result<CoinflipResult, MinigameError>>;

  /** Trivia game (Phase 9c Enhanced). */
  startTrivia(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<TriviaStartResult, MinigameError>>;
  answerTrivia(
    input: TriviaInput,
  ): Promise<Result<TriviaResult, MinigameError>>;
  getTriviaSession(
    userId: UserId,
    guildId: GuildId,
  ): Promise<TriviaSession | undefined>;
  clearTriviaSession(userId: UserId, guildId: GuildId): void;

  /** Rob game. */
  rob(input: RobInput): Promise<Result<RobResult, MinigameError>>;

  /** Admin: Reset daily limits for a user. */
  resetDailyLimits(userId: UserId): Promise<Result<void, Error>>;
}

// =============================================================================
// Service Implementation
// =============================================================================

class MinigameServiceImpl implements MinigameService {
  // ============================================================================
  // Coinflip
  // ============================================================================

  async coinflip(
    input: CoinflipInput,
  ): Promise<Result<CoinflipResult, MinigameError>> {
    const { guildId, userId, amount, choice } = input;

    // Validate choice
    if (choice !== "heads" && choice !== "tails") {
      return ErrResult(
        new MinigameErrorClass("INVALID_CHOICE", "Elige 'cara' o 'cruz'."),
      );
    }

    // Get config
    const configResult = await minigameRepo.getCoinflipConfig(guildId);
    if (configResult.isErr()) {
      return ErrResult(
        new MinigameErrorClass(
          "CONFIG_NOT_FOUND",
          "Configuración no encontrada.",
        ),
      );
    }
    const config = configResult.unwrap();

    if (!config.enabled) {
      return ErrResult(
        new MinigameErrorClass(
          "CONFIG_NOT_FOUND",
          "Coinflip está desactivado.",
        ),
      );
    }

    // Check guild feature flag
    const guildConfigResult = await guildEconomyRepo.findByGuildId(guildId);
    if (guildConfigResult.isOk()) {
      const guildConfig = guildConfigResult.unwrap();
      if (guildConfig && !guildConfig.features.coinflip) {
        return ErrResult(
          new MinigameErrorClass(
            "FEATURE_DISABLED",
            "Coinflip está deshabilitado en este servidor.",
          ),
        );
      }
    }

    // Check account status
    const ensureResult = await economyAccountRepo.ensure(userId);
    if (ensureResult.isErr()) {
      return ErrResult(
        new MinigameErrorClass(
          "UPDATE_FAILED",
          "No se pudo acceder a la cuenta.",
        ),
      );
    }
    const { account } = ensureResult.unwrap();
    if (account.status === "blocked") {
      return ErrResult(
        new MinigameErrorClass(
          "TARGET_BLOCKED",
          "Tu cuenta tiene restricciones.",
        ),
      );
    }
    if (account.status === "banned") {
      return ErrResult(
        new MinigameErrorClass("TARGET_BANNED", "Tu cuenta está baneada."),
      );
    }

    // Check and reset dailies
    const stateResult = await minigameRepo.checkAndResetDailies(userId);
    if (stateResult.isErr()) {
      return ErrResult(
        new MinigameErrorClass("UPDATE_FAILED", "Error al verificar límites."),
      );
    }
    const state = stateResult.unwrap();

    // Anti-abuse: Check daily limit
    if (state.coinflip.dailyCount >= config.dailyMaxBets) {
      return ErrResult(
        new MinigameErrorClass(
          "DAILY_LIMIT_REACHED",
          `Límite diario de ${config.dailyMaxBets} apuestas alcanzado.`,
        ),
      );
    }

    // Anti-abuse: Check cooldown
    if (!isCooldownExpired(state.coinflip.lastPlayAt, config.cooldownSeconds)) {
      const remaining = Math.ceil(
        (new Date(state.coinflip.lastPlayAt!).getTime() +
          config.cooldownSeconds * 1000 -
          Date.now()) /
          1000,
      );
      return ErrResult(
        new MinigameErrorClass(
          "COOLDOWN_ACTIVE",
          `Espera ${remaining}s antes de apostar de nuevo.`,
        ),
      );
    }

    // Anti-abuse: Check bet limits
    if (amount < config.minBet) {
      return ErrResult(
        new MinigameErrorClass(
          "BET_TOO_LOW",
          `Apuesta mínima: ${config.minBet} ${config.currencyId}`,
        ),
      );
    }
    if (amount > config.maxBet) {
      return ErrResult(
        new MinigameErrorClass(
          "BET_TOO_HIGH",
          `Apuesta máxima: ${config.maxBet} ${config.currencyId}`,
        ),
      );
    }

    const correlationId = `coinflip_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Atomic transaction
    return runUserTransition(userId, {
      attempts: 3,
      getSnapshot: (user) => ({
        currency: (user.currency ?? {}) as CurrencyInventory,
        state,
      }),
      computeNext: (snapshot) => {
        // Check balance
        const currentBalance =
          (snapshot.currency[config.currencyId] as number) ?? 0;
        if (currentBalance < amount) {
          return ErrResult(new Error("INSUFFICIENT_FUNDS"));
        }

        // Deduct bet
        const currencyResult = currencyEngine.apply(snapshot.currency, {
          costs: [{ currencyId: config.currencyId, value: amount }],
          allowDebt: false,
        });

        if (currencyResult.isErr()) {
          return ErrResult(new Error("INSUFFICIENT_FUNDS"));
        }

        // Flip coin
        const outcome = flipCoin();
        const won = outcome === choice;

        let finalCurrency = currencyResult.unwrap();
        let winnings = 0;
        let houseFee = 0;

        if (won) {
          // Calculate winnings (2x minus house edge)
          const grossWinnings = amount * 2;
          houseFee = Math.floor(grossWinnings * config.houseEdge);
          winnings = grossWinnings - houseFee;

          // Add winnings
          const winResult = currencyEngine.apply(finalCurrency, {
            rewards: [{ currencyId: config.currencyId, value: winnings }],
          });
          finalCurrency = winResult.unwrap();
        }

        // Update state
        const newState: MinigameState = {
          ...snapshot.state,
          coinflip: {
            dailyCount: snapshot.state.coinflip.dailyCount + 1,
            lastPlayAt: new Date(),
            dailyResetAt: snapshot.state.coinflip.dailyResetAt,
          },
        };

        return OkResult({
          currency: finalCurrency,
          state: newState,
          outcome,
          won,
          winnings,
          houseFee,
          netProfit: won ? winnings - amount : -amount,
        });
      },
      commit: async (_userId, expected, next) => {
        const n = next as {
          currency: CurrencyInventory;
          state: MinigameState;
          outcome: "heads" | "tails";
          won: boolean;
          winnings: number;
          houseFee: number;
          netProfit: number;
        };

        // Commit currency change
        const currencyCommit = await UserStore.replaceIfMatch(
          userId,
          { currency: expected.currency } as any,
          { currency: n.currency } as any,
        );

        if (currencyCommit.isErr() || !currencyCommit.unwrap()) {
          return currencyCommit;
        }

        // Commit state change
        await minigameRepo.updateUserState(userId, () => n.state);

        return currencyCommit;
      },
      project: (_updatedUser, next) => next,
      conflictError: "COINFLIP_CONFLICT",
    }).then(async (result) => {
      if (result.isErr()) {
        const err = result.error;
        if (err.message === "INSUFFICIENT_FUNDS") {
          return ErrResult(
            new MinigameErrorClass(
              "INSUFFICIENT_FUNDS",
              "No tienes suficiente saldo.",
            ),
          );
        }
        return ErrResult(
          new MinigameErrorClass(
            "UPDATE_FAILED",
            "Error al procesar la apuesta.",
          ),
        );
      }

      const commit = result.unwrap() as {
        currency: CurrencyInventory;
        state: MinigameState;
        outcome: "heads" | "tails";
        won: boolean;
        winnings: number;
        houseFee: number;
        netProfit: number;
      };

      // Audit
      await economyAuditRepo.create({
        operationType: "currency_adjust",
        actorId: userId,
        targetId: userId,
        guildId,
        source: "minigames:coinflip",
        reason: `Coinflip ${choice} - ${commit.won ? "win" : "loss"}`,
        currencyData: {
          currencyId: config.currencyId,
          delta: commit.netProfit,
          beforeBalance:
            (commit.currency[config.currencyId] as number) ??
            0 - commit.netProfit,
          afterBalance: (commit.currency[config.currencyId] as number) ?? 0,
        },
        metadata: {
          correlationId,
          type: "coinflip",
          bet: amount,
          choice,
          outcome: commit.outcome,
          won: commit.won,
          winnings: commit.winnings,
          houseFee: commit.houseFee,
        },
      });

      // Deposit house fee to guild if any
      if (commit.houseFee > 0) {
        await guildEconomyService.depositToSector({
          guildId,
          sector: "tax",
          amount: commit.houseFee,
          source: "coinflip_house_fee",
          reason: `House fee from ${userId}`,
        });
      }

      return OkResult({
        guildId,
        userId,
        amount,
        choice,
        outcome: commit.outcome,
        won: commit.won,
        winnings: commit.winnings,
        houseFee: commit.houseFee,
        netProfit: commit.netProfit,
        newBalance: (commit.currency[config.currencyId] as number) ?? 0,
        correlationId,
        timestamp: new Date(),
      });
    });
  }

  // ============================================================================
  // Trivia (Phase 9c Enhanced)
  // ============================================================================

  async startTrivia(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<TriviaStartResult, MinigameError>> {
    // Get config
    const configResult = await minigameRepo.getTriviaConfig(guildId);
    if (configResult.isErr()) {
      return ErrResult(
        new MinigameErrorClass(
          "CONFIG_NOT_FOUND",
          "Configuración no encontrada.",
        ),
      );
    }
    const config = configResult.unwrap();

    if (!config.enabled) {
      return ErrResult(
        new MinigameErrorClass("CONFIG_NOT_FOUND", "Trivia está desactivado."),
      );
    }

    // Check guild feature flag
    const guildConfigResult = await guildEconomyRepo.findByGuildId(guildId);
    if (guildConfigResult.isOk()) {
      const guildConfig = guildConfigResult.unwrap();
      if (guildConfig && !guildConfig.features.trivia) {
        return ErrResult(
          new MinigameErrorClass(
            "FEATURE_DISABLED",
            "Trivia está deshabilitado en este servidor.",
          ),
        );
      }
    }

    // Check and reset dailies
    const stateResult = await minigameRepo.checkAndResetDailies(userId);
    if (stateResult.isErr()) {
      return ErrResult(
        new MinigameErrorClass("UPDATE_FAILED", "Error al verificar límites."),
      );
    }
    const state = stateResult.unwrap();

    // Anti-abuse: Check daily limit
    if (state.trivia.dailyCount >= config.dailyMaxPlays) {
      return ErrResult(
        new MinigameErrorClass(
          "DAILY_LIMIT_REACHED",
          `Límite diario de ${config.dailyMaxPlays} trivia alcanzado.`,
        ),
      );
    }

    // Anti-abuse: Check cooldown
    if (!isCooldownExpired(state.trivia.lastPlayAt, config.cooldownSeconds)) {
      const remaining = Math.ceil(
        (new Date(state.trivia.lastPlayAt!).getTime() +
          config.cooldownSeconds * 1000 -
          Date.now()) /
          1000,
      );
      return ErrResult(
        new MinigameErrorClass(
          "COOLDOWN_ACTIVE",
          `Espera ${remaining}s antes de jugar de nuevo.`,
        ),
      );
    }

    // Get random question
    const question = getRandomQuestion();
    const correlationId = `trivia_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.timeoutSeconds * 1000);

    // Create session
    const session: TriviaSession = {
      userId,
      guildId,
      questionId: question.id,
      correlationId,
      startedAt: now,
      expiresAt,
      streak: state.trivia.currentStreak,
    };

    // Store session
    activeTriviaSessions.set(getSessionKey(userId, guildId), session);

    // Store pending question in state
    await minigameRepo.updateUserState(userId, (s) => ({
      ...s,
      trivia: {
        ...s.trivia,
        pendingQuestionId: question.id,
      },
    }));

    return OkResult({
      guildId,
      userId,
      question,
      correlationId,
      streak: state.trivia.currentStreak,
      expiresAt,
      timestamp: now,
    });
  }

  async answerTrivia(
    input: TriviaInput,
  ): Promise<Result<TriviaResult, MinigameError>> {
    const { guildId, userId, questionId, answerIndex } = input;

    // Validate answer index
    if (answerIndex < 0 || answerIndex > 3) {
      return ErrResult(
        new MinigameErrorClass("INVALID_CHOICE", "Respuesta inválida (A-D)."),
      );
    }

    // Get session
    const sessionKey = getSessionKey(userId, guildId);
    const session = activeTriviaSessions.get(sessionKey);

    // Check if session exists and matches
    if (!session || session.questionId !== questionId) {
      return ErrResult(
        new MinigameErrorClass(
          "INVALID_CHOICE",
          "No tienes una pregunta activa. Usa /trivia para empezar.",
        ),
      );
    }

    // Check timeout
    const now = new Date();
    if (now > session.expiresAt) {
      activeTriviaSessions.delete(sessionKey);
      return ErrResult(
        new MinigameErrorClass(
          "TIMEOUT_EXPIRED",
          "¡Se acabó el tiempo! La pregunta expiró.",
        ),
      );
    }

    // Get config
    const configResult = await minigameRepo.getTriviaConfig(guildId);
    if (configResult.isErr()) {
      return ErrResult(
        new MinigameErrorClass(
          "CONFIG_NOT_FOUND",
          "Configuración no encontrada.",
        ),
      );
    }
    const config = configResult.unwrap();

    // Get question
    const question = getQuestionById(questionId);
    if (!question) {
      return ErrResult(
        new MinigameErrorClass(
          "INVALID_CHOICE",
          "Pregunta no válida o expirada.",
        ),
      );
    }

    // Check if answer is correct
    const correct = validateAnswer(questionId, answerIndex);

    const correlationId = `trivia_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Calculate rewards
    const streakBefore = session.streak;
    const streakAfter = correct ? streakBefore + 1 : 0;

    // Calculate reward breakdown
    let rewards: TriviaRewardBreakdown;
    if (correct) {
      const calcResult = calculateRewards(
        question.difficulty,
        config.baseCurrencyReward,
        config.baseXpReward,
        streakBefore,
        config.streakBonusEnabled,
        config.streakBonusPerQuestion,
        config.maxStreakBonus,
      );
      rewards = {
        base: { currency: calcResult.breakdown.base, xp: config.baseXpReward },
        difficulty: { currency: calcResult.breakdown.difficulty, xp: Math.floor(config.baseXpReward * (config.difficultyMultipliers[question.difficulty] - 1)) },
        streak: { currency: calcResult.breakdown.streak, xp: Math.floor((config.baseXpReward + Math.floor(config.baseXpReward * (config.difficultyMultipliers[question.difficulty] - 1))) * Math.min(streakBefore * config.streakBonusPerQuestion, config.maxStreakBonus)) },
        total: { currency: calcResult.currency, xp: calcResult.xp },
      };
    } else {
      rewards = {
        base: { currency: 0, xp: 0 },
        difficulty: { currency: 0, xp: 0 },
        streak: { currency: 0, xp: 0 },
        total: { currency: 0, xp: 0 },
      };
    }

    // Clear session
    activeTriviaSessions.delete(sessionKey);

    // Get current state for snapshot
    const userStateResult = await minigameRepo.getUserState(userId);
    if (userStateResult.isErr()) {
      return ErrResult(
        new MinigameErrorClass("UPDATE_FAILED", "Error al obtener estado del usuario."),
      );
    }
    const currentState = userStateResult.unwrap();

    // Atomic transaction
    return runUserTransition(userId, {
      attempts: 3,
      getSnapshot: (user) => ({
        currency: (user.currency ?? {}) as CurrencyInventory,
        state: currentState,
      }),
      computeNext: (snapshot) => {
        let newCurrency = snapshot.currency;

        if (correct) {
          // Grant reward
          const rewardResult = currencyEngine.apply(snapshot.currency, {
            rewards: [
              { currencyId: config.currencyId, value: rewards.total.currency },
            ],
          });
          newCurrency = rewardResult.unwrap();
        }

        // Update state with new streak
        const newState: MinigameState = {
          ...snapshot.state,
          trivia: {
            ...snapshot.state.trivia,
            currentStreak: streakAfter,
            bestStreak: Math.max(
              snapshot.state.trivia.bestStreak,
              streakAfter,
            ),
          },
        };

        return OkResult({ currency: newCurrency, state: newState, correct });
      },
      commit: async (_userId, expected, next) => {
        const n = next as {
          currency: CurrencyInventory;
          state: MinigameState;
          correct: boolean;
        };

        // Commit currency
        const currencyCommit = await UserStore.replaceIfMatch(
          userId,
          { currency: expected.currency } as any,
          { currency: n.currency } as any,
        );

        if (currencyCommit.isErr() || !currencyCommit.unwrap()) {
          return currencyCommit;
        }

        // Commit state
        await minigameRepo.updateUserState(userId, () => n.state);

        return currencyCommit;
      },
      project: (_updatedUser, next) => next,
      conflictError: "TRIVIA_CONFLICT",
    }).then(async (result) => {
      if (result.isErr()) {
        return ErrResult(
          new MinigameErrorClass(
            "UPDATE_FAILED",
            "Error al procesar respuesta.",
          ),
        );
      }

      const commit = result.unwrap() as {
        currency: CurrencyInventory;
        state: MinigameState;
        correct: boolean;
      };

      // Update state - increment daily count and clear pending
      await minigameRepo.updateUserState(userId, (s) => ({
        ...s,
        trivia: {
          ...s.trivia,
          dailyCount: s.trivia.dailyCount + 1,
          lastPlayAt: new Date(),
          pendingQuestionId: undefined,
          currentStreak: streakAfter,
          bestStreak: Math.max(s.trivia.bestStreak, streakAfter),
        },
      }));

      // Grant XP if correct
      if (correct && rewards.total.xp > 0) {
        await progressionService.addXP({
          guildId,
          userId,
          sourceOp: "quest_complete",
          amount: rewards.total.xp,
          correlationId,
          metadata: { questionId, difficulty: question.difficulty, correct, gameType: "trivia" },
        });
      }

      // Audit
      await economyAuditRepo.create({
        operationType: correct ? "currency_adjust" : "daily_claim",
        actorId: userId,
        targetId: userId,
        guildId,
        source: "minigames:trivia",
        reason: `Trivia ${correct ? "correct" : "incorrect"} answer (dificultad ${question.difficulty})`,
        currencyData: correct
          ? {
              currencyId: config.currencyId,
              delta: rewards.total.currency,
              beforeBalance:
                (commit.currency[config.currencyId] as number) ??
                0 - rewards.total.currency,
              afterBalance: (commit.currency[config.currencyId] as number) ?? 0,
            }
          : undefined,
        metadata: {
          correlationId,
          type: "trivia",
          questionId,
          difficulty: question.difficulty,
          correct,
          streakBefore,
          streakAfter,
          rewards,
        },
      });

      return OkResult({
        guildId,
        userId,
        questionId,
        question: question.question,
        correct,
        correctAnswer: question.options[question.correctIndex],
        selectedAnswer: question.options[answerIndex],
        explanation: question.explanation,
        difficulty: question.difficulty,
        rewards,
        streakBefore,
        streakAfter,
        newBalance: (commit.currency[config.currencyId] as number) ?? 0,
        correlationId,
        timestamp: new Date(),
      });
    });
  }

  async getTriviaSession(
    userId: UserId,
    guildId: GuildId,
  ): Promise<TriviaSession | undefined> {
    return activeTriviaSessions.get(getSessionKey(userId, guildId));
  }

  clearTriviaSession(userId: UserId, guildId: GuildId): void {
    activeTriviaSessions.delete(getSessionKey(userId, guildId));
  }

  // ============================================================================
  // Rob
  // ============================================================================

  async rob(input: RobInput): Promise<Result<RobResult, MinigameError>> {
    const { guildId, userId, targetId } = input;

    // Anti-abuse: Prevent self-targeting
    if (userId === targetId) {
      return ErrResult(
        new MinigameErrorClass("SELF_TARGET", "No puedes robarte a ti mismo."),
      );
    }

    // Get config
    const configResult = await minigameRepo.getRobConfig(guildId);
    if (configResult.isErr()) {
      return ErrResult(
        new MinigameErrorClass(
          "CONFIG_NOT_FOUND",
          "Configuración no encontrada.",
        ),
      );
    }
    const config = configResult.unwrap();

    if (!config.enabled) {
      return ErrResult(
        new MinigameErrorClass("CONFIG_NOT_FOUND", "Rob está desactivado."),
      );
    }

    // Check guild feature flag
    const guildConfigResult = await guildEconomyRepo.findByGuildId(guildId);
    if (guildConfigResult.isOk()) {
      const guildConfig = guildConfigResult.unwrap();
      if (guildConfig && !guildConfig.features.rob) {
        return ErrResult(
          new MinigameErrorClass(
            "FEATURE_DISABLED",
            "Rob está deshabilitado en este servidor.",
          ),
        );
      }
    }

    // Check robber account status
    const robberResult = await economyAccountRepo.ensure(userId);
    if (robberResult.isErr()) {
      return ErrResult(
        new MinigameErrorClass(
          "UPDATE_FAILED",
          "No se pudo acceder a tu cuenta.",
        ),
      );
    }
    const { account: robberAccount } = robberResult.unwrap();
    if (robberAccount.status === "blocked") {
      return ErrResult(
        new MinigameErrorClass(
          "TARGET_BLOCKED",
          "Tu cuenta tiene restricciones.",
        ),
      );
    }
    if (robberAccount.status === "banned") {
      return ErrResult(
        new MinigameErrorClass("TARGET_BANNED", "Tu cuenta está baneada."),
      );
    }

    // Check target account status
    const targetResult = await economyAccountRepo.ensure(targetId);
    if (targetResult.isErr()) {
      return ErrResult(
        new MinigameErrorClass("TARGET_NOT_FOUND", "Objetivo no encontrado."),
      );
    }
    const { account: targetAccount } = targetResult.unwrap();
    if (targetAccount.status === "blocked") {
      return ErrResult(
        new MinigameErrorClass(
          "TARGET_BLOCKED",
          "El objetivo tiene restricciones.",
        ),
      );
    }
    if (targetAccount.status === "banned") {
      return ErrResult(
        new MinigameErrorClass("TARGET_BANNED", "El objetivo está baneado."),
      );
    }

    // Check and reset dailies for robber
    const robberStateResult = await minigameRepo.checkAndResetDailies(userId);
    if (robberStateResult.isErr()) {
      return ErrResult(
        new MinigameErrorClass("UPDATE_FAILED", "Error al verificar límites."),
      );
    }
    const robberState = robberStateResult.unwrap();

    // Anti-abuse: Check daily limit
    if (robberState.rob.dailyCount >= config.dailyMaxAttempts) {
      return ErrResult(
        new MinigameErrorClass(
          "DAILY_LIMIT_REACHED",
          `Límite diario de ${config.dailyMaxAttempts} robos alcanzado.`,
        ),
      );
    }

    // Anti-abuse: Check cooldown
    if (
      !isCooldownExpired(robberState.rob.lastAttemptAt, config.cooldownSeconds)
    ) {
      const remaining = Math.ceil(
        (new Date(robberState.rob.lastAttemptAt!).getTime() +
          config.cooldownSeconds * 1000 -
          Date.now()) /
          1000,
      );
      return ErrResult(
        new MinigameErrorClass(
          "COOLDOWN_ACTIVE",
          `Espera ${remaining}s antes de robar de nuevo.`,
        ),
      );
    }

    // Anti-abuse: Check pair cooldown
    const pairKey = getPairKey(userId, targetId);
    const pairCooldownEnd = robberState.rob.pairCooldowns[pairKey];
    if (pairCooldownEnd && new Date(pairCooldownEnd) > new Date()) {
      const remaining = Math.ceil(
        (new Date(pairCooldownEnd).getTime() - Date.now()) / 1000,
      );
      return ErrResult(
        new MinigameErrorClass(
          "PAIR_COOLDOWN",
          `Debes esperar ${Math.ceil(remaining / 60)}m antes de robar a este usuario de nuevo.`,
        ),
      );
    }

    // Get user balances
    const robberUserResult = await UserStore.get(userId);
    const targetUserResult = await UserStore.get(targetId);

    if (robberUserResult.isErr() || targetUserResult.isErr()) {
      return ErrResult(
        new MinigameErrorClass(
          "UPDATE_FAILED",
          "Error al obtener datos de usuarios.",
        ),
      );
    }

    const robberUser = robberUserResult.unwrap();
    const targetUser = targetUserResult.unwrap();

    if (!robberUser || !targetUser) {
      return ErrResult(
        new MinigameErrorClass("TARGET_NOT_FOUND", "Usuario no encontrado."),
      );
    }

    const robberCurrency = (robberUser.currency ?? {}) as CurrencyInventory;
    const targetCurrency = (targetUser.currency ?? {}) as CurrencyInventory;

    const robberBalance = (robberCurrency[config.currencyId] as number) ?? 0;
    const targetBalance = (targetCurrency[config.currencyId] as number) ?? 0;

    // Anti-abuse: Check minimum balances
    if (robberBalance < config.minRobberBalance) {
      return ErrResult(
        new MinigameErrorClass(
          "INSUFFICIENT_FUNDS",
          `Necesitas al menos ${config.minRobberBalance} ${config.currencyId} para intentar robar.`,
        ),
      );
    }

    if (targetBalance < config.minTargetBalance) {
      return ErrResult(
        new MinigameErrorClass(
          "TARGET_TOO_POOR",
          `Tu objetivo es demasiado pobre (mínimo: ${config.minTargetBalance}).`,
        ),
      );
    }

    // Anti-abuse: Check target activity
    const targetActivity = targetUser.economyAccount?.lastActivityAt;
    if (targetActivity) {
      const hoursSinceActivity =
        (Date.now() - new Date(targetActivity).getTime()) / (1000 * 60 * 60);
      if (hoursSinceActivity > config.targetActivityHours) {
        return ErrResult(
          new MinigameErrorClass(
            "TARGET_INACTIVE",
            `El objetivo debe haber estado activo en las últimas ${config.targetActivityHours}h.`,
          ),
        );
      }
    }

    // Calculate steal amount
    const stealAmount = calculateStealAmount(
      targetBalance,
      config.maxStealPct,
      config.maxStealAmount,
    );

    // Roll for success
    const success = rollRobSuccess(config.failChance);

    const correlationId = `rob_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Atomic transaction for currency transfer
    return runUserTransition(userId, {
      attempts: 3,
      getSnapshot: () => ({
        robberCurrency,
        targetCurrency,
      }),
      computeNext: (snapshot) => {
        let newRobberCurrency = snapshot.robberCurrency;
        let newTargetCurrency = snapshot.targetCurrency;
        let fineAmount = 0;
        let taxPaid = 0;

        if (success) {
          // Success: Transfer from target to robber
          // Deduct from target
          const targetDeductResult = currencyEngine.apply(
            snapshot.targetCurrency,
            {
              costs: [{ currencyId: config.currencyId, value: stealAmount }],
              allowDebt: false,
            },
          );
          if (targetDeductResult.isErr()) {
            return ErrResult(new Error("TARGET_TOO_POOR"));
          }
          newTargetCurrency = targetDeductResult.unwrap();

          // Add to robber
          const robberAddResult = currencyEngine.apply(
            snapshot.robberCurrency,
            {
              rewards: [{ currencyId: config.currencyId, value: stealAmount }],
            },
          );
          newRobberCurrency = robberAddResult.unwrap();
        } else {
          // Failure: Pay fine
          fineAmount = Math.max(
            Math.floor(stealAmount * config.failFinePct),
            config.failFineMin,
          );

          // Check if robber can pay fine
          if (robberBalance < fineAmount) {
            fineAmount = Math.floor(robberBalance * 0.5); // Take half if can't pay full
          }

          if (fineAmount > 0) {
            const fineResult = currencyEngine.apply(snapshot.robberCurrency, {
              costs: [{ currencyId: config.currencyId, value: fineAmount }],
              allowDebt: false,
            });
            if (fineResult.isOk()) {
              newRobberCurrency = fineResult.unwrap();
              taxPaid = fineAmount;
            }
          }
        }

        return OkResult({
          robberCurrency: newRobberCurrency,
          targetCurrency: newTargetCurrency,
          success,
          amountStolen: success ? stealAmount : 0,
          fineAmount: success ? 0 : fineAmount,
          taxPaid,
        });
      },
      commit: async (_userId, expected, next) => {
        const n = next as {
          robberCurrency: CurrencyInventory;
          targetCurrency: CurrencyInventory;
          success: boolean;
          amountStolen: number;
          fineAmount: number;
          taxPaid: number;
        };

        // Commit robber currency
        const robberCommit = await UserStore.replaceIfMatch(
          userId,
          { currency: expected.robberCurrency } as any,
          { currency: n.robberCurrency } as any,
        );

        if (robberCommit.isErr() || !robberCommit.unwrap()) {
          return robberCommit;
        }

        // Commit target currency
        const targetCommit = await UserStore.replaceIfMatch(
          targetId,
          { currency: expected.targetCurrency } as any,
          { currency: n.targetCurrency } as any,
        );

        return targetCommit;
      },
      project: (_updatedUser, next) => next,
      conflictError: "ROB_CONFLICT",
    }).then(async (result) => {
      if (result.isErr()) {
        const err = result.error;
        if (err.message === "TARGET_TOO_POOR") {
          return ErrResult(
            new MinigameErrorClass(
              "TARGET_TOO_POOR",
              "El objetivo ya no tiene suficiente dinero.",
            ),
          );
        }
        return ErrResult(
          new MinigameErrorClass("UPDATE_FAILED", "Error al procesar el robo."),
        );
      }

      const commit = result.unwrap() as {
        robberCurrency: CurrencyInventory;
        targetCurrency: CurrencyInventory;
        success: boolean;
        amountStolen: number;
        fineAmount: number;
        taxPaid: number;
      };

      // Update robber state
      const now = new Date();
      const pairCooldownEnd = new Date(
        now.getTime() + config.pairCooldownSeconds * 1000,
      );

      await minigameRepo.updateUserState(userId, (s) => ({
        ...s,
        rob: {
          dailyCount: s.rob.dailyCount + 1,
          lastAttemptAt: now,
          dailyResetAt: s.rob.dailyResetAt,
          pairCooldowns: {
            ...s.rob.pairCooldowns,
            [pairKey]: pairCooldownEnd,
          },
        },
      }));

      // Deposit fine to guild if any
      if (commit.taxPaid > 0 && config.taxSector) {
        await guildEconomyService.depositToSector({
          guildId,
          sector: config.taxSector,
          amount: commit.taxPaid,
          source: "rob_fine",
          reason: `Fine from failed rob by ${userId}`,
        });
      }

      // Audit
      await economyAuditRepo.create({
        operationType: "currency_transfer",
        actorId: userId,
        targetId,
        guildId,
        source: "minigames:rob",
        reason: `Rob ${commit.success ? "success" : "failed"}`,
        currencyData: {
          currencyId: config.currencyId,
          delta: commit.success ? commit.amountStolen : -commit.fineAmount,
          beforeBalance: commit.success
            ? ((commit.robberCurrency[config.currencyId] as number) ??
              0 - commit.amountStolen)
            : ((commit.robberCurrency[config.currencyId] as number) ??
              0 + commit.fineAmount),
          afterBalance:
            (commit.robberCurrency[config.currencyId] as number) ?? 0,
        },
        metadata: {
          correlationId,
          type: "rob",
          success: commit.success,
          amountStolen: commit.amountStolen,
          fineAmount: commit.fineAmount,
          taxPaid: commit.taxPaid,
        },
      });

      return OkResult({
        guildId,
        userId,
        targetId,
        success: commit.success,
        amountStolen: commit.amountStolen,
        targetBalanceBefore: targetBalance,
        targetBalanceAfter:
          (commit.targetCurrency[config.currencyId] as number) ?? 0,
        robberBalanceBefore: robberBalance,
        robberBalanceAfter:
          (commit.robberCurrency[config.currencyId] as number) ?? 0,
        fineAmount: commit.fineAmount || undefined,
        taxPaid: commit.taxPaid || undefined,
        correlationId,
        timestamp: new Date(),
      });
    });
  }

  // ============================================================================
  // Admin
  // ============================================================================

  async resetDailyLimits(userId: UserId): Promise<Result<void, Error>> {
    const now = new Date();
    const result = await minigameRepo.updateUserState(userId, (s) => ({
      ...s,
      coinflip: { ...s.coinflip, dailyCount: 0, dailyResetAt: now },
      trivia: { ...s.trivia, dailyCount: 0, dailyResetAt: now },
      rob: { ...s.rob, dailyCount: 0, dailyResetAt: now },
    }));

    if (result.isErr()) return ErrResult(result.error);
    return OkResult(undefined);
  }
}

export const minigameService: MinigameService = new MinigameServiceImpl();
