/**
 * Progression Repository.
 *
 * Purpose: Persist per-guild progression state on user documents.
 */

import { UserStore } from "@/db/repositories/users";
import { atomicTransition } from "@/db/atomic-transition";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { GuildId, UserId } from "@/db/types";
import type { User } from "@/db/schemas/user";
import {
  ProgressionStateSchema,
  type ProgressionStateData,
} from "@/db/schemas/progression";
import type { ProgressionState } from "./types";

type ProgressionSnapshot = Record<string, ProgressionStateData>;
type ProgressionNext = {
  progression: ProgressionSnapshot;
  before: ProgressionStateData;
  after: ProgressionStateData;
};

export interface ProgressionUpdateResult {
  readonly before: ProgressionStateData;
  readonly after: ProgressionStateData;
}

const parseState = (data: unknown): ProgressionStateData =>
  ProgressionStateSchema.parse(data ?? {});

const toDomain = (
  guildId: GuildId,
  userId: UserId,
  data: ProgressionStateData,
): ProgressionState => ({
  guildId,
  userId,
  totalXP: data.totalXP,
  level: data.level,
  updatedAt: data.updatedAt,
  cooldowns: data.cooldowns,
});

export interface ProgressionRepo {
  getState(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<ProgressionState, Error>>;

  updateState(
    guildId: GuildId,
    userId: UserId,
    updater: (
      current: ProgressionStateData,
    ) => Result<ProgressionStateData, Error>,
  ): Promise<Result<ProgressionUpdateResult, Error>>;
}

class ProgressionRepoImpl implements ProgressionRepo {
  async getState(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<ProgressionState, Error>> {
    const userResult = await UserStore.ensure(userId);
    if (userResult.isErr()) return ErrResult(userResult.error);

    const user = userResult.unwrap();
    const snapshot = (user.progression ?? {}) as ProgressionSnapshot;
    const state = parseState(snapshot[guildId]);
    return OkResult(toDomain(guildId, userId, state));
  }

  async updateState(
    guildId: GuildId,
    userId: UserId,
    updater: (
      current: ProgressionStateData,
    ) => Result<ProgressionStateData, Error>,
  ): Promise<Result<ProgressionUpdateResult, Error>> {
    return atomicTransition<
      User,
      ProgressionSnapshot,
      ProgressionNext,
      ProgressionUpdateResult
    >({
      attempts: 3,
      getInitial: () => UserStore.ensure(userId),
      getFresh: (prev) =>
        UserStore.get(userId).then((res) =>
          res.isErr() ? ErrResult(res.error) : OkResult(res.unwrap() ?? prev),
        ),
      getSnapshot: (user) => (user.progression ?? {}) as ProgressionSnapshot,
      computeNext: (snapshot) => {
        const current = parseState(snapshot[guildId]);
        const nextResult = updater(current);
        if (nextResult.isErr()) return ErrResult(nextResult.error);

        const nextState = nextResult.unwrap();
        const nextSnapshot: ProgressionSnapshot = {
          ...snapshot,
          [guildId]: nextState,
        };

        const next: ProgressionNext = {
          progression: nextSnapshot,
          before: current,
          after: nextState,
        };

        return OkResult(next);
      },
      commit: (expected, next) =>
        UserStore.replaceIfMatch(
          userId,
          { progression: expected } as any,
          { progression: next.progression } as any,
        ),
      project: (_updatedUser, next) => ({
        before: next.before,
        after: next.after,
      }),
      onExhausted: () => ErrResult(new Error("PROGRESSION_UPDATE_CONFLICT")),
    });
  }
}

export const progressionRepo: ProgressionRepo = new ProgressionRepoImpl();
