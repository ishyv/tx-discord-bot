/**
 * Minigames Repository.
 *
 * Purpose: Manage guild-specific minigame configurations and user state.
 */

import { GuildStore } from "@/db/repositories/guilds";
import { UserStore } from "@/db/repositories/users";
import type { GuildId, UserId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type {
  CoinflipConfig,
  TriviaConfig,
  RobConfig,
  GuildMinigameConfig,
  MinigameState,
} from "./types";
import {
  DEFAULT_COINFLIP_CONFIG,
  DEFAULT_TRIVIA_CONFIG,
  DEFAULT_ROB_CONFIG,
} from "./config";

export interface MinigameRepo {
  /** Get full minigame config for a guild. */
  getConfig(guildId: GuildId): Promise<Result<GuildMinigameConfig, Error>>;

  /** Get/set individual game configs. */
  getCoinflipConfig(guildId: GuildId): Promise<Result<CoinflipConfig, Error>>;
  getTriviaConfig(guildId: GuildId): Promise<Result<TriviaConfig, Error>>;
  getRobConfig(guildId: GuildId): Promise<Result<RobConfig, Error>>;

  updateCoinflipConfig(
    guildId: GuildId,
    config: Partial<CoinflipConfig>,
  ): Promise<Result<CoinflipConfig, Error>>;
  updateTriviaConfig(
    guildId: GuildId,
    config: Partial<TriviaConfig>,
  ): Promise<Result<TriviaConfig, Error>>;
  updateRobConfig(
    guildId: GuildId,
    config: Partial<RobConfig>,
  ): Promise<Result<RobConfig, Error>>;

  /** Get/set user minigame state. */
  getUserState(userId: UserId): Promise<Result<MinigameState, Error>>;
  updateUserState(
    userId: UserId,
    updater: (state: MinigameState) => MinigameState,
  ): Promise<Result<MinigameState, Error>>;

  /** Reset daily counters if needed. */
  checkAndResetDailies(userId: UserId): Promise<Result<MinigameState, Error>>;
}

/** Build default state for new users. */
const defaultMinigameState = (): MinigameState => {
  const now = new Date();
  return {
    coinflip: {
      dailyCount: 0,
      dailyResetAt: now,
    },
    trivia: {
      dailyCount: 0,
      dailyResetAt: now,
      currentStreak: 0,
      bestStreak: 0,
    },
    rob: {
      dailyCount: 0,
      dailyResetAt: now,
      pairCooldowns: {},
    },
  };
};

/** Merge stored config with defaults. */
const mergeWithDefaults = (
  stored: Partial<GuildMinigameConfig>,
): GuildMinigameConfig => ({
  coinflip: { ...DEFAULT_COINFLIP_CONFIG, ...stored.coinflip },
  trivia: { ...DEFAULT_TRIVIA_CONFIG, ...stored.trivia },
  rob: { ...DEFAULT_ROB_CONFIG, ...stored.rob },
  updatedAt: stored.updatedAt ?? new Date(),
});

class MinigameRepoImpl implements MinigameRepo {
  async getConfig(
    guildId: GuildId,
  ): Promise<Result<GuildMinigameConfig, Error>> {
    const guildResult = await GuildStore.ensure(guildId);
    if (guildResult.isErr()) return ErrResult(guildResult.error);

    const guild = guildResult.unwrap();
    const stored = (guild.minigames ?? {}) as Partial<GuildMinigameConfig>;

    return OkResult(mergeWithDefaults(stored));
  }

  async getCoinflipConfig(
    guildId: GuildId,
  ): Promise<Result<CoinflipConfig, Error>> {
    const configResult = await this.getConfig(guildId);
    if (configResult.isErr()) return ErrResult(configResult.error);
    return OkResult(configResult.unwrap().coinflip);
  }

  async getTriviaConfig(
    guildId: GuildId,
  ): Promise<Result<TriviaConfig, Error>> {
    const configResult = await this.getConfig(guildId);
    if (configResult.isErr()) return ErrResult(configResult.error);
    return OkResult(configResult.unwrap().trivia);
  }

  async getRobConfig(guildId: GuildId): Promise<Result<RobConfig, Error>> {
    const configResult = await this.getConfig(guildId);
    if (configResult.isErr()) return ErrResult(configResult.error);
    return OkResult(configResult.unwrap().rob);
  }

  async updateCoinflipConfig(
    guildId: GuildId,
    config: Partial<CoinflipConfig>,
  ): Promise<Result<CoinflipConfig, Error>> {
    try {
      const col = await GuildStore.collection();
      const now = new Date();

      const result = await col.findOneAndUpdate(
        { _id: guildId } as any,
        {
          $set: {
            "minigames.coinflip": config,
            "minigames.updatedAt": now.toISOString(),
          },
        } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(new Error("Guild not found"));
      }

      const updated = (result as any).minigames?.coinflip as
        | CoinflipConfig
        | undefined;
      return OkResult({ ...DEFAULT_COINFLIP_CONFIG, ...updated });
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async updateTriviaConfig(
    guildId: GuildId,
    config: Partial<TriviaConfig>,
  ): Promise<Result<TriviaConfig, Error>> {
    try {
      const col = await GuildStore.collection();
      const now = new Date();

      const result = await col.findOneAndUpdate(
        { _id: guildId } as any,
        {
          $set: {
            "minigames.trivia": config,
            "minigames.updatedAt": now.toISOString(),
          },
        } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(new Error("Guild not found"));
      }

      const updated = (result as any).minigames?.trivia as
        | TriviaConfig
        | undefined;
      return OkResult({ ...DEFAULT_TRIVIA_CONFIG, ...updated });
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async updateRobConfig(
    guildId: GuildId,
    config: Partial<RobConfig>,
  ): Promise<Result<RobConfig, Error>> {
    try {
      const col = await GuildStore.collection();
      const now = new Date();

      const result = await col.findOneAndUpdate(
        { _id: guildId } as any,
        {
          $set: {
            "minigames.rob": config,
            "minigames.updatedAt": now.toISOString(),
          },
        } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(new Error("Guild not found"));
      }

      const updated = (result as any).minigames?.rob as RobConfig | undefined;
      return OkResult({ ...DEFAULT_ROB_CONFIG, ...updated });
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async getUserState(userId: UserId): Promise<Result<MinigameState, Error>> {
    const userResult = await UserStore.get(userId);
    if (userResult.isErr()) return ErrResult(userResult.error);

    const user = userResult.unwrap();
    const stored = user?.minigames as Partial<MinigameState> | undefined;

    if (!stored) {
      return OkResult(defaultMinigameState());
    }

    // Merge with defaults to ensure all fields exist
    const defaults = defaultMinigameState();
    return OkResult({
      coinflip: { ...defaults.coinflip, ...stored.coinflip },
      trivia: { ...defaults.trivia, ...stored.trivia },
      rob: {
        ...defaults.rob,
        ...stored.rob,
        pairCooldowns: stored.rob?.pairCooldowns ?? {},
      },
    });
  }

  async updateUserState(
    userId: UserId,
    updater: (state: MinigameState) => MinigameState,
  ): Promise<Result<MinigameState, Error>> {
    const stateResult = await this.getUserState(userId);
    if (stateResult.isErr()) return ErrResult(stateResult.error);

    const newState = updater(stateResult.unwrap());

    try {
      const col = await UserStore.collection();
      await col.updateOne(
        { _id: userId } as any,
        {
          $set: { minigames: newState },
        } as any,
      );

      return OkResult(newState);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async checkAndResetDailies(
    userId: UserId,
  ): Promise<Result<MinigameState, Error>> {
    const stateResult = await this.getUserState(userId);
    if (stateResult.isErr()) return ErrResult(stateResult.error);

    const state = stateResult.unwrap();
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let needsUpdate = false;
    let newState = state;

    // Check coinflip reset
    if (new Date(state.coinflip.dailyResetAt) < dayStart) {
      newState = {
        ...newState,
        coinflip: { ...newState.coinflip, dailyCount: 0, dailyResetAt: now },
      };
      needsUpdate = true;
    }

    // Check trivia reset
    if (new Date(state.trivia.dailyResetAt) < dayStart) {
      newState = {
        ...newState,
        trivia: { ...newState.trivia, dailyCount: 0, dailyResetAt: now },
      };
      needsUpdate = true;
    }

    // Check rob reset
    if (new Date(state.rob.dailyResetAt) < dayStart) {
      newState = {
        ...newState,
        rob: { ...newState.rob, dailyCount: 0, dailyResetAt: now },
      };
      needsUpdate = true;
    }

    if (needsUpdate) {
      return this.updateUserState(userId, () => newState);
    }

    return OkResult(state);
  }
}

export const minigameRepo: MinigameRepo = new MinigameRepoImpl();
